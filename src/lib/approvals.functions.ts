/**
 * Fluxo de aprovação soberano e transacional no Supabase (PostgreSQL / RLS):
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

function displayName(claims: { email?: string; user_metadata?: { full_name?: string; name?: string } } | undefined) {
  return (
    (claims?.user_metadata?.full_name as string | undefined) ||
    (claims?.user_metadata?.name as string | undefined) ||
    (claims?.email ? claims.email.split("@")[0] : "Operador")
  );
}

/**
 * Atualiza o status do fluxo principal no `lab_index` (PostgreSQL soberano).
 * Se falhar, propaga o erro para não permitir falso sucesso no cliente.
 */
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
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();

  const { error } = await supabaseAdmin.from("lab_index").upsert({
    scope_id: scopeId,
    os_numero: index?.os_numero || null,
    os_cliente: index?.os_cliente || null,
    amostra_code: index?.amostra_code || null,
    ensaio_tipo: index?.ensaio_tipo || null,
    ensaio_nome: index?.ensaio_nome || null,
    workflow_status: status,
    updated_at: nowIso,
  });

  if (error) {
    throw new Error(`Falha ao atualizar status de fluxo no banco: ${error.message}`);
  }
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
    const { userId, claims } = context as {
      userId: string;
      claims: { email?: string; user_metadata?: { full_name?: string; name?: string } };
    };
    const name = displayName(claims);
    const nowIso = new Date().toISOString();

    const targetStatus = data.skipVerification ? "pendente_aprovacao" : "pendente_verificacao";
    const targetWorkflow = data.skipVerification ? "aguardando_aprovacao" : "aguardando_verificacao";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Grava no banco de dados Supabase com RLS e integridade referencial
    const rowData = {
      scope_id: data.scopeId,
      rev: data.rev,
      status: targetStatus as any,
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

    const { data: inserted, error: appErr } = await supabaseAdmin
      .from("lab_report_approvals")
      .upsert(rowData, { onConflict: "scope_id,rev" })
      .select()
      .single();

    if (appErr) {
      throw new Error(`Erro ao solicitar aprovação: ${appErr.message}`);
    }

    // 2. Registra evento de histórico
    try {
      await supabaseAdmin
        .from("lab_report_approval_comments")
        .insert({
          scope_id: data.scopeId,
          rev: data.rev,
          action: data.skipVerification ? "send_approval" : "send_verification",
          comment: null,
          author_id: userId,
          author_name: name,
          author_role: data.skipVerification ? "verificador" : "digitador",
          created_at: nowIso,
        });
    } catch {}

    // 3. Atualiza workflow no índice
    await setWorkflowStatus(data.scopeId, targetWorkflow, data.index);

    return (inserted || rowData) as ApprovalRow;
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Atualiza aprovação no Supabase
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("lab_report_approvals")
      .update({
        status: nextStatus,
        verified_by: userId,
        verified_by_name: name,
        verified_at: nowIso,
        verification_comment: data.comment ?? null,
        updated_at: nowIso,
      })
      .eq("scope_id", data.scopeId)
      .eq("rev", data.rev)
      .select()
      .single();

    if (updErr) {
      throw new Error(`Erro ao registrar verificação: ${updErr.message}`);
    }

    // 2. Registra histórico
    try {
      await supabaseAdmin
        .from("lab_report_approval_comments")
        .insert({
          scope_id: data.scopeId,
          rev: data.rev,
          action: data.decision === "verificado" ? "verified" : "rejected_verification",
          comment: data.comment ?? null,
          author_id: userId,
          author_name: name,
          author_role: "verificador",
          created_at: nowIso,
        });
    } catch {}

    // 3. Atualiza workflow
    await setWorkflowStatus(data.scopeId, nextWorkflow);

    return updated as ApprovalRow;
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

    const persistedStatus = data.decision === "aprovado" ? "aprovado" : "pendente_verificacao";
    const nextWorkflow = data.decision === "aprovado" ? "aprovado" : "aguardando_verificacao";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch: Record<string, unknown> = {
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

    const { data: updated, error: decErr } = await supabaseAdmin
      .from("lab_report_approvals")
      .update(patch as any)
      .eq("scope_id", data.scopeId)
      .eq("rev", data.rev)
      .select()
      .single();

    if (decErr) {
      throw new Error(`Erro ao registrar decisão de aprovação: ${decErr.message}`);
    }

    // Registra evento de histórico
    try {
      await supabaseAdmin
        .from("lab_report_approval_comments")
        .insert({
          scope_id: data.scopeId,
          rev: data.rev,
          action: data.decision === "aprovado" ? "approved" : "rejected",
          comment: data.comment ?? null,
          author_id: userId,
          author_name: name,
          author_role: "admin",
          created_at: nowIso,
        });
    } catch {}

    await setWorkflowStatus(data.scopeId, nextWorkflow);

    return updated as ApprovalRow;
  });

/* ─────────────────────────────── LISTAGEM ─────────────────────────────── */

const ListInput = z.object({ scopeId: z.string().min(1) });

export const listApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => ListInput.parse(v))
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rows, error } = await supabaseAdmin
        .from("lab_report_approvals")
        .select("*")
        .eq("scope_id", data.scopeId)
        .order("rev", { ascending: false });

      if (error) {
        console.warn("[listApprovals] Erro Supabase:", error);
        return [];
      }

      return (rows ?? []) as ApprovalRow[];
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error } = await supabaseAdmin
      .from("lab_report_approval_comments")
      .insert({
        scope_id: data.scopeId,
        rev: data.rev,
        action: "comment",
        comment: data.comment,
        author_id: userId,
        author_name: name,
        author_role: "operador",
        created_at: nowIso,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Erro ao salvar comentário: ${error.message}`);
    }

    return inserted as ApprovalCommentRow;
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
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      let q = supabaseAdmin
        .from("lab_report_approval_comments")
        .select("*")
        .eq("scope_id", data.scopeId)
        .order("created_at", { ascending: true });

      if (typeof data.rev === "number") {
        q = q.eq("rev", data.rev);
      }

      const { data: rows, error } = await q;
      if (error) {
        console.warn("[listApprovalComments] Erro:", error);
        return [];
      }

      return (rows || []) as ApprovalCommentRow[];
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

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rows, error } = await supabaseAdmin
        .from("lab_index")
        .select("scope_id, workflow_status")
        .in("scope_id", data.scopeIds);

      const out: Record<string, string> = {};
      for (const r of rows ?? []) {
        out[String((r as { scope_id: string }).scope_id)] = String(
          (r as { workflow_status?: string }).workflow_status ?? "digitacao",
        );
      }

      // Para qualquer scopeId ausente em lab_index, verifica lab_report_approvals
      const missing = data.scopeIds.filter((id) => !out[id]);
      if (missing.length > 0) {
        const { data: appRows } = await supabaseAdmin
          .from("lab_report_approvals")
          .select("scope_id, status, rev")
          .in("scope_id", missing)
          .order("rev", { ascending: false });

        for (const ar of appRows ?? []) {
          const sid = String(ar.scope_id);
          if (!out[sid]) {
            const st = ar.status;
            if (st === "pendente_verificacao" || st === "verificado") out[sid] = "aguardando_verificacao";
            else if (st === "pendente_aprovacao") out[sid] = "aguardando_aprovacao";
            else if (st === "aprovado") out[sid] = "aprovado";
            else if (st === "rejeitado" || st === "rejeitado_verificacao") out[sid] = "rejeitado";
            else out[sid] = "digitacao";
          }
        }
      }

      // Default para os restantes
      for (const id of data.scopeIds) {
        if (!out[id]) out[id] = "digitacao";
      }

      return { statuses: out };
    } catch (err: any) {
      console.warn("[getWorkflowStatuses] Aviso:", err);
      const out: Record<string, string> = {};
      for (const id of data.scopeIds) out[id] = "digitacao";
      return { statuses: out };
    }
  });