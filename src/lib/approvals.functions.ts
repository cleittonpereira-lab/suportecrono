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
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ensureFolderPath, readDriveJson, writeDriveJson } from "@/lib/driveStorage";
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

async function writeEnsaio(ids: { amostraId: string; ensaioId: string }, folderId: string, file: EnsaioFile): Promise<void> {
  await writeDriveJson(ensaioFileName(ids.amostraId, ids.ensaioId), file, folderId);
}

export type ApprovalStatus =
  | "pendente"
  | "digitacao"
  | "pendente_verificacao"
  | "verificado"
  | "rejeitado_verificacao"
  | "pendente_aprovacao"
  | "aprovado"
  | "rejeitado";

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
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => RequestInput.parse(v))
  .handler(async ({ data, context }) => {
    const { claims } = context as { claims: { email?: string; user_metadata?: { full_name?: string; name?: string } } };
    const { userId } = context as { userId: string };
    const name = displayName(claims);
    const nowIso = new Date().toISOString();

    const found = await readEnsaio(data.scopeId);
    if (!found) throw new Error(`scopeId inválido: ${data.scopeId}`);
    // Sem o arquivo do ensaio não há o que enviar para verificação. Antes, um
    // arquivo ilegível virava `existing = null` e esta função gravava um ensaio
    // novo com `payload: null` — apagando o laudo digitado no exato momento em
    // que ele era enviado. Mesmo critério de verifyApproval/decideApproval.
    if (!found.file) {
      throw new Error("Ensaio não encontrado no Drive. Salve o rascunho antes de enviar para verificação.");
    }
    const { ids, file: existing, folderId } = found;

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

    const approvals = (existing?.reportApprovals as ApprovalRow[] | undefined) ?? [];
    const nextApprovals = [row, ...approvals.filter((a) => a.rev !== data.rev)];

    const comments = (existing?.approvalComments as ApprovalCommentRow[] | undefined) ?? [];
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

    const nextRev = (existing?.rev ?? 0) + 1;
    const file: EnsaioFile = {
      ...(existing as EnsaioFile),
      id: ids.ensaioId,
      amostraId: ids.amostraId,
      tipo: existing?.tipo || data.index?.ensaio_tipo || "cisalhamento-direto",
      // Ver comentário equivalente em verifyApproval/decideApproval — sem
      // gravar `status` junto aqui, um ensaio já aprovado que ganha uma
      // nova revisão ficava com o Kanban/labStore mostrando o status
      // antigo ("aprovado") até que o patch otimista do cliente expirasse.
      status: targetWorkflow,
      label: existing?.label ?? null,
      nome: existing?.nome ?? data.index?.ensaio_nome ?? null,
      sigla: existing?.sigla ?? null,
      operator: existing?.operator ?? null,
      photos: existing?.photos ?? [],
      payload: existing?.payload ?? null,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
      rev: nextRev,
      workflowStatus: targetWorkflow,
      approvals: existing?.approvals ?? [],
      draftHistory: existing?.draftHistory ?? [],
      reportApprovals: nextApprovals,
      approvalComments: [commentRow, ...comments].slice(0, 200),
    };

    await writeEnsaio(ids, folderId, file);

    const pendencia = await propagarParaPendencia(ids, file, data.skipVerification ? "verificado" : "digitado", {
      userId,
      nome: name,
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
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => VerifyInput.parse(v))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as {
      userId: string;
      claims: { email?: string; user_metadata?: { full_name?: string; name?: string } };
    };
    const name = displayName(claims);
    const nowIso = new Date().toISOString();
    const nextStatus: ApprovalStatus = data.decision === "verificado" ? "pendente_aprovacao" : "rejeitado_verificacao";
    const nextWorkflow = data.decision === "verificado" ? "aguardando_aprovacao" : "aguardando_verificacao";

    const found = await readEnsaio(data.scopeId);
    if (!found || !found.file) throw new Error("Registro de aprovação não encontrado.");
    const { ids, file: existing, folderId } = found;

    const approvals = (existing?.reportApprovals as ApprovalRow[] | undefined) ?? [];
    const idx = approvals.findIndex((a) => a.rev === data.rev);
    if (idx === -1) throw new Error("Solicitação de aprovação para esta revisão não encontrada.");

    const updatedRow: ApprovalRow = {
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

    const comments = (existing?.approvalComments as ApprovalCommentRow[] | undefined) ?? [];
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

    const nextRev = (existing.rev ?? 0) + 1;
    const file: EnsaioFile = {
      ...existing,
      updatedAt: nowIso,
      rev: nextRev,
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
    await writeEnsaio(ids, folderId, file);

    // Rejeitado na verificação volta para a digitação.
    const pendencia = await propagarParaPendencia(
      ids,
      file,
      data.decision === "verificado" ? "verificado" : "em_digitacao",
      { userId, nome: name },
    );
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
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => DecideInput.parse(v))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as {
      userId: string;
      claims: { email?: string; user_metadata?: { full_name?: string; name?: string } };
    };
    const name = displayName(claims);
    const nowIso = new Date().toISOString();

    const persistedStatus: ApprovalStatus = data.decision === "aprovado" ? "aprovado" : "pendente_verificacao";
    const nextWorkflow = data.decision === "aprovado" ? "aprovado" : "aguardando_verificacao";

    const found = await readEnsaio(data.scopeId);
    if (!found || !found.file) throw new Error("Registro de aprovação não encontrado.");
    const { ids, file: existing, folderId } = found;

    const approvals = (existing?.reportApprovals as ApprovalRow[] | undefined) ?? [];
    const idx = approvals.findIndex((a) => a.rev === data.rev);
    if (idx === -1) throw new Error("Solicitação de aprovação para esta revisão não encontrada.");

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

    const updatedRow: ApprovalRow = { ...approvals[idx], ...patch };
    const nextApprovals = [...approvals];
    nextApprovals[idx] = updatedRow;

    const comments = (existing?.approvalComments as ApprovalCommentRow[] | undefined) ?? [];
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

    const nextRev = (existing.rev ?? 0) + 1;
    const file: EnsaioFile = {
      ...existing,
      updatedAt: nowIso,
      rev: nextRev,
      workflowStatus: nextWorkflow,
      // Ver comentário equivalente em verifyApproval.
      status: nextWorkflow,
      reportApprovals: nextApprovals,
      approvalComments: [commentRow, ...comments].slice(0, 200),
    };
    await writeEnsaio(ids, folderId, file);

    // Rejeitado pelo RT volta a aguardar verificação.
    const pendencia = await propagarParaPendencia(ids, file, data.decision === "aprovado" ? "aprovado" : "digitado", {
      userId,
      nome: name,
    });
    return { ...updatedRow, pendencia };
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
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => CommentInput.parse(v))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as {
      userId: string;
      claims: { email?: string; user_metadata?: { full_name?: string; name?: string } };
    };
    const name = displayName(claims);
    const nowIso = new Date().toISOString();

    const found = await readEnsaio(data.scopeId);
    if (!found) throw new Error(`scopeId inválido: ${data.scopeId}`);
    const { ids, file: existing, folderId } = found;

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

    // Comentar num ensaio que não existe não pode criar um ensaio-fantasma
    // (tipo "cisalhamento-direto", payload vazio) no lugar do verdadeiro.
    if (!existing) throw new Error("Ensaio não encontrado no Drive; o comentário não foi salvo.");

    const comments = (existing.approvalComments as ApprovalCommentRow[] | undefined) ?? [];
    const nextRev = (existing.rev ?? 0) + 1;
    const file: EnsaioFile = {
      ...existing,
      updatedAt: nowIso,
      rev: nextRev,
      approvalComments: [commentRow, ...comments].slice(0, 200),
    };

    await writeEnsaio(ids, folderId, file);
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
  if (approvals.length > 0) {
    const latest = approvals.reduce((a, b) => (b.rev > a.rev ? b : a));
    if (latest.status === "aprovado") return "aprovado";
    if (latest.status === "pendente_aprovacao" || latest.status === "verificado") return "aguardando_aprovacao";
    if (latest.status === "pendente_verificacao" || latest.status === "rejeitado_verificacao" || latest.status === "rejeitado") return "aguardando_verificacao";
  }
  return file?.workflowStatus || "digitacao";
}

/* ─────────────────────────────── FARÓIS / WORKFLOW STATUSES ─────────────────────────────── */

const WorkflowStatusesInput = z.object({
  scopeIds: z.array(z.string().min(1)).max(200),
});

export const getWorkflowStatuses = createServerFn({ method: "POST" })
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
  const found = await readEnsaio(scopeId);
  if (!found) throw new Error(`scopeId inválido: ${scopeId}`);
  const { ids, file: existing, folderId } = found;
  // Mesmo critério das demais escritas de aprovação: sem o arquivo, não fabrica
  // um ensaio vazio no lugar dele.
  if (!existing) throw new Error(`Ensaio não encontrado no Drive: ${scopeId}`);
  const nowIso = new Date().toISOString();

  const file: EnsaioFile = {
    ...existing,
    updatedAt: nowIso,
    rev: (existing.rev ?? 0) + 1,
    workflowStatus: status,
    // Grava `status` junto: verifyApproval/decideApproval já fazem isso, e só
    // este caminho ainda deixava os dois campos divergirem.
    status,
  };

  await writeEnsaio(ids, folderId, file);
}
