/**
 * Assinaturas de verificação e aprovação no PDF do laudo.
 *
 * O PDF de uma revisão é gerado quando o digitador envia para verificação —
 * nesse momento só existe o nome dele. Verificador e aprovador assinavam
 * depois, no sistema, mas o PDF salvo no Drive nunca mudava: a Rev-00 de um
 * laudo aprovado continuava sem "Verificado por" e "Aprovado por".
 *
 * Como funciona:
 *  1. Na geração, os rodapés marcam onde vão os nomes (`data-assinatura`) e
 *     `marcarAssinaturasNoPdf` grava essas posições (em mm) dentro do próprio
 *     PDF, no campo Keywords.
 *  2. A cada etapa (verificar, aprovar, rejeitar), `carimbarAssinaturas`
 *     escreve o que falta — ou apaga o que foi desfeito — nessas posições e
 *     anota no PDF o que já está escrito. Repetir não muda nada.
 * As páginas continuam sendo a mesma imagem; só os nomes entram como texto.
 */

export type TipoAssinatura = "verificado" | "aprovado";
const TIPOS: TipoAssinatura[] = ["verificado", "aprovado"];

/** Posição de um campo de assinatura na folha A4, em mm a partir do canto superior esquerdo. */
export interface SlotAssinatura {
  tipo: TipoAssinatura;
  pagina: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tamanho da letra do rodapé, em mm. */
  fonte: number;
}

interface MarcasDoPdf {
  v: 1;
  slots: SlotAssinatura[];
  /** O que já está escrito em cada campo — para não reescrever à toa. */
  feito?: Partial<Record<TipoAssinatura, string>>;
}

const PREFIXO = "suportecrono-assinaturas:";

/**
 * Formata o nome de quem assinou (Verificado por / Aprovado por).
 * Se o nome corresponder a signatários com título profissional conhecido,
 * prefixa o título correspondente. Caso contrário, devolve o próprio nome.
 */
export function formatSignerName(name?: string | null): string {
  const raw = (name ?? "").trim();
  if (!raw) return "";
  if (/cleitton/i.test(raw) && /pereira/i.test(raw)) {
    return "Engº Geotécnico Cleitton Pereira";
  }
  return raw;
}

const arred = (n: number) => Math.round(n * 100) / 100;

/**
 * Mede, nas folhas renderizadas, onde ficam os campos `[data-assinatura]`.
 * A escala sai da largura da própria folha (210 mm), então vale também para
 * folhas reduzidas na tela.
 */
export function medirAssinaturas(paginas: HTMLElement[]): SlotAssinatura[] {
  const slots: SlotAssinatura[] = [];
  paginas.forEach((pagina, i) => {
    const pr = pagina.getBoundingClientRect();
    if (pr.width <= 0) return;
    const mmPorPx = 210 / pr.width;
    pagina.querySelectorAll<HTMLElement>("[data-assinatura]").forEach((el) => {
      const tipo = el.dataset.assinatura;
      if (tipo !== "verificado" && tipo !== "aprovado") return;
      // O campo vai do começo do nome até o fim da linha do rodapé.
      const linha = el.parentElement ?? el;
      const lr = linha.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      const px = parseFloat(getComputedStyle(el).fontSize) || 10;
      slots.push({
        tipo,
        pagina: i,
        x: arred((er.left - pr.left) * mmPorPx),
        y: arred((lr.top - pr.top) * mmPorPx),
        w: arred((lr.right - er.left) * mmPorPx),
        h: arred(lr.height * mmPorPx),
        fonte: arred(px * mmPorPx),
      });
    });
  });
  return slots;
}

/** Grava no PDF (jsPDF, antes do `output`) onde ficam os campos de assinatura das folhas. */
export function marcarAssinaturasNoPdf(
  pdf: { setProperties(p: { keywords?: string }): unknown },
  paginas: HTMLElement[],
): void {
  const slots = medirAssinaturas(paginas);
  if (slots.length === 0) return;
  const marcas: MarcasDoPdf = { v: 1, slots };
  pdf.setProperties({ keywords: PREFIXO + JSON.stringify(marcas) });
}

/** Os campos de uma linha de aprovação que o carimbo usa. */
export type AprovacaoDoPdf = {
  status?: string | null;
  verified_by_name?: string | null;
  verified_at?: string | null;
  decided_by_name?: string | null;
  decided_at?: string | null;
};

function dataBr(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/**
 * O que cada campo deve mostrar para esta aprovação: nome e data de quem
 * verificou/aprovou, ou vazio quando a etapa ainda não aconteceu (ou foi
 * desfeita por uma rejeição).
 */
export function assinaturasDaAprovacao(a: AprovacaoDoPdf | null | undefined): Record<TipoAssinatura, string> {
  const texto = (nome?: string | null, quando?: string | null) => {
    const n = formatSignerName(nome);
    if (!n) return "";
    const d = dataBr(quando);
    return d ? `${n} · ${d}` : n;
  };
  const verificada = !!a && (a.status === "pendente_aprovacao" || a.status === "verificado" || a.status === "aprovado");
  return {
    verificado: verificada ? texto(a?.verified_by_name, a?.verified_at) : "",
    aprovado: a?.status === "aprovado" ? texto(a.decided_by_name, a.decided_at) : "",
  };
}

function lerMarcas(keywords: string | undefined): MarcasDoPdf | null {
  if (!keywords) return null;
  const i = keywords.indexOf(PREFIXO);
  if (i === -1) return null;
  try {
    const m = JSON.parse(keywords.slice(i + PREFIXO.length)) as MarcasDoPdf;
    return m && Array.isArray(m.slots) ? m : null;
  } catch {
    return null;
  }
}

/** A fonte padrão do PDF só tem os caracteres do português ocidental: o resto perde o acento. */
function textoSeguro(fonte: { encodeText(t: string): unknown }, texto: string): string {
  if (!texto) return "";
  try {
    fonte.encodeText(texto);
    return texto;
  } catch {
    const semAcento = texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
    try {
      fonte.encodeText(semAcento);
      return semAcento;
    } catch {
      return semAcento.replace(/[^\x20-\x7E]/g, "?");
    }
  }
}

export type ResultadoCarimbo = {
  bytes: Uint8Array;
  /** O PDF foi alterado (quem chama deve regravá-lo). */
  mudou: boolean;
  /** PDF gerado antes das marcas: não há onde escrever. */
  semMarcas: boolean;
};

/** Escreve no PDF as assinaturas de `desejado` que ainda não estão lá. */
export async function carimbarAssinaturas(
  bytes: Uint8Array,
  desejado: Record<TipoAssinatura, string>,
): Promise<ResultadoCarimbo> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const marcas = lerMarcas(doc.getKeywords());
  if (!marcas || marcas.slots.length === 0) return { bytes, mudou: false, semMarcas: true };

  const feito = marcas.feito ?? {};
  const aplicar = TIPOS.filter((t) => (feito[t] ?? "") !== desejado[t]);
  if (aplicar.length === 0) return { bytes, mudou: false, semMarcas: false };

  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const PT = 72 / 25.4;
  const paginas = doc.getPages();
  for (const slot of marcas.slots) {
    if (!aplicar.includes(slot.tipo)) continue;
    const pagina = paginas[slot.pagina];
    if (!pagina) continue;
    const { width, height } = pagina.getSize();
    const sx = width / (210 * PT);
    const sy = height / (297 * PT);
    const x = slot.x * PT * sx;
    const topo = height - slot.y * PT * sy;
    const alt = slot.h * PT * sy;
    const larg = slot.w * PT * sx;
    // Fundo branco primeiro: apaga o que houver ali (nome anterior ou nada).
    pagina.drawRectangle({ x, y: topo - alt, width: larg, height: alt, color: rgb(1, 1, 1) });
    const texto = textoSeguro(fonte, desejado[slot.tipo]);
    if (!texto) continue;
    let tamanho = slot.fonte * PT * sy;
    const largura = fonte.widthOfTextAtSize(texto, tamanho);
    if (largura > larg) tamanho *= larg / largura;
    pagina.drawText(texto, { x, y: topo - alt * 0.78, size: tamanho, font: fonte, color: rgb(0.24, 0.24, 0.24) });
  }

  marcas.feito = { ...feito, ...Object.fromEntries(aplicar.map((t) => [t, desejado[t]])) };
  doc.setKeywords([PREFIXO + JSON.stringify(marcas)]);
  // Sem object streams: o PDF continua legível pela conferência de páginas de report-pdf.ts.
  const saida = await doc.save({ useObjectStreams: false });
  return { bytes: saida, mudou: true, semMarcas: false };
}
