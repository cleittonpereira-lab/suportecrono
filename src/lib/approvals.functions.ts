/**
 * Fluxo de aprovação em 2 etapas soberano no Google Drive:
 *   Laboratorista → Verificador → Responsável Técnico (Admin)
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
import { readDriveJson, writeDriveJson, DRIVE_ROOT_FOLDER_ID } from "./driveStorage";

const APPROVALS_FILENAME = "_approvals-index.json";

function normStr(str?: string | null): string {
  if (!str) return "";
  return str.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
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

export interface ApprovalRow {
  id: string;
  scope_id: string;
  rev: number;
  status: ApprovalStatus;
  requested_by: string;
  requested_by_name: string | null;
  requested_at: string;
  verified_by: string | null;
  verified_by_name: string | null;
  verified_at: string | null;
  verification_comment: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  comment: string | null;
  filename: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ApprovalsMasterData {
  approvals: Record<string, ApprovalRow>; // key: `${scope_id}:rev${rev}`
  statuses: Record<string, string>; // key: scope_id -> status
  history: ApprovalCommentRow[];
}

function displayName(claims: { email?: string; user_metadata?: { full_name?: string; name?: string } } | undefined) {
  return (
    (claims?.user_metadata?.full_name as string | undefined) ||
    (claims?.user_metadata?.name as string | undefined) ||
    (claims?.email ? claims.email.split("@")[0] : "Operador")
  );
}

export interface ApprovalCommentRow {
  id: string;
  scope_id: string;
  rev: number;
  action: string;
  comment: string | null;
  author_id: string;
  author_name: string | null;
  author_role: string | null;
  created_at: string;
}

async function getMasterApprovals(): Promise<ApprovalsMasterData> {
  const data = await readDriveJson<ApprovalsMasterData>(APPROVALS_FILENAME, DRIVE_ROOT_FOLDER_ID);
  return data || { approvals: {}, statuses: {}, history: [] };
}

async function saveMasterApprovals(data: ApprovalsMasterData): Promise<void> {
  await writeDriveJson(APPROVALS_FILENAME, data, DRIVE_ROOT_FOLDER_ID);
}

async function setWorkflowStatus(
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
  const master = await getMasterApprovals();
  master.statuses[scopeId] = status;
  await saveMasterApprovals(master);

  // Espelho não-bloqueante no Supabase
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    await supabaseAdmin.from("lab_index").upsert({
      scope_id: scopeId,
      os_numero: index?.os_numero || null,
      os_cliente: index?.os_cliente || null,
      amostra_code: index?.amostra_code || null,
      ensaio_tipo: index?.ensaio_tipo || null,
      ensaio_nome: index?.ensaio_nome || null,
      workflow_status: status,
      updated_at: nowIso,
    });
  } catch {}
}

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
    const { userId, claims } = context as {
      userId: string;
      claims: { email?: string; user_metadata?: { full_name?: string; name?: string } };
    };
    const name = displayName(claims);
    const nowIso = new Date().toISOString();

    const targetStatus = data.skipVerification ? "pendente_aprovacao" : "pendente_verificacao";
    const targetWorkflow = data.skipVerification ? "aguardando_aprovacao" : "aguardando_verificacao";

    // 1. Grava no Google Drive (Soberano)
    const master = await getMasterApprovals();
    const appKey = `${data.scopeId}:rev${data.rev}`;
    const row: ApprovalRow = {
      id: appKey,
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

    master.approvals[appKey] = row;
    master.statuses[data.scopeId] = targetWorkflow;
    master.history.push({
      id: `evt_${Date.now()}`,
      scope_id: data.scopeId,
      rev: data.rev,
      action: data.skipVerification ? "send_approval" : "send_verification",
      comment: null,
      author_id: userId,
      author_name: name,
      author_role: data.skipVerification ? "verificador" : "digitador",
      created_at: nowIso,
    });
    await saveMasterApprovals(master);

    // 2. Espelho no Supabase (não-bloqueante)
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("lab_report_approvals").upsert({
        scope_id: data.scopeId,
        rev: data.rev,
        status: targetStatus,
        requested_by: userId,
        requested_by_name: name,
        filename: data.filename ?? null,
      });
      await setWorkflowStatus(data.scopeId, targetWorkflow, data.index);
    } catch {}

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
    const nextStatus = data.decision === "verificado" ? "pendente_aprovacao" : "rejeitado_verificacao";
    const nextWorkflow = data.decision === "verificado" ? "aguardando_aprovacao" : "aguardando_verificacao";

    // 1. Grava no Google Drive (Soberano)
    const master = await getMasterApprovals();
    const appKey = `${data.scopeId}:rev${data.rev}`;
    const existing = master.approvals[appKey] || {
      id: appKey,
      scope_id: data.scopeId,
      rev: data.rev,
      requested_by: userId,
      requested_by_name: name,
      requested_at: nowIso,
      decided_by: null,
      decided_by_name: null,
      decided_at: null,
      comment: null,
      filename: null,
    };

    const updatedRow: ApprovalRow = {
      ...existing,
      status: nextStatus,
      verified_by: userId,
      verified_by_name: name,
      verified_at: nowIso,
      verification_comment: data.comment ?? null,
      updated_at: nowIso,
    };

    master.approvals[appKey] = updatedRow;
    master.statuses[data.scopeId] = nextWorkflow;
    master.history.push({
      id: `evt_${Date.now()}`,
      scope_id: data.scopeId,
      rev: data.rev,
      action: data.decision === "verificado" ? "verified" : "rejected_verification",
      comment: data.comment ?? null,
      author_id: userId,
      author_name: name,
      author_role: "verificador",
      created_at: nowIso,
    });
    await saveMasterApprovals(master);

    // 2. Espelho no Supabase (não-bloqueante)
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("lab_report_approvals")
        .update({
          status: nextStatus,
          verified_by: userId,
          verified_by_name: name,
          verified_at: nowIso,
          verification_comment: data.comment ?? null,
        })
        .eq("scope_id", data.scopeId)
        .eq("rev", data.rev);
      await setWorkflowStatus(data.scopeId, nextWorkflow);
    } catch {}

    return updatedRow;
  });

/* ─────────────────────────────── APROVAÇÃO ─────────────────────────────── */

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

    const persistedStatus = data.decision === "aprovado" ? "aprovado" : "pendente_verificacao";
    const nextWorkflow = data.decision === "aprovado" ? "aprovado" : "aguardando_verificacao";

    // 1. Grava no Google Drive (Soberano)
    const master = await getMasterApprovals();
    const appKey = `${data.scopeId}:rev${data.rev}`;
    const existing = master.approvals[appKey] || {
      id: appKey,
      scope_id: data.scopeId,
      rev: data.rev,
      requested_by: userId,
      requested_by_name: name,
      requested_at: nowIso,
      verified_by: userId,
      verified_by_name: name,
      verified_at: nowIso,
      verification_comment: null,
      filename: null,
    };

    const updatedRow: ApprovalRow = {
      ...existing,
      status: persistedStatus,
      decided_by: data.decision === "aprovado" ? userId : null,
      decided_by_name: data.decision === "aprovado" ? name : null,
      decided_at: data.decision === "aprovado" ? nowIso : null,
      comment: data.comment ?? null,
      updated_at: nowIso,
    };

    if (data.decision === "rejeitado") {
      updatedRow.verified_by = null;
      updatedRow.verified_by_name = null;
      updatedRow.verified_at = null;
      updatedRow.verification_comment = null;
    }

    master.approvals[appKey] = updatedRow;
    master.statuses[data.scopeId] = nextWorkflow;
    master.history.push({
      id: `evt_${Date.now()}`,
      scope_id: data.scopeId,
      rev: data.rev,
      action: data.decision === "aprovado" ? "approved" : "rejected",
      comment: data.comment ?? null,
      author_id: userId,
      author_name: name,
      author_role: "admin",
      created_at: nowIso,
    });
    await saveMasterApprovals(master);

    // 2. Espelho no Supabase (não-bloqueante)
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("lab_report_approvals")
        .update({
          status: persistedStatus,
          decided_by: data.decision === "aprovado" ? userId : null,
          decided_by_name: data.decision === "aprovado" ? name : null,
          decided_at: data.decision === "aprovado" ? nowIso : null,
          comment: data.comment ?? null,
        })
        .eq("scope_id", data.scopeId)
        .eq("rev", data.rev);
      await setWorkflowStatus(data.scopeId, nextWorkflow);
    } catch {}

    return updatedRow;
  });

const ListInput = z.object({ scopeId: z.string().min(1) });

export const listApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => ListInput.parse(v))
  .handler(async ({ data }) => {
    try {
      const master = await getMasterApprovals();
      const rows = Object.values(master.approvals)
        .filter((r) => r.scope_id === data.scopeId)
        .sort((a, b) => b.rev - a.rev);
      if (rows.length > 0) return rows;
    } catch {}

    // Fallback secundário
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rows } = await supabaseAdmin
        .from("lab_report_approvals")
        .select("*")
        .eq("scope_id", data.scopeId)
        .order("rev", { ascending: false });
      return (rows ?? []) as ApprovalRow[];
    } catch {
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

    const master = await getMasterApprovals();
    const commentRow: ApprovalCommentRow = {
      id: `cmt_${Date.now()}`,
      scope_id: data.scopeId,
      rev: data.rev,
      action: "comment",
      comment: data.comment,
      author_id: userId,
      author_name: name,
      author_role: "operador",
      created_at: nowIso,
    };
    master.history.push(commentRow);
    await saveMasterApprovals(master);

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
      const master = await getMasterApprovals();
      return master.history.filter((h) => {
        if (h.scope_id !== data.scopeId) return false;
        if (typeof data.rev === "number" && h.rev !== data.rev) return false;
        return true;
      });
    } catch {
      return [];
    }
  });

const WorkflowStatusesInput = z.object({
  scopeIds: z.array(z.string().min(1)).max(200),
});

export const getWorkflowStatuses = createServerFn({ method: "POST" })
  .validator((v: unknown) => WorkflowStatusesInput.parse(v))
  .handler(async ({ data }) => {
    if (!data.scopeIds || data.scopeIds.length === 0) return { statuses: {} as Record<string, string> };

    try {
      const master = await getMasterApprovals();
      const out: Record<string, string> = {};
      for (const id of data.scopeIds) {
        if (master.statuses[id]) {
          out[id] = master.statuses[id];
        }
      }

      if (Object.keys(out).length === data.scopeIds.length) {
        return { statuses: out };
      }

      // Se algum não foi encontrado, complementa com o Supabase se disponível
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rows } = await supabaseAdmin
          .from("lab_index")
          .select("scope_id, workflow_status")
          .in("scope_id", data.scopeIds);

        for (const r of rows ?? []) {
          const sid = String((r as { scope_id: string }).scope_id);
          if (!out[sid]) {
            out[sid] = String((r as { workflow_status?: string }).workflow_status ?? "digitacao");
          }
        }
      } catch {}

      return { statuses: out };
    } catch (err) {
      console.warn("getWorkflowStatuses warning:", err);
      return { statuses: {} };
    }
  });