/**
 * Para qual CP vai cada ensaio (NT) de um arquivo de dados brutos — a sugestão
 * inicial da janela de importação. Cada NT vai para o CP livre com a tensão
 * confinante mais próxima; o operador pode trocar antes de importar.
 */
import type { OwnTecTestSummary } from "./importXlsx";
import type { TriaxialSpecimen } from "./types";

export type TipoTriaxial = "cid" | "ciu" | "uu";

/** O ensaio do arquivo serve para este tipo? CID pede ruptura drenada; CIU e UU, não drenada. */
export const serveParaOTipo = (t: OwnTecTestSummary, tipo: TipoTriaxial) =>
  tipo === "cid" ? t.hasDrained : t.hasUndrained;

/** Tensão confinante do ensaio no arquivo: a da ruptura; sem ela, a do adensamento. */
export const sigma3DoArquivo = (t: OwnTecTestSummary) => t.sigmaRupture ?? t.sigmaAdens;

/** σ₃ do arquivo e do CP conferem se a diferença for de até 5 kPa ou 10 %. */
export function sigma3Confere(arquivo: number | null, cp: number | undefined): boolean {
  if (arquivo == null || cp == null || !isFinite(cp) || cp <= 0) return false;
  const dif = Math.abs(arquivo - cp);
  return dif <= 5 || dif / cp <= 0.1;
}

/**
 * Destino sugerido por NT (id do CP, ou null = não importar):
 * - um só ensaio compatível → o CP de onde a importação foi aberta;
 * - vários → cada NT vai para o CP ainda livre de σ₃ mais próximo, se o σ₃ confere.
 */
export function sugerirDestinos(
  tests: OwnTecTestSummary[],
  specimens: Pick<TriaxialSpecimen, "id" | "sigma3Target">[],
  tipo: TipoTriaxial,
  cpDeOrigem?: string,
): Record<string, string | null> {
  const destinos: Record<string, string | null> = {};
  for (const t of tests) destinos[t.nt] = null;
  const compativeis = tests.filter((t) => serveParaOTipo(t, tipo));
  if (compativeis.length === 1 && cpDeOrigem) {
    destinos[compativeis[0].nt] = cpDeOrigem;
    return destinos;
  }
  const usados = new Set<string>();
  for (const t of compativeis) {
    const s3 = sigma3DoArquivo(t);
    let melhor: { id: string; dif: number } | null = null;
    for (const cp of specimens) {
      if (usados.has(cp.id) || !sigma3Confere(s3, cp.sigma3Target)) continue;
      const dif = Math.abs((s3 ?? 0) - cp.sigma3Target);
      if (!melhor || dif < melhor.dif) melhor = { id: cp.id, dif };
    }
    if (melhor) {
      destinos[t.nt] = melhor.id;
      usados.add(melhor.id);
    }
  }
  return destinos;
}

/** CPs escolhidos para mais de um NT — a janela não deixa importar assim. */
export function cpsRepetidos(destinos: Record<string, string | null>): string[] {
  const contagem = new Map<string, number>();
  for (const cp of Object.values(destinos)) if (cp) contagem.set(cp, (contagem.get(cp) ?? 0) + 1);
  return [...contagem].filter(([, n]) => n > 1).map(([cp]) => cp);
}
