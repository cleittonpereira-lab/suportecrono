import type { CDSample, CDSpecimen, CDSpecimenResults, CDEnvelopeResult, CDReading } from "../types";
import { GAMMA_W_KN } from "../constants";

const PI = Math.PI;
const G = 9.80665;

export const circleArea = (d_mm: number) => (PI * (d_mm / 10) ** 2) / 4;
export const rectArea = (w_mm: number, l_mm: number) => (w_mm / 10) * (l_mm / 10);
export const cylinderVolume = (area_cm2: number, h_mm: number) => area_cm2 * (h_mm / 10);

export function calculateArea0(sample: CDSample, cp: CDSpecimen): number {
  if (sample.geometry === "circular") {
    return circleArea(cp.diameterMm || sample.dimensionMm);
  }
  return rectArea(cp.widthMm || sample.dimensionMm, cp.lengthMm || sample.dimensionMm);
}

export function averageMoisturePct(caps?: { tara: number; wet: number; dry: number }[]): number | null {
  if (!caps || caps.length === 0) return null;
  const valid = caps
    .map((c) => {
      const ms = c.dry - c.tara;
      const mw = c.wet - c.dry;
      return ms > 0 ? (mw / ms) * 100 : null;
    })
    .filter((x): x is number => x != null && isFinite(x));
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function processSpecimen(cp: CDSpecimen, sample: CDSample): CDSpecimenResults {
  const A0 = calculateArea0(sample, cp);
  const V0 = cylinderVolume(A0, cp.height0Mm);
  
  const w0Pct = averageMoisturePct(cp.capsules) ?? cp.w0Pct;
  const w0 = w0Pct / 100;
  
  const wetMass = cp.wetMassCPAnel > 0 && cp.ringMass > 0 
    ? cp.wetMassCPAnel - cp.ringMass 
    : cp.wetMass;
    
  const dryMass = wetMass / (1 + w0);
  
  const rhoNat = V0 > 0 ? wetMass / V0 : 0;
  const rhoDry = V0 > 0 ? dryMass / V0 : 0;
  
  const gammaNat = rhoNat * G;
  const gammaDry = rhoDry * G;
  
  const e0 = (gammaDry > 0) ? (sample.Gs * GAMMA_W_KN) / gammaDry - 1 : 0;
  const Sr0 = e0 > 0 ? Math.min(100, (w0 * sample.Gs) / e0 * 100) : 0;

  const settlementMm = cp.consolidationSettlementMm || (cp.consolidationData?.length ? cp.consolidationData[cp.consolidationData.length-1].settlementMm : 0);
  const dVcons = (settlementMm / 10) * A0;
  const Hc = cp.height0Mm - settlementMm;
  const Vc = V0 - dVcons;
  const Vs = V0 / (1 + (e0 || 1));
  
  const eAfterCons = Vs > 0 ? Vc / Vs - 1 : 0;
  const rhoDryAfterCons = Vc > 0 ? dryMass / Vc : 0;
  const gammaDryAfterCons = rhoDryAfterCons * G;

  const curve = cp.shearData.map((r: CDReading) => {
    let areaCorr = A0;
    const delta = r.horizDispMm / 10; // cm
    
    if (sample.geometry === "circular") {
      const D = (cp.diameterMm || sample.dimensionMm) / 10; // cm
      if (delta < D) {
        const theta = 2 * Math.acos(delta / D);
        areaCorr = (D**2 / 4) * (theta - Math.sin(theta));
      } else areaCorr = 0.001;
    } else {
      const L = (cp.lengthMm || sample.dimensionMm) / 10; // cm
      const W = (cp.widthMm || sample.dimensionMm) / 10; // cm
      areaCorr = W * Math.max(0.001, L - delta);
    }
    
    const nominalDim = sample.dimensionMm / 10;
    const horizStrainPct = nominalDim > 0 ? (delta / nominalDim) * 100 : 0;
    
    const forceN = r.loadKgf != null ? r.loadKgf * G : r.shearForce;
    const shearStress = areaCorr > 0 ? (forceN / areaCorr) * 10 : 0; 
    
    return { horizDispMm: r.horizDispMm, horizStrainPct, shearStress, vertDispMm: r.vertDispMm, areaCorr };
  });

  const tauPeak = curve.length ? Math.max(...curve.map(c => c.shearStress)) : 0;
  const peakReading = curve.find(c => c.shearStress === tauPeak);
  
  const wFinalPct = averageMoisturePct(cp.finalCapsules) ?? cp.wFinalPct ?? w0Pct;
  const Sf = eAfterCons > 0 ? (wFinalPct/100 * sample.Gs) / eAfterCons * 100 : 0;
  
  return {
    area0: A0, 
    volume0: V0, 
    H0: cp.height0Mm,
    D0: cp.diameterMm || sample.dimensionMm,
    wetMass,
    dryMass,
    wetDensity: rhoNat, 
    dryDensity: rhoDry, 
    voidRatio0: e0, 
    moisture0Pct: w0Pct, 
    saturation0Pct: Sr0,
    gammaNat,
    gammaDry,
    Vs,
    Hc,
    Ac: A0,
    Vc,
    dVcons,
    heightAfterCons: Hc,
    voidRatioAfterCons: eAfterCons,
    dryDensityAfterCons: rhoDryAfterCons,
    saturationAfterConsPct: eAfterCons > 0 ? (w0 * sample.Gs) / eAfterCons * 100 : 0,
    moistureFinalPct: wFinalPct, 
    saturationFinalPct: Math.min(100, Sf),
    sigmaN: cp.normalStressTarget, 
    tauPeak, 
    tauResidual: curve.length ? curve[curve.length-1].shearStress : 0,
    horizStrainAtFailurePct: peakReading?.horizStrainPct ?? 0, 
    vertDispAtFailureMm: peakReading?.vertDispMm ?? 0,
    curve,
    consolidationCurve: cp.consolidationData || []
  };
}

export function fitEnvelope(pts: { sigma: number; tau: number; cp: string }[]): CDEnvelopeResult | null {
  if (pts.length < 2) return null;
  const n = pts.length;
  const sx = pts.reduce((a, p) => a + p.sigma, 0);
  const sy = pts.reduce((a, p) => a + p.tau, 0);
  const sxx = pts.reduce((a, p) => a + p.sigma * p.sigma, 0);
  const sxy = pts.reduce((a, p) => a + p.sigma * p.tau, 0);
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const M = (n * sxy - sx * sy) / denom;
  const c = (sy - M * sx) / n;
  
  const meanY = sy / n;
  const ssTot = pts.reduce((acc, p) => acc + (p.tau - meanY) ** 2, 0);
  const ssRes = pts.reduce((acc, p) => acc + (p.tau - (M * p.sigma + c)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;

  return { phiDeg: Math.atan(M) * 180 / PI, c, r2, points: pts };
}
