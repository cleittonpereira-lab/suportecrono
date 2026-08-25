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
  FOLDER_ENSAIOS,
  ensaioFileName,
  type EnsaioFile,
  type ReportApprovalRow,
  type ReportApprovalCommentRow,
} from "@/lib/lab-entities.functions";

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
      status: existing?.status ?? null,
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

    return row;
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
      reportApprovals: nextApprovals,
      approvalComments: [commentRow, ...comments].slice(0, 200),
    };
    await writeEnsaio(ids, folderId, file);

    return updatedRow;
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
      reportApprovals: nextApprovals,
      approvalComments: [commentRow, ...comments].slice(0, 200),
    };
    await writeEnsaio(ids, folderId, file);

    return updatedRow;
  });

/* ─────────────────────────────── LISTAGEM ─────────────────────────────── */

const ListInput = z.object({ scopeId: z.string().min(1) });

export const listApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => ListInput.parse(v))
  .handler(async ({ data }) => {
    try {
      const found = await readEnsaio(data.scopeId);
      const approvals = (found?.file?.reportApprovals as ApprovalRow[] | undefined) ?? [];
      return [...approvals].sort((a, b) => b.rev - a.rev);
    } catch (err: any) {
      console.warn("[listApprovals] Falha:", err);
      return [];
    }
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

    const comments = (existing?.approvalComments as ApprovalCommentRow[] | undefined) ?? [];
    const nextRev = (existing?.rev ?? 0) + 1;
    const file: EnsaioFile = existing
      ? { ...existing, updatedAt: nowIso, rev: nextRev, approvalComments: [commentRow, ...comments].slice(0, 200) }
      : {
          id: ids.ensaioId,
          amostraId: ids.amostraId,
          tipo: "cisalhamento-direto",
          status: null,
          label: null,
          nome: null,
          sigla: null,
          operator: null,
          photos: [],
          payload: null,
          createdAt: nowIso,
          updatedAt: nowIso,
          rev: 1,
          workflowStatus: "digitacao",
          approvals: [],
          draftHistory: [],
          approvalComments: [commentRow],
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
    } catch {
      return [];
    }
  });

/* ─────────────────────────────── FARÓIS / WORKFLOW STATUSES ─────────────────────────────── */

const WorkflowStatusesInput = z.object({
  scopeIds: z.array(z.string().min(1)).max(200),
});

export const getWorkflowStatuses = createServerFn({ method: "POST" })
  .validator((v: unknown) => WorkflowStatusesInput.parse(v))
  .handler(async ({ data }) => {
    if (!data.scopeIds || data.scopeIds.length === 0) return { statuses: {} as Record<string, string> };

    const out: Record<string, string> = {};
    try {
      const folderId = await ensureFolderPath(FOLDER_ENSAIOS);
      await Promise.all(
        data.scopeIds.map(async (scopeId) => {
          const ids = parseScope(scopeId);
          if (!ids) {
            out[scopeId] = "digitacao";
            return;
          }
          try {
            const file = await readDriveJson<EnsaioFile>(ensaioFileName(ids.amostraId, ids.ensaioId), folderId);
            out[scopeId] = file?.workflowStatus || "digitacao";
          } catch {
            out[scopeId] = "digitacao";
          }
        }),
      );
    } catch (err: any) {
      console.warn("[getWorkflowStatuses] Aviso:", err);
      for (const id of data.scopeIds) out[id] = out[id] || "digitacao";
    }
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
  const nowIso = new Date().toISOString();
  const nextRev = (existing?.rev ?? 0) + 1;

  const file: EnsaioFile = existing
    ? { ...existing, updatedAt: nowIso, rev: nextRev, workflowStatus: status }
    : {
        id: ids.ensaioId,
        amostraId: ids.amostraId,
        tipo: index?.ensaio_tipo || "cisalhamento-direto",
        status: null,
        label: null,
        nome: index?.ensaio_nome ?? null,
        sigla: null,
        operator: null,
        photos: [],
        payload: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        rev: nextRev,
        workflowStatus: status,
        approvals: [],
        draftHistory: [],
      };

  await writeEnsaio(ids, folderId, file);
}
