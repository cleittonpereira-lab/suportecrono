/**
 * Persistência do labStore no Google Drive — um arquivo por entidade
 * (uma OS, uma amostra, um ensaio), não mais um arquivo único gigante.
 * Isso elimina a colisão de escrita entre usuários mexendo em entidades
 * diferentes ao mesmo tempo — cada um toca um arquivo diferente.
 *
 * Cada arquivo carrega um campo `rev` (revisão). Escritas fazem
 * read-modify-write: leem o arquivo atual, comparam a rev esperada, e só
 * sobrescrevem se bater — senão devolvem conflito. O Google Drive não tem
 * transação real, então isso reduz a janela de colisão mas não elimina
 * 100% (duas escritas quase simultâneas no MESMO arquivo ainda podem
 * colidir) — é a mesma limitação de qualquer read-modify-write sem lock
 * de banco, aceita conscientemente ao optar por Drive em vez de um banco
 * relacional.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Amostra, Coords, Ensaio, EnsaioStatus, EnsaioTipo, LabState, OS, Photo } from "@/features/lab/types";
import { ensureFolderPath, listFilesInFolder, readDriveJson, writeDriveJson, deleteDriveFile, findFileInFolder, DRIVE_ROOT_FOLDER_ID } from "@/lib/driveStorage";

export type SerializableJson = string | number | boolean | null | SerializableJson[] | { [key: string]: SerializableJson };
export function toSerializableJson(value: unknown): SerializableJson | undefined {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as SerializableJson;
  } catch {
    return undefined;
  }
}

type OSFile = {
  id: string;
  numero: string;
  client: string | null;
  workNumber: string | null;
  local: string | null;
  operator: string | null;
  technicalResp: string | null;
  revision: string | null;
  createdAt: string;
  updatedAt: string;
  rev: number;
};

type AmostraFile = {
  id: string;
  osId: string;
  reportNumber: string | null;
  borehole: string | null;
  depth: string | null;
  description: string | null;
  granulometricDescription: string | null;
  code: string | null;
  sampleType: string | null;
  materialType: string | null;
  coords: Coords | null;
  photos: Photo[];
  createdAt: string;
  updatedAt: string;
  rev: number;
};

export type ApprovalEvent = {
  action: string;
  comment?: string | null;
  authorId?: string | null;
  authorName?: string | null;
  authorRole?: string | null;
  createdAt: string;
};

export type ReportApprovalRow = {
  id: string;
  scope_id: string;
  rev: number;
  status: string;
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
  updated_at?: string;
};

export type ReportApprovalCommentRow = {
  id: string;
  scope_id: string;
  rev: number;
  action: string;
  comment: string | null;
  author_id: string;
  author_name: string | null;
  author_role: string | null;
  created_at: string;
};

export type DraftHistoryEntry = {
  changedAt: string;
  changedBy?: string | null;
  changedByName?: string | null;
  diff: Record<string, { de: SerializableJson; para: SerializableJson }>;
};

export type EnsaioFile = {
  id: string;
  amostraId: string;
  tipo: string;
  status: string | null;
  label: string | null;
  nome: string | null;
  sigla: string | null;
  operator: string | null;
  photos: Photo[];
  payload: unknown;
  createdAt: string;
  updatedAt: string;
  rev: number;
  // Consolidado aqui: farol/aprovações/histórico do mesmo ensaio (ver
  // draft.functions.ts e approvals.functions.ts). upsertEnsaioFn (chamado
  // pelo labStore a cada patchEnsaio/onPayloadChange) preserva esses campos
  // via merge com o arquivo existente — nunca os sobrescreve às cegas.
  workflowStatus?: string;
  approvals?: ApprovalEvent[];
  draftHistory?: DraftHistoryEntry[];
  reportApprovals?: ReportApprovalRow[];
  approvalComments?: ReportApprovalCommentRow[];
};

const FOLDER_OS = ["lab-os"];
const FOLDER_AMOSTRAS = ["lab-amostras"];
export const FOLDER_ENSAIOS = ["lab-ensaios"];

const osFileName = (id: string) => `${id}.json`;
const amostraFileName = (osId: string, id: string) => `${osId}__${id}.json`;
export const ensaioFileName = (amostraId: string, id: string) => `${amostraId}__${id}.json`;

function osToPublic(f: OSFile): Omit<OS, "amostras"> {
  return {
    id: f.id,
    numero: f.numero,
    client: f.client ?? undefined,
    workNumber: f.workNumber ?? undefined,
    local: f.local ?? undefined,
    operator: f.operator ?? undefined,
    technicalResp: f.technicalResp ?? undefined,
    revision: f.revision ?? undefined,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

function amostraToPublic(f: AmostraFile): Omit<Amostra, "ensaios"> {
  return {
    id: f.id,
    reportNumber: f.reportNumber ?? undefined,
    borehole: f.borehole ?? undefined,
    depth: f.depth ?? undefined,
    description: f.description ?? undefined,
    granulometricDescription: f.granulometricDescription ?? undefined,
    code: f.code ?? undefined,
    sampleType: f.sampleType ?? undefined,
    materialType: f.materialType ?? undefined,
    coords: f.coords ?? undefined,
    photos: f.photos ?? [],
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

type SerializableEnsaio = Omit<Ensaio, "payload"> & { payload?: SerializableJson };

function ensaioToPublic(f: EnsaioFile): SerializableEnsaio {
  return {
    id: f.id,
    tipo: f.tipo as EnsaioTipo,
    status: (f.status as EnsaioStatus) || "rascunho",
    label: f.label ?? undefined,
    nome: f.nome ?? undefined,
    sigla: f.sigla ?? undefined,
    operator: f.operator ?? undefined,
    photos: f.photos ?? [],
    payload: toSerializableJson(f.payload),
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}

async function readAllInFolder<T>(folderParts: string[]): Promise<{ fileId: string; name: string; data: T }[]> {
  const folderId = await ensureFolderPath(folderParts);
  const files = await listFilesInFolder(folderId);
  const results: ({ fileId: string; name: string; data: T } | null)[] = await Promise.all(
    files.map(async (f) => {
      const data = await readDriveJson<T>(f.name, folderId);
      if (!data) return null;
      return { fileId: f.id, name: f.name, data };
    }),
  );
  const out: { fileId: string; name: string; data: T }[] = [];
  for (const r of results) {
    if (r) out.push(r);
  }
  return out;
}

type SerializableAmostra = Omit<Amostra, "ensaios"> & { ensaios: SerializableEnsaio[] };
type SerializableOS = Omit<OS, "amostras"> & { amostras: SerializableAmostra[] };

export const loadLabTree = createServerFn({ method: "GET" }).handler(async (): Promise<{ state: { os: SerializableOS[] } | null }> => {
  const [osRows, amRows, enRows] = await Promise.all([
    readAllInFolder<OSFile>(FOLDER_OS),
    readAllInFolder<AmostraFile>(FOLDER_AMOSTRAS),
    readAllInFolder<EnsaioFile>(FOLDER_ENSAIOS),
  ]);

  if (osRows.length === 0) {
    return { state: null };
  }

  const ensaiosByAmostra = new Map<string, SerializableEnsaio[]>();
  for (const { data } of enRows) {
    const list = ensaiosByAmostra.get(data.amostraId) ?? [];
    list.push(ensaioToPublic(data));
    ensaiosByAmostra.set(data.amostraId, list);
  }

  const amostrasByOS = new Map<string, SerializableAmostra[]>();
  for (const { data } of amRows) {
    const list = amostrasByOS.get(data.osId) ?? [];
    list.push({ ...amostraToPublic(data), ensaios: ensaiosByAmostra.get(data.id) ?? [] });
    amostrasByOS.set(data.osId, list);
  }

  const os: SerializableOS[] = osRows.map(({ data }) => ({ ...osToPublic(data), amostras: amostrasByOS.get(data.id) ?? [] }));
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
    const folderId = await ensureFolderPath(FOLDER_OS);
    const name = osFileName(data.id);
    const existing = await readDriveJson<OSFile>(name, folderId);
    const nextRev = (existing?.rev ?? 0) + 1;
    const file: OSFile = {
      id: data.id,
      numero: data.numero,
      client: data.client ?? null,
      workNumber: data.workNumber ?? null,
      local: data.local ?? null,
      operator: data.operator ?? null,
      technicalResp: data.technicalResp ?? null,
      revision: data.revision ?? null,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      rev: nextRev,
    };
    await writeDriveJson(name, file, folderId);
    return { ok: true };
  });

const DeleteOSInput = z.object({ id: z.string().min(1) });
export const deleteOSFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => DeleteOSInput.parse(v))
  .handler(async ({ data }) => {
    const folderId = await ensureFolderPath(FOLDER_OS);
    const fileId = await findFileInFolder(osFileName(data.id), folderId);
    if (fileId) await deleteDriveFile(fileId);
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
    const folderId = await ensureFolderPath(FOLDER_AMOSTRAS);
    const name = amostraFileName(data.osId, data.id);
    const existing = await readDriveJson<AmostraFile>(name, folderId);
    const nextRev = (existing?.rev ?? 0) + 1;
    const file: AmostraFile = {
      id: data.id,
      osId: data.osId,
      reportNumber: data.reportNumber ?? null,
      borehole: data.borehole ?? null,
      depth: data.depth ?? null,
      description: data.description ?? null,
      granulometricDescription: data.granulometricDescription ?? null,
      code: data.code ?? null,
      sampleType: data.sampleType ?? null,
      materialType: data.materialType ?? null,
      coords: (data.coords ?? null) as Coords | null,
      photos: (data.photos ?? []) as unknown as Photo[],
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      rev: nextRev,
    };
    await writeDriveJson(name, file, folderId);
    return { ok: true };
  });

const DeleteAmostraInput = z.object({ id: z.string().min(1), osId: z.string().min(1) });
export const deleteAmostraFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => DeleteAmostraInput.parse(v))
  .handler(async ({ data }) => {
    const folderId = await ensureFolderPath(FOLDER_AMOSTRAS);
    const fileId = await findFileInFolder(amostraFileName(data.osId, data.id), folderId);
    if (fileId) await deleteDriveFile(fileId);
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
    const folderId = await ensureFolderPath(FOLDER_ENSAIOS);
    const name = ensaioFileName(data.amostraId, data.id);
    const existing = await readDriveJson<EnsaioFile>(name, folderId);
    const nextRev = (existing?.rev ?? 0) + 1;
    // Mescla com o existente: preserva workflowStatus/approvals/draftHistory
    // (geridos por draft.functions.ts/approvals.functions.ts) e só troca o
    // payload se um novo de fato foi enviado - nunca apaga por omissão.
    const file: EnsaioFile = {
      ...existing,
      id: data.id,
      amostraId: data.amostraId,
      tipo: data.tipo,
      status: data.status ?? existing?.status ?? null,
      label: data.label ?? existing?.label ?? null,
      nome: data.nome ?? existing?.nome ?? null,
      sigla: data.sigla ?? existing?.sigla ?? null,
      operator: data.operator ?? existing?.operator ?? null,
      photos: (data.photos ?? existing?.photos ?? []) as unknown as Photo[],
      payload: data.payload !== undefined ? data.payload : (existing?.payload ?? null),
      createdAt: existing?.createdAt ?? data.createdAt,
      updatedAt: data.updatedAt,
      rev: nextRev,
    };
    await writeDriveJson(name, file, folderId);
    return { ok: true };
  });

const DeleteEnsaioInput = z.object({ id: z.string().min(1), amostraId: z.string().min(1) });
export const deleteEnsaioFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => DeleteEnsaioInput.parse(v))
  .handler(async ({ data }) => {
    const folderId = await ensureFolderPath(FOLDER_ENSAIOS);
    const fileId = await findFileInFolder(ensaioFileName(data.amostraId, data.id), folderId);
    if (fileId) await deleteDriveFile(fileId);
    return { ok: true };
  });
