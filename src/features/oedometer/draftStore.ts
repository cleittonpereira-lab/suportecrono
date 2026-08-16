const DRAFT_PREFIX = "suportecrono_oed_draft_";

export function saveOedDraft(scopeId: string, data: any) {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(`${DRAFT_PREFIX}${scopeId}`, JSON.stringify(data));
  } catch (e) {
    console.warn("Falha ao salvar rascunho de adensamento:", e);
  }
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
