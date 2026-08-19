/**
 * Persistência unificada (localStorage + Supabase em nuvem) do rascunho de trabalho do ensaio Triaxial CID.
 * Guarda o estado editável (sample, specimens, adjust, axisCfg, aba, CP selecionado)
 * por escopo (`ensaio.id` ou "local") sincronizando em tempo real entre todas as máquinas.
 */
import type { TriaxialSample, TriaxialSpecimen } from "./types";
import { saveSharedDraft, loadSharedDraft } from "@/lib/draft.functions";

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

const saveTimers = new Map<string, any>();

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
  const payload = { ...draft, savedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(KEY(scopeId), JSON.stringify(payload));
  } catch {}

  // Sincroniza em nuvem no Supabase
  if (saveTimers.has(scopeId)) {
    clearTimeout(saveTimers.get(scopeId));
  }
  const timer = setTimeout(() => {
    saveTimers.delete(scopeId);
    saveSharedDraft({ data: { scopeId, payload } }).catch((err) => {
      console.warn("[Triaxial saveSharedDraft] Falha na sincronização em nuvem:", err);
    });
  }, 400);
  saveTimers.set(scopeId, timer);
}

export async function fetchRemoteTriaxialDraft(
  scopeId: string,
  opts?: { osNum?: string; amCode?: string; ensaioTipo?: string },
): Promise<Partial<TriaxialDraft> | null> {
  try {
    const res = await loadSharedDraft({
      data: {
        scopeId,
        osNum: opts?.osNum,
        amCode: opts?.amCode,
        ensaioTipo: opts?.ensaioTipo || "triaxial-cid",
      },
    });
    if (res?.success && res.payload) {
      try {
        window.localStorage.setItem(KEY(scopeId), JSON.stringify(res.payload));
      } catch {}
      return res.payload as Partial<TriaxialDraft>;
    }
  } catch (err) {
    console.warn("[Triaxial fetchRemoteDraft] Falha ao carregar rascunho remoto:", err);
  }
  return null;
}

export function clearDraft(scopeId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY(scopeId));
  } catch {}
}