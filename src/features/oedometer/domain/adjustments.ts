import {
  casagrandeSigmaP,
  cvCasagrande,
  cvTaylor,
  pachecoSilvaSigmaP,
  type Stage,
} from "@/lib/oedometer";
import type { CvLineAdjust, PreconsolidationAdjust } from "../types";

/** Aplica ajustes manuais às retas do método de Casagrande para σ'p. */
export function applyCasAdjustment(
  cas: ReturnType<typeof casagrandeSigmaP>,
  adj?: PreconsolidationAdjust["cas"],
) {
  if (!cas) return null;
  const tangent = {
    m: adj?.tangentM ?? cas.tangent.m,
    b: adj?.tangentB ?? cas.tangent.b,
  };
  const bisector = {
    m: adj?.bisectorM ?? cas.bisector.m,
    b: adj?.bisectorB ?? cas.bisector.b,
  };
  const virgin = {
    m: adj?.virginM ?? cas.virgin.m,
    b: adj?.virginB ?? cas.virgin.b,
  };
  const horizontal = adj?.horizontal ?? cas.horizontal;
  const xI = (virgin.b - bisector.b) / (bisector.m - virgin.m);
  const yI = virgin.m * xI + virgin.b;
  return {
    ...cas,
    sigmaP: Math.pow(10, xI),
    intersection: { x: xI, y: yI },
    tangent,
    horizontal,
    virgin,
    bisector,
  };
}

/** Interpolação log-linear no índice de vazios para uma tensão arbitrária. */
export function curveEAtLocal(curve: { sigma: number; e: number }[], sigma: number) {
  if (!curve.length) return null;
  if (sigma <= curve[0].sigma) return curve[0].e;
  if (sigma >= curve[curve.length - 1].sigma) return curve[curve.length - 1].e;
  for (let i = 1; i < curve.length; i++) {
    if (curve[i].sigma >= sigma) {
      const x0 = Math.log10(curve[i - 1].sigma), x1 = Math.log10(curve[i].sigma);
      const x = Math.log10(sigma);
      const f = (x - x0) / (x1 - x0);
      return curve[i - 1].e + f * (curve[i].e - curve[i - 1].e);
    }
  }
  return null;
}

/** Aplica ajustes manuais ao método de Pacheco Silva. */
export function applyPsAdjustment(
  ps: ReturnType<typeof pachecoSilvaSigmaP>,
  curve: { sigma: number; e: number }[],
  adj?: PreconsolidationAdjust["ps"],
) {
  if (!ps) return null;
  const virgin = {
    m: adj?.virginM ?? ps.virgin.m,
    b: adj?.virginB ?? ps.virgin.b,
  };
  const e0Line = adj?.e0Line ?? ps.e0Line;
  const xA = (e0Line - virgin.b) / virgin.m;
  const sigmaA = Math.pow(10, xA);
  const eB = curveEAtLocal(curve, sigmaA);
  if (eB == null) return ps;
  const xC = (eB - virgin.b) / virgin.m;
  const sigmaP = Math.pow(10, xC);
  return {
    ...ps,
    sigmaP,
    e0Line,
    A: { x: xA, y: e0Line, sigma: sigmaA },
    B: { x: xA, y: eB, sigma: sigmaA },
    C: { x: xC, y: eB, sigma: sigmaP },
    virgin,
  };
}

/** Reencontra t90 a partir da reta ajustada de U=90% (Taylor). */
export function findTaylorT90(stage: Stage, d0: number, slope90: number, fallback: number) {
  const pts = stage.readings.filter((r) => r.t > 0).map((r) => ({ x: Math.sqrt(r.t), y: r.d }));
  for (let i = 1; i < pts.length; i++) {
    const f1 = pts[i - 1].y - (d0 + slope90 * pts[i - 1].x);
    const f2 = pts[i].y - (d0 + slope90 * pts[i].x);
    if (f1 * f2 <= 0) {
      const frac = f1 / (f1 - f2 || 1);
      const sqrtT = pts[i - 1].x + frac * (pts[i].x - pts[i - 1].x);
      return Math.max(0.0001, sqrtT ** 2);
    }
  }
  return fallback;
}

/** Recalcula cv após ajuste das retas de Taylor. */
export function applyTaylorAdjustment(
  stage: Stage,
  Hdrain_mm: number,
  base: ReturnType<typeof cvTaylor>,
  adj?: CvLineAdjust,
) {
  if (!base) return null;
  const d0 = adj?.taylorIntercept ?? base.d0;
  const slope = adj?.taylorSlope ?? base.slope;
  const slope90 = adj?.taylorSlope90 ?? base.slope90;
  const t90 = adj?.t90 ?? findTaylorT90(stage, d0, slope90, base.t90);
  const t90_s = t90 * 60;
  const Hd_cm = Hdrain_mm / 10;
  const cv = (0.848 * Hd_cm * Hd_cm) / t90_s;
  return { ...base, d0, slope, slope90, t90, t90_s, cv, d90: d0 + slope90 * Math.sqrt(t90) };
}

/** Reencontra t50 a partir de d50 (Casagrande). */
export function findCgrT50(stage: Stage, d50: number, fallback: number) {
  const pts = stage.readings.filter((r) => r.t > 0);
  for (let i = 1; i < pts.length; i++) {
    if ((pts[i - 1].d - d50) * (pts[i].d - d50) <= 0) {
      const frac = (d50 - pts[i - 1].d) / (pts[i].d - pts[i - 1].d || 1);
      const lt = Math.log10(pts[i - 1].t) + frac * (Math.log10(pts[i].t) - Math.log10(pts[i - 1].t));
      return Math.max(0.0001, Math.pow(10, lt));
    }
  }
  return fallback;
}

/** Recalcula cv após ajuste das retas de Casagrande (log t). */
export function applyCgrAdjustment(
  stage: Stage,
  Hdrain_mm: number,
  base: ReturnType<typeof cvCasagrande>,
  adj?: CvLineAdjust,
) {
  if (!base) return null;
  const primary = {
    m: adj?.cgrPrimaryM ?? base.primary.m,
    b: adj?.cgrPrimaryB ?? base.primary.b,
  };
  const secondary = {
    m: adj?.cgrSecondaryM ?? base.secondary.m,
    b: adj?.cgrSecondaryB ?? base.secondary.b,
  };
  const d0 = adj?.cgrD0 ?? base.d0;
  const x100 = (primary.b - secondary.b) / (secondary.m - primary.m);
  const d100 = secondary.m * x100 + secondary.b;
  const d50 = (d0 + d100) / 2;
  const t50 = adj?.t50 ?? findCgrT50(stage, d50, base.t50);
  const t50_s = t50 * 60;
  const Hd_cm = Hdrain_mm / 10;
  const cv = (0.197 * Hd_cm * Hd_cm) / t50_s;
  return { ...base, t50, t50_s, cv, d0, d100, d50, x100, primary, secondary };
}