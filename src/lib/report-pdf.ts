/**
 * Geração de PDF de laudo a partir das páginas renderizadas no DOM.
 *
 * Existiam 7 cópias quase idênticas de `buildReportPdfBlob` nas rotas de
 * relatório, e cada uma herdou os mesmos defeitos:
 *
 * - Sem `skipFonts`, o html-to-image tenta embutir toda fonte referenciada no
 *   documento (inclusive a "Sora" do Google Fonts carregada pelo app) com um
 *   fetch sem timeout. Numa rede ruim a geração travava para sempre — e como a
 *   tela só libera os botões no `finally`, ficava presa em "Gerando e salvando
 *   versão PDF…" com o "Verificar Laudo" desabilitado.
 * - As imagens (fotos, logo, assinatura) eram baixadas pelo próprio
 *   html-to-image, também sem timeout nem retentativa. Foto que falhava saía em
 *   branco no laudo, sem nenhum aviso.
 * - Só a rota do PERM.V tinha teto de tempo.
 *
 * O comprovante de recebimento (`components/chegada/recebimentoPdf.ts`) já
 * resolvia a maior parte disso; este módulo generaliza aquela implementação
 * para os laudos.
 */
import { toPng } from "html-to-image";
import { marcarAssinaturasNoPdf } from "./assinaturas-pdf";

/** Estilo aplicado pelo html-to-image a cada página no momento da captura. */
type EstiloDeCaptura = Partial<CSSStyleDeclaration>;

export interface OpcoesRasterizacao {
  /** Seletor das páginas dentro do container. Adensamento usa "[data-pdf-page]". */
  seletorPagina?: string;
  pixelRatio?: number;
  comprimir?: boolean;
  /** Estilo aplicado a cada página no momento da captura. */
  estiloPagina?: EstiloDeCaptura;
  /** Remove da captura os elementos marcados com `.no-print`. */
  ignorarNoPrint?: boolean;
  /**
   * Traz o container para a frente da tela (position: fixed) durante a
   * captura. Necessário quando ele fica fora da área visível.
   */
  reposicionar?: boolean;
  /** Número exato de páginas esperado; diferente disso é erro, não PDF parcial. */
  paginasEsperadas?: number;
  /**
   * Em revisão oficial (que vai ser assinada), foto que não carregou é erro:
   * um laudo assinado com um quadrado em branco no lugar da foto é pior que um
   * erro na tela. No PDF de rascunho, gera mesmo assim e avisa.
   */
  fotosObrigatorias?: boolean;
  /**
   * O miolo de cada folha tem `overflow: hidden`: o que não cabe é cortado sem
   * nenhum aviso — foi assim que laudos de PERM.V saíram sem o fim. Com "erro",
   * a geração é recusada se alguma folha estourar (revisão oficial); com
   * "ignorar", gera e devolve as folhas cortadas para quem chamou avisar.
   */
  aoEstourar?: "erro" | "ignorar";
  tetoPorPaginaMs?: number;
  tetoTotalMs?: number;
  onProgressoFoto?: (feitas: number, total: number) => void;
  onProgressoPagina?: (feita: number, total: number) => void;
}

/** O mesmo override que as rotas usavam — é o que produziu os laudos já assinados. */
export const ESTILO_PAGINA_LAUDO: EstiloDeCaptura = {
  transform: "none",
  margin: "0",
  padding: "5mm 8mm",
  width: "210mm",
  height: "297mm",
  maxWidth: "210mm",
  maxHeight: "297mm",
  boxSizing: "border-box",
  overflow: "hidden",
};

export class FotosNaoCarregaram extends Error {
  constructor(public readonly fotos: string[]) {
    super(
      `${fotos.length} imagem(ns) do laudo não carregaram depois de 3 tentativas. ` +
        "A revisão não foi gerada para não sair com imagem em branco. Verifique a conexão e tente de novo.",
    );
    this.name = "FotosNaoCarregaram";
  }
}

export type FolhaCortada = { folha: number; excessoPx: number };

export class ConteudoCortado extends Error {
  constructor(public readonly folhas: FolhaCortada[]) {
    super(
      `O conteúdo não coube em ${folhas.map((f) => `folha ${f.folha} (${f.excessoPx}px a mais)`).join(", ")} ` +
        "e sairia cortado no PDF. A revisão não foi gerada — avise o suporte.",
    );
    this.name = "ConteudoCortado";
  }
}

/**
 * Folhas cujo miolo tem mais conteúdo do que altura (o excedente seria cortado).
 * Sem `.report-content-area` (adensamento), mede a própria folha: ela tem
 * altura fixa de 297mm e a captura só pega essa área.
 */
export function medirEstouro(paginas: HTMLElement[]): FolhaCortada[] {
  const out: FolhaCortada[] = [];
  paginas.forEach((p, i) => {
    const area = p.querySelector<HTMLElement>(".report-content-area") ?? p;
    const excesso = area.scrollHeight - area.clientHeight;
    if (excesso > 1) out.push({ folha: i + 1, excessoPx: Math.ceil(excesso) });
  });
  return out;
}

export function comTeto<T>(p: Promise<T>, ms: number, oQue: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${oQue} passou de ${Math.round(ms / 1000)}s sem responder. Tente novamente.`)),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/** Espera o container offscreen existir — o React só o monta depois do setState que dispara a geração. */
export async function waitForOffscreenEl(
  getEl: () => HTMLElement | null,
  mensagem = "O laudo ainda não está pronto para gerar o PDF.",
): Promise<HTMLElement> {
  let el = getEl();
  for (let tries = 0; !el && tries < 40; tries++) {
    await new Promise((r) => setTimeout(r, 50));
    el = getEl();
  }
  if (!el) throw new Error(mensagem);
  return el;
}

/**
 * Confere que o Blob é de fato um PDF com conteúdo. Existe porque o adensamento
 * gravava, quando a captura falhava, um "PDF" de 45 bytes com o texto
 * "%PDF-1.4 ... Relatório Oficial Suporte INFRA" — e seguia salvando isso como
 * revisão, sem avisar ninguém.
 */
export async function assertPdfValido(blob: Blob, contexto: string, paginasMinimas = 1): Promise<void> {
  const cabecalho = await lerTexto(blob.slice(0, 5));
  if (cabecalho !== "%PDF-") throw new Error(`${contexto}: o arquivo gerado não é um PDF.`);
  // Uma página A4 rasterizada tem dezenas de KB; um documento só com a
  // estrutura do jsPDF tem cerca de 3 KB.
  if (blob.size < 5000) throw new Error(`${contexto}: o PDF gerado está vazio (${blob.size} bytes).`);
  const texto = await lerTexto(blob);
  const paginas = (texto.match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;
  if (paginas < paginasMinimas) {
    throw new Error(`${contexto}: o PDF tem ${paginas} página(s), esperado ao menos ${paginasMinimas}.`);
  }
}

async function lerTexto(blob: Blob): Promise<string> {
  if (typeof blob.text === "function") return blob.text();
  return new Response(blob).text();
}

async function lerComoDataUrl(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } finally {
    clearTimeout(t);
  }
}

async function lerComRetentativa(url: string): Promise<string> {
  let ultimo: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      return await lerComoDataUrl(url, 20_000);
    } catch (err) {
      ultimo = err;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw ultimo;
}

/**
 * Troca o `src` de toda imagem do laudo por um data URL já baixado, com
 * retentativa e concorrência limitada, antes da captura. Cobre fotos
 * (`/api/photo/...`), o logo e a assinatura — não só as fotos, como no
 * comprovante. Devolve quem falhou em vez de engolir.
 */
async function preCarregarImagens(
  el: HTMLElement,
  onProgresso?: (feitas: number, total: number) => void,
): Promise<{ restaurar: () => void; falharam: string[] }> {
  const imgs = Array.from(el.querySelectorAll<HTMLImageElement>("img")).filter((img) => {
    const src = img.getAttribute("src") || "";
    return src !== "" && !src.startsWith("data:");
  });
  const originais = imgs.map((img) => img.getAttribute("src") || "");
  const falharam: string[] = [];
  if (imgs.length === 0) return { restaurar: () => {}, falharam };

  let feitas = 0;
  let proxima = 0;
  async function trabalhador() {
    while (proxima < imgs.length) {
      const i = proxima++;
      try {
        imgs[i].src = await lerComRetentativa(originais[i]);
        await imgs[i].decode().catch(() => {});
      } catch {
        falharam.push(originais[i]);
      }
      feitas++;
      onProgresso?.(feitas, imgs.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, imgs.length) }, trabalhador));

  return {
    restaurar: () => imgs.forEach((img, i) => img.setAttribute("src", originais[i])),
    falharam,
  };
}

/** Dois quadros de composição, com teto — rAF pausa com a aba em segundo plano. */
function doisQuadros(): Promise<void> {
  return new Promise<void>((resolve) => {
    let feito = false;
    const fim = () => {
      if (!feito) {
        feito = true;
        resolve();
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(fim));
    setTimeout(fim, 400);
  });
}

/**
 * Espera os gráficos (recharts) desenharem: o ResponsiveContainer mede o pai
 * de forma assíncrona e só então cria o SVG. Capturar antes disso gera um
 * quadro vazio no lugar do gráfico.
 */
async function esperarGraficos(el: HTMLElement, tetoMs = 3000): Promise<void> {
  const inicio = Date.now();
  while (Date.now() - inicio < tetoMs) {
    const containers = el.querySelectorAll(".recharts-responsive-container");
    const desenhados = el.querySelectorAll(".recharts-responsive-container .recharts-surface");
    if (desenhados.length >= containers.length) return;
    await new Promise((r) => setTimeout(r, 50));
  }
}

export async function rasterizarRelatorioParaPdf(
  el: HTMLElement,
  opcoes: OpcoesRasterizacao = {},
): Promise<{ blob: Blob; fotosQueFalharam: string[]; folhasCortadas: FolhaCortada[] }> {
  if (import.meta.env.SSR) throw new Error("A geração de PDF só roda no navegador.");
  const {
    seletorPagina = ".printable-report",
    pixelRatio = 2.5,
    comprimir = true,
    estiloPagina = ESTILO_PAGINA_LAUDO,
    ignorarNoPrint = true,
    reposicionar = true,
    paginasEsperadas,
    fotosObrigatorias = false,
    aoEstourar = "ignorar",
    tetoPorPaginaMs = 60_000,
    tetoTotalMs = 180_000,
    onProgressoFoto,
    onProgressoPagina,
  } = opcoes;

  const estiloAnterior = {
    position: el.style.position,
    top: el.style.top,
    left: el.style.left,
    width: el.style.width,
    background: el.style.background,
    pointerEvents: el.style.pointerEvents,
    zIndex: el.style.zIndex,
    opacity: el.style.opacity,
    visibility: el.style.visibility,
  };
  if (reposicionar) {
    Object.assign(el.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "210mm",
      background: "#ffffff",
      pointerEvents: "none",
      zIndex: "2147483647",
      opacity: "1",
      visibility: "visible",
    });
  }

  let restaurarImagens: () => void = () => {};
  const inicio = Date.now();
  try {
    await doisQuadros();
    await new Promise((r) => setTimeout(r, 150));

    const paginas = Array.from(el.querySelectorAll<HTMLElement>(seletorPagina));
    if (paginas.length === 0) throw new Error("Nenhuma página do laudo foi renderizada.");
    if (paginasEsperadas != null && paginas.length !== paginasEsperadas) {
      throw new Error(`O laudo renderizou ${paginas.length} página(s), mas deveria ter ${paginasEsperadas}.`);
    }

    await esperarGraficos(el);
    const pre = await preCarregarImagens(el, onProgressoFoto);
    restaurarImagens = pre.restaurar;
    if (pre.falharam.length > 0 && fotosObrigatorias) throw new FotosNaoCarregaram(pre.falharam);

    const folhasCortadas = medirEstouro(paginas);
    if (folhasCortadas.length > 0 && aoEstourar === "erro") throw new ConteudoCortado(folhasCortadas);

    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: comprimir });
    for (let i = 0; i < paginas.length; i++) {
      if (Date.now() - inicio > tetoTotalMs) {
        throw new Error(`A geração do PDF passou de ${Math.round(tetoTotalMs / 1000)}s. Tente novamente.`);
      }
      const dataUrl = await comTeto(
        toPng(paginas[i], {
          pixelRatio,
          cacheBust: false,
          backgroundColor: "#ffffff",
          skipFonts: true,
          style: estiloPagina,
          filter: ignorarNoPrint
            ? (node) => !(node instanceof HTMLElement && node.classList.contains("no-print"))
            : undefined,
        }),
        tetoPorPaginaMs,
        `A renderização da página ${i + 1} de ${paginas.length} do laudo`,
      );
      if (i > 0) pdf.addPage("a4", "portrait");
      pdf.addImage(dataUrl, "PNG", 0, 0, 210, 297, undefined, "FAST");
      onProgressoPagina?.(i + 1, paginas.length);
    }

    marcarAssinaturasNoPdf(pdf, paginas);
    const blob = pdf.output("blob");
    await assertPdfValido(blob, "Geração do laudo", paginas.length);
    return { blob, fotosQueFalharam: pre.falharam, folhasCortadas };
  } finally {
    restaurarImagens();
    if (reposicionar) Object.assign(el.style, estiloAnterior);
  }
}
