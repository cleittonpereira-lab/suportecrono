/**
 * Server functions para a ponte Gantt -> Relatório (Pendências de Digitação).
 * Quando um ensaio é concluído no Gantt/Scan, uma linha é criada em
 * `lab_pendencias_digitacao` para o digitador do laboratório.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// JSON serializável — necessário para o TanStack aceitar como retorno de server fn.
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

function asJsonObject(value: JsonValue | null | undefined): Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, JsonValue>;
}

const CriarInput = z.object({
  os: z.string().min(1),
  amostra: z.string().nullable().optional(),
  ensaio: z.string().min(1),
  tipo_ensaio: z.string().nullable().optional(),
  equipamento: z.string().nullable().optional(),
  programacao_id: z.string().uuid().nullable().optional(),
  origem: z.enum(["gantt", "digitalizacao"]).optional(),
  // Nome do operador que executou o ensaio (ex.: técnico definido na
  // programação do Gantt). Preserva o autor mesmo quando quem clica em
  // "Concluir" é o supervisor.
  operador_nome: z.string().nullable().optional(),
  // Dados brutos coletados (ex.: determinações M.ESP.A). Salvos em `payload`
  // para que o relatório abra pré-preenchido em qualquer dispositivo.
  payload: z.record(z.string(), z.any()).nullable().optional() as z.ZodType<JsonValue | undefined | null>,
});

export const criarPendenciaDigitacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CriarInput.parse(i))
  .handler(async ({ context, data }) => {
    // Upsert por (os, amostra, ensaio) — só cria se não existir.
    // Normaliza amostra: strings vazias viram NULL para casar com o que
    // realmente é persistido no banco (evita duplicatas quando um caller
    // manda "" e outro manda null para a mesma OS/ensaio).
    const amostraNorm =
      data.amostra == null || data.amostra.trim() === "" ? null : data.amostra.trim();
    const lookup = context.supabase
      .from("lab_pendencias_digitacao")
      .select("id")
      .eq("os", data.os)
      .eq("ensaio", data.ensaio);
    const { data: existing } = await (amostraNorm === null
      ? lookup.is("amostra", null)
      : lookup.eq("amostra", amostraNorm)
    ).maybeSingle();
    if (existing?.id) {
      // Já existia (ex.: pendência criada pelo Gantt); só atualiza payload
      // quando veio da digitalização, sem sobrescrever status/origem.
      if (data.payload !== undefined) {
        await context.supabase
          .from("lab_pendencias_digitacao")
          .update({ payload: data.payload as never })
          .eq("id", existing.id);
      }
      return { ok: true, id: existing.id, created: false };
    }
    const { data: inserted, error } = await context.supabase
      .from("lab_pendencias_digitacao")
      .insert({
        os: data.os,
        amostra: amostraNorm,
        ensaio: data.ensaio,
        tipo_ensaio: data.tipo_ensaio ?? null,
        equipamento: data.equipamento ?? null,
        programacao_id: data.programacao_id ?? null,
        operador_user_id: context.userId,
        operador_nome: data.operador_nome ?? null,
        status: "pendente",
        origem: data.origem ?? "gantt",
        payload: (data.payload ?? null) as never,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id, created: true };
  });

export type PendenciaDigitacao = {
  id: string;
  os: string;
  amostra: string | null;
  ensaio: string;
  tipo_ensaio: string | null;
  equipamento: string | null;
  data_conclusao: string;
  status: "pendente" | "em_digitacao" | "digitado" | "verificado" | "aprovado";
  origem: "gantt" | "digitalizacao";
  operador_user_id: string | null;
  operador_nome_text?: string | null;
  digitador_user_id: string | null;
  verificador_user_id: string | null;
  aprovador_user_id: string | null;
  observacao: string | null;
  payload: JsonValue | null;
  created_at: string;
  updated_at: string;
  operador_nome?: string | null;
  digitador_nome?: string | null;
  verificador_nome?: string | null;
  aprovador_nome?: string | null;
};

export const listPendenciasDigitacao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendenciaDigitacao[]> => {
    const { data, error } = await context.supabase
      .from("lab_pendencias_digitacao")
      .select("*")
      .order("data_conclusao", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as PendenciaDigitacao[];
    const ids = new Set<string>();
    for (const r of rows) {
      if (r.operador_user_id) ids.add(r.operador_user_id);
      if (r.digitador_user_id) ids.add(r.digitador_user_id);
      if (r.verificador_user_id) ids.add(r.verificador_user_id);
      if (r.aprovador_user_id) ids.add(r.aprovador_user_id);
    }
    if (ids.size === 0) return rows;
    const { data: profs } = await context.supabase
      .from("profiles")
      .select("id, nome, email")
      .in("id", Array.from(ids));
    const nameById = new Map<string, string>();
    for (const p of profs ?? []) {
      nameById.set(p.id as string, (p.nome as string) || (p.email as string) || "—");
    }
    return rows.map((r) => {
      // Prioriza o nome explícito do operador (vindo da programação /
      // técnico responsável). Só cai no perfil do usuário logado se o
      // nome não foi passado — evita mostrar o supervisor no lugar de
      // quem executou.
      const operadorExplicit = (r as unknown as { operador_nome?: string | null }).operador_nome ?? null;
      return {
        ...r,
        operador_nome:
          (operadorExplicit && operadorExplicit.trim()) ||
          (r.operador_user_id ? nameById.get(r.operador_user_id) ?? null : null),
        digitador_nome: r.digitador_user_id ? nameById.get(r.digitador_user_id) ?? null : null,
        verificador_nome: r.verificador_user_id ? nameById.get(r.verificador_user_id) ?? null : null,
        aprovador_nome: r.aprovador_user_id ? nameById.get(r.aprovador_user_id) ?? null : null,
      };
    });
  });

const AtualizarInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["pendente", "em_digitacao", "digitado", "verificado", "aprovado"]),
  observacao: z.string().nullable().optional(),
  payload: z.record(z.string(), z.any()).nullable().optional() as z.ZodType<JsonValue | undefined | null>,
});

export const atualizarPendenciaDigitacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AtualizarInput.parse(i))
  .handler(async ({ context, data }) => {
    const now = new Date().toISOString();
    const { data: existing } = await context.supabase
      .from("lab_pendencias_digitacao")
      .select("payload")
      .eq("id", data.id)
      .maybeSingle();
    const previousPayload = asJsonObject((existing?.payload as JsonValue | null | undefined) ?? null);
    const incomingPayload = data.payload !== undefined ? asJsonObject(data.payload) : previousPayload;
    let nextPayload: JsonValue | null | undefined = data.payload !== undefined ? data.payload : undefined;
    if (data.status === "em_digitacao") {
      nextPayload = {
        ...incomingPayload,
        digitacao_started_at: incomingPayload.digitacao_started_at ?? now,
      };
    }
    if (data.status === "digitado") {
      nextPayload = {
        ...incomingPayload,
        digitacao_started_at: incomingPayload.digitacao_started_at ?? now,
        digitacao_finished_at: incomingPayload.digitacao_finished_at ?? now,
      };
    }
    const patch: {
      status: typeof data.status;
      observacao?: string | null;
      digitador_user_id?: string;
      verificador_user_id?: string;
      aprovador_user_id?: string;
      payload?: JsonValue | null;
    } = { status: data.status };
    if (data.observacao !== undefined) patch.observacao = data.observacao;
    if (nextPayload !== undefined) patch.payload = nextPayload as JsonValue | null;
    if (data.status === "em_digitacao" || data.status === "digitado") patch.digitador_user_id = context.userId;
    if (data.status === "verificado") patch.verificador_user_id = context.userId;
    if (data.status === "aprovado") patch.aprovador_user_id = context.userId;
    const { error } = await context.supabase
      .from("lab_pendencias_digitacao")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const DeleteInput = z.object({ id: z.string().uuid() });

export const removerPendenciaDigitacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => DeleteInput.parse(i))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("lab_pendencias_digitacao")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });