/**
 * Camada Soberana de Persistência no Google Drive (Suporte INFRA).
 *
 * Garante que todos os dados do laboratório (OS, Amostras, Ensaios, Aprovações,
 * Rascunhos e PDFs) sejam gravados e lidos diretamente no Google Drive,
 * com cache local de alta performance e tolerância a falhas.
 *
 * Autentica via conta de serviço direta (JWT, `google-auth.server.ts`) — o
 * mesmo mecanismo já usado com sucesso pelo módulo de Programação/Sheets.
 * O proxy `connector-gateway.lovable.dev` (que exigia LOVABLE_API_KEY +
 * GOOGLE_DRIVE_API_KEY) foi removido daqui por nunca ter sido configurado
 * em produção — confirmado via teste direto: a conta de serviço já tinha
 * acesso real à pasta do Drive o tempo todo.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { getGoogleAccessToken, isGoogleAuthConfigured } from "./google-auth.server";

export const DRIVE_ROOT_FOLDER_ID = "0AB6VPuj1fWHEUk9PVA";
const DRIVE_V3 = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];

// Cache em memória
const memoryCache = new Map<string, { data: any; timestamp: number }>();
const folderIdCache = new Map<string, string>();

async function driveHeaders(extra: Record<string, string> = {}): Promise<Headers> {
  const h = new Headers(extra);
  const token = await getGoogleAccessToken(DRIVE_SCOPES);
  h.set("Authorization", `Bearer ${token}`);
  return h;
}

export function hasDriveCredentials(): boolean {
  return isGoogleAuthConfigured();
}

function escQ(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Local disk fallback helper */
function getLocalPath(filename: string): string {
  const safe = filename.replace(/[^\w.-]+/g, "_");
  const dir = path.join(process.cwd(), ".data");
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
  return path.join(dir, safe);
}

export async function findFileInFolder(name: string, parentId: string): Promise<string | null> {
  if (!hasDriveCredentials()) return null;
  try {
    const q = `name = '${escQ(name)}' and '${parentId}' in parents and trashed = false`;
    const url = `${DRIVE_V3}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent("files(id,name)")}&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${DRIVE_ROOT_FOLDER_ID}`;
    const res = await fetch(url, { method: "GET", headers: await driveHeaders() });
    if (!res.ok) return null;
    const data = (await res.json()) as { files?: { id: string }[] };
    return data.files?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function findFolder(name: string, parentId: string): Promise<string | null> {
  if (!hasDriveCredentials()) return null;
  try {
    const q = `name = '${escQ(name)}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`;
    const url = `${DRIVE_V3}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent("files(id,name)")}&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=drive&driveId=${DRIVE_ROOT_FOLDER_ID}`;
    const res = await fetch(url, { method: "GET", headers: await driveHeaders() });
    if (!res.ok) return null;
    const data = (await res.json()) as { files?: { id: string }[] };
    return data.files?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function createFolder(name: string, parentId: string): Promise<string> {
  if (!hasDriveCredentials()) return `local_folder_${Date.now()}`;
  const res = await fetch(`${DRIVE_V3}/files?fields=id&supportsAllDrives=true`, {
    method: "POST",
    headers: await driveHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  if (!res.ok) throw new Error(`Falha ao criar pasta ${name} no Drive: ${res.status}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function ensureFolderPath(parts: string[]): Promise<string> {
  const pathKey = parts.filter(Boolean).map((p) => p.trim()).join("/");
  if (folderIdCache.has(pathKey)) {
    return folderIdCache.get(pathKey)!;
  }

  let parent = DRIVE_ROOT_FOLDER_ID;
  let currentAccum = "";

  for (const part of parts) {
    const clean = part.trim();
    if (!clean) continue;
    currentAccum = currentAccum ? `${currentAccum}/${clean}` : clean;

    if (folderIdCache.has(currentAccum)) {
      parent = folderIdCache.get(currentAccum)!;
      continue;
    }

    let folderId = await findFolder(clean, parent);
    if (!folderId) {
      folderId = await createFolder(clean, parent);
    }
    folderIdCache.set(currentAccum, folderId);
    parent = folderId;
  }

  folderIdCache.set(pathKey, parent);
  return parent;
}

/** Lista todos os arquivos (não-pasta) dentro de uma pasta do Drive, com paginação. */
export async function listFilesInFolder(parentId: string): Promise<{ id: string; name: string }[]> {
  if (!hasDriveCredentials()) return [];
  const out: { id: string; name: string }[] = [];
  let pageToken: string | undefined;
  try {
    do {
      const q = `'${parentId}' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`;
      const params = new URLSearchParams({
        q,
        fields: "nextPageToken,files(id,name)",
        pageSize: "1000",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
        corpora: "drive",
        driveId: DRIVE_ROOT_FOLDER_ID,
      });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await fetch(`${DRIVE_V3}/files?${params.toString()}`, { method: "GET", headers: await driveHeaders() });
      if (!res.ok) break;
      const data = (await res.json()) as { files?: { id: string; name: string }[]; nextPageToken?: string };
      out.push(...(data.files ?? []));
      pageToken = data.nextPageToken;
    } while (pageToken);
  } catch (err) {
    console.warn("[DriveStorage] Erro ao listar pasta:", err);
  }
  return out;
}

/** Apaga um arquivo do Drive pelo seu fileId. */
export async function deleteDriveFile(fileId: string): Promise<void> {
  if (!hasDriveCredentials()) return;
  try {
    await fetch(`${DRIVE_V3}/files/${fileId}?supportsAllDrives=true`, { method: "DELETE", headers: await driveHeaders() });
  } catch (err) {
    console.warn("[DriveStorage] Erro ao apagar arquivo:", err);
  }
}

/**
 * Envia os bytes por upload resumível (protocolo de 2 etapas: inicia a sessão,
 * depois envia o conteúdo). Ao contrário do upload simples/multipart (limitado
 * a arquivos pequenos, ~5MB), o resumível funciona de forma confiável para
 * qualquer tamanho — necessário porque ensaios com várias fotos facilmente
 * passam de 5MB em JSON (fotos ficam em base64 dentro do arquivo do ensaio).
 */
async function uploadBytesResumable(opts: {
  parentId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  existingId: string | null;
}): Promise<string> {
  const isUpdate = !!opts.existingId;
  const initUrl = isUpdate
    ? `${DRIVE_UPLOAD}/${opts.existingId}?uploadType=resumable&supportsAllDrives=true`
    : `${DRIVE_UPLOAD}?uploadType=resumable&supportsAllDrives=true`;
  const metadata = isUpdate ? {} : { name: opts.name, parents: [opts.parentId] };

  const initRes = await fetch(initUrl, {
    method: isUpdate ? "PATCH" : "POST",
    headers: await driveHeaders({
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": opts.mimeType,
    }),
    body: JSON.stringify(metadata),
  });
  if (!initRes.ok) {
    throw new Error(`Drive resumable init error ${initRes.status}: ${(await initRes.text()).slice(0, 300)}`);
  }
  const uploadUrl = initRes.headers.get("Location");
  if (!uploadUrl) {
    throw new Error("Drive resumable init: resposta sem cabeçalho Location");
  }

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": opts.mimeType },
    body: opts.bytes as BodyInit,
  });
  if (!putRes.ok) {
    throw new Error(`Drive resumable upload error ${putRes.status}: ${(await putRes.text()).slice(0, 300)}`);
  }
  const result = (await putRes.json()) as { id: string };
  return result.id;
}

export async function uploadBytesToDrive(opts: {
  parentId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  overwrite?: boolean;
}): Promise<string> {
  if (!hasDriveCredentials()) {
    const local = getLocalPath(`${opts.parentId}_${opts.name}`);
    try {
      fs.writeFileSync(local, opts.bytes);
    } catch {}
    return "local_saved";
  }

  const existingId = opts.overwrite !== false ? await findFileInFolder(opts.name, opts.parentId) : null;
  return uploadBytesResumable({ ...opts, existingId });
}

/**
 * Envia uma foto (bytes de imagem) como arquivo binário próprio no Drive —
 * ao contrário de `writeDriveJson`, que embute base64 dentro de um JSON.
 * Cada foto vira um arquivo novo. Devolve um `fileId` — real (do Drive) em
 * produção, ou um id local sintético (sem credenciais do Drive configuradas)
 * — usado depois em `/api/photo/$fileId`.
 *
 * Não delega pro fallback local genérico de `uploadBytesToDrive` (que
 * devolve a string fixa `"local_saved"`, própria pra documentos JSON
 * únicos por entidade — colidiria entre fotos diferentes aqui).
 */
export async function uploadPhotoBytes(opts: {
  parentId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<string> {
  if (!hasDriveCredentials()) {
    const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    try {
      fs.writeFileSync(getLocalPath(`photo_${id}`), opts.bytes);
      fs.writeFileSync(getLocalPath(`photo_${id}.meta`), opts.mimeType, "utf8");
    } catch {}
    return id;
  }
  return uploadBytesResumable({ ...opts, existingId: null });
}

/** Lê os bytes brutos (não-JSON) de um arquivo do Drive pelo seu fileId — usado para servir fotos. */
export async function readPhotoBytes(fileId: string): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  if (!hasDriveCredentials()) {
    try {
      const local = getLocalPath(`photo_${fileId}`);
      if (fs.existsSync(local)) {
        const buf = fs.readFileSync(local);
        const metaPath = getLocalPath(`photo_${fileId}.meta`);
        const mimeType = fs.existsSync(metaPath) ? fs.readFileSync(metaPath, "utf8") : "image/jpeg";
        return { bytes: new Uint8Array(buf), mimeType };
      }
    } catch {}
    return null;
  }
  try {
    const res = await fetch(`${DRIVE_V3}/files/${fileId}?alt=media&supportsAllDrives=true`, {
      method: "GET",
      headers: await driveHeaders(),
    });
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") || "application/octet-stream";
    const buf = await res.arrayBuffer();
    return { bytes: new Uint8Array(buf), mimeType };
  } catch (err) {
    console.warn("[DriveStorage] Erro ao ler foto:", err);
    return null;
  }
}

/** Lê um arquivo JSON do Google Drive com fallback em cache */
export async function readDriveJson<T>(filename: string, parentId: string = DRIVE_ROOT_FOLDER_ID): Promise<T | null> {
  const cacheKey = `${parentId}:${filename}`;
  const mem = memoryCache.get(cacheKey);
  if (mem && Date.now() - mem.timestamp < 15000) {
    return mem.data as T;
  }

  // 1. Tenta carregar do Google Drive
  if (hasDriveCredentials()) {
    try {
      const fileId = await findFileInFolder(filename, parentId);
      if (fileId) {
        const res = await fetch(`${DRIVE_V3}/files/${fileId}?alt=media&supportsAllDrives=true`, {
          method: "GET",
          headers: await driveHeaders(),
        });
        if (res.ok) {
          const text = await res.text();
          if (text) {
            const parsed = JSON.parse(text) as T;
            memoryCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
            // Atualiza backup local
            try {
              fs.writeFileSync(getLocalPath(filename), text, "utf8");
            } catch {}
            return parsed;
          }
        }
      }
    } catch (err) {
      console.warn(`[DriveStorage] Aviso ao ler ${filename} do Drive:`, err);
    }
  }

  // 2. Fallback no disco local
  try {
    const local = getLocalPath(filename);
    if (fs.existsSync(local)) {
      const text = fs.readFileSync(local, "utf8");
      if (text) {
        const parsed = JSON.parse(text) as T;
        memoryCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
        return parsed;
      }
    }
  } catch {}

  return null;
}

/** Grava um arquivo JSON diretamente no Google Drive */
export async function writeDriveJson<T>(
  filename: string,
  data: T,
  parentId: string = DRIVE_ROOT_FOLDER_ID,
): Promise<{ ok: boolean; fileId?: string }> {
  const cacheKey = `${parentId}:${filename}`;
  const jsonStr = JSON.stringify(data, null, 2);
  const bytes = new TextEncoder().encode(jsonStr);

  // Atualiza cache em memória e disco local imediatamente
  memoryCache.set(cacheKey, { data, timestamp: Date.now() });
  try {
    fs.writeFileSync(getLocalPath(filename), jsonStr, "utf8");
  } catch {}

  // Grava no Google Drive — erro é propagado (não mascarado como sucesso),
  // para que quem chamou perceba a falha e tente novamente.
  const fileId = await uploadBytesToDrive({
    parentId,
    name: filename,
    mimeType: "application/json",
    bytes,
    overwrite: true,
  });
  return { ok: true, fileId };
}
