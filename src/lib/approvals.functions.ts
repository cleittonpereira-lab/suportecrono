/**
 * Fluxo de aprovação soberano no Google Drive:
 *   Laboratorista → Verificador → Responsável Técnico (Admin)
 *
 * Tudo (farol/workflowStatus, histórico de aprovações e comentários) vive
 * dentro do MESMO arquivo por-ensaio já usado pelo labStore e pelos
 * rascunhos (lab-ensaios/{amostraId}__{ensaioId}.json). Isso elimina por
 * construção o bug histórico de "duas fontes de status divergentes" — só
 * existe um arquivo, então não tem como duas telas mostrarem coisas
 * diferentes por lerem de lugares diferentes.
 *
 * Estados:
 *   pendente_verificacao   → aguardando Verificador
 *   rejeitado_verificacao  → Verificador rejeitou (comentário obrigatório)
 *   pendente_aprovacao     → Verificador aprovou; aguardando Responsável Técnico
 *   aprovado               → Responsável Técnico aprovou (final)
 *   rejeitado              → Responsável Técnico rejeitou (final)
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth, exigirLogin } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { atualizarDriveJson, ensureFolderPath, readDriveJson } from "@/lib/driveStorage";
import {
  FOLDER_AMOSTRAS,
  FOLDER_ENSAIOS,
  FOLDER_OS,
  amostraFileName,
  ensaioFileName,
  osFileName,
  type EnsaioFile,
  type ReportApprovalRow,
  type ReportApprovalCommentRow,
} from "@/lib/lab-entities.functions";
import { sincronizarPendenciaDoEnsaio, type PendenciaDigitacao } from "@/lib/lab-pendencias.functions";
import { etapaDasAprovacoes } from "@/lib/etapa-laudo";
import { proximaRevisao, revisaoAprovada, STATUS_EM_REVISAO } from "@/lib/revisoes-regra";
import { exigirPermissaoNoFluxo, type PapelDoUsuario } from "@/lib/papeis";

/**
 * Propaga o avanço do fluxo para a pendência vinculada ao ensaio.
 *
 * Roda DEPOIS de a aprovação estar gravada no arquivo do ensaio, que é a fonte
 * de verdade. Por isso uma falha aqui não desfaz nem esconde a aprovação: é
 * registrada no log e devolvida ao cliente no campo `pendencia`, em vez de
 * sumir em silêncio.
 */
async function propagarParaPendencia(
  ids: { osId: string; amostraId: string; ensaioId: string },
  ensaio: EnsaioFile,
  status: PendenciaDigitacao["status"],
  ator: { userId: string; nome: string },
): Promise<string> {
  try {
    const [osFile, amFile] = await Promise.all([
      ensureFolderPath(FOLDER_OS).then((f) => readDriveJson<{ numero?: string | null }>(osFileName(ids.osId), f)),
      ensureFolderPath(FOLDER_AMOSTRAS).then((f) =>
        readDriveJson<{ reportNumber?: string | null; code?: string | null }>(amostraFileName(ids.osId, ids.amostraId), f),
      ),
    ]);
    const resultado = await sincronizarPendenciaDoEnsaio({
      ensaioId: ids.ensaioId,
      osNumero: osFile?.numero ?? null,
      amostraCodigos: [amFile?.reportNumber, amFile?.code],
      tipoEnsaio: ensaio.tipo,
      status,
      ator,
    });
    if (resultado === "nao_encontrada" || resultado === "ambigua") {
      console.warn(`[approvals] Pendência do ensaio ${ids.ensaioId} não sincronizada: ${resultado}.`);
    }
    return resultado;
  } catch (err) {
    console.error(`[approvals] Aprovação gravada, mas a pendência do ensaio ${ids.ensaioId} não foi sincronizada:`, err);
    return "falhou";
  }
}

/** Roda `fn` sobre `items` com no máximo `limit` chamadas em voo — ver o mesmo helper em lab-pendencias.functions.ts. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function normStr(str?: string | null): string {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function parseScope(scopeId: string): { osId: string; amostraId: string; ensaioId: string } | null {
  const parts = scopeId.split("/");
  const iOs = parts.indexOf("os");
  const iAm = parts.indexOf("amostra");
  const iEn = parts.indexOf("ensaio");
  if (iOs === -1 || iAm === -1 || iEn === -1) return null;
  const osId = parts[iOs + 1];
  const amostraId = parts[iAm + 1];
  const ensaioId = parts[iEn + 1];
  if (!osId || !amostraId || !ensaioId) return null;
  return { osId, amostraId, ensaioId };
}

async function readEnsaio(scopeId: string): Promise<{ ids: { osId: string; amostraId: string; ensaioId: string }; file: EnsaioFile | null; folderId: string } | null> {
  const ids = parseScope(scopeId);
  if (!ids) return null;
  const folderId = await ensureFolderPath(FOLDER_ENSAIOS);
  const file = await readDriveJson<EnsaioFile>(ensaioFileName(ids.amostraId, ids.ensaioId), folderId);
  return { ids, file, folderId };
}

type IdsEnsaio = { osId: string; amostraId: string; ensaioId: string };

/**
 * Ler-alterar-gravar do arquivo do ensaio numa operação só, com trava — no
 * banco, atômica entre servidores. Antes eram passos soltos (ler, montar,
 * gravar): um autosave do rascunho gravado no meio era apagado pela aprovação,
 * ou o contrário, porque cada um regravava o arquivo inteiro que tinha lido.
 * `alterar` pode rodar de novo se outra gravação entrar no meio.
 */
async function alterarEnsaio(
  scopeId: string,
  alterar: (ids: IdsEnsaio, existing: EnsaioFile | null) => EnsaioFile,
): Promise<{ ids: IdsEnsaio; file: EnsaioFile }> {
  const ids = parseScope(scopeId);
  if (!ids) throw new Error(`scopeId inválido: ${scopeId}`);
  const folderId = await ensureFolderPath(FOLDER_ENSAIOS);
  const file = await atualizarDriveJson<EnsaioFile>(ensaioFileName(ids.amostraId, ids.ensaioId), folderId, (existing) =>
    alterar(ids, existing),
  );
  return { ids, file: file as EnsaioFile };
}

export type ApprovalStatus =
  | "pendente"
  | "digitacao"
  | "pendente_verificacao"
  | "verificado"
  | "rejeitado_verificacao"
  | "pendente_aprovacao"
  | "aprovado"
  | "rejeitado"
  /** Revisão reaberta para correção depois de aprovada — ainda sem PDF. */
  | "em_revisao";

export type ApprovalRow = ReportApprovalRow & { status: ApprovalStatus; created_at?: string };
export type ApprovalCommentRow = ReportApprovalCommentRow;

function displayName(claims: { email?: string; user_metadata?: { full_name?: string; name?: string } } | undefined) {
  return (
    (claims?.user_metadata?.full_name as string | undefined) ||
    (claims?.user_metadata?.name as string | undefined) ||
    (claims?.email ? claims.email.split("@")[0] : "Operador")
  );
}

function rid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

const ROTULO_STATUS: Partial<Record<ApprovalStatus, string>> = {
  pendente_verificacao: "aguardando verificação",
  pendente_aprovacao: "aguardando aprovação",
  verificado: "aguardando aprovação",
  aprovado: "aprovada",
  rejeitado_verificacao: "devolvida para correção",
  em_revisao: "em correção (ainda não enviada)",
};

/**
 * Verificar/aprovar só na etapa certa. Uma tela desatualizada (outro usuário
 * já decidiu) mandava "verificar" numa revisão já aprovada e a devolvia para
 * "aguardando aprovação".
 */
function exigirEtapa(linha: ApprovalRow, aceitos: ApprovalStatus[], acao: string) {
  if (aceitos.includes(linha.status)) return;
  const agora = ROTULO_STATUS[linha.status] ?? linha.status;
  throw new Error(
    `A Rev-${String(linha.rev).padStart(2, "0")} não pode ser ${acao} agora: ela está ${agora}. Recarregue a tela.`,
  );
}

/** Etapa do fluxo → valor gravado em `workflowStatus`/`status` do ensaio. */
function workflowDaEtapa(approvals: ApprovalRow[]): "digitacao" | "aguardando_verificacao" | "aguardando_aprovacao" | "aprovado" {
  const etapa = etapaDasAprovacoes(approvals);
  return etapa === "aprovado" || etapa === "aguardando_aprovacao" || etapa === "aguardando_verificacao" ? etapa : "digitacao";
}

const PENDENCIA_DO_WORKFLOW: Record<ReturnType<typeof workflowDaEtapa>, PendenciaDigitacao["status"]> = {
  digitacao: "em_digitacao",
  aguardando_verificacao: "digitado",
  aguardando_aprovacao: "verificado",
  aprovado: "aprovado",
};

/* ─────────────────────────────── SOLICITAÇÃO ─────────────────────────────── */

const RequestInput = z.object({
  scopeId: z.string().min(1),
  rev: z.number().int().nonnegative(),
  filename: z.string().optional(),
  skipVerification: z.boolean().optional(),
  index: z
    .object({
      os_numero: z.string().nullable().optional(),
      os_cliente: z.string().nullable().optional(),
      amostra_code: z.string().nullable().optional(),
      ensaio_tipo: z.string().nullable().optional(),
      ensaio_nome: z.string().nullable().optional(),
    })
    .optional(),
});

export const requestApproval = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .validator((v: unknown) => RequestInput.parse(v))
  .handler(async ({ data, context }) => {
    const { claims } = context as { claims: { email?: string; user_metadata?: { full_name?: string; name?: string } } };
    const { userId } = context as { userId: string };
    // Enviar direto para aprovação conta como verificar: a própria pessoa fica
    // registrada como verificadora.
    if (data.skipVerification) exigirPermissaoNoFluxo(context as PapelDoUsuario, "verificar");
    const name = displayName(claims);
    const nowIso = new Date().toISOString();

    const targetStatus: ApprovalStatus = data.skipVerification ? "pendente_aprovacao" : "pendente_verificacao";
    const targetWorkflow = data.skipVerification ? "aguardando_aprovacao" : "aguardando_verificacao";

    const row: ApprovalRow = {
      id: rid("app"),
      scope_id: data.scopeId,
      rev: data.rev,
      status: targetStatus,
      requested_by: userId,
      requested_by_name: name,
      requested_at: nowIso,
      verified_by: data.skipVerification ? userId : null,
      verified_by_name: data.skipVerification ? name : null,
      verified_at: data.skipVerification ? nowIso : null,
      verification_comment: null,
      decided_by: null,
      decided_by_name: null,
      decided_at: null,
      comment: null,
      filename: data.filename ?? null,
      updated_at: nowIso,
    };

    const commentRow: ApprovalCommentRow = {
      id: rid("cmt"),
      scope_id: data.scopeId,
      rev: data.rev,
      action: data.skipVerification ? "send_approval" : "send_verification",
      comment: null,
      author_id: userId,
      author_name: name,
      author_role: data.skipVerification ? "verificador" : "digitador",
      created_at: nowIso,
    };

    const { ids, file } = await alterarEnsaio(data.scopeId, (ids, existing) => {
      // Sem o arquivo do ensaio não há o que enviar para verificação. Antes, um
      // arquivo ilegível virava `existing = null` e esta função gravava um ensaio
      // novo com `payload: null` — apagando o laudo digitado no exato momento em
      // que ele era enviado. Mesmo critério de verifyApproval/decideApproval.
      if (!existing) {
        throw new Error("Ensaio não encontrado. Salve o rascunho antes de enviar para verificação.");
      }
      const approvals = (existing.reportApprovals as ApprovalRow[] | undefined) ?? [];
      const comments = (existing.approvalComments as ApprovalCommentRow[] | undefined) ?? [];
      // Uma revisão aprovada nunca é substituída por uma solicitação nova com o
      // mesmo número — era assim que um laudo aprovado "voltava" com título de
      // aguardando e status de aprovado ao mesmo tempo (numeração do navegador).
      if (revisaoAprovada(approvals, data.rev)) {
        throw new Error(
          `A Rev-${String(data.rev).padStart(2, "0")} já foi aprovada e não pode ser substituída. Recarregue a tela e gere uma nova revisão.`,
        );
      }
      return {
        ...existing,
        id: ids.ensaioId,
        amostraId: ids.amostraId,
        tipo: existing.tipo || data.index?.ensaio_tipo || "cisalhamento-direto",
        // Ver comentário equivalente em verifyApproval/decideApproval — sem
        // gravar `status` junto aqui, um ensaio já aprovado que ganha uma
        // nova revisão ficava com o Kanban/labStore mostrando o status
        // antigo ("aprovado") até que o patch otimista do cliente expirasse.
        status: targetWorkflow,
        label: existing.label ?? null,
        nome: existing.nome ?? data.index?.ensaio_nome ?? null,
        sigla: existing.sigla ?? null,
        operator: existing.operator ?? null,
        photos: existing.photos ?? [],
        payload: existing.payload ?? null,
        createdAt: existing.createdAt || nowIso,
        updatedAt: nowIso,
        rev: (existing.rev ?? 0) + 1,
        workflowStatus: targetWorkflow,
        approvals: existing.approvals ?? [],
        draftHistory: existing.draftHistory ?? [],
        reportApprovals: [row, ...approvals.filter((a) => a.rev !== data.rev)],
        approvalComments: [commentRow, ...comments].slice(0, 200),
      };
    });

    const pendencia = await propagarParaPendencia(ids, file, data.skipVerification ? "verificado" : "digitado", {
      userId,
      nome: name,
    });
    // Avisos no celular (Fase 5): quem verifica — ou quem aprova, se já foi direto.
    const { avisarFluxo } = await import("./avisos.server");
    await avisarFluxo({
      evento: data.skipVerification ? "aguardando_aprovacao" : "aguardando_verificacao",
      scopeId: data.scopeId,
      laudo: {
        ensaio: data.index?.ensaio_nome,
        os: data.index?.os_numero,
        amostra: data.index?.amostra_code,
        arquivo: data.filename,
        registro: file,
      },
      ator: { userId, nome: name },
    });
    return { ...row, pendencia };
  });

/* ─────────────────────────────── VERIFICAÇÃO ─────────────────────────────── */

const VerifyInput = z.object({
  scopeId: z.string().min(1),
  rev: z.number().int().nonnegative(),
  decision: z.enum(["verificado", "rejeitado_verificacao"]),
  comment: z.string().max(2000).optional(),
});

export const verifyApproval = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .validator((v: unknown) => VerifyInput.parse(v))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as {
      userId: string;
      claims: { email?: string; user_metadata?: { full_name?: string; name?: string } };
    };
    // O papel é conferido aqui, no servidor — a tela só esconde o botão.
    exigirPermissaoNoFluxo(context as PapelDoUsuario, "verificar");
    const name = displayName(claims);
    const nowIso = new Date().toISOString();
    const nextStatus: ApprovalStatus = data.decision === "verificado" ? "pendente_aprovacao" : "rejeitado_verificacao";
    // Devolvido pelo verificador volta para quem digita — a pendência já ia para
    // "em digitação"; o ensaio ficava em "aguardando verificação" e cada Kanban
    // mostrava o laudo numa coluna.
    const nextWorkflow = data.decision === "verificado" ? "aguardando_aprovacao" : "digitacao";

    const commentRow: ApprovalCommentRow = {
      id: rid("cmt"),
      scope_id: data.scopeId,
      rev: data.rev,
      action: data.decision === "verificado" ? "verified" : "rejected_verification",
      comment: data.comment ?? null,
      author_id: userId,
      author_name: name,
      author_role: "verificador",
      created_at: nowIso,
    };

    let updatedRow!: ApprovalRow;
    const { ids, file } = await alterarEnsaio(data.scopeId, (_ids, existing) => {
      if (!existing) throw new Error("Registro de aprovação não encontrado.");
      const approvals = (existing.reportApprovals as ApprovalRow[] | undefined) ?? [];
      const idx = approvals.findIndex((a) => a.rev === data.rev);
      if (idx === -1) throw new Error("Solicitação de aprovação para esta revisão não encontrada.");
      exigirEtapa(approvals[idx], ["pendente_verificacao", "rejeitado"], "verificada");

      updatedRow = {
        ...approvals[idx],
        status: nextStatus,
        verified_by: userId,
        verified_by_name: name,
        verified_at: nowIso,
        verification_comment: data.comment ?? null,
        updated_at: nowIso,
      };
      const nextApprovals = [...approvals];
      nextApprovals[idx] = updatedRow;
      const comments = (existing.approvalComments as ApprovalCommentRow[] | undefined) ?? [];

      return {
        ...existing,
        updatedAt: nowIso,
        rev: (existing.rev ?? 0) + 1,
        workflowStatus: nextWorkflow,
        // `status` (o EnsaioStatus visto pelo labStore/Kanban/Central de
        // Relatórios) é um campo SEPARADO de `workflowStatus` (o que o editor
        // lê) — sem gravar os dois juntos aqui, verificar/aprovar nunca
        // avançava o status que essas outras telas mostram, deixando ensaios
        // já aprovados aparecendo pra sempre como "Em Digitação" nelas.
        status: nextWorkflow,
        reportApprovals: nextApprovals,
        approvalComments: [commentRow, ...comments].slice(0, 200),
      };
    });

    // Rejeitado na verificação volta para a digitação.
    const pendencia = await propagarParaPendencia(
      ids,
      file,
      data.decision === "verificado" ? "verificado" : "em_digitacao",
      { userId, nome: name },
    );
    // Avisos no celular (Fase 5): verificado → quem aprova; devolvido → quem enviou.
    const { avisarFluxo } = await import("./avisos.server");
    await avisarFluxo({
      evento: data.decision === "verificado" ? "aguardando_aprovacao" : "reprovado",
      scopeId: data.scopeId,
      laudo: { arquivo: updatedRow.filename, registro: file },
      ator: { userId, nome: name },
      solicitante: updatedRow.requested_by,
      comentario: data.comment,
    });
    return { ...updatedRow, pendencia };
  });

/* ─────────────────────────────── APROVAÇÃO RT ─────────────────────────────── */

const DecideInput = z.object({
  scopeId: z.string().min(1),
  rev: z.number().int().nonnegative(),
  decision: z.enum(["aprovado", "rejeitado"]),
  comment: z.string().max(2000).optional(),
});

export const decideApproval = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .validator((v: unknown) => DecideInput.parse(v))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as {
      userId: string;
      claims: { email?: string; user_metadata?: { full_name?: string; name?: string } };
    };
    // O papel é conferido aqui, no servidor — a tela só esconde o botão.
    exigirPermissaoNoFluxo(context as PapelDoUsuario, "aprovar");
    const name = displayName(claims);
    const nowIso = new Date().toISOString();

    const persistedStatus: ApprovalStatus = data.decision === "aprovado" ? "aprovado" : "pendente_verificacao";
    const nextWorkflow = data.decision === "aprovado" ? "aprovado" : "aguardando_verificacao";

    const patch: Partial<ApprovalRow> = {
      status: persistedStatus,
      decided_by: data.decision === "aprovado" ? userId : null,
      decided_by_name: data.decision === "aprovado" ? name : null,
      decided_at: data.decision === "aprovado" ? nowIso : null,
      comment: data.comment ?? null,
      updated_at: nowIso,
    };
    if (data.decision === "rejeitado") {
      patch.verified_by = null;
      patch.verified_by_name = null;
      patch.verified_at = null;
      patch.verification_comment = null;
    }

    const commentRow: ApprovalCommentRow = {
      id: rid("cmt"),
      scope_id: data.scopeId,
      rev: data.rev,
      action: data.decision === "aprovado" ? "approved" : "rejected",
      comment: data.comment ?? null,
      author_id: userId,
      author_name: name,
      author_role: "admin",
      created_at: nowIso,
    };

    let updatedRow!: ApprovalRow;
    const { ids, file } = await alterarEnsaio(data.scopeId, (_ids, existing) => {
      if (!existing) throw new Error("Registro de aprovação não encontrado.");
      const approvals = (existing.reportApprovals as ApprovalRow[] | undefined) ?? [];
      const idx = approvals.findIndex((a) => a.rev === data.rev);
      if (idx === -1) throw new Error("Solicitação de aprovação para esta revisão não encontrada.");
      exigirEtapa(approvals[idx], ["pendente_aprovacao", "verificado"], "aprovada");

      updatedRow = { ...approvals[idx], ...patch };
      const nextApprovals = [...approvals];
      nextApprovals[idx] = updatedRow;
      const comments = (existing.approvalComments as ApprovalCommentRow[] | undefined) ?? [];

      return {
        ...existing,
        updatedAt: nowIso,
        rev: (existing.rev ?? 0) + 1,
        workflowStatus: nextWorkflow,
        // Ver comentário equivalente em verifyApproval.
        status: nextWorkflow,
        reportApprovals: nextApprovals,
        approvalComments: [commentRow, ...comments].slice(0, 200),
      };
    });

    // Rejeitado pelo RT volta a aguardar verificação.
    const pendencia = await propagarParaPendencia(ids, file, data.decision === "aprovado" ? "aprovado" : "digitado", {
      userId,
      nome: name,
    });
    // Avisos no celular (Fase 5): reprovado pelo RT → quem enviou a revisão.
    if (data.decision === "rejeitado") {
      const { avisarFluxo } = await import("./avisos.server");
      await avisarFluxo({
        evento: "reprovado",
        scopeId: data.scopeId,
        laudo: { arquivo: updatedRow.filename, registro: file },
        ator: { userId, nome: name },
        solicitante: updatedRow.requested_by,
        comentario: data.comment,
      });
    }
    return { ...updatedRow, pendencia };
  });

/* ─────────────────────────────── NOVA REVISÃO ─────────────────────────────── */

const ScopeInput = z.object({ scopeId: z.string().min(1) });

/**
 * Reabre um laudo aprovado para correção: registra a próxima revisão como
 * "em revisão" e devolve o ensaio para a digitação. Quando a pessoa termina,
 * envia para verificação como qualquer revisão — o fluxo não é pulado.
 *
 * Antes, "Gerar nova revisão" gerava e enviava o PDF direto para aprovação,
 * com a numeração do navegador; a revisão nova às vezes caía em cima da
 * aprovada e o laudo aparecia "aguardando aprovação" no título e "aprovado" no
 * status. Se a última revisão ainda não foi aprovada, não abre outra: devolve
 * a mesma (não cria versão desnecessária).
 */
export const abrirNovaRevisao = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .validator((v: unknown) => ScopeInput.parse(v))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as {
      userId: string;
      claims: { email?: string; user_metadata?: { full_name?: string; name?: string } };
    };
    const name = displayName(claims);
    const nowIso = new Date().toISOString();
    const { revisoesComPdfNoDrive } = await import("./driveSync.functions");
    const noDrive = await revisoesComPdfNoDrive(data.scopeId).catch(() => [] as number[]);

    let rev = 0;
    let reaproveitada = false;
    const { ids, file } = await alterarEnsaio(data.scopeId, (_ids, existing) => {
      if (!existing) throw new Error("Ensaio não encontrado.");
      const approvals = (existing.reportApprovals as ApprovalRow[] | undefined) ?? [];
      rev = proximaRevisao(approvals, noDrive);
      reaproveitada = approvals.some((a) => a.rev === rev);
      if (reaproveitada) return existing;
      const row: ApprovalRow = {
        id: rid("app"),
        scope_id: data.scopeId,
        rev,
        status: STATUS_EM_REVISAO as ApprovalStatus,
        requested_by: userId,
        requested_by_name: name,
        requested_at: nowIso,
        verified_by: null,
        verified_by_name: null,
        verified_at: null,
        verification_comment: null,
        decided_by: null,
        decided_by_name: null,
        decided_at: null,
        comment: null,
        filename: null,
        updated_at: nowIso,
      };
      const comments = (existing.approvalComments as ApprovalCommentRow[] | undefined) ?? [];
      const commentRow: ApprovalCommentRow = {
        id: rid("cmt"),
        scope_id: data.scopeId,
        rev,
        action: "comment",
        comment: `Rev-${String(rev).padStart(2, "0")} aberta para correção.`,
        author_id: userId,
        author_name: name,
        author_role: "operador",
        created_at: nowIso,
      };
      return {
        ...existing,
        updatedAt: nowIso,
        rev: (existing.rev ?? 0) + 1,
        workflowStatus: "digitacao",
        status: "digitacao",
        reportApprovals: [row, ...approvals],
        approvalComments: [commentRow, ...comments].slice(0, 200),
      };
    });
    const pendencia = reaproveitada
      ? null
      : await propagarParaPendencia(ids, file, "em_digitacao", { userId, nome: name });
    return { rev, reaproveitada, pendencia };
  });

/* ─────────────────────────────── EXCLUSÃO ─────────────────────────────── */

const ExcluirInput = z.object({ scopeId: z.string().min(1), rev: z.number().int().nonnegative() });

/**
 * Exclui uma revisão de verdade: o PDF e a planilha vão para a lixeira do
 * Drive (recuperáveis por 30 dias) e a revisão sai do fluxo de aprovação.
 * Antes só a cópia do navegador era apagada — o PDF ficava no Drive e a
 * revisão seguinte "pulava" o número ou voltava como revisão.
 *
 * Quem verifica exclui; revisão aprovada, só quem aprova.
 */
export const excluirRevisao = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .validator((v: unknown) => ExcluirInput.parse(v))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as {
      userId: string;
      claims: { email?: string; user_metadata?: { full_name?: string; name?: string } };
    };
    exigirPermissaoNoFluxo(context as PapelDoUsuario, "verificar");
    const found = await readEnsaio(data.scopeId);
    const antes = (found?.file?.reportApprovals as ApprovalRow[] | undefined) ?? [];
    if (revisaoAprovada(antes, data.rev)) exigirPermissaoNoFluxo(context as PapelDoUsuario, "aprovar");

    const name = displayName(claims);
    const nowIso = new Date().toISOString();
    // Primeiro o Drive: se falhar, nada muda e a tela avisa.
    const { revisaoParaLixeiraDoDrive } = await import("./driveSync.functions");
    const arquivos = await revisaoParaLixeiraDoDrive(data.scopeId, data.rev);

    let mudouFluxo = false;
    let workflow: ReturnType<typeof workflowDaEtapa> = "digitacao";
    const resultado = found?.file
      ? await alterarEnsaio(data.scopeId, (_ids, existing) => {
          if (!existing) throw new Error("Ensaio não encontrado.");
          const approvals = (existing.reportApprovals as ApprovalRow[] | undefined) ?? [];
          const restantes = approvals.filter((a) => a.rev !== data.rev);
          mudouFluxo = restantes.length !== approvals.length;
          if (!mudouFluxo) return existing;
          workflow = workflowDaEtapa(restantes);
          const comments = (existing.approvalComments as ApprovalCommentRow[] | undefined) ?? [];
          const commentRow: ApprovalCommentRow = {
            id: rid("cmt"),
            scope_id: data.scopeId,
            rev: data.rev,
            action: "comment",
            comment: `Rev-${String(data.rev).padStart(2, "0")} excluída${arquivos.length ? ` (${arquivos.join(", ")} na lixeira do Drive)` : ""}.`,
            author_id: userId,
            author_name: name,
            author_role: "operador",
            created_at: nowIso,
          };
          return {
            ...existing,
            updatedAt: nowIso,
            rev: (existing.rev ?? 0) + 1,
            workflowStatus: workflow,
            status: workflow,
            reportApprovals: restantes,
            approvalComments: [commentRow, ...comments].slice(0, 200),
          };
        })
      : null;
    if (resultado && mudouFluxo) {
      await propagarParaPendencia(resultado.ids, resultado.file, PENDENCIA_DO_WORKFLOW[workflow], { userId, nome: name });
    }
    return { arquivos, workflowStatus: mudouFluxo ? workflow : null };
  });

/* ─────────────────────────────── LISTAGEM ─────────────────────────────── */

const ListInput = z.object({ scopeId: z.string().min(1) });

export const listApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => ListInput.parse(v))
  .handler(async ({ data }) => {
    // Não engole mais erro devolvendo [] — ver comentário equivalente em
    // listPendenciasDigitacao (lab-pendencias.functions.ts): pro React
    // Query, [] é uma resposta válida, não um erro, então substituía o
    // histórico de aprovações real por "vazio" a cada falha transitória.
    const found = await readEnsaio(data.scopeId);
    const approvals = (found?.file?.reportApprovals as ApprovalRow[] | undefined) ?? [];
    return [...approvals].sort((a, b) => b.rev - a.rev);
  });

/* ─────────────────────────────── COMENTÁRIOS / HISTÓRICO ─────────────────────────────── */

const CommentInput = z.object({
  scopeId: z.string().min(1),
  rev: z.number().int().nonnegative(),
  comment: z.string().min(1).max(2000),
});

export const addApprovalComment = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .validator((v: unknown) => CommentInput.parse(v))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as {
      userId: string;
      claims: { email?: string; user_metadata?: { full_name?: string; name?: string } };
    };
    const name = displayName(claims);
    const nowIso = new Date().toISOString();

    const commentRow: ApprovalCommentRow = {
      id: rid("cmt"),
      scope_id: data.scopeId,
      rev: data.rev,
      action: "comment",
      comment: data.comment,
      author_id: userId,
      author_name: name,
      author_role: "operador",
      created_at: nowIso,
    };

    await alterarEnsaio(data.scopeId, (_ids, existing) => {
      // Comentar num ensaio que não existe não pode criar um ensaio-fantasma
      // (tipo "cisalhamento-direto", payload vazio) no lugar do verdadeiro.
      if (!existing) throw new Error("Ensaio não encontrado; o comentário não foi salvo.");
      const comments = (existing.approvalComments as ApprovalCommentRow[] | undefined) ?? [];
      return {
        ...existing,
        updatedAt: nowIso,
        rev: (existing.rev ?? 0) + 1,
        approvalComments: [commentRow, ...comments].slice(0, 200),
      };
    });
    return commentRow;
  });

const ListCommentsInput = z.object({
  scopeId: z.string().min(1),
  rev: z.number().int().nonnegative().optional(),
});

export const listApprovalComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => ListCommentsInput.parse(v))
  .handler(async ({ data }) => {
    try {
      const found = await readEnsaio(data.scopeId);
      let comments = (found?.file?.approvalComments as ApprovalCommentRow[] | undefined) ?? [];
      if (typeof data.rev === "number") {
        comments = comments.filter((c) => c.rev === data.rev);
      }
      return [...comments].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    } catch (err) {
      // Comentários de verificação/rejeição sumindo em silêncio fazem parecer
      // que o verificador não escreveu nada. Melhor a tela acusar a falha.
      console.error("[listApprovalComments] Falha ao ler comentários:", err);
      throw err;
    }
  });

/**
 * Deriva o farol ("digitacao" | "aguardando_verificacao" |
 * "aguardando_aprovacao" | "aprovado") a partir da revisão mais recente em
 * `reportApprovals`, em vez de confiar no campo `workflowStatus` gravado
 * separadamente. Os dois já saíram de sincronia mais de uma vez — cada
 * caminho de escrita (requestApproval/verifyApproval/decideApproval)
 * precisava lembrar de gravar ambos os campos juntos, e esquecer um deles
 * deixava um ensaio já aprovado aparecendo pra sempre com o status
 * antigo. `reportApprovals` em si sempre foi corretamente atualizado por
 * todos os caminhos, então derivar dali também corrige retroativamente
 * ensaios já aprovados antes deste fix, sem precisar de migração.
 */
function deriveWorkflowStatus(file: EnsaioFile | null): string {
  const approvals = (file?.reportApprovals as ApprovalRow[] | undefined) ?? [];
  return etapaDasAprovacoes(approvals) ?? (file?.workflowStatus || "digitacao");
}

/* ─────────────────────────────── FARÓIS / WORKFLOW STATUSES ─────────────────────────────── */

const WorkflowStatusesInput = z.object({
  scopeIds: z.array(z.string().min(1)).max(200),
});

export const getWorkflowStatuses = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((v: unknown) => WorkflowStatusesInput.parse(v))
  .handler(async ({ data }) => {
    if (!data.scopeIds || data.scopeIds.length === 0) return { statuses: {} as Record<string, string> };

    const out: Record<string, string> = {};
    // Uma leitura que falhou NÃO é "digitação": respondia isso para laudos já
    // aprovados, e o farol rebaixava o ensaio na tela. Deixa estourar — quem
    // chama mantém o último status bom em vez de mostrar um status falso.
    // (readDriveJson já repete as falhas transitórias antes de desistir.)
    const folderId = await ensureFolderPath(FOLDER_ENSAIOS);
    await mapWithConcurrency(data.scopeIds, 8, async (scopeId) => {
      const ids = parseScope(scopeId);
      if (!ids) {
        out[scopeId] = "digitacao";
        return;
      }
      const file = await readDriveJson<EnsaioFile>(ensaioFileName(ids.amostraId, ids.ensaioId), folderId);
      out[scopeId] = deriveWorkflowStatus(file);
    });
    return { statuses: out };
  });

/**
 * Atualiza o status do fluxo principal no arquivo do ensaio. Se falhar,
 * propaga o erro para não permitir falso sucesso no cliente.
 */
export async function setWorkflowStatus(
  scopeId: string,
  status: "digitacao" | "aguardando_verificacao" | "aguardando_aprovacao" | "aprovado" | "rejeitado",
  index?: {
    os_numero?: string | null;
    os_cliente?: string | null;
    amostra_code?: string | null;
    ensaio_tipo?: string | null;
    ensaio_nome?: string | null;
  },
) {
  const nowIso = new Date().toISOString();
  await alterarEnsaio(scopeId, (_ids, existing) => {
    // Mesmo critério das demais escritas de aprovação: sem o arquivo, não fabrica
    // um ensaio vazio no lugar dele.
    if (!existing) throw new Error(`Ensaio não encontrado: ${scopeId}`);
    return {
      ...existing,
      updatedAt: nowIso,
      rev: (existing.rev ?? 0) + 1,
      workflowStatus: status,
      // Grava `status` junto: verifyApproval/decideApproval já fazem isso, e só
      // este caminho ainda deixava os dois campos divergirem.
      status,
    };
  });
}
