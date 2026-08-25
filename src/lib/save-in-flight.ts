/**
 * Rastreador global de gravações em andamento (rascunho salvando no Drive,
 * geração/sincronização de versão em PDF, etc). Usado para avisar e bloquear
 * a saída da página enquanto ainda há uma gravação pendente, evitando perda
 * de dados digitados.
 */
import { useSyncExternalStore } from "react";

const activeSaves = new Set<string>();
const listeners = new Set<() => void>();
let seq = 0;

function notify() {
  listeners.forEach((l) => l());
}

export function beginSave(): string {
  const token = `save_${++seq}`;
  activeSaves.add(token);
  notify();
  return token;
}

export function endSave(token: string): void {
  if (activeSaves.delete(token)) notify();
}

export function isSavingInFlight(): boolean {
  return activeSaves.size > 0;
}

/** Envolve uma promise, marcando sua execução como "salvando" para o bloqueio de saída da página. */
export async function trackSave<T>(fn: () => Promise<T>): Promise<T> {
  const token = beginSave();
  try {
    return await fn();
  } finally {
    endSave(token);
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useIsSavingInFlight(): boolean {
  return useSyncExternalStore(subscribe, isSavingInFlight, () => false);
}
