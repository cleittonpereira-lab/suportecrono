/**
 * Gráficos do relatório Triaxial para o Excel, desenhados em canvas com o mesmo
 * traçado dos gráficos Recharts do PDF: grade pontilhada, eixos, legenda no topo,
 * linhas de 1,8 px e linha de referência em y = 0.
 * Só roda no navegador (precisa de canvas).
 */
import { baseQueCobre, escalaIgual, niceStep, topoQueCobre } from "./eixos";

/** Fator de resolução: o PNG sai com o dobro do tamanho em px para ficar nítido no Excel. */
const SCALE = 2;
const FONT = '"Segoe UI", Arial, sans-serif';
const GRID_COLOR = "#e5e7eb";
const AXIS_COLOR = "#666666";
const ZERO_COLOR = "#999999";

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartSeries {
  name: string;
  color: string;
  points: ChartPoint[];
  dash?: number[];
  width?: number;
}

export interface ChartSpec {
  /** Largura e altura em px (1 px = 1/96 pol.), como no PDF. */
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  xDomain: [number, number];
  yDomain: [number, number];
  xTicks: number[];
  yTicks: number[];
  xLabel: string;
  yLabel: string;
  yReversed?: boolean;
  zeroLine?: boolean;
  /**
   * Escala 1:1 (mesmos kPa/px nos dois eixos) preenchendo a área — Mohr e caminho
   * de tensões. `xDomain[1]` e `yDomain[1]` passam a ser o mínimo que cada eixo
   * precisa mostrar; os intervalos e ticks finais saem de `escalaIgual`.
   */
  escala11?: boolean;
  series: ChartSeries[];
  /** Tamanho da fonte dos eixos em px (o PDF usa 9–10 px). */
  tickPx?: number;
}

/** Ticks em [min, max] com passo "bonito" — mesma regra usada no relatório da tela. */
export function equalTicks(min: number, max: number, count = 6): number[] {
  if (!isFinite(min) || !isFinite(max) || max <= min) return [];
  const step = niceStep(max - min, count);
  const decimals = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)));
  const f = Math.pow(10, decimals);
  const round = (v: number) => Math.round(v * f) / f;
  const start = Math.ceil(min / step - 1e-9) * step;
  const end = Math.floor(max / step + 1e-9) * step;
  const out: number[] = [];
  for (let v = start; v <= end + 1e-9; v += step) out.push(round(v));
  return out;
}

/**
 * Domínio e ticks de um eixo que sempre cobre os dados (mesma regra do PDF, ver
 * eixos.ts): o limite digitado só vale se couber o maior/menor dado.
 */
export function axisDomainAndTicks(
  lo: number,
  hi: number,
  dataLo: number,
  dataHi: number,
): { domain: [number, number]; ticks: number[] } {
  const loEff = baseQueCobre(lo, dataLo);
  const hiEff = topoQueCobre(hi, dataHi);
  return { domain: [loEff, hiEff], ticks: equalTicks(loEff, hiEff) };
}

/** Texto em base 10 sem zeros à direita (0,50 → "0.5"), como o Recharts exibe os ticks. */
const tickLabel = (v: number) => String(Number(v.toFixed(3)));

/** Aceita cor "#rrggbb" ou ARGB "FFrrggbb" (formato das células do Excel) e devolve CSS. */
const cssColor = (c: string) => (/^[0-9a-fA-F]{8}$/.test(c) ? `#${c.slice(2)}` : c);

/**
 * Foto do registro fotográfico: imagem ajustada à área (contain) e centralizada
 * sobre fundo branco, com a mesma margem interna da caixa do PDF (4 px).
 */
export function renderFotoPng(img: HTMLImageElement, wPx: number, hPx: number): string | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(wPx * SCALE);
  canvas.height = Math.round(hPx * SCALE);
  const ctx = canvas.getContext("2d");
  if (!ctx || !img.naturalWidth || !img.naturalHeight) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const pad = 4 * SCALE;
  const boxW = canvas.width - pad * 2;
  const boxH = canvas.height - pad * 2;
  const k = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight);
  const dw = img.naturalWidth * k;
  const dh = img.naturalHeight * k;
  ctx.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  return canvas.toDataURL("image/png").split(",")[1] ?? null;
}

/**
 * Desenha o gráfico e devolve o PNG em base64 (sem o prefixo data:).
 * Devolve null fora do navegador ou se o canvas não estiver disponível.
 */
export function renderChartPng(spec: ChartSpec): string | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(spec.width * SCALE);
  canvas.height = Math.round(spec.height * SCALE);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(SCALE, SCALE);

  const tickPx = spec.tickPx ?? 10;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, spec.width, spec.height);

  // ---- Legenda no topo (quebra de linha quando não cabe) ----
  ctx.font = `${tickPx}px ${FONT}`;
  const legendLine = 16;
  const legendRows: { name: string; color: string; dash?: number[]; x: number; y: number }[] = [];
  let lx = spec.margin.left;
  let ly = 0;
  const maxLx = spec.width - spec.margin.right;
  for (const s of spec.series) {
    const textW = ctx.measureText(s.name).width;
    const itemW = 18 + textW + 14;
    if (lx + itemW > maxLx && lx > spec.margin.left) {
      lx = spec.margin.left;
      ly += legendLine;
    }
    legendRows.push({ name: s.name, color: s.color, dash: s.dash, x: lx, y: ly });
    lx += itemW;
  }
  const legendHeight = legendRows.length ? ly + legendLine : 0;

  const left = spec.margin.left;
  const right = spec.width - spec.margin.right;
  const top = spec.margin.top + legendHeight + (legendHeight ? 4 : 0);
  const bottom = spec.height - spec.margin.bottom;
  const plotW = right - left;
  const plotH = bottom - top;
  let [x0, x1] = spec.xDomain;
  let [y0, y1] = spec.yDomain;
  let xTicks = spec.xTicks;
  let yTicks = spec.yTicks;
  if (spec.escala11) {
    const e = escalaIgual(plotW, plotH, x1, y1);
    [x0, x1, y0, y1] = [0, e.xMax, 0, e.yMax];
    xTicks = e.ticksX;
    yTicks = e.ticksY;
  }
  const sx = (x: number) => left + ((x - x0) / (x1 - x0 || 1)) * plotW;
  const sy = (y: number) =>
    spec.yReversed
      ? top + ((y - y0) / (y1 - y0 || 1)) * plotH
      : bottom - ((y - y0) / (y1 - y0 || 1)) * plotH;

  // ---- Legenda ----
  for (const item of legendRows) {
    const yy = item.y + legendLine / 2 + spec.margin.top - 4;
    ctx.strokeStyle = cssColor(item.color);
    ctx.lineWidth = 2;
    ctx.setLineDash(item.dash ?? []);
    ctx.beginPath();
    ctx.moveTo(item.x, yy);
    ctx.lineTo(item.x + 14, yy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = AXIS_COLOR;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(item.name, item.x + 18, yy);
  }

  // ---- Grade pontilhada ----
  ctx.save();
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  for (const t of xTicks) {
    const px = sx(t);
    if (px < left - 0.5 || px > right + 0.5) continue;
    ctx.beginPath();
    ctx.moveTo(px, top);
    ctx.lineTo(px, bottom);
    ctx.stroke();
  }
  for (const t of yTicks) {
    const py = sy(t);
    if (py < top - 0.5 || py > bottom + 0.5) continue;
    ctx.beginPath();
    ctx.moveTo(left, py);
    ctx.lineTo(right, py);
    ctx.stroke();
  }
  ctx.restore();

  // ---- Eixos e rótulos ----
  ctx.strokeStyle = AXIS_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, bottom);
  ctx.lineTo(right, bottom);
  ctx.stroke();

  ctx.fillStyle = AXIS_COLOR;
  ctx.font = `${tickPx}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const t of xTicks) {
    const px = sx(t);
    if (px < left - 0.5 || px > right + 0.5) continue;
    ctx.fillText(tickLabel(t), px, bottom + 3);
  }
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const t of yTicks) {
    const py = sy(t);
    if (py < top - 0.5 || py > bottom + 0.5) continue;
    ctx.fillText(tickLabel(t), left - 4, py);
  }

  ctx.font = `${tickPx + 0.5}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(spec.xLabel, (left + right) / 2, spec.height - 4);
  ctx.save();
  ctx.translate(12, (top + bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = "middle";
  ctx.fillText(spec.yLabel, 0, 0);
  ctx.restore();

  // ---- Linha de referência y = 0 ----
  if (spec.zeroLine) {
    const py = sy(0);
    if (py >= top && py <= bottom) {
      ctx.strokeStyle = ZERO_COLOR;
      ctx.beginPath();
      ctx.moveTo(left, py);
      ctx.lineTo(right, py);
      ctx.stroke();
    }
  }

  // ---- Séries ----
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, plotW, plotH);
  ctx.clip();
  for (const s of spec.series) {
    if (s.points.length < 2) continue;
    ctx.strokeStyle = cssColor(s.color);
    ctx.lineWidth = s.width ?? 1.8;
    ctx.lineJoin = "round";
    ctx.setLineDash(s.dash ?? []);
    ctx.beginPath();
    s.points.forEach((p, i) => {
      const px = sx(p.x);
      const py = sy(p.y);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }
  ctx.restore();

  return canvas.toDataURL("image/png").split(",")[1] ?? null;
}
