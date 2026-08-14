/**
 * Central de Cápsulas — pesagens de umidade (inicial / tara / final).
 *
 * Fluxo típico:
 *   1. Operador A pesa a cápsula com solo úmido e registra `peso_inicial` +
 *      número. (opcional: tara já conhecida da cápsula seca vazia)
 *   2. No dia seguinte, Operador B procura a cápsula pelo número, o sistema
 *      lista TODAS as pendentes com aquele número (sem `peso_final`), e o
 *      operador escolhe a correta e digita `peso_final`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CriarInput = z.object({
  numero: z.string().min(1),
  os: z.string().nullable().optional(),
  amostra: z.string().nullable().optional(),
  tipo_ensaio: z.string().nullable().optional(),
  ensaio_codigo: z.string().nullable().optional(),
  determinacao: z.string().nullable().optional(),
  peso_inicial: z.number().nullable().optional(),
  peso_tara: z.number().nullable().optional(),
  pendencia_id: z.string().uuid().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  operador_nome: z.string().nullable().optional(),
});

export const criarCapsula = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CriarInput.parse(i))
  .handler(async ({ context, data }) => {
    const now = new Date().toISOString();
    const { data: row, error } = await context.supabase
      .from("lab_capsulas")
      .insert({
        numero: data.numero.trim(),
        os: data.os ?? null,
        amostra: data.amostra ?? null,
        tipo_ensaio: data.tipo_ensaio ?? null,
        ensaio_codigo: data.ensaio_codigo ?? null,
        determinacao: data.determinacao ?? null,
        peso_inicial: data.peso_inicial ?? null,
        peso_tara: data.peso_tara ?? null,
        data_inicial: data.peso_inicial != null ? now : null,
        data_tara: data.peso_tara != null ? now : null,
        operador_inicial_id: context.userId,
        operador_inicial_nome: data.operador_nome ?? null,
        pendencia_id: data.pendencia_id ?? null,
        observacoes: data.observacoes ?? null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

const AtualizarFinalInput = z.object({
  id: z.string().uuid(),
  peso_final: z.number(),
  peso_tara: z.number().nullable().optional(),
  operador_nome: z.string().nullable().optional(),
});

export const registrarPesagemFinal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AtualizarFinalInput.parse(i))
  .handler(async ({ context, data }) => {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      peso_final: data.peso_final,
      data_final: now,
      operador_final_id: context.userId,
      operador_final_nome: data.operador_nome ?? null,
    };
    if (data.peso_tara != null) {
      patch.peso_tara = data.peso_tara;
      patch.data_tara = now;
    }
    const { data: row, error } = await context.supabase
      .from("lab_capsulas")
      .update(patch as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

const AtualizarInput = z.object({
  id: z.string().uuid(),
  patch: z.record(z.string(), z.any()),
});

export const atualizarCapsula = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AtualizarInput.parse(i))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("lab_capsulas")
      .update(data.patch as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

const RemoverInput = z.object({ id: z.string().uuid() });
export const removerCapsula = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RemoverInput.parse(i))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("lab_capsulas").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listarCapsulas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("lab_capsulas")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw error;
    return data ?? [];
  });