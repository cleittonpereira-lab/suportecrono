/**
 * Regra única de numeração das revisões de um laudo.
 *
 * Cada tela numerava pela lista de versões guardada no navegador. Em outro
 * computador, ou depois de apagar versões ali, o número voltava para trás e
 * batia numa revisão que já existia — às vezes aprovada. O servidor gravava a
 * nova solicitação por cima da linha aprovada, o título dizia "Aguardando
 * aprovação" e o status continuava "Aprovado", e cada Kanban mostrava uma coisa.
 *
 * Agora:
 *  - só uma revisão APROVADA é imutável;
 *  - enquanto a última revisão não foi aprovada (pendente, devolvida,
 *    reprovada ou reaberta), reenviar reaproveita o MESMO número — não cria
 *    versões desnecessárias;
 *  - depois de aprovada, a próxima é a maior já usada + 1 (fluxo ou Drive).
 */

export type LinhaDeRevisao = { rev: number; status?: string | null };

/** Status gravado na revisão reaberta para correção ("Gerar nova revisão"), antes de ter PDF. */
export const STATUS_EM_REVISAO = "em_revisao";

function ultimaLinha(linhas: readonly LinhaDeRevisao[]): LinhaDeRevisao | null {
  if (linhas.length === 0) return null;
  return linhas.reduce((a, b) => (b.rev > a.rev ? b : a));
}

export function revisaoAprovada(linhas: readonly LinhaDeRevisao[], rev: number): boolean {
  return linhas.some((l) => l.rev === rev && l.status === "aprovado");
}

/** A revisão pode ter o PDF regravado sem virar outra: está no fluxo e ainda não foi aprovada. */
export function podeRegravar(linhas: readonly LinhaDeRevisao[], rev: number): boolean {
  return linhas.some((l) => l.rev === rev) && !revisaoAprovada(linhas, rev);
}

export function proximaRevisao(linhas: readonly LinhaDeRevisao[], revsNoDrive: readonly number[]): number {
  const ultima = ultimaLinha(linhas);
  if (ultima && ultima.status !== "aprovado") return ultima.rev;
  const usadas = [...linhas.map((l) => l.rev), ...revsNoDrive];
  return usadas.length > 0 ? Math.max(...usadas) + 1 : 0;
}

/** Número da revisão pelo nome do PDF ("..._Rev-03.pdf"), ou null. */
export function revDoNomeDoPdf(nome: string): number | null {
  const m = /Rev-?(\d+)\.pdf$/i.exec(nome);
  return m ? Number(m[1]) : null;
}

/**
 * Um PDF por revisão: o modificado por último. A pasta nova e a antiga da
 * amostra são lidas juntas, e uma revisão podia ter dois PDFs (envio repetido,
 * nome antigo). Pegava-se o primeiro que a listagem trouxesse — o "Visualizar"
 * abria uma versão desatualizada e a lista de versões trazia a mesma revisão duas vezes.
 */
export function pdfsMaisRecentesPorRevisao<T extends { name: string; modifiedTime?: string }>(arquivos: readonly T[]): T[] {
  const porRev = new Map<number, T>();
  for (const f of arquivos) {
    const rev = revDoNomeDoPdf(f.name);
    if (rev === null) continue;
    const atual = porRev.get(rev);
    if (!atual || Date.parse(f.modifiedTime ?? "") > Date.parse(atual.modifiedTime ?? "")) porRev.set(rev, f);
  }
  return [...porRev.values()];
}
