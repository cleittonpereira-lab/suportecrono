// Oedometer (1D Consolidation) - Suporte Infra
// Unidades: σ' [kPa], H, ΔH [mm], massas [g], V [cm³], Cv [cm²/s], kv [cm/s]

export interface MoistureCapsule {
  numero?: string;
  tipo?: string;
  tara: number;
  wet: number;
  dry: number;
}

export interface SampleProps {
  project: string;
  client: string;
  workNumber: string;
  reportNumber: string;
  borehole: string;
  depth: string;
  local: string;
  date: string;
  revision: string;
  operator: string;
  technicalResp: string;
  description: string;
  code: string;
  os: string;
  granulometricDescription: string;
  equipment?: string;
  ringNumber?: string;
  ringMass?: number;
  wetMassInitialWithRing?: number;
  wetMassFinalWithRing?: number;
  ringDiameter: number; // mm
  ringHeight: number; // mm (H0)
  wetMassInitial: number; // g
  wetMassFinal: number; // g
  dryMass: number; // g
  Gs: number;
  rhoW: number; // g/cm3
  capsules?: MoistureCapsule[];
  finalCapsules?: MoistureCapsule[];
}

export interface Stage {
  sigma: number; // kPa
  readings: { t: number; d: number }[]; // t [min], d [mm] cumulative settlement
  finalDial: number; // mm
  isSeatingStage?: boolean;
}

export const PI = Math.PI;

export const ringArea = (d_mm: number) => (PI * (d_mm / 10) ** 2) / 4;
export const ringVolume = (d_mm: number, h_mm: number) => ringArea(d_mm) * (h_mm / 10);

export function calcMoistureFromCapsules(caps?: MoistureCapsule[]): number | null {
  if (!caps || caps.length === 0) return null;
  const valid = caps
    .map((c) => {
      const ms = c.dry - c.tara;
      return ms > 0 && c.wet >= c.dry ? ((c.wet - c.dry) / ms) * 100 : NaN;
    })
    .filter((v) => isFinite(v));
  return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

export function physicalIndices(s: SampleProps) {
  const A = ringArea(s.ringDiameter);
  const V0 = ringVolume(s.ringDiameter, s.ringHeight);

  // Massa úmida inicial (com desconto do anel se informado com anel)
  const wetMassInitial =
    typeof s.wetMassInitialWithRing === "number" && typeof s.ringMass === "number" && s.wetMassInitialWithRing > s.ringMass
      ? s.wetMassInitialWithRing - s.ringMass
      : s.wetMassInitial;

  // Massa úmida final
  const wetMassFinal =
    typeof s.wetMassFinalWithRing === "number" && typeof s.ringMass === "number" && s.wetMassFinalWithRing > s.ringMass
      ? s.wetMassFinalWithRing - s.ringMass
      : s.wetMassFinal;

  // Umidades por cápsulas
  const wiFromCaps = calcMoistureFromCapsules(s.capsules);
  const wfFromCaps = calcMoistureFromCapsules(s.finalCapsules);

  // Massa seca calculada
  const wi = wiFromCaps != null ? wiFromCaps : s.dryMass > 0 ? ((wetMassInitial - s.dryMass) / s.dryMass) * 100 : 0;
  const dryMass = s.dryMass > 0 ? s.dryMass : wi > 0 ? wetMassInitial / (1 + wi / 100) : wetMassInitial;
  const wf = wfFromCaps != null ? wfFromCaps : dryMass > 0 ? ((wetMassFinal - dryMass) / dryMass) * 100 : 0;

  const rho_i = V0 > 0 ? wetMassInitial / V0 : 0;
  const rho_d = V0 > 0 ? dryMass / V0 : 0;
  const Vs = s.Gs > 0 && s.rhoW > 0 ? dryMass / (s.Gs * s.rhoW) : 0;
  const e0 = Vs > 0 ? V0 / Vs - 1 : 0;
  const Sr0 = e0 > 0 && s.Gs > 0 ? ((wi / 100) * s.Gs) / e0 : 0;
  const Vw_f = s.rhoW > 0 ? (wetMassFinal - dryMass) / s.rhoW : 0;
  const ef_assumed_sat = Vs > 0 ? Math.min(e0, Vw_f / Vs) : e0;
  const Srf = ef_assumed_sat > 0 && s.Gs > 0 ? Math.min(1, ((wf / 100) * s.Gs) / ef_assumed_sat) : 0;

  return {
    A,
    V0,
    Vs,
    wi,
    wf,
    wetMassInitial,
    wetMassFinal,
    dryMass,
    rho_i,
    rho_d,
    rho_f: V0 > 0 ? wetMassFinal / V0 : 0,
    e0,
    ef: ef_assumed_sat,
    Sr0: Sr0 * 100,
    Srf: Srf * 100,
  };
}

export const voidRatio = (e0: number, H0: number, dH: number) => e0 - (dH / H0) * (1 + e0);

// ===== Cv per stage =====
// Hd = drainage path [mm]; output Cv [cm²/s], kv [cm/s]

export function cvTaylor(stage: Stage, Hdrain_mm: number) {
  const pts = stage.readings.filter((r) => r.t > 0).map((r) => ({ x: Math.sqrt(r.t), y: r.d }));
  if (pts.length < 4) return null;
  const init = pts.slice(0, 4);
  const { m, b } = linearFit(init.map((p) => p.x), init.map((p) => p.y));
  // Taylor (raiz do tempo): a reta de 90% é traçada a partir do mesmo
  // intercepto com as abscissas 15% maiores que a reta inicial. No gráfico
  // ΔH × √t isso equivale a usar uma inclinação m / 1,15 (não m × 1,15).
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
  const cv = (0.848 * Hd_cm * Hd_cm) / t90_s; // cm²/s
  return { t90: t90_min, t90_s, cv, d0: b, slope: m, slope90: m90, d90: b + m90 * t90sqrt };
}

export function cvCasagrande(stage: Stage, Hdrain_mm: number) {
  const pts = stage.readings.filter((r) => r.t > 0);
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
  const x100 = (best.b - bS) / (mS - best.slope);
  const d100 = bS + mS * x100;
  const d50 = (d0 + d100) / 2;
  let t50: number | null = null;
  for (let i = 1; i < pts.length; i++) {
    if ((pts[i - 1].d - d50) * (pts[i].d - d50) <= 0) {
      const frac = (d50 - pts[i - 1].d) / (pts[i].d - pts[i - 1].d);
      const lt = Math.log10(pts[i - 1].t) + frac * (Math.log10(pts[i].t) - Math.log10(pts[i - 1].t));
      t50 = Math.pow(10, lt);
      break;
    }
  }
  if (!t50) return null;
  const t50_s = t50 * 60;
  const Hd_cm = Hdrain_mm / 10;
  const cv = (0.197 * Hd_cm * Hd_cm) / t50_s; // cm²/s
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

function linearFit(xs: number[], ys: number[]) {
  const n = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sxx = xs.reduce((a, x) => a + x * x, 0);
  const m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const b = (sy - m * sx) / n;
  return { m, b };
}

function interp(pts: { t: number; d: number }[], t: number) {
  if (t <= pts[0].t) return pts[0].d;
  if (t >= pts[pts.length - 1].t) return pts[pts.length - 1].d;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].t >= t) {
      const f = (t - pts[i - 1].t) / (pts[i].t - pts[i - 1].t);
      return pts[i - 1].d + f * (pts[i].d - pts[i - 1].d);
    }
  }
  return null;
}

// ===== σ'p methods =====
// virginFit: fit straight line on the LAST highest-stress points where curve is linear in log σ'
function virginFit(curve: { sigma: number; e: number }[]) {
  // pick last 3-4 points (assumed virgin compression)
  const n = curve.length;
  const k = Math.min(4, Math.max(3, n - 3));
  const tail = curve.slice(n - k);
  return linearFit(tail.map((p) => Math.log10(p.sigma)), tail.map((p) => p.e));
}

/**
 * Casagrande (1936) — graphical:
 * 1) Find point of maximum curvature P on e × log σ' curve
 * 2) Draw horizontal line through P
 * 3) Draw tangent at P
 * 4) Draw bisector of the angle between horizontal and tangent (use TRUE angle bisector)
 * 5) σ'p = intersection of bisector with extrapolated virgin compression line
 */
export function casagrandeSigmaP(curve: { sigma: number; e: number }[]) {
  if (curve.length < 5) return null;
  const { m: mV, b: bV } = virginFit(curve);

  // Find max curvature in (log σ', e) using discrete second derivative magnitude / (1 + d²)^1.5
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
  // tangent slope (use neighbors)
  const tSlope =
    (curve[kIdx + 1].e - curve[kIdx - 1].e) /
    (Math.log10(curve[kIdx + 1].sigma) - Math.log10(curve[kIdx - 1].sigma));
  // TRUE angle bisector between horizontal (angle = 0) and tangent (angle = atan(tSlope))
  const angT = Math.atan(tSlope);
  const angBis = angT / 2;
  const bisSlope = Math.tan(angBis);
  const bisB = P.y - bisSlope * P.x;
  // intersection with virgin: bisSlope*x + bisB = mV*x + bV
  const xI = (bV - bisB) / (bisSlope - mV);
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

/**
 * Pacheco Silva (1970) — graphical:
 * 1) Draw horizontal line at e = e0
 * 2) Extrapolate virgin compression line; find intersection A with the e0 horizontal
 * 3) From A, drop vertical down to the curve → point B (on the lab curve)
 * 4) From B, draw horizontal until it meets the virgin line → point C
 * 5) σ'p = abscissa of C
 */
export function pachecoSilvaSigmaP(curve: { sigma: number; e: number }[], e0: number) {
  if (curve.length < 4) return null;
  const { m: mV, b: bV } = virginFit(curve);
  // A: virgin ∩ y=e0  → xA = (e0 - bV)/mV
  const xA = (e0 - bV) / mV;
  const sigmaA = Math.pow(10, xA);
  // B: vertical down at sigma=sigmaA, find e on lab curve by log interpolation
  const eB = curveEAt(curve, sigmaA);
  if (eB == null) return null;
  // C: horizontal at e=eB meets virgin line → xC = (eB - bV)/mV
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

function curveEAt(curve: { sigma: number; e: number }[], sigma: number) {
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

export function ccCr(curve: { sigma: number; e: number }[]) {
  if (curve.length < 4) return { Cc: 0, Cr: 0 };
  const { m: mV } = virginFit(curve);
  const head = curve.slice(0, Math.min(3, curve.length));
  const { m: mR } = linearFit(head.map((p) => Math.log10(p.sigma)), head.map((p) => p.e));
  return { Cc: -mV, Cr: -mR };
}

// ===== Seed (Suporte Infra · padrão GRU/Argila) =====
export const seedSample: SampleProps = {
  project: "Caracterização Geotécnica",
  client: "Suporte Infra Engenharia",
  workNumber: "6128",
  reportNumber: "6128-RT-00-LAB-GER-001",
  borehole: "SH-01",
  depth: "2,50 a 3,00 m",
  local: "Guarulhos / SP",
  date: "31/07/2025",
  revision: "R00",
  operator: "Eng. Lab. Suporte Infra",
  technicalResp: "Engº Maurício Malanconi - CREA: 5063078630",
  description: "Argila siltosa de coloração cinza",
  code: "6128-AD-01",
  os: "OS-2025-0731",
  granulometricDescription: "Argila siltosa, fração fina predominante",
  ringDiameter: 50.6,
  ringHeight: 20.0,
  wetMassInitial: 66.6,
  wetMassFinal: 60.4,
  dryMass: 44.28,
  Gs: 2.67,
  rhoW: 1.0,
};

// Generate physically realistic readings for an oedometric stage.
function genStage(sigma: number, prevDial: number, totalSettle: number, t90_min: number): Stage {
  const times = [0.1, 0.25, 0.5, 1, 2, 4, 8, 15, 30, 60, 120, 240, 480, 1440];
  // Terzaghi 1D solution; T = cv*t/H²; we set T(t90)=0.848 → cv*t90/H²=0.848
  const Tof = (t: number) => (0.848 * t) / t90_min;
  const U = (T: number) => {
    if (T < 0.2) return Math.sqrt((4 * T) / Math.PI);
    return 1 - (8 / Math.PI ** 2) * Math.exp(-(Math.PI ** 2 / 4) * T);
  };
  const readings = times.map((t) => {
    const u = Math.min(0.999, U(Tof(t)));
    const sec = t > 60 ? Math.log10(t / 60) * Math.abs(totalSettle) * 0.018 * Math.sign(totalSettle || 1) : 0;
    return { t, d: +(prevDial + totalSettle * u + sec).toFixed(4) };
  });
  return { sigma, readings, finalDial: readings[readings.length - 1].d };
}

export function seedStages(_e0: number, _H0: number): Stage[] {
  // Target final dial readings (mm) calibrated to reference run
  const target: { sigma: number; dial: number; t90: number }[] = [
    { sigma: 10, dial: 0.28, t90: 4 },
    { sigma: 20, dial: 0.42, t90: 5 },
    { sigma: 40, dial: 0.68, t90: 6 },
    { sigma: 80, dial: 1.01, t90: 8 },
    { sigma: 160, dial: 1.50, t90: 11 },
    { sigma: 320, dial: 2.31, t90: 16 },
    { sigma: 640, dial: 3.32, t90: 20 },
    { sigma: 1280, dial: 4.47, t90: 22 },
    { sigma: 320, dial: 4.30, t90: 8 },
    { sigma: 80, dial: 4.10, t90: 5 },
    { sigma: 20, dial: 3.85, t90: 4 },
  ];
  let prev = 0;
  const stages: Stage[] = [];
  for (const t of target) {
    const settle = t.dial - prev;
    stages.push(genStage(t.sigma, prev, settle, t.t90));
    prev = t.dial;
  }
  return stages;
}
