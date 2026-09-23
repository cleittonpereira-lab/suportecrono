/**
 * Status do laudo no cabeçalho dos editores — uma regra só para todos.
 *
 * Cada editor calculava `wfStatus || approvals[0]?.status || status do ensaio`:
 * o `wfStatus` otimista da própria tela vencia o fluxo gravado no servidor, e
 * a revisão devolvida ("rejeitado_verificacao") caía em "aguardando
 * verificação". Resultado: título dizendo uma coisa, badge outra, e cada
 * Kanban mostrando o laudo numa coluna.
 *
 * Agora vale o fluxo de aprovação (a revisão mais recente, mesma regra do
 * servidor em etapa-laudo.ts). O status gravado só conta quando nenhuma
 * revisão foi enviada.
 */
import { etapaDasAprovacoes, normalizarEtapa, situacaoDaUltimaRevisao } from "./etapa-laudo";

type Linha = { rev: number; status?: string | null };

export type StatusDoEditor = {
  /** Valor para o farol/badges (vocabulário do WorkflowFarol). */
  rawSt: string;
  isEmDigitacao: boolean;
  isAguardandoVerif: boolean;
  isAguardandoAprov: boolean;
  isAprovado: boolean;
  /** Revisão mais recente no fluxo (a que os botões verificam/aprovam). */
  rev: number;
  /** A última revisão foi devolvida pelo verificador. */
  devolvida: boolean;
  /** A última revisão foi reaberta para correção e ainda não foi enviada. */
  reaberta: boolean;
  /** Fora da digitação os dados ficam travados (ver DadosTravados). */
  travado: boolean;
};

export function statusDoEditor(
  approvals: readonly Linha[] | null | undefined,
  wfStatus: string | null | undefined,
  statusDoEnsaio?: string | null,
): StatusDoEditor {
  const etapa =
    etapaDasAprovacoes(approvals) ?? normalizarEtapa(wfStatus) ?? normalizarEtapa(statusDoEnsaio) ?? "em_digitacao";
  const sit = situacaoDaUltimaRevisao(approvals);
  const isAguardandoVerif = etapa === "aguardando_verificacao";
  const isAguardandoAprov = etapa === "aguardando_aprovacao";
  const isAprovado = etapa === "aprovado";
  const devolvida = sit?.devolvida ?? false;
  const reaberta = sit?.reaberta ?? false;
  const rawSt = devolvida
    ? "rejeitado_verificacao"
    : reaberta
      ? "em_revisao"
      : isAguardandoVerif || isAguardandoAprov || isAprovado
        ? etapa
        : "digitacao";
  return {
    rawSt,
    isEmDigitacao: !isAguardandoVerif && !isAguardandoAprov && !isAprovado,
    isAguardandoVerif,
    isAguardandoAprov,
    isAprovado,
    rev: sit?.rev ?? 0,
    devolvida,
    reaberta,
    travado: isAguardandoVerif || isAguardandoAprov || isAprovado,
  };
}
