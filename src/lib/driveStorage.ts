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

/**
 * fileId já conhecido para (pasta, nome).
 *
 * A busca por nome do Drive é eventualmente consistente: um arquivo criado há
 * poucos segundos ainda pode não aparecer nela. Sem esse mapa, o autosave
 * seguinte não encontrava o arquivo recém-criado, concluía que ele não existia
 * e criava OUTRO com o mesmo nome — foi assim que um único ensaio chegou a ter
 * quatro arquivos, incluindo cópias aprovadas divergentes.
 */
const fileIdCache = new Map<string, string>();

/**
 * Fila por chave, para escritas na mesma (pasta, nome).
 *
 * Dois autosaves simultâneos resolviam o id em paralelo, ambos não achavam
 * nada e ambos criavam. Encadeando as escritas, a segunda só resolve o id
 * depois que a primeira terminou — e aí já encontra o arquivo, no cache acima.
 */
const writeChain = new Map<string, Promise<unknown>>();

/**
 * O cache acima vive na memória de UMA isolate do Worker, e o Cloudflare
 * distribui as requisições entre várias. Isso não bastou: a isolate A criava o
 * arquivo, o autosave seguinte caía na isolate B com cache vazio, a busca por
 * nome do Drive ainda não enxergava o arquivo de A, e B criava um segundo. As
 * duas passavam a escrever cada uma no seu arquivo e o trabalho digitado numa
 * delas se perdia.
 *
 * O Postgres é fortemente consistente, então serve de ponto de encontro entre
 * isolates. Degrada em silêncio: sem Supabase configurado, tudo continua
 * funcionando como antes, só sem a proteção entre isolates.
 */
async function supabaseFileId(key: string): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("drive_file_cache")
      .select("file_id")
      .eq("key", key)
      .maybeSingle();
    return (data as { file_id?: string } | null)?.file_id ?? null;
  } catch {
    return null;
  }
}

async function rememberFileId(key: string, fileId: string, parentId: string, name: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("drive_file_cache").upsert({
      key, file_id: fileId, parent_id: parentId, name, updated_at: new Date().toISOString(),
    });
  } catch { /* melhor esforço: a escrita no Drive não pode falhar por causa do cache */ }
}

async function forgetFileId(key: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("drive_file_cache").delete().eq("key", key);
  } catch { /* idem */ }
}

/**
 * Resolve (pasta, nome) -> fileId na ordem mais confiável primeiro:
 * memória desta isolate, depois Supabase (consistente entre isolates), e só
 * então a busca por nome do Drive — que é a única das três que pode "não ver"
 * um arquivo recém-criado e provocar uma duplicata.
 */
async function resolveFileId(name: string, parentId: string): Promise<string | null> {
  const key = `${parentId}:${name}`;
  const emMemoria = fileIdCache.get(key);
  if (emMemoria) return emMemoria;

  const doSupabase = await supabaseFileId(key);
  if (doSupabase) {
    fileIdCache.set(key, doSupabase);
    return doSupabase;
  }

  const doDrive = await findFileInFolder(name, parentId);
  if (doDrive) {
    fileIdCache.set(key, doDrive);
    void rememberFileId(key, doDrive, parentId, name);
  }
  return doDrive;
}

export function withKeyLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeChain.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  // A cauda da fila nunca pode rejeitar, senão uma falha derruba as próximas.
  writeChain.set(
    key,
    next.catch(() => {}),
  );
  return next;
}

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

/**
 * Lista TODOS os arquivos com um dado nome dentro de uma pasta, do mais
 * recentemente modificado para o mais antigo.
 *
 * O Google Drive permite vários arquivos com o mesmo nome na mesma pasta, e a
 * busca por nome não garante ordem nenhuma. É por isso que existe essa função:
 * quem chama precisa de um critério explícito de desempate.
 */
export async function findFileEntriesInFolder(
  name: string,
  parentId: string,
): Promise<{ id: string; modifiedTime?: string }[]> {
  if (!hasDriveCredentials()) return [];
  try {
    const params = new URLSearchParams({
      q: `name = '${escQ(name)}' and '${parentId}' in parents and trashed = false`,
      fields: "files(id,name,modifiedTime)",
      orderBy: "modifiedTime desc",
      pageSize: "100",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      corpora: "drive",
      driveId: DRIVE_ROOT_FOLDER_ID,
    });
    const res = await fetch(`${DRIVE_V3}/files?${params.toString()}`, { method: "GET", headers: await driveHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as { files?: { id: string; modifiedTime?: string }[] };
    return data.files ?? [];
  } catch {
    return [];
  }
}

/**
 * Resolve um nome de arquivo para um único fileId — sempre o mais recentemente
 * modificado.
 *
 * A versão anterior usava `pageSize=1` + `files[0]` sem `orderBy`. Havendo
 * homônimos, duas leituras seguidas do mesmo ensaio podiam devolver arquivos
 * diferentes — uma o laudo aprovado, outra o stub com `payload: null`. Era essa
 * a causa real do "aparece e desaparece" na Central de Relatórios: a linha
 * perdia furo/profundidade e voltava de "Laudo Aprovado" para "Em Digitação"
 * conforme o sorteio de cada requisição.
 *
 * Ordenar por `modifiedTime desc` torna a escolha determinística e escolhe a
 * cópia viva, mesmo enquanto ainda existirem duplicados na pasta.
 */
export async function findFileInFolder(name: string, parentId: string): Promise<string | null> {
  const entries = await findFileEntriesInFolder(name, parentId);
  if (entries.length > 1) {
    console.warn(
      `[DriveStorage] ${entries.length} arquivos homônimos para "${name}" em ${parentId}; ` +
        `usando o mais recente (${entries[0].id}).`,
    );
  }
  return entries[0]?.id ?? null;
}

/**
 * Resolve uma pasta pelo nome — sempre a mais ANTIGA, ao contrário dos
 * arquivos.
 *
 * Para um arquivo, o que vale é o conteúdo mais novo. Para uma pasta, o que
 * vale é o acervo: se houver duplicatas, a original é a que acumulou os filhos
 * (as 15 cópias vazias de `os-hub` nasceram todas depois dela). Ordenar por
 * `createdTime` ascendente faz todas as isolates convergirem para a mesma pasta
 * canônica, em vez de espalhar arquivos entre cópias.
 */
export async function findFolder(name: string, parentId: string): Promise<string | null> {
  if (!hasDriveCredentials()) return null;
  try {
    const params = new URLSearchParams({
      q: `name = '${escQ(name)}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
      fields: "files(id,name,createdTime)",
      orderBy: "createdTime",
      pageSize: "100",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      corpora: "drive",
      driveId: DRIVE_ROOT_FOLDER_ID,
    });
    const res = await fetch(`${DRIVE_V3}/files?${params.toString()}`, { method: "GET", headers: await driveHeaders() });
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

    // Sem a fila, N requisições simultâneas chamavam `findFolder` em paralelo,
    // nenhuma encontrava nada e todas criavam — foi assim que nasceram 16
    // pastas `os-hub` no mesmo minuto, 15 delas vazias.
    const parentId = parent;
    const folderId = await withKeyLock(`folder:${currentAccum}`, async () => {
      const cached = folderIdCache.get(currentAccum);
      if (cached) return cached;
      const found = await findFolder(clean, parentId);
      return found ?? (await createFolder(clean, parentId));
    });
    folderIdCache.set(currentAccum, folderId);
    parent = folderId;
  }

  folderIdCache.set(pathKey, parent);
  return parent;
}

/** Lista todos os arquivos (não-pasta) dentro de uma pasta do Drive, com paginação. */
export async function listFilesInFolder(parentId: string): Promise<{ id: string; name: string }[]> {
  if (!hasDriveCredentials()) {
    // Sem credenciais do Drive (dev local): `uploadBytesToDrive`/`writeDriveJson` já gravam uma
    // cópia local prefixada por `${parentId}_` especificamente para isso — sem essa listagem,
    // qualquer recurso que dependa de listar uma pasta (ex.: `usuarios/`, `lab-pendencias/`)
    // fica sempre vazio localmente, mesmo com os arquivos individuais graváveis/legíveis por nome.
    try {
      const dir = path.join(process.cwd(), ".data");
      if (!fs.existsSync(dir)) return [];
      const prefix = `${getLocalPath(parentId).split(path.sep).pop()}_`;
      return fs
        .readdirSync(dir)
        .filter((f) => f.startsWith(prefix) && !f.endsWith(".meta"))
        .map((f) => ({ id: f, name: f.slice(prefix.length) }));
    } catch {
      return [];
    }
  }
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

  // `overwrite: false` é upload de arquivo novo por definição (ex.: cada foto
  // é um arquivo próprio) — não resolve nome nem entra na fila.
  if (opts.overwrite === false) {
    return uploadBytesResumable({ ...opts, existingId: null });
  }

  const key = `${opts.parentId}:${opts.name}`;
  return withKeyLock(key, async () => {
    const existingId = await resolveFileId(opts.name, opts.parentId);
    try {
      const id = await uploadBytesResumable({ ...opts, existingId });
      fileIdCache.set(key, id);
      // Grava o id sempre — inclusive numa criação, que é justamente o momento
      // em que a busca por nome do Drive ainda não enxerga o arquivo e outra
      // isolate criaria uma duplicata.
      void rememberFileId(key, id, opts.parentId, opts.name);
      return id;
    } catch (err) {
      // Um id resolvido pode ter sido apagado ou movido por fora deste
      // processo. Nesse caso o PATCH falha: esquece o id nos dois caches,
      // busca no Drive e repete. Sem isso, o arquivo ficaria inacessível.
      if (!existingId) throw err;
      fileIdCache.delete(key);
      await forgetFileId(key);
      const freshId = await findFileInFolder(opts.name, opts.parentId);
      const id = await uploadBytesResumable({ ...opts, existingId: freshId });
      fileIdCache.set(key, id);
      void rememberFileId(key, id, opts.parentId, opts.name);
      return id;
    }
  });
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

/**
 * Lê um JSON pelo fileId, sem resolver nome nenhum.
 *
 * `listFilesInFolder` já devolve `{ id, name }`, mas quem listava jogava o id
 * fora e chamava `readDriveJson(f.name, ...)`, que faz uma busca por nome na
 * API do Drive antes de baixar. Eram 2 chamadas por arquivo em vez de 1 — com
 * ~30 pendências, ~60 requisições numa única invocação do Worker, que é o que
 * estourava o limite de CPU (Error 1102).
 *
 * Ler pelo id também elimina um risco: havendo homônimos, a busca por nome
 * podia devolver um arquivo DIFERENTE do que a listagem tinha entregue.
 */
export async function readDriveJsonById<T>(fileId: string, name?: string): Promise<T | null> {
  if (!hasDriveCredentials()) {
    // Sem credenciais, `listFilesInFolder` devolve o nome do arquivo local como id.
    try {
      const local = path.join(process.cwd(), ".data", fileId);
      if (fs.existsSync(local)) {
        const text = fs.readFileSync(local, "utf8");
        if (text) return JSON.parse(text) as T;
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
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : null;
  } catch (err) {
    console.warn(`[DriveStorage] Erro ao ler ${name ?? fileId} por id:`, err);
    return null;
  }
}

/** Lê um arquivo JSON do Google Drive com fallback em cache */
export async function readDriveJson<T>(filename: string, parentId: string = DRIVE_ROOT_FOLDER_ID): Promise<T | null> {
  const cacheKey = `${parentId}:${filename}`;
  const mem = memoryCache.get(cacheKey);
  // Esse cache é por-isolate do Cloudflare Worker — uma escrita numa isolate
  // não invalida o cache de outra que já tinha lido o arquivo antes. Com
  // 15s de validade, uma aprovação recém-gravada podia ser respondida por
  // uma isolate diferente ainda servindo a versão de antes da aprovação —
  // exatamente o "aparece e desaparece" reportado no status dos ensaios.
  // Curto o bastante pra não ficar perceptível, mas ainda evita reler o
  // mesmo arquivo (ex.: os.json) várias vezes dentro da mesma leva de
  // requisições rápidas.
  if (mem && Date.now() - mem.timestamp < 2000) {
    return mem.data as T;
  }

  // 1. Tenta carregar do Google Drive
  if (hasDriveCredentials()) {
    try {
      // `resolveFileId` consulta memória e Supabase antes da busca por nome —
      // uma chamada a menos ao Drive na maioria das leituras.
      const fileId = await resolveFileId(filename, parentId);
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
