/**
 * Cálculos do Módulo de Resiliência (DNIT 134/2018-ME / AASHTO T307).
 * Ver types.ts para as unidades e a definição do modelo composto.
 */
import type { ModelFit, ModuloResilienciaSample, StressState } from "./types";

const SQRT2_OVER_3 = Math.SQRT2 / 3;

/** θ = σ1+σ2+σ3 = 3σ3 + σd (caso triaxial: σ1=σ3+σd, σ2=σ3). */
export function thetaOf(sigma3: number, sigmaD: number): number {
  return 3 * sigma3 + sigmaD;
}

/** τoct = (√2/3)·σd (tensão cisalhante octaédrica no caso triaxial). */
export function tauOctOf(sigmaD: number): number {
  return SQRT2_OVER_3 * sigmaD;
}

/** Deformação axial recuperável específica εr = ΔH / H0 (adimensional). */
export function recoverableStrainOf(recoverableStrainMm: number, heightMm: number): number {
  if (!heightMm || heightMm <= 0) return 0;
  return recoverableStrainMm / heightMm;
}

/** MR do estado = σd / εr [MPa] — σd em kPa, εr adimensional → MR em MPa direto. */
export function mrOf(state: StressState, heightMm: number): number | null {
  if (state.recoverableStrainMm == null || state.recoverableStrainMm <= 0) return null;
  const er = recoverableStrainOf(state.recoverableStrainMm, heightMm);
  if (er <= 0) return null;
  return state.sigmaD / er / 1000; // kPa/adimensional = kPa; /1000 → MPa
}

/** Resolve um sistema linear 3×3 por eliminação de Gauss (com pivotamento parcial). */
function solve3x3(A: number[][], b: number[]): number[] | null {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col++) {
    let pivot = col;
    for (let r = col + 1; r < 3; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const factor = M[r][col] / M[col][col];
      for (let c = col; c < 4; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}

/**
 * Ajusta o modelo composto MR = k1·Pa·(θ/Pa)^k2·(τoct/Pa+1)^k3 por regressão
 * linear múltipla em escala log: ln MR = ln(k1·Pa) + k2·ln(θ/Pa) + k3·ln(τoct/Pa+1).
 * Precisa de pelo menos 4 estados com MR válido (3 parâmetros + 1 grau de liberdade).
 */
export function fitCompositeModel(sample: ModuloResilienciaSample): ModelFit | null {
  const pa = sample.atmPressureKpa || 101.3;
  const h0 = sample.geometry.heightMm;
  const rows: { y: number; x2: number; x3: number; mr: number }[] = [];

  for (const st of sample.states) {
    const mr = mrOf(st, h0);
    if (mr == null || mr <= 0) continue;
    const theta = thetaOf(st.sigma3, st.sigmaD);
    const tauOct = tauOctOf(st.sigmaD);
    const x2 = Math.log(theta / pa);
    const x3 = Math.log(tauOct / pa + 1);
    if (!Number.isFinite(x2) || !Number.isFinite(x3)) continue;
    rows.push({ y: Math.log(mr), x2, x3, mr });
  }

  if (rows.length < 4) return null;

  // Normais da regressão y = b0 + k2*x2 + k3*x3 (mínimos quadrados).
  const n = rows.length;
  let sx2 = 0, sx3 = 0, sy = 0, sx2x2 = 0, sx3x3 = 0, sx2x3 = 0, sx2y = 0, sx3y = 0;
  for (const r of rows) {
    sx2 += r.x2; sx3 += r.x3; sy += r.y;
    sx2x2 += r.x2 * r.x2; sx3x3 += r.x3 * r.x3; sx2x3 += r.x2 * r.x3;
    sx2y += r.x2 * r.y; sx3y += r.x3 * r.y;
  }
  const A = [
    [n, sx2, sx3],
    [sx2, sx2x2, sx2x3],
    [sx3, sx2x3, sx3x3],
  ];
  const b = [sy, sx2y, sx3y];
  const beta = solve3x3(A, b);
  if (!beta) return null;
  const [b0, k2, k3] = beta;
  const k1 = Math.exp(b0) / pa;

  // R² do ajuste em escala log.
  const yMean = sy / n;
  let ssRes = 0, ssTot = 0;
  for (const r of rows) {
    const yHat = b0 + k2 * r.x2 + k3 * r.x3;
    ssRes += (r.y - yHat) ** 2;
    ssTot += (r.y - yMean) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { k1, k2, k3, r2: Math.max(0, Math.min(1, r2)) };
}

/** MR previsto pelo modelo ajustado, num par (σ3, σd) qualquer — para desenhar a superfície/curvas. */
export function predictMR(fit: ModelFit, sigma3: number, sigmaD: number, atmPressureKpa: number): number {
  const pa = atmPressureKpa || 101.3;
  const theta = thetaOf(sigma3, sigmaD);
  const tauOct = tauOctOf(sigmaD);
  return fit.k1 * pa * (theta / pa) ** fit.k2 * (tauOct / pa + 1) ** fit.k3;
}
