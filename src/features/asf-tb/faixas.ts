/**
 * Faixas granulométricas do concreto asfáltico — DNIT 031/2024-ES, Tabela 1
 * (versão com a errata 1, de 27/11/2025). A norma nomeia as faixas pelo TNM
 * (A-25, B-19, C-12,5 e D-9,5); o laboratório usa A, B e C.
 *
 * As peneiras da Tabela 1 são as da série da DNIT 412 com outra designação
 * (1" = 25,4 mm na DNIT 031 e 25 mm na DNIT 412; 1/2" = 12,7 e 12,5 mm…):
 * a chave aqui é a abertura da série da DNIT 412, para casar com o ensaio.
 */
import { casasDoPassante } from "./calc";
import type { AsfTbFaixa } from "./types";

export interface LimiteFaixa {
  /** Abertura na série da DNIT 412 (mm). */
  aberturaMm: number;
  /** % passante mínima e máxima. */
  min: number;
  max: number;
}

export interface FaixaGranulometrica {
  /** Nome na DNIT 031/2024-ES (letra + TNM). */
  nome: string;
  limites: LimiteFaixa[];
}

const L = (aberturaMm: number, min: number, max: number): LimiteFaixa => ({ aberturaMm, min, max });

export const FAIXAS_DNIT_031: Record<AsfTbFaixa, FaixaGranulometrica> = {
  A: {
    nome: "A-25",
    limites: [
      L(37.5, 100, 100), L(25, 90, 100), L(19, 75, 89), L(12.5, 58, 78), L(9.5, 48, 71), L(6.3, 35, 61),
      L(4.8, 29, 55), L(2.36, 19, 45), L(1.18, 13, 36), L(0.6, 9, 28), L(0.3, 5, 21), L(0.15, 2, 14), L(0.075, 1, 7),
    ],
  },
  B: {
    nome: "B-19",
    limites: [
      L(25, 100, 100), L(19, 90, 100), L(12.5, 70, 89), L(9.5, 55, 82), L(6.3, 42, 70), L(4.8, 35, 63),
      L(2.36, 23, 49), L(1.18, 16, 37), L(0.6, 10, 28), L(0.3, 6, 20), L(0.15, 4, 13), L(0.075, 2, 8),
    ],
  },
  C: {
    nome: "C-12,5",
    limites: [
      L(19, 100, 100), L(12.5, 90, 100), L(9.5, 73, 89), L(6.3, 53, 78), L(4.8, 44, 72), L(2.36, 28, 58),
      L(1.18, 17, 45), L(0.6, 11, 35), L(0.3, 6, 25), L(0.15, 3, 17), L(0.075, 2, 10),
    ],
  },
};

export const FAIXAS_DISPONIVEIS: AsfTbFaixa[] = ["A", "B", "C"];

/** Limite da faixa nesta peneira, se a Tabela 1 tiver essa peneira. */
export function limiteNaPeneira(faixa: AsfTbFaixa, aberturaMm: number): LimiteFaixa | null {
  return FAIXAS_DNIT_031[faixa]?.limites.find((l) => l.aberturaMm === aberturaMm) ?? null;
}

/**
 * A % passante desta peneira está fora da faixa? Compara o valor como sai no
 * laudo (arredondado pela §9d da DNIT 412), para o asterisco nunca aparecer
 * num número que, impresso, está dentro do limite. Sem limite nessa peneira: null.
 */
export function foraDaFaixa(faixa: AsfTbFaixa, aberturaMm: number, pctPassante: number): boolean | null {
  const lim = limiteNaPeneira(faixa, aberturaMm);
  if (!lim) return null;
  const casas = casasDoPassante(aberturaMm, pctPassante);
  const impresso = Number(pctPassante.toFixed(casas));
  return impresso < lim.min || impresso > lim.max;
}
