/**
 * Umidade Natural (Teor de Umidade) — NBR 6457 (preparação de amostras) +
 * determinação por estufa (105–110 °C).
 *
 * Ensaio estruturalmente mais simples do sistema: só cápsulas de umidade,
 * mesmo shape usado em Adensamento/Triaxial/M.ESP.A.
 */

export interface MoistureCapsule {
  numero?: string;
  tara: number;    // massa da cápsula vazia [g]
  wet: number;     // cápsula + solo úmido [g]
  dry: number;     // cápsula + solo seco [g]
}

export interface UmidadeNaturalSample {
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
  capsules: MoistureCapsule[];
}

function newCapsule(): MoistureCapsule {
  return { numero: "", tara: 0, wet: 0, dry: 0 };
}

export function seedUmidadeNaturalSample(partial?: Partial<UmidadeNaturalSample>): UmidadeNaturalSample {
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
    capsules: [newCapsule(), newCapsule(), newCapsule()],
    ...partial,
  };
}

export { newCapsule };
