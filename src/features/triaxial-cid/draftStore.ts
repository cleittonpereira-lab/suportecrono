/**
 * Persistência unificada (localStorage + Supabase em nuvem) do rascunho de trabalho do ensaio Triaxial CID.
 * Guarda o estado editável (sample, specimens, adjust, axisCfg, aba, CP selecionado)
 * por escopo (`ensaio.id` ou "local") sincronizando em tempo real com controle de concorrência.
 */
import type { TriaxialSample, TriaxialSpecimen } from "./types";
import { saveSharedDraft, loadSharedDraft } from "@/lib/draft.functions";
import { trackSave } from "@/lib/save-in-flight";
import { toast } from "sonner";

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

export function loadDraft(scopeId: string): Partial<TriaxialDraft> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY(scopeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TriaxialDraft>;
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
  draft: Partial<TriaxialDraft>,
  actor?: { id?: string; name?: string },
): void {
  if (typeof window === "undefined") return;
  const payload = { ...draft, rev: knownRevs.get(scopeId), savedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(KEY(scopeId), JSON.stringify(payload));
  } catch {}

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
    const localRev = loadDraft(scopeId)?.rev;

    const res = await loadSharedDraft({
      data: {
        scopeId,
        osNum: opts?.osNum,
        amCode: opts?.amCode,
        ensaioTipo: opts?.ensaioTipo || "triaxial-cid",
      },
    });
    if (res?.success && res.payload) {
      if (typeof res.rev === "number" && typeof localRev === "number" && res.rev <= localRev) {
        return null;
      }
      if (typeof res.rev === "number") {
        knownRevs.set(scopeId, res.rev);
      }
      const payloadWithRev = { ...(res.payload as object), rev: res.rev } as Partial<TriaxialDraft>;
      try {
        window.localStorage.setItem(KEY(scopeId), JSON.stringify(payloadWithRev));
      } catch {}
      return payloadWithRev;
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