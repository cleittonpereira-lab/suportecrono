/**
 * ASF.TB — teor de betume de misturas betuminosas (DNER-ME 053/94, extrator
 * centrífugo) e granulometria do agregado extraído (DNIT 412/2025-ME,
 * peneiramento).
 *
 * Decisões do laboratório (14/09/2026): série de peneiras da Tabela A1 da
 * DNIT 412; teor só com o que a norma pede (massa da amostra e do agregado
 * recuperado, uma determinação); faixas A/B/C da DNIT 031 no laudo, com a
 * opção de mostrar ou não; sem comparação com teor de projeto.
 */

export type AsfTbFaixa = "A" | "B" | "C";

export interface AsfTbPeneira {
  /** Abertura nominal da malha (mm). */
  aberturaMm: number;
  /** Designação da peneira (polegadas ou nº). */
  nome: string;
  /** Peneira usada neste ensaio (a norma deixa escolher as peneiras da série). */
  ativa: boolean;
  /** Massa retida (g). Vazia conta como zero. */
  retida: number | null;
}

/** Série de peneiras da Tabela A1 da DNIT 412/2025-ME, da maior para a menor abertura. */
export const SERIE_DNIT_412: ReadonlyArray<{ aberturaMm: number; nome: string }> = [
  { aberturaMm: 75, nome: '3"' },
  { aberturaMm: 50, nome: '2"' },
  { aberturaMm: 37.5, nome: '1 ½"' },
  { aberturaMm: 25, nome: '1"' },
  { aberturaMm: 19, nome: '3/4"' },
  { aberturaMm: 12.5, nome: '1/2"' },
  { aberturaMm: 9.5, nome: '3/8"' },
  { aberturaMm: 6.3, nome: '1/4"' },
  { aberturaMm: 4.8, nome: "nº 4" },
  { aberturaMm: 2.36, nome: "nº 8" },
  { aberturaMm: 2, nome: "nº 10" },
  { aberturaMm: 1.18, nome: "nº 16" },
  { aberturaMm: 0.6, nome: "nº 30" },
  { aberturaMm: 0.43, nome: "nº 40" },
  { aberturaMm: 0.3, nome: "nº 50" },
  { aberturaMm: 0.15, nome: "nº 100" },
  { aberturaMm: 0.075, nome: "nº 200" },
];

/** Misturas asfálticas raramente passam de 25 mm: as três maiores começam desligadas. */
const ABERTURA_MAXIMA_PADRAO = 25;

export function novasPeneiras(): AsfTbPeneira[] {
  return SERIE_DNIT_412.map((p) => ({ ...p, ativa: p.aberturaMm <= ABERTURA_MAXIMA_PADRAO, retida: null }));
}

/**
 * Completa uma lista gravada com as peneiras da série que faltarem (payload
 * antigo ou incompleto), mantendo o que já foi digitado, na ordem da série.
 */
export function normalizarPeneiras(lista: AsfTbPeneira[] | null | undefined): AsfTbPeneira[] {
  const gravadas = new Map((lista ?? []).map((p) => [p.aberturaMm, p]));
  return novasPeneiras().map((p) => {
    const g = gravadas.get(p.aberturaMm);
    return g ? { ...p, ativa: g.ativa !== false, retida: g.retida ?? null } : p;
  });
}

/** O que se mede na bancada — igual no celular do operador e no editor do escritório. */
export interface AsfTbMedidas {
  // Teor de betume — DNER-ME 053/94
  /** Peso da amostra total antes do ensaio (g). */
  massaAmostra: number | null;
  /** Peso do agregado recuperado, seco em estufa até constância de peso (g). */
  massaAgregado: number | null;
  /** Solvente usado na extração (nota 2 da norma). */
  solvente: string;
  // Granulometria — DNIT 412/2025-ME
  /** Massa seca inicial do peneiramento (g). Vazia: usa o agregado recuperado. */
  massaInicialGranulometria: number | null;
  /** Massa seca depois da lavagem na peneira 0,075 mm (DNER-ME 266/97), se houve lavagem (g). */
  massaAposLavagem: number | null;
  peneiras: AsfTbPeneira[];
  /** Massa retida no fundo (g). */
  fundo: number | null;
}

export function medidasVazias(): AsfTbMedidas {
  return {
    massaAmostra: null,
    massaAgregado: null,
    solvente: "",
    massaInicialGranulometria: null,
    massaAposLavagem: null,
    peneiras: novasPeneiras(),
    fundo: null,
  };
}

/** Completa medidas gravadas (payload antigo, parcial ou vindo do celular). */
export function normalizarMedidas(m: Partial<AsfTbMedidas> | null | undefined): AsfTbMedidas {
  const base = medidasVazias();
  return {
    massaAmostra: m?.massaAmostra ?? base.massaAmostra,
    massaAgregado: m?.massaAgregado ?? base.massaAgregado,
    solvente: m?.solvente ?? base.solvente,
    massaInicialGranulometria: m?.massaInicialGranulometria ?? base.massaInicialGranulometria,
    massaAposLavagem: m?.massaAposLavagem ?? base.massaAposLavagem,
    peneiras: normalizarPeneiras(m?.peneiras),
    fundo: m?.fundo ?? base.fundo,
  };
}

export interface AsfTbSample extends AsfTbMedidas {
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
  /** Faixa granulométrica da DNIT 031 comparada no laudo. */
  faixa: AsfTbFaixa;
  /** Mostra a faixa no gráfico e na tabela do laudo. */
  mostrarFaixa: boolean;
  /**
   * Já tentou puxar as fotos da digitação da bancada pra este relatório —
   * mesmo que não tivesse nenhuma foto pra trazer. Sem isto, apagar TODAS as
   * fotos no escritório fazia `ctx.photos` voltar a zero, e a próxima vez que
   * a tela abrisse achava que "ainda não tinha foto nenhuma" e trazia de
   * volta as mesmas fotos da pendência — a exclusão nunca "pegava" de vez.
   */
  fotosBancadaImportadas?: boolean;
}

export function seedAsfTbSample(partial?: Partial<AsfTbSample>): AsfTbSample {
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
    faixa: "C",
    mostrarFaixa: false,
    ...medidasVazias(),
    ...partial,
  };
}

export interface AsfTbPhoto {
  id: string;
  dataUrl: string;
  bytes: number;
  caption?: string;
}

/** Payload da pendência de digitação criada pela leitura do QR na bancada. */
export interface AsfTbFieldPayload {
  ident: {
    os: string;
    amostraCodigo: string;
    /** "26+000" — estaca/serviço da via, não furo/profundidade. */
    servicoNome?: string;
    tipoEnsaioNome: string;
    tipoEnsaioCodigo: string; // "ASF.TB"
    // IDs numéricos do QR, guardados para uso futuro (como no ASF.DAP).
    qrcodeEnsaioLabId?: number;
    ensaioId?: number;
    contratoId?: number;
    servicoId?: number;
    ensaioTagId?: number;
  };
  medidas: AsfTbMedidas;
  fotos: AsfTbPhoto[];
  /**
   * Vínculo com o ensaio real (labStore), gravado quando alguém abre esta
   * pendência pelo escritório — ver `abrirPorTipo` em _app.relatorio.pendentes.tsx.
   */
  _linkedEnsaio?: { osId: string; amostraId: string; ensaioId: string };
  obs: string;
}

/**
 * Sugestões para o campo de solvente. A norma cita tetracloreto de carbono
 * (ligante asfáltico) e benzol (alcatrão); os laboratórios hoje usam os
 * clorados menos tóxicos. O campo aceita qualquer texto.
 */
export const SOLVENTES_SUGERIDOS = [
  "Tricloroetileno",
  "Percloroetileno (tetracloroetileno)",
  "Tetracloreto de carbono",
  "Benzol",
];

export const ASF_TB_NOME = "Teor de Betume e Granulometria (ASF.TB)";
export const ASF_TB_CODIGO = "ASF.TB";

export function emptyAsfTbPayload(ident: AsfTbFieldPayload["ident"]): AsfTbFieldPayload {
  return { ident, medidas: medidasVazias(), fotos: [], obs: "" };
}
