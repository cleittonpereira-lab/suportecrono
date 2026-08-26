/**
 * Tipos do módulo Triaxial CID (Consolidado Isotropicamente Drenado).
 * Referências: ASTM D7181-20, ISO 17892-9:2018.
 *
 * Unidades:
 *  - Tensões: kPa
 *  - Distâncias: mm
 *  - Áreas: cm²   Volumes: cm³
 *  - Massas: g
 *  - Tempo: min
 */

export interface TriaxialSample {
  // Identificação (mesmo shape do ReportSample)
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
  /** Digitado por — laboratorista/técnico que digitou o relatório. */
  typedBy?: string;
  description: string;
  code: string;
  os: string;
  granulometricDescription: string;
  /**
   * Condição do ensaio:
   * - "saturado": inclui fase de saturação por contra-pressão (B).
   * - "natural":  ensaio na umidade natural — fase de saturação suprimida.
   * Só se aplica a `testType === "cid"` — no UU não há fase de saturação
   * controlada (o CP é cisalhado na condição/umidade em que chegou).
   */
  condition: "saturado" | "natural";
  /**
   * Tipo de ensaio triaxial:
   * - "cid": Consolidado Isotropicamente Drenado (ASTM D7181 / ISO 17892-9) — padrão.
   * - "uu":  Não Consolidado Não Drenado (ASTM D2850 / NBR 12770) — sem fases de
   *   saturação/adensamento, cisalhamento em tensões totais (σ em vez de σ').
   * Campo independente de `condition`, seguindo o mesmo padrão (usuário
   * define na tela; não é derivado de `ensaio.tipo`). Ausente/undefined em
   * amostras já existentes é tratado como "cid" (compatibilidade).
   */
  testType?: "cid" | "uu";
  /** Tipo/procedência da amostra (ex.: "Bloco Indeformado 30x30cm"). */
  sampleType?: string;
  /**
   * Condição/estado da amostra ensaiada:
   * - "indeformada": bloco/amostra em estado natural.
   * - "compactada": moldada em laboratório em determinada energia.
   */
  sampleState?: "indeformada" | "compactada";
  /** Grau de compactação alvo [%] — usado quando `sampleState === "compactada"`. */
  compactionDegreePct?: number;
  /**
   * Energia de compactação — usada quando `sampleState === "compactada"`:
   * PN (Proctor Normal), PI (Intermediário), PM (Modificado).
   */
  compactionEnergy?: "PN" | "PI" | "PM";
  /** Equipamento utilizado (ex.: "TRIAX-02 - 5,0 MPa - OWNTEC"). */
  equipment?: string;
  /** Dimensões características (ex.: "35x70 mm"). */
  specDimensions?: string;
  /** Resistência do papel filtro [kN/m]. */
  filterPaperResistance?: number;
  /** Gerente do laboratório (para bloco Equipe). */
  labManager?: string;
  /** Descrição da condição de saturação (ex.: "Saturação por Percolação e Contrapressão"). */
  saturationConditionText?: string;
  // Coordenadas topográficas (exibidas no cabeçalho do relatório)
  coordN?: string | number;
  coordE?: string | number;
  coordCota?: string | number;
  coordDatum?: string;
  // Propriedades do solo (comuns a todos os CPs)
  Gs: number;      // densidade relativa dos grãos
  rhoW: number;    // g/cm³
  wL?: number;     // LL [%]
  wP?: number;     // LP [%]
  // Correções
  applyMembrane: boolean;
  membraneE: number;  // Em [kPa]
  membraneT: number;  // tm [mm]
  /**
   * Aplica a correção ISO 17892-9 §7.2.5 (Fórmula 9) de peso do pistão (K)
   * e área da haste (a) sobre a tensão desviatória. Por padrão desligada:
   * a maioria das células de carga já entrega a força axial líquida
   * transmitida ao CP, e habilitar a correção nesses casos zera as
   * leituras iniciais (σc·a/A > (P+K)/A no início do cisalhamento).
   */
  applyPistonCorrection?: boolean;
}

/** Cápsula de umidade (3 por CP conforme ficha de moldagem). */
export interface MoistureCapsule {
  tipo?: string;   // "M" (metal), "V" (vidro), etc.
  numero?: string; // nº da cápsula
  tara: number;    // g
  wet: number;     // amostra úmida + tara [g]
  dry: number;     // amostra seca  + tara [g]
}

/** Estágios de saturação (aplicação incremental de contra-pressão). */
export interface SaturationStage {
  sigma3: number;   // σ3 aplicado [kPa]
  u: number;        // uw medida [kPa]
  bValue?: number;  // opcional: informado manualmente
}

/** Leitura da fase de adensamento isotrópico (ε_vol vs tempo). */
export interface ConsolidationReading {
  t: number;    // min
  dv: number;   // ΔV acumulado [cm³]  (positivo = compressão)
}

/** Leitura da fase de cisalhamento drenado. */
export interface ShearReading {
  eaPct: number;   // ε axial [%]
  F: number;       // força axial [N]  (opcional se σd já é dado)
  dvPct: number;   // ε volumétrica [%] (positivo = compressão)
  /** Deslocamento axial medido Δh [mm] — se informado, εa = Δh/H0·100. */
  dispMm?: number;
  /** Variação de volume medida ΔV [cm³] — se informado, εv = ΔV/V0·100. */
  dVcm3?: number;
  /** Tensão confinante corrigida σ3 [kPa] — se informado, sobrepõe σ3 aplicado. */
  sigma3Corr?: number;
  /** Poropressão medida u [kPa] — se informado, sobrepõe uBack no cálculo de σ'. */
  uPore?: number;
  /** Carga axial lida na célula de carga [kgf]. F[N] = kgf · 9,80665. */
  loadKgf?: number;
}

export interface TriaxialSpecimen {
  id: string;         // "CP1"..."CP5"
  /** Rótulo exibido no relatório e nas abas. Difere de `id` quando σ3' é duplicada (repetição → "Rn"). */
  displayId?: string;
  color?: string;
  // Geometria inicial
  D0: number;  // mm
  H0: number;  // mm
  /** Medições individuais de diâmetro (mm). Média preenche D0. */
  D0measurements?: number[];
  /** Medições individuais de altura (mm). Média preenche H0. */
  H0measurements?: number[];
  // Massas / umidade
  wetMass: number;   // g
  dryMass: number;   // g
  w0Pct: number;     // % (opcional se calc. a partir de massas)
  /** Massa final do CP após o ensaio [g]. */
  mFinal?: number;
  /** Umidade final do CP após o ensaio [%]. */
  wFinalPct?: number;
  // --- Ficha de moldagem (ASTM D7181 / procedimento interno) ---
  capsules?: MoistureCapsule[];  // 3 cápsulas → w0 médio
  /** Cápsulas de umidade da etapa final (3 por CP) → w_f médio. */
  finalCapsules?: MoistureCapsule[];
  mSobreCP?: number;             // massa sobre o CP [g] (assembly na balança)
  aPistao?: number;              // área do pistão [cm²]
  hTopcap?: number;              // altura do topcap [cm]
  fAtritoPistao?: number;        // força de atrito do pistão [kgf]
  espMembrana?: number;          // espessura da membrana [cm]
  // Programa
  sigma3Target: number; // kPa (σ3 efetivo alvo de adensamento)
  backPressure: number; // uw contra-pressão final [kPa]
  /**
   * Método de saturação do CP:
   * - "contra-pressao": aplicação incremental de σ3/uw (estágios).
   * - "percolacao": percolação ascendente de água — sem registro de dados.
   */
  saturationMethod?: "contra-pressao" | "percolacao";
  /** Drenos laterais (ex.: "Spiral (Gens, 1982)"). */
  lateralDrains?: string;
  /** Drenagem no adensamento (ex.: "Topo e Base"). */
  consolidationDrainage?: string;
  /** Velocidade de deformação no cisalhamento [mm/min]. */
  strainRate?: number;
  // Fases
  saturation: SaturationStage[];
  consolidation: ConsolidationReading[];
  shear: ShearReading[];
  // Escolha do critério de ruptura
  failureCriterion: "max_q" | "max_ratio";
  /** Metadados do arquivo de dados brutos importado (XLSX OWNTEC). */
  rawImport?: {
    filename: string;
    nt: string;
    importedAt: string;
    consolidationCount: number;
    shearCount: number;
  };
}

export interface FailurePoint {
  eaPct: number;
  q: number;         // (σ1-σ3) [kPa]
  pPrime: number;    // p' [kPa]
  sigma1Prime: number;
  sigma3Prime: number;
  ratio: number;     // σ1'/σ3'
}

export interface SpecimenResults {
  // Índices físicos iniciais
  V0: number;   // cm³
  A0: number;   // cm²
  e0: number;
  Sr0: number;  // %
  gammaNat: number; // kN/m³
  gammaDry: number; // kN/m³
  // Ficha derivada
  w0Pct: number;    // umidade média usada [%]
  wetMass: number;  // g
  dryMass: number;  // g
  // Saturação
  BFinal: number | null;
  // Adensamento
  Vc: number;   // cm³
  Ac: number;   // cm²
  Hc: number;   // mm
  dVcons: number; // cm³ (ΔV total do adensamento)
  eAfterCons: number;
  // Curvas processadas de cisalhamento
  shearCurve: {
    eaPct: number;
    q: number;
    /** Tensão desvio σd = σ₁ − σ₃ [kPa]. */
    sigmaD: number;
    pPrime: number;
    sigma1: number;
    sigma1Prime: number;
    sigma3Prime: number;
    evPct: number;
    A: number;    // cm²
  }[];
  failure: FailurePoint | null;
}

/** Envoltória de Mohr-Coulomb ajustada pelo conjunto de CPs. */
export interface EnvelopeResult {
  phiDeg: number;    // ângulo de atrito efetivo
  cPrime: number;    // intercepto coesivo [kPa]
  M: number;         // inclinação em (p', q)
  a: number;         // intercepto em (p', q)
  r2: number;        // qualidade do ajuste
  points: { pPrime: number; q: number; cp: string }[];
}