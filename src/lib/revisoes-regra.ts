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
