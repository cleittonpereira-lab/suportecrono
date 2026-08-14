import type {
  casagrandeSigmaP,
  cvCasagrande,
  cvTaylor,
  pachecoSilvaSigmaP,
} from "@/lib/oedometer";

export type CasResult = NonNullable<ReturnType<typeof casagrandeSigmaP>>;
export type PsResult = NonNullable<ReturnType<typeof pachecoSilvaSigmaP>>;
export type TaylorResult = NonNullable<ReturnType<typeof cvTaylor>>;
export type CgrTimeResult = NonNullable<ReturnType<typeof cvCasagrande>>;

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