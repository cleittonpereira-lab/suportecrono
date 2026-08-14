/**
 * Tokens canônicos de status para Programação/Gantt/Kanban/Tabela.
 * Fonte única de verdade — reutilizada em todas as telas.
 *
 * Paleta:
 *  - pendente   = cinza  (sem programação)
 *  - programado = azul   (planejado, ainda não iniciou)
 *  - execucao   = âmbar  (em andamento — cor da marca)
 *  - atrasado   = vermelho (não iniciou/passou do previsto)
 *  - concluido  = verde
 */
export type StatusKey =
  | "pendente"
  | "programado"
  | "execucao"
  | "atrasado"
  | "concluido";

export const STATUS_LABEL: Record<StatusKey, string> = {
  pendente: "Pendente",
  programado: "Programado",
  execucao: "Em execução",
  atrasado: "Atrasado",
  concluido: "Concluído",
};

/** Classes utilitárias (definidas em src/styles.css) */
export const STATUS_PILL: Record<StatusKey, string> = {
  pendente: "status-pill status-pendente",
  programado: "status-pill status-programado",
  execucao: "status-pill status-execucao",
  atrasado: "status-pill status-atrasado",
  concluido: "status-pill status-concluido",
};

/** Cor sólida (Gantt bars, dots, borders) */
export const STATUS_BAR: Record<StatusKey, string> = {
  pendente: "status-bar-pendente",
  programado: "status-bar-programado",
  execucao: "status-bar-execucao",
  atrasado: "status-bar-atrasado",
  concluido: "status-bar-concluido",
};

/**
 * Normaliza os vários status espalhados pelo app (planejado, em_execucao,
 * concluido, pendente, atrasado, aguardando, etc.) para uma StatusKey.
 * Aceita também metadados: `fimReal`, `inicioReal`, `prazo` para inferir
 * "atrasado" quando o app só marca "planejado" mas a data já passou.
 */
export function normalizeStatus(
  raw: string | undefined | null,
  ctx?: { prazo?: Date | string | null; hoje?: Date },
): StatusKey {
  const s = (raw || "").trim().toLowerCase();
  if (s === "concluido" || s === "concluído" || s === "finalizado") return "concluido";
  if (s === "em_execucao" || s === "em execucao" || s === "em execução" || s === "em_andamento" || s === "andamento") return "execucao";
  if (s === "atrasado") return "atrasado";
  if (s === "planejado" || s === "programado" || s === "aguardando") {
    // Se passou do prazo e ainda não iniciou → atrasado.
    if (ctx?.prazo) {
      const prazo = ctx.prazo instanceof Date ? ctx.prazo : new Date(ctx.prazo);
      const hoje = ctx.hoje ?? new Date();
      if (!isNaN(prazo.getTime()) && prazo.getTime() < hoje.getTime()) return "atrasado";
    }
    return "programado";
  }
  return "pendente";
}