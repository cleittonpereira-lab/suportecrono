/**
 * Importação dos dados do app do Google Drive para o banco (D1).
 *
 * Uma pasta por chamada — assim cada requisição fica bem abaixo dos limites do
 * Worker (chamadas externas e tempo de CPU), mesmo com ~110 ensaios.
 *
 * Modos:
 *  - "simular":     só relata o que aconteceria; não grava nada, não envia foto.
 *  - "incluir":     inclui o que ainda não está no banco; nunca sobrescreve.
 *  - "sincronizar": sobrescreve o banco com o Drive. Só com a chave DADOS_NO_D1
 *                   desligada — ligada, o banco já é a fonte e isso apagaria o
 *                   que foi gravado depois.
 *
 * Fotos embutidas (objeto com `id` e `dataUrl` base64, sem `url`) viram arquivo
 * na pasta `fotos` do Drive, como as fotos novas já são. O nome do arquivo é
 * sempre o mesmo para a mesma foto, então repetir a importação reaproveita o
 * arquivo em vez de duplicar. Sem isso, o maior ensaio (2,5 MB) nem caberia no
 * banco (limite de ~2 MB por registro).
 */
import {
  DOCUMENTOS_DA_RAIZ,
  DRIVE_ROOT_FOLDER_ID,
  PASTAS_DE_DADOS,
  PASTA_D1_DA_RAIZ,
  ensureFolderPath,
  findFileInFolder,
  findFolder,
  lerJsonsDaPasta,
  readDriveJson,
  uploadPhotoBytes,
  type ArquivoListado,
} from "./driveStorage";
import {
  d1Ativo,
  exigirD1,
  gravarDocumento,
  incluirSeNaoExiste,
  lendoDoDrive,
  lerDocumento,
  obterD1,
  type D1Banco,
} from "./documentos-d1.server";

export type ModoImportacao = "simular" | "incluir" | "sincronizar";

export type RelatorioPasta = {
  pasta: string;
  modo: ModoImportacao;
  noDrive: number;
  homonimos: number;
  incluidos: number;
  atualizados: number;
  jaExistiam: number;
  fotosMovidas: number;
  bytesAntes: number;
  bytesDepois: number;
  grandesDemais: string[];
  erros: string[];
};

/** Pastas a importar, na ordem: as de dados e os documentos soltos da raiz. */
export const ALVOS_DA_IMPORTACAO: readonly string[] = [...PASTAS_DE_DADOS, PASTA_D1_DA_RAIZ];

const LIMITE_REGISTRO = 1_900_000;
/** Abaixo disso (caracteres), a imagem embutida fica onde está — ícones, assinaturas pequenas. */
const MINIMO_FOTO_EMBUTIDA = 20_000;

type EnvioDeFoto = (foto: { nome: string; mimeType: string; bytes: Uint8Array }) => Promise<string>;

function mensagem(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Cópia do documento com cada foto embutida trocada por um arquivo no Drive
 * (`url` preenchida, `dataUrl` vazia — a tela mostra `url || dataUrl`).
 */
export async function tirarFotosEmbutidas(
  dados: unknown,
  prefixo: string,
  enviar: EnvioDeFoto,
): Promise<{ dados: unknown; fotos: number }> {
  let fotos = 0;

  async function visitar(valor: unknown): Promise<unknown> {
    if (Array.isArray(valor)) {
      const out: unknown[] = [];
      for (const item of valor) out.push(await visitar(item));
      return out;
    }
    if (!valor || typeof valor !== "object") return valor;

    const o = valor as Record<string, unknown>;
    const dataUrl = typeof o.dataUrl === "string" ? o.dataUrl : "";
    const embutida =
      typeof o.id === "string" && !o.url && dataUrl.startsWith("data:") && dataUrl.length > MINIMO_FOTO_EMBUTIDA;
    const partes = embutida ? /^data:([^;]+);base64,(.*)$/s.exec(dataUrl) : null;
    if (partes) {
      fotos++;
      const mimeType = partes[1] || "image/jpeg";
      const ext = mimeType.split("/")[1]?.split("+")[0] || "jpg";
      const nome = `${prefixo}_${String(o.id).replace(/[^\w-]+/g, "_")}.${ext}`;
      const fileId = await enviar({ nome, mimeType, bytes: Uint8Array.from(Buffer.from(partes[2], "base64")) });
      return { ...o, url: `/api/photo/${fileId}`, dataUrl: "" };
    }

    const out: Record<string, unknown> = {};
    for (const [chave, v] of Object.entries(o)) out[chave] = await visitar(v);
    return out;
  }

  return { dados: await visitar(dados), fotos };
}

/** Reaproveita o arquivo se a mesma foto já foi enviada numa importação anterior. */
function envioIdempotente(pastaFotos: string): EnvioDeFoto {
  return async ({ nome, mimeType, bytes }) =>
    (await findFileInFolder(nome, pastaFotos)) ?? uploadPhotoBytes({ parentId: pastaFotos, name: nome, mimeType, bytes });
}

/** Havendo homônimos no Drive, fica o modificado por último — o mesmo critério de `readDriveJson`. */
function maisRecentePorNome<T>(lidos: { arquivo: ArquivoListado; data: T }[]): Map<string, T> {
  const porNome = new Map<string, { data: T; quando: string }>();
  for (const { arquivo, data } of lidos) {
    const quando = arquivo.modifiedTime ?? "";
    const atual = porNome.get(arquivo.name);
    if (!atual || quando > atual.quando) porNome.set(arquivo.name, { data, quando });
  }
  return new Map([...porNome].map(([nome, v]) => [nome, v.data]));
}

async function importarDocumento(
  db: D1Banco,
  modo: ModoImportacao,
  pasta: string,
  nome: string,
  dados: unknown,
  enviar: EnvioDeFoto,
  rel: RelatorioPasta,
): Promise<void> {
  const original = JSON.stringify(dados);
  rel.bytesAntes += original.length;

  const existe = (await lerDocumento(db, pasta, nome)) !== null;
  if (existe && modo !== "sincronizar") {
    rel.jaExistiam++;
    rel.bytesDepois += original.length;
    return;
  }

  const prefixo = `migr_${pasta}_${nome.replace(/\.json$/, "")}`;
  const { dados: limpo, fotos } = await tirarFotosEmbutidas(dados, prefixo, enviar);
  const tamanho = JSON.stringify(limpo).length;
  rel.fotosMovidas += fotos;
  rel.bytesDepois += tamanho;

  if (tamanho > LIMITE_REGISTRO) {
    rel.grandesDemais.push(`${nome} (${(tamanho / 1e6).toFixed(1)} MB)`);
    return;
  }
  if (modo === "simular") {
    if (existe) rel.jaExistiam++;
    else rel.incluidos++;
    return;
  }
  if (modo === "sincronizar") {
    await gravarDocumento(db, pasta, nome, limpo);
    if (existe) rel.atualizados++;
    else rel.incluidos++;
    return;
  }
  if (await incluirSeNaoExiste(db, pasta, nome, limpo)) rel.incluidos++;
  else rel.jaExistiam++;
}

/** Lê do Drive os documentos de um alvo (pasta de dados ou "raiz"). Pasta que não existe no Drive = nada a importar. */
async function lerDoDrive(alvo: string): Promise<{ lidos: Map<string, unknown>; total: number }> {
  if (alvo === PASTA_D1_DA_RAIZ) {
    const lidos = new Map<string, unknown>();
    for (const nome of DOCUMENTOS_DA_RAIZ) {
      const dados = await lendoDoDrive(() => readDriveJson<unknown>(nome, DRIVE_ROOT_FOLDER_ID));
      if (dados != null) lidos.set(nome, dados);
    }
    return { lidos, total: lidos.size };
  }
  // Só procura a pasta — `ensureFolderPath` criaria uma pasta vazia no Drive.
  const pastaDrive = await findFolder(alvo, DRIVE_ROOT_FOLDER_ID);
  if (!pastaDrive) return { lidos: new Map(), total: 0 };
  const arquivos = (await lendoDoDrive(() => lerJsonsDaPasta<unknown>(pastaDrive))).filter((l) =>
    l.arquivo.name.toLowerCase().endsWith(".json"),
  );
  return { lidos: maisRecentePorNome(arquivos), total: arquivos.length };
}

export async function importarAlvo(modo: ModoImportacao, alvo: string): Promise<RelatorioPasta> {
  if (!ALVOS_DA_IMPORTACAO.includes(alvo)) throw new Error(`Pasta desconhecida: ${alvo}`);
  if (modo === "sincronizar" && d1Ativo()) {
    throw new Error(
      "O banco já está ligado (DADOS_NO_D1=1): sincronizar apagaria o que foi gravado depois da importação. Use Incluir.",
    );
  }
  const db = exigirD1();
  const rel: RelatorioPasta = {
    pasta: alvo,
    modo,
    noDrive: 0,
    homonimos: 0,
    incluidos: 0,
    atualizados: 0,
    jaExistiam: 0,
    fotosMovidas: 0,
    bytesAntes: 0,
    bytesDepois: 0,
    grandesDemais: [],
    erros: [],
  };

  let lidos: Map<string, unknown>;
  try {
    const r = await lerDoDrive(alvo);
    lidos = r.lidos;
    rel.noDrive = r.total;
    rel.homonimos = r.total - r.lidos.size;
  } catch (err) {
    rel.erros.push(`Leitura do Drive: ${mensagem(err)}`);
    return rel;
  }

  // Simulando, nenhuma foto é enviada: o id devolvido só serve para medir o tamanho final.
  const enviar: EnvioDeFoto =
    modo === "simular"
      ? async () => "simulado"
      : envioIdempotente(await lendoDoDrive(() => ensureFolderPath(["fotos"])));

  for (const [nome, dados] of lidos) {
    try {
      await importarDocumento(db, modo, alvo, nome, dados, enviar, rel);
    } catch (err) {
      rel.erros.push(`${nome}: ${mensagem(err)}`);
    }
  }
  return rel;
}

export type SituacaoDoBanco = {
  configurado: boolean;
  ligado: boolean;
  alvos: string[];
  porPasta: { pasta: string; documentos: number; ultimaGravacao: string | null }[];
  erro: string | null;
};

export async function situacaoDoBanco(): Promise<SituacaoDoBanco> {
  const base = { alvos: [...ALVOS_DA_IMPORTACAO], porPasta: [], erro: null };
  const db = obterD1();
  if (!db) return { ...base, configurado: false, ligado: false };
  try {
    const { results = [] } = await db
      .prepare("SELECT pasta, COUNT(*) AS documentos, MAX(atualizado_em) AS ultima FROM documentos GROUP BY pasta ORDER BY pasta")
      .all<{ pasta: string; documentos: number; ultima: string | null }>();
    return {
      ...base,
      configurado: true,
      ligado: d1Ativo(),
      porPasta: results.map((r) => ({ pasta: r.pasta, documentos: Number(r.documentos), ultimaGravacao: r.ultima })),
    };
  } catch (err) {
    // Tabela ausente = migração do banco ainda não aplicada.
    return { ...base, configurado: true, ligado: d1Ativo(), erro: mensagem(err) };
  }
}
