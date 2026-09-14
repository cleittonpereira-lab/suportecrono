/**
 * Importação dos dados do app do Google Drive para o banco (D1).
 *
 * Em partes: no plano gratuito do Cloudflare, cada requisição pode fazer no
 * máximo 50 chamadas externas (o Drive conta), e a primeira simulação estourou
 * isso em lab-amostras (79 arquivos) e lab-ensaios (109). Cada chamada processa
 * uma fatia da pasta e devolve `proximo` — de onde continuar, ou null no fim.
 *
 * Modos:
 *  - "simular":     só relata o que aconteceria; não grava nada, não envia foto.
 *  - "incluir":     inclui o que ainda não está no banco; nunca sobrescreve (e
 *                   nem baixa do Drive o que já está lá).
 *  - "sincronizar": sobrescreve o banco com o Drive. Só com a chave DADOS_NO_D1
 *                   desligada — ligada, o banco já é a fonte e isso apagaria o
 *                   que foi gravado depois.
 *
 * Pastas homônimas (houve 16 `os-hub`) são lidas todas; de cada nome de
 * arquivo fica o modificado por último.
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
  listFilesInFolder,
  listarPastasComNome,
  readDriveJson,
  readDriveJsonListado,
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
  /** Arquivos .json encontrados no Drive (só na primeira parte; nas seguintes, 0). */
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
  /** Índice do próximo documento a processar, ou null quando a pasta terminou. */
  proximo: number | null;
};

/** Pastas a importar, na ordem: as de dados e os documentos soltos da raiz. */
export const ALVOS_DA_IMPORTACAO: readonly string[] = [...PASTAS_DE_DADOS, PASTA_D1_DA_RAIZ];

const LIMITE_REGISTRO = 1_900_000;
/** Abaixo disso (caracteres), a imagem embutida fica onde está — ícones, assinaturas pequenas. */
const MINIMO_FOTO_EMBUTIDA = 20_000;
/** Chamadas ao Drive por parte: o limite é 50 por requisição; o resto é margem. */
export const LIMITE_CHAMADAS_POR_PARTE = 40;

type EnvioDeFoto = (foto: { nome: string; mimeType: string; bytes: Uint8Array }) => Promise<string>;

function mensagem(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function estourouLimite(err: unknown): boolean {
  return /too many subrequests/i.test(mensagem(err));
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

/** De cada nome de arquivo, o modificado por último (em qualquer das pastas homônimas), em ordem de nome. */
function maisRecentePorNome(arquivos: ArquivoListado[]): ArquivoListado[] {
  const porNome = new Map<string, ArquivoListado>();
  for (const a of arquivos) {
    const atual = porNome.get(a.name);
    if (!atual || (a.modifiedTime ?? "") > (atual.modifiedTime ?? "")) porNome.set(a.name, a);
  }
  return [...porNome.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
}

function novoRelatorio(pasta: string, modo: ModoImportacao): RelatorioPasta {
  return {
    pasta,
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
    proximo: null,
  };
}

async function importarDocumento(
  db: D1Banco,
  modo: ModoImportacao,
  pasta: string,
  nome: string,
  obter: () => Promise<unknown>,
  enviar: EnvioDeFoto,
  rel: RelatorioPasta,
): Promise<void> {
  const existe = (await lerDocumento(db, pasta, nome)) !== null;
  // Incluindo, o que já está no banco nem é baixado do Drive: repetir é barato.
  if (existe && modo === "incluir") {
    rel.jaExistiam++;
    return;
  }

  const dados = await obter();
  if (dados == null) return; // apagado entre a listagem e a leitura
  const original = JSON.stringify(dados);
  rel.bytesAntes += original.length;

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

/** Os poucos JSON soltos na raiz cabem numa parte só. */
async function importarRaiz(db: D1Banco, modo: ModoImportacao, enviar: EnvioDeFoto): Promise<RelatorioPasta> {
  const rel = novoRelatorio(PASTA_D1_DA_RAIZ, modo);
  for (const nome of DOCUMENTOS_DA_RAIZ) {
    try {
      const dados = await lendoDoDrive(() => readDriveJson<unknown>(nome, DRIVE_ROOT_FOLDER_ID));
      if (dados == null) continue;
      rel.noDrive++;
      await importarDocumento(db, modo, PASTA_D1_DA_RAIZ, nome, async () => dados, enviar, rel);
    } catch (err) {
      rel.erros.push(`${nome}: ${mensagem(err)}`);
    }
  }
  return rel;
}

export async function importarAlvo(modo: ModoImportacao, alvo: string, inicio = 0): Promise<RelatorioPasta> {
  if (!ALVOS_DA_IMPORTACAO.includes(alvo)) throw new Error(`Pasta desconhecida: ${alvo}`);
  if (modo === "sincronizar" && d1Ativo()) {
    throw new Error(
      "O banco já está ligado (DADOS_NO_D1=1): sincronizar apagaria o que foi gravado depois da importação. Use Incluir.",
    );
  }
  const db = exigirD1();
  const chamadas = { usadas: 0 };

  // Simulando, nenhuma foto é enviada: o id devolvido só serve para medir o tamanho final.
  let enviar: EnvioDeFoto = async () => "simulado";
  if (modo !== "simular") {
    const envio = envioIdempotente(await lendoDoDrive(() => ensureFolderPath(["fotos"])));
    chamadas.usadas++;
    enviar = async (foto) => {
      chamadas.usadas += 2; // procura + envio
      return envio(foto);
    };
  }

  if (alvo === PASTA_D1_DA_RAIZ) return importarRaiz(db, modo, enviar);

  const rel = novoRelatorio(alvo, modo);
  let arquivos: ArquivoListado[];
  try {
    // Só procura — `ensureFolderPath` criaria uma pasta vazia no Drive.
    const pastas = await listarPastasComNome(alvo, DRIVE_ROOT_FOLDER_ID);
    chamadas.usadas++;
    arquivos = [];
    for (const pastaId of pastas) {
      arquivos.push(...(await listFilesInFolder(pastaId)).filter((a) => a.name.toLowerCase().endsWith(".json")));
      chamadas.usadas++;
    }
  } catch (err) {
    rel.erros.push(`Leitura do Drive: ${mensagem(err)}`);
    return rel;
  }

  const escolhidos = maisRecentePorNome(arquivos);
  if (inicio === 0) {
    rel.noDrive = arquivos.length;
    rel.homonimos = arquivos.length - escolhidos.length;
  }

  let i = inicio;
  for (; i < escolhidos.length; i++) {
    if (chamadas.usadas >= LIMITE_CHAMADAS_POR_PARTE) break;
    const arquivo = escolhidos[i];
    try {
      await importarDocumento(
        db,
        modo,
        alvo,
        arquivo.name,
        async () => {
          chamadas.usadas++;
          return readDriveJsonListado<unknown>(arquivo);
        },
        enviar,
        rel,
      );
    } catch (err) {
      // Limite estourado mesmo com a margem: para aqui e retoma deste documento.
      if (estourouLimite(err)) break;
      rel.erros.push(`${arquivo.name}: ${mensagem(err)}`);
    }
  }
  rel.proximo = i < escolhidos.length ? i : null;
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
