/**
 * Permeabilidade a Carga Variável — Método B (ABNT NBR 14545:2021).
 * Bureta de vidro graduada acoplada a um permeâmetro parcialmente imerso
 * num reservatório de água (Figuras 2 e 3 da norma). A carga hidráulica
 * (h) é a diferença entre o nível d'água do reservatório e o nível na
 * bureta; se a bureta for graduada em volume, a leitura é convertida pra
 * carga hidráulica via a calibração (item 4.2.2 da norma).
 */
export type PermVCalibracaoModo = "volume" | "comprimento";

export interface PermVCalibracao {
  modo: PermVCalibracaoModo;
  /** modo "volume": correlação leitura (mL) -> comprimento (cm). Ex.: 1 mL = 1 cm. */
  volumeReferenciaMl: number | null;
  alturaReferenciaCm: number | null;
  /** modo "comprimento": área interna da bureta (a), informada direto ou via diâmetro. */
  areaBuretaCm2: number | null;
  diametroInternoBuretaMm: number | null;
}

export interface PermVLeitura {
  id: string;
  /** Tempo decorrido desde o início do ensaio, em segundos. */
  tSegundos: number | null;
  /** Leitura bruta da bureta (mL se modo "volume", cm se modo "comprimento"). */
  leituraBruta: number | null;
  /** Temperatura da água no instante da leitura (°C). */
  temperatura: number | null;
  /** Variação de altura do CP nesse instante, se monitorada (opcional, cm). */
  alturaCp: number | null;
}

export interface PermVSample {
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

  // Natureza da água / gradiente (item 7.3.1 e 9.e da norma)
  naturezaAgua: string;
  gradienteHidraulico: number | null;

  // Índices físicos iniciais do corpo de prova (8.1)
  massaUmida: number | null; // Mu (g)
  teorUmidadeInicial: number | null; // w (%)
  massaEspecificaGraos: number | null; // ρs (g/cm³) — opcional
  diametroInicial: number | null; // Dcp(i) (cm)
  alturaInicial: number | null; // Hcp(i) (cm)

  calibracao: PermVCalibracao;
  leituras: PermVLeitura[];
}

export function newPermVLeitura(): PermVLeitura {
  return {
    id: `lt_${Math.random().toString(36).slice(2, 9)}`,
    tSegundos: null,
    leituraBruta: null,
    temperatura: null,
    alturaCp: null,
  };
}

export function seedPermVSample(partial?: Partial<PermVSample>): PermVSample {
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
    naturezaAgua: "Destilada / deairada",
    gradienteHidraulico: null,
    massaUmida: null,
    teorUmidadeInicial: null,
    massaEspecificaGraos: null,
    diametroInicial: null,
    alturaInicial: null,
    calibracao: {
      modo: "volume",
      volumeReferenciaMl: 1,
      alturaReferenciaCm: 1,
      areaBuretaCm2: null,
      diametroInternoBuretaMm: null,
    },
    leituras: [newPermVLeitura(), newPermVLeitura(), newPermVLeitura(), newPermVLeitura()],
    ...partial,
  };
}
