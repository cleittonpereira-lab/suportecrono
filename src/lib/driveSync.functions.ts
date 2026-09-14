/**
 * Sincronização com Google Drive (conta da Suporte).
 *
 * Estrutura no Drive (a partir da pasta raiz configurada):
 *   {OS} - {Cliente}/
 *     {AmostraCode}/
 *       {Ensaio}/
 *         relatorios/Rev-XX.pdf
 *         dados/ensaio.json
 *         fotos/CP{n}/*.jpg
 *         manifest.json
 */
import { exigirLogin, requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getGoogleAccessToken, isGoogleAuthConfigured } from "./google-auth.server";
// A resolução de nome→id vive só em `driveStorage`. Este módulo tinha a sua
// própria cópia de `findFolder`/`findFileInFolder`, com o mesmo defeito de
// pegar `files[0]` sem ordenação — e por isso duplicava pastas `relatorios`.
import { findFileInFolder, findFolder, withKeyLock } from "./driveStorage";

const DRIVE_V3 = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];

/** ID da pasta raiz oficial de relatórios da Suporte no Google Drive */
export const DRIVE_ROOT_FOLDER_ID = "0AB6VPuj1fWHEUk9PVA";

async function driveHeaders(extra: Record<string, string> = {}): Promise<Headers> {
  const h = new Headers(extra);
  const token = await getGoogleAccessToken(DRIVE_SCOPES);
  h.set("Authorization", `Bearer ${token}`);
  return h;
}

async function driveJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) throw new Error(`Drive ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function createFolder(name: string, parentId: string): Promise<string> {
  const data = await driveJson(`${DRIVE_V3}/files?fields=id&supportsAllDrives=true`, {
    method: "POST",
    headers: await driveHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  return data.id as string;
}

const driveFolderMemCache = new Map<string, string>();

async function ensureFolderPath(parts: string[]): Promise<string> {
  const pathKey = parts.filter(Boolean).map((p) => p.trim()).join("/");
  if (driveFolderMemCache.has(pathKey)) {
    return driveFolderMemCache.get(pathKey)!;
  }

  let parent = DRIVE_ROOT_FOLDER_ID;
  let currentAccum = "";

  for (const raw of parts) {
    const name = raw.trim();
    if (!name) continue;
    currentAccum = currentAccum ? `${currentAccum}/${name}` : name;

    if (driveFolderMemCache.has(currentAccum)) {
      parent = driveFolderMemCache.get(currentAccum)!;
      continue;
    }

    // Tenta ler do Supabase se disponível
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: cached } = await supabaseAdmin
        .from("drive_folder_cache")
        .select("folder_id")
        .eq("path", currentAccum)
        .maybeSingle();
      if (cached?.folder_id) {
        driveFolderMemCache.set(currentAccum, cached.folder_id);
        parent = cached.folder_id;
        continue;
      }
    } catch {}

    // Encadeia por caminho: duas requisições simultâneas para a mesma pasta não
    // podem mais buscar em paralelo, não achar e criar duas.
    const parentId = parent;
    const id = await withKeyLock(`folder:${currentAccum}`, async () => {
      const cached = driveFolderMemCache.get(currentAccum);
      if (cached) return cached;
      const found = await findFolder(name, parentId);
      return found ?? (await createFolder(name, parentId));
    });

    driveFolderMemCache.set(currentAccum, id);
    parent = id;

    // Grava no Supabase cache de forma assíncrona/não-bloqueante.
    // `parent_id` recebia `parent`, que nesta altura já tinha sido reatribuído
    // para o próprio `id` — a coluna guardava o id da própria pasta.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("drive_folder_cache").upsert({
        path: currentAccum,
        folder_id: id,
        parent_id: parentId,
        updated_at: new Date().toISOString(),
      });
    } catch {}
  }

  driveFolderMemCache.set(pathKey, parent);
  return parent;
}

/**
 * Lista os arquivos de uma pasta. Falha estoura: uma lista vazia no lugar do
 * erro era lida como "este ensaio não tem nenhuma revisão no Drive".
 */
async function listFilesInFolder(parentId: string): Promise<{ id: string; name: string }[]> {
  const q = `'${parentId}' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`;
  const url = `${DRIVE_V3}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent("files(id,name)")}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${DRIVE_ROOT_FOLDER_ID}`;
  const data = await driveJson(url, { method: "GET", headers: await driveHeaders() });
  return (data.files ?? []) as { id: string; name: string }[];
}

/**
 * Resolve um caminho de pastas SEM criar nada; `null` se algum trecho não
 * existir. Consultar o status de um ensaio usava `ensureFolderPath`, e toda
 * abertura de tela de relatório criava a árvore `{OS}/{amostra}/{ensaio}/
 * relatorios` no Drive — são as dezenas de pastas `relatorios` vazias que
 * existem lá. "A pasta não existe" volta a significar "esse ensaio nunca teve
 * revisão enviada", que é o que a tela precisa saber.
 */
async function resolveFolderPath(parts: string[]): Promise<string | null> {
  let parent = DRIVE_ROOT_FOLDER_ID;
  let acumulado = "";
  for (const raw of parts) {
    const name = raw.trim();
    if (!name) continue;
    acumulado = acumulado ? `${acumulado}/${name}` : name;
    const emCache = driveFolderMemCache.get(acumulado);
    if (emCache) {
      parent = emCache;
      continue;
    }
    const encontrada = await findFolder(name, parent);
    if (!encontrada) return null;
    driveFolderMemCache.set(acumulado, encontrada);
    parent = encontrada;
  }
  return parent;
}

/** Campos das entidades (OS, amostra, ensaio) que este módulo lê do Drive. */
type ArquivoLab = {
  numero?: string;
  client?: string;
  reportNumber?: string;
  code?: string;
  tipo?: string;
  label?: string;
  nome?: string;
  sigla?: string;
  reportApprovals?: { rev?: unknown }[];
};

/** Nomes das pastas `{OS}/{amostra}/{ensaio}` no Drive. */
function nomesDaPasta(i: {
  osNumero?: string | null;
  osCliente?: string | null;
  amostraCodigo?: string | null;
  ensaioTipo?: string | null;
  ensaioNome?: string | null;
}): string[] {
  const os = safeName(
    i.osNumero ? (i.osCliente ? `${i.osNumero} - ${i.osCliente}` : i.osNumero) : "OS-sem-numero",
    "OS-sem-numero",
  );
  const amostra = safeName(i.amostraCodigo || "Amostra-sem-codigo", "Amostra-sem-codigo");
  const tipo = i.ensaioTipo || "ensaio";
  const ensaio = safeName(i.ensaioNome ? `${tipo} - ${i.ensaioNome}` : tipo, "ensaio");
  return [os, amostra, ensaio];
}

/**
 * Pasta do ensaio calculada no servidor, a partir dos arquivos da OS, amostra
 * e ensaio — uma fonte só.
 *
 * Antes, o envio montava a pasta com o que cada tela mandava (o PERM.V mandava
 * o número da AMOSTRA como nome do ensaio, outras telas mandavam outras
 * coisas) e o status procurava a pasta com o nome gravado no arquivo. As duas
 * olhavam pastas diferentes, e o mesmo ensaio ganhava uma pasta nova a cada
 * variação de nome: é por isso que existem `asf-dap`, `asf-dap - Densidade
 * Aparente (ASF.DAP)` e `asf-dap - Densidade Aparente — ASF.DAP (DNIT ...)`
 * lado a lado no Drive. A descrição da amostra ficou de fora de propósito:
 * editá-la criava outra pasta.
 */
async function partesDaPastaDoEnsaio(scopeId: string): Promise<string[] | null> {
  const ids = parseScope(scopeId);
  if (!ids) return null;
  const { ensureFolderPath: ensureFolderPathShared, readDriveJson } = await import("@/lib/driveStorage");
  const os = await readDriveJson<ArquivoLab>(`${ids.osId}.json`, await ensureFolderPathShared(["lab-os"]));
  const am = await readDriveJson<ArquivoLab>(`${ids.osId}__${ids.amostraId}.json`, await ensureFolderPathShared(["lab-amostras"]));
  const en = await readDriveJson<ArquivoLab>(`${ids.amostraId}__${ids.ensaioId}.json`, await ensureFolderPathShared(["lab-ensaios"]));
  if (!os || !am || !en) return null;
  return nomesDaPasta({
    osNumero: os.numero,
    osCliente: os.client,
    amostraCodigo: am.reportNumber || am.code,
    ensaioTipo: en.tipo,
    ensaioNome: en.label || en.nome || en.sigla,
  });
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

async function uploadBytes(opts: {
  parentId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  overwrite?: boolean;
}): Promise<string> {
  if (!opts.overwrite) return uploadBytesNew(opts);
  // Mesma fila por (pasta, nome) usada em `driveStorage`: sem ela, dois
  // salvamentos simultâneos do mesmo relatório criavam dois arquivos.
  return withKeyLock(`${opts.parentId}:${opts.name}`, async () => {
    const existing = await findFileInFolder(opts.name, opts.parentId);
    return existing ? uploadBytesOverwrite(opts, existing) : uploadBytesNew(opts);
  });
}

/** Sobrescreve o conteúdo de um arquivo já existente, pelo seu fileId. */
async function uploadBytesOverwrite(
  opts: { mimeType: string; bytes: Uint8Array },
  existing: string,
): Promise<string> {
  const res = await fetch(`${DRIVE_UPLOAD}/${existing}?uploadType=media&fields=id&supportsAllDrives=true`, {
    method: "PATCH",
    headers: await driveHeaders({ "Content-Type": opts.mimeType }),
    body: opts.bytes as BodyInit,
  });
  if (!res.ok) throw new Error(`Drive update ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return existing;
}

/** Cria um arquivo novo na pasta. */
async function uploadBytesNew(opts: {
  parentId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<string> {
  const boundary = `----lovable${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name: opts.name, parents: [opts.parentId] });
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: ${opts.mimeType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.byteLength + opts.bytes.byteLength + tail.byteLength);
  body.set(head, 0);
  body.set(opts.bytes, head.byteLength);
  body.set(tail, head.byteLength + opts.bytes.byteLength);
  const res = await fetch(`${DRIVE_UPLOAD}?uploadType=multipart&fields=id&supportsAllDrives=true`, {
    method: "POST",
    headers: await driveHeaders({ "Content-Type": `multipart/related; boundary=${boundary}` }),
    body: body as BodyInit,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Drive upload ${res.status}: ${text.slice(0, 300)}`);
  return (JSON.parse(text) as { id: string }).id;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const PhotoSchema = z.object({
  cpId: z.string(),
  filename: z.string(),
  mimeType: z.string().default("image/jpeg"),
  base64: z.string(),
});

const SyncRevisionInput = z.object({
  scopeId: z.string().min(1),
  os: z.object({
    numero: z.string().default(""),
    cliente: z.string().default(""),
  }),
  amostra: z.object({
    code: z.string().default(""),
    descricao: z.string().default(""),
  }),
  ensaio: z.object({
    tipo: z.string().default("triaxial-cid"),
    nome: z.string().default(""),
  }),
  rev: z.number().int().nonnegative(),
  pdf: z.object({ filename: z.string(), base64: z.string() }),
  xlsx: z.object({ filename: z.string(), base64: z.string() }).optional(),
  dadosJson: z.string().optional(),
  fotos: z.array(PhotoSchema).default([]),
  manifest: z.record(z.string(), z.unknown()).default({}),
  /** Reenvio deliberado do MESMO PDF já emitido: só aí sobrescrever a revisão existente no Drive é permitido. */
  reemissao: z.boolean().optional(),
});

function safeName(s: string, fallback: string) {
  const clean = (s || "").toString().replace(/[\\/:*?"<>|]/g, "-").trim();
  return clean || fallback;
}

function ensaioFolderParts(input: z.infer<typeof SyncRevisionInput>) {
  const os = safeName(
    input.os.numero
      ? input.os.cliente ? `${input.os.numero} - ${input.os.cliente}` : input.os.numero
      : "OS-sem-numero",
    "OS-sem-numero",
  );
  const amostra = safeName(
    input.amostra.code
      ? input.amostra.descricao ? `${input.amostra.code} - ${input.amostra.descricao}` : input.amostra.code
      : "Amostra-sem-codigo",
    "Amostra-sem-codigo",
  );
  const ensaio = safeName(
    input.ensaio.nome ? `${input.ensaio.tipo} - ${input.ensaio.nome}` : input.ensaio.tipo,
    "ensaio",
  );
  return [os, amostra, ensaio];
}

/**
 * Log de auditoria das operações de sync — best-effort, nunca bloqueia o
 * fluxo principal (o PDF/foto já foi salvo quando isso é chamado; um erro
 * aqui não pode fazer a operação inteira falhar nem travar sem Supabase).
 */
function logSync(row: {
  scope_id: string;
  rev: number | null;
  kind: string;
  status: string;
  error?: string | null;
  file_id?: string | null;
  folder_id?: string | null;
  metadata?: Record<string, unknown> | null;
}): void {
  if (row.status === "error") {
    console.warn(`[driveSync] ${row.kind} falhou para ${row.scope_id} rev ${row.rev}:`, row.error);
  }
}

/** Confere a assinatura e o tamanho mínimo de um PDF antes de enviá-lo a qualquer lugar. */
function pdfValido(bytes: Uint8Array): boolean {
  return (
    bytes.length > 5000 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d
  );
}

async function enviarRevisaoAoDrive(data: z.infer<typeof SyncRevisionInput>, pdfBytes: Uint8Array) {
  const parts = (await partesDaPastaDoEnsaio(data.scopeId)) ?? ensaioFolderParts(data);
  const ensaioFolderId = await ensureFolderPath(parts);
  const relFolderId = await ensureFolderPath([...parts, "relatorios"]);

  // Uma revisão emitida não é sobrescrita. Com a numeração vinda do navegador,
  // outro computador gerava de novo a "Rev-00" e o upload por nome gravava por
  // cima da Rev-00 já assinada. Só o reenvio deliberado do mesmo PDF passa.
  if (!data.reemissao) {
    const jaExiste = await findFileInFolder(data.pdf.filename, relFolderId);
    if (jaExiste) {
      throw new Error(
        `${data.pdf.filename} já existe no Drive. Uma revisão emitida não é sobrescrita — gere uma nova revisão.`,
      );
    }
  }

  const pdfId = await uploadBytes({
    parentId: relFolderId,
    name: data.pdf.filename,
    mimeType: "application/pdf",
    bytes: pdfBytes,
    overwrite: true,
  });
  logSync({ scope_id: data.scopeId, rev: data.rev, kind: "pdf", status: "ok", file_id: pdfId, folder_id: relFolderId });

  if (data.xlsx) {
    const xlsxId = await uploadBytes({
      parentId: relFolderId,
      name: data.xlsx.filename,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: b64ToBytes(data.xlsx.base64),
      overwrite: true,
    });
    logSync({ scope_id: data.scopeId, rev: data.rev, kind: "xlsx", status: "ok", file_id: xlsxId, folder_id: relFolderId });
  }

  let dadosId: string | null = null;
  if (data.dadosJson) {
    const dadosFolderId = await ensureFolderPath([...parts, "dados"]);
    dadosId = await uploadBytes({
      parentId: dadosFolderId,
      name: "ensaio.json",
      mimeType: "application/json",
      bytes: new TextEncoder().encode(data.dadosJson),
      overwrite: true,
    });
    logSync({ scope_id: data.scopeId, rev: data.rev, kind: "dados", status: "ok", file_id: dadosId });
  }

  const fotoResults: { cpId: string; filename: string; fileId: string }[] = [];
  for (const f of data.fotos) {
    const cpFolder = await ensureFolderPath([...parts, "fotos", f.cpId]);
    const fid = await uploadBytes({
      parentId: cpFolder,
      name: f.filename,
      mimeType: f.mimeType,
      bytes: b64ToBytes(f.base64),
      overwrite: true,
    });
    fotoResults.push({ cpId: f.cpId, filename: f.filename, fileId: fid });
  }

  const manifest = {
    ...data.manifest,
    scopeId: data.scopeId,
    os: data.os,
    amostra: data.amostra,
    ensaio: data.ensaio,
    ultimaRevisao: data.rev,
    atualizadoEm: new Date().toISOString(),
  };
  await uploadBytes({
    parentId: ensaioFolderId,
    name: "manifest.json",
    mimeType: "application/json",
    bytes: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    overwrite: true,
  });

  return {
    ensaioFolderId,
    relFolderId,
    pdfId,
    dadosId,
    fotos: fotoResults,
    folderUrl: `https://drive.google.com/drive/folders/${ensaioFolderId}`,
  };
}

/**
 * Envia uma revisão emitida ao Google Drive — o único destino do PDF do laudo.
 *
 * Antes, o PDF ia primeiro para o bucket `lab-reports` do Supabase, e o erro de
 * lá era relançado ANTES de chegar ao Drive. Como esse bucket não existe
 * (nenhuma migração o cria), todo envio morria ali: nenhum PDF de laudo jamais
 * chegou ao Drive, e as telas engoliam a falha com um `console.warn`. Sem Drive
 * configurado, a função ainda devolvia `ok: true` sem ter gravado nada.
 */
export const syncRevisionToDrive = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((input: unknown) => SyncRevisionInput.parse(input))
  .handler(async ({ data }) => {
    const rotulo = `Rev-${String(data.rev).padStart(2, "0")}`;
    const pdfBytes = b64ToBytes(data.pdf.base64);
    if (!pdfValido(pdfBytes)) {
      throw new Error(`O PDF da ${rotulo} está vazio ou corrompido (${pdfBytes.length} bytes) e não foi enviado.`);
    }
    if (!isGoogleAuthConfigured()) {
      throw new Error(`A ${rotulo} não foi enviada: o Google Drive não está configurado neste servidor.`);
    }
    try {
      const drive = await enviarRevisaoAoDrive(data, pdfBytes);
      return { ok: true, driveOk: true, avisos: [] as string[], ...drive };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logSync({ scope_id: data.scopeId, rev: data.rev, kind: "revision", status: "error", error: message.slice(0, 500) });
      throw new Error(`A ${rotulo} não chegou ao Drive: ${message}`);
    }
  });

type DriveSyncEntry = {
  scope_id: string;
  rev: number | null;
  kind: string;
  status: string;
  error: string | null;
  file_id: string | null;
  folder_id: string | null;
  created_at: string;
};

export type RevisaoNoDrive = { rev: number; filename: string; size: number; updatedAt: string };

/**
 * Revisões (PDFs) que existem de fato na pasta `relatorios` do ensaio no Drive.
 * A lista de "Versões" das telas vem do IndexedDB do navegador, que é local:
 * em outro computador ela aparecia vazia. É isto que a tela consulta para
 * trazer as revisões que ainda não tem. Falha estoura — não vira lista vazia.
 */
export const listDriveRevisions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ scopeId: z.string().min(1) }).parse(input))
  .handler(async ({ data }): Promise<{ revisions: RevisaoNoDrive[] }> => {
    if (!isGoogleAuthConfigured()) return { revisions: [] };
    const parts = await partesDaPastaDoEnsaio(data.scopeId);
    if (!parts) return { revisions: [] };
    const rel = await resolveFolderPath([...parts, "relatorios"]);
    if (!rel) return { revisions: [] };
    const q = `'${rel}' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`;
    const url = `${DRIVE_V3}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent("files(id,name,size,modifiedTime)")}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${DRIVE_ROOT_FOLDER_ID}`;
    const resp = (await driveJson(url, { method: "GET", headers: await driveHeaders() })) as {
      files?: { name: string; size?: string; modifiedTime?: string }[];
    };
    const revisions = (resp.files ?? [])
      .map((f): RevisaoNoDrive | null => {
        const m = /Rev-?(\d+)\.pdf$/i.exec(f.name);
        if (!m) return null;
        return {
          rev: Number(m[1]),
          filename: f.name,
          size: Number(f.size ?? 0),
          updatedAt: f.modifiedTime ?? new Date().toISOString(),
        };
      })
      .filter((r): r is RevisaoNoDrive => r !== null)
      .sort((a, b) => b.rev - a.rev);
    return { revisions };
  });

/**
 * Reconstrói o status de sync a partir dos PDFs que realmente existem na
 * pasta do Drive deste ensaio (não depende mais de um log separado — só
 * sabemos "existe/não existe agora", não o histórico de tentativas
 * passadas, mas é o que a UI realmente usa).
 */
export const getDriveSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ scopeId: z.string() }).parse(input))
  .handler(async ({ data }): Promise<{ entries: DriveSyncEntry[] }> => {
    try {
      const ids = parseScope(data.scopeId);
      if (!ids || !isGoogleAuthConfigured()) return { entries: [] };

      const parts = await partesDaPastaDoEnsaio(data.scopeId);
      if (!parts) return { entries: [] };
      // Só consulta: pasta que não existe = nenhuma revisão enviada. Não cria nada.
      const relFolderId = await resolveFolderPath([...parts, "relatorios"]);
      if (!relFolderId) return { entries: [] };
      const files = (await listFilesInFolder(relFolderId)).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
      const nowIso = new Date().toISOString();

      const entries: DriveSyncEntry[] = files.map((f) => {
        const m = f.name.match(/Rev-(\d+)/i);
        return {
          scope_id: data.scopeId,
          rev: m ? Number(m[1]) : null,
          kind: "pdf",
          status: "ok",
          error: null,
          file_id: f.id,
          folder_id: relFolderId,
          created_at: nowIso,
        };
      });
      return { entries };
    } catch {
      return { entries: [] };
    }
  });

/**
 * Próximo número de revisão pelo que o SERVIDOR já registrou, não pelo que o
 * navegador lembra. As telas numeravam pelo IndexedDB local: em outro
 * computador a lista começava vazia e a revisão voltava a ser Rev-00.
 *
 * Fontes: as revisões registradas no fluxo de aprovação (dentro do arquivo do
 * ensaio, disponível sempre que o ensaio existe), os PDFs na pasta
 * `relatorios` do Drive. `proxima: null` quando nenhuma
 * fonte respondeu — a tela avisa e usa só o histórico local.
 */
export const getProximaRevisao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ scopeId: z.string().min(1) }).parse(input))
  .handler(async ({ data }): Promise<{ proxima: number | null; fontes: string[] }> => {
    const revs: number[] = [];
    const fontes: string[] = [];

    const ids = parseScope(data.scopeId);
    if (ids) {
      try {
        const { ensureFolderPath: ensureFolderPathShared, readDriveJson } = await import("@/lib/driveStorage");
        const en = await readDriveJson<ArquivoLab>(
          `${ids.amostraId}__${ids.ensaioId}.json`,
          await ensureFolderPathShared(["lab-ensaios"]),
        );
        fontes.push("aprovacoes");
        for (const a of (en?.reportApprovals ?? []) as { rev?: unknown }[]) {
          if (typeof a.rev === "number") revs.push(a.rev);
        }
      } catch (err) {
        console.warn("[getProximaRevisao] Falha ao ler as aprovações:", err);
      }
    }

    if (isGoogleAuthConfigured()) {
      try {
        const parts = await partesDaPastaDoEnsaio(data.scopeId);
        if (parts) {
          const rel = await resolveFolderPath([...parts, "relatorios"]);
          fontes.push("drive");
          if (rel) {
            for (const f of await listFilesInFolder(rel)) {
              const m = /Rev-?(\d+)\.pdf$/i.exec(f.name);
              if (m) revs.push(Number(m[1]));
            }
          }
        }
      } catch (err) {
        console.warn("[getProximaRevisao] Falha ao consultar o Drive:", err);
      }
    }

    if (fontes.length === 0) return { proxima: null, fontes };
    return { proxima: revs.length > 0 ? Math.max(...revs) + 1 : 0, fontes };
  });

/**
 * Registrar a abertura de um ensaio não é mais necessário: o arquivo do
 * ensaio no Drive (lab-ensaios/{amostraId}__{ensaioId}.json) já é criado
 * pelo próprio labStore assim que o ensaio existe. Mantido como no-op só
 * para não quebrar chamadores existentes.
 */
const RegisterDraftInput = z.object({
  scopeId: z.string().min(1),
  os: z.object({ numero: z.string().default(""), cliente: z.string().default("") }),
  amostra: z.object({ code: z.string().default("") }),
  ensaio: z.object({ tipo: z.string().default(""), nome: z.string().default("") }),
});

export const registerEnsaioDraft = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((v: unknown) => RegisterDraftInput.parse(v))
  .handler(async () => {
    return { ok: true, created: false };
  });

/**
 * Arquivo do PDF de uma revisão na pasta `relatorios` do ensaio no Drive
 * (deduzida a partir dos arquivos lab-os/lab-amostras/lab-ensaios, sem
 * depender de nenhum log). Sem `rev`, a mais recente.
 */
async function acharPdfDaRevisao(scopeId: string, rev?: number): Promise<{ id: string; name: string }> {
  if (!parseScope(scopeId)) throw new Error("scopeId inválido.");
  const parts = await partesDaPastaDoEnsaio(scopeId);
  if (!parts) throw new Error("Ensaio não encontrado.");
  const relFolderId = await resolveFolderPath([...parts, "relatorios"]);
  if (!relFolderId) throw new Error("Nenhum PDF encontrado no Drive para este ensaio.");
  const files = (await listFilesInFolder(relFolderId)).filter((f) => f.name.toLowerCase().endsWith(".pdf"));
  if (files.length === 0) throw new Error("Nenhum PDF encontrado no Drive para este ensaio.");

  // Pedida a revisão N, devolve a N ou falha. Antes caía em `files[0]` quando
  // não achava, e a tela de compressão simples gravava esse PDF no histórico
  // local COMO se fosse a revisão N.
  const revDoArquivo = (nome: string) => {
    const m = /Rev-?(\d+)\.pdf$/i.exec(nome);
    return m ? Number(m[1]) : null;
  };
  const comRev = files.filter((f) => revDoArquivo(f.name) != null);
  if (typeof rev === "number") {
    const alvo = comRev.find((f) => revDoArquivo(f.name) === rev);
    if (!alvo) throw new Error(`A revisão ${rev} não foi encontrada no Drive para este ensaio.`);
    return alvo;
  }
  const alvo = [...comRev].sort((a, b) => (revDoArquivo(b.name) ?? 0) - (revDoArquivo(a.name) ?? 0))[0];
  if (!alvo) throw new Error("Nenhum PDF de revisão encontrado no Drive para este ensaio.");
  return alvo;
}

const SubstituirPdfInput = z.object({
  scopeId: z.string().min(1),
  rev: z.number().int().nonnegative(),
  base64: z.string().min(1),
});

/**
 * Regrava o PDF de uma revisão já emitida com as assinaturas de verificação e
 * aprovação (ver src/lib/assinaturas-pdf.ts). Fora a reemissão, é a única
 * escrita por cima de uma revisão existente — e só vale para revisão que está
 * no fluxo de aprovação.
 */
export const substituirPdfDaRevisao = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((v: unknown) => SubstituirPdfInput.parse(v))
  .handler(async ({ data }) => {
    const rotulo = `Rev-${String(data.rev).padStart(2, "0")}`;
    const bytes = b64ToBytes(data.base64);
    if (!pdfValido(bytes)) {
      throw new Error(`O PDF da ${rotulo} está vazio ou corrompido (${bytes.length} bytes) e não foi gravado.`);
    }
    if (!isGoogleAuthConfigured()) {
      throw new Error(`O PDF da ${rotulo} não foi gravado: o Google Drive não está configurado neste servidor.`);
    }
    const ids = parseScope(data.scopeId);
    if (!ids) throw new Error("scopeId inválido.");
    const { ensureFolderPath: ensureFolderPathShared, readDriveJson } = await import("@/lib/driveStorage");
    const en = await readDriveJson<ArquivoLab>(
      `${ids.amostraId}__${ids.ensaioId}.json`,
      await ensureFolderPathShared(["lab-ensaios"]),
    );
    if (!(en?.reportApprovals ?? []).some((a) => a.rev === data.rev)) {
      throw new Error(`A ${rotulo} não está no fluxo de aprovação; o PDF não foi alterado.`);
    }
    const alvo = await acharPdfDaRevisao(data.scopeId, data.rev);
    await uploadBytesOverwrite({ mimeType: "application/pdf", bytes }, alvo.id);
    return { ok: true, fileId: alvo.id };
  });

/**
 * Baixa o PDF da revisão informada (ou da última) do Drive e devolve em
 * base64 para pré-visualização em pop-up, direto da pasta `relatorios` do
 * ensaio no Drive.
 */
const PreviewInput = z.object({
  scopeId: z.string().min(1),
  rev: z.number().int().nonnegative().optional(),
});

export const getRevisionPdfBase64 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => PreviewInput.parse(v))
  .handler(async ({ data }) => {
    if (!isGoogleAuthConfigured()) {
      throw new Error("Prévia indisponível: o Google Drive não está configurado neste servidor.");
    }

    const target = await acharPdfDaRevisao(data.scopeId, data.rev);

    const res = await fetch(`${DRIVE_V3}/files/${target.id}?alt=media&supportsAllDrives=true`, {
      method: "GET",
      headers: await driveHeaders(),
    });
    if (!res.ok) throw new Error(`Drive download ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK) {
      bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
    }
    const revMatch = target.name.match(/Rev-(\d+)/i);
    return { base64: btoa(bin), rev: revMatch ? Number(revMatch[1]) : null };
  });

/**
 * Re-exporta getWorkflowStatuses centralizado e soberano de approvals.functions.ts
 */
export { getWorkflowStatuses } from "./approvals.functions";
