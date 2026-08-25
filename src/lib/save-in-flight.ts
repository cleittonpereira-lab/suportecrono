/**
 * Rastreador global de gravações em andamento (rascunho salvando no Drive,
 * geração/sincronização de versão em PDF, etc) e de alterações ainda não
 * confirmadas como salvas ("dirty"). Usado para avisar/bloquear a saída da
 * página só quando realmente há algo não salvo — não a cada gravação em
 * segundo plano, que é silenciosa por design.
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

// ---------- "Dirty" (há edição ainda não confirmada como salva) ----------

let dirty = false;
const dirtyListeners = new Set<() => void>();

function notifyDirty() {
  dirtyListeners.forEach((l) => l());
}

/** Chamado quando o usuário edita algo e uma gravação foi agendada (ainda não confirmada). */
export function markDirty(): void {
  if (!dirty) {
    dirty = true;
    notifyDirty();
  }
}

/** Chamado quando a última gravação agendada terminou com sucesso. */
export function markClean(): void {
  if (dirty) {
    dirty = false;
    notifyDirty();
  }
}

export function isDirty(): boolean {
  return dirty;
}

function subscribeDirty(listener: () => void): () => void {
  dirtyListeners.add(listener);
  return () => dirtyListeners.delete(listener);
}

export function useIsDirty(): boolean {
  return useSyncExternalStore(subscribeDirty, isDirty, () => false);
}

/** Espera até não haver mais edição pendente nem gravação em voo (ou até o tempo limite). */
export function waitUntilSaved(timeoutMs = 6000): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (!isDirty() && !isSavingInFlight()) {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, 150);
    };
    check();
  });
}
