import * as React from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/**
 * PageHeader — estilo Portal Aura.
 * Eyebrow (breadcrumb curto, uppercase espaçado) + título grande + subtítulo.
 * Slot "actions" à direita para botões e filtros de contexto.
 */
export function PageHeader({
  eyebrow,
  icon: Icon,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-4 flex-wrap",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80 flex items-center gap-1.5">
            {Icon && <Icon className="h-3 w-3" />}
            {eyebrow}
          </div>
        )}
        <h1 className="text-xl sm:text-2xl md:text-[32px] font-bold tracking-tight mt-1 truncate">
          {title}
        </h1>
        {description && (
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
          {actions}
        </div>
      )}
    </header>
  );
}