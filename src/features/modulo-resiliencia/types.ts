/**
 * Módulo de Resiliência (MR) de solos — DNIT 134/2018-ME (base AASHTO T307).
 *
 * Unidades: tensões [kPa], MR [MPa], massas [g], dimensões [mm].
 *
 * Cada corpo de prova é ensaiado sob uma sequência prescrita de pares
 * (σ3, σd) — tensão confinante e tensão desvio cíclica — medindo a
 * deformação axial recuperável em cada estado, da qual se calcula
 * MR = σd / εr para cada par. O conjunto de pontos é então ajustado pelo
 * modelo composto (universal):
 *
 *   MR = k1 · Pa · (θ/Pa)^k2 · (τoct/Pa + 1)^k3
 *
 * onde θ = 3σ3 + σd (tensão-soma) e τoct = (√2/3)·σd (tensão cisalhante
 * octaédrica, caso triaxial: σ1 = σ3+σd, σ2 = σ3).
 *
 * A sequência padrão de 18 pares abaixo é a tabela usual AASHTO T307 —
 * ATENÇÃO: confirme com o equipamento/procedimento do laboratório antes
 * de assumir como definitiva; por isso cada par continua editável na tela.
 */

export interface SpecimenGeometry {
  diameterMm: number;
  heightMm: number;
}

export interface CompactionData {
  /** Energia de compactação. */
  energy: "PN" | "PI" | "PM";
  /** Umidade de moldagem [%]. */
  moistureContentPct: number | null;
  /** Umidade ótima (Proctor) [%] — referência de comparação. */
  optimumMoisturePct?: number | null;
  /** Massa específica aparente seca do CP moldado [g/cm³]. */
  dryDensity: number | null;
  /** Massa específica aparente seca máxima (Proctor) [g/cm³] — referência. */
  maxDryDensity?: number | null;
  /** Grau de compactação [%] — dryDensity/maxDryDensity × 100, se ambos informados. */
  degreeOfCompactionPct?: number | null;
}

/** Um dos pares (σ3, σd) da sequência de tensões prescrita. */
export interface StressState {
  id: string;
  /** Nº de ordem na sequência (1–18 no padrão AASHTO T307/DNIT 134). */
  ordem: number;
  sigma3: number; // kPa
  sigmaD: number; // kPa
  /** Deformação axial recuperável média do último ciclo estável [mm]. */
  recoverableStrainMm: number | null;
  /** Nº de ciclos aplicados nesse estado (referência/controle, opcional). */
  cycles?: number | null;
}

export interface ModelFit {
  k1: number;
  k2: number;
  k3: number;
  /** Coeficiente de determinação do ajuste (em ln MR vs. ln θ/Pa, ln τoct/Pa+1). */
  r2: number;
}

export interface ModuloResilienciaSample {
  // Identificação — mesmo shape dos demais ensaios.
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
  typedBy?: string;
  description: string;
  code: string;
  os: string;
  granulometricDescription: string;
  equipment?: string;
  /** Pressão atmosférica de referência Pa [kPa] — padrão 101,3 kPa. */
  atmPressureKpa: number;
  geometry: SpecimenGeometry;
  compaction: CompactionData;
  /** Sequência de estados de tensão ensaiados (padrão: 18 pares). */
  states: StressState[];
  modelFit: ModelFit | null;
}

/** Sequência padrão AASHTO T307 / DNIT 134 (18 pares) — confirme com o procedimento do laboratório. */
export const DEFAULT_STRESS_SEQUENCE: Array<{ ordem: number; sigma3: number; sigmaD: number }> = [
  { ordem: 1, sigma3: 20.7, sigmaD: 20.7 },
  { ordem: 2, sigma3: 20.7, sigmaD: 41.4 },
  { ordem: 3, sigma3: 20.7, sigmaD: 62.1 },
  { ordem: 4, sigma3: 34.5, sigmaD: 34.5 },
  { ordem: 5, sigma3: 34.5, sigmaD: 68.9 },
  { ordem: 6, sigma3: 34.5, sigmaD: 103.4 },
  { ordem: 7, sigma3: 68.9, sigmaD: 68.9 },
  { ordem: 8, sigma3: 68.9, sigmaD: 137.9 },
  { ordem: 9, sigma3: 68.9, sigmaD: 206.8 },
  { ordem: 10, sigma3: 103.4, sigmaD: 68.9 },
  { ordem: 11, sigma3: 103.4, sigmaD: 103.4 },
  { ordem: 12, sigma3: 103.4, sigmaD: 206.8 },
  { ordem: 13, sigma3: 137.9, sigmaD: 103.4 },
  { ordem: 14, sigma3: 137.9, sigmaD: 137.9 },
  { ordem: 15, sigma3: 137.9, sigmaD: 275.8 },
  { ordem: 16, sigma3: 20.7, sigmaD: 20.7 },
  { ordem: 17, sigma3: 34.5, sigmaD: 103.4 },
  { ordem: 18, sigma3: 68.9, sigmaD: 206.8 },
];

export function seedStressStates(): StressState[] {
  return DEFAULT_STRESS_SEQUENCE.map((s) => ({
    id: `st_${s.ordem}`,
    ordem: s.ordem,
    sigma3: s.sigma3,
    sigmaD: s.sigmaD,
    recoverableStrainMm: null,
    cycles: null,
  }));
}

export function seedModuloResilienciaSample(partial?: Partial<ModuloResilienciaSample>): ModuloResilienciaSample {
  return {
    client: "",
    workNumber: "",
    reportNumber: "",
    borehole: "",
    depth: "",
    local: "",
    date: "",
    revision: "0",
    operator: "",
    technicalResp: "",
    description: "",
    code: "",
    os: "",
    granulometricDescription: "",
    atmPressureKpa: 101.3,
    geometry: { diameterMm: 100, heightMm: 200 },
    compaction: {
      energy: "PN",
      moistureContentPct: null,
      optimumMoisturePct: null,
      dryDensity: null,
      maxDryDensity: null,
      degreeOfCompactionPct: null,
    },
    states: seedStressStates(),
    modelFit: null,
    ...partial,
  };
}
