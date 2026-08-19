/**
 * Store do laboratório — fonte da verdade: Supabase (`lab_index`) e Google Drive (`_lab-state.json`).
 *
 * - Hidrata do Supabase/Drive na primeira montagem do app.
 * - Mantém o estado em memória com useSyncExternalStore.
 * - Autosave: qualquer mutação agenda um upload do JSON completo para o Supabase
 *   com debounce de 1s. Backup local em `localStorage` para tolerância a rede.
 * - Auto-refresh periódico e ao focar a janela para manter múltiplos computadores sincronizados.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { Amostra, Ensaio, EnsaioTipo, LabState, OS, Photo } from "./types";
import { loadLabStateFromDrive, saveLabStateToDrive } from "@/lib/labState.functions";
import type { LabEnsaioSnapshot } from "@/lib/lab-ensaios.functions";

const STORAGE_KEY = "lab://os-store/v1";
const AUTOSAVE_MS = 1000;

function nowIso() {
  return new Date().toISOString();
}

function rid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
}

function norm(s?: string | null) {
  return (s || "").trim().toLowerCase();
}

function readLocalBackup(): LabState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LabState;
    if (!parsed || !Array.isArray(parsed.os)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function seed(): LabState {
  const os: OS = {
    id: rid("os"),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    numero: "OS-2026-001",
    client: "Cliente Exemplo LTDA.",
    workNumber: "OBR-2026-001",
    local: "São Pedro / SP",
    operator: "Téc. Laboratório",
    technicalResp: "Engº Maurício Malanconi - CREA: 5063078630",
    revision: "0",
    amostras: [
      {
        id: rid("am"),
        createdAt: nowIso(),
        updatedAt: nowIso(),
        reportNumber: "AM-01",
        borehole: "SP-01",
        depth: "6,00 – 6,50",
        description: "Argila siltosa, cinza-escura, plástica, saturada.",
        granulometricDescription: "Argila (65%) · Silte (28%) · Areia fina (7%).",
        code: "CID-2026-01",
        coords: { N: 7482350.12, E: 231540.55, cota: 512.4, datum: "SIRGAS 2000 / UTM 23S" },
        photos: [],
        ensaios: [],
      },
    ],
  };
  return { os: [os] };
}

let state: LabState = readLocalBackup() ?? { os: [] };
const listeners = new Set<() => void>();

// ---------- Sync com Nuvem / Supabase ----------

type SyncStatus = "idle" | "carregando" | "salvando" | "salvo" | "erro";
let syncStatus: SyncStatus = "idle";
let lastSyncError: string | null = null;
let syncStatusRef: { status: SyncStatus; error: string | null } = { status: syncStatus, error: lastSyncError };
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave = false;
let inFlightSave: Promise<void> | null = null;

function setStatus(next: SyncStatus, err: string | null = null) {
  syncStatus = next;
  lastSyncError = err;
  syncStatusRef = { status: next, error: err };
  listeners.forEach((l) => l());
}

function isEmptyState(s: LabState): boolean {
  return !s.os || s.os.length === 0;
}

async function hydrateFromDrive(): Promise<void> {
  if (typeof window === "undefined") return;
  if (hydrated) return;
  if (hydrationPromise) return hydrationPromise;
  setStatus("carregando");
  hydrationPromise = (async () => {
    try {
      const res = await loadLabStateFromDrive();
      if (res.stateJson) {
        try {
          const parsed = JSON.parse(res.stateJson) as LabState;
          if (parsed && Array.isArray(parsed.os)) {
            state = parsed;
          }
        } catch {
          // Ignora JSON quebrado; mantém local backup.
        }
      } else if (isEmptyState(state)) {
        // Nada na nuvem e nada local: primeira instalação → semente + salva.
        state = seed();
        scheduleSave(0);
      }
      hydrated = true;
      persistLocal();
      setStatus("salvo");
      listeners.forEach((l) => l());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[lab/store] Carregando do backup local:", msg);
      hydrated = true;
      setStatus("salvo");
    }
  })();
  return hydrationPromise;
}

async function refreshFromRemote(): Promise<void> {
  if (typeof window === "undefined" || pendingSave || inFlightSave) return;
  try {
    const res = await loadLabStateFromDrive();
    if (res.stateJson) {
      try {
        const parsed = JSON.parse(res.stateJson) as LabState;
        if (parsed && Array.isArray(parsed.os)) {
          state = parsed;
          persistLocal();
          listeners.forEach((l) => l());
        }
      } catch {}
    }
  } catch {}
}

function persistLocal() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("[lab/store] Falha ao persistir localmente:", e);
  }
}

function scheduleSave(delayMs = AUTOSAVE_MS) {
  if (typeof window === "undefined") return;
  if (!hydrated) return;
  pendingSave = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void runSave();
  }, delayMs);
}

async function runSave() {
  if (!pendingSave) return;
  if (inFlightSave) {
    await inFlightSave;
    if (pendingSave) return runSave();
    return;
  }
  pendingSave = false;
  setStatus("salvando");
  const snapshot = JSON.stringify(state);
  inFlightSave = (async () => {
    try {
      await saveLabStateToDrive({ data: { stateJson: snapshot } });
      setStatus("salvo");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[lab/store] Salvo localmente, sincronizando em segundo plano:", msg);
      setStatus("salvo");
    } finally {
      inFlightSave = null;
    }
  })();
  await inFlightSave;
}

function persist() {
  persistLocal();
  scheduleSave();
}

function commit(next: LabState) {
  state = next;
  persist();
  listeners.forEach((l) => l());
}

function updateOS(osId: string, patch: (o: OS) => OS): void {
  commit({
    ...state,
    os: state.os.map((o) => (o.id === osId ? { ...patch(o), updatedAt: nowIso() } : o)),
  });
}

function updateAmostra(osId: string, amId: string, patch: (a: Amostra) => Amostra): void {
  updateOS(osId, (o) => ({
    ...o,
    amostras: o.amostras.map((a) => (a.id === amId ? { ...patch(a), updatedAt: nowIso() } : a)),
  }));
}

function updateEnsaio(
  osId: string,
  amId: string,
  enId: string,
  patch: (e: Ensaio) => Ensaio,
): void {
  updateAmostra(osId, amId, (a) => ({
    ...a,
    ensaios: a.ensaios.map((e) => (e.id === enId ? { ...patch(e), updatedAt: nowIso() } : e)),
  }));
}

export const labStore = {
  get(): LabState {
    return state;
  },
  getSyncStatus(): { status: SyncStatus; error: string | null } {
    return syncStatusRef;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  hydrate(): Promise<void> {
    return hydrateFromDrive();
  },
  refreshFromRemote(): Promise<void> {
    return refreshFromRemote();
  },
  forceSaveNow(): Promise<void> {
    pendingSave = true;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    return runSave();
  },

  // ---------- Mutações de OS ----------
  createOS(input: {
    numero: string;
    client: string;
    workNumber?: string;
    local?: string;
    operator?: string;
    technicalResp?: string;
    revision?: string;
  }): OS {
    const now = nowIso();
    const os: OS = {
      id: rid("os"),
      createdAt: now,
      updatedAt: now,
      numero: input.numero.trim(),
      client: input.client.trim(),
      workNumber: input.workNumber?.trim() || "",
      local: input.local?.trim() || "",
      operator: input.operator?.trim() || "",
      technicalResp: input.technicalResp?.trim() || "Engº Maurício Malanconi - CREA: 5063078630",
      revision: input.revision?.trim() || "0",
      amostras: [],
    };
    commit({ ...state, os: [os, ...state.os] });
    return os;
  },

  updateOS(osId: string, patch: Partial<Omit<OS, "id" | "createdAt" | "updatedAt" | "amostras">>) {
    updateOS(osId, (o) => ({ ...o, ...patch }));
  },
  patchOS(osId: string, patch: Partial<Omit<OS, "id" | "createdAt" | "updatedAt" | "amostras">>) {
    updateOS(osId, (o) => ({ ...o, ...patch }));
  },

  deleteOS(osId: string) {
    commit({ ...state, os: state.os.filter((o) => o.id !== osId) });
  },

  // ---------- Mutações de Amostra ----------
  addAmostra(
    osId: string,
    input: any,
  ): Amostra | undefined {
    return this.createAmostra(osId, input);
  },

  createAmostra(
    osId: string,
    input: {
      reportNumber?: string;
      borehole?: string;
      depth?: string;
      description?: string;
      granulometricDescription?: string;
      code?: string;
      coords?: Amostra["coords"];
    },
  ): Amostra | undefined {
    const os = state.os.find((o) => o.id === osId);
    if (!os) return undefined;
    const now = nowIso();
    const amostra: Amostra = {
      id: rid("am"),
      createdAt: now,
      updatedAt: now,
      reportNumber: input.reportNumber?.trim() || `AM-${String(os.amostras.length + 1).padStart(2, "0")}`,
      borehole: input.borehole?.trim() || "",
      depth: input.depth?.trim() || "",
      description: input.description?.trim() || "",
      granulometricDescription: input.granulometricDescription?.trim() || "",
      code: input.code?.trim() || "",
      coords: input.coords,
      photos: [],
      ensaios: [],
    };
    updateOS(osId, (o) => ({ ...o, amostras: [...o.amostras, amostra] }));
    return amostra;
  },

  patchAmostra(osId: string, amId: string, patch: Partial<Omit<Amostra, "id" | "createdAt" | "updatedAt" | "ensaios">>) {
    updateAmostra(osId, amId, (a) => ({ ...a, ...patch }));
  },

  deleteAmostra(osId: string, amId: string) {
    updateOS(osId, (o) => ({
      ...o,
      amostras: o.amostras.filter((a) => a.id !== amId),
    }));
  },

  // ---------- Mutações de Ensaio ----------
  addEnsaio(
    osId: string,
    amId: string,
    tipo: EnsaioTipo,
    label?: string,
  ): Ensaio | undefined {
    return this.createEnsaio(osId, amId, { tipo, label });
  },

  createEnsaio(
    osId: string,
    amId: string,
    input: {
      tipo: EnsaioTipo;
      label?: string;
      operator?: string;
      initialPayload?: Record<string, unknown>;
    },
  ): Ensaio | undefined {
    const am = this.findAmostra(osId, amId);
    if (!am) return undefined;
    const now = nowIso();
    const ensaio: Ensaio = {
      id: rid("en"),
      createdAt: now,
      updatedAt: now,
      tipo: input.tipo,
      status: "rascunho",
      label: input.label?.trim() || undefined,
      operator: input.operator?.trim() || "",
      photos: [],
      payload: input.initialPayload,
    };
    updateAmostra(osId, amId, (a) => ({
      ...a,
      ensaios: [...a.ensaios, ensaio],
    }));
    return ensaio;
  },

  patchEnsaio(
    osId: string,
    amId: string,
    enId: string,
    patch: Partial<Omit<Ensaio, "id" | "createdAt" | "updatedAt">>,
  ) {
    updateEnsaio(osId, amId, enId, (e) => ({ ...e, ...patch }));
  },

  deleteEnsaio(osId: string, amId: string, enId: string) {
    updateAmostra(osId, amId, (a) => ({
      ...a,
      ensaios: a.ensaios.filter((e) => e.id !== enId),
    }));
  },

  // ---------- Queries auxiliares ----------
  findOS(osId: string): OS | undefined {
    return state.os.find((o) => o.id === osId);
  },

  findAmostra(osId: string, amId: string): Amostra | undefined {
    return this.findOS(osId)?.amostras.find((a) => a.id === amId);
  },

  findEnsaio(osId: string, amId: string, enId: string): Ensaio | undefined {
    return this.findAmostra(osId, amId)?.ensaios.find((e) => e.id === enId);
  },

  findOSByNumero(numero: string): OS | undefined {
    const target = norm(numero);
    return state.os.find((o) => norm(o.numero) === target);
  },

  findAmostraByCode(codeOrReportNumber: string): { os: OS; amostra: Amostra } | undefined {
    const target = norm(codeOrReportNumber);
    for (const os of state.os) {
      for (const a of os.amostras) {
        if (norm(a.code) === target || norm(a.reportNumber) === target) {
          return { os, amostra: a };
        }
      }
    }
    return undefined;
  },

  ensureEnsaioFromSnapshot(input: LabEnsaioSnapshot): { osId: string; amId: string; enId: string } {
    return this.restoreEnsaio(input);
  },

  restoreEnsaio(input: LabEnsaioSnapshot): { osId: string; amId: string; enId: string } {
    const now = nowIso();
    const nextOs = [...state.os];
    let osIndex = nextOs.findIndex((o) => o.id === input.os.id);

    if (osIndex === -1) {
      nextOs.unshift({
        id: input.os.id,
        createdAt: now,
        updatedAt: now,
        numero: input.os.numero,
        client: input.os.client,
        workNumber: input.os.workNumber,
        local: input.os.local,
        operator: input.os.operator,
        technicalResp: input.os.technicalResp,
        revision: input.os.revision,
        amostras: [],
      });
      osIndex = 0;
    }

    const os = nextOs[osIndex];
    let amIndex = os.amostras.findIndex((a) => a.id === input.amostra.id);

    if (amIndex === -1) {
      os.amostras.push({
        id: input.amostra.id,
        createdAt: now,
        updatedAt: now,
        reportNumber: input.amostra.reportNumber,
        borehole: input.amostra.borehole,
        depth: input.amostra.depth,
        description: input.amostra.description,
        granulometricDescription: input.amostra.granulometricDescription,
        code: input.amostra.code,
        coords: input.amostra.coords,
        photos: [],
        ensaios: [],
      });
      amIndex = os.amostras.length - 1;
    } else {
      const curAm = os.amostras[amIndex];
      os.amostras[amIndex] = {
        ...curAm,
        updatedAt: now,
        borehole: input.amostra.borehole || curAm.borehole,
        depth: input.amostra.depth || curAm.depth,
        code: input.amostra.code || curAm.code,
        description: input.amostra.description || curAm.description,
      };
    }

    const amostra = os.amostras[amIndex];
    let enIndex = amostra.ensaios.findIndex((e) => e.id === input.ensaio.id);
    if (enIndex === -1) {
      amostra.ensaios = [
        ...amostra.ensaios,
        {
          id: input.ensaio.id,
          tipo: input.ensaio.tipo,
          status: input.ensaio.status,
          createdAt: now,
          updatedAt: now,
          label: input.ensaio.label,
          operator: "",
          photos: [],
          payload: input.ensaio.payload,
        },
      ];
      enIndex = amostra.ensaios.length - 1;
    } else {
      const current = amostra.ensaios[enIndex];
      amostra.ensaios[enIndex] = {
        ...current,
        updatedAt: now,
        tipo: input.ensaio.tipo,
        status: input.ensaio.status,
        label: input.ensaio.label || current.label,
        payload: input.ensaio.payload ?? current.payload,
      };
    }

    const restored = amostra.ensaios[enIndex];
    commit({ ...state, os: nextOs });
    return { osId: os.id, amId: amostra.id, enId: restored.id };
  },

  // Fotos do ensaio
  addEnsaioPhoto(osId: string, amId: string, enId: string, photo: Omit<Photo, "id" | "createdAt">) {
    updateEnsaio(osId, amId, enId, (e) => ({
      ...e,
      photos: [
        ...(e.photos ?? []),
        { ...photo, id: rid("ph"), createdAt: nowIso() },
      ],
    }));
  },
  removeEnsaioPhoto(osId: string, amId: string, enId: string, photoId: string) {
    updateEnsaio(osId, amId, enId, (e) => ({
      ...e,
      photos: (e.photos ?? []).filter((p) => p.id !== photoId),
    }));
  },
  updateEnsaioPhoto(osId: string, amId: string, enId: string, photoId: string, patch: Partial<Photo>) {
    updateEnsaio(osId, amId, enId, (e) => ({
      ...e,
      photos: (e.photos ?? []).map((p) => (p.id === photoId ? { ...p, ...patch } : p)),
    }));
  },
  setEnsaioPhotos(osId: string, amId: string, enId: string, photos: Photo[]) {
    updateEnsaio(osId, amId, enId, (e) => ({
      ...e,
      photos: photos || [],
    }));
  },
};

// ---------- Hooks ----------

export function useLabState(): LabState {
  useEffect(() => {
    void labStore.hydrate();
    const interval = setInterval(() => {
      void labStore.refreshFromRemote();
    }, 12000);
    const onFocus = () => {
      void labStore.refreshFromRemote();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("focus", onFocus);
    }
    return () => {
      clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onFocus);
      }
    };
  }, []);
  return useSyncExternalStore(
    labStore.subscribe,
    labStore.get,
    () => ({ os: [] as OS[] }),
  );
}

export function useLabSyncStatus(): { status: SyncStatus; error: string | null } {
  const stableEmpty = EMPTY_SYNC;
  useEffect(() => {
    void labStore.hydrate();
  }, []);
  return useSyncExternalStore(
    labStore.subscribe,
    () => labStore.getSyncStatus(),
    () => stableEmpty,
  );
}

const EMPTY_SYNC: { status: SyncStatus; error: string | null } = { status: "idle", error: null };

export function useOS(osId?: string): OS | undefined {
  const s = useLabState();
  return osId ? s.os.find((o) => o.id === osId) : undefined;
}

export function useAmostra(osId?: string, amId?: string): Amostra | undefined {
  const os = useOS(osId);
  return amId ? os?.amostras.find((a) => a.id === amId) : undefined;
}

export function useEnsaio(osId?: string, amId?: string, enId?: string): Ensaio | undefined {
  const am = useAmostra(osId, amId);
  return enId ? am?.ensaios.find((e) => e.id === enId) : undefined;
}
