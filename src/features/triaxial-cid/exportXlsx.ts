/**
 * Excel (.xlsx) do Triaxial UU — espelho do PDF do relatório, página por página.
 *
 * Cada folha A4 do PDF vira um bloco de linhas com altura fixa (813 pt), separado
 * por quebra de página. A grade tem 60 colunas de 12 px (720 px ≈ largura útil
 * da folha), e cada bloco do PDF é uma ou mais células mescladas nessa grade.
 * Os gráficos entram como imagem PNG (mesmo traçado do Recharts do PDF) e as
 * fotos do registro fotográfico também.
 *
 * Só roda no navegador (gráficos e fotos usam canvas).
 */
import type ExcelJS from "exceljs";
import type { EnvelopeResult, SpecimenResults, TriaxialSample, TriaxialSpecimen } from "./types";
import { mohrCirclePoints } from "./domain/calc";
import { ACCENT, BRAND } from "./constants";
import { axisDomainAndTicks, equalTicks, renderChartPng, renderFotoPng, type ChartSeries, type ChartSpec } from "./chartCanvas";
import { fotosPublicadas } from "@/features/lab/photos";
import type { Photo } from "@/features/lab/types";
import { formatSignerName } from "@/lib/assinaturas-pdf";
import { GLOSSARIO_UU_1, GLOSSARIO_UU_2, GLOSSARIO_UU_CONVENCAO, GLOSSARIO_UU_REFERENCIAS } from "./glossario-uu";

// ---------------------------------------------------------------------------
// Parâmetros
// ---------------------------------------------------------------------------

/** Limites dos eixos definidos na tela (0 = automático), iguais aos do PDF. */
export interface TriaxialAxisCfg {
  eaMax: number; qMax: number; sigmaDMax: number;
  evMin: number; evMax: number;
  pMax: number;
  sigmaMax: number; tauMax: number;
  sqrtTMax: number; dvMax: number;
  dvShearMin: number; dvShearMax: number;
  eModMax: number;
  ratioMax: number;
}

/** Amostra do relatório, já com coordenadas e aprovações da revisão em curso (como no PDF). */
export type ExportSample = TriaxialSample & {
  coordN?: number | string;
  coordE?: number | string;
  coordCota?: number | string;
  coordDatum?: string;
  verifiedBy?: string;
  approvedBy?: string;
};

export interface ExportTriaxialUuParams {
  sample: ExportSample;
  /** CPs na ordem do relatório (já com `displayId`). */
  specimens: TriaxialSpecimen[];
  results: SpecimenResults[];
  envelope: EnvelopeResult | null;
  envelopePts: { pPrime: number; q: number; cp: string }[];
  photos?: Photo[];
  axisCfg?: Partial<TriaxialAxisCfg>;
  /** Pula gráficos e fotos (usado nos testes, que rodam fora do navegador). */
  semGraficos?: boolean;
}

// ---------------------------------------------------------------------------
// Medidas da folha (pt = 1/72 pol.; px = 1/96 pol.; 1 px = 0,75 pt)
// ---------------------------------------------------------------------------

const COLS = 60;
const COL_PX = 12;
/** Largura em caracteres que o Excel converte em ~12 px por coluna. */
const COL_WIDTH = COL_PX / 7;
const PX_TO_PT = 0.75;
const ptToPx = (pt: number) => pt / PX_TO_PT;

/** 297 mm − 2 × 5 mm de margem vertical do PDF, em pt. */
const PAGE_PT = 813;
/** Alturas do cabeçalho: faixa do título, 3 linhas de campos, descrição e granulometria. */
const HEADER_ROWS = [56, 14, 14, 14, 16, 14];
/** Alturas do rodapé: espaço, 4 linhas da assinatura, faixa preta e carimbo. */
const FOOTER_ROWS = [4, 24, 10, 9, 13, 22, 9];
const HEADER_PT = HEADER_ROWS.reduce((a, b) => a + b, 0);
const FOOTER_PT = FOOTER_ROWS.reduce((a, b) => a + b, 0);
const CONTENT_PT = PAGE_PT - HEADER_PT - FOOTER_PT;

const FONT = "Segoe UI";
const INK = "FF141414";
const WHITE = "FFFFFFFF";
const MUTED = "FF6B6B6B";
const STAMP = "FF8C8C8C";
const FRAME = "FF141414";
const CELL_BORDER = "FF727272";
const BOX_BORDER = "FF9C9C9C";
const SECTION_BG = "FFD1D5DB";
const SECTION_BORDER = "FF9CA3AF";
const SECTION_INK = "FF111827";
const HEAD_BG = "FFF2F2F2";
const TITLE_BG = "FFE7E7E7";
const LIGHT_BG = "FFF3F4F6";
const GROUP_BG = "FFE5E7EB";
const GLOSS_LINE = "FFE5E7EB";
const ENVELOPE_INK = "FF8A6F4C";

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

// ---------------------------------------------------------------------------
// Texto e números — mesma formatação do relatório
// ---------------------------------------------------------------------------

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

const coordsText = (s: ExportSample) => {
  const parts: string[] = [];
  if (s.coordN) parts.push(`N: ${s.coordN}`);
  if (s.coordE) parts.push(`E: ${s.coordE}`);
  if (s.coordCota) parts.push(`Cota: ${s.coordCota} m`);
  if (s.coordDatum) parts.push(`(${s.coordDatum})`);
  return parts.length > 0 ? parts.join(" | ") : "—";
};

/** Data e hora de São Paulo, como no rodapé do PDF. */
function dataSaoPaulo() {
  const months = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = parseInt(get("day"), 10);
  const month = parseInt(get("month"), 10) - 1;
  const year = parseInt(get("year"), 10);
  return {
    todayPt: `${day} de ${months[month]} de ${year}`,
    stampPt: `${String(day).padStart(2, "0")}/${String(month + 1).padStart(2, "0")}/${year} ${get("hour")}:${get("minute")}`,
  };
}

const REPORT_TITLE = "ENSAIO TRIAXIAL NÃO CONSOLIDADO NÃO DRENADO (UU)";
const NORMS = [
  { text: "ASTM D2850-15 — Unconsolidated-Undrained Triaxial Compression Test on Cohesive Soils", italic: false },
  { text: "NBR 12770 — Solo coesivo — Determinação da resistência à compressão não confinada", italic: true },
];
const NOTA =
  "Os resultados apresentados referem-se exclusivamente à amostra ensaiada. A reprodução deste documento somente poderá ser feita na íntegra, após aprovação prévia e por escrito da empresa.";
const RESPONSAVEL_GERENTE = "Tecnº Geotécnico Carlos Christian da Silva";
const NOTA_UU_POROPRESSAO =
  "Poropressão medida durante o cisalhamento não drenado (leitura direta). No UU a análise é em tensões totais: a poropressão não entra no cálculo da envoltória.";

// ---------------------------------------------------------------------------
// Estilo de célula
// ---------------------------------------------------------------------------

type Align = "left" | "center" | "right";
interface Style {
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fill?: string;
  align?: Align;
  valign?: "top" | "middle" | "bottom";
  wrap?: boolean;
}
/** Trecho de texto com formatação própria dentro de uma célula. */
interface Run extends Style {
  t: string;
}

const fontOf = (s: Style): Partial<ExcelJS.Font> => ({
  name: FONT,
  size: s.size ?? 7.5,
  bold: s.bold,
  italic: s.italic,
  underline: s.underline,
  color: { argb: s.color ?? INK },
});

function richOf(runs: Run[], base: Style): ExcelJS.CellRichTextValue {
  return {
    richText: runs.map((r) => ({
      text: r.t,
      font: fontOf({
        size: r.size ?? base.size,
        bold: r.bold ?? base.bold,
        italic: r.italic ?? base.italic,
        underline: r.underline,
        color: r.color ?? base.color,
      }),
    })),
  } as ExcelJS.CellRichTextValue;
}

// ---------------------------------------------------------------------------
// Contexto da planilha e das páginas
// ---------------------------------------------------------------------------

interface Ctx {
  wb: ExcelJS.Workbook;
  ws: ExcelJS.Worksheet;
  row: number;
  used: number;
  pageNo: number;
  total: number;
  sample: ExportSample;
  semGraficos: boolean;
  logoId: number | null;
  logoPx: { w: number; h: number };
  sigId: number | null;
  sigPx: { w: number; h: number };
  /** Fotos já carregadas, pela URL usada no registro (ver `caixaFoto`). */
  fotos: Map<string, HTMLImageElement>;
  warnings: string[];
}

/** Escreve valor (texto ou trechos) numa área mesclada da grade. */
function put(cx: Ctx, r1: number, c1: number, r2: number, c2: number, value: string | Run[], style: Style = {}) {
  if (r1 !== r2 || c1 !== c2) cx.ws.mergeCells(r1, c1, r2, c2);
  const cell = cx.ws.getCell(r1, c1);
  if (Array.isArray(value)) {
    cell.value = richOf(value, style);
  } else {
    cell.value = value;
    cell.font = fontOf(style) as ExcelJS.Font;
  }
  cell.alignment = {
    horizontal: style.align ?? "left",
    vertical: style.valign ?? "middle",
    wrapText: style.wrap ?? true,
  };
  if (style.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.fill } };
}

/** Desenha bordas nas laterais indicadas da área (r1..r2, c1..c2). */
function edge(
  cx: Ctx,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  sides: ("top" | "bottom" | "left" | "right")[] | "all",
  color = CELL_BORDER,
  style: "thin" | "medium" = "thin",
) {
  const s: string[] = sides === "all" ? ["top", "bottom", "left", "right"] : sides;
  const spec = { style, color: { argb: color } } as ExcelJS.Border;
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = cx.ws.getCell(r, c);
      const b: Partial<ExcelJS.Borders> = { ...(cell.border ?? {}) };
      if (s.includes("top") && r === r1) b.top = spec;
      if (s.includes("bottom") && r === r2) b.bottom = spec;
      if (s.includes("left") && c === c1) b.left = spec;
      if (s.includes("right") && c === c2) b.right = spec;
      cell.border = b;
    }
  }
}

/** Cria uma linha com altura fixa; `conta` diz se ela entra no miolo da página. */
function newRow(cx: Ctx, hPt: number, conta = true): number {
  const r = cx.row++;
  cx.ws.getRow(r).height = hPt;
  if (conta) cx.used += hPt;
  return r;
}

const restante = (cx: Ctx) => CONTENT_PT - cx.used;

// ---------------------------------------------------------------------------
// Blocos comuns: cabeçalho, rodapé e barras de seção
// ---------------------------------------------------------------------------

function cabecalho(cx: Ctx) {
  const s = cx.sample;
  const rb = newRow(cx, HEADER_ROWS[0], false);
  // Logo centralizado na faixa esquerda (16 colunas = 27 % da largura).
  if (cx.logoId != null) {
    const w = Math.min(cx.logoPx.w, 16 * COL_PX - 8);
    const h = 40;
    cx.ws.addImage(cx.logoId, {
      tl: { col: (16 * COL_PX - w) / 2 / COL_PX, row: rb - 1 + (ptToPx(HEADER_ROWS[0]) - h) / 2 / ptToPx(HEADER_ROWS[0]) },
      ext: { width: w, height: h },
      editAs: "oneCell",
    });
  }
  put(cx, rb, 17, rb, COLS, [
    { t: "RELATÓRIO DE ENSAIO", bold: true, underline: true, size: 9 },
    { t: `\n${REPORT_TITLE}`, bold: true, size: 8.6 },
    ...NORMS.map((n) => ({ t: `\n${n.text}`, italic: n.italic, size: 7.1 })),
  ], { align: "center", size: 7.5 });
  edge(cx, rb, 17, rb, 17, ["left"], FRAME);

  const campos: [string, unknown, string, unknown, string, unknown][] = [
    ["Cliente:", s.client, "Furo:", s.borehole, "Prof. (m):", s.depth],
    ["Obra:", s.workNumber, "Código:", s.code, "O.S.:", s.os],
    ["Local:", s.local, "Amostra:", s.reportNumber, "Revisão:", s.revision],
  ];
  for (const [l1, v1, l2, v2, l3, v3] of campos) {
    const r = newRow(cx, HEADER_ROWS[1], false);
    put(cx, r, 1, r, 20, [{ t: `${l1}`, bold: true }, { t: ` ${v1 ?? ""}` }], { size: 7.5 });
    put(cx, r, 21, r, 40, [{ t: `${l2}`, bold: true }, { t: ` ${v2 ?? ""}` }], { size: 7.5 });
    put(cx, r, 41, r, 60, [{ t: `${l3}`, bold: true }, { t: ` ${v3 ?? ""}` }], { size: 7.5 });
  }

  const rd = newRow(cx, HEADER_ROWS[4], false);
  put(cx, rd, 1, rd, 40, [{ t: "Descrição Tátil-Visual:", bold: true }, { t: ` ${s.description || "—"}`, italic: true }], { size: 7.5 });
  put(cx, rd, 41, rd, 60, [{ t: "Coordenadas:", bold: true }, { t: ` ${coordsText(s)}` }], { size: 7.5 });

  const rg = newRow(cx, HEADER_ROWS[5], false);
  put(cx, rg, 1, rg, 40, [{ t: "Descrição Granulométrica:", bold: true }, { t: ` ${s.granulometricDescription || "—"}`, italic: true }], { size: 7.5 });
  put(cx, rg, 41, rg, 60, [{ t: "Folha:", bold: true }, { t: ` ${cx.pageNo} / ${cx.total}`, bold: true }], { size: 7.5, align: "right" });

  // Moldura do cabeçalho (1 px no PDF).
  edge(cx, rb, 1, rb, COLS, ["top"], FRAME);
  edge(cx, rb + 1, 1, rb + 1, COLS, ["top"], FRAME);
  edge(cx, rd, 1, rd, COLS, ["top"], FRAME);
  edge(cx, rb, 1, rg, 1, ["left"], FRAME);
  edge(cx, rb, COLS, rg, COLS, ["right"], FRAME);
  edge(cx, rg, 1, rg, COLS, ["bottom"], FRAME);
}

function rodape(cx: Ctx) {
  const s = cx.sample;
  const { todayPt, stampPt } = dataSaoPaulo();
  newRow(cx, FOOTER_ROWS[0], false);
  const f1 = newRow(cx, FOOTER_ROWS[1], false);
  const f2 = newRow(cx, FOOTER_ROWS[2], false);
  const f3 = newRow(cx, FOOTER_ROWS[3], false);
  const f4 = newRow(cx, FOOTER_ROWS[4], false);

  put(cx, f1, 1, f4, 20, [
    { t: `São Paulo, ${todayPt}`, bold: true, size: 6.4 },
    { t: `\nContrato nº ${s.os || "—"} · Revisão ${s.revision ?? "0"}`, size: 6, color: MUTED },
    { t: "\nOperador (Laboratorista): ", size: 5.6, color: MUTED }, { t: s.operator ?? "", size: 5.6 },
    { t: "\nDigitado por: ", size: 5.6, color: MUTED }, { t: s.typedBy ?? "", size: 5.6 },
    { t: "\nVerificado por: ", size: 5.6, color: MUTED }, { t: formatSignerName(s.verifiedBy), size: 5.6 },
    { t: "\nAprovado por: ", size: 5.6, color: MUTED }, { t: formatSignerName(s.approvedBy), size: 5.6 },
    { t: "\nGerente de Laboratório: ", size: 5.6, color: MUTED }, { t: RESPONSAVEL_GERENTE, size: 5.6 },
  ], { valign: "top" });

  put(cx, f3, 21, f3, 40, "RESPONSÁVEL TÉCNICO", { size: 5.6, color: MUTED, align: "center" });
  put(cx, f4, 21, f4, 40, s.technicalResp ?? "", { size: 6, bold: true, align: "center" });
  edge(cx, f2, 21, f2, 40, ["top"], CELL_BORDER);
  if (cx.sigId != null) {
    const h = 28;
    const w = Math.round((cx.sigPx.w / cx.sigPx.h) * h);
    cx.ws.addImage(cx.sigId, {
      tl: { col: 20 + (20 * COL_PX - w) / 2 / COL_PX, row: f1 - 1 + 2 / ptToPx(FOOTER_ROWS[1]) },
      ext: { width: w, height: h },
      editAs: "oneCell",
    });
  }

  put(cx, f1, 41, f4, 60, [
    { t: "NOTA", bold: true, size: 5.6, color: INK },
    { t: `\n${NOTA}`, size: 5.6, color: MUTED },
  ], { valign: "top" });

  const bn = newRow(cx, FOOTER_ROWS[5], false);
  put(cx, bn, 1, bn, 40, [
    { t: "SUPORTE INFRA — LABORATÓRIO DE ENSAIOS ESPECIAIS", bold: true },
    { t: "\nAv. Camélia Borges Narciso, 582 · Bela São Pedro · São Pedro/SP · CEP 13.520-000" },
  ], { size: 5.6, color: WHITE, fill: INK });
  put(cx, bn, 41, bn, 60, "http://www.suportesolos.com.br\ncontato@suportesolos.com.br", {
    size: 5.6, color: WHITE, fill: INK, align: "right",
  });

  const st = newRow(cx, FOOTER_ROWS[6], false);
  put(cx, st, 1, st, COLS, `Relatório gerado em: São Paulo, SP - Brasil · ${stampPt}`, {
    size: 4.1, italic: true, color: STAMP, align: "right",
  });
}

function inicioPagina(cx: Ctx, pageNo: number) {
  cx.pageNo = pageNo;
  cx.used = 0;
  cabecalho(cx);
}

function fimPagina(cx: Ctx) {
  const sobra = CONTENT_PT - cx.used;
  if (sobra < -0.5) cx.warnings.push(`Folha ${cx.pageNo}: conteúdo passou ${(-sobra).toFixed(1)} pt da área útil`);
  if (sobra > 0.05) newRow(cx, sobra);
  rodape(cx);
  cx.ws.getRow(cx.row - 1).addPageBreak();
}

/** Barra cinza de seção (SectionBar do PDF). */
function barra(cx: Ctx, texto: string, style: Style = {}) {
  const r = newRow(cx, 16);
  put(cx, r, 1, r, COLS, texto.toUpperCase(), {
    size: 7.9, bold: true, color: SECTION_INK, align: "center", fill: style.fill ?? SECTION_BG, ...style,
  });
  edge(cx, r, 1, r, COLS, "all", SECTION_BORDER);
}

/** Imagem PNG presa à área de uma linha da grade. */
function imagem(cx: Ctx, base64: string, col1: number, row: number, wPx: number, hPx: number) {
  const id = cx.wb.addImage({ base64, extension: "png" });
  cx.ws.addImage(id, {
    tl: { col: col1 - 1, row: row - 1 },
    ext: { width: Math.round(wPx), height: Math.round(hPx) },
    editAs: "oneCell",
  });
}

/** Gráfico que ocupa a largura inteira de uma linha de `hPt` pt. */
function graficoLinha(cx: Ctx, hPt: number, col1: number, col2: number, monta: (wPx: number, hPx: number) => ChartSpec) {
  const r = newRow(cx, hPt);
  if (cx.semGraficos) return r;
  const wPx = (col2 - col1 + 1) * COL_PX;
  const hPx = ptToPx(hPt);
  const b64 = renderChartPng(monta(wPx, hPx));
  if (b64) imagem(cx, b64, col1, r, wPx, hPx);
  else cx.warnings.push(`Gráfico da folha ${cx.pageNo} não pôde ser desenhado`);
  return r;
}

// ---------------------------------------------------------------------------
// Dados derivados — mesmas contas do PDF
// ---------------------------------------------------------------------------

interface Derivados {
  cfg: TriaxialAxisCfg;
  alphaDeg: number;
  /** Umidade final, S final e demais valores por CP, na mesma ordem dos specimens. */
  porCp: {
    sf: number | null;
    eFinal: number;
    failCrit: string;
  }[];
}

function derivar(p: ExportTriaxialUuParams): Derivados {
  const cfg: TriaxialAxisCfg = {
    eaMax: 0, qMax: 0, sigmaDMax: 0, evMin: 0, evMax: 0, pMax: 0, sigmaMax: 0, tauMax: 0,
    sqrtTMax: 0, dvMax: 0, dvShearMin: 0, dvShearMax: 0, eModMax: 0, ratioMax: 0,
    ...(p.axisCfg ?? {}),
  };
  const porCp = p.specimens.map((cp, i) => {
    const r = p.results[i];
    const evShearLast = r.shearCurve.length > 0 ? r.shearCurve[r.shearCurve.length - 1].evPct : 0;
    const evConsPct = r.V0 > 0 ? (r.dVcons / r.V0) * 100 : 0;
    const eFinal = (1 + r.e0) * (1 - (evConsPct + evShearLast) / 100) - 1;
    const sf = cp.wFinalPct != null && eFinal > 0 && p.sample.Gs > 0 ? (cp.wFinalPct * p.sample.Gs) / eFinal : null;
    const failCrit = cp.failureCriterion === "max_ratio" ? "Máx. Obliquidade (σ1'/σ3')" : "Máx. t = (σ1−σ3)/2";
    return { sf, eFinal, failCrit };
  });
  const alphaDeg = p.envelope ? (Math.atan(p.envelope.M) * 180) / Math.PI : 0;
  return { cfg, alphaDeg, porCp };
}

/** Largura de cada grupo de CPs dentro das colunas 21..60, distribuídas igualmente. */
function faixasCps(n: number): [number, number][] {
  if (n <= 0) return [];
  const total = 40;
  const base = Math.floor(total / n);
  const sobra = total - base * n;
  const out: [number, number][] = [];
  let c = 21;
  for (let i = 0; i < n; i++) {
    const w = base + (i < sobra ? 1 : 0);
    out.push([c, c + w - 1]);
    c += w;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------------

/** Linha de tabela (Parâmetros do ensaio / correção). */
function linhaTabela(cx: Ctx, rotulo: string, valor: string) {
  const r = newRow(cx, 14);
  put(cx, r, 1, r, 27, rotulo, { bold: true, size: 7.5 });
  put(cx, r, 28, r, COLS, valor, { size: 7.5 });
  edge(cx, r, 1, r, COLS, "all", CELL_BORDER);
}

function paginaCapa(cx: Ctx, p: ExportTriaxialUuParams) {
  const cp0 = p.specimens[0];
  const s = p.sample;
  barra(cx, "Parâmetros e Condições do Ensaio");
  const condicoes: [string, string][] = [
    ["Equipamento Utilizado", (s.equipment && s.equipment.trim()) || "—"],
    ["Tipo do Ensaio", "Compressão Triaxial Não Consolidado Não Drenado - UU"],
    ["Norma Adotada", "ASTM D2850:2015 / NBR 12770"],
    ["Tipo da Amostra", s.sampleType ?? "—"],
    ["Condição do Ensaio", "Ensaio não consolidado, não drenado (sem saturação/adensamento controlados)"],
    ["Dimensões Características da Amostra", s.specDimensions ?? "—"],
    ["Número de Corpos de Prova", String(p.specimens.length)],
  ];
  condicoes.forEach(([a, b]) => linhaTabela(cx, a, b));

  newRow(cx, 8);
  barra(cx, "Parâmetros de Correção");
  const correcao: [string, string][] = [
    ["Espessura da Membrana [cm]", cp0?.espMembrana != null ? fmt(cp0.espMembrana, 3) : "—"],
    ["Módulo de Elasticidade da Membrana [MPa]", fmt(s.membraneE / 1000, 2)],
    ["Força de Atrito do Pistão [kgf]", cp0?.fAtritoPistao != null ? fmt(cp0.fAtritoPistao, 2) : "—"],
    ["Massa sobre o corpo de prova [g]", cp0?.mSobreCP != null ? fmt(cp0.mSobreCP, 2) : "—"],
    ["Altura do topcap [cm]", cp0?.hTopcap != null ? fmt(cp0.hTopcap, 2) : "—"],
    ["Área do Pistão [cm²]", cp0?.aPistao != null ? fmt(cp0.aPistao, 2) : "—"],
    ["Massa Específica da Água [g/cm³]", fmt(s.rhoW, 3)],
    ["Resistência do Papel Filtro [kN/m]", s.filterPaperResistance != null ? fmt(s.filterPaperResistance, 2) : "0,00"],
  ];
  correcao.forEach(([a, b]) => linhaTabela(cx, a, b));
}

function paginaResumo(cx: Ctx, p: ExportTriaxialUuParams, d: Derivados) {
  const s = p.sample;
  const faixas = faixasCps(p.specimens.length);
  const rhoS = s.Gs * s.rhoW;

  const titulo = newRow(cx, 15);
  put(cx, titulo, 1, titulo, COLS, "QUADRO RESUMO DOS RESULTADOS", { size: 8.25, bold: true, align: "center", fill: TITLE_BG });
  edge(cx, titulo, 1, titulo, COLS, "all", FRAME);

  const cab = newRow(cx, 16);
  put(cx, cab, 1, cab, 20, "Característica da Amostra", { size: 6.4, bold: true, fill: HEAD_BG });
  p.specimens.forEach((cp, i) => {
    const [c1, c2] = faixas[i];
    put(cx, cab, c1, cab, c2, `${cp.displayId ?? cp.id} · σ3=${fmt(cp.sigma3Target, 0)} kPa`, {
      size: 6.4, bold: true, color: argb(cp.color ?? BRAND), align: "center", fill: HEAD_BG,
    });
  });
  edge(cx, cab, 1, cab, COLS, "all", CELL_BORDER);

  const linha = (rotulo: string, unidade: string | undefined, valores: string[]) => {
    const r = newRow(cx, 12);
    put(cx, r, 1, r, 20, [{ t: rotulo }, ...(unidade ? [{ t: ` [${unidade}]`, color: MUTED }] : [])], { size: 6.4 });
    faixas.forEach(([c1, c2], i) => put(cx, r, c1, r, c2, valores[i] ?? "—", { size: 6.4, align: "center" }));
    edge(cx, r, 1, r, COLS, "all", CELL_BORDER);
  };

  const cps = p.specimens.map((cp, i) => ({ cp, r: p.results[i], x: d.porCp[i] }));
  linha("Altura Inicial, h₀", "mm", cps.map((c) => fmt(c.cp.H0, 2)));
  linha("Diâmetro, D₀", "mm", cps.map((c) => fmt(c.cp.D0, 2)));
  linha("Área, A₀", "cm²", cps.map((c) => fmt(c.r.A0, 2)));
  linha("Volume Inicial, V₀", "cm³", cps.map((c) => fmt(c.r.V0, 2)));
  linha("Massa Úmida, m", "g", cps.map((c) => fmt(c.cp.wetMass, 2)));
  linha("Umidade inicial, w₀", "%", cps.map((c) => fmt(c.r.w0Pct, 2)));
  linha("Massa Esp. Grãos, ρs", "g/cm³", cps.map(() => fmt(rhoS, 2)));
  linha("Massa Esp. Aparente Úmido, ρn", "g/cm³", cps.map((c) => fmt(c.r.gammaNat / 9.81, 2)));
  linha("Massa Esp. Aparente Seco, ρd", "g/cm³", cps.map((c) => fmt(c.r.gammaDry / 9.81, 2)));
  linha("Índice de Vazios Inicial, e₀", undefined, cps.map((c) => fmt(c.r.e0, 3)));
  linha("Grau de Saturação Inicial, S₀", "%", cps.map((c) => fmt(c.r.Sr0, 2)));
  linha("Drenos Laterais", undefined, cps.map((c) => c.cp.lateralDrains ?? "—"));
  linha("Tensão Confinante, σ3", "kPa", cps.map((c) => fmt(c.cp.sigma3Target, 0)));
  linha("Umidade final, wf", "%", cps.map((c) => (c.cp.wFinalPct != null ? fmt(c.cp.wFinalPct, 2) : "—")));
  linha("Grau de Saturação Final, Sf", "%", cps.map((c) => (c.x.sf != null ? fmt(c.x.sf, 2) : "—")));
  linha("Velocidade de Deformação", "mm/min", cps.map((c) => (c.cp.strainRate != null ? fmt(c.cp.strainRate, 3) : "—")));
  linha("Critério de Ruptura Adotado", undefined, cps.map((c) => c.x.failCrit));
  linha("Tensão Desviadora Corrigida", "kPa", cps.map((c) => (c.r.failure ? fmt(c.r.failure.q, 2) : "—")));
  linha("Deformação Axial na Ruptura", "%", cps.map((c) => (c.r.failure ? fmt(c.r.failure.eaPct, 2) : "—")));
  linha("Tensão Principal Menor, σ3", "kPa", cps.map((c) => (c.r.failure ? fmt(c.r.failure.sigma3Prime, 2) : "—")));
  linha("Tensão Principal Maior, σ1", "kPa", cps.map((c) => (c.r.failure ? fmt(c.r.failure.sigma1Prime, 2) : "—")));
  linha("Razão de Tensões Principais σ1/σ3", undefined, cps.map((c) => (c.r.failure ? fmt(c.r.failure.ratio, 2) : "—")));
  linha("s na ruptura", "kPa", cps.map((c) => (c.r.failure ? fmt(c.r.failure.pPrime, 2) : "—")));
  linha("q na ruptura", "kPa", cps.map((c) => (c.r.failure ? fmt(c.r.failure.q, 2) : "—")));
  linha("Índice de vazios final, ef", undefined, cps.map((c) => (isFinite(c.x.eFinal) ? fmt(c.x.eFinal, 3) : "—")));

  const tatil = newRow(cx, 16);
  put(cx, tatil, 1, tatil, 20, "Caracterização Tátil-Visual", { size: 6.4 });
  put(cx, tatil, 21, tatil, COLS, s.description || "—", { size: 6.4, align: "center" });
  edge(cx, tatil, 1, tatil, COLS, "all", CELL_BORDER);

  newRow(cx, 4);
  const caixas = newRow(cx, 17);
  const phi = p.envelope ? `${fmt(p.envelope.phiDeg, 2)}°` : "—";
  const coe = p.envelope ? `${fmt(p.envelope.cPrime, 2)} kPa` : "—";
  caixa(cx, caixas, 1, 20, [{ t: "φᵤ =", bold: true }, { t: ` ${phi}` }]);
  caixa(cx, caixas, 21, 40, [{ t: "Su = cᵤ =", bold: true }, { t: ` ${coe}` }]);
  caixa(cx, caixas, 41, 60, [{ t: "Desvio padrão de Su =", bold: true }, { t: ` ${desvioSu(p.envelope)}` }]);
}

/** Desvio padrão de Su entre os CPs (UU: vai no lugar do R² da regressão). */
const desvioSu = (env: EnvelopeResult | null) => (env ? `${fmt(env.desvioPadrao, 2)} kPa` : "—");

function caixa(cx: Ctx, r: number, c1: number, c2: number, runs: Run[]) {
  put(cx, r, c1, r, c2, runs, { size: 6.75, align: "left" });
  edge(cx, r, c1, r, c2, "all", BOX_BORDER);
}

function paginaQvsEa(cx: Ctx, p: ExportTriaxialUuParams, d: Derivados) {
  barra(cx, "Gráfico de Tensão Desvio versus Deformação Axial Específica");
  const ea = axisDomainAndTicks(0, d.cfg.eaMax, 0, maxDe(p, (q) => q.eaPct));
  const sd = axisDomainAndTicks(0, d.cfg.sigmaDMax, 0, maxDe(p, (q) => q.sigmaD));
  const hTopo = Math.floor((restante(cx) - 16 - 12) / 2);
  graficoLinha(cx, hTopo, 1, COLS, (w, h) => ({
    width: w,
    height: h,
    margin: { top: 6, right: 12, bottom: 24, left: 44 },
    xDomain: ea.domain,
    yDomain: sd.domain,
    xTicks: ea.ticks,
    yTicks: sd.ticks,
    xLabel: "εa - Deformação Axial Específica [%]",
    yLabel: "σd = (σ1−σ3) - Tensão Desvio [kPa]",
    series: p.specimens.map((cp, i) => ({
      name: `${cp.displayId ?? cp.id} · σ3=${cp.sigma3Target} kPa`,
      color: cp.color ?? BRAND,
      points: p.results[i].shearCurve.map((q) => ({ x: q.eaPct, y: q.sigmaD })),
    })),
  }));

  // Embaixo: poropressão medida (leitura do ensaio), como no PDF.
  barra(cx, "Poropressão (u) versus Deformação Axial Específica");
  const poros = p.specimens.flatMap((cp) => cp.shear.map((s) => s.uPore ?? 0));
  const poro = axisDomainAndTicks(0, d.cfg.dvShearMax, Math.min(0, ...poros), Math.max(0, ...poros));
  graficoLinha(cx, restante(cx) - 12, 1, COLS, (w, h) => ({
    width: w,
    height: h,
    margin: { top: 6, right: 12, bottom: 24, left: 44 },
    xDomain: ea.domain,
    yDomain: poro.domain,
    xTicks: ea.ticks,
    yTicks: poro.ticks,
    zeroLine: true,
    xLabel: "εa - Deformação Axial Específica [%]",
    yLabel: "u - Poropressão [kPa]",
    series: p.specimens.map((cp) => ({
      name: cp.displayId ?? cp.id,
      color: cp.color ?? BRAND,
      points: cp.shear.map((s) => ({ x: s.eaPct, y: s.uPore ?? 0 })),
    })),
  }));
  const nota = newRow(cx, 12);
  put(cx, nota, 1, nota, COLS, NOTA_UU_POROPRESSAO, { size: 6.4, color: MUTED });
}

/**
 * Envoltória de Mohr e caminho de tensões na mesma folha (como no PDF do UU), os
 * dois em escala 1:1 — mesmos kPa/px nos dois eixos, preenchendo a faixa.
 */
function paginaMohrECaminho(cx: Ctx, p: ExportTriaxialUuParams, d: Derivados) {
  const env = p.envelope;
  // Cada gráfico fica com metade do que sobra depois das duas barras e das duas linhas de caixas.
  const hGrafico = Math.floor((restante(cx) - 2 * 16 - 2 * 22) / 2);

  barra(cx, "Envoltória de Ruptura — Mohr-Coulomb — Tensões Totais");
  const falhas = p.results.flatMap((r) => (r.failure ? [r.failure] : []));
  const sigmaNecessario = 1.05 * Math.max(1, ...falhas.map((f) => f.sigma1Prime));
  const tauNecessario = 1.15 * Math.max(1, ...falhas.map((f) => (f.sigma1Prime - f.sigma3Prime) / 2), env ? env.cPrime : 0);
  // A reta vai bem além do eixo e é cortada na borda (o topo do eixo só sai no desenho).
  const xLonge = sigmaNecessario * 20;
  const circulos: ChartSeries[] = p.results.flatMap((r, i) =>
    r.failure
      ? [{
          name: `${p.specimens[i].displayId ?? p.specimens[i].id} · σ3=${fmt(p.specimens[i].sigma3Target, 0)} kPa`,
          color: argb(p.specimens[i].color ?? BRAND),
          points: mohrCirclePoints(r.failure.sigma3Prime, r.failure.sigma1Prime).map((pt) => ({ x: pt.sigma, y: pt.tau })),
        }]
      : [],
  );
  const seriesMohr: ChartSeries[] = [...circulos];
  if (env) {
    seriesMohr.push({
      name: `Envoltória: Su = cᵤ = ${fmt(env.cPrime, 1)} kPa (φᵤ = 0)`,
      color: argb(ACCENT),
      points: [
        { x: 0, y: env.cPrime },
        { x: xLonge, y: env.cPrime + Math.tan((env.phiDeg * Math.PI) / 180) * xLonge },
      ],
      dash: [6, 4],
      width: 2,
    });
  }
  graficoLinha(cx, hGrafico, 1, COLS, (w, h) => ({
    width: w,
    height: h,
    margin: { top: 8, right: 20, bottom: 34, left: 44 },
    escala11: true,
    xDomain: [0, sigmaNecessario],
    yDomain: [0, tauNecessario],
    xTicks: [],
    yTicks: [],
    xLabel: "σ (kPa)",
    yLabel: "τ (kPa)",
    series: seriesMohr,
  }));
  const bxMohr = newRow(cx, 22);
  const cPrime = env ? `${fmt(env.cPrime, 2)} kPa` : "—";
  const phiDeg = env ? `${fmt(env.phiDeg, 2)}°` : "—";
  caixa(cx, bxMohr, 1, 20, [{ t: "Su = cᵤ", bold: true }, { t: " (resistência não drenada) = ", size: 6 }, { t: cPrime, bold: true }]);
  caixa(cx, bxMohr, 21, 40, [{ t: "φᵤ", bold: true }, { t: " (envoltória horizontal) = ", size: 6 }, { t: phiDeg, bold: true }]);
  caixa(cx, bxMohr, 41, 60, [{ t: "Desvio padrão de Su = ", bold: true }, { t: desvioSu(env), bold: true }]);

  barra(cx, "Caminho de Tensões (stress path) — Diagrama t–s (MIT) — Tensões Totais");
  const sNecessario = 1.05 * Math.max(1, ...p.results.flatMap((r) => r.shearCurve.map((q) => q.pPrime)));
  const tNecessario = 1.15 * Math.max(1, ...p.results.flatMap((r) => r.shearCurve.map((q) => q.q)), env ? env.a : 0);
  const seriesCaminho: ChartSeries[] = p.specimens.map((cp, i) => ({
    name: `${cp.displayId ?? cp.id} · σ3=${cp.sigma3Target} kPa`,
    color: argb(cp.color ?? BRAND),
    points: p.results[i].shearCurve.map((q) => ({ x: q.pPrime, y: q.q })),
  }));
  if (env) {
    const sLonge = sNecessario * 20;
    seriesCaminho.push({
      name: `Su = ${fmt(env.a, 1)} kPa (φᵤ = 0)`,
      color: ENVELOPE_INK,
      points: [
        { x: 0, y: env.a },
        { x: sLonge, y: env.a + env.M * sLonge },
      ],
      width: 2,
    });
  }
  graficoLinha(cx, restante(cx) - 22, 1, COLS, (w, h) => ({
    width: w,
    height: h,
    margin: { top: 8, right: 20, bottom: 34, left: 44 },
    escala11: true,
    xDomain: [0, sNecessario],
    yDomain: [0, tNecessario],
    xTicks: [],
    yTicks: [],
    xLabel: "s [kPa]",
    yLabel: "t [kPa]",
    series: seriesCaminho,
  }));
  const bxCaminho = newRow(cx, 22);
  caixa(cx, bxCaminho, 1, 20, [{ t: "a", bold: true }, { t: " (intercepto Kf) = ", size: 6 }, { t: env ? `${fmt(env.a, 2)} kPa` : "—", bold: true }]);
  caixa(cx, bxCaminho, 21, 40, [{ t: "α", bold: true }, { t: " (inclinação Kf) = ", size: 6 }, { t: env ? `${fmt(d.alphaDeg, 2)}°` : "—", bold: true }]);
  caixa(cx, bxCaminho, 41, 60, [{ t: "Desvio padrão de Su = ", bold: true }, { t: desvioSu(env), bold: true }]);
}

function paginaModulo(cx: Ctx, p: ExportTriaxialUuParams, d: Derivados) {
  barra(cx, "Módulo de Deformabilidade versus Deformação Axial Específica");
  const ea = axisDomainAndTicks(0, d.cfg.eaMax, 0, maxDe(p, (q) => q.eaPct));
  const em = axisDomainAndTicks(0, d.cfg.eModMax, 0, maxDe(p, (q) => (q.eaPct > 0 ? q.q / (q.eaPct * 10) : 0)));
  const h1 = Math.floor(restante(cx) / 2) - 8;
  graficoLinha(cx, h1, 1, COLS, (w, h) => ({
    width: w,
    height: h,
    margin: { top: 6, right: 12, bottom: 24, left: 44 },
    xDomain: ea.domain,
    yDomain: em.domain,
    xTicks: ea.ticks,
    yTicks: em.ticks,
    xLabel: "εa - Deformação Axial Específica [%]",
    yLabel: "Módulo de Deformabilidade [MPa]",
    series: p.specimens.map((cp, i) => ({
      name: cp.displayId ?? cp.id,
      color: argb(cp.color ?? BRAND),
      points: p.results[i].shearCurve
        .filter((q) => q.eaPct > 0)
        .map((q) => ({ x: q.eaPct, y: q.q / (q.eaPct * 10) })),
    })),
  }));

  barra(cx, "Razão das Tensões Principais (σ1/σ3) versus Deformação Axial Específica");
  const rat = axisDomainAndTicks(0, d.cfg.ratioMax, 0, maxDe(p, (q) => (q.sigma3Prime > 0 ? q.sigma1Prime / q.sigma3Prime : 0)));
  graficoLinha(cx, restante(cx), 1, COLS, (w, h) => ({
    width: w,
    height: h,
    margin: { top: 6, right: 12, bottom: 24, left: 44 },
    xDomain: ea.domain,
    yDomain: rat.domain,
    xTicks: ea.ticks,
    yTicks: rat.ticks,
    xLabel: "εa - Deformação Axial Específica [%]",
    yLabel: "σ1 / σ3",
    series: p.specimens.map((cp, i) => ({
      name: cp.displayId ?? cp.id,
      color: argb(cp.color ?? BRAND),
      points: p.results[i].shearCurve
        .filter((q) => q.sigma3Prime > 0)
        .map((q) => ({ x: q.eaPct, y: q.sigma1Prime / q.sigma3Prime })),
    })),
  }));
}

/** Maior valor de `f` entre todas as curvas de cisalhamento (para o domínio automático). */
function maxDe(p: ExportTriaxialUuParams, f: (q: SpecimenResults["shearCurve"][number]) => number): number {
  let m = 0;
  for (const r of p.results) for (const q of r.shearCurve) m = Math.max(m, f(q));
  return m;
}

/** Caixa de foto: título, imagem centralizada e legenda (PhotoBox do PDF). */
function caixaFoto(
  cx: Ctx,
  r: number,
  hArea: number,
  c1: number,
  c2: number,
  titulo: string,
  foto: Photo | undefined,
  legenda: string,
) {
  put(cx, r, c1, r, c2, titulo.toUpperCase(), { size: 6.8, bold: true, color: SECTION_INK, align: "center", fill: SECTION_BG });
  const areaRow = r + 1;
  const src = foto ? foto.url || foto.dataUrl : undefined;
  const img = src ? cx.fotos.get(src) : undefined;
  const wPx = (c2 - c1 + 1) * COL_PX;
  const hPx = ptToPx(hArea);
  const b64 = img && !cx.semGraficos ? renderFotoPng(img, wPx, hPx) : null;
  if (b64) {
    imagem(cx, b64, c1, areaRow, wPx, hPx);
  } else {
    put(cx, areaRow, c1, areaRow, c2, "Sem registro", { size: 6, color: MUTED, align: "center" });
  }
  put(cx, r + 2, c1, r + 2, c2, legenda, { size: 6.75, bold: true, align: "center" });
  edge(cx, r, c1, r + 2, c2, "all", BOX_BORDER);
}

/** Página do CP: gráfico de σd×εa e de volume, cada um ao lado de uma foto. */
function paginaCp(cx: Ctx, p: ExportTriaxialUuParams, d: Derivados, idx: number) {
  const cp = p.specimens[idx];
  const r = p.results[idx];
  const cpNome = cp.displayId ?? cp.id;
  const legenda = `${cpNome} · σ3=${cp.sigma3Target} kPa`;
  const fotos = fotosPublicadas(p.photos ?? []).filter((f) => f.specimenId === cp.id);
  const moldagem = fotos.find((f) => f.kind === "moldagem");
  const ruptura = fotos.find((f) => f.kind === "ruptura");
  const ea = axisDomainAndTicks(0, d.cfg.eaMax, 0, maxDe(p, (q) => q.eaPct));
  const sd = axisDomainAndTicks(0, d.cfg.sigmaDMax, 0, maxDe(p, (q) => q.sigmaD));
  barra(cx, `Gráfico de Tensão Desvio versus Deformação Axial Específica — ${cpNome}`);
  // UU: duas faixas iguais (σd×εa e poropressão), cada uma com a sua foto ao lado.
  const hBloco = Math.floor((restante(cx) - 16 - 12) / 2);
  blocoLadoAlado(cx, hBloco, {
    grafico: (w, h) => ({
      width: w,
      height: h,
      margin: { top: 6, right: 8, bottom: 22, left: 40 },
      xDomain: ea.domain,
      yDomain: sd.domain,
      xTicks: ea.ticks,
      yTicks: sd.ticks,
      xLabel: "εa - Deformação Axial Específica [%]",
      yLabel: "σd = (σ1−σ3) - Tensão Desvio [kPa]",
      tickPx: 9,
      series: [{
        name: legenda,
        color: argb(cp.color ?? BRAND),
        points: r.shearCurve.map((q) => ({ x: q.eaPct, y: q.sigmaD })),
      }],
    }),
    titulo: "Registro Fotográfico na Moldagem",
    foto: moldagem,
    legenda,
  });

  // Faixa inferior do UU: poropressão medida × εa, com a foto da ruptura ao lado (como no PDF).
  barra(cx, `Poropressão (u) versus Deformação Axial Específica — ${cpNome}`);
  const poros = cp.shear.map((s) => s.uPore ?? 0);
  const poro = axisDomainAndTicks(0, d.cfg.dvShearMax, Math.min(0, ...poros), Math.max(0, ...poros));
  blocoLadoAlado(cx, hBloco, {
    grafico: (w, h) => ({
      width: w,
      height: h,
      margin: { top: 6, right: 8, bottom: 22, left: 40 },
      xDomain: ea.domain,
      yDomain: poro.domain,
      xTicks: ea.ticks,
      yTicks: poro.ticks,
      zeroLine: true,
      xLabel: "εa - Deformação Axial Específica [%]",
      yLabel: "u - Poropressão [kPa]",
      tickPx: 9,
      series: [{ name: legenda, color: cp.color ?? BRAND, points: cp.shear.map((s) => ({ x: s.eaPct, y: s.uPore ?? 0 })) }],
    }),
    titulo: "Registro Fotográfico após a Ruptura",
    foto: ruptura,
    legenda,
  });
  const nota = newRow(cx, 12);
  put(cx, nota, 1, nota, COLS, NOTA_UU_POROPRESSAO, { size: 6.4, color: MUTED });
}

/** Gráfico à esquerda (até a coluna 36) e caixa de foto à direita (colunas 38..60). */
function blocoLadoAlado(
  cx: Ctx,
  hPt: number,
  o: {
    grafico: (w: number, h: number) => ChartSpec;
    titulo: string;
    foto: Photo | undefined;
    legenda: string;
  },
) {
  const r = cx.row;
  for (let i = 0; i < 3; i++) newRow(cx, i === 1 ? hPt - 28 : 14);
  const wEsq = 36 * COL_PX;
  if (!cx.semGraficos) {
    const b64 = renderChartPng(o.grafico(wEsq, ptToPx(hPt)));
    if (b64) imagem(cx, b64, 1, r, wEsq, ptToPx(hPt));
    else cx.warnings.push(`Gráfico da folha ${cx.pageNo} não pôde ser desenhado`);
  }
  caixaFoto(cx, r, hPt - 28, 38, COLS, o.titulo, o.foto, o.legenda);
}

function paginaGlossario(cx: Ctx, parte: 1 | 2) {
  barra(cx, `Formulações e Convenções (${parte}/2)`);
  const intro = newRow(cx, 22);
  put(cx, intro, 1, intro, COLS, GLOSSARIO_UU_CONVENCAO, { size: 6.75, color: MUTED });

  for (const grupo of gruposDoGlossario(parte)) {
    const t = newRow(cx, 14);
    put(cx, t, 1, t, COLS, grupo.titulo.toUpperCase(), { size: 7.5, bold: true, fill: GROUP_BG });
    for (const [sym, nome, formula, unidade, ref] of grupo.linhas) {
      const linhas = Math.max(
        estimaLinhas(sym, 6 * COL_PX, 7.5),
        estimaLinhas(nome, 18 * COL_PX, 7.1),
        estimaLinhas(formula, 25 * COL_PX, 7.1),
        estimaLinhas(unidade ?? "", 5 * COL_PX, 6.4),
        estimaLinhas(ref ?? "", 6 * COL_PX, 6.4),
      );
      const r = newRow(cx, Math.max(12, linhas * 9.2 + 3));
      put(cx, r, 1, r, 6, sym, { size: 7.5, bold: true });
      put(cx, r, 7, r, 24, nome, { size: 7.1 });
      put(cx, r, 25, r, 49, formula, { size: 7.1 });
      put(cx, r, 50, r, 54, unidade ?? "", { size: 6.4, color: MUTED });
      put(cx, r, 55, r, COLS, ref ?? "", { size: 6.4, color: STAMP });
      edge(cx, r, 1, r, COLS, ["bottom"], GLOSS_LINE);
    }
    newRow(cx, 6);
  }

  const fim = newRow(cx, 22);
  put(cx, fim, 1, fim, COLS, GLOSSARIO_UU_REFERENCIAS, { size: 6.4, color: MUTED, valign: "bottom" });
}

/** Linhas estimadas para um texto numa célula de `px` pixels de largura. */
function estimaLinhas(texto: string, px: number, pt: number): number {
  if (!texto) return 1;
  const charPx = (pt / PX_TO_PT) * 0.55;
  const porLinha = Math.max(4, Math.floor(px / charPx));
  return Math.max(1, Math.ceil(texto.length / porLinha));
}

// ---------------------------------------------------------------------------
// Glossário (mesmas fórmulas da página do PDF)
// ---------------------------------------------------------------------------

/** Grupos do glossário do UU (ver glossario-uu.ts) na forma usada pelas linhas da planilha. */
function gruposDoGlossario(parte: 1 | 2) {
  return (parte === 1 ? GLOSSARIO_UU_1 : GLOSSARIO_UU_2).map((g) => ({
    titulo: g.titulo,
    linhas: g.linhas.map((l) => [l.sym, l.nome, l.formula, l.unidade ?? "", l.ref ?? ""] as [string, string, string, string, string]),
  }));
}

// ---------------------------------------------------------------------------
// Imagens do navegador (logo, assinatura e fotos)
// ---------------------------------------------------------------------------

async function carregaImagem(src: string): Promise<HTMLImageElement | null> {
  if (typeof Image === "undefined") return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function imagemBase64(src: string): Promise<string | null> {
  if (src.startsWith("data:")) return src.split(",")[1] || null;
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Montagem da pasta de trabalho
// ---------------------------------------------------------------------------

/** Monta a planilha inteira (todas as folhas do PDF, na ordem do relatório). */
export async function buildTriaxialUuXlsxWorkbook(p: ExportTriaxialUuParams): Promise<ExcelJS.Workbook> {
  const ExcelJSRuntime = (await import("exceljs")).default;
  const wb = new ExcelJSRuntime.Workbook();
  wb.creator = "Suporte INFRA";
  wb.lastModifiedBy = p.sample.operator || "Suporte INFRA";
  wb.created = new Date();
  wb.modified = new Date();

  const ws = wb.addWorksheet("Laudo Triaxial UU", {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: "portrait",
      margins: { left: 0.31, right: 0.31, top: 0.2, bottom: 0.2, header: 0, footer: 0 },
      scale: 100,
    },
  });
  for (let c = 1; c <= COLS; c++) ws.getColumn(c).width = COL_WIDTH;

  const semGraficos = p.semGraficos === true;
  let logoId: number | null = null;
  let sigId: number | null = null;
  const logoPx = { w: 185, h: 48 };
  const sigPx = { w: 110, h: 40 };
  const fotos = new Map<string, HTMLImageElement>();
  if (!semGraficos) {
    const logoSrc = "/suporte-infra-logo.png";
    const sigSrc = "/assinatura-mauricio.png";
    const fotosComSrc = fotosPublicadas(p.photos ?? []).flatMap((f) => {
      const src = f.url || f.dataUrl;
      return src ? [src] : [];
    });
    const [logoB64, sigB64, logoImg, sigImg, ...imgsFotos] = await Promise.all([
      imagemBase64(logoSrc),
      imagemBase64(sigSrc),
      carregaImagem(logoSrc),
      carregaImagem(sigSrc),
      ...fotosComSrc.map((src) => carregaImagem(src)),
    ]);
    if (logoB64) {
      logoId = wb.addImage({ base64: logoB64, extension: "png" });
      if (logoImg) logoPx.w = Math.round((logoImg.naturalWidth / logoImg.naturalHeight) * 40);
    }
    if (sigB64) {
      sigId = wb.addImage({ base64: sigB64, extension: "png" });
      if (sigImg) {
        sigPx.w = sigImg.naturalWidth;
        sigPx.h = sigImg.naturalHeight;
      }
    }
    fotosComSrc.forEach((src, i) => {
      const img = imgsFotos[i];
      if (img) fotos.set(src, img);
    });
  }

  const d = derivar(p);
  // 5 folhas fixas (capa, resumo, σd×εa, Mohr + caminho de tensões, módulo) + CPs + 2 do glossário.
  const total = 5 + p.specimens.length + 2;
  const cx: Ctx = {
    wb, ws, row: 1, used: 0, pageNo: 0, total,
    sample: p.sample, semGraficos,
    logoId, logoPx, sigId, sigPx, fotos,
    warnings: [],
  };

  inicioPagina(cx, 1);
  paginaCapa(cx, p);
  fimPagina(cx);

  inicioPagina(cx, 2);
  paginaResumo(cx, p, d);
  fimPagina(cx);

  inicioPagina(cx, 3);
  paginaQvsEa(cx, p, d);
  fimPagina(cx);

  inicioPagina(cx, 4);
  paginaMohrECaminho(cx, p, d);
  fimPagina(cx);

  inicioPagina(cx, 5);
  paginaModulo(cx, p, d);
  fimPagina(cx);

  for (let i = 0; i < p.specimens.length; i++) {
    inicioPagina(cx, 6 + i);
    paginaCp(cx, p, d, i);
    fimPagina(cx);
  }

  inicioPagina(cx, total - 1);
  paginaGlossario(cx, 1);
  fimPagina(cx);

  inicioPagina(cx, total);
  paginaGlossario(cx, 2);
  fimPagina(cx);

  if (cx.warnings.length && typeof console !== "undefined") console.warn("[Excel UU]", cx.warnings.join(" | "));
  return wb;
}

/** Gera o .xlsx e devolve o nome e o conteúdo em base64 (para o Drive). */
export async function getTriaxialUuXlsxBase64(p: ExportTriaxialUuParams, filename: string): Promise<{ filename: string; base64: string }> {
  const wb = await buildTriaxialUuXlsxWorkbook(p);
  const buffer = await wb.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return { filename, base64: btoa(bin) };
}

/** Gera o .xlsx e baixa no navegador. */
export async function exportTriaxialUuXlsx(p: ExportTriaxialUuParams, filename: string) {
  const wb = await buildTriaxialUuXlsxWorkbook(p);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
