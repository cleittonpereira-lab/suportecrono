import type {
  casagrandeSigmaP,
  cvCasagrande,
  cvTaylor,
  pachecoSilvaSigmaP,
} from "@/lib/oedometer";
import type { Photo } from "@/features/lab/types";

export type CasResult = NonNullable<ReturnType<typeof casagrandeSigmaP>>;
export type PsResult = NonNullable<ReturnType<typeof pachecoSilvaSigmaP>>;
export type TaylorResult = NonNullable<ReturnType<typeof cvTaylor>>;
export type CgrTimeResult = NonNullable<ReturnType<typeof cvCasagrande>>;

export interface OedSampleProps {
  project?: string;
  client: string;
  workNumber: string;
  reportNumber: string;
  borehole: string;
  depth: string | number;
  local: string;
  date?: string;
  revision: string;
  operator: string;
  typedBy?: string;
  verifiedBy?: string;
  approvedBy?: string;
  technicalResp: string;
  description: string;
  code: string;
  os: string;
  granulometricDescription: string;
  coordN?: number | string;
  coordE?: number | string;
  coordCota?: number | string;
  // Geometria e massas do anel / corpo de prova
  ringDiameter: number; // mm (D0)
  ringHeight: number;   // mm (H0)
  ringMass?: number;    // g (massa do anel)
  wetMassInitial: number; // g
  wetMassFinal: number;   // g
  dryMass: number;        // g
  Gs: number;             // Massa específica dos grãos (g/cm³)
  rhoW: number;           // Massa específica da água (g/cm³ = 1.0)
  sigmaV0?: number;       // Tensão geostática vertical efetiva in situ (kPa) para OCR
}

export interface OedStageReading {
  t: number; // tempo decorrido em minutos
  d: number; // recalque / leitura acumulada em mm
}

export interface OedStage {
  sigma: number; // Tensão vertical aplicada (kPa)
  readings: OedStageReading[];
  finalDial: number; // Leitura final de estabilização (mm)
  isSeatingStage?: boolean; // Se true, é estágio de assentamento/contato (não entra no cálculo de Cc, Cs, sigmaP)
  label?: string;
}

export interface OedPhysicalIndices {
  A: number;     // Área da seção transversal inicial (cm²)
  V0: number;    // Volume inicial (cm³)
  Vs: number;    // Volume dos sólidos (cm³)
  wi: number;    // Teor de umidade inicial (%)
  wf: number;    // Teor de umidade final (%)
  rho_i: number; // Massa específica natural inicial (g/cm³)
  rho_d: number; // Massa específica seca (g/cm³)
  rho_f: number; // Massa específica natural final (g/cm³)
  e0: number;    // Índice de vazios inicial
  ef: number;    // Índice de vazios final
  Sr0: number;   // Grau de saturação inicial (%)
  Srf: number;   // Grau de saturação final (%)
}

export interface OedStageCalculated {
  index: number;
  phase: "load" | "unload" | "reload";
  isSeatingStage: boolean;
  sigma: number;       // kPa
  prevDial: number;    // mm
  finalDial: number;   // mm
  settlementMm: number;// mm (d_final - d_prev)
  totalSettlementMm: number; // mm acumulado
  Hfinal: number;      // mm
  Havg_mm: number;     // mm
  Hdrain_mm: number;   // mm (drenagem dupla = Havg / 2)
  e: number;           // Índice de vazios no final do estágio
  strainPct: number;   // Deformação vertical específica (%)
  // Taylor (raiz do tempo)
  cvTaylor: number | null; // cm²/s
  t90: number | null;      // min
  taylorResult: TaylorResult | null;
  // Casagrande (log do tempo)
  cvCas: number | null;    // cm²/s
  t50: number | null;      // min
  casResult: CgrTimeResult | null;
  // Parâmetros de deformabilidade e permeabilidade
  av: number | null;       // Coeficiente de compressibilidade (kPa⁻¹)
  mv: number | null;       // Coeficiente de variação volumétrica (kPa⁻¹)
  Ed: number | null;       // Módulo edométrico E_oed = 1/mv (MPa)
  kvTaylor: number | null; // Coeficiente de permeabilidade via Taylor (cm/s)
  kvCas: number | null;    // Coeficiente de permeabilidade via Casagrande (cm/s)
  ca: number | null;       // Coeficiente de adensamento secundário C_alpha
}

export interface OedCompressibilityParams {
  Cc: number;            // Índice de compressão (reta virgem)
  Cs: number;            // Índice de recompressão / expansão
  Cr: number;            // Índice de recarregamento
  sigmaP_Cas: number;    // Tensão de pré-adensamento Casagrande (kPa)
  sigmaP_PS: number;     // Tensão de pré-adensamento Pacheco Silva (kPa)
  sigmaP_Adopted: number;// Tensão de pré-adensamento adotada (kPa)
  OCR: number | null;    // Overconsolidation Ratio (sigmaP / sigmaV0)
  virginLine: { m: number; b: number };
  recompressionLine: { m: number; b: number };
}

export interface OedCalcMemoryStep {
  title: string;
  formula: string;
  inputs: Record<string, string | number>;
  result: string;
  explanation: string;
}

export type PreconsolidationAdjust = {
  cas?: {
    tangentM?: number;
    tangentB?: number;
    bisectorM?: number;
    bisectorB?: number;
    virginM?: number;
    virginB?: number;
    horizontal?: number;
  };
  ps?: {
    virginM?: number;
    virginB?: number;
    e0Line?: number;
  };
};

export type CvLineAdjust = {
  taylorSlope?: number;
  taylorIntercept?: number;
  taylorSlope90?: number;
  t90?: number;
  cgrPrimaryM?: number;
  cgrPrimaryB?: number;
  cgrSecondaryM?: number;
  cgrSecondaryB?: number;
  cgrD0?: number;
  t50?: number;
};

export type ValidationState = Record<string, boolean>;

export const validationKey = (
  stageIndex: number,
  item: "taylor" | "casagrande" | "resumo",
) => `${stageIndex}:${item}`;

/** Configuração de domínios dos eixos compartilhados entre análise e relatório. */
export type AxisCfg = {
  eMin: number; eMax: number;
  sigmaMin: number; sigmaMax: number;     // log, kPa
  sigmaArithMax: number;                   // arith, kPa
  cvMin: number; cvMax: number;            // log, cm²/s
  caMax: number;                           // arith
  eedoMax: number;                         // MPa
  kvMin: number; kvMax: number;            // log, cm/s
  eNormMin: number; eNormMax: number;      // e/e₀
};

export interface ReportVersion {
  id: string;
  scopeId: string;
  rev: number;
  filename: string;
  createdAt: string;
  pdfBlob: Blob;
  sizeBytes: number;
}

export interface ApprovalRow {
  id: string;
  scope_id: string;
  rev: number;
  filename: string;
  status: "digitacao" | "pendente_verificacao" | "pendente_aprovacao" | "aprovado" | "rejeitado";
  skip_verification?: boolean;
  digitado_por?: string | null;
  digitado_em?: string | null;
  verificado_por?: string | null;
  verificado_em?: string | null;
  aprovado_por?: string | null;
  aprovado_em?: string | null;
  motivo_rejeicao?: string | null;
  created_at: string;
}
