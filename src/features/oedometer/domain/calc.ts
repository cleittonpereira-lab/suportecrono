import type {
  OedSampleProps,
  OedStage,
  OedPhysicalIndices,
  OedStageCalculated,
  OedCompressibilityParams,
  OedCalcMemoryStep,
  TaylorResult,
  CgrTimeResult,
  PreconsolidationAdjust,
  CvLineAdjust,
} from "../types";
import { GAMMA_W } from "../constants";

export const PI = Math.PI;

export const ringArea = (d_mm: number) => (PI * (d_mm / 10) ** 2) / 4;
export const ringVolume = (d_mm: number, h_mm: number) => ringArea(d_mm) * (h_mm / 10);

export function calculatePhysicalIndices(s: OedSampleProps): OedPhysicalIndices {
  const A = ringArea(s.ringDiameter);
  const V0 = ringVolume(s.ringDiameter, s.ringHeight);
  const wi = s.dryMass > 0 ? ((s.wetMassInitial - s.dryMass) / s.dryMass) * 100 : 0;
  const wf = s.dryMass > 0 ? ((s.wetMassFinal - s.dryMass) / s.dryMass) * 100 : 0;
  const rho_i = V0 > 0 ? s.wetMassInitial / V0 : 0;
  const rho_d = V0 > 0 ? s.dryMass / V0 : 0;
  const Vs = s.Gs > 0 && s.rhoW > 0 ? s.dryMass / (s.Gs * s.rhoW) : 1;
  const e0 = Vs > 0 ? V0 / Vs - 1 : 0;
  const Sr0 = e0 > 0 ? ((wi / 100) * s.Gs) / e0 * 100 : 0;
  const Vw_f = (s.wetMassFinal - s.dryMass) / s.rhoW;
  const ef_assumed_sat = Math.min(e0, Vs > 0 ? Vw_f / Vs : e0);
  const Srf = ef_assumed_sat > 0 ? Math.min(100, (((wf / 100) * s.Gs) / ef_assumed_sat) * 100) : 100;
  return {
    A,
    V0,
    Vs,
    wi,
    wf,
    rho_i,
    rho_d,
    rho_f: rho_i,
    e0,
    ef: ef_assumed_sat,
    Sr0: Math.min(100, Math.max(0, Sr0)),
    Srf: Math.min(100, Math.max(0, Srf)),
  };
}

export const voidRatio = (e0: number, H0: number, dH: number) =>
  H0 > 0 ? e0 - (dH / H0) * (1 + e0) : e0;

export function linearFit(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n === 0) return { m: 0, b: 0 };
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sxx = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sxx - sx * sx;
  const m = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
  const b = (sy - m * sx) / n;
  return { m, b };
}

export function interp(pts: { t: number; d: number }[], t: number) {
  if (!pts || pts.length === 0) return null;
  if (t <= pts[0].t) return pts[0].d;
  if (t >= pts[pts.length - 1].t) return pts[pts.length - 1].d;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].t >= t) {
      const dt = pts[i].t - pts[i - 1].t;
      if (dt === 0) return pts[i].d;
      const f = (t - pts[i - 1].t) / dt;
      return pts[i - 1].d + f * (pts[i].d - pts[i - 1].d);
    }
  }
  return null;
}

export function cvTaylor(stage: OedStage, Hdrain_mm: number): TaylorResult | null {
  const pts = (stage.readings || []).filter((r) => r.t > 0).map((r) => ({ x: Math.sqrt(r.t), y: r.d }));
  if (pts.length < 4) return null;
  const init = pts.slice(0, 4);
  const { m, b } = linearFit(init.map((p) => p.x), init.map((p) => p.y));
  const m90 = m / 1.15;
  let t90sqrt: number | null = null;
  for (let i = 1; i < pts.length; i++) {
    const f1 = pts[i - 1].y - (b + m90 * pts[i - 1].x);
    const f2 = pts[i].y - (b + m90 * pts[i].x);
    if (f1 * f2 < 0) {
      const frac = f1 / (f1 - f2);
      t90sqrt = pts[i - 1].x + frac * (pts[i].x - pts[i - 1].x);
      break;
    }
  }
  if (!t90sqrt) return null;
  const t90_min = t90sqrt ** 2;
  const t90_s = t90_min * 60;
  const Hd_cm = Hdrain_mm / 10;
  const cv = t90_s > 0 ? (0.848 * Hd_cm * Hd_cm) / t90_s : 0;
  return { t90: t90_min, t90_s, cv, d0: b, slope: m, slope90: m90, d90: b + m90 * t90sqrt };
}

export function cvCasagrande(stage: OedStage, Hdrain_mm: number): CgrTimeResult | null {
  const pts = (stage.readings || []).filter((r) => r.t > 0);
  if (pts.length < 6) return null;
  const t1 = pts[0].t;
  const t4 = t1 * 4;
  const p1 = interp(pts, t1);
  const p4 = interp(pts, t4);
  if (p1 == null || p4 == null) return null;
  const d0 = p1 - (p4 - p1);
  const n = pts.length;
  const sec = pts.slice(Math.max(0, n - 3));
  const { m: mS, b: bS } = linearFit(sec.map((p) => Math.log10(p.t)), sec.map((p) => p.d));
  let best = { slope: 0, b: 0 };
  for (let i = 0; i < n - 2; i++) {
    const seg = pts.slice(i, i + 3);
    const { m, b } = linearFit(seg.map((p) => Math.log10(p.t)), seg.map((p) => p.d));
    if (m > best.slope) best = { slope: m, b };
  }
  if (mS === best.slope) return null;
  const x100 = (best.b - bS) / (mS - best.slope);
  const d100 = bS + mS * x100;
  const d50 = (d0 + d100) / 2;
  let t50: number | null = null;
  for (let i = 1; i < pts.length; i++) {
    if ((pts[i - 1].d - d50) * (pts[i].d - d50) <= 0) {
      const denom = pts[i].d - pts[i - 1].d;
      const frac = denom !== 0 ? (d50 - pts[i - 1].d) / denom : 0;
      const lt = Math.log10(pts[i - 1].t) + frac * (Math.log10(pts[i].t) - Math.log10(pts[i - 1].t));
      t50 = Math.pow(10, lt);
      break;
    }
  }
  if (!t50) return null;
  const t50_s = t50 * 60;
  const Hd_cm = Hdrain_mm / 10;
  const cv = t50_s > 0 ? (0.197 * Hd_cm * Hd_cm) / t50_s : 0;
  return {
    t50,
    t50_s,
    cv,
    d0,
    d100,
    d50,
    x100,
    primary: { m: best.slope, b: best.b },
    secondary: { m: mS, b: bS },
  };
}

export function virginFit(curve: { sigma: number; e: number }[]) {
  const n = curve.length;
  const k = Math.min(4, Math.max(3, n - 3));
  const tail = curve.slice(n - k);
  return linearFit(tail.map((p) => Math.log10(p.sigma)), tail.map((p) => p.e));
}

export function casagrandeSigmaP(curve: { sigma: number; e: number }[]) {
  if (curve.length < 4) return null;
  const { m: mV, b: bV } = virginFit(curve);

  let maxK = -Infinity;
  let kIdx = 1;
  for (let i = 1; i < curve.length - 1; i++) {
    const x0 = Math.log10(curve[i - 1].sigma);
    const x1 = Math.log10(curve[i].sigma);
    const x2 = Math.log10(curve[i + 1].sigma);
    const y0 = curve[i - 1].e, y1 = curve[i].e, y2 = curve[i + 1].e;
    const d1 = (y1 - y0) / (x1 - x0);
    const d2 = (y2 - y1) / (x2 - x1);
    const dd = (d2 - d1) / ((x2 - x0) / 2);
    const dAvg = (d1 + d2) / 2;
    const k = Math.abs(dd) / Math.pow(1 + dAvg * dAvg, 1.5);
    if (k > maxK) {
      maxK = k;
      kIdx = i;
    }
  }
  const P = { x: Math.log10(curve[kIdx].sigma), y: curve[kIdx].e };
  const dx = Math.log10(curve[kIdx + 1].sigma) - Math.log10(curve[kIdx - 1].sigma);
  const tSlope = dx !== 0 ? (curve[kIdx + 1].e - curve[kIdx - 1].e) / dx : 0;
  const angT = Math.atan(tSlope);
  const angBis = angT / 2;
  const bisSlope = Math.tan(angBis);
  const bisB = P.y - bisSlope * P.x;
  const xI = bisSlope !== mV ? (bV - bisB) / (bisSlope - mV) : P.x;
  const yI = mV * xI + bV;
  const sigmaP = Math.pow(10, xI);
  return {
    sigmaP,
    point: P,
    intersection: { x: xI, y: yI },
    tangent: { m: tSlope, b: P.y - tSlope * P.x },
    horizontal: P.y,
    virgin: { m: mV, b: bV },
    bisector: { m: bisSlope, b: bisB },
  };
}

export function curveEAt(curve: { sigma: number; e: number }[], sigma: number) {
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

export function pachecoSilvaSigmaP(curve: { sigma: number; e: number }[], e0: number) {
  if (curve.length < 4) return null;
  const { m: mV, b: bV } = virginFit(curve);
  if (mV === 0) return null;
  const xA = (e0 - bV) / mV;
  const sigmaA = Math.pow(10, xA);
  const eB = curveEAt(curve, sigmaA);
  if (eB == null) return null;
  const xC = (eB - bV) / mV;
  const sigmaP = Math.pow(10, xC);
  return {
    sigmaP,
    e0Line: e0,
    A: { x: xA, y: e0, sigma: sigmaA },
    B: { x: xA, y: eB, sigma: sigmaA },
    C: { x: xC, y: eB, sigma: sigmaP },
    virgin: { m: mV, b: bV },
  };
}

export function ccCr(curve: { sigma: number; e: number }[]) {
  if (curve.length < 3) return { Cc: 0, Cr: 0 };
  const { m: mV } = virginFit(curve);
  const head = curve.slice(0, Math.min(3, curve.length));
  const { m: mR } = linearFit(head.map((p) => Math.log10(p.sigma)), head.map((p) => p.e));
  return { Cc: Math.max(0, -mV), Cr: Math.max(0, -mR) };
}

/**
 * Executa o processamento completo de todos os estágios do ensaio de adensamento edométrico.
 */
export function calculateOedometerStages(
  sample: OedSampleProps,
  stages: OedStage[],
  phys: OedPhysicalIndices,
  cvAdjust: Record<number, CvLineAdjust> = {}
): OedStageCalculated[] {
  let prevDial = 0;
  return stages.map((st, i) => {
    const isSeatingStage = st.isSeatingStage === true;
    const settlementMm = st.finalDial - prevDial;
    const totalSettlementMm = st.finalDial;
    const Hfinal = sample.ringHeight - st.finalDial;
    const Havg_mm = sample.ringHeight - (prevDial + st.finalDial) / 2;
    const Hdrain_mm = Havg_mm / 2;
    const e = voidRatio(phys.e0, sample.ringHeight, st.finalDial);
    const strainPct = sample.ringHeight > 0 ? (st.finalDial / sample.ringHeight) * 100 : 0;

    const phase: "load" | "unload" | "reload" =
      i === 0
        ? "load"
        : st.sigma < stages[i - 1].sigma
        ? "unload"
        : st.sigma > stages[i - 1].sigma && stages.slice(0, i).some((s) => s.sigma >= st.sigma)
        ? "reload"
        : "load";

    const baseT = phase === "load" && !isSeatingStage ? cvTaylor(st, Hdrain_mm) : null;
    const baseC = phase === "load" && !isSeatingStage ? cvCasagrande(st, Hdrain_mm) : null;

    const dSigma = i === 0 ? st.sigma : Math.abs(st.sigma - stages[i - 1].sigma);
    const ePrev = voidRatio(phys.e0, sample.ringHeight, prevDial);
    const de = Math.abs(ePrev - e);
    const av = dSigma > 0 ? de / dSigma : null;
    const mv = dSigma > 0 && ePrev > -1 ? de / (1 + ePrev) / dSigma : null;
    const Ed = mv && mv > 0 ? (1 / mv) / 1000 : null; // MPa

    const cvT = baseT?.cv ?? null;
    const cvC = baseC?.cv ?? null;
    const kvTaylor = cvT && mv ? cvT * mv * GAMMA_W : null;
    const kvCas = cvC && mv ? cvC * mv * GAMMA_W : null;

    // Coeficiente de adensamento secundário Ca
    const ca =
      phase === "load" && !isSeatingStage && st.readings.length >= 3
        ? Math.max(
            0,
            Math.abs((st.readings[st.readings.length - 1]?.d ?? st.finalDial) - (st.readings[st.readings.length - 3]?.d ?? st.finalDial)) /
              sample.ringHeight
          )
        : null;

    prevDial = st.finalDial;

    return {
      index: i,
      phase,
      isSeatingStage,
      sigma: st.sigma,
      prevDial,
      finalDial: st.finalDial,
      settlementMm,
      totalSettlementMm,
      Hfinal,
      Havg_mm,
      Hdrain_mm,
      e,
      strainPct,
      cvTaylor: cvT,
      t90: baseT?.t90 ?? null,
      taylorResult: baseT,
      cvCas: cvC,
      t50: baseC?.t50 ?? null,
      casResult: baseC,
      av,
      mv,
      Ed,
      kvTaylor,
      kvCas,
      ca,
    };
  });
}

/**
 * Gera a memória de cálculo passo a passo auditável.
 */
export function generateOedCalcMemory(
  sample: OedSampleProps,
  phys: OedPhysicalIndices,
  params: OedCompressibilityParams,
  stagesCalc: OedStageCalculated[]
): OedCalcMemoryStep[] {
  const steps: OedCalcMemoryStep[] = [
    {
      title: "1. Dimensões Iniciais e Índices Físicos do Corpo de Prova",
      formula: "V_0 = \frac{\pi D_0^2}{4} \cdot H_0; \quad w_0 = \frac{M_{ui} - M_s}{M_s} \cdot 100; \quad \rho_d = \frac{M_s}{V_0}; \quad e_0 = \frac{V_0}{V_s} - 1",
      inputs: {
        "D0 (mm)": sample.ringDiameter,
        "H0 (mm)": sample.ringHeight,
        "M_um_inicial (g)": sample.wetMassInitial,
        "M_seco (g)": sample.dryMass,
        "Gs (g/cm³)": sample.Gs,
      },
      result: `V0 = ${phys.V0.toFixed(2)} cm³, w0 = ${phys.wi.toFixed(2)} %, ρd = ${phys.rho_d.toFixed(3)} g/cm³, e0 = ${phys.e0.toFixed(3)}, Sr0 = ${phys.Sr0.toFixed(1)} %`,
      explanation: "Determinação do estado inicial do solo a partir das massas antes e após secagem em estufa a 105°C e geometria do anel edométrico conforme ASTM D2435 / NBR 12007.",
    },
    {
      title: "2. Equação de Variação de Índice de Vazios",
      formula: "e = e_0 - \frac{\Delta H}{H_0} \cdot (1 + e_0)",
      inputs: {
        "e0": phys.e0.toFixed(3),
        "H0 (mm)": sample.ringHeight,
        "Recalque Total ΔH (mm)": stagesCalc[stagesCalc.length - 1]?.totalSettlementMm.toFixed(3) ?? "0",
      },
      result: `ef = ${(stagesCalc[stagesCalc.length - 1]?.e ?? phys.ef).toFixed(3)}`,
      explanation: "Variação do índice de vazios em função do recalque vertical sob hipótese de área de seção transversal constante (deformação unicamente unidimensional).",
    },
    {
      title: "3. Tensão de Pré-Adensamento (σ'vm) e Índices de Compressibilidade (Cc, Cs, Cr)",
      formula: "C_c = -\frac{\Delta e}{\Delta \log \sigma'} \text{ (Reta Virgem)}; \quad \sigma'_{vm} \text{ (Casagrande e Pacheco Silva)}; \quad OCR = \frac{\sigma'_{vm}}{\sigma'_{v0}}",
      inputs: {
        "σ'vm (Casagrande)": `${params.sigmaP_Cas.toFixed(1)} kPa`,
        "σ'vm (Pacheco Silva)": `${params.sigmaP_PS.toFixed(1)} kPa`,
        "σ'v0 (kPa)": sample.sigmaV0 ?? "—",
      },
      result: `Cc = ${params.Cc.toFixed(3)}, Cs = ${params.Cs.toFixed(3)}, Cr = ${params.Cr.toFixed(3)}, σ'vm adotada = ${params.sigmaP_Adopted.toFixed(1)} kPa${params.OCR ? `, OCR = ${params.OCR.toFixed(2)}` : ""}`,
      explanation: "Determinação do ponto de transição entre o comportamento sobreconsolidado (recompressão) e normalmente consolidado (compressão virgem).",
    },
    {
      title: "4. Coeficiente de Adensamento (Cv) e Permeabilidade (k)",
      formula: "C_v = \frac{T_{90} \cdot H_d^2}{t_{90}} = \frac{0.848 \cdot H_d^2}{t_{90}} \text{ (Taylor)}; \quad k = C_v \cdot m_v \cdot \gamma_w",
      inputs: {
        "Hd médio (mm)": (stagesCalc[0]?.Hdrain_mm ?? sample.ringHeight / 2).toFixed(2),
        "γw": "9.807 kN/m³",
      },
      result: "Calculado estágio por estágio conforme tabelas e curvas anexas.",
      explanation: "Determinação da taxa de dissipação de poro-pressões e estimativa indireta da permeabilidade vertical do solo.",
    },
  ];
  return steps;
}
