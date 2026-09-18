import type { PLTDeterminacao } from "./types";

/**
 * Cálculo do Point Load Test — cada fórmula abaixo replica, célula a célula,
 * o relatório real que o laboratório já usa (planilha PLT.xlsm, abas "PLT
 * (0)"/"PLT (1)"). Não são as fórmulas "de livro-texto" do ISRM (que usam
 * De² = 4WD/π para ensaio axial/bloco/irregular) — são as que este
 * laboratório efetivamente aplica e já entrega ao cliente.
 */

/**
 * Diâmetro equivalente (De) [mm]. Ensaio axial ("a...") usa o diâmetro (D);
 * qualquer outro tipo (diametral, bloco, irregular) usa a altura (w).
 */
export function diametroEquivalente(det: PLTDeterminacao): number | null {
  if (det.alturaMm == null || !Number.isFinite(det.alturaMm)) return null;
  const v = det.tipo === "a" ? det.diametroMm : det.alturaMm;
  return v != null && Number.isFinite(v) ? v : null;
}

/** Índice de resistência à carga pontual não corrigido — Is = P[N]/De² [MPa]. */
export function indiceIs(det: PLTDeterminacao): number | null {
  const de = diametroEquivalente(det);
  if (de == null || de <= 0 || det.cargaKn == null || !Number.isFinite(det.cargaKn)) return null;
  return (det.cargaKn * 1000) / (de * de);
}

/** Fator de correção de forma F = (De/50)^0,45 — leva Is ao tamanho de referência De = 50 mm. */
export function fatorF(det: PLTDeterminacao): number | null {
  const de = diametroEquivalente(det);
  if (de == null || de <= 0) return null;
  const f = Math.pow(de / 50, 0.45);
  return Number.isFinite(f) ? f : null;
}

/** Is(50) — índice corrigido para De = 50 mm. Is(50) = F × Is. */
export function indiceIs50(det: PLTDeterminacao): number | null {
  const f = fatorF(det);
  const is = indiceIs(det);
  if (f == null || is == null) return null;
  return f * is;
}

/**
 * Fator de conversão genérico Índice→Resistência (K), regressão linear sobre
 * a tabela de Bieniawski (Core Size × K) que acompanha a planilha original:
 * K = 0,1808 × D[mm] + 13,824 (R² = 0,9851 contra a tabela).
 */
export function fatorK(det: PLTDeterminacao): number | null {
  if (det.diametroMm == null || !Number.isFinite(det.diametroMm)) return null;
  return 0.1808 * det.diametroMm + 13.824;
}

/** Tabela de referência Bieniawski (Core Size × K) — só exibição/nota do relatório. */
export const TABELA_BIENIAWSKI_K: { coreSizeMm: number; k: number }[] = [
  { coreSizeMm: 21.5, k: 18 },
  { coreSizeMm: 30, k: 19 },
  { coreSizeMm: 42, k: 21 },
  { coreSizeMm: 50, k: 23 },
  { coreSizeMm: 54, k: 24 },
  { coreSizeMm: 60, k: 24.5 },
];

/** Estimativa da resistência à compressão simples (RCU) — K × Is (não corrigido). */
export function resistenciaEstimada(det: PLTDeterminacao): number | null {
  const k = fatorK(det);
  const is = indiceIs(det);
  if (k == null || is == null) return null;
  return k * is;
}

export interface PLTResultadoLinha {
  det: PLTDeterminacao;
  de: number | null;
  is: number | null;
  fatorF: number | null;
  fatorK: number | null;
  is50: number | null;
  resistencia: number | null;
}

export function calcularLinha(det: PLTDeterminacao): PLTResultadoLinha {
  return {
    det,
    de: diametroEquivalente(det),
    is: indiceIs(det),
    fatorF: fatorF(det),
    fatorK: fatorK(det),
    is50: indiceIs50(det),
    resistencia: resistenciaEstimada(det),
  };
}

function media(vals: (number | null)[]): number | null {
  const validos = vals.filter((v): v is number => v != null && Number.isFinite(v));
  if (!validos.length) return null;
  return validos.reduce((a, b) => a + b, 0) / validos.length;
}

export interface PLTMedias {
  isMedio: number | null;
  is50Medio: number | null;
  resistenciaMedia: number | null;
}

/** Médias sobre as determinações válidas (com ruptura) e não excluídas — mesmo efeito do "*" na planilha. */
export function calcularMedias(determinacoes: PLTDeterminacao[]): PLTMedias {
  const consideradas = determinacoes.filter((d) => !d.excluidaDaMedia).map(calcularLinha);
  return {
    isMedio: media(consideradas.map((r) => r.is)),
    is50Medio: media(consideradas.map((r) => r.is50)),
    resistenciaMedia: media(consideradas.map((r) => r.resistencia)),
  };
}

/**
 * Reconhece a etiqueta/QR do Point Load Test usado em campo. Sigla única
 * "LOAD.TEST" — sem variantes (ao contrário de Compressão Simples).
 */
export function isPLTTag(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return raw.toUpperCase().trim().replace(/\s+/g, "") === "LOAD.TEST";
}
