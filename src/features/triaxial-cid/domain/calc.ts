/**
 * Cálculos do ensaio Triaxial CID (adensado drenado).
 * Referências: ASTM D7181-20 §11–13, ISO 17892-9:2018.
 */
import type {
  EnvelopeResult,
  FailurePoint,
  SaturationStage,
  ShearReading,
  SpecimenResults,
  TriaxialSample,
  TriaxialSpecimen,
} from "../types";

const PI = Math.PI;

/** Área circular a partir do diâmetro [mm], resultado em cm². */
export const circleArea = (d_mm: number) => (PI * (d_mm / 10) ** 2) / 4;

/** Volume cilíndrico a partir de D [mm] e H [mm], resultado em cm³. */
export const cylinderVolume = (d_mm: number, h_mm: number) =>
  circleArea(d_mm) * (h_mm / 10);

/** B = Δu / Δσ3 — retorna o B do último incremento válido. */
export function computeBValue(stages: SaturationStage[]): number | null {
  if (stages.length < 2) return stages[0]?.bValue ?? null;
  for (let i = stages.length - 1; i >= 1; i--) {
    if (stages[i].bValue != null) return stages[i].bValue!;
    const dSig = stages[i].sigma3 - stages[i - 1].sigma3;
    const dU = stages[i].u - stages[i - 1].u;
    if (Math.abs(dSig) > 1e-6) return dU / dSig;
  }
  return null;
}

/**
 * Umidade média a partir das cápsulas da ficha de moldagem.
 * w [%] = (m_úmida − m_seca) / (m_seca − tara) · 100
 * Cápsulas com (seca − tara) ≤ 0 são descartadas.
 */
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

/**
 * Processa índices físicos iniciais + fase de adensamento.
 * Hc = H0 · (1 − ΔV/V0)^(1/3)  (deformação isotrópica)
 * Ac = A0 · (1 − ΔV/V0)^(2/3)
 */
export function processGeometry(cp: TriaxialSpecimen, sample: TriaxialSample) {
  const A0 = circleArea(cp.D0);
  const V0 = cylinderVolume(cp.D0, cp.H0);
  // Umidade média: preferir cápsulas se informadas
  const wFromCaps = averageMoisturePct(cp.capsules);
  const w0Pct = wFromCaps ?? cp.w0Pct;
  const w0 = w0Pct / 100;
  // Massas: derivar da relação úmida/seca quando possível
  const wetMass = cp.wetMass;
  const dryMass =
    wFromCaps != null && wetMass > 0 ? wetMass / (1 + w0) : cp.dryMass;
  const gammaNat = ((wetMass / V0) * 9.81) / 1; // kN/m³ (ρ[g/cm³]*9.81 = kN/m³)
  const gammaDry = ((dryMass / V0) * 9.81) / 1;
  // e₀ = Gs·γw/γd − 1  (com γw=9.81 kN/m³ e γd em kN/m³)
  const e0 = (sample.Gs * 9.81) / gammaDry - 1;
  const Sr0 = e0 > 0 ? Math.min(100, (w0 * sample.Gs) / e0 * 100) : 0;

  const dVcons = cp.consolidation.length
    ? cp.consolidation[cp.consolidation.length - 1].dv
    : 0;
  const vRatio = Math.max(0, 1 - dVcons / V0);
  const Hc = cp.H0 * Math.cbrt(vRatio);
  const Ac = A0 * Math.pow(vRatio, 2 / 3);
  const Vc = V0 - dVcons;
  // e após adensamento (assumindo Vs constante)
  const Vs = V0 / (1 + e0);
  const eAfterCons = Vc / Vs - 1;
  return { A0, V0, e0, Sr0, gammaNat, gammaDry, Hc, Ac, Vc, dVcons, eAfterCons, w0Pct, wetMass, dryMass };
}

/**
 * Processa a fase de cisalhamento drenado — CID.
 * Como o ensaio é drenado, u = uback (constante) → σ' = σ − uback.
 * σd = F / A, com A corrigida por Bishop & Henkel:
 *   A = Ac · (1 − εv) / (1 − εa)
 * Onde εa e εv vêm em fração (não %).
 */
export function processShear(
  cp: TriaxialSpecimen,
  geom: ReturnType<typeof processGeometry>,
  sample: TriaxialSample,
): SpecimenResults["shearCurve"] {
  const uBack = cp.backPressure;
  const sigma3Total = cp.sigma3Target + uBack; // σ3 total aplicado
  // Diâmetro corrigido após adensamento (mm) — usado nas correções de
  // membrana e papel filtro (ISO 17892-9:2018 §7.2.3 e §7.2.4).
  const Dc_mm = Math.sqrt((4 * geom.Ac) / Math.PI) * 10;
  const Kfp = sample.filterPaperResistance ?? 0; // kN/m — Fórmula (7)/(8)
  const applyFP = Kfp > 0;
  // Parâmetros do equipamento (ISO 17892-9:2018 §7.2.5, Fórmula 9):
  //   σv = [P + K + σc·(A_cor − a)] / A_cor − (Δσv)_m − (Δσv)_fp
  //   K  = W − (A_cor − a)·h·γw    (peso do pistão/topcap menos empuxo em água)
  //   W  = massa sobre o CP [g] · g   (peso do conjunto pistão+topcap+etc.)
  //   a  = área do pistão [cm²]     (haste que penetra na câmara)
  //   h  = altura do topcap [cm]     (parte submersa na água da câmara)
  //   γw = 9,80665e-3 N/cm³  (para manter unidades N/cm² → kPa · 10)
  //   Fatr = atrito do pistão [kgf] → descontado da leitura da célula P.
  const G = 9.80665; // m/s²
  const gammaW_Ncm3 = G * 1e-3; // 1 cm³ de água ≈ 9,80665e-3 N
  // A correção ISO §7.2.5 (peso pistão K + área da haste a) só é aplicada
  // se o operador habilitar explicitamente: a maioria das células de carga
  // já lê a força axial líquida transmitida ao CP e, quando isso ocorre,
  // aplicar σc·a/A zera as tensões desviadoras nas primeiras leituras.
  const applyPiston = sample.applyPistonCorrection === true;
  const a_cm2 = applyPiston ? (cp.aPistao ?? 0) : 0;         // cm²
  const h_cm  = applyPiston ? (cp.hTopcap ?? 0) : 0;         // cm
  const W_N   = applyPiston ? (cp.mSobreCP ?? 0) * G * 1e-3 : 0; // g → N
  // Atrito do pistão só é descontado quando a correção ISO §7.2.5 estiver
  // habilitada — caso contrário a célula de carga já entrega a força líquida
  // e descontar o atrito produziria σd subestimado.
  const Fatr_N = applyPiston ? (cp.fAtritoPistao ?? 0) * G : 0; // kgf → N
  // K depende de A_cor (varia a cada leitura), mas a variação é pequena;
  // recalculamos por linha para ficar consistente com a norma.
  const rows = cp.shear.map((r: ShearReading) => {
    const ea = r.eaPct / 100;
    const ev = r.dvPct / 100; // ε_vol durante o cisalhamento (fração)
    const uRow = r.uPore != null && isFinite(r.uPore) ? r.uPore : uBack;
    const sigma3TotRow =
      r.sigma3Corr != null && isFinite(r.sigma3Corr) ? r.sigma3Corr + uRow : sigma3Total;
    // Área corrigida em cm² — ISO 17892-9:2018 §7.2.2 Fórmula (4),
    // expressa em termos de ε_a e ε_vol pós-adensamento (Bishop & Henkel):
    //   A_cor = A_c · (1 − ε_vol) / (1 − ε_a)
    const A = (geom.Ac * (1 - ev)) / Math.max(1e-6, 1 - ea); // cm²
    // Força axial em N: preferir kgf lido na célula (F = kgf · 9,80665) se informado.
    const Praw_N =
      r.loadKgf != null && isFinite(r.loadKgf) ? r.loadKgf * G : r.F;
    // Descontar o atrito do pistão (ASTM D7181 §11.4 / ISO §7.2.1).
    const P_N = Math.max(0, Praw_N - Fatr_N);
    // K = W − (A_cor − a)·h·γw   [N]
    const K_N = W_N - Math.max(0, A - a_cm2) * h_cm * gammaW_Ncm3;
    // σv (total) — ISO Fórmula (9), em kPa (N/cm² · 10):
    //   σv = (P + K)/A · 10  +  σc·(A − a)/A  − (Δσv)_m − (Δσv)_fp
    // σd = σv − σc reduz para:
    //   σd = (P + K)/A · 10  − σc·a/A  − (Δσv)_m − (Δσv)_fp   (+ (Δσh)_m)
    let sigmaD =
      ((P_N + K_N) / A) * 10
      - (sigma3TotRow * a_cm2) / Math.max(1e-6, A);
    // Correção de membrana — ISO 17892-9:2018 §7.2.3 Fórmulas (5) e (6):
    //   (Δσv)_m = 4·tm·Em/Dc · [ε_a + ε_vol/3]
    //   (Δσh)_m = 4·tm·Em/Dc · (ε_vol/3)
    // A tensão desvio é reduzida pelo desbalanço (Δσv)_m − (Δσh)_m,
    // que se simplifica a 4·tm·Em/Dc · ε_a.
    if (sample.applyMembrane && Dc_mm > 0) {
      const k = (4 * sample.membraneE * sample.membraneT) / Dc_mm;
      const dSigV_m = k * (ea + ev / 3);
      const dSigH_m = k * (ev / 3);
      sigmaD = sigmaD - (dSigV_m - dSigH_m);
    }
    // Correção de papel filtro — ISO 17892-9:2018 §7.2.4 Fórmulas (7) e (8).
    // Pfp = π·Dc (perímetro totalmente coberto por drenos verticais).
    if (applyFP && Dc_mm > 0) {
      const Dc_m = Dc_mm / 1000;
      const Pfp = Math.PI * Dc_m; // m
      const dSigV_fp =
        ea <= 0.02
          ? (ea * Kfp * Pfp) / (0.005 * Dc_m)
          : (Kfp * Pfp) / (0.25 * Dc_m);
      sigmaD = sigmaD - dSigV_fp; // kN/m² = kPa
    }
    sigmaD = Math.max(0, sigmaD);
    const sigma1 = sigma3TotRow + sigmaD;
    const sigma1Prime = sigma1 - uRow;
    const sigma3Prime = sigma3TotRow - uRow;
    // Invariantes de tensão — convenção MIT / diagrama t–s' (ISO 17892-9
    // Anexo B, "Additional calculations for effective shear strength"):
    //   q  = (σ1 − σ3) / 2
    //   p' = (σ'1 + σ'3) / 2
    const q = (sigma1 - sigma3TotRow) / 2;
    const pPrime = (sigma1Prime + sigma3Prime) / 2;
    return {
      eaPct: r.eaPct,
      q,
      sigmaD,
      pPrime,
      sigma1,
      sigma1Prime,
      sigma3Prime,
      evPct: r.dvPct,
      A,
    };
  });
  return rows;
}

/** Ponto de ruptura conforme critério escolhido. */
export function findFailure(
  curve: SpecimenResults["shearCurve"],
  criterion: TriaxialSpecimen["failureCriterion"],
): FailurePoint | null {
  if (!curve.length) return null;
  let best = curve[0];
  let bestVal = -Infinity;
  for (const p of curve) {
    const val =
      criterion === "max_ratio"
        ? p.sigma3Prime > 0
          ? p.sigma1Prime / p.sigma3Prime
          : -Infinity
        : p.q;
    if (val > bestVal) {
      bestVal = val;
      best = p;
    }
  }
  return {
    eaPct: best.eaPct,
    q: best.q,
    pPrime: best.pPrime,
    sigma1Prime: best.sigma1Prime,
    sigma3Prime: best.sigma3Prime,
    ratio: best.sigma3Prime > 0 ? best.sigma1Prime / best.sigma3Prime : 0,
  };
}

/** Processa 1 CP inteiro. */
export function processSpecimen(
  cp: TriaxialSpecimen,
  sample: TriaxialSample,
): SpecimenResults {
  const geom = processGeometry(cp, sample);
  const shearCurve = processShear(cp, geom, sample);
  const failure = findFailure(shearCurve, cp.failureCriterion);
  const BFinal = computeBValue(cp.saturation);
  return {
    ...geom,
    BFinal,
    shearCurve,
    failure,
  };
}

/**
 * Envoltória de Mohr-Coulomb ajustada em (p', q) por regressão linear —
 * convenção MIT (t–s'), ISO 17892-9:2018 Anexo B:
 *   q_f = tan α' · p'_f + k        (reta Kf)
 *   sen φ' = tan α'                (Fórmula B.1)
 *   c' = k / cos φ'                (Fórmula B.2)
 */
export function fitEnvelope(
  pts: { pPrime: number; q: number; cp: string }[],
): EnvelopeResult | null {
  if (pts.length < 2) return null;
  const n = pts.length;
  const sx = pts.reduce((a, p) => a + p.pPrime, 0);
  const sy = pts.reduce((a, p) => a + p.q, 0);
  const sxx = pts.reduce((a, p) => a + p.pPrime * p.pPrime, 0);
  const sxy = pts.reduce((a, p) => a + p.pPrime * p.q, 0);
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const M = (n * sxy - sx * sy) / denom; // = tan α'
  const a = (sy - M * sx) / n;           // = k (intercepto Kf)
  const meanY = sy / n;
  const ssTot = pts.reduce((acc, p) => acc + (p.q - meanY) ** 2, 0);
  const ssRes = pts.reduce((acc, p) => acc + (p.q - (M * p.pPrime + a)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  // ISO 17892-9 Anexo B: sen φ' = tan α'
  const sinPhi = Math.min(0.999, Math.max(-0.999, M));
  const phi = Math.asin(sinPhi);
  const phiDeg = (phi * 180) / PI;
  const cPrime = a / Math.cos(phi);
  return { phiDeg, cPrime, M, a, r2, points: pts };
}

/** Gera pontos para desenhar um círculo de Mohr (σn, τ). */
export function mohrCirclePoints(sigma3: number, sigma1: number, n = 60) {
  const center = (sigma1 + sigma3) / 2;
  const R = (sigma1 - sigma3) / 2;
  const out: { sigma: number; tau: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const th = (PI * i) / n; // 0..π (semicírculo superior)
    out.push({ sigma: center + R * Math.cos(th), tau: R * Math.sin(th) });
  }
  return out;
}