/**
 * Compressão Simples — três variações do mesmo ensaio, cada uma com sua
 * norma: solo (NBR 12770), rocha (NBR 15845-5, cf. ASTM D7012 Método C /
 * ISRM) e dosagem/solo-cimento (NBR 12025). Solo e dosagem compartilham o
 * mesmo formulário (índices físicos + resultado simplificado ou completo);
 * rocha não tem cápsulas de umidade nem índices físicos, só dimensões,
 * massa e carga de ruptura.
 *
 * Suporta mais de um corpo de prova (CP01, CP02...) — comum em dosagem,
 * onde normalmente se rompe mais de um CP na mesma idade de cura. Cada CP
 * tem suas próprias dimensões/massa/umidade/resultado; Gs (massa
 * específica dos grãos) fica no nível da amostra, já que é propriedade do
 * material e não muda de um CP pro outro da mesma amostra.
 */
export type CsAmostraTipo = "solo" | "rocha" | "dosagem";
export type CsResultadoModo = "simplificado" | "completo";
export type CsCargaUnidade = "N" | "kgf" | "kN";

/** Cápsula de umidade — mesmo shape usado em Umidade Natural/Triaxial/PERM.V. */
export interface CsCapsula {
  numero?: string;
  tara: number; // massa da cápsula vazia [g]
  wet: number;  // cápsula + solo úmido [g]
  dry: number;  // cápsula + solo seco [g]
}

/** Ponto da curva carga x deformação (resultado completo), já normalizado em Newtons. */
export interface CsCurvaPonto {
  id: string;
  /** Deformação axial acumulada (mm). */
  deformacaoMm: number;
  cargaN: number;
}

export interface CsCorpoDeProva {
  id: string;
  label: string; // "CP01", "CP02"...
  // Dimensões — 4 leituras de altura e diâmetro (cm), massa inicial (g)
  alturas: number[];
  diametros: number[];
  massaInicial: number | null;
  // Índices físicos — só solo/dosagem
  capsulas: CsCapsula[];
  // Resultado
  picoCarga: number | null;
  picoCargaUnidade: CsCargaUnidade;
  /** Só resultado completo (solo/dosagem). */
  curva: CsCurvaPonto[];
}

export interface CompressaoSimplesSample {
  // Identificação — mesmo shape dos demais ensaios (ReportSample)
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

  amostraTipo: CsAmostraTipo;
  /** Só se aplica a solo/dosagem — rocha sempre segue o fluxo simplificado (sem cápsulas/curva). */
  resultadoModo: CsResultadoModo;
  /** Idade de cura em dias — só dosagem (etiqueta ex. "COMP.S.7" = 7 dias). */
  idadeCuraDias: number | null;

  // Condição da amostra (solo — mesmo padrão de Triaxial CID/PERM.V)
  sampleType?: string; // Bloco indeformado, Tubo Shelby, etc. (quando indeformada)
  sampleState?: "indeformada" | "compactada" | "recompactada" | "deformada";
  compactionEnergy?: "PN" | "PI" | "PM";
  compactionDegreePct?: number;

  /** Gs — massa específica dos grãos (g/cm³), propriedade do material (não varia por CP). "De fábrica" 2,65 (Cleitton, 2026-09-04), editável por ensaio. */
  massaEspecificaGraos: number | null;

  corposDeProva: CsCorpoDeProva[];
}

export function newCsCapsula(): CsCapsula {
  return { numero: "", tara: 0, wet: 0, dry: 0 };
}

export function newCsCorpoDeProva(label: string): CsCorpoDeProva {
  return {
    id: `cp_${Math.random().toString(36).slice(2, 9)}`,
    label,
    alturas: [0, 0, 0, 0],
    diametros: [0, 0, 0, 0],
    massaInicial: null,
    capsulas: [newCsCapsula(), newCsCapsula(), newCsCapsula()],
    picoCarga: null,
    picoCargaUnidade: "kN",
    curva: [],
  };
}

export function seedCompressaoSimplesSample(
  partial?: Partial<CompressaoSimplesSample>,
): CompressaoSimplesSample {
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
    amostraTipo: "solo",
    resultadoModo: "simplificado",
    idadeCuraDias: null,
    massaEspecificaGraos: 2.65,
    corposDeProva: [newCsCorpoDeProva("CP01")],
    ...partial,
  };
}
