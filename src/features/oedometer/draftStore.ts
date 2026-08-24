import { saveSharedDraft, loadSharedDraft } from "@/lib/draft.functions";
import { toast } from "sonner";

const DRAFT_PREFIX = "suportecrono_oed_draft_";
const saveTimers = new Map<string, any>();
const knownRevs = new Map<string, number>();

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
    const expectedRev = knownRevs.get(scopeId);
    saveSharedDraft({ data: { scopeId, payload, expectedRev } })
      .then((res) => {
        if (res.conflict) {
          toast.warning("Atenção: Relatório alterado em outro computador", {
            description: "Os dados foram atualizados no servidor por outro usuário.",
          });
          if (res.currentRev) knownRevs.set(scopeId, res.currentRev);
        } else if (res.success && res.rev) {
          knownRevs.set(scopeId, res.rev);
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
    return item ? JSON.parse(item) : null;
  } catch {
    return null;
  }
}

export async function fetchRemoteOedDraft(
  scopeId: string,
  opts?: { osNum?: string; amCode?: string; ensaioTipo?: string },
): Promise<any | null> {
  try {
    const res = await loadSharedDraft({
      data: {
        scopeId,
        osNum: opts?.osNum,
        amCode: opts?.amCode,
        ensaioTipo: opts?.ensaioTipo || "adensamento",
      },
    });
    if (res?.success && res.payload) {
      if (typeof res.rev === "number") {
        knownRevs.set(scopeId, res.rev);
      }
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
