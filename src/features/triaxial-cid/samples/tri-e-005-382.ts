import type { TriaxialSpecimen } from "../types";
import { CP_COLORS } from "../constants";
import { CONSOLIDATION_382, SHEAR_382 } from "./tri-e-005-382.data";

/**
 * CP de exemplo — dados reais exportados do sistema OWNTEC
 * (planilha TRI-E-005-382.xlsx). Etapas de adensamento incremental
 * e ruptura drenada, σ3' alvo = 800 kPa.
 *
 * Convenções da planilha:
 *  - TC corrigida  → σ3 confinante corrigida (kPa)          → sigma3Corr
 *  - Poropressao   → Δu na base do CP (kPa)                 → uPore
 *  - CV [kg]       → carga axial na célula (kgf)            → loadKgf
 *  - Var. volume   → ΔV acumulado durante a ruptura (cm³)   → dVcm3
 *  - Def. Axial %  → deformação axial ε_a (%)               → eaPct
 *  - Var. vol. acum. do adensamento (cm³)                   → consolidation.dv
 *
 * Como a planilha já entrega σ3 corrigido efetivo (com back-pressure abatida)
 * e Δu ≈ 0 na condição drenada, mantém-se `backPressure = 0` para que o motor
 * do app calcule σ'₃ = sigma3Corr − uPore diretamente comparável à planilha.
 */
export function buildSampleTriE005_382(idx = 0): TriaxialSpecimen {
  return {
    id: "CP1",
    displayId: "CP1",
    color: CP_COLORS[idx % CP_COLORS.length],
    D0: 50,
    H0: 100,
    wetMass: 353.4,
    dryMass: 282.72,
    w0Pct: 25,
    mSobreCP: 600, // 0,6 kgf → 600 g
    aPistao: 2.0106, // π·(1,6/2)²
    hTopcap: 4,
    fAtritoPistao: 0.3,
    espMembrana: 0.05,
    sigma3Target: 800,
    backPressure: 0,
    saturationMethod: "percolacao",
    lateralDrains: "Spiral (Gens, 1982)",
    consolidationDrainage: "Topo e Base",
    strainRate: 0.04,
    saturation: [],
    consolidation: CONSOLIDATION_382,
    shear: SHEAR_382,
    failureCriterion: "max_q",
  };
}

export const SAMPLE_TRI_E_005_382_META = {
  code: "TRI-E-005-382",
  equipment: "TRIAX-05 · OWNTEC",
  specDimensions: "50x100 mm",
  filterPaperResistance: 0,
  membraneE: 1400,
  membraneT: 0.5, // mm (0,05 cm)
};