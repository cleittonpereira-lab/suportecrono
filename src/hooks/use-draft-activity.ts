import { useCallback, useEffect, useState } from "react";
import { listDraftHistory } from "@/lib/draft.functions";
import type { DraftHistoryEntry } from "@/lib/lab-entities.functions";

export type DraftActivity = {
  lastSavedAt: string | null;
  lastSavedByName: string | null;
  lastSavedById: string | null;
  history: DraftHistoryEntry[];
  refresh: () => void;
};

/**
 * Busca (e atualiza periodicamente) quem salvou o rascunho deste ensaio pela
 * última vez e quando — usado para mostrar "último salvamento" e para avisar
 * quando outra pessoa mexeu no relatório recentemente.
 */
export function useDraftActivity(scopeId: string, pollMs = 20000): DraftActivity {
  const [history, setHistory] = useState<DraftHistoryEntry[]>([]);

  const refresh = useCallback(() => {
    if (!scopeId) return;
    listDraftHistory({ data: { scopeId } })
      .then((res) => setHistory(res.history ?? []))
      .catch(() => {});
  }, [scopeId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, pollMs);
    return () => clearInterval(interval);
  }, [refresh, pollMs]);

  const latest = history[0];
  return {
    lastSavedAt: latest?.changedAt ?? null,
    lastSavedByName: latest?.changedByName ?? null,
    lastSavedById: latest?.changedBy ?? null,
    history,
    refresh,
  };
}
