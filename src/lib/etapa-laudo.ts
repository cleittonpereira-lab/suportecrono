/**
 * Etapa do laudo — a mesma em todas as telas.
 *
 * Cada tela tinha a sua própria tradução de status (Central de Relatórios,
 * visão por OS, página da OS, lista por tipo, Central de Emissões e os quatro
 * derivadores do servidor), com rótulos e regras diferentes. O mesmo ensaio
 * aparecia "Aguardando verificação" numa aba e "Em digitação" em outra: a
 * visão por OS rebaixava o ensaio para a etapa da pendência, a Central
 * sobrescrevia a pendência com o status cru do ensaio, e a lista por tipo
 * mostrava o valor gravado ("digitado") sem tradução.
 *
 * Regra única, usada por todas:
 *  1. Laudo no fluxo formal (revisão enviada para verificação/aprovação): vale
 *     o fluxo — ele é a fonte de verdade e é o que as filas de verificação e
 *     aprovação mostram. Uma revisão nova volta a "Aguardando verificação"
 *     mesmo que a anterior estivesse aprovada.
 *  2. Fora do fluxo formal: vale a etapa mais avançada entre o ensaio e a
 *     pendência de digitação. "Concluído fora (Excel)" é marcado à mão e vale
 *     enquanto não houver fluxo formal.
 */
import type { PendenciaDigitacao } from "./lab-pendencias.functions";

export type EtapaLaudo =
  | "pendente"
  | "em_digitacao"
  | "aguardando_verificacao"
  | "aguardando_aprovacao"
  | "aprovado"
  | "concluido_externo";

/** Etapas anteriores ao laudo, vindas da programação (Gantt). */
export type EtapaBancada = "programado" | "execucao";
export type EtapaComBancada = EtapaBancada | EtapaLaudo;

type StatusPendencia = PendenciaDigitacao["status"];

export const ETAPAS_DO_LAUDO: EtapaLaudo[] = [
  "pendente",
  "em_digitacao",
  "aguardando_verificacao",
  "aguardando_aprovacao",
  "aprovado",
  "concluido_externo",
];

export const ETAPAS_COM_BANCADA: EtapaComBancada[] = ["programado", "execucao", ...ETAPAS_DO_LAUDO];

const ROTULO: Record<EtapaComBancada, string> = {
  programado: "Programado (Gantt)",
  execucao: "Em bancada",
  pendente: "Pendente de digitação",
  em_digitacao: "Em digitação",
  aguardando_verificacao: "Aguardando verificação",
  aguardando_aprovacao: "Aguardando aprovação",
  aprovado: "Aprovado",
  concluido_externo: "Concluído fora (Excel)",
};

const COR: Record<EtapaComBancada, string> = {
  programado: "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30",
  execucao: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
  pendente: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  em_digitacao: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  aguardando_verificacao: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30",
  aguardando_aprovacao: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30",
  aprovado: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  concluido_externo: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/30",
};

export function rotuloEtapa(etapa: EtapaComBancada): string {
  return ROTULO[etapa];
}

export function corEtapa(etapa: EtapaComBancada): string {
  return COR[etapa];
}

const ORDEM: Record<EtapaLaudo, number> = {
  pendente: 0,
  em_digitacao: 1,
  aguardando_verificacao: 2,
  aguardando_aprovacao: 3,
  aprovado: 4,
  concluido_externo: 4,
};

const FLUXO_FORMAL = new Set<EtapaLaudo>(["aguardando_verificacao", "aguardando_aprovacao", "aprovado"]);

type LinhaDeAprovacao = { rev: number; status?: string | null };

/**
 * Etapa pelo fluxo de aprovação: a revisão mais recente de `reportApprovals`
 * decide. `null` quando nenhuma revisão foi enviada — quem chama cai no status
 * gravado no arquivo. É a regra que os quatro derivadores do servidor tinham
 * copiada, cada um no seu arquivo.
 */
export function etapaDasAprovacoes(
  aprovacoes: readonly LinhaDeAprovacao[] | null | undefined,
): "aprovado" | "aguardando_aprovacao" | "aguardando_verificacao" | "em_digitacao" | null {
  if (!aprovacoes || aprovacoes.length === 0) return null;
  const ultima = aprovacoes.reduce((a, b) => (b.rev > a.rev ? b : a));
  switch (ultima.status) {
    case "aprovado":
      return "aprovado";
    case "pendente_aprovacao":
    case "verificado":
      return "aguardando_aprovacao";
    case "pendente_verificacao":
    case "rejeitado":
      return "aguardando_verificacao";
    // Devolvido pelo verificador e revisão reaberta voltam para quem digita —
    // a pendência já ia para "em digitação" e o laudo ficava em "aguardando
    // verificação", cada Kanban numa coluna.
    case "rejeitado_verificacao":
    case "em_revisao":
      return "em_digitacao";
    default:
      return null;
  }
}

/** Situação da revisão mais recente, para a tela explicar o porquê da etapa. */
export function situacaoDaUltimaRevisao(
  aprovacoes: readonly LinhaDeAprovacao[] | null | undefined,
): { rev: number; devolvida: boolean; reaberta: boolean } | null {
  if (!aprovacoes || aprovacoes.length === 0) return null;
  const ultima = aprovacoes.reduce((a, b) => (b.rev > a.rev ? b : a));
  return {
    rev: ultima.rev,
    devolvida: ultima.status === "rejeitado_verificacao",
    reaberta: ultima.status === "em_revisao",
  };
}

/** Traduz qualquer status gravado (ensaio, fluxo, aprovação ou pendência) para a etapa. */
export function normalizarEtapa(status: string | null | undefined): EtapaLaudo | null {
  switch ((status ?? "").toLowerCase().trim()) {
    case "pendente":
      return "pendente";
    case "em_digitacao":
    case "digitacao":
    case "rascunho":
    case "processando":
    case "em_revisao":
    // Devolvido pelo verificador: volta para quem digita (mesma regra de etapaDasAprovacoes).
    case "rejeitado_verificacao":
      return "em_digitacao";
    case "digitado":
    case "verificacao":
    case "aguardando_verificacao":
    case "pendente_verificacao":
    case "rejeitado":
      return "aguardando_verificacao";
    case "verificado":
    case "aguardando_aprovacao":
    case "pendente_aprovacao":
      return "aguardando_aprovacao";
    case "aprovado":
    case "concluido":
      return "aprovado";
    case "concluido_externo":
      return "concluido_externo";
    default:
      return null;
  }
}

/** A regra única (ver o topo do arquivo). */
export function combinarEtapas(doEnsaio: EtapaLaudo | null, daPendencia: EtapaLaudo | null): EtapaLaudo {
  if (doEnsaio && FLUXO_FORMAL.has(doEnsaio)) return doEnsaio;
  if (daPendencia === "concluido_externo" || doEnsaio === "concluido_externo") return "concluido_externo";
  const a = doEnsaio ?? "pendente";
  const b = daPendencia ?? "pendente";
  return ORDEM[b] > ORDEM[a] ? b : a;
}

const PARA_PENDENCIA: Record<EtapaLaudo, StatusPendencia> = {
  pendente: "pendente",
  em_digitacao: "em_digitacao",
  aguardando_verificacao: "digitado",
  aguardando_aprovacao: "verificado",
  aprovado: "aprovado",
  concluido_externo: "concluido_externo",
};

/** Etapa → status no vocabulário gravado nas pendências (`digitado`, `verificado`...). */
export function etapaParaPendencia(etapa: EtapaLaudo): StatusPendencia {
  return PARA_PENDENCIA[etapa];
}

/** Status de pendência → etapa. */
export function pendenciaParaEtapa(status: StatusPendencia): EtapaLaudo {
  return normalizarEtapa(status) ?? "em_digitacao";
}
