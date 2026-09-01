/**
 * Persistência unificada (localStorage + Supabase em nuvem) do rascunho de trabalho do ensaio
 * de Umidade Natural. Guarda o estado editável (sample) por escopo (`ensaio.id` ou "local")
 * sincronizando em tempo real com controle de concorrência.
 */
import type { UmidadeNaturalSample } from "./types";
import { saveSharedDraft, loadSharedDraft } from "@/lib/draft.functions";
import { trackSave, markDirty, markClean } from "@/lib/save-in-flight";
import { toast } from "sonner";

const KEY = (scopeId: string) => `umidade-natural:draft:${scopeId}`;

export type UNDraft = {
  sample: UmidadeNaturalSample;
  photos?: any[];
  savedAt: string;
  /** Revisão (rev) do servidor em que este rascunho local se baseia. */
  rev?: number;
};

const saveTimers = new Map<string, any>();
const knownRevs = new Map<string, number>();

/** Atualiza só o campo `rev` do rascunho já salvo em localStorage, sem mexer no resto. */
function persistRev(scopeId: string, rev: number): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(KEY(scopeId));
    if (!raw) return;
    const cur = JSON.parse(raw);
    window.localStorage.setItem(KEY(scopeId), JSON.stringify({ ...cur, rev }));
  } catch {}
}

export function loadDraft(scopeId: string): Partial<UNDraft> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY(scopeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UNDraft>;
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
  draft: Partial<UNDraft>,
  actor?: { id?: string; name?: string },
): void {
  if (typeof window === "undefined") return;
  const payload = { ...draft, rev: knownRevs.get(scopeId), savedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(KEY(scopeId), JSON.stringify(payload));
  } catch {}

  markDirty();

  // Sincroniza em segundo plano com a nuvem (Supabase)
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
        console.warn("[UN saveSharedDraft] Falha na sincronização:", err);
      });
  }, 400);
  saveTimers.set(scopeId, timer);
}

/** Roda agora o salvamento do rascunho pendente (sem esperar o debounce) — usado pelo botão "Salvar". */
export async function flushDraft(
  scopeId: string,
  actor?: { id?: string; name?: string },
): Promise<{ conflict?: boolean; success?: boolean; error?: string }> {
  const timer = saveTimers.get(scopeId);
  if (timer) {
    clearTimeout(timer);
    saveTimers.delete(scopeId);
  }
  const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY(scopeId)) : null;
  const payload = raw ? JSON.parse(raw) : null;
  if (!payload) return { success: true };
  const expectedRev = knownRevs.get(scopeId);
  try {
    const res = await trackSave(() =>
      saveSharedDraft({ data: { scopeId, payload, expectedRev, changedBy: actor?.id, changedByName: actor?.name } }),
    );
    if (res.conflict) {
      if (res.currentRev) {
        knownRevs.set(scopeId, res.currentRev);
        persistRev(scopeId, res.currentRev);
      }
      markClean();
      return { conflict: true };
    }
    if (res.success && res.rev) {
      knownRevs.set(scopeId, res.rev);
      persistRev(scopeId, res.rev);
    }
    markClean();
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchRemoteDraft(
  scopeId: string,
  opts?: { osNum?: string; amCode?: string; ensaioTipo?: string },
): Promise<Partial<UNDraft> | null> {
  try {
    const localRev = loadDraft(scopeId)?.rev;

    const res = await loadSharedDraft({
      data: {
        scopeId,
        osNum: opts?.osNum,
        amCode: opts?.amCode,
        ensaioTipo: opts?.ensaioTipo || "umidade-natural",
      },
    });
    if (res?.success && res.payload) {
      if (typeof res.rev === "number" && typeof localRev === "number" && res.rev <= localRev) {
        return null;
      }
      if (typeof res.rev === "number") {
        knownRevs.set(scopeId, res.rev);
      }
      const payloadWithRev = { ...(res.payload as object), rev: res.rev } as Partial<UNDraft>;
      try {
        window.localStorage.setItem(KEY(scopeId), JSON.stringify(payloadWithRev));
      } catch {}
      return payloadWithRev;
    }
  } catch (err) {
    console.warn("[UN fetchRemoteDraft] Falha ao carregar rascunho remoto:", err);
  }
  return null;
}

export function clearDraft(scopeId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY(scopeId));
  } catch {}
}
