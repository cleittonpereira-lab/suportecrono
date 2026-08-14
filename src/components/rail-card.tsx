import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type RailTone = "amber" | "destructive" | "primary" | "muted";

const RAIL_COLOR: Record<RailTone, string> = {
  amber: "bg-amber-500",
  destructive: "bg-destructive",
  primary: "bg-primary",
  muted: "bg-muted-foreground/30",
};

/**
 * RailCard — cartão com trilho colorido no topo (estilo Portal Aura).
 * Uso em KPIs, listas curtas e seções destacadas em todo o portal.
 */
export function RailCard({
  eyebrow,
  title,
  icon: Icon,
  children,
  footerHref,
  footerLabel,
  onFooterClick,
  tone = "amber",
  className,
  bodyClassName,
}: {
  eyebrow?: string;
  title?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  footerHref?: string;
  footerLabel?: string;
  onFooterClick?: () => void;
  tone?: RailTone;
  className?: string;
  bodyClassName?: string;
}) {
  const footer =
    footerHref && footerLabel ? (
      <Link
        to={footerHref}
        className="border-t px-5 py-2.5 flex items-center justify-between text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition"
      >
        <span>{footerLabel}</span>
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    ) : onFooterClick && footerLabel ? (
      <button
        type="button"
        onClick={onFooterClick}
        className="border-t px-5 py-2.5 flex items-center justify-between text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition"
      >
        <span>{footerLabel}</span>
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    ) : null;

  return (
    <div
      className={cn(
        "relative rounded-xl border bg-card overflow-hidden flex flex-col",
        className,
      )}
    >
      <div className={cn("h-[3px] w-full", RAIL_COLOR[tone])} />
      {(eyebrow || title || Icon) && (
        <div className="flex items-start justify-between px-5 pt-4 pb-1">
          <div className="min-w-0">
            {eyebrow && (
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                {eyebrow}
              </div>
            )}
            {title && (
              <h2 className="text-[15px] font-semibold text-foreground mt-0.5 truncate">
                {title}
              </h2>
            )}
          </div>
          {Icon && (
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>
      )}
      <div className={cn("px-5 py-3 flex-1", bodyClassName)}>{children}</div>
      {footer}
    </div>
  );
}