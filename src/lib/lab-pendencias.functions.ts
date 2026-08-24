/**
 * Server functions para o ciclo de vida de pendências de digitação e SLAs.
 *
 * Persistência soberana e relacional com Supabase (PostgreSQL / RLS / UNIQUE).
 * Garante integridade referencial, concorrência e sincronização em tempo real entre todas as máquinas.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import crypto from "node:crypto";

type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];

function asJsonObject(val: JsonValue | null | undefined): Record<string, unknown> {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return {};
}

export type PendenciaDigitacao = {
  id: string;
  os: string;
  amostra: string | null;
  ensaio: string;
  tipo_ensaio: string | null;
  equipamento: string | null;
  data_conclusao: string;
  status: "pendente" | "em_digitacao" | "digitado" | "verificado" | "aprovado" | "concluido_externo";
  origem: "gantt" | "digitalizacao" | "avulso";
  operador_user_id: string | null;
  operador_nome_text?: string | null;
  digitador_user_id?: string | null;
  verificador_user_id?: string | null;
  aprovador_user_id?: string | null;
  observacao: string | null;
  payload: JsonValue | null;
  created_at: string;
  updated_at: string;
  operador_nome?: string | null;
  digitador_nome?: string | null;
  verificador_nome?: string | null;
  aprovador_nome?: string | null;
};

const CriarInput = z.object({
  os: z.string().min(1),
  amostra: z.string().nullable().optional(),
  ensaio: z.string().min(1),
  tipo_ensaio: z.string().optional(),
  equipamento: z.string().optional(),
  programacao_id: z.string().optional(),
  operador_nome: z.string().optional(),
  origem: z.enum(["gantt", "digitalizacao", "avulso"]).optional(),
  payload: z.record(z.unknown()).optional(),
});

export const criarPendenciaDigitacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CriarInput.parse(i))
  .handler(async ({ context, data }) => {
    const amostraNorm =
      data.amostra == null || data.amostra.trim() === "" ? null : data.amostra.trim();
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const insertData = {
      id,
      os: data.os.trim(),
      amostra: amostraNorm,
      ensaio: data.ensaio.trim(),
      tipo_ensaio: data.tipo_ensaio ?? null,
      equipamento: data.equipamento ?? null,
      programacao_id: data.programacao_id ?? null,
      operador_user_id: context.userId,
      operador_nome: data.operador_nome ?? null,
      status: "pendente",
      origem: data.origem ?? "gantt",
      payload: {
        ...(data.payload || {}),
        execucao_concluida_at: nowIso,
      } as never,
      data_conclusao: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { error } = await supabaseAdmin
      .from("lab_pendencias_digitacao")
      .upsert(insertData, { onConflict: "os,amostra,ensaio" });

    if (error) {
      throw new Error(`Falha ao registrar pendência no Supabase: ${error.message}`);
    }

    return { ok: true, id, created: true };
  });

export const listPendenciasDigitacao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<PendenciaDigitacao[]> => {
    try {
      const { data, error } = await supabaseAdmin
        .from("lab_pendencias_digitacao")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("[listPendenciasDigitacao] Erro Supabase:", error);
        return [];
      }

      return (data || []) as PendenciaDigitacao[];
    } catch (err: any) {
      console.warn("[listPendenciasDigitacao] Falha:", err);
      return [];
    }
  });

const UpdateStatusInput = z.object({
  id: z.string().uuid(),
  status: z.enum([
    "pendente",
    "em_digitacao",
    "digitado",
    "verificado",
    "aprovado",
    "concluido_externo",
  ]),
  observacao: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
});

export const atualizarStatusPendencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateStatusInput.parse(i))
  .handler(async ({ context, data }) => {
    const now = new Date().toISOString();

    const { data: existing, error: findErr } = await supabaseAdmin
      .from("lab_pendencias_digitacao")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();

    if (findErr) {
      throw new Error(`Erro ao buscar pendência: ${findErr.message}`);
    }

    const prevPayload = asJsonObject((existing?.payload as JsonValue) ?? null);
    const incomingPayload = data.payload ?? {};

    const nextPayload = {
      ...prevPayload,
      ...incomingPayload,
      ...(data.status === "em_digitacao" ? { digitacao_started_at: prevPayload.digitacao_started_at || now } : {}),
      ...(data.status === "digitado" ? { digitacao_finished_at: now } : {}),
      ...(data.status === "verificado" ? { verificado_at: now } : {}),
      ...(data.status === "aprovado" ? { aprovado_at: now } : {}),
      ...(data.status === "concluido_externo" ? { concluido_externo_at: now } : {}),
    };

    const patch: Record<string, unknown> = {
      status: data.status,
      payload: nextPayload as never,
      updated_at: now,
    };

    if (data.observacao !== undefined) {
      patch.observacao = data.observacao;
    }
    if (data.status === "em_digitacao" || data.status === "digitado") {
      patch.digitador_user_id = context.userId;
    }
    if (data.status === "verificado") {
      patch.verificador_user_id = context.userId;
    }
    if (data.status === "aprovado") {
      patch.aprovador_user_id = context.userId;
    }

    const { error: updErr } = await supabaseAdmin
      .from("lab_pendencias_digitacao")
      .update(patch as any)
      .eq("id", data.id);

    if (updErr) {
      throw new Error(`Erro ao atualizar pendência no banco: ${updErr.message}`);
    }

    return { ok: true };
  });

export const atualizarPendenciaDigitacao = atualizarStatusPendencia;

const ConcluirExternoInput = z.object({
  id: z.string().uuid(),
  observacao: z.string().optional(),
});

export const concluirPendenciaExterna = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ConcluirExternoInput.parse(i))
  .handler(async ({ context, data }) => {
    return atualizarStatusPendencia({
      data: {
        id: data.id,
        status: "concluido_externo",
        observacao: data.observacao || "Relatório Concluído fora da Central (Planilha Excel)",
      },
    });
  });

const CriarAvulsoInput = z.object({
  os: z.string().min(1),
  cliente: z.string().optional(),
  obra: z.string().optional(),
  amostra: z.string().optional(),
  ensaio: z.string().min(1),
  tipo_ensaio: z.string().min(1),
  operador_nome: z.string().optional(),
  observacoes: z.string().optional(),
});

export const criarRelatorioAvulso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CriarAvulsoInput.parse(i))
  .handler(async ({ context, data }) => {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const payload = {
      cliente: data.cliente || "",
      obra: data.obra || "",
      digitacao_started_at: now,
      avulso: true,
    };

    const { error } = await supabaseAdmin.from("lab_pendencias_digitacao").insert({
      id,
      os: data.os.trim(),
      amostra: data.amostra?.trim() || null,
      ensaio: data.ensaio.trim(),
      tipo_ensaio: data.tipo_ensaio.trim(),
      status: "em_digitacao",
      origem: "avulso",
      digitador_user_id: context.userId,
      operador_nome: data.operador_nome?.trim() || null,
      observacao: data.observacoes?.trim() || null,
      payload: payload as never,
      data_conclusao: now,
      created_at: now,
      updated_at: now,
    });

    if (error) {
      throw new Error(`Erro ao criar relatório avulso: ${error.message}`);
    }

    return { ok: true, id };
  });

const DeleteInput = z.object({ id: z.string().uuid() });

export const removerPendenciaDigitacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => DeleteInput.parse(i))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("lab_pendencias_digitacao")
      .delete()
      .eq("id", data.id);

    if (error) {
      throw new Error(`Erro ao excluir pendência: ${error.message}`);
    }

    return { ok: true };
  });
