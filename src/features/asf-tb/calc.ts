/**
 * Cálculos do ASF.TB:
 *  - teor de betume — DNER-ME 053/94 (extrator centrífugo), §5g e §6;
 *  - granulometria do agregado extraído — DNIT 412/2025-ME, §3.4, §3.8, §8 e §9.
 */
import type { AsfTbMedidas, AsfTbPeneira } from "./types";

/** Reconhece a tag/descrição do QR ou do cadastro de Tipos de Ensaio como ASF.TB. */
export function isAsfTbTag(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const t = raw.toLowerCase().replace(/\s+/g, "");
  return t.includes("asf.tb") || t.includes("asf-tb") || t.includes("asftb") || t.includes("teordebetume");
}

const num = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/** §5g: peso do betume extraído = peso da amostra antes do ensaio − peso do agregado recuperado (g). */
export function massaBetume(massaAmostra: number | null, massaAgregado: number | null): number | null {
  if (!num(massaAmostra) || !num(massaAgregado)) return null;
  if (!(massaAmostra > 0) || massaAgregado < 0 || massaAgregado > massaAmostra) return null;
  return massaAmostra - massaAgregado;
}

/** §6: P = peso do betume extraído / peso da amostra total × 100 (%). */
export function teorBetume(massaAmostra: number | null, massaAgregado: number | null): number | null {
  const b = massaBetume(massaAmostra, massaAgregado);
  return b == null ? null : (b / (massaAmostra as number)) * 100;
}

/** Tolerância da §8b: a soma das massas não pode diferir mais que 0,3 % da massa seca inicial. */
export const TOLERANCIA_SOMA_PCT = 0.3;

export interface LinhaGranulometria {
  aberturaMm: number;
  nome: string;
  /** Massa retida digitada (g), ou null se ficou em branco (conta como zero). */
  retida: number | null;
  pctRetida: number;
  pctRetidaAcumulada: number;
  pctPassante: number;
}

export interface ResultadoGranulometria {
  /** Base de todas as porcentagens (§8c/§8d): massa seca inicial, antes da lavagem (g). */
  massaInicial: number;
  /** Material fino removido na lavagem (g), quando houve lavagem. */
  perdaLavagem: number | null;
  /** Soma das massas retidas nas peneiras e no fundo, mais a perda na lavagem (g). */
  somaMassas: number;
  /** Diferença entre a soma e a massa inicial, em % da massa inicial (§8b). */
  diferencaPct: number;
  dentroDaTolerancia: boolean;
  linhas: LinhaGranulometria[];
  /** Fundo + perda na lavagem: o material mais fino que a última peneira (g e %). */
  fundo: { massa: number; pctRetida: number };
  /** §3.4 — menor abertura com % retida acumulada ≤ 5 % (mm). */
  dimensaoMaximaCaracteristica: number | null;
  /** §3.8 — abertura imediatamente acima da primeira peneira que retém mais de 10 % acumulado (mm). */
  tamanhoNominalMaximo: number | null;
}

/** Massa seca inicial do peneiramento: a digitada ou, sem ela, o agregado recuperado da extração. */
export function massaInicialDoPeneiramento(m: Pick<AsfTbMedidas, "massaInicialGranulometria" | "massaAgregado">): number | null {
  if (num(m.massaInicialGranulometria) && m.massaInicialGranulometria > 0) return m.massaInicialGranulometria;
  if (num(m.massaAgregado) && m.massaAgregado > 0) return m.massaAgregado;
  return null;
}

/**
 * Composição granulométrica (§8): porcentagens retidas, acumuladas e passantes
 * em cada peneira ativa, sempre sobre a massa seca inicial (antes da lavagem,
 * quando houve — §8d). O material removido na lavagem soma-se ao fundo.
 */
export function calcularGranulometria(
  m: Pick<AsfTbMedidas, "massaInicialGranulometria" | "massaAgregado" | "massaAposLavagem" | "peneiras" | "fundo">,
): ResultadoGranulometria | null {
  const massaInicial = massaInicialDoPeneiramento(m);
  if (massaInicial == null) return null;

  const perdaLavagem =
    num(m.massaAposLavagem) && m.massaAposLavagem > 0 && m.massaAposLavagem <= massaInicial
      ? massaInicial - m.massaAposLavagem
      : null;

  const ativas = m.peneiras
    .filter((p): p is AsfTbPeneira => p.ativa)
    .slice()
    .sort((a, b) => b.aberturaMm - a.aberturaMm);

  let acumulada = 0;
  const linhas: LinhaGranulometria[] = ativas.map((p) => {
    const retida = num(p.retida) ? p.retida : 0;
    acumulada += retida;
    const pctRetida = (retida / massaInicial) * 100;
    const pctRetidaAcumulada = (acumulada / massaInicial) * 100;
    return {
      aberturaMm: p.aberturaMm,
      nome: p.nome,
      retida: num(p.retida) ? p.retida : null,
      pctRetida,
      pctRetidaAcumulada,
      pctPassante: 100 - pctRetidaAcumulada,
    };
  });

  const fundoMassa = (num(m.fundo) ? m.fundo : 0) + (perdaLavagem ?? 0);
  const somaMassas = acumulada + fundoMassa;
  const diferencaPct = (Math.abs(somaMassas - massaInicial) / massaInicial) * 100;

  return {
    massaInicial,
    perdaLavagem,
    somaMassas,
    diferencaPct,
    dentroDaTolerancia: diferencaPct <= TOLERANCIA_SOMA_PCT + 1e-9,
    linhas,
    fundo: { massa: fundoMassa, pctRetida: (fundoMassa / massaInicial) * 100 },
    dimensaoMaximaCaracteristica: dimensaoMaximaCaracteristica(linhas),
    tamanhoNominalMaximo: tamanhoNominalMaximo(linhas),
  };
}

/** §3.4 — menor abertura da série para a qual a % retida acumulada é ≤ 5 %. */
export function dimensaoMaximaCaracteristica(linhas: LinhaGranulometria[]): number | null {
  let resposta: number | null = null;
  for (const l of linhas) {
    if (l.pctRetidaAcumulada <= 5 + 1e-9) resposta = l.aberturaMm;
    else break;
  }
  return resposta;
}

/** §3.8 — abertura da peneira imediatamente acima da primeira que retém mais de 10 % (acumulado). */
export function tamanhoNominalMaximo(linhas: LinhaGranulometria[]): number | null {
  const i = linhas.findIndex((l) => l.pctRetidaAcumulada > 10 + 1e-9);
  if (i <= 0) return null;
  return linhas[i - 1].aberturaMm;
}

/** Abertura em mm no padrão brasileiro, sem zeros sobrando: 12,5 · 0,075 · 25. */
export function formatarAbertura(mm: number): string {
  return mm.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

/**
 * Casas decimais das porcentagens no laudo (§9d): número inteiro mais
 * próximo; a % passante na peneira 0,075 mm, quando abaixo de 10 %, com 0,1 %.
 */
export function casasDoPassante(aberturaMm: number, pctPassante: number): number {
  return aberturaMm === 0.075 && pctPassante < 10 ? 1 : 0;
}
