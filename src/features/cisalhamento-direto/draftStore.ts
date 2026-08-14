/**
 * Persistência local (localStorage) do rascunho de trabalho do ensaio Cisalhamento Direto (CD).
 * Guarda o estado editável (sample, specimens, tab, selectedCpId)
 * por escopo (`ensaio.id` ou "local") para que edições sobrevivam à navegação.
 */
import type { CDSample, CDSpecimen } from "./types";

const KEY = (scopeId: string) => `cisalhamento-direto:draft:${scopeId}`;

export type CDDraft = {
  sample: CDSample;
  specimens: CDSpecimen[];
  selectedCpId: string;
  tab: string;
  savedAt: string;
};

export function loadDraft(scopeId: string): Partial<CDDraft> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY(scopeId));
    if (!raw) return null;
    return JSON.parse(raw) as Partial<CDDraft>;
  } catch {
    return null;
  }
}

export function saveDraft(scopeId: string, draft: Partial<CDDraft>): void {
  if (typeof window === "undefined") return;
  try {
    const payload = { ...draft, savedAt: new Date().toISOString() };
    window.localStorage.setItem(KEY(scopeId), JSON.stringify(payload));
  } catch {
    // Ignora erros (quota / modo privado).
  }
}

export function clearDraft(scopeId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY(scopeId));
  } catch {
    // noop
  }
}
