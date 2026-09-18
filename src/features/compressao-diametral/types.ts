/**
 * Compressão Diametral (tração por compressão diametral, "ensaio
 * brasileiro") — duas aplicações do mesmo ensaio físico: misturas
 * betuminosas (DNER-ME 138/94, sigla de campo ASF.CD) e solo-cimento
 * (DNIT 136/2010-ME, sigla COMP.D[.dias]). A carga é aplicada ao longo do
 * diâmetro do CP cilíndrico, rompendo-o por tração — mesmo padrão de CP de
 * `compressao-simples`, mas a tensão é 2P/(πDH), não P/A.
 *
 * Diferente de Compressão Simples: não há modo "completo" com curva
 * tensão×deformação — o ensaio, pelas duas normas, registra só a carga de
 * ruptura. Solo-cimento (dosagem) tem cápsulas de umidade e índices físicos
 * (Gs em nível de amostra); asfalto não (mistura betuminosa compactada, não
 * um conceito de umidade de solo).
 *
 * Suporta mais de um corpo de prova (CP01, CP02...), comum em dosagem.
 */
export type CdAmostraTipo = "asfalto" | "dosagem";
export type CdCargaUnidade = "N" | "kgf" | "kN";

/** Cápsula de umidade — mesmo shape usado em Compressão Simples/Triaxial/PERM.V. */
export interface CdCapsula {
  numero?: string;
  tara: number; // massa da cápsula vazia [g]
  wet: number;  // cápsula + material úmido [g]
  dry: number;  // cápsula + material seco [g]
}

export interface CdCorpoDeProva {
  id: string;
  label: string; // "CP01", "CP02"...
  // Dimensões — 4 leituras de altura (espessura, na direção do carregamento) e diâmetro (cm), massa inicial (g)
  alturas: number[];
  diametros: number[];
  massaInicial: number | null;
  // Índices físicos — só dosagem (solo-cimento)
  capsulas: CdCapsula[];
  // Resultado
  picoCarga: number | null;
  picoCargaUnidade: CdCargaUnidade;
}

export interface CompressaoDiametralSample {
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
  /** Nome de quem verificou/aprovou a última versão — gravado ao confirmar cada etapa. */
  verifiedBy?: string;
  approvedBy?: string;
  description: string;
  code: string;
  os: string;
  granulometricDescription: string;
  equipment?: string;

  amostraTipo: CdAmostraTipo;
  /** Idade de cura em dias — só dosagem (etiqueta ex. "COMP.D.7" = 7 dias). */
  idadeCuraDias: number | null;

  // Condição da amostra (solo-cimento — mesmo padrão de Compressão Simples/Triaxial CID/PERM.V)
  sampleType?: string;
  sampleState?: "indeformada" | "compactada" | "recompactada" | "deformada";
  compactionEnergy?: "PN" | "PI" | "PM";
  compactionDegreePct?: number;

  /** Gs — massa específica dos grãos (g/cm³), só dosagem. "De fábrica" 2,65, editável por ensaio. */
  massaEspecificaGraos: number | null;

  corposDeProva: CdCorpoDeProva[];
  /**
   * Já tentou puxar as fotos da digitalização de campo pra este relatório —
   * mesmo padrão de `compressao-simples/types.ts` (evita reimportar foto já
   * apagada de propósito no escritório).
   */
  fotosBancadaImportadas?: boolean;
}

export function newCdCapsula(): CdCapsula {
  return { numero: "", tara: 0, wet: 0, dry: 0 };
}

export function newCdCorpoDeProva(label: string): CdCorpoDeProva {
  return {
    id: `cp_${Math.random().toString(36).slice(2, 9)}`,
    label,
    alturas: [0, 0, 0, 0],
    diametros: [0, 0, 0, 0],
    massaInicial: null,
    capsulas: [newCdCapsula(), newCdCapsula(), newCdCapsula()],
    picoCarga: null,
    picoCargaUnidade: "kN",
  };
}

export function seedCompressaoDiametralSample(
  partial?: Partial<CompressaoDiametralSample>,
): CompressaoDiametralSample {
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
    amostraTipo: "asfalto",
    idadeCuraDias: null,
    massaEspecificaGraos: 2.65,
    corposDeProva: [newCdCorpoDeProva("CP01")],
    ...partial,
  };
}
