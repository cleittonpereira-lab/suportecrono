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
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getGoogleAccessToken, isGoogleAuthConfigured } from "./google-auth.server";

const DRIVE_V3 = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];

/** ID da pasta raiz oficial de relatórios da Suporte no Google Drive */
export const DRIVE_ROOT_FOLDER_ID = "1buEmIk9ksuC3n9ndQRxqQkyN5SYgugAb";

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

function escQ(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findFolder(name: string, parentId: string): Promise<string | null> {
  const q = `name = '${escQ(name)}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const url = `${DRIVE_V3}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent("files(id,name)")}&pageSize=1`;
  const data = await driveJson(url, { method: "GET", headers: await driveHeaders() });
  return data.files?.[0]?.id ?? null;
}

async function createFolder(name: string, parentId: string): Promise<string> {
  const data = await driveJson(`${DRIVE_V3}/files?fields=id`, {
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

    let id = await findFolder(name, parent);
    if (!id) id = await createFolder(name, parent);

    driveFolderMemCache.set(currentAccum, id);
    parent = id;

    // Grava no Supabase cache de forma assíncrona/não-bloqueante
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("drive_folder_cache").upsert({
        path: currentAccum,
        folder_id: id,
        parent_id: parent,
        updated_at: new Date().toISOString(),
      });
    } catch {}
  }

  driveFolderMemCache.set(pathKey, parent);
  return parent;
}

async function findFileInFolder(name: string, parentId: string): Promise<string | null> {
  const q = `name = '${escQ(name)}' and '${parentId}' in parents and trashed = false`;
  const url = `${DRIVE_V3}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent("files(id,name)")}&pageSize=1`;
  const data = await driveJson(url, { method: "GET", headers: await driveHeaders() });
  return data.files?.[0]?.id ?? null;
}

async function uploadBytes(opts: {
  parentId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  overwrite?: boolean;
}): Promise<string> {
  const existing = opts.overwrite ? await findFileInFolder(opts.name, opts.parentId) : null;
  if (existing) {
    const res = await fetch(`${DRIVE_UPLOAD}/${existing}?uploadType=media&fields=id`, {
      method: "PATCH",
      headers: await driveHeaders({ "Content-Type": opts.mimeType }),
      body: opts.bytes as BodyInit,
    });
    if (!res.ok) throw new Error(`Drive update ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return existing;
  }
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
  const res = await fetch(`${DRIVE_UPLOAD}?uploadType=multipart&fields=id`, {
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

/**
 * Caminho do PDF da revisão no bucket privado `lab-reports`.
 * Sempre gravado no finalizar (mesmo se o Drive falhar), garantindo prévia.
 */
function storagePdfPath(scopeId: string, rev: number) {
  const safe = scopeId.replace(/[^\w/.-]+/g, "_");
  return `${safe}/Rev-${String(rev).padStart(2, "0")}.pdf`;
}

async function uploadPdfToStorage(scopeId: string, rev: number, bytes: Uint8Array) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = storagePdfPath(scopeId, rev);
    const arrayBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(arrayBuffer).set(bytes);
    const pdfBlob = new Blob([arrayBuffer], { type: "application/pdf" });
    const { error } = await supabaseAdmin.storage
      .from("lab-reports")
      .upload(path, pdfBlob, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (error) {
      console.warn("Storage upload warn (non-fatal):", error.message);
    }
    return path;
  } catch (err: any) {
    console.warn("Storage upload caught (non-fatal):", err?.message || err);
    return storagePdfPath(scopeId, rev);
  }
}

async function downloadPdfFromStorage(scopeId: string, rev: number): Promise<Uint8Array | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const path = storagePdfPath(scopeId, rev);
  const { data, error } = await supabaseAdmin.storage.from("lab-reports").download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

async function latestStorageRev(scopeId: string): Promise<number | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const safe = scopeId.replace(/[^\w/.-]+/g, "_");
  const { data } = await supabaseAdmin.storage.from("lab-reports").list(safe, { limit: 100 });
  if (!data || data.length === 0) return null;
  const revs = data
    .map((f) => /^Rev-(\d+)\.pdf$/i.exec(f.name)?.[1])
    .filter(Boolean)
    .map((n) => Number(n));
  if (revs.length === 0) return null;
  return Math.max(...revs);
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

async function logSync(row: {
  scope_id: string;
  rev: number | null;
  kind: string;
  status: string;
  error?: string | null;
  file_id?: string | null;
  folder_id?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("drive_sync_log").insert(row as never);
}

async function upsertIndex(input: z.infer<typeof SyncRevisionInput>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("lab_index").upsert({
    scope_id: input.scopeId,
    os_numero: input.os.numero,
    os_cliente: input.os.cliente,
    amostra_code: input.amostra.code,
    ensaio_tipo: input.ensaio.tipo,
    ensaio_nome: input.ensaio.nome,
    updated_at: new Date().toISOString(),
  });
}

export const syncRevisionToDrive = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SyncRevisionInput.parse(input))
  .handler(async ({ data }) => {
    // Sempre grava o PDF no Storage privado — garante prévia mesmo se o Drive
    // não estiver configurado ou falhar.
    const pdfBytes = b64ToBytes(data.pdf.base64);
    let storagePath: string | null = null;
    try {
      storagePath = await uploadPdfToStorage(data.scopeId, data.rev, pdfBytes);
      await logSync({
        scope_id: data.scopeId,
        rev: data.rev,
        kind: "pdf-storage",
        status: "ok",
        file_id: storagePath,
      });
      // Atualiza índice mesmo sem Drive (para o ensaio aparecer nas listas).
      await upsertIndex(data);
    } catch (err) {
      await logSync({
        scope_id: data.scopeId,
        rev: data.rev,
        kind: "pdf-storage",
        status: "error",
        error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      });
      throw err;
    }

    if (!isGoogleAuthConfigured()) {
      // Drive não configurado: retorna sucesso baseado no Storage.
      return {
        ok: true,
        storagePath,
        ensaioFolderId: null as string | null,
        relFolderId: null as string | null,
        pdfId: null as string | null,
        dadosId: null as string | null,
        fotos: [] as { cpId: string; filename: string; fileId: string }[],
        folderUrl: null as string | null,
        driveConfigured: false,
      };
    }
    try {
      const parts = ensaioFolderParts(data);
      const ensaioFolderId = await ensureFolderPath(parts);
      const relFolderId = await ensureFolderPath([...parts, "relatorios"]);
      const dadosFolderId = await ensureFolderPath([...parts, "dados"]);

      const pdfId = await uploadBytes({
        parentId: relFolderId,
        name: data.pdf.filename,
        mimeType: "application/pdf",
        bytes: pdfBytes,
        overwrite: true,
      });
      await logSync({ scope_id: data.scopeId, rev: data.rev, kind: "pdf", status: "ok", file_id: pdfId, folder_id: relFolderId });

      let xlsxId: string | null = null;
      if (data.xlsx) {
        const xlsxBytes = b64ToBytes(data.xlsx.base64);
        xlsxId = await uploadBytes({
          parentId: relFolderId,
          name: data.xlsx.filename,
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          bytes: xlsxBytes,
          overwrite: true,
        });
        await logSync({ scope_id: data.scopeId, rev: data.rev, kind: "xlsx", status: "ok", file_id: xlsxId, folder_id: relFolderId });
      }

      let dadosId: string | null = null;
      if (data.dadosJson) {
        dadosId = await uploadBytes({
          parentId: dadosFolderId,
          name: "ensaio.json",
          mimeType: "application/json",
          bytes: new TextEncoder().encode(data.dadosJson),
          overwrite: true,
        });
        await logSync({ scope_id: data.scopeId, rev: data.rev, kind: "dados", status: "ok", file_id: dadosId });
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
      if (data.fotos.length > 0) {
        await logSync({
          scope_id: data.scopeId,
          rev: data.rev,
          kind: "fotos",
          status: "ok",
          metadata: { count: data.fotos.length },
        });
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

      await upsertIndex(data);

      return {
        ok: true,
        ensaioFolderId,
        relFolderId,
        pdfId,
        dadosId,
        fotos: fotoResults,
        folderUrl: `https://drive.google.com/drive/folders/${ensaioFolderId}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logSync({
        scope_id: data.scopeId,
        rev: data.rev,
        kind: "revision",
        status: "error",
        error: message.slice(0, 500),
      });
      throw new Error(message);
    }
  });

export const getDriveSyncStatus = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ scopeId: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("drive_sync_log")
      .select("id, scope_id, rev, kind, status, error, file_id, folder_id, created_at")
      .eq("scope_id", data.scopeId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { entries: rows ?? [] };
  });

/**
 * Registra o ensaio no `lab_index` com workflow_status='digitacao' na
 * primeira vez que é aberto. Se já existir, apenas atualiza metadados
 * (OS/amostra/ensaio) mantendo o workflow_status atual.
 */
const RegisterDraftInput = z.object({
  scopeId: z.string().min(1),
  os: z.object({ numero: z.string().default(""), cliente: z.string().default("") }),
  amostra: z.object({ code: z.string().default("") }),
  ensaio: z.object({ tipo: z.string().default(""), nome: z.string().default("") }),
});

export const registerEnsaioDraft = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => RegisterDraftInput.parse(v))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("lab_index")
      .select("scope_id, workflow_status")
      .eq("scope_id", data.scopeId)
      .maybeSingle();
    const patch: Record<string, unknown> = {
      scope_id: data.scopeId,
      os_numero: data.os.numero,
      os_cliente: data.os.cliente,
      amostra_code: data.amostra.code,
      ensaio_tipo: data.ensaio.tipo,
      ensaio_nome: data.ensaio.nome,
      updated_at: new Date().toISOString(),
    };
    if (!existing) patch.workflow_status = "digitacao";
    const { error } = await supabaseAdmin.from("lab_index").upsert(patch as never);
    if (error) throw new Error(error.message);
    return { ok: true, created: !existing };
  });

/**
 * Baixa o PDF da revisão informada (ou da última) do Drive e devolve em
 * base64 para pré-visualização em pop-up. Consulta `drive_sync_log` para
 * localizar o file_id da última upload bem-sucedida com kind='pdf'.
 */
const PreviewInput = z.object({
  scopeId: z.string().min(1),
  rev: z.number().int().nonnegative().optional(),
});

export const getRevisionPdfBase64 = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => PreviewInput.parse(v))
  .handler(async ({ data }) => {
    // 1) Tenta Storage privado primeiro — sempre disponível quando o ensaio
    //    foi finalizado (independente do Drive).
    try {
      const rev = typeof data.rev === "number" ? data.rev : await latestStorageRev(data.scopeId);
      if (typeof rev === "number") {
        const bytes = await downloadPdfFromStorage(data.scopeId, rev);
        if (bytes) {
          let bin = "";
          const CHUNK = 0x8000;
          for (let i = 0; i < bytes.length; i += CHUNK) {
            bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
          }
          return { base64: btoa(bin), rev };
        }
      }
    } catch { /* cai para Drive */ }

    if (!isGoogleAuthConfigured()) {
      throw new Error("Prévia indisponível: PDF ainda não foi armazenado. Finalize novamente o ensaio.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("drive_sync_log")
      .select("file_id, rev, created_at")
      .eq("scope_id", data.scopeId)
      .eq("kind", "pdf")
      .eq("status", "ok")
      .not("file_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (typeof data.rev === "number") q = q.eq("rev", data.rev);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const fileId = rows?.[0]?.file_id as string | undefined;
    if (!fileId) throw new Error("Nenhum PDF encontrado no Drive para este ensaio.");
    const res = await fetch(`${DRIVE_V3}/files/${fileId}?alt=media`, {
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
    return { base64: btoa(bin), rev: rows?.[0]?.rev ?? null };
  });

/**
 * Re-exporta getWorkflowStatuses centralizado e soberano de approvals.functions.ts
 */
export { getWorkflowStatuses } from "./approvals.functions";
