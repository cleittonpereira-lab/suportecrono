/**
 * Tira do quadro de Chegada de Amostras as imagens antigas guardadas como texto
 * (data URL base64) e as salva como arquivo na pasta `fotos` do Drive — o mesmo
 * formato que as chegadas registradas desde 26/08 já usam (`/api/photo/<id>`).
 *
 * O quadro é um registro só: 1,69 MB, dos quais 1,66 MB são 8 imagens de
 * registros de 26/08 a 02/09 (fotos e assinaturas) — perto do limite de ~1,9 MB
 * por registro do banco. A tela mostra as imagens pelo endereço e o PDF do
 * comprovante já pré-carrega `/api/photo/...` (recebimentoPdf.ts), então nada
 * muda para quem usa.
 */
import { DRIVE_ROOT_FOLDER_ID, atualizarDriveJson, ensureFolderPath, findFileInFolder, readDriveJson, uploadPhotoBytes } from "./driveStorage";

const ARQUIVO_QUADRO = "_chegada-amostras.json";
/** Abaixo disso (caracteres) a imagem fica onde está. */
const MINIMO = 5_000;
/** Imagens por chamada: cada uma custa 2 chamadas ao Drive (procura + envio), e o limite é 50 por requisição. */
export const IMAGENS_POR_CHAMADA = 15;

type Foto = { url?: string; [k: string]: unknown };
type Tarefa = {
  id: string;
  images?: string[];
  amostras?: { fotos?: Foto[]; [k: string]: unknown }[];
  assinaturaCliente?: { imagemUrl?: string; [k: string]: unknown } | null;
  [k: string]: unknown;
};
export type Quadro = { tasks: Record<string, Tarefa[]>; rev?: number; updatedAt?: string; [k: string]: unknown };

export type ImagemEmbutida = { dataUrl: string; nome: string; mimeType: string };

/** Hash curto e estável (FNV-1a de 32 bits) — a mesma imagem sempre gera o mesmo nome de arquivo. */
function hashCurto(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Imagens em texto do quadro, sem repetição: a mesma imagem às vezes aparece
 * em `images` e nas fotos da amostra (os campos antigos são derivados dos novos).
 */
export function imagensEmbutidas(quadro: Quadro): ImagemEmbutida[] {
  const vistas = new Map<string, ImagemEmbutida>();
  const considerar = (tarefaId: string, s: unknown) => {
    if (typeof s !== "string" || !s.startsWith("data:image/") || s.length < MINIMO || vistas.has(s)) return;
    const mimeType = /^data:([^;]+);base64,/.exec(s)?.[1] ?? "image/jpeg";
    const ext = mimeType.split("/")[1]?.split("+")[0] || "jpg";
    vistas.set(s, { dataUrl: s, mimeType, nome: `migr_chegada_${tarefaId.replace(/[^\w-]+/g, "_")}_${hashCurto(s)}.${ext}` });
  };
  for (const tarefas of Object.values(quadro.tasks ?? {})) {
    for (const t of tarefas ?? []) {
      for (const s of t.images ?? []) considerar(t.id, s);
      for (const a of t.amostras ?? []) for (const f of a.fotos ?? []) considerar(t.id, f.url);
      considerar(t.id, t.assinaturaCliente?.imagemUrl);
    }
  }
  return [...vistas.values()];
}

/** Cópia do quadro com cada imagem em texto já enviada trocada pelo endereço do arquivo. */
export function trocarImagens(quadro: Quadro, enderecos: Map<string, string>): { quadro: Quadro; trocadas: number } {
  let trocadas = 0;
  const trocar = (s: string | undefined): string | undefined => {
    if (s && enderecos.has(s)) {
      trocadas++;
      return enderecos.get(s);
    }
    return s;
  };
  const tasks = Object.fromEntries(
    Object.entries(quadro.tasks ?? {}).map(([coluna, tarefas]) => [
      coluna,
      (tarefas ?? []).map((t) => ({
        ...t,
        ...(t.images ? { images: t.images.map((s) => trocar(s) as string) } : {}),
        ...(t.amostras
          ? { amostras: t.amostras.map((a) => (a.fotos ? { ...a, fotos: a.fotos.map((f) => ({ ...f, url: trocar(f.url) })) } : a)) }
          : {}),
        ...(t.assinaturaCliente?.imagemUrl
          ? { assinaturaCliente: { ...t.assinaturaCliente, imagemUrl: trocar(t.assinaturaCliente.imagemUrl) } }
          : {}),
      })),
    ]),
  );
  return { quadro: { ...quadro, tasks }, trocadas };
}

export type RelatorioChegada = {
  imagensEmbutidas: number;
  enviadas: number;
  trocadas: number;
  bytesAntes: number;
  bytesDepois: number;
  /** Imagens em texto que ainda ficaram no quadro (chame de novo até zerar). */
  restantes: number;
};

async function lerQuadro(): Promise<Quadro> {
  const quadro = await readDriveJson<Quadro>(ARQUIVO_QUADRO, DRIVE_ROOT_FOLDER_ID);
  if (!quadro) throw new Error("Quadro de Chegada de Amostras não encontrado.");
  return quadro;
}

export async function tirarImagensDoQuadro(simular: boolean): Promise<RelatorioChegada> {
  const quadro = await lerQuadro();
  const embutidas = imagensEmbutidas(quadro);
  const bytesAntes = JSON.stringify(quadro).length;

  if (simular) {
    const falsos = new Map(embutidas.map((e, i) => [e.dataUrl, `/api/photo/simulado-${i}`]));
    const { quadro: depois, trocadas } = trocarImagens(quadro, falsos);
    return {
      imagensEmbutidas: embutidas.length,
      enviadas: 0,
      trocadas,
      bytesAntes,
      bytesDepois: JSON.stringify(depois).length,
      restantes: embutidas.length,
    };
  }

  const lote = embutidas.slice(0, IMAGENS_POR_CHAMADA);
  const pastaFotos = await ensureFolderPath(["fotos"]);
  const enderecos = new Map<string, string>();
  for (const img of lote) {
    const bytes = Uint8Array.from(Buffer.from(img.dataUrl.slice(img.dataUrl.indexOf(",") + 1), "base64"));
    // Nome fixo por imagem: repetir reaproveita o arquivo em vez de duplicar.
    const fileId =
      (await findFileInFolder(img.nome, pastaFotos)) ??
      (await uploadPhotoBytes({ parentId: pastaFotos, name: img.nome, mimeType: img.mimeType, bytes }));
    enderecos.set(img.dataUrl, `/api/photo/${fileId}`);
  }

  // Troca com trava (atômica no banco): quem salvou o quadro no meio não é
  // sobrescrito, e a troca é pelo texto exato da imagem, então reaplicar sobre o
  // quadro mais novo é seguro. A revisão do quadro sobe: uma aba aberta com o
  // quadro antigo recebe "conflito" ao salvar, em vez de gravar as imagens em
  // texto de volta.
  const resultado = { trocadas: 0, bytesDepois: bytesAntes, restantes: embutidas.length };
  await atualizarDriveJson<Quadro>(ARQUIVO_QUADRO, DRIVE_ROOT_FOLDER_ID, (atual) => {
    if (!atual) throw new Error("Quadro de Chegada de Amostras não encontrado.");
    const { quadro: novo, trocadas } = trocarImagens(atual, enderecos);
    const final: Quadro | null =
      trocadas > 0
        ? { ...novo, rev: (typeof atual.rev === "number" ? atual.rev : 0) + 1, updatedAt: new Date().toISOString() }
        : null;
    const efetivo = final ?? atual;
    resultado.trocadas = trocadas;
    resultado.bytesDepois = JSON.stringify(efetivo).length;
    resultado.restantes = imagensEmbutidas(efetivo).length;
    return final;
  });

  return { imagensEmbutidas: embutidas.length, enviadas: lote.length, bytesAntes, ...resultado };
}
