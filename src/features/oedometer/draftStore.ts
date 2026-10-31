import { saveSharedDraft, loadSharedDraft } from "@/lib/draft.functions";
import { semConteudoDasFotos } from "@/lib/fotos-do-rascunho";
import { trackSave, markDirty, markClean } from "@/lib/save-in-flight";
import { falhaDaGravacao } from "@/lib/falha-da-gravacao";
import { toast } from "sonner";

const DRAFT_PREFIX = "suportecrono_oed_draft_";
const saveTimers = new Map<string, any>();
const knownRevs = new Map<string, number>();
/**
 * Último rascunho deste escopo, em memória. O botão Salvar (flush) relia o
 * localStorage — que, cheio (dados brutos grandes), guardava a cópia ANTIGA:
 * era ela que ia para o servidor por cima da edição.
 */
const ultimoPayload = new Map<string, unknown>();

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

export function saveOedDraft(scopeId: string, data: any, actor?: { id?: string; name?: string }) {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  const payload = semConteudoDasFotos({ ...data, rev: knownRevs.get(scopeId), savedAt: new Date().toISOString() });
  ultimoPayload.set(scopeId, payload);
  try {
    localStorage.setItem(`${DRAFT_PREFIX}${scopeId}`, JSON.stringify(payload));
  } catch (e) {
    // Sem espaço: a cópia antiga não pode ficar para o próximo carregamento (ver ultimoPayload).
    try {
      localStorage.removeItem(`${DRAFT_PREFIX}${scopeId}`);
    } catch {}
    console.warn("Falha ao salvar rascunho de adensamento:", e);
  }

  markDirty();

  // Sincroniza em nuvem no Supabase
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
        const falha = falhaDaGravacao(res);
        if (falha) {
          // Continua "não salvo" (sem markClean): o indicador não pode dizer sincronizado.
          toast.error("Rascunho não salvo no servidor: " + falha, { id: `rascunho:${scopeId}` });
          return;
        }
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

/** Roda agora o salvamento do rascunho pendente (sem esperar o debounce) — usado pelo botão "Salvar". */
export async function flushOedDraft(
  scopeId: string,
  actor?: { id?: string; name?: string },
): Promise<{ conflict?: boolean; success?: boolean; error?: string }> {
  const timer = saveTimers.get(scopeId);
  if (timer) {
    clearTimeout(timer);
    saveTimers.delete(scopeId);
  }
  const raw = typeof window !== "undefined" && typeof localStorage !== "undefined" ? localStorage.getItem(`${DRAFT_PREFIX}${scopeId}`) : null;
  const payload = ultimoPayload.get(scopeId) ?? (raw ? JSON.parse(raw) : null);
  if (!payload) return { success: true };
  const expectedRev = knownRevs.get(scopeId);
  try {
    const res = await trackSave(() =>
      saveSharedDraft({ data: { scopeId, payload, expectedRev, changedBy: actor?.id, changedByName: actor?.name } }),
    );
    const falha = falhaDaGravacao(res);
    if (falha) return { error: falha };
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
