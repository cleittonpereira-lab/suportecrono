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
import {
  apagarDocumento,
  atualizarDocumento,
  d1Ativo,
  exigirD1,
  gravarDocumento,
  lerDocumento,
  lerDocumentos,
  listarDocumentos,
} from "./documentos-d1.server";

export const DRIVE_ROOT_FOLDER_ID = "0AB6VPuj1fWHEUk9PVA";
const DRIVE_V3 = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive"];

/**
 * Pastas de DADOS do app. Com o D1 ligado (`d1Ativo`), os JSON delas viram
 * registros no banco (documentos-d1.server.ts); fotos, PDFs e as pastas das OS
 * continuam no Drive. Para elas, `ensureFolderPath` devolve um id lógico
 * (`d1:<pasta>`), e cada função deste arquivo desvia pelo prefixo — quem chama
 * não muda nada.
 */
export const PASTAS_DE_DADOS: readonly string[] = [
  "lab-os",
  "lab-amostras",
  "lab-ensaios",
  "lab-pendencias",
  "lab-kv",
  "usuarios",
  "os-hub",
  "sample-uploads",
  "lab-capsulas",
];
/** JSON soltos na raiz do Drive que também são dados do app. */
export const DOCUMENTOS_DA_RAIZ: readonly string[] = [
  "_chegada-amostras.json",
  "programacao_db.json",
  "schedule_edits.json",
  "_lab-state.json",
];
export const PASTA_D1_DA_RAIZ = "raiz";
const PREFIXO_PASTA_D1 = "d1:";
const PREFIXO_DOC_D1 = "d1doc:";

/** Onde este JSON mora no D1 (pasta, nome) — ou null se ele mora no Drive. */
function docNoD1(parentId: string, nome: string): { pasta: string; nome: string } | null {
  if (parentId.startsWith(PREFIXO_PASTA_D1)) return { pasta: parentId.slice(PREFIXO_PASTA_D1.length), nome };
  if (parentId === DRIVE_ROOT_FOLDER_ID && DOCUMENTOS_DA_RAIZ.includes(nome) && d1Ativo()) {
    return { pasta: PASTA_D1_DA_RAIZ, nome };
  }
  return null;
}

function idDocD1(pasta: string, nome: string): string {
  return `${PREFIXO_DOC_D1}${pasta}/${nome}`;
}

/** O inverso de `idDocD1`: null quando o id é de um arquivo do Drive. */
function docDoId(fileId: string): { pasta: string; nome: string } | null {
  if (!fileId.startsWith(PREFIXO_DOC_D1)) return null;
  const resto = fileId.slice(PREFIXO_DOC_D1.length);
  const barra = resto.indexOf("/");
  return barra > 0 ? { pasta: resto.slice(0, barra), nome: resto.slice(barra + 1) } : null;
}

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
  const noD1 = docNoD1(parentId, name);
  if (noD1) {
    const doc = await lerDocumento(exigirD1(), noD1.pasta, noD1.nome);
    return doc ? [{ id: idDocD1(noD1.pasta, noD1.nome) }] : [];
  }
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
  // Pasta de dados com o D1 ligado: id lógico, sem ir ao Drive.
  if (parts.length === 1 && PASTAS_DE_DADOS.includes(parts[0].trim()) && d1Ativo()) {
    return `${PREFIXO_PASTA_D1}${parts[0].trim()}`;
  }
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

/**
 * Arquivo listado numa pasta. `version` é o contador do próprio Drive, que sobe
 * a cada alteração do arquivo — é o que permite saber, sem baixar nada, se o
 * conteúdo mudou desde a última leitura (ver `readDriveJsonListado`).
 */
export type ArquivoListado = { id: string; name: string; version?: string; modifiedTime?: string };

/** Lista todos os arquivos (não-pasta) dentro de uma pasta do Drive, com paginação. */
export async function listFilesInFolder(parentId: string): Promise<ArquivoListado[]> {
  if (parentId.startsWith(PREFIXO_PASTA_D1)) {
    const pasta = parentId.slice(PREFIXO_PASTA_D1.length);
    // `version` com a data: um documento apagado e recriado volta a rev 1, e o
    // cliente que guardava "rev 1" do anterior não pode achar que nada mudou.
    return (await listarDocumentos(exigirD1(), pasta)).map((d) => ({
      id: idDocD1(pasta, d.nome),
      name: d.nome,
      version: `${d.rev}@${d.atualizadoEm}`,
      modifiedTime: d.atualizadoEm,
    }));
  }
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
  const out: ArquivoListado[] = [];
  let pageToken: string | undefined;
  do {
    const q = `'${parentId}' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`;
    const params = new URLSearchParams({
      q,
      fields: "nextPageToken,files(id,name,version,modifiedTime)",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      corpora: "drive",
      driveId: DRIVE_ROOT_FOLDER_ID,
    });
    if (pageToken) params.set("pageToken", pageToken);

    type PaginaListagem = { files?: ArquivoListado[]; nextPageToken?: string };
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
  const doc = docDoId(fileId);
  if (doc) {
    await apagarDocumento(exigirD1(), doc.pasta, doc.nome);
    return;
  }
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

/**
 * Até este tamanho, o envio vai em UMA requisição (upload multipart; o limite
 * do Drive para ele é 5 MB) em vez das duas do resumível. Toda gravação de
 * rascunho, status, aprovação ou pendência pagava uma ida e volta a mais.
 */
const LIMITE_MULTIPART = 4 * 1024 * 1024;

async function uploadBytesMultipart(opts: {
  parentId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  existingId: string | null;
}): Promise<string> {
  const isUpdate = !!opts.existingId;
  const url = isUpdate
    ? `${DRIVE_UPLOAD}/${opts.existingId}?uploadType=multipart&supportsAllDrives=true`
    : `${DRIVE_UPLOAD}?uploadType=multipart&supportsAllDrives=true`;
  const metadata = isUpdate ? {} : { name: opts.name, parents: [opts.parentId] };

  const fronteira = `suportecrono_${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  const enc = new TextEncoder();
  const inicio = enc.encode(
    `--${fronteira}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${fronteira}\r\nContent-Type: ${opts.mimeType}\r\n\r\n`,
  );
  const fim = enc.encode(`\r\n--${fronteira}--`);
  const corpo = new Uint8Array(inicio.length + opts.bytes.length + fim.length);
  corpo.set(inicio, 0);
  corpo.set(opts.bytes, inicio.length);
  corpo.set(fim, inicio.length + opts.bytes.length);

  const res = await fetch(url, {
    method: isUpdate ? "PATCH" : "POST",
    headers: await driveHeaders({ "Content-Type": `multipart/related; boundary=${fronteira}` }),
    body: corpo as BodyInit,
  });
  if (!res.ok) {
    throw new Error(`Drive multipart upload error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return ((await res.json()) as { id: string }).id;
}

/** Envia pelo caminho mais curto que o tamanho permite. */
function enviarBytes(opts: {
  parentId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  existingId: string | null;
}): Promise<string> {
  return opts.bytes.length <= LIMITE_MULTIPART ? uploadBytesMultipart(opts) : uploadBytesResumable(opts);
}

export async function uploadBytesToDrive(opts: {
  parentId: string;
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  overwrite?: boolean;
}): Promise<string> {
  if (opts.parentId.startsWith(PREFIXO_PASTA_D1)) {
    throw new Error(`"${opts.name}" é um arquivo, e a pasta ${opts.parentId} é de dados no banco. Arquivos vão para uma pasta do Drive.`);
  }
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
    return enviarBytes({ ...opts, existingId: null });
  }

  const key = `${opts.parentId}:${opts.name}`;
  return withKeyLock(key, async () => {
    const existingId = await resolveFileId(opts.name, opts.parentId);
    try {
      const id = await enviarBytes({ ...opts, existingId });
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
      const id = await enviarBytes({ ...opts, existingId: freshId });
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
  return enviarBytes({ ...opts, existingId: null });
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
  const doc = docDoId(fileId);
  if (doc) return (await lerDocumento<T>(exigirD1(), doc.pasta, doc.nome))?.dados ?? null;
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

/**
 * Conteúdo já baixado nesta isolate, por fileId, com a `version` do Drive de
 * quando foi baixado.
 *
 * A árvore do laboratório, a Central de Emissões e as pendências liam TODOS os
 * arquivos da pasta a cada consulta — ~215 downloads a cada 8s por aba aberta,
 * 4,7 MB só em lab-ensaios (77% disso fotos em base64). A listagem já traz a
 * `version` de cada arquivo; se ela não mudou, o conteúdo também não, e o
 * download é dispensável. A validação é exata (a `version` sobe a cada
 * alteração), não por tempo.
 *
 * O objeto devolvido é compartilhado entre requisições: quem lê NÃO pode
 * alterá-lo.
 */
const conteudoPorVersao = new Map<string, { version: string; data: unknown }>();
const LIMITE_CONTEUDO_EM_CACHE = 2000;

function guardarConteudo(fileId: string, version: string, data: unknown): void {
  // Reinserir move a entrada para o fim: a mais antiga é a primeira a sair.
  conteudoPorVersao.delete(fileId);
  conteudoPorVersao.set(fileId, { version, data });
  if (conteudoPorVersao.size > LIMITE_CONTEUDO_EM_CACHE) {
    const maisAntiga = conteudoPorVersao.keys().next().value;
    if (maisAntiga !== undefined) conteudoPorVersao.delete(maisAntiga);
  }
}

/** Lê um JSON já listado, baixando só se a `version` for diferente da que está em cache. */
export async function readDriveJsonListado<T>(arquivo: ArquivoListado): Promise<T | null> {
  const emCache = arquivo.version ? conteudoPorVersao.get(arquivo.id) : undefined;
  if (emCache && emCache.version === arquivo.version) return emCache.data as T;
  const data = await readDriveJsonById<T>(arquivo.id, arquivo.name);
  if (data !== null && arquivo.version) guardarConteudo(arquivo.id, arquivo.version, data);
  return data;
}

/** Roda `fn` sobre `items` com no máximo `limite` chamadas em voo ao mesmo tempo. */
export async function mapComConcorrencia<T, R>(items: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = new Array(items.length);
  let proximo = 0;
  async function trabalhador() {
    while (proximo < items.length) {
      const i = proximo++;
      resultados[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, () => trabalhador()));
  return resultados;
}

/**
 * Lê os JSONs de `arquivos` (8 downloads em voo), reaproveitando o que não
 * mudou. Arquivo apagado entre a listagem e o download (404) fica de fora.
 */
export async function lerJsonsListados<T>(arquivos: ArquivoListado[]): Promise<{ arquivo: ArquivoListado; data: T }[]> {
  // Documentos do D1: uma consulta por pasta (em lotes), não uma por arquivo.
  const nomesPorPasta = new Map<string, string[]>();
  for (const a of arquivos) {
    const doc = docDoId(a.id);
    if (doc) nomesPorPasta.set(doc.pasta, [...(nomesPorPasta.get(doc.pasta) ?? []), doc.nome]);
  }
  const lidos = new Map<string, T>();
  for (const [pasta, nomes] of nomesPorPasta) {
    for (const [nome, d] of await lerDocumentos<T>(exigirD1(), pasta, nomes)) lidos.set(idDocD1(pasta, nome), d.dados);
  }

  const doDrive = arquivos.filter((a) => !docDoId(a.id));
  const baixados = await mapComConcorrencia(doDrive, 8, async (arquivo) => {
    const data = await readDriveJsonListado<T>(arquivo);
    if (data !== null) lidos.set(arquivo.id, data);
  });
  void baixados;

  const out: { arquivo: ArquivoListado; data: T }[] = [];
  for (const arquivo of arquivos) {
    if (lidos.has(arquivo.id)) out.push({ arquivo, data: lidos.get(arquivo.id) as T });
  }
  return out;
}

/** Lista a pasta e lê todos os JSONs dela — ver `lerJsonsListados`. */
export async function lerJsonsDaPasta<T>(folderId: string): Promise<{ arquivo: ArquivoListado; data: T }[]> {
  return lerJsonsListados<T>(await listFilesInFolder(folderId));
}

/** `version` atual de um arquivo — resposta de poucos bytes. null = o arquivo não existe. */
async function lerVersao(fileId: string): Promise<string | null> {
  const res = await fetch(`${DRIVE_V3}/files/${fileId}?fields=version&supportsAllDrives=true`, {
    method: "GET",
    headers: await driveHeaders(),
  });
  if (res.status === 404) return null;
  exigirOk(res);
  return ((await res.json()) as { version?: string }).version ?? null;
}

/**
 * Como `readDriveJson`, para arquivo grande consultado com frequência — o quadro
 * de Chegada de Amostras (1,7 MB) era baixado inteiro a cada 2,5s por aba
 * aberta. Pergunta ao Drive só a `version` e baixa o conteúdo apenas se ele
 * mudou desde a última leitura nesta isolate. A consulta é por id, então é
 * consistente: nunca devolve uma versão anterior a uma gravação concluída.
 */
export async function readDriveJsonSeMudou<T>(filename: string, parentId: string = DRIVE_ROOT_FOLDER_ID): Promise<T | null> {
  // No D1 a leitura já é uma consulta barata e sempre atual.
  if (docNoD1(parentId, filename) || !hasDriveCredentials()) return readDriveJson<T>(filename, parentId);
  const fileId = await resolveFileId(filename, parentId);
  if (!fileId) return null;
  const version = await comRetentativa(`Falha ao consultar ${filename} no Drive`, () => lerVersao(fileId));
  // Id em cache apontando para um arquivo que sumiu: o caminho completo resolve de novo.
  if (version === null) return readDriveJson<T>(filename, parentId);
  return readDriveJsonListado<T>({ id: fileId, name: filename, version });
}

/** Lê um arquivo JSON do Google Drive com fallback em cache */
export async function readDriveJson<T>(filename: string, parentId: string = DRIVE_ROOT_FOLDER_ID): Promise<T | null> {
  const noD1 = docNoD1(parentId, filename);
  if (noD1) return (await lerDocumento<T>(exigirD1(), noD1.pasta, noD1.nome))?.dados ?? null;
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
  const noD1 = docNoD1(parentId, filename);
  if (noD1) {
    await gravarDocumento(exigirD1(), noD1.pasta, noD1.nome, data);
    return { ok: true, fileId: idDocD1(noD1.pasta, noD1.nome) };
  }
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
  // No D1 a trava é do banco, entre qualquer servidor — não só desta isolate.
  const noD1 = docNoD1(parentId, filename);
  if (noD1) return atualizarDocumento<T>(exigirD1(), noD1.pasta, noD1.nome, alterar);
  return withKeyLock(`rmw:${parentId}:${filename}`, async () => {
    memoryCache.delete(`${parentId}:${filename}`);
    const atual = await readDriveJson<T>(filename, parentId);
    const proximo = await alterar(atual);
    if (proximo === null) return atual;
    await writeDriveJson(filename, proximo, parentId);
    return proximo;
  });
}
