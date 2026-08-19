/**
 * Persistência unificada (localStorage + Supabase em nuvem) do rascunho de trabalho do ensaio Cisalhamento Direto (CD).
 * Guarda o estado editável (sample, specimens, tab, selectedCpId, adjust, axisCfg)
 * por escopo (`ensaio.id` ou "local") sincronizando em tempo real entre todas as máquinas.
 */
import type { CDSample, CDSpecimen, CDAxisCfg } from "./types";
import { saveSharedDraft, loadSharedDraft } from "@/lib/draft.functions";

const KEY = (scopeId: string) => `cisalhamento-direto:draft:${scopeId}`;

export type CDDraft = {
  sample: CDSample;
  specimens: CDSpecimen[];
  selectedCpId: string;
  tab: string;
  adjust?: any;
  axisCfg?: CDAxisCfg;
  photos?: any[];
  savedAt: string;
};

const saveTimers = new Map<string, any>();

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
  const payload = { ...draft, savedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(KEY(scopeId), JSON.stringify(payload));
  } catch {}

  // Sincroniza em segundo plano com a nuvem (Supabase)
  if (saveTimers.has(scopeId)) {
    clearTimeout(saveTimers.get(scopeId));
  }
  const timer = setTimeout(() => {
    saveTimers.delete(scopeId);
    saveSharedDraft({ data: { scopeId, payload } }).catch((err) => {
      console.warn("[CD saveSharedDraft] Falha na sincronização em nuvem:", err);
    });
  }, 400);
  saveTimers.set(scopeId, timer);
}

export async function fetchRemoteDraft(
  scopeId: string,
  opts?: { osNum?: string; amCode?: string; ensaioTipo?: string },
): Promise<Partial<CDDraft> | null> {
  try {
    const res = await loadSharedDraft({
      data: {
        scopeId,
        osNum: opts?.osNum,
        amCode: opts?.amCode,
        ensaioTipo: opts?.ensaioTipo || "cisalhamento-direto",
      },
    });
    if (res?.success && res.payload) {
      try {
        window.localStorage.setItem(KEY(scopeId), JSON.stringify(res.payload));
      } catch {}
      return res.payload as Partial<CDDraft>;
    }
  } catch (err) {
    console.warn("[CD fetchRemoteDraft] Falha ao carregar rascunho remoto:", err);
  }
  return null;
}

export function clearDraft(scopeId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY(scopeId));
  } catch {}
}

