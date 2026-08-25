/**
 * Persistência do labStore em tabelas relacionais no Supabase (lab_os,
 * lab_amostras, lab_ensaios) — uma linha por entidade, em vez do antigo
 * arquivo único `_lab-state.json` no Google Drive sobrescrito por inteiro
 * a cada mudança. Cada função aqui grava/lê SÓ a entidade específica,
 * eliminando a colisão entre usuários mexendo em OS/amostras/ensaios
 * diferentes ao mesmo tempo.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Amostra, Coords, Ensaio, EnsaioStatus, EnsaioTipo, LabState, OS, Photo } from "@/features/lab/types";

type SerializableJson =
  | string
  | number
  | boolean
  | null
  | SerializableJson[]
  | { [key: string]: SerializableJson };

function toSerializableJson(value: unknown): SerializableJson | undefined {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as SerializableJson;
  } catch {
    return undefined;
  }
}

type OSRow = {
  id: string;
  numero: string;
  client: string | null;
  work_number: string | null;
  local: string | null;
  operator: string | null;
  technical_resp: string | null;
  revision: string | null;
  created_at: string;
  updated_at: string;
};

type AmostraRow = {
  id: string;
  os_id: string;
  report_number: string | null;
  borehole: string | null;
  depth: string | null;
  description: string | null;
  granulometric_description: string | null;
  code: string | null;
  sample_type: string | null;
  material_type: string | null;
  coords: Coords | null;
  photos: Photo[] | null;
  created_at: string;
  updated_at: string;
};

type EnsaioRow = {
  id: string;
  amostra_id: string;
  tipo: string;
  status: string | null;
  label: string | null;
  nome: string | null;
  sigla: string | null;
  operator: string | null;
  photos: Photo[] | null;
  payload: unknown;
  created_at: string;
  updated_at: string;
};

function osFromRow(r: OSRow): Omit<OS, "amostras"> {
  return {
    id: r.id,
    numero: r.numero,
    client: r.client ?? undefined,
    workNumber: r.work_number ?? undefined,
    local: r.local ?? undefined,
    operator: r.operator ?? undefined,
    technicalResp: r.technical_resp ?? undefined,
    revision: r.revision ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function amostraFromRow(r: AmostraRow): Omit<Amostra, "ensaios"> {
  return {
    id: r.id,
    reportNumber: r.report_number ?? undefined,
    borehole: r.borehole ?? undefined,
    depth: r.depth ?? undefined,
    description: r.description ?? undefined,
    granulometricDescription: r.granulometric_description ?? undefined,
    code: r.code ?? undefined,
    sampleType: r.sample_type ?? undefined,
    materialType: r.material_type ?? undefined,
    coords: r.coords ?? undefined,
    photos: r.photos ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

type SerializableEnsaio = Omit<Ensaio, "payload"> & { payload?: SerializableJson };

function ensaioFromRow(r: EnsaioRow): SerializableEnsaio {
  return {
    id: r.id,
    tipo: r.tipo as EnsaioTipo,
    status: (r.status as EnsaioStatus) || "rascunho",
    label: r.label ?? undefined,
    nome: r.nome ?? undefined,
    sigla: r.sigla ?? undefined,
    operator: r.operator ?? undefined,
    photos: r.photos ?? [],
    payload: toSerializableJson(r.payload),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

type SerializableAmostra = Omit<Amostra, "ensaios"> & { ensaios: SerializableEnsaio[] };
type SerializableOS = Omit<OS, "amostras"> & { amostras: SerializableAmostra[] };

export const loadLabTree = createServerFn({ method: "GET" }).handler(async (): Promise<{ state: { os: SerializableOS[] } | null }> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [osRes, amRes, enRes] = await Promise.all([
    supabaseAdmin.from("lab_os").select("*").order("created_at", { ascending: false }),
    supabaseAdmin.from("lab_amostras").select("*"),
    supabaseAdmin.from("lab_ensaios").select("*"),
  ]);

  if (osRes.error) throw new Error(`Falha ao carregar OS: ${osRes.error.message}`);
  if (amRes.error) throw new Error(`Falha ao carregar amostras: ${amRes.error.message}`);
  if (enRes.error) throw new Error(`Falha ao carregar ensaios: ${enRes.error.message}`);

  const osRows = (osRes.data || []) as OSRow[];
  if (osRows.length === 0) {
    // Tabelas ainda vazias (antes da migração dos dados legados, ou instalação nova).
    return { state: null };
  }

  const ensaiosByAmostra = new Map<string, SerializableEnsaio[]>();
  for (const r of (enRes.data || []) as EnsaioRow[]) {
    const list = ensaiosByAmostra.get(r.amostra_id) ?? [];
    list.push(ensaioFromRow(r));
    ensaiosByAmostra.set(r.amostra_id, list);
  }

  const amostrasByOS = new Map<string, SerializableAmostra[]>();
  for (const r of (amRes.data || []) as AmostraRow[]) {
    const list = amostrasByOS.get(r.os_id) ?? [];
    list.push({ ...amostraFromRow(r), ensaios: ensaiosByAmostra.get(r.id) ?? [] });
    amostrasByOS.set(r.os_id, list);
  }

  const os: SerializableOS[] = osRows.map((r) => ({ ...osFromRow(r), amostras: amostrasByOS.get(r.id) ?? [] }));
  return { state: { os } };
});

/* ─────────────────────────────── OS ─────────────────────────────── */

const OSInput = z.object({
  id: z.string().min(1),
  numero: z.string(),
  client: z.string().optional(),
  workNumber: z.string().optional(),
  local: z.string().optional(),
  operator: z.string().optional(),
  technicalResp: z.string().optional(),
  revision: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const upsertOSFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => OSInput.parse(v))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("lab_os").upsert({
      id: data.id,
      numero: data.numero,
      client: data.client ?? null,
      work_number: data.workNumber ?? null,
      local: data.local ?? null,
      operator: data.operator ?? null,
      technical_resp: data.technicalResp ?? null,
      revision: data.revision ?? null,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
    });
    if (error) throw new Error(`Falha ao salvar OS: ${error.message}`);
    return { ok: true };
  });

const DeleteOSInput = z.object({ id: z.string().min(1) });
export const deleteOSFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => DeleteOSInput.parse(v))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("lab_os").delete().eq("id", data.id);
    if (error) throw new Error(`Falha ao excluir OS: ${error.message}`);
    return { ok: true };
  });

/* ─────────────────────────────── Amostra ─────────────────────────────── */

const AmostraInput = z.object({
  id: z.string().min(1),
  osId: z.string().min(1),
  reportNumber: z.string().optional(),
  borehole: z.string().optional(),
  depth: z.string().optional(),
  description: z.string().optional(),
  granulometricDescription: z.string().optional(),
  code: z.string().optional(),
  sampleType: z.string().optional(),
  materialType: z.string().optional(),
  coords: z.record(z.unknown()).nullable().optional(),
  photos: z.array(z.record(z.unknown())).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const upsertAmostraFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => AmostraInput.parse(v))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("lab_amostras").upsert({
      id: data.id,
      os_id: data.osId,
      report_number: data.reportNumber ?? null,
      borehole: data.borehole ?? null,
      depth: data.depth ?? null,
      description: data.description ?? null,
      granulometric_description: data.granulometricDescription ?? null,
      code: data.code ?? null,
      sample_type: data.sampleType ?? null,
      material_type: data.materialType ?? null,
      coords: (data.coords ?? null) as never,
      photos: (data.photos ?? []) as never,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
    });
    if (error) throw new Error(`Falha ao salvar amostra: ${error.message}`);
    return { ok: true };
  });

const DeleteAmostraInput = z.object({ id: z.string().min(1) });
export const deleteAmostraFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => DeleteAmostraInput.parse(v))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("lab_amostras").delete().eq("id", data.id);
    if (error) throw new Error(`Falha ao excluir amostra: ${error.message}`);
    return { ok: true };
  });

/* ─────────────────────────────── Ensaio ─────────────────────────────── */

const EnsaioInput = z.object({
  id: z.string().min(1),
  amostraId: z.string().min(1),
  tipo: z.string(),
  status: z.string().optional(),
  label: z.string().optional(),
  nome: z.string().optional(),
  sigla: z.string().optional(),
  operator: z.string().optional(),
  photos: z.array(z.record(z.unknown())).optional(),
  payload: z.unknown().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const upsertEnsaioFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => EnsaioInput.parse(v))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("lab_ensaios").upsert({
      id: data.id,
      amostra_id: data.amostraId,
      tipo: data.tipo,
      status: data.status ?? null,
      label: data.label ?? null,
      nome: data.nome ?? null,
      sigla: data.sigla ?? null,
      operator: data.operator ?? null,
      photos: (data.photos ?? []) as never,
      payload: (data.payload ?? null) as never,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
    });
    if (error) throw new Error(`Falha ao salvar ensaio: ${error.message}`);
    return { ok: true };
  });

const DeleteEnsaioInput = z.object({ id: z.string().min(1) });
export const deleteEnsaioFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => DeleteEnsaioInput.parse(v))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("lab_ensaios").delete().eq("id", data.id);
    if (error) throw new Error(`Falha ao excluir ensaio: ${error.message}`);
    return { ok: true };
  });
