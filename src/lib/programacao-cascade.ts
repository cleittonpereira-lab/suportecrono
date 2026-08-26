/**
 * Motor de reagendamento em cascata da Programação de Ensaios.
 *
 * Cobre os dois comportamentos pedidos com a mesma função: quando um ensaio
 * termina (ou é iniciado) antes do previsto, os sucessores avançam
 * ("puxa o início do outro"); quando termina depois do previsto, os
 * sucessores atrasam junto — é sempre a mesma pergunta ("dado que esta
 * âncora agora termina em X, quando o próximo pode começar?").
 *
 * "Sucessor direto" de um ensaio é: a cadeia real de `predecessor_id`
 * quando ela existir; se a linha não tiver predecessor definido, a próxima
 * linha ainda "planejado" no mesmo equipamento, por ordem de data prevista
 * (mesmo comportamento que já existia, preservado como fallback).
 *
 * Usado por `_app.programacao.gantt.tsx` (ao iniciar/terminar pelo painel
 * desktop) e `_app.programacao.scan.tsx` (ao iniciar/terminar pela leitura
 * de QR na bancada) — os dois caminhos devem se comportar de forma idêntica.
 */
import { addBusinessOffsetIso, endIsoFromDur } from "@/lib/business-days";
import type { Programacao } from "@/lib/programacao-model";

function getDirectSuccessors(progId: string, allProgs: Programacao[]): Programacao[] {
  const chained = allProgs.filter((p) => p.predecessor_id === progId && p.status === "planejado");
  if (chained.length > 0) return chained;

  const anchor = allProgs.find((p) => p.id === progId);
  if (!anchor?.equipamento_id) return [];
  const sameEquip = allProgs
    .filter(
      (p) =>
        p.id !== progId &&
        p.status === "planejado" &&
        p.equipamento_id === anchor.equipamento_id &&
        (p.data_inicio_prevista || "") > (anchor.data_inicio_prevista || ""),
    )
    .sort((a, b) => (a.data_inicio_prevista || "").localeCompare(b.data_inicio_prevista || ""));
  return sameEquip.length > 0 ? [sameEquip[0]] : [];
}

export type RecalculateDownstreamPatch = {
  data_inicio_prevista: string;
  data_inicio: string;
  data_fim: string;
};

/**
 * Caminha a cadeia de sucessores a partir de `anchorProgId`, recalculando o
 * início mais cedo possível de cada um a partir de `anchorFinishIso`. Só
 * grava (via `updateFn`) quando a data realmente muda, e só mexe em linhas
 * ainda "planejado" — execuções já iniciadas/concluídas são fato histórico,
 * não são reescritas.
 */
export async function recalculateDownstream(
  anchorProgId: string,
  anchorFinishIso: string,
  allProgs: Programacao[],
  updateFn: (id: string, patch: RecalculateDownstreamPatch) => Promise<void>,
): Promise<{ shifted: number }> {
  let shifted = 0;
  const visited = new Set<string>([anchorProgId]);
  const queue: Array<{ progId: string; finishIso: string }> = [
    { progId: anchorProgId, finishIso: anchorFinishIso },
  ];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const successors = getDirectSuccessors(cur.progId, allProgs);

    for (const succ of successors) {
      if (visited.has(succ.id)) continue; // guarda contra ciclos de predecessor_id
      visited.add(succ.id);

      const novoInicio = addBusinessOffsetIso(cur.finishIso, 1, succ.incluir_fds);
      const novoFim = endIsoFromDur(novoInicio, succ.duracao_dias || 1, succ.incluir_fds);

      if (novoInicio !== succ.data_inicio_prevista) {
        await updateFn(succ.id, {
          data_inicio_prevista: novoInicio,
          data_inicio: novoInicio,
          data_fim: novoFim,
        });
        shifted += 1;
        // Atualiza em memória pra próximos elos da cadeia usarem o valor novo
        // no mesmo passe, sem precisar reler o servidor.
        succ.data_inicio_prevista = novoInicio;
        succ.data_inicio = novoInicio;
        succ.data_fim = novoFim;
      }

      queue.push({ progId: succ.id, finishIso: novoFim });
    }
  }

  return { shifted };
}
