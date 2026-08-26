/**
 * Densidade Relativa Aparente e Massa Específica Aparente de misturas
 * asfálticas compactadas — DNIT 428/2022-ME.
 */
import type { AsfDapTipoMistura, AsfDapPhoto } from "./ui";

export interface AsfDapCp {
  id: string;
  label?: string;
  // caso "densa" (§6.1/6.2):
  A: number | null;
  B: number | null;
  C: number | null;
  E: number | null;
  F: number | null;
  // caso "aberta" (§6.3):
  alturas: [number | null, number | null, number | null, number | null];
  diametros: [number | null, number | null, number | null, number | null];
  // opcional, qualquer caso:
  gmm: number | null;
}

export interface AsfDapSample {
  // Identificação — mesmo shape dos demais ensaios (ReportSample).
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
  tipoMistura: AsfDapTipoMistura;
  dpa: number | null;
  dpaCalibracao: { m1: number | null; m2: number | null; m3: number | null; m4: number | null };
  corposDeProva: AsfDapCp[];
  fotos?: AsfDapPhoto[];
}

export function newAsfDapCp(label?: string): AsfDapCp {
  return {
    id: `cp_${Math.random().toString(36).slice(2, 9)}`,
    label,
    A: null, B: null, C: null, E: null, F: null,
    alturas: [null, null, null, null],
    diametros: [null, null, null, null],
    gmm: null,
  };
}

export function seedAsfDapSample(partial?: Partial<AsfDapSample>): AsfDapSample {
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
    tipoMistura: "densa",
    dpa: null,
    dpaCalibracao: { m1: null, m2: null, m3: null, m4: null },
    corposDeProva: [newAsfDapCp("CP1"), newAsfDapCp("CP2"), newAsfDapCp("CP3")],
    ...partial,
  };
}
