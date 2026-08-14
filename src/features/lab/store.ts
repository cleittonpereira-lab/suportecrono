/**
 * Store do laboratório — fonte da verdade: Google Drive (`_lab-state.json`).
 *
 * - Hidrata do Drive na primeira montagem do app (uma chamada de servidor).
 * - Mantém o estado em memória com useSyncExternalStore (API igual à anterior).
 * - Autosave: qualquer mutação agenda um upload do JSON completo para o Drive
 *   com debounce de 1s. Backup local em `localStorage` para tolerância a rede.
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
    technicalResp: "Engº Maurício Silva · CREA-SP 000000",
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

// ---------- Sync com Google Drive ----------

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
        // Nada no Drive e nada local: primeira instalação → semente + salva.
        state = seed();
        scheduleSave(0);
      }
      hydrated = true;
      persistLocal();
      setStatus("salvo");
      listeners.forEach((l) => l());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[lab/store] Falha ao carregar do Drive:", msg);
      setStatus("erro", msg);
    }
  })();
  return hydrationPromise;
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
  if (!hydrated) return; // não sobrescreve Drive antes de carregar
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
    // já existe upload em curso — enfileira para depois
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
      console.error("[lab/store] Falha ao salvar no Drive:", msg);
      setStatus("erro", msg);
      // reagenda com backoff
      pendingSave = true;
      setTimeout(() => void runSave(), 5000);
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

function updateEnsaio(osId: string, amId: string, enId: string, patch: (e: Ensaio) => Ensaio): void {
  updateAmostra(osId, amId, (a) => ({
    ...a,
    ensaios: a.ensaios.map((e) => (e.id === enId ? { ...patch(e), updatedAt: nowIso() } : e)),
  }));
}

// ---------- API pública ----------

export const labStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  hydrate: hydrateFromDrive,
  getSyncStatus(): { status: SyncStatus; error: string | null } {
    return syncStatusRef;
  },
  async syncNow() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    pendingSave = true;
    await runSave();
  },

  // OS
  createOS(input?: Partial<Omit<OS, "id" | "createdAt" | "updatedAt" | "amostras">>): OS {
    const os: OS = {
      id: rid("os"),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      numero: input?.numero ?? `OS-${new Date().getFullYear()}-${String(state.os.length + 1).padStart(3, "0")}`,
      client: input?.client ?? "",
      workNumber: input?.workNumber ?? "",
      local: input?.local ?? "",
      operator: input?.operator ?? "",
      technicalResp: input?.technicalResp ?? "",
      revision: input?.revision ?? "0",
      amostras: [],
    };
    commit({ ...state, os: [os, ...state.os] });
    return os;
  },
  patchOS(osId: string, patch: Partial<OS>) {
    updateOS(osId, (o) => ({ ...o, ...patch }));
  },
  deleteOS(osId: string) {
    commit({ ...state, os: state.os.filter((o) => o.id !== osId) });
  },

  // Amostra
  addAmostra(osId: string, input?: Partial<Amostra>): Amostra {
    const am: Amostra = {
      id: rid("am"),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      reportNumber: input?.reportNumber ?? "",
      borehole: input?.borehole ?? "",
      depth: input?.depth ?? "",
      description: input?.description ?? "",
      granulometricDescription: input?.granulometricDescription ?? "",
      code: input?.code ?? "",
      coords: input?.coords,
      photos: [],
      ensaios: [],
    };
    updateOS(osId, (o) => ({ ...o, amostras: [...o.amostras, am] }));
    return am;
  },
  patchAmostra(osId: string, amId: string, patch: Partial<Amostra>) {
    updateAmostra(osId, amId, (a) => ({ ...a, ...patch }));
  },
  deleteAmostra(osId: string, amId: string) {
    updateOS(osId, (o) => ({ ...o, amostras: o.amostras.filter((a) => a.id !== amId) }));
  },

  // Fotos
  addPhoto(osId: string, amId: string, photo: Omit<Photo, "id" | "createdAt">) {
    updateAmostra(osId, amId, (a) => ({
      ...a,
      photos: [
        ...a.photos,
        { ...photo, id: rid("ph"), createdAt: nowIso() },
      ],
    }));
  },
  removePhoto(osId: string, amId: string, photoId: string) {
    updateAmostra(osId, amId, (a) => ({ ...a, photos: a.photos.filter((p) => p.id !== photoId) }));
  },
  updatePhoto(osId: string, amId: string, photoId: string, patch: Partial<Photo>) {
    updateAmostra(osId, amId, (a) => ({
      ...a,
      photos: a.photos.map((p) => (p.id === photoId ? { ...p, ...patch } : p)),
    }));
  },

  // Ensaio
  addEnsaio(osId: string, amId: string, tipo: EnsaioTipo, label?: string): Ensaio {
    const en: Ensaio = {
      id: rid("en"),
      tipo,
      status: "rascunho",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      label,
      operator: "",
      photos: [],
    };
    updateAmostra(osId, amId, (a) => ({ ...a, ensaios: [...a.ensaios, en] }));
    return en;
  },
  patchEnsaio(osId: string, amId: string, enId: string, patch: Partial<Ensaio>) {
    updateEnsaio(osId, amId, enId, (e) => ({ ...e, ...patch }));
  },
  deleteEnsaio(osId: string, amId: string, enId: string) {
    updateAmostra(osId, amId, (a) => ({ ...a, ensaios: a.ensaios.filter((e) => e.id !== enId) }));
  },

  ensureEnsaioFromSnapshot(input: LabEnsaioSnapshot) {
    const now = nowIso();
    const nextOs = state.os.map((o) => ({
      ...o,
      amostras: o.amostras.map((a) => ({
        ...a,
        photos: [...a.photos],
        ensaios: a.ensaios.map((e) => ({ ...e, photos: [...(e.photos ?? [])] })),
      })),
    }));

    let osIndex = nextOs.findIndex((o) => o.id === input.os.id);
    if (osIndex === -1) {
      nextOs.unshift({
        id: input.os.id,
        createdAt: now,
        updatedAt: now,
        numero: input.os.numero,
        client: input.os.client ?? "",
        workNumber: input.os.workNumber ?? "",
        local: input.os.local ?? "",
        operator: "",
        technicalResp: "",
        revision: "0",
        amostras: [],
      });
      osIndex = 0;
    } else {
      const current = nextOs[osIndex];
      nextOs[osIndex] = {
        ...current,
        updatedAt: now,
        numero: input.os.numero || current.numero,
        client: input.os.client || current.client,
        workNumber: input.os.workNumber || current.workNumber,
        local: input.os.local || current.local,
      };
    }

    const os = nextOs[osIndex];
    let amIndex = os.amostras.findIndex((a) => a.id === input.amostra.id);
    if (amIndex === -1) {
      os.amostras = [
        ...os.amostras,
        {
          id: input.amostra.id,
          createdAt: now,
          updatedAt: now,
          reportNumber: input.amostra.reportNumber ?? input.amostra.code ?? "",
          borehole: input.amostra.borehole ?? "",
          depth: input.amostra.depth ?? "",
          description: input.amostra.description ?? "",
          granulometricDescription: "",
          code: input.amostra.code ?? input.amostra.reportNumber ?? "",
          photos: [],
          ensaios: [],
        },
      ];
      amIndex = os.amostras.length - 1;
    } else {
      const current = os.amostras[amIndex];
      os.amostras[amIndex] = {
        ...current,
        updatedAt: now,
        reportNumber: input.amostra.reportNumber || current.reportNumber,
        code: input.amostra.code || current.code,
        description: input.amostra.description || current.description,
        borehole: input.amostra.borehole || current.borehole,
        depth: input.amostra.depth || current.depth,
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

  // Fotos do ensaio (moldagem/ruptura, opcionalmente por CP via specimenId)
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
};

// ---------- Hooks ----------

export function useLabState(): LabState {
  useEffect(() => {
    void labStore.hydrate();
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