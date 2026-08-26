/**
 * Modelo de dados do laboratório (Suporte Infra).
 * Hierarquia: OS → Amostra → Ensaio.
 *
 * Payload específico de cada ensaio permanece opaco aqui (JSON) — cada
 * módulo (adensamento, triaxial-cid, ...) define seu próprio shape em
 * `src/features/<ensaio>/types.ts`.
 */

export type EnsaioTipo =
  | "adensamento"
  | "triaxial-cid"       // legado — mantido para dados existentes
  | "triaxial-cid-sat"   // CID saturado
  | "triaxial-cid-nat"   // CID natural (na umidade natural)
  | "triaxial-ciu"
  | "triaxial-uu"
  | "cisalhamento-direto"
  | "mesp-a"             // Massa Específica Aparente Natural (NBR 16867:2020)
  | "modulo-resiliencia" // Módulo de Resiliência de solos (DNIT 134/2018-ME)
  | "umidade-natural";   // Teor de Umidade Natural (NBR 6457)

export type EnsaioStatus =
  | "rascunho"
  | "processando"
  | "concluido"
  | "em_digitacao"
  | "aguardando_verificacao"
  | "aguardando_aprovacao"
  | "aprovado";

export interface Coords {
  N?: number;   // Norte [m]
  E?: number;   // Este  [m]
  cota?: number; // Cota [m]
  datum?: string; // ex.: "SIRGAS 2000 / UTM 23S"
}

export interface Photo {
  id: string;
  /** data URL (image/*;base64) — armazenamento leve no localStorage. */
  dataUrl: string;
  caption?: string;
  /** Data ISO. */
  createdAt: string;
  /** Categoria do registro fotográfico. */
  kind: "moldagem" | "ruptura" | "outro";
  /** Bytes aproximados (após compressão). */
  bytes?: number;
  /**
   * Vínculo opcional a um corpo-de-prova específico do ensaio.
   * Usado no Triaxial, onde cada CP tem seu próprio registro de
   * moldagem/ruptura. Em Adensamento (CP único) fica indefinido.
   */
  specimenId?: string;
}

export interface Amostra {
  id: string;
  createdAt: string;
  updatedAt: string;
  // Identificação
  reportNumber?: string; // "AM-01"
  borehole?: string;
  depth?: string;
  description?: string;
  granulometricDescription?: string;
  code?: string;
  sampleType?: string; // Bloco indeformado, etc.
  materialType?: string;
  // Localização
  coords?: Coords;
  // Registro fotográfico
  photos: Photo[];
  // Ensaios
  ensaios: Ensaio[];
}

export interface Ensaio {
  id: string;
  tipo: EnsaioTipo;
  status: EnsaioStatus;
  createdAt: string;
  updatedAt: string;
  /** Nome curto opcional (ex.: "CP1..CP3 · σ3 = 100/200/400"). */
  label?: string;
  /** Nome / sigla de referência (ex.: "CD4.IN", "TRI3.CU"). */
  nome?: string;
  sigla?: string;
  /** Operador/laboratorista responsável por ESTE ensaio (não da OS). */
  operator?: string;
  /** Registro fotográfico do ensaio (moldagem/ruptura). */
  photos?: Photo[];
  /** Payload específico do ensaio — livre (JSON). */
  payload?: unknown;
}

export interface OS {
  id: string;
  createdAt: string;
  updatedAt: string;
  // Identificação da OS
  numero: string;          // "OS-2026-01"
  client?: string;
  workNumber?: string;     // Nº da obra / contrato
  local?: string;
  operator?: string;
  technicalResp?: string;
  revision?: string;
  // Amostras
  amostras: Amostra[];
}

export interface LabState {
  os: OS[];
}

export const ENSAIO_LABEL: Record<EnsaioTipo, string> = {
  "adensamento": "Adensamento Oedométrico",
  "triaxial-cid": "Triaxial CID",
  "triaxial-cid-sat": "Triaxial CID Saturado",
  "triaxial-cid-nat": "Triaxial CID Natural",
  "triaxial-ciu": "Triaxial CIU",
  "triaxial-uu": "Triaxial UU",
  "cisalhamento-direto": "Cisalhamento Direto",
  "mesp-a": "Massa Específica Aparente Natural",
  "modulo-resiliencia": "Módulo de Resiliência (DNIT 134)",
  "umidade-natural": "Umidade Natural (NBR 6457)",
};

export const ENSAIO_DISPONIVEL: EnsaioTipo[] = [
  "adensamento",
  "triaxial-cid-sat",
  "triaxial-cid-nat",
  "cisalhamento-direto",
  "mesp-a",
  "modulo-resiliencia",
  "umidade-natural",
];

/**
 * Tag curta + cor associada ao tipo de ensaio.
 * Usada em listas para identificação visual rápida.
 * Classes tailwind estáticas (não interpoladas) para o compilador incluir.
 */
export interface EnsaioTagInfo {
  code: string;
  className: string;
}

export const ENSAIO_TAG: Record<EnsaioTipo, EnsaioTagInfo> = {
  "adensamento": {
    code: "ADENS",
    className:
      "bg-amber-500/15 text-amber-700 border-amber-500/40 dark:text-amber-300",
  },
  "triaxial-cid": {
    code: "TRI.CID",
    className:
      "bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-300",
  },
  "triaxial-cid-sat": {
    code: "TRI.CIDsat",
    className:
      "bg-sky-500/15 text-sky-700 border-sky-500/40 dark:text-sky-300",
  },
  "triaxial-cid-nat": {
    code: "TRI.CIDnat",
    className:
      "bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-300",
  },
  "triaxial-ciu": {
    code: "TRI.CIU",
    className:
      "bg-violet-500/15 text-violet-700 border-violet-500/40 dark:text-violet-300",
  },
  "triaxial-uu": {
    code: "TRI.UU",
    className:
      "bg-fuchsia-500/15 text-fuchsia-700 border-fuchsia-500/40 dark:text-fuchsia-300",
  },
  "cisalhamento-direto": {
    code: "CD",
    className:
      "bg-rose-500/15 text-rose-700 border-rose-500/40 dark:text-rose-300",
  },
  "mesp-a": {
    code: "M.ESP.A",
    className:
      "bg-orange-500/15 text-orange-700 border-orange-500/40 dark:text-orange-300",
  },
  "modulo-resiliencia": {
    code: "MR",
    className:
      "bg-teal-500/15 text-teal-700 border-teal-500/40 dark:text-teal-300",
  },
  "umidade-natural": {
    code: "UMID",
    className:
      "bg-lime-500/15 text-lime-700 border-lime-500/40 dark:text-lime-300",
  },
};