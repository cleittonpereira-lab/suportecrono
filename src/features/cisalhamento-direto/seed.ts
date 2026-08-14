import type { CDSample, CDSpecimen, CDSpecimenResults, CDEnvelopeResult, CDReading } from "./types";
import { CP_COLORS } from "./constants";

export const SEED_CD_SAMPLE: CDSample = {
  client: "Cliente Exemplo LTDA.",
  workNumber: "OBR-2026-001",
  reportNumber: "AM-01",
  borehole: "SP-01",
  depth: "1.00 – 1.50",
  local: "São Pedro / SP",
  date: new Date().toISOString().split("T")[0],
  revision: "0",
  operator: "Técnico Exemplo",
  technicalResp: "Engº Maurício Silva · CREA-SP 000000",
  typedBy: "Técnico Digitador",
  description: "Argila siltosa, cinza-escura, plástica, saturada.",
  granulometricDescription: "Argila (65%) · Silte (28%) · Areia fina (7%).",
  code: "CD-2026-01",
  os: "OS-2026-001",
  geometry: "circular",
  dimensionMm: 60,
  equipment: "Cisalhamento Direto",
  Gs: 2.70,
  rhoW: 1.0,
  applyMembrane: false,
  membraneE: 1400,
  membraneT: 0.3,
  testCondition: "inundado",
  sampleState: "indeformada",
};

export function makeEmptyCDSpecimen(id: string, index: number): CDSpecimen {
  const ringMass = 100 + index * 2;
  const cpMass = 110.5 + index * 5;
  return {
    id,
    displayId: `CP${index + 1}`,
    color: CP_COLORS[index % CP_COLORS.length],
    height0Mm: 20,
    ringId: `ANEL-0${index + 1}`,
    ringMass: ringMass,
    wetMassCPAnel: cpMass + ringMass,
    wetMass: cpMass,
    w0Pct: 25.5,
    capsules: [
      { tara: 15.2, wet: 45.8, dry: 39.5 },
      { tara: 15.4, wet: 46.2, dry: 40.1 },
    ],
    finalCapsules: [
      { tara: 15.1, wet: 44.9, dry: 38.8 },
    ],
    normalStressTarget: (index + 1) * 50,
    failureCriterion: "max_tau",
    consolidationSettlementMm: 0,
    consolidationData: [],
    shearData: generateSynth((index + 1) * 50),

  };
}

function generateSynth(sigma: number): CDReading[] {
  const phi = 30 * Math.PI / 180;
  const c = 10;
  const peakTau = sigma * Math.tan(phi) + c;
  
  // A = 28.27 cm2 para 60mm circular
  const area = 28.27;
  
  return Array.from({ length: 30 }, (_, i) => {
    const disp = i * 0.2;
    // Curva hiperbólica simples
    const tau = peakTau * (disp / (disp + 1));
    const forceN = (tau * area) / 10;
    return {
      horizDispMm: disp,
      shearForce: forceN,
      vertDispMm: 0.05 * Math.sin(disp),
      loadKgf: forceN / 9.80665
    };
  });
}

export const SEED_CD_SPECIMENS: CDSpecimen[] = [
  makeEmptyCDSpecimen("CP1", 0),
  makeEmptyCDSpecimen("CP2", 1),
  makeEmptyCDSpecimen("CP3", 2),
];
