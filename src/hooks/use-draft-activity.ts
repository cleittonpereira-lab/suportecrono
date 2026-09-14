import { useCallback, useEffect, useRef, useState } from "react";
import { listDraftHistory } from "@/lib/draft.functions";
import type { DraftHistoryEntry } from "@/lib/lab-entities.functions";
import { aoMudar, definirOnde, tempoRealConectado } from "@/lib/tempo-real";
import { registroDoEnsaio } from "@/lib/sala-logica";

export type DraftActivity = {
  lastSavedAt: string | null;
  lastSavedByName: string | null;
  lastSavedById: string | null;
  history: DraftHistoryEntry[];
  refresh: () => void;
};

/** Com o tempo real conectado, a consulta do histórico vira rede de segurança. */
const INTERVALO_COM_TEMPO_REAL_MS = 120_000;

/**
 * Busca (e atualiza) quem salvou o rascunho deste ensaio pela última vez e
 * quando — usado para mostrar "último salvamento" e para avisar quando outra
 * pessoa mexeu no relatório recentemente.
 *
 * Tempo real (Fase 3): registra que esta aba está com este laudo aberto
 * (presença) e atualiza o histórico assim que outra pessoa salva o ensaio,
 * sem esperar a consulta periódica.
 */
export function useDraftActivity(scopeId: string, pollMs = 20000): DraftActivity {
  const [history, setHistory] = useState<DraftHistoryEntry[]>([]);
  const ultimaConsulta = useRef(0);

  const refresh = useCallback(() => {
    if (!scopeId) return;
    ultimaConsulta.current = Date.now();
    listDraftHistory({ data: { scopeId } })
      .then((res) => setHistory(res.history ?? []))
      .catch(() => {});
  }, [scopeId]);

  useEffect(() => {
    refresh();
    const interval = setInterval(() => {
      if (tempoRealConectado() && Date.now() - ultimaConsulta.current < INTERVALO_COM_TEMPO_REAL_MS) return;
      refresh();
    }, pollMs);
    return () => clearInterval(interval);
  }, [refresh, pollMs]);

  useEffect(() => {
    if (!scopeId) return;
    definirOnde(scopeId);
    return () => definirOnde(null);
  }, [scopeId]);

  useEffect(() => {
    const registro = registroDoEnsaio(scopeId);
    if (!registro) return;
    return aoMudar((docs) => {
      if (docs.some((d) => d.pasta === "lab-ensaios" && d.nome === registro)) refresh();
    });
  }, [scopeId, refresh]);

  const latest = history[0];
  return {
    lastSavedAt: latest?.changedAt ?? null,
    lastSavedByName: latest?.changedByName ?? null,
    lastSavedById: latest?.changedBy ?? null,
    history,
    refresh,
  };
}
