import React from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, RefreshCw, AlertCircle } from "lucide-react";

export type SyncState = "idle" | "saving" | "synced" | "error";

export function SyncStatusBadge({
  state = "synced",
  lastSavedAt,
  className = "",
}: {
  state?: SyncState;
  lastSavedAt?: string | null;
  className?: string;
}) {
  if (state === "saving") {
    return (
      <Badge
        variant="outline"
        className={`border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 gap-1.5 px-3 py-1 text-xs font-medium animate-pulse ${className}`}
      >
        <RefreshCw className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-amber-400" />
        <span>Salvando alterações na nuvem…</span>
      </Badge>
    );
  }

  if (state === "error") {
    return (
      <Badge
        variant="outline"
        className={`border-destructive/40 bg-destructive/10 text-destructive gap-1.5 px-3 py-1 text-xs font-medium ${className}`}
      >
        <AlertCircle className="h-3.5 w-3.5" />
        <span>Salvo localmente (offline)</span>
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={`border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 gap-1.5 px-3 py-1 text-xs font-semibold shadow-xs ${className}`}
      title={lastSavedAt ? `Última sincronização: ${new Date(lastSavedAt).toLocaleTimeString("pt-BR")}` : "Sincronizado"}
    >
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
      <span>Relatório 100% Sincronizado</span>
    </Badge>
  );
}
