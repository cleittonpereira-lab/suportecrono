export interface MoistureCapsule {
  tipo?: string;
  numero?: string;
  tara: number;
  wet: number;
  dry: number;
}

export interface CDReading {
  horizDispMm: number;
  shearForce: number;
  loadKgf?: number;
  vertDispMm: number;
}

export interface CDSample {
  client: string;
  workNumber: string;
  reportNumber: string;
  os: string;
  borehole: string;
  code: string;
  depth: string;
  local: string;
  date: string;
  operator: string;
  technicalResp: string;
  typedBy: string;
  description: string;
  
  // Condições do ensaio
  geometry: "circular" | "quadrada";
  dimensionMm: number; // diâmetro ou lado nominal (mm)
  Gs: number; // densidade dos grãos
  rhoW: number; // densidade da água (g/cm³)
  testCondition: "natural" | "inundado";
  applyAreaCorrection?: boolean; // Correção de área da seção transversal durante cisalhamento (ASTM D3080)
  applyMembrane: boolean;
  membraneE: number; // módulo membrana (kPa)
  membraneT: number; // espessura membrana (mm)
  
  // Condição/estado da amostra
  sampleState: "indeformada" | "compactada" | "recompactada";
  sampleType?: string; // Bloco, Shelby, Denison, etc.
  compactionDegreePct?: number;
  compactionEnergy?: "PN" | "PI" | "PM";

  // Parâmetros de laboratório (catálogos)
  equipment?: string;
  
  // Metadados adicionais para ReportShell
  revision?: string | number;
  coordN?: string | number;
  coordE?: string | number;
  coordCota?: string | number;
  coordDatum?: string;
  granulometricDescription?: string;
  verifiedBy?: string;
  labManager?: string;
  rings?: { id: string; mass: number }[];
  observations?: string;
}

export interface CDSpecimen {
  id: string;
  displayId?: string;
  color?: string;
  
  // Moldagem / Estado inicial
  diameterMm?: number;
  widthMm?: number;
  lengthMm?: number;
  height0Mm: number;
  D0measurements?: number[];
  H0measurements?: number[];
  wetMass: number; // massa úmida nominal (g)
  wetMassCPAnel: number; // CP + Anel (g)
  ringMass: number; // Anel (g)
  ringId?: string;
  ringNumber?: string;
  mFinal?: number; // massa final (g)
  
  // Umidades
  capsules: MoistureCapsule[];
  w0Pct: number; // umidade inicial manual (fallback)
  finalCapsules: MoistureCapsule[];
  wFinalPct?: number; // umidade final manual (fallback)

  // Programa
  normalStressTarget: number; // σn (kPa)
  strainRate?: number; // velocidade (mm/min)
  consolidationDrainage?: string;
  failureCriterion: "max_tau" | "residual";
  
  // Dados brutos
  consolidationSettlementMm?: number;
  consolidationData: { timeMin: number; settlementMm: number }[];
  shearData: CDReading[];
  
  rawImport?: {
    filename: string;
    nt?: string;
    importedAt?: string;
    consolidationCount: number;
    shearCount: number;
  };
}

export interface CDSpecimenResults {
  // Índices físicos iniciais
  area0: number;    // cm²
  volume0: number;  // cm³
  H0: number;       // mm
  D0: number;       // mm (diâmetro ou lado)
  wetMass: number;  // g
  dryMass: number;  // g
  wetDensity: number; // g/cm³
  dryDensity: number; // g/cm³
  voidRatio0: number;
  moisture0Pct: number;
  saturation0Pct: number;
  gammaNat: number; // kN/m³
  gammaDry: number; // kN/m³
  
  // Pós-adensamento
  Vs: number;       // cm³ (volume de sólidos)
  Hc: number;       // mm
  Ac: number;       // cm²
  Vc: number;       // cm³
  dVcons: number;   // cm³
  heightAfterCons: number;
  voidRatioAfterCons: number;
  dryDensityAfterCons: number;
  saturationAfterConsPct: number;
  
  // Cisalhamento
  moistureFinalPct: number;
  saturationFinalPct: number;
  sigmaN: number;
  tauPeak: number;
  tauResidual: number;
  horizStrainAtFailurePct: number;
  vertDispAtFailureMm: number;
  curve: { 
    horizDispMm: number; 
    horizStrainPct: number; 
    shearStress: number; 
    vertDispMm: number;
    areaCorr: number;
  }[];
  consolidationCurve: { timeMin: number; settlementMm: number }[];
}

export interface CDEnvelopeResult {
  phiDeg: number;
  c: number;
  r2: number;
  points: { sigma: number; tau: number; cp: string }[];
}

export interface CDAxisCfg {
  ehMax?: number;          // Deformação Horizontal máxima [%]
  tauMax?: number;         // Tensão Cisalhante máxima nas curvas dos CPs [kPa]
  vertDispMin?: number;    // Deformação Vertical / Variação de Altura mínima [mm ou %] (expansão)
  vertDispMax?: number;    // Deformação Vertical / Variação de Altura máxima [mm ou %] (contração)
  sigmaNMax?: number;      // Tensão Normal Efetiva máxima na Envoltória [kPa]
  tauEnvelopeMax?: number; // Tensão Cisalhante máxima na Envoltória [kPa]
  sqrtTMax?: number;      // √t máximo no adensamento [min^0,5]
  adensDispMax?: number;  // Recalque máx no adensamento [mm]
}

export interface CDDraft {
  sample: CDSample;
  specimens: CDSpecimen[];
  selectedCpId: string;
  tab: string;
  adjust: {
    mSobreCP: number;
    espMembrana: number;
    aPistao: number;
    hTopcap: number;
    fAtritoPistao: number;
  };
  axisCfg?: CDAxisCfg;
}
