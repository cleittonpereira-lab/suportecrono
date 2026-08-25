import { saveSharedDraft, loadSharedDraft } from "@/lib/draft.functions";
import { trackSave } from "@/lib/save-in-flight";
import { toast } from "sonner";

const DRAFT_PREFIX = "suportecrono_oed_draft_";
const saveTimers = new Map<string, any>();
const knownRevs = new Map<string, number>();

/** Atualiza só o campo `rev` do rascunho já salvo em localStorage, sem mexer no resto. */
function persistRev(scopeId: string, rev: number): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${scopeId}`);
    if (!raw) return;
    const cur = JSON.parse(raw);
    localStorage.setItem(`${DRAFT_PREFIX}${scopeId}`, JSON.stringify({ ...cur, rev }));
  } catch {}
}

export function saveOedDraft(scopeId: string, data: any) {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  const payload = { ...data, rev: knownRevs.get(scopeId), savedAt: new Date().toISOString() };
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
    const expectedRev = knownRevs.get(scopeId);
    trackSave(() => saveSharedDraft({ data: { scopeId, payload, expectedRev } }))
      .then((res) => {
        if (res.conflict) {
          toast.warning("Atenção: Relatório alterado em outro computador", {
            description: "Os dados foram atualizados no servidor por outro usuário.",
          });
          if (res.currentRev) {
            knownRevs.set(scopeId, res.currentRev);
            persistRev(scopeId, res.currentRev);
          }
        } else if (res.success && res.rev) {
          knownRevs.set(scopeId, res.rev);
          persistRev(scopeId, res.rev);
        }
      })
      .catch((err) => {
        console.warn("[OED saveSharedDraft] Falha na sincronização em nuvem:", err);
      });
  }, 400);
  saveTimers.set(scopeId, timer);
}

export function loadOedDraft(scopeId: string): any | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  try {
    const item = localStorage.getItem(`${DRAFT_PREFIX}${scopeId}`);
    if (!item) return null;
    const parsed = JSON.parse(item);
    if (typeof parsed?.rev === "number" && !knownRevs.has(scopeId)) {
      knownRevs.set(scopeId, parsed.rev);
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function fetchRemoteOedDraft(
  scopeId: string,
  opts?: { osNum?: string; amCode?: string; ensaioTipo?: string },
): Promise<any | null> {
  try {
    const localRev = loadOedDraft(scopeId)?.rev;

    const res = await loadSharedDraft({
      data: {
        scopeId,
        osNum: opts?.osNum,
        amCode: opts?.amCode,
        ensaioTipo: opts?.ensaioTipo || "adensamento",
      },
    });
    if (res?.success && res.payload) {
      if (typeof res.rev === "number" && typeof localRev === "number" && res.rev <= localRev) {
        return null;
      }
      if (typeof res.rev === "number") {
        knownRevs.set(scopeId, res.rev);
      }
      const payloadWithRev = { ...(res.payload as object), rev: res.rev };
      try {
        localStorage.setItem(`${DRAFT_PREFIX}${scopeId}`, JSON.stringify(payloadWithRev));
      } catch {}
      return payloadWithRev;
    }
  } catch (err) {
    console.warn("[OED fetchRemoteDraft] Falha ao carregar rascunho remoto:", err);
  }
  return null;
}
