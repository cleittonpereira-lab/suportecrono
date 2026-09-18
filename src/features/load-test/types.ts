/**
 * Point Load Test — Índice de Resistência à Carga Pontual de Rocha.
 * ASTM D5731-16 / ISRM - Suggested method for determining point load
 * strength (2016). Modelo copiado do relatório real que o laboratório já
 * usa (planilha PLT.xlsm) — as fórmulas em `calc.ts` batem célula a célula
 * com esse arquivo.
 *
 * Uma amostra reúne várias determinações (fragmentos de rocha rompidos
 * individualmente, "Nº do CP" 1 a 10 na planilha) — mesma ideia de
 * `corposDeProva` da Compressão Simples, mas sem cápsula/índice físico:
 * aqui só entram altura, diâmetro, carga e o tipo do teste.
 */

/** d = diametral; a = axial; b = bloco; i = amostra irregular (legenda da ISRM/planilha). */
export type PLTTipoTeste = "d" | "a" | "b" | "i";

/** Orientação da carga em relação a um plano de fraqueza (fica em branco quando não se aplica). */
export type PLTOrientacao = "" | "perpendicular" | "paralelo";

export interface PLTDeterminacao {
  id: string;
  /** "Nº do CP" — 1, 2, 3... (rótulo livre pra poder marcar como "4*" na tela, se quiser). */
  numero: number;
  tipo: PLTTipoTeste;
  orientacao: PLTOrientacao;
  /** Altura (w) [mm]. */
  alturaMm: number | null;
  /** Diâmetro (D) [mm]. */
  diametroMm: number | null;
  /** Carga de ruptura (P) [kN]. */
  cargaKn: number | null;
  /**
   * Ruptura não considerada válida (ex.: plano de fraqueza cruzando o ponto de
   * carga) — exclui esta determinação das médias sem apagar os dados, mesmo
   * efeito do "*" ao lado do número na planilha original.
   */
  excluidaDaMedia: boolean;
  observacao?: string;
}

export interface PLTSample {
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
  verifiedBy?: string;
  approvedBy?: string;
  /** Descrição geológica da rocha ensaiada (campo "Geologia:" da planilha). */
  description: string;
  code: string;
  os: string;
  granulometricDescription: string;
  /** "Multiprensa - OWNTEC - PRE-MP-001", por exemplo. */
  equipment?: string;
  coordN?: string | number;
  coordE?: string | number;
  coordCota?: string | number;
  coordDatum?: string;

  determinacoes: PLTDeterminacao[];

  /** Mesmo propósito do campo homônimo em Compressão Simples/ASF.TB. */
  fotosBancadaImportadas?: boolean;
}

export function newPLTDeterminacao(numero: number): PLTDeterminacao {
  return {
    id: `det_${Math.random().toString(36).slice(2, 9)}`,
    numero,
    tipo: "a",
    orientacao: "perpendicular",
    alturaMm: null,
    diametroMm: null,
    cargaKn: null,
    excluidaDaMedia: false,
  };
}

export function seedPLTSample(partial?: Partial<PLTSample>): PLTSample {
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
    determinacoes: [newPLTDeterminacao(1)],
    ...partial,
  };
}
