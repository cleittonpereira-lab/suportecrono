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
/**
 * Disjuntor do cache durável. Enquanto a tabela `drive_file_cache` não existir
 * (migração ainda não aplicada) ou o Supabase estiver fora, cada chamada custava
 * uma ida e volta inteira que sempre falhava — em TODA leitura por nome. Foi o
 * que deixou a abertura de um ensaio lenta. O supabase-js não lança quando a
 * tabela não existe: devolve `{ error }`, então o `catch` sozinho nunca
 * disparava. Na primeira falha, desliga o cache durável pelo resto da vida desta
 * isolate; a proteção entre isolates volta sozinha numa isolate nova.
 */
let cacheDuravelAtivo = true;

function desligarCacheDuravel(motivo: unknown): void {
  if (!cacheDuravelAtivo) return;
  cacheDuravelAtivo = false;
  console.warn(
    "[DriveStorage] Cache durável (drive_file_cache) indisponível, seguindo só com o Drive:",
    motivo instanceof Error ? motivo.message : motivo,
  );
}

type ErroSupabase = { message: string } | null;

/** Só as operações usadas aqui, sobre a tabela `drive_file_cache`. */
type TabelaCacheDuravel = {
  select(colunas: string): TabelaCacheDuravel;
  eq(coluna: string, valor: string): TabelaCacheDuravel;
  maybeSingle(): Promise<{ data: unknown; error: ErroSupabase }>;
  upsert(linha: Record<string, unknown>): Promise<{ error: ErroSupabase }>;
  delete(): { eq(coluna: string, valor: string): Promise<{ error: ErroSupabase }> };
};

/**
 * `drive_file_cache` ainda não existe nos tipos gerados do Supabase (a migração
 * não foi aplicada e os tipos não foram regenerados), então o cliente tipado
 * recusa o nome da tabela. Acesso sem tipo, restrito a esta única tabela, em vez
 * de espalhar `as any` pelas três funções.
 */
async function tabelaCacheDuravel(): Promise<TabelaCacheDuravel> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return (supabaseAdmin as unknown as { from(tabela: string): TabelaCacheDuravel }).from("drive_file_cache");
}

async function supabaseFileId(key: string): Promise<string | null> {
  if (!cacheDuravelAtivo) return null;
  try {
    const { data, error } = await (await tabelaCacheDuravel()).select("file_id").eq("key", key).maybeSingle();
    if (error) {
      desligarCacheDuravel(error.message);
      return null;
    }
    return (data as { file_id?: string } | null)?.file_id ?? null;
  } catch (err) {
    desligarCacheDuravel(err);
    return null;
  }
}

async function rememberFileId(key: string, fileId: string, parentId: string, name: string): Promise<void> {
  if (!cacheDuravelAtivo) return;
  try {
    const { error } = await (await tabelaCacheDuravel()).upsert({
      key, file_id: fileId, parent_id: parentId, name, updated_at: new Date().toISOString(),
    });
    if (error) desligarCacheDuravel(error.message);
  } catch (err) {
    // Melhor esforço: a escrita no Drive não pode falhar por causa do cache.
    desligarCacheDuravel(err);
  }
}

async function forgetFileId(key: string): Promise<void> {
  if (!cacheDuravelAtivo) return;
  try {
    const { error } = await (await tabelaCacheDuravel()).delete().eq("key", key);
    if (error) desligarCacheDuravel(error.message);
  } catch (err) {
    desligarCacheDuravel(err);
  }
}

/**
 * Só vale repetir o que pode dar certo na segunda vez: queda de rede, excesso
 * de requisições (429) e erro do servidor (5xx). 400/401/403 não mudam com
 * insistência — repetir só multiplicava a espera de quem estava na tela.
 */
class FalhaDefinitiva extends Error {}

function statusTransitorio(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Converte uma resposta não-ok em erro, marcando como definitivo o que não adianta repetir. */
function exigirOk(res: Response): void {
  if (res.ok) return;
  const msg = `HTTP ${res.status}`;
  if (!statusTransitorio(res.status)) throw new FalhaDefinitiva(msg);
  throw new Error(msg);
}

/**
 * Executa uma chamada ao Drive repetindo só as falhas que podem passar sozinhas.
 * Esgotadas as tentativas, ESTOURA — nunca devolve um valor "vazio" no lugar do
 * erro, porque é exatamente esse vazio que as camadas de cima confundiam com
 * "o arquivo não existe" e gravavam por cima.
 */
async function comRetentativa<T>(rotulo: string, fn: () => Promise<T>): Promise<T> {
  let ultimoErro: unknown;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    if (tentativa > 0) await new Promise((r) => setTimeout(r, 150 * tentativa));
    try {
      return await fn();
    } catch (err) {
      ultimoErro = err;
      if (err instanceof FalhaDefinitiva) break;
    }
  }
  throw new Error(`${rotulo}: ${ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro)}`);
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

/** Hash curto e estável (FNV-1a de 32 bits), para ids offline determinísticos. */
function hashCurto(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
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
  if (!hasDriveCredentials()) {
    // Offline, o "arquivo" é `.data/${pasta}_${nome}` — o mesmo nome que
    // `uploadBytesToDrive` grava e que `listFilesInFolder` lista. Antes isto
    // devolvia sempre vazio, e apagar/renomear offline nunca achava nada.
    const local = getLocalPath(`${parentId}_${name}`);
    return fs.existsSync(local) ? [{ id: path.basename(local) }] : [];
  }
  // Uma busca que FALHOU não pode responder "nenhum arquivo com esse nome":
  // quem escreve concluiria que o arquivo não existe e criaria outro. Era um dos
  // caminhos por onde nasciam os homônimos.
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
  if (!res.ok) throw new Error(`Falha ao buscar "${name}" no Drive: HTTP ${res.status}`);
  const data = (await res.json()) as { files?: { id: string; modifiedTime?: string }[] };
  return data.files ?? [];
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
  // Mesmo raciocínio da busca de arquivos: se a busca falha e isto responde
  // "não existe", `ensureFolderPath` cria uma pasta nova com o mesmo nome.
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
  if (!res.ok) throw new Error(`Falha ao buscar a pasta "${name}" no Drive: HTTP ${res.status}`);
  const data = (await res.json()) as { files?: { id: string }[] };
  return data.files?.[0]?.id ?? null;
}

export async function createFolder(name: string, parentId: string): Promise<string> {
  // Sem credenciais (desenvolvimento local), o id precisa ser o MESMO a cada
  // reinício do servidor: os arquivos offline são gravados como
  // `.data/${pastaId}_${nome}`, e com um id novo por reinício (`Date.now()`)
  // tudo o que tinha sido gravado antes sumia da listagem.
  if (!hasDriveCredentials()) return `local_folder_${hashCurto(`${parentId}/${name}`)}`;
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
  // Uma listagem parcial é pior que nenhuma: quem chama não tem como saber que
  // faltou arquivo, e o que faltou vira "não existe" na tela. Antes, um `break`
  // no meio da paginação devolvia silenciosamente as páginas já lidas, e o
  // catch devolvia o que tinha dado tempo de acumular. Agora, ou a lista sai
  // inteira, ou estoura.
  const out: { id: string; name: string }[] = [];
  let pageToken: string | undefined;
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

    type PaginaListagem = { files?: { id: string; name: string }[]; nextPageToken?: string };
    let data: PaginaListagem | null = null;
    let ultimoErro: unknown;
    for (let tentativa = 0; tentativa < 3 && !data; tentativa++) {
      if (tentativa > 0) await new Promise((r) => setTimeout(r, 150 * tentativa));
      try {
        const res = await fetch(`${DRIVE_V3}/files?${params.toString()}`, { method: "GET", headers: await driveHeaders() });
        if (!res.ok) {
          const msg = `HTTP ${res.status}`;
          if (!statusTransitorio(res.status)) throw new FalhaDefinitiva(msg);
          throw new Error(msg);
        }
        data = (await res.json()) as PaginaListagem;
      } catch (err) {
        ultimoErro = err;
        if (err instanceof FalhaDefinitiva) break;
      }
    }
    if (!data) {
      throw new Error(
        `Falha ao listar a pasta ${parentId} no Drive: ${
          ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro)
        }`,
      );
    }

    out.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

/** Apaga um arquivo do Drive pelo seu fileId. */
export async function deleteDriveFile(fileId: string): Promise<void> {
  if (!hasDriveCredentials()) {
    // Offline, o id é o nome do arquivo em `.data/` (ver listFilesInFolder).
    try {
      fs.unlinkSync(path.join(process.cwd(), ".data", path.basename(fileId)));
    } catch {}
    return;
  }
  // Falha ao apagar ESTOURA: antes era engolida, e quem chamava informava
  // "excluído" com o arquivo ainda no Drive — que voltava a aparecer no
  // carregamento seguinte. 404 = já não existe, que é o resultado desejado.
  const res = await fetch(`${DRIVE_V3}/files/${fileId}?supportsAllDrives=true`, {
    method: "DELETE",
    headers: await driveHeaders(),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Falha ao apagar o arquivo ${fileId} no Drive: HTTP ${res.status}`);
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
    const local = path.join(process.cwd(), ".data", fileId);
    if (!fs.existsSync(local)) return null;
    const text = fs.readFileSync(local, "utf8");
    return text ? (JSON.parse(text) as T) : null;
  }

  // Quem carrega a árvore do laboratório lê ~80 arquivos de uma vez. Se um
  // tropeço isolado estourasse direto, a árvore inteira falharia — trocaríamos
  // "silenciosamente errado" por "nada carrega", que numa tela que atualiza a
  // cada 8s é igualmente inútil. Tentar de novo resolve a falha passageira sem
  // voltar a mentir que o arquivo não existe.
  let ultimoErro: unknown;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    if (tentativa > 0) await new Promise((r) => setTimeout(r, 150 * tentativa));
    try {
      const res = await fetch(`${DRIVE_V3}/files/${fileId}?alt=media&supportsAllDrives=true`, {
        method: "GET",
        headers: await driveHeaders(),
      });

      // 404 é a ÚNICA resposta que significa "este arquivo não existe" — só ela
      // vira null, e sem repetir. Devolver null numa falha transitória seria
      // indistinguível de ausência, e quem chama filtra os nulos: o ensaio
      // sumia da lista e a linha caía para "Em Digitação". Foi assim que laudos
      // aprovados apareceram como rascunho, sem erro nenhum na tela.
      if (res.status === 404) return null;
      if (!res.ok) {
        const msg = `HTTP ${res.status}`;
        if (!statusTransitorio(res.status)) throw new FalhaDefinitiva(msg);
        throw new Error(msg);
      }
      const text = await res.text();
      return text ? (JSON.parse(text) as T) : null;
    } catch (err) {
      ultimoErro = err;
      if (err instanceof FalhaDefinitiva) break;
    }
  }
  throw new Error(
    `Falha ao ler ${name ?? fileId} do Drive: ${
      ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro)
    }`,
  );
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

  // 1. Google Drive
  //
  // `null` aqui significa UMA coisa só: o arquivo não existe. Antes, qualquer
  // falha (rede, 5xx, Worker sem CPU) também virava `null`, e todo
  // read-modify-write tratava isso como "arquivo novo" e gravava por cima — foi
  // assim que laudos aprovados perderam `reportApprovals`, fotos e payload.
  // Agora a falha estoura, e quem ia gravar por cima não grava.
  if (hasDriveCredentials()) {
    // `resolveFileId` consulta memória e Supabase antes da busca por nome.
    const fileId = await resolveFileId(filename, parentId);
    if (!fileId) return null;

    let parsed = await readDriveJsonById<T>(fileId, filename);
    if (parsed === null) {
      // O id resolvido (em cache) aponta para um arquivo que sumiu — apagado ou
      // movido por fora. Isso não prova que o arquivo não existe: busca de novo.
      fileIdCache.delete(cacheKey);
      void forgetFileId(cacheKey);
      const freshId = await findFileInFolder(filename, parentId);
      if (!freshId || freshId === fileId) return null;
      fileIdCache.set(cacheKey, freshId);
      parsed = await readDriveJsonById<T>(freshId, filename);
      if (parsed === null) return null;
    }

    memoryCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
    return parsed;
  }

  // 2. Sem credenciais do Drive (desenvolvimento local): disco em `.data/`.
  try {
    // Mesmo nome que `uploadBytesToDrive` grava offline: prefixado pela pasta.
    // A cópia sem prefixo (de versões anteriores) só serve de reserva: ela
    // colidia entre pastas que têm arquivos de mesmo nome.
    const prefixado = getLocalPath(`${parentId}_${filename}`);
    const local = fs.existsSync(prefixado) ? prefixado : getLocalPath(filename);
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

  // Grava no Google Drive — erro é propagado (não mascarado como sucesso),
  // para que quem chamou perceba a falha e tente novamente. Offline,
  // `uploadBytesToDrive` grava em `.data/${pasta}_${nome}`. (A cópia sem
  // prefixo de pasta que existia aqui colidia entre pastas.)
  const fileId = await uploadBytesToDrive({
    parentId,
    name: filename,
    mimeType: "application/json",
    bytes,
    overwrite: true,
  });
  // Cache só depois de gravado: antes era atualizado ANTES do upload, e uma
  // gravação que falhava ainda era servida como salva nas leituras seguintes.
  memoryCache.set(cacheKey, { data, timestamp: Date.now() });
  return { ok: true, fileId };
}

/**
 * Ler-alterar-gravar um JSON com a leitura e a escrita no mesmo lock.
 *
 * Vários caminhos gravam o MESMO arquivo de ensaio (rascunho, aprovações,
 * comentários, labStore), cada um com seu próprio "lê, altera, grava". Quem
 * tinha lido antes de outro gravar regravava a versão antiga por cima — foi
 * um caminho por onde aprovações sumiam. Aqui:
 *  - a leitura acontece dentro do lock, depois de qualquer escrita anterior
 *    na mesma chave ter terminado;
 *  - a leitura ignora o cache de 2s, que pode estar servindo uma versão
 *    anterior a uma escrita feita em outra isolate.
 *
 * `alterar` recebe o conteúdo atual (null = arquivo não existe) e devolve o
 * novo conteúdo, ou null para não gravar nada. Pode lançar para abortar.
 * NÃO chame `atualizarDriveJson` para o mesmo arquivo de dentro de `alterar`:
 * a mesma chave espera por si mesma e trava.
 *
 * A chave usa o prefixo `rmw:` porque `uploadBytesToDrive` (chamado por
 * `writeDriveJson`) já trava com `${pasta}:${nome}` por dentro; reusar essa
 * chave faria o lock externo esperar o interno para sempre.
 */
export async function atualizarDriveJson<T>(
  filename: string,
  parentId: string,
  alterar: (atual: T | null) => T | null | Promise<T | null>,
): Promise<T | null> {
  return withKeyLock(`rmw:${parentId}:${filename}`, async () => {
    memoryCache.delete(`${parentId}:${filename}`);
    const atual = await readDriveJson<T>(filename, parentId);
    const proximo = await alterar(atual);
    if (proximo === null) return atual;
    await writeDriveJson(filename, proximo, parentId);
    return proximo;
  });
}
