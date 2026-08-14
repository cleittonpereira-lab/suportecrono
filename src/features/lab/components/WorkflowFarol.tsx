import { cn } from "@/lib/utils";

/**
 * "Farol" (status pill) do fluxo de aprovação do ensaio.
 * Mapeia o `workflow_status` do `lab_index` para uma cor e um rótulo curto.
 */
export type WorkflowStatus =
  | "digitacao"
  | "aguardando_verificacao"
  | "aguardando_aprovacao"
  | "aprovado"
  | "rejeitado"
  // aliases equivalentes vindos de report_approvals.status
  | "pendente_verificacao"
  | "pendente_aprovacao"
  | "rejeitado_verificacao"
  | "verificado"
  | string;

interface FarolInfo {
  label: string;
  dot: string;      // cor da bolinha
  className: string; // wrapper (bg/text/border)
}

export function farolInfo(status: string | null | undefined): FarolInfo {
  const s = (status ?? "digitacao").toLowerCase();
  if (s === "aprovado") {
    return {
      label: "Aprovado",
      dot: "bg-emerald-500",
      className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/40 dark:text-emerald-300",
    };
  }
  if (s === "aguardando_aprovacao" || s === "pendente_aprovacao" || s === "verificado") {
    return {
      label: "Aguardando aprovação",
      dot: "bg-sky-500",
      className: "bg-sky-500/10 text-sky-700 border-sky-500/40 dark:text-sky-300",
    };
  }
  if (s === "aguardando_verificacao" || s === "pendente_verificacao") {
    return {
      label: "Aguardando verificação",
      dot: "bg-amber-500",
      className: "bg-amber-500/10 text-amber-800 border-amber-500/40 dark:text-amber-300",
    };
  }
  if (s === "rejeitado" || s === "rejeitado_verificacao") {
    return {
      label: "Rejeitado",
      dot: "bg-rose-500",
      className: "bg-rose-500/10 text-rose-700 border-rose-500/40 dark:text-rose-300",
    };
  }
  return {
    label: "Em digitação",
    dot: "bg-slate-400",
    className: "bg-slate-500/10 text-slate-700 border-slate-500/40 dark:text-slate-300",
  };
}

export function WorkflowFarol({
  status,
  className,
  size = "sm",
}: {
  status: string | null | undefined;
  className?: string;
  size?: "sm" | "xs";
}) {
  const info = farolInfo(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
        info.className,
        className,
      )}
      title={info.label}
    >
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", info.dot)} />
      {info.label}
    </span>
  );
}