/**
 * Central de Emissões — listagem global de aprovações para admin/verificador,
 * enriquecida com metadados de OS/Amostra/Ensaio via `lab_index`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { ApprovalRow } from "./approvals.functions";

export interface EmissaoRow {
  /** null quando ensaio está apenas em "digitacao" e ainda não gerou nenhuma revisão. */
  id: string | null;
  scope_id: string;
  rev: number | null;
  status: string; // status da última revisão OU "digitacao" quando não há revisão
  workflow_status: string; // status do fluxo no lab_index
  requested_by: string | null;
  requested_by_name: string | null;
  requested_at: string | null;
  verified_by: string | null;
  verified_by_name: string | null;
  verified_at: string | null;
  verification_comment: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  comment: string | null;
  filename: string | null;
  os_numero: string | null;
  os_cliente: string | null;
  amostra_code: string | null;
  ensaio_tipo: string | null;
  ensaio_nome: string | null;
  updated_at: string | null;
  pendencia_created_at: string | null;
  pendencia_started_at: string | null;
  pendencia_finished_at: string | null;
  digitador_nome: string | null;
}

const Input = z.object({
  /** filtro por workflow_status do lab_index. */
  workflowStatuses: z.array(z.string()).optional(),
});

export const listEmissoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => Input.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient;
      userId: string;
    };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Base: lab_index (todos os ensaios registrados)
      let idxQ = supabaseAdmin
        .from("lab_index")
        .select("*")
        .like("scope_id", "os/%")
        .order("updated_at", { ascending: false });
      if (data.workflowStatuses && data.workflowStatuses.length > 0) {
        idxQ = idxQ.in("workflow_status", data.workflowStatuses as never);
      }
      const { data: idxRows, error } = await idxQ;
      if (error) {
        console.warn("[listEmissoes] Erro ao consultar lab_index:", error.message);
        return [] as EmissaoRow[];
      }
      const rows = (idxRows ?? []) as Array<Record<string, unknown>>;
      if (rows.length === 0) return [] as EmissaoRow[];

    const scopeIds = rows.map((r) => String(r.scope_id));
    const osAmostraPairs = rows
      .map((r) => ({ os: String(r.os_numero ?? ""), amostra: String(r.amostra_code ?? "") }))
      .filter((r) => r.os && r.amostra);
    const { data: approvals } = await supabaseAdmin
      .from("lab_report_approvals")
      .select("*")
      .in("scope_id", scopeIds)
      .order("rev", { ascending: false });
    const osList = Array.from(new Set(osAmostraPairs.map((r) => r.os)));
    const { data: pendencias } = osList.length
      ? await supabaseAdmin
          .from("lab_pendencias_digitacao")
          .select("os, amostra, created_at, updated_at, status, payload, digitador_user_id")
          .in("os", osList)
      : { data: [] };
    // última revisão por scope
    const latest = new Map<string, ApprovalRow>();
    for (const a of ((approvals ?? []) as ApprovalRow[])) {
      if (!latest.has(a.scope_id)) latest.set(a.scope_id, a);
    }
    const pendByKey = new Map<string, Record<string, unknown>>();
    const digitadorIds = new Set<string>();
    for (const p of (pendencias ?? []) as Array<Record<string, unknown>>) {
      const key = `${String(p.os ?? "")}::${String(p.amostra ?? "")}`;
      if (!pendByKey.has(key)) pendByKey.set(key, p);
      if (p.digitador_user_id) digitadorIds.add(String(p.digitador_user_id));
    }
    const { data: profiles } = digitadorIds.size
      ? await supabaseAdmin.from("profiles").select("id,nome,email").in("id", Array.from(digitadorIds))
      : { data: [] };
    const nameById = new Map<string, string>();
    for (const p of (profiles ?? []) as Array<Record<string, unknown>>) {
      nameById.set(String(p.id), String(p.nome || p.email || ""));
    }

    return rows.map((r) => {
      const scopeId = String(r.scope_id);
      const a = latest.get(scopeId);
      const pend = pendByKey.get(`${String(r.os_numero ?? "")}::${String(r.amostra_code ?? "")}`);
      const digitadorId = pend?.digitador_user_id ? String(pend.digitador_user_id) : null;
      const payload = pend?.payload && typeof pend.payload === "object" && !Array.isArray(pend.payload)
        ? (pend.payload as Record<string, unknown>)
        : {};
      const startedAt = typeof payload.digitacao_started_at === "string" ? payload.digitacao_started_at : null;
      const finishedAt = typeof payload.digitacao_finished_at === "string" ? payload.digitacao_finished_at : null;
      return {
        id: a?.id ?? null,
        scope_id: scopeId,
        rev: a?.rev ?? null,
        status: a?.status ?? "digitacao",
        workflow_status: String(r.workflow_status ?? "digitacao"),
        requested_by: a?.requested_by ?? null,
        requested_by_name: a?.requested_by_name ?? null,
        requested_at: a?.requested_at ?? null,
        verified_by: a?.verified_by ?? null,
        verified_by_name: a?.verified_by_name ?? null,
        verified_at: a?.verified_at ?? null,
        verification_comment: a?.verification_comment ?? null,
        decided_by: a?.decided_by ?? null,
        decided_by_name: a?.decided_by_name ?? null,
        decided_at: a?.decided_at ?? null,
        comment: a?.comment ?? null,
        filename: a?.filename ?? null,
        os_numero: (r.os_numero as string | null) ?? null,
        os_cliente: (r.os_cliente as string | null) ?? null,
        amostra_code: (r.amostra_code as string | null) ?? null,
        ensaio_tipo: (r.ensaio_tipo as string | null) ?? null,
        ensaio_nome: (r.ensaio_nome as string | null) ?? null,
        updated_at: (r.updated_at as string | null) ?? null,
        pendencia_created_at: (pend?.created_at as string | null) ?? null,
        pendencia_started_at: startedAt,
        pendencia_finished_at: finishedAt ?? a?.requested_at ?? null,
        digitador_nome: digitadorId ? nameById.get(digitadorId) ?? null : null,
      };
    }) as EmissaoRow[];
  } catch (err) {
    console.warn("[listEmissoes] Erro capturado:", err);
    return [] as EmissaoRow[];
  }
});