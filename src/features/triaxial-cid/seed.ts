import type { TriaxialSample, TriaxialSpecimen } from "./types";
import { CP_COLORS, MEMBRANE_E_DEFAULT_KPA, MEMBRANE_T_DEFAULT_MM } from "./constants";

export const SEED_SAMPLE: TriaxialSample = {
  client: "Cliente Exemplo LTDA.",
  workNumber: "OBR-2026-001",
  reportNumber: "AM-01",
  borehole: "SP-01",
  depth: "6,00 – 6,50",
  local: "São Pedro / SP",
  date: "",
  revision: "0",
  operator: "Téc. Laboratório",
  technicalResp: "Engº Maurício Silva · CREA-SP 000000",
  description: "Argila siltosa, cinza-escura, plástica, saturada.",
  code: "CID-2026-01",
  os: "OS-2026-01",
  granulometricDescription: "Argila (65%) · Silte (28%) · Areia fina (7%).",
  condition: "saturado",
  sampleType: "Bloco Indeformado 30x30cm",
  equipment: "TRIAX-02 - 5,0 MPa - OWNTEC",
  specDimensions: "38x76 mm",
  filterPaperResistance: 0,
  labManager: "Engº Cleitton Pereira",
  saturationConditionText: "Saturação por Percolação e Contra-pressão",
  Gs: 2.68,
  rhoW: 1.0,
  wL: 62,
  wP: 28,
  applyMembrane: false,
  membraneE: MEMBRANE_E_DEFAULT_KPA,
  membraneT: MEMBRANE_T_DEFAULT_MM,
};

/**
 * Gera uma curva sintética de cisalhamento drenado plausível para uma
 * argila normalmente adensada — só para popular o app na primeira carga.
 * A curva não substitui dados reais do laboratório.
 */
function synthShear(sigma3Prime: number, phiDeg: number, cPrime: number) {
  const phi = (phiDeg * Math.PI) / 180;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  // σ1' na ruptura via M-C
  const sigma1PrimeF =
    (sigma3Prime * (1 + sinPhi) + 2 * cPrime * cosPhi) / (1 - sinPhi);
  const qf = sigma1PrimeF - sigma3Prime;
  const eas = [0, 0.2, 0.5, 1, 2, 3, 4, 6, 8, 10, 12, 15, 18, 20];
  const eaFailPct = 8;
  return eas.map((eaPct) => {
    // Hiperbólica clássica: q = qf · ea / (ea + eaFail·0.5) capped
    const q = eaPct === 0 ? 0 : (qf * eaPct) / (eaPct + eaFailPct * 0.5);
    // Contração inicial + dilatação leve (arg. NA quase sempre contrai)
    const dvPct = 0.35 * Math.log1p(eaPct) - 0.008 * eaPct * eaPct;
    // σd = q em CID; F precisa produzir q dado a área corrigida.
    // Aqui F é calculado para a área inicial (aproximação — o motor recalcula com A corrigida).
    return { eaPct, q, dvPct, F: 0 };
  });
}

function makeSpecimen(
  id: string,
  idx: number,
  sigma3Target: number,
): TriaxialSpecimen {
  const D0 = 38; // mm
  const H0 = 76; // mm
  // Cápsulas sintéticas (w ≈ 50%)
  const capsules = [
    { tipo: "M", numero: `${idx + 1}A`, tara: 12.0, wet: 42.0, dry: 32.0 },
    { tipo: "M", numero: `${idx + 1}B`, tara: 11.5, wet: 44.0, dry: 33.2 },
    { tipo: "M", numero: `${idx + 1}C`, tara: 12.2, wet: 45.5, dry: 34.4 },
  ];
  const wetMass = 168;
  // dryMass derivada da média das cápsulas — mantida no seed só para compat.
  const wMean =
    capsules.reduce(
      (a, c) => a + ((c.wet - c.dry) / Math.max(1e-6, c.dry - c.tara)) * 100,
      0,
    ) / capsules.length;
  const w0Pct = wMean;
  const dryMass = wetMass / (1 + w0Pct / 100);
  const backPressure = 300;
  const phiDeg = 26;
  const cPrime = 8;
  const A0_cm2 = (Math.PI * (D0 / 10) ** 2) / 4;
  // Gera curva sintética; F será tal que σd·A ≈ q → F[N] = q[kPa]·A[cm²]/10
  const synth = synthShear(sigma3Target, phiDeg, cPrime);
  const shear = synth.map((s) => {
    const ea = s.eaPct / 100;
    const ev = s.dvPct / 100;
    const A = (A0_cm2 * (1 - ev)) / Math.max(1e-6, 1 - ea);
    const F = (s.q * A) / 10; // N
    return { eaPct: s.eaPct, F, dvPct: s.dvPct };
  });
  return {
    id,
    color: CP_COLORS[idx % CP_COLORS.length],
    D0,
    H0,
    wetMass,
    dryMass,
    w0Pct,
    capsules,
    mSobreCP: 600,
    aPistao: 2.0,
    hTopcap: 4.0,
    fAtritoPistao: 0.3,
    espMembrana: 0.05,
    sigma3Target,
    backPressure,
    saturationMethod: "contra-pressao",
    lateralDrains: "Spiral (Gens, 1982)",
    consolidationDrainage: "Topo e Base",
    strainRate: 0.1,
    saturation: [
      { sigma3: 20, u: 10, bValue: 0.5 },
      { sigma3: 120, u: 105, bValue: 0.85 },
      { sigma3: 220, u: 210, bValue: 0.96 },
    ],
    consolidation: [
      { t: 0, dv: 0 },
      { t: 1, dv: 0.4 },
      { t: 4, dv: 0.9 },
      { t: 15, dv: 1.5 },
      { t: 60, dv: 2.1 },
      { t: 240, dv: 2.6 },
      { t: 1440, dv: 3.0 },
    ].map((r) => ({ ...r, dv: r.dv * (1 + idx * 0.15) })),
    shear,
    failureCriterion: "max_q",
  };
}

export const SEED_SPECIMENS: TriaxialSpecimen[] = [
  makeSpecimen("CP1", 0, 100),
  makeSpecimen("CP2", 1, 200),
  makeSpecimen("CP3", 2, 400),
];

/**
 * CP em branco — usado como estado inicial de um ensaio novo.
 * Todos os campos numéricos zerados, sem tensões, sem leituras.
 */
export function makeEmptySpecimen(id = "CP1", idx = 0): TriaxialSpecimen {
  return {
    id,
    color: CP_COLORS[idx % CP_COLORS.length],
    D0: 0,
    H0: 0,
    wetMass: 0,
    dryMass: 0,
    w0Pct: 0,
    capsules: [
      { tipo: "", numero: "", tara: 0, wet: 0, dry: 0 },
      { tipo: "", numero: "", tara: 0, wet: 0, dry: 0 },
      { tipo: "", numero: "", tara: 0, wet: 0, dry: 0 },
    ],
    finalCapsules: [
      { tipo: "", numero: "", tara: 0, wet: 0, dry: 0 },
      { tipo: "", numero: "", tara: 0, wet: 0, dry: 0 },
      { tipo: "", numero: "", tara: 0, wet: 0, dry: 0 },
    ],
    mSobreCP: 0,
    aPistao: 0,
    hTopcap: 0,
    fAtritoPistao: 0,
    espMembrana: 0,
    sigma3Target: 0,
    backPressure: 0,
    saturationMethod: "contra-pressao",
    lateralDrains: "",
    consolidationDrainage: "",
    strainRate: 0,
    saturation: [],
    consolidation: [],
    shear: [],
    failureCriterion: "max_q",
  };
}

export const EMPTY_SPECIMENS: TriaxialSpecimen[] = [makeEmptySpecimen("CP1", 0)];