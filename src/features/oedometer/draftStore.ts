import { saveSharedDraft, loadSharedDraft } from "@/lib/draft.functions";

const DRAFT_PREFIX = "suportecrono_oed_draft_";
const saveTimers = new Map<string, any>();

export function saveOedDraft(scopeId: string, data: any) {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  const payload = { ...data, savedAt: new Date().toISOString() };
  try {
    localStorage.setItem(`${DRAFT_PREFIX}${scopeId}`, JSON.stringify(payload));
  } catch (e) {
    console.warn("Falha ao salvar rascunho de adensamento:", e);
  }

  // Sincroniza em nuvem no Supabase
  if (saveTimers.has(scopeId)) {
    clearTimeout(saveTimers.get(scopeId));
  }
  const timer = setTimeout(() => {
    saveTimers.delete(scopeId);
    saveSharedDraft({ data: { scopeId, payload } }).catch((err) => {
      console.warn("[OED saveSharedDraft] Falha na sincronização em nuvem:", err);
    });
  }, 400);
  saveTimers.set(scopeId, timer);
}

export function loadOedDraft(scopeId: string): any | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  try {
    const item = localStorage.getItem(`${DRAFT_PREFIX}${scopeId}`);
    return item ? JSON.parse(item) : null;
  } catch {
    return null;
  }
}

export async function fetchRemoteOedDraft(scopeId: string): Promise<any | null> {
  try {
    const res = await loadSharedDraft({ data: { scopeId } });
    if (res?.success && res.payload) {
      try {
        localStorage.setItem(`${DRAFT_PREFIX}${scopeId}`, JSON.stringify(res.payload));
      } catch {}
      return res.payload;
    }
  } catch (err) {
    console.warn("[OED fetchRemoteDraft] Falha ao carregar rascunho remoto:", err);
  }
  return null;
}

