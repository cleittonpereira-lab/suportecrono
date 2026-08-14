/**
 * Persistência local (localStorage) do rascunho de trabalho do ensaio Triaxial CID.
 * Guarda o estado editável (sample, specimens, adjust, axisCfg, aba, CP selecionado)
 * por escopo (`ensaio.id` ou "local") para que edições sobrevivam à navegação.
 */
import type { TriaxialSample, TriaxialSpecimen } from "./types";

const KEY = (scopeId: string) => `triaxial-cid:draft:${scopeId}`;

export type TriaxialDraft = {
  sample: TriaxialSample;
  specimens: TriaxialSpecimen[];
  selectedCpId: string;
  tab: string;
  adjust: {
    mSobreCP: number;
    espMembrana: number;
    aPistao: number;
    hTopcap: number;
    fAtritoPistao: number;
  };
  axisCfg: Record<string, number>;
  savedAt: string;
};

export function loadDraft(scopeId: string): Partial<TriaxialDraft> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY(scopeId));
    if (!raw) return null;
    return JSON.parse(raw) as Partial<TriaxialDraft>;
  } catch {
    return null;
  }
}

export function saveDraft(scopeId: string, draft: Partial<TriaxialDraft>): void {
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