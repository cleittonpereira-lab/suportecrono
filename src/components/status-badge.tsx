import { STATUS_LABEL, STATUS_PILL, type StatusKey } from "@/lib/status-tokens";
import { cn } from "@/lib/utils";

/**
 * Badge canônico de status. Consome os tokens `.status-pill.status-*`
 * definidos em `src/styles.css`. Use este componente em Gantt, Kanban,
 * tabela de ensaios e qualquer lista que mostre status de programação.
 */
export function StatusBadge({
  status,
  label,
  className,
}: {
  status: StatusKey;
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn(STATUS_PILL[status], className)}>
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}