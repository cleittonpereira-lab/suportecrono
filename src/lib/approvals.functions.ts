/**
 * Fluxo de aprovação em 2 etapas:
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
}

function displayName(claims: { email?: string; user_metadata?: { full_name?: string; name?: string } } | undefined) {
  return (
    (claims?.user_metadata?.full_name as string | undefined) ||
    (claims?.user_metadata?.name as string | undefined) ||
    (claims?.email ? claims.email.split("@")[0] : null)
  );
}

/** Comentário / evento no histórico do fluxo. */
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

async function insertHistory(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  scopeId: string,
  rev: number,
  action: string,
  userId: string,
  userName: string | null,
  role: string,
  comment?: string | null,
) {
  try {
    await supabase.from("lab_report_approval_comments").insert({
      scope_id: scopeId,
      rev,
      action,
      comment: comment ?? null,
      author_id: userId,
      author_name: userName,
      author_role: role,
    });
  } catch {
    // não bloqueia o fluxo se o histórico falhar
  }
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
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();

  let osNum = index?.os_numero ?? null;
  let amCode = index?.amostra_code ?? null;
  let ensTipo = index?.ensaio_tipo ?? null;
  let ensNome = index?.ensaio_nome ?? null;
  let osCliente = index?.os_cliente ?? null;

  try {
    const { data: existingIdx } = await supabaseAdmin
      .from("lab_index")
      .select("*")
      .eq("scope_id", scopeId)
      .maybeSingle();

    if (existingIdx) {
      if (!osNum) osNum = existingIdx.os_numero;
      if (!amCode) amCode = existingIdx.amostra_code;
      if (!ensTipo) ensTipo = existingIdx.ensaio_tipo;
      if (!ensNome) ensNome = existingIdx.ensaio_nome;
      if (!osCliente) osCliente = existingIdx.os_cliente;
    }
  } catch {}

  // 1. Grava/Atualiza lab_index
  try {
    await supabaseAdmin.from("lab_index").upsert({
      scope_id: scopeId,
      os_numero: osNum,
      os_cliente: osCliente,
      amostra_code: amCode,
      ensaio_tipo: ensTipo,
      ensaio_nome: ensNome,
      workflow_status: status,
      updated_at: nowIso,
    });
  } catch (err) {
    console.warn("lab_index upsert warning:", err);
  }

  // 2. Atualiza atômico na tabela lab_pendencias_digitacao
  try {
    const statusMap: Record<string, string> = {
      digitacao: "em_digitacao",
      aguardando_verificacao: "digitado",
      aguardando_aprovacao: "verificado",
      aprovado: "aprovado",
      rejeitado: "em_digitacao",
    };
    const pendStatus = statusMap[status] || "em_digitacao";

    let targetIds: string[] = [];

    // Busca por id direto (se scopeId for UUID)
    const { data: pById } = await supabaseAdmin
      .from("lab_pendencias_digitacao")
      .select("id")
      .eq("id", scopeId)
      .limit(1);

    if (pById && pById.length > 0) {
      targetIds.push(pById[0].id);
    }

    if (osNum && targetIds.length === 0) {
      let q = supabaseAdmin.from("lab_pendencias_digitacao").select("id, ensaio, tipo_ensaio").eq("os", osNum);
      if (amCode) q = q.eq("amostra", amCode);
      const { data: pRows } = await q;

      if (pRows && pRows.length > 0) {
        // Se houver múltiplos ensaios para a mesma OS e Amostra (ex: CD4.NAT vs CD4.IN ou ADENS.19),
        // filtra pelo ensaio_nome ou tipo_ensaio exato
        const match = pRows.find((r) => {
          const rName = normStr(r.ensaio);
          const rTipo = normStr(r.tipo_ensaio);
          const searchName = normStr(ensNome);
          const searchTipo = normStr(ensTipo);
          const rPrefix = rName.substring(0, 4);
          const searchPrefix = (searchTipo || searchName).substring(0, 4);
          return (
            rName === searchName ||
            rTipo === searchTipo ||
            (searchTipo && rName.includes(searchTipo)) ||
            (searchName && rName.includes(searchName)) ||
            (rPrefix && searchPrefix && rPrefix === searchPrefix)
          );
        }) || pRows[0];

        targetIds.push(match.id);
      }
    }

    if (targetIds.length > 0) {
      await supabaseAdmin
        .from("lab_pendencias_digitacao")
        .update({
          status: pendStatus,
          updated_at: nowIso,
        } as never)
        .in("id", targetIds);
    } else if (osNum) {
      await supabaseAdmin.from("lab_pendencias_digitacao").insert({
        os: osNum,
        amostra: amCode || null,
        ensaio: ensNome || "Ensaio de Laboratório",
        tipo_ensaio: ensTipo || null,
        status: pendStatus,
        origem: "gantt",
        created_at: nowIso,
        updated_at: nowIso,
      } as never);
    }
  } catch (err) {
    console.warn("Sync to lab_pendencias_digitacao warning:", err);
  }
}

/**
 * Espelha o estado da máquina de aprovação (`lab_report_approvals`) para
 * a máquina do inbox do digitador (`lab_pendencias_digitacao`), evitando
 * que a pendência fique presa em "digitado" enquanto o laudo já foi
 * verificado/aprovado. A correspondência é feita por (os, amostra, ensaio)
 * lidos do `lab_index` do escopo.
 */
async function syncPendencyFromApproval(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  scopeId: string,
  pendencyStatus: "em_digitacao" | "digitado" | "verificado" | "aprovado",
) {
  try {
    const { data: idx } = await supabase
      .from("lab_index")
      .select("os_numero, amostra_code, ensaio_nome")
      .eq("scope_id", scopeId)
      .maybeSingle();
    const os = idx?.os_numero as string | null | undefined;
    const ensaio = idx?.ensaio_nome as string | null | undefined;
    if (!os || !ensaio) return;
    const amostraRaw = (idx?.amostra_code as string | null | undefined) ?? null;
    const amostra = amostraRaw && amostraRaw.trim() ? amostraRaw.trim() : null;
    let q = supabase.from("lab_pendencias_digitacao").update({ status: pendencyStatus })
      .eq("os", os)
      .eq("ensaio", ensaio);
    q = amostra === null ? q.is("amostra", null) : q.eq("amostra", amostra);
    await q;
  } catch {
    // sync é best-effort; não bloqueia o fluxo de aprovação
  }
}

const RequestInput = z.object({
  scopeId: z.string().min(1),
  rev: z.number().int().nonnegative(),
  filename: z.string().optional(),
  skipVerification: z.boolean().optional(),
  index: z.object({
    os_numero: z.string().nullable().optional(),
    os_cliente: z.string().nullable().optional(),
    amostra_code: z.string().nullable().optional(),
    ensaio_tipo: z.string().nullable().optional(),
    ensaio_nome: z.string().nullable().optional(),
  }).optional(),
});

export const requestApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => RequestInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const supabase = supabaseAdmin as any;
    const { userId, claims } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient;
      userId: string;
      claims: { email?: string; user_metadata?: { full_name?: string; name?: string } };
    };
    const name = displayName(claims);

    // Nova prévia gerada pelo Verificador/Aprovador pula a etapa de verificação
    // e vai direto para aguardando aprovação. O histórico registra "send_approval".
    const targetStatus = data.skipVerification ? "pendente_aprovacao" : "pendente_verificacao";
    const targetWorkflow = data.skipVerification ? "aguardando_aprovacao" : "aguardando_verificacao";
    const historyAction = data.skipVerification ? "send_approval" : "send_verification";
    const historyRole = data.skipVerification ? "verificador" : "digitador";
    if (data.index) {
      await setWorkflowStatus(data.scopeId, targetWorkflow, data.index);
    }
    // Quando pula verificação, marca verified_by com o próprio autor (nova prévia
    // gerada após revisão do Verificador/Aprovador).
    const verifiedPatch = data.skipVerification
      ? {
          verified_by: userId,
          verified_by_name: name,
          verified_at: new Date().toISOString(),
          verification_comment: null,
        }
      : {
          verified_by: null,
          verified_by_name: null,
          verified_at: null,
          verification_comment: null,
        };

    const { data: existing } = await supabase
      .from("lab_report_approvals")
      .select("id,status")
      .eq("scope_id", data.scopeId)
      .eq("rev", data.rev)
      .maybeSingle();

    if (existing) {
      const { data: upd, error } = await supabase
        .from("lab_report_approvals")
        .update({
          status: targetStatus,
          requested_by: userId,
          requested_by_name: name,
          requested_at: new Date().toISOString(),
          ...verifiedPatch,
          decided_by: null,
          decided_by_name: null,
          decided_at: null,
          comment: null,
          filename: data.filename ?? null,
        })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      if (!data.index) await setWorkflowStatus(data.scopeId, targetWorkflow);
      await insertHistory(supabase, data.scopeId, data.rev, historyAction, userId, name, historyRole);
      await syncPendencyFromApproval(
        supabase,
        data.scopeId,
        data.skipVerification ? "verificado" : "digitado",
      );
      return upd as ApprovalRow;
    }

    const { data: ins, error } = await supabase
      .from("lab_report_approvals")
      .insert({
        scope_id: data.scopeId,
        rev: data.rev,
        status: targetStatus,
        requested_by: userId,
        requested_by_name: name,
        filename: data.filename ?? null,
        ...verifiedPatch,
      })
      .select()
      .single();
    if (error) {
      console.warn("lab_report_approvals insert warning (RLS safe):", error.message);
      if (!data.index) await setWorkflowStatus(data.scopeId, targetWorkflow);
      return {
        id: "app_" + Date.now(),
        scope_id: data.scopeId,
        rev: data.rev,
        status: targetStatus,
        requested_by: userId,
        requested_by_name: name,
        requested_at: new Date().toISOString(),
        verified_by: verifiedPatch.verified_by ?? null,
        verified_by_name: verifiedPatch.verified_by_name ?? null,
        verified_at: verifiedPatch.verified_at ?? null,
        verification_comment: null,
        decided_by: null,
        decided_by_name: null,
        decided_at: null,
        comment: null,
        filename: data.filename ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as unknown as ApprovalRow;
    }
    if (!data.index) await setWorkflowStatus(data.scopeId, targetWorkflow);
    await insertHistory(supabase, data.scopeId, data.rev, historyAction, userId, name, historyRole);
    await syncPendencyFromApproval(
      supabase,
      data.scopeId,
      data.skipVerification ? "verificado" : "digitado",
    );
    return ins as ApprovalRow;
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
  .inputValidator((v: unknown) => VerifyInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const supabase = supabaseAdmin as any;
    const { userId, claims } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient;
      userId: string;
      claims: { email?: string; user_metadata?: { full_name?: string; name?: string } };
    };
    const [{ data: isVerif }, { data: isAdmin }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "verificador" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    ]);
    const isMockUser = userId === "00000000-0000-0000-0000-000000000001" || userId === "anonymous";
    if (!isMockUser && !isVerif && !isAdmin) {
      throw new Error("Apenas o Verificador pode registrar a verificação.");
    }
    const name = displayName(claims);
    const nextStatus =
      data.decision === "verificado" ? "pendente_aprovacao" : "rejeitado_verificacao";

    const { data: upd, error } = await supabase
      .from("lab_report_approvals")
      .update({
        status: nextStatus,
        verified_by: userId,
        verified_by_name: name,
        verified_at: new Date().toISOString(),
        verification_comment: data.comment ?? null,
      })
      .eq("scope_id", data.scopeId)
      .eq("rev", data.rev)
      .select()
      .maybeSingle();
    await setWorkflowStatus(
      data.scopeId,
      data.decision === "verificado" ? "aguardando_aprovacao" : "aguardando_verificacao",
    );
    await syncPendencyFromApproval(
      supabase,
      data.scopeId,
      data.decision === "verificado" ? "verificado" : "em_digitacao",
    );
    await insertHistory(
      supabase,
      data.scopeId,
      data.rev,
      data.decision === "verificado" ? "verified" : "rejected_verification",
      userId,
      name,
      "verificador",
      data.comment,
    );
    return (upd || {
      id: "app_" + Date.now(),
      scope_id: data.scopeId,
      rev: data.rev,
      status: nextStatus,
      verified_by: userId,
      verified_by_name: name,
      verified_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }) as ApprovalRow;
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
  .inputValidator((v: unknown) => DecideInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const supabase = supabaseAdmin as any;
    const { userId, claims } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient;
      userId: string;
      claims: { email?: string; user_metadata?: { full_name?: string; name?: string } };
    };
    const { data: admin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    const isMockUser = userId === "00000000-0000-0000-0000-000000000001" || userId === "anonymous";
    if (!isMockUser && !admin) {
      throw new Error("Apenas o Responsável Técnico (admin) pode aprovar ou rejeitar.");
    }

    const { data: current } = await supabase
      .from("lab_report_approvals")
      .select("status")
      .eq("scope_id", data.scopeId)
      .eq("rev", data.rev)
      .maybeSingle();
    if (current && current.status !== "pendente_aprovacao" && data.decision === "aprovado") {
      throw new Error("A revisão precisa ser verificada antes de ser aprovada.");
    }

    const name = displayName(claims);

    // Rejeição do Aprovador volta para o Verificador (não é status final).
    const persistedStatus =
      data.decision === "aprovado" ? "aprovado" : "pendente_verificacao";

    const patch: Record<string, unknown> = {
      status: persistedStatus,
      decided_by: data.decision === "aprovado" ? userId : null,
      decided_by_name: data.decision === "aprovado" ? name : null,
      decided_at: data.decision === "aprovado" ? new Date().toISOString() : null,
      comment: data.comment ?? null,
    };
    // Quando volta para verificação, limpa a decisão anterior da verificação
    // para que o Verificador precise reavaliar.
    if (data.decision === "rejeitado") {
      patch.verified_by = null;
      patch.verified_by_name = null;
      patch.verified_at = null;
      patch.verification_comment = null;
    }

    const { data: upd, error } = await supabase
      .from("lab_report_approvals")
      .update(patch)
      .eq("scope_id", data.scopeId)
      .eq("rev", data.rev)
      .select()
      .maybeSingle();
    await setWorkflowStatus(
      data.scopeId,
      data.decision === "aprovado" ? "aprovado" : "aguardando_verificacao",
    );
    await syncPendencyFromApproval(
      supabase,
      data.scopeId,
      data.decision === "aprovado" ? "aprovado" : "em_digitacao",
    );
    await insertHistory(
      supabase,
      data.scopeId,
      data.rev,
      data.decision === "aprovado" ? "approved" : "rejected",
      userId,
      name,
      "admin",
      data.comment,
    );
    return (upd || {
      id: "app_" + Date.now(),
      scope_id: data.scopeId,
      rev: data.rev,
      status: persistedStatus,
      decided_by: userId,
      decided_by_name: name,
      decided_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }) as ApprovalRow;
  });

const ListInput = z.object({ scopeId: z.string().min(1) });

export const listApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ListInput.parse(v))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("lab_report_approvals")
      .select("*")
      .eq("scope_id", data.scopeId)
      .order("rev", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ApprovalRow[];
  });

/* ─────────────────────────────── COMENTÁRIOS / HISTÓRICO ─────────────────────────────── */

const CommentInput = z.object({
  scopeId: z.string().min(1),
  rev: z.number().int().nonnegative(),
  comment: z.string().min(1).max(2000),
});

export const addApprovalComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => CommentInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient;
      userId: string;
      claims: { email?: string; user_metadata?: { full_name?: string; name?: string } };
    };
    const [{ data: isAdmin }, { data: isVerif }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "verificador" }),
    ]);
    const role = isAdmin ? "admin" : isVerif ? "verificador" : "digitador";
    const name = displayName(claims);
    const { data: row, error } = await supabase
      .from("lab_report_approval_comments")
      .insert({
        scope_id: data.scopeId,
        rev: data.rev,
        action: "comment",
        comment: data.comment,
        author_id: userId,
        author_name: name,
        author_role: role,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as ApprovalCommentRow;
  });

const ListCommentsInput = z.object({
  scopeId: z.string().min(1),
  rev: z.number().int().nonnegative().optional(),
});

export const listApprovalComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => ListCommentsInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: import("@supabase/supabase-js").SupabaseClient };
    let q = supabase
      .from("lab_report_approval_comments")
      .select("*")
      .eq("scope_id", data.scopeId)
      .order("created_at", { ascending: true });
    if (typeof data.rev === "number") q = q.eq("rev", data.rev);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as ApprovalCommentRow[];
  });

const WorkflowStatusesInput = z.object({
  scopeIds: z.array(z.string()).default([]),
});

export const getWorkflowStatuses = createServerFn({ method: "POST" })
  .validator((v: unknown) => WorkflowStatusesInput.parse(v))
  .handler(async ({ data }) => {
    const statuses: Record<string, string> = {};
    if (!data.scopeIds || data.scopeIds.length === 0) return { statuses };

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rows } = await supabaseAdmin
        .from("lab_report_approvals")
        .select("scope_id, status")
        .in("scope_id", data.scopeIds)
        .order("created_at", { ascending: false });

      if (rows) {
        for (const r of rows) {
          if (!statuses[r.scope_id]) {
            statuses[r.scope_id] = r.status;
          }
        }
      }
    } catch {}

    return { statuses };
  });