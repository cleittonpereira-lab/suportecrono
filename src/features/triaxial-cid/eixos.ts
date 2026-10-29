/**
 * Limites dos eixos dos gráficos do triaxial (PDF e Excel). O limite digitado no
 * "Ajuste de Eixos" só vale se cobrir os dados; senão — ou se estiver em 0 (auto) —
 * o eixo vai até o próximo valor "redondo" acima do maior dado, para que a curva
 * ocupe o eixo inteiro e os ticks fiquem espalhados por ele.
 */
import type { SpecimenResults, TriaxialSpecimen } from "./types";

/** Passo "bonito" (1, 2, 5 × 10^k) para dividir `range` em ~`count` intervalos. */
export function niceStep(range: number, count: number): number {
  const raw = range / Math.max(1, count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const s = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return s * mag;
}

/** Menor múltiplo do passo "bonito" que é ≥ v (ex.: 19,9 → 20; 46 → 50; 118 → 120). */
export function niceCeil(v: number): number {
  if (!(v > 0)) return 1;
  const step = niceStep(v, 6);
  return Math.round(Math.ceil(v / step - 1e-9) * step * 1e6) / 1e6;
}

/** Topo do eixo: o digitado, se cobrir o maior dado; senão o valor redondo acima do dado. */
export function topoQueCobre(digitado: number, maiorDado: number): number {
  if (digitado > 0 && digitado >= maiorDado) return digitado;
  return niceCeil(Math.max(0, maiorDado));
}

/** Base do eixo (pode ser negativa): o digitado, se cobrir o menor dado; senão 0 ou o redondo abaixo. */
export function baseQueCobre(digitado: number, menorDado: number): number {
  if (digitado < 0 && digitado <= menorDado) return digitado;
  return menorDado >= 0 ? 0 : -niceCeil(-menorDado);
}

/**
 * Escala 1:1 — os mesmos kPa por pixel nos dois eixos — preenchendo a área do
 * gráfico (Mohr e caminho de tensões). O eixo x vai até o valor redondo acima de
 * `xNecessario`; o y vai até onde a altura deixar com a mesma escala. Se aí não
 * couber `yNecessario`, é o x que estica. Os ticks usam o mesmo passo nos dois
 * eixos, então a grade sai em quadrados.
 */
export function escalaIgual(
  plotW: number,
  plotH: number,
  xNecessario: number,
  yNecessario: number,
): { xMax: number; yMax: number; ticksX: number[]; ticksY: number[] } {
  const w = Math.max(1, plotW);
  const h = Math.max(1, plotH);
  let xMax = niceCeil(Math.max(0, xNecessario));
  let yMax = (xMax * h) / w;
  if (yMax < yNecessario) {
    yMax = niceCeil(yNecessario);
    xMax = (yMax * w) / h;
  }
  const passo = niceStep(Math.max(xMax, yMax), 7);
  const ticks = (max: number) => {
    const out: number[] = [];
    for (let v = 0; v <= max + 1e-9; v += passo) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  };
  return { xMax, yMax, ticksX: ticks(xMax), ticksY: ticks(yMax) };
}

/**
 * Valores da faixa de baixo dos gráficos por εa: poropressão medida no UU,
 * poropressão gerada (σ1 − σ'1) no CIU e variação de volume (cm³) no CID.
 */
export function valoresDaFaixaInferior(
  cp: TriaxialSpecimen,
  r: SpecimenResults,
  tipo: "cid" | "ciu" | "uu",
): { eaPct: number; dv: number }[] {
  if (tipo === "uu") return cp.shear.map((s) => ({ eaPct: s.eaPct, dv: s.uPore ?? 0 }));
  if (tipo === "ciu") return r.shearCurve.map((p) => ({ eaPct: p.eaPct, dv: p.sigma1 - p.sigma1Prime }));
  return r.shearCurve.map((p) => ({ eaPct: p.eaPct, dv: (p.evPct / 100) * r.V0 }));
}

/** Limites do "Ajuste de Eixos" usados pelos gráficos por εa do relatório. */
export interface LimitesPorDeformacao {
  eaMax: number;
  qMax: number;
  sigmaDMax: number;
  eModMax: number;
  ratioMax: number;
  dvShearMin: number;
  dvShearMax: number;
}

/** Ajusta os limites do relatório para que cada gráfico cubra 100 % dos dados. */
export function eixosQueCobremOsDados<T extends LimitesPorDeformacao>(
  cfg: T,
  specimens: TriaxialSpecimen[],
  results: SpecimenResults[],
  tipo: "cid" | "ciu" | "uu",
): T {
  let ea = 0, sd = 0, q = 0, eMod = 0, razao = 0, infMin = 0, infMax = 0;
  results.forEach((r, i) => {
    for (const p of r.shearCurve) {
      ea = Math.max(ea, p.eaPct);
      sd = Math.max(sd, p.sigmaD);
      q = Math.max(q, p.q);
      if (p.eaPct > 0) eMod = Math.max(eMod, p.q / (p.eaPct * 10));
      if (p.sigma3Prime > 0) razao = Math.max(razao, p.sigma1Prime / p.sigma3Prime);
    }
    if (!specimens[i]) return;
    for (const p of valoresDaFaixaInferior(specimens[i], r, tipo)) {
      if (!Number.isFinite(p.dv)) continue;
      infMin = Math.min(infMin, p.dv);
      infMax = Math.max(infMax, p.dv);
    }
  });
  return {
    ...cfg,
    eaMax: topoQueCobre(cfg.eaMax, ea),
    qMax: topoQueCobre(cfg.qMax, q),
    sigmaDMax: topoQueCobre(cfg.sigmaDMax, sd),
    eModMax: topoQueCobre(cfg.eModMax, eMod),
    ratioMax: topoQueCobre(cfg.ratioMax, razao),
    dvShearMin: baseQueCobre(cfg.dvShearMin, infMin),
    dvShearMax: topoQueCobre(cfg.dvShearMax, infMax),
  };
}
