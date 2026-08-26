/**
 * Persistência unificada (localStorage + Supabase em nuvem) do rascunho de trabalho do ensaio
 * de Densidade Aparente (ASF.DAP). Guarda o estado editável (sample) por escopo (`ensaio.id`
 * ou "local") sincronizando em tempo real com controle de concorrência.
 */
import type { AsfDapSample } from "./types";
import { saveSharedDraft, loadSharedDraft } from "@/lib/draft.functions";
import { trackSave, markDirty, markClean } from "@/lib/save-in-flight";
import { toast } from "sonner";

const KEY = (scopeId: string) => `asf-dap:draft:${scopeId}`;

export type ASFDraft = {
  sample: AsfDapSample;
  photos?: any[];
  savedAt: string;
  /** Revisão (rev) do servidor em que este rascunho local se baseia. */
  rev?: number;
};

const saveTimers = new Map<string, any>();
const knownRevs = new Map<string, number>();

function persistRev(scopeId: string, rev: number): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(KEY(scopeId));
    if (!raw) return;
    const cur = JSON.parse(raw);
    window.localStorage.setItem(KEY(scopeId), JSON.stringify({ ...cur, rev }));
  } catch {}
}

export function loadDraft(scopeId: string): Partial<ASFDraft> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY(scopeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ASFDraft>;
    if (typeof parsed.rev === "number" && !knownRevs.has(scopeId)) {
      knownRevs.set(scopeId, parsed.rev);
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(
  scopeId: string,
  draft: Partial<ASFDraft>,
  actor?: { id?: string; name?: string },
): void {
  if (typeof window === "undefined") return;
  const payload = { ...draft, rev: knownRevs.get(scopeId), savedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(KEY(scopeId), JSON.stringify(payload));
  } catch {}

  markDirty();

  if (saveTimers.has(scopeId)) {
    clearTimeout(saveTimers.get(scopeId));
  }
  const timer = setTimeout(() => {
    saveTimers.delete(scopeId);
    const expectedRev = knownRevs.get(scopeId);
    trackSave(() =>
      saveSharedDraft({ data: { scopeId, payload, expectedRev, changedBy: actor?.id, changedByName: actor?.name } }),
    )
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
        markClean();
      })
      .catch((err) => {
        console.warn("[ASF.DAP saveSharedDraft] Falha na sincronização:", err);
      });
  }, 400);
  saveTimers.set(scopeId, timer);
}

export async function fetchRemoteDraft(
  scopeId: string,
  opts?: { osNum?: string; amCode?: string; ensaioTipo?: string },
): Promise<Partial<ASFDraft> | null> {
  try {
    const localRev = loadDraft(scopeId)?.rev;

    const res = await loadSharedDraft({
      data: {
        scopeId,
        osNum: opts?.osNum,
        amCode: opts?.amCode,
        ensaioTipo: opts?.ensaioTipo || "asf-dap",
      },
    });
    if (res?.success && res.payload) {
      if (typeof res.rev === "number" && typeof localRev === "number" && res.rev <= localRev) {
        return null;
      }
      if (typeof res.rev === "number") {
        knownRevs.set(scopeId, res.rev);
      }
      const payloadWithRev = { ...(res.payload as object), rev: res.rev } as Partial<ASFDraft>;
      try {
        window.localStorage.setItem(KEY(scopeId), JSON.stringify(payloadWithRev));
      } catch {}
      return payloadWithRev;
    }
  } catch (err) {
    console.warn("[ASF.DAP fetchRemoteDraft] Falha ao carregar rascunho remoto:", err);
  }
  return null;
}

export function clearDraft(scopeId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY(scopeId));
  } catch {}
}
