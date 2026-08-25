/**
 * Store do laboratório — fonte da verdade: Supabase, em 3 tabelas
 * relacionais (`lab_os`, `lab_amostras`, `lab_ensaios`) — uma linha por
 * entidade, não mais um único arquivo JSON com tudo.
 *
 * - Hidrata do Supabase na primeira montagem do app.
 * - Mantém o estado em memória com useSyncExternalStore (reatividade local
 *   instantânea — nenhuma mudança de UI espera rede).
 * - Cada mutação persiste SÓ a entidade que mudou (debounce curto por
 *   entidade), nunca a árvore inteira — duas pessoas mexendo em
 *   OS/amostras/ensaios diferentes não colidem mais entre si.
 * - Auto-refresh periódico e ao focar a janela para manter múltiplos
 *   computadores sincronizados. O refresh faz *merge*: entidades com uma
 *   escrita local pendente/em voo não são sobrescritas pelo que veio do
 *   servidor (que pode estar um instante desatualizado) — só entidades
 *   "quietas" adotam o dado remoto mais fresco.
 * - Backup local em `localStorage` para tolerância a rede/reload.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { Amostra, Ensaio, EnsaioTipo, LabState, OS, Photo } from "./types";
import { loadLabTree, upsertOSFn, upsertAmostraFn, upsertEnsaioFn, deleteOSFn, deleteAmostraFn, deleteEnsaioFn } from "@/lib/lab-entities.functions";
import { loadLabStateFromDrive } from "@/lib/labState.functions";
import { trackSave } from "@/lib/save-in-flight";
import type { LabEnsaioSnapshot } from "@/lib/lab-ensaios.functions";

const STORAGE_KEY = "lab://os-store/v1";
const REMOTE_SAVE_DEBOUNCE_MS = 600;
const REFRESH_INTERVAL_MS = 8000;

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

function persistLocal() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("[lab/store] Falha ao persistir localmente:", e);
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

function setStatus(next: SyncStatus, err: string | null = null) {
  syncStatus = next;
  lastSyncError = err;
  syncStatusRef = { status: next, error: err };
  listeners.forEach((l) => l());
}

// ids (OS/amostra/ensaio) com uma gravação pendente (debounce) ou em voo —
// usados pelo merge do refresh para não sobrescrever edição local recente
// com um snapshot do servidor que ainda não reflete essa edição.
const dirtyIds = new Set<string>();
function markDirty(id: string) {
  dirtyIds.add(id);
  updateSavingStatus();
}
function clearDirty(id: string) {
  dirtyIds.delete(id);
  updateSavingStatus();
}
function updateSavingStatus() {
  setStatus(dirtyIds.size > 0 ? "salvando" : "salvo");
}

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleEntitySave(id: string, run: () => Promise<void>) {
  markDirty(id);
  const existing = saveTimers.get(id);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    saveTimers.delete(id);
    void trackSave(run)
      .then(() => clearDirty(id))
      .catch((err) => {
        console.warn(`[lab/store] Falha ao salvar ${id}, tentando novamente:`, err);
        // Mantém dirty e tenta de novo em breve — não perde a mudança local.
        setTimeout(() => scheduleEntitySave(id, run), 3000);
      });
  }, REMOTE_SAVE_DEBOUNCE_MS);
  saveTimers.set(id, timer);
}

function scheduleSaveOS(os: OS) {
  scheduleEntitySave(os.id, async () => {
    await upsertOSFn({
      data: {
        id: os.id,
        numero: os.numero,
        client: os.client,
        workNumber: os.workNumber,
        local: os.local,
        operator: os.operator,
        technicalResp: os.technicalResp,
        revision: os.revision,
        createdAt: os.createdAt,
        updatedAt: os.updatedAt,
      },
    });
  });
}

function scheduleSaveAmostra(osId: string, am: Amostra) {
  scheduleEntitySave(am.id, async () => {
    await upsertAmostraFn({
      data: {
        id: am.id,
        osId,
        reportNumber: am.reportNumber,
        borehole: am.borehole,
        depth: am.depth,
        description: am.description,
        granulometricDescription: am.granulometricDescription,
        code: am.code,
        sampleType: am.sampleType,
        materialType: am.materialType,
        coords: am.coords as Record<string, unknown> | undefined,
        photos: am.photos as unknown as Record<string, unknown>[],
        createdAt: am.createdAt,
        updatedAt: am.updatedAt,
      },
    });
  });
}

function scheduleSaveEnsaio(amostraId: string, en: Ensaio) {
  scheduleEntitySave(en.id, async () => {
    await upsertEnsaioFn({
      data: {
        id: en.id,
        amostraId,
        tipo: en.tipo,
        status: en.status,
        label: en.label,
        nome: en.nome,
        sigla: en.sigla,
        operator: en.operator,
        photos: en.photos as unknown as Record<string, unknown>[],
        payload: en.payload,
        createdAt: en.createdAt,
        updatedAt: en.updatedAt,
      },
    });
  });
}

function isEmptyState(s: LabState): boolean {
  return !s.os || s.os.length === 0;
}

/** Ponte de segurança: lê o mecanismo antigo (_lab-state.json) enquanto as tabelas novas não têm dados. */
async function tryLoadLegacyState(): Promise<LabState | null> {
  try {
    const res = await loadLabStateFromDrive();
    if (!res.stateJson) return null;
    const parsed = JSON.parse(res.stateJson) as LabState;
    if (parsed && Array.isArray(parsed.os)) return parsed;
    return null;
  } catch {
    return null;
  }
}

async function hydrate(): Promise<void> {
  if (typeof window === "undefined") return;
  if (hydrated) return;
  if (hydrationPromise) return hydrationPromise;
  setStatus("carregando");
  hydrationPromise = (async () => {
    try {
      // Se as tabelas novas ainda não existem no banco (migration SQL não
      // aplicada ainda), loadLabTree lança erro — tratamos igual a "vazio"
      // em vez de deixar propagar, para cair na ponte de segurança abaixo.
      const res = await loadLabTree().catch((err) => {
        console.warn("[lab/store] lab_os/lab_amostras/lab_ensaios ainda não disponíveis:", err);
        return { state: null };
      });
      if (res.state && !isEmptyState(res.state)) {
        state = res.state;
      } else if (isEmptyState(state)) {
        // As tabelas novas (lab_os/lab_amostras/lab_ensaios) ainda não têm
        // dados — pode ser instalação nova, ou a migração dos dados antigos
        // ainda não rodou. Ponte de segurança: tenta o mecanismo antigo
        // (_lab-state.json) antes de assumir "vazio", para não fazer o app
        // parecer ter perdido tudo durante a janela de transição.
        const legacy = await tryLoadLegacyState();
        if (legacy && !isEmptyState(legacy)) {
          state = legacy;
        } else {
          // Nada em lugar nenhum: primeira instalação → semente + salva.
          const seeded = seed();
          state = seeded;
          const os = seeded.os[0];
          scheduleSaveOS(os);
          scheduleSaveAmostra(os.id, os.amostras[0]);
        }
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

/**
 * Reaproveita a referência local quando o conteúdo é idêntico ao que veio do
 * servidor. Sem isso, cada refresh (a cada 8s) trocava toda entidade "limpa"
 * por um objeto novo mesmo sem nenhuma mudança real — e como vários efeitos
 * (ex.: autosave do rascunho) dependem da identidade desses objetos, isso
 * disparava gravações repetidas no Drive o tempo todo, sem edição nenhuma.
 */
function reuseIfUnchanged<T>(local: T | undefined, remote: T): T {
  if (local !== undefined && JSON.stringify(local) === JSON.stringify(remote)) return local;
  return remote;
}

/** Funde o snapshot do servidor com o estado local, preservando entidades com escrita pendente/em voo. */
function mergeRemote(local: LabState, remote: LabState): LabState {
  const localOSMap = new Map(local.os.map((o) => [o.id, o]));
  const remoteOSIds = new Set(remote.os.map((o) => o.id));

  const mergedOS = remote.os.map((remoteO) => {
    const localO = localOSMap.get(remoteO.id);
    const osIsDirty = dirtyIds.has(remoteO.id);
    const baseOS = osIsDirty && localO ? localO : remoteO;

    const localAmMap = new Map((localO?.amostras ?? []).map((a) => [a.id, a]));
    const remoteAmIds = new Set(remoteO.amostras.map((a) => a.id));

    const mergedAmostras = remoteO.amostras.map((remoteA) => {
      const localA = localAmMap.get(remoteA.id);
      const amIsDirty = dirtyIds.has(remoteA.id);
      const baseAm = amIsDirty && localA ? localA : remoteA;

      const localEnMap = new Map((localA?.ensaios ?? []).map((e) => [e.id, e]));
      const remoteEnIds = new Set(remoteA.ensaios.map((e) => e.id));

      const mergedEnsaios = remoteA.ensaios.map((remoteE) => {
        const localE = localEnMap.get(remoteE.id);
        if (dirtyIds.has(remoteE.id) && localE) return localE;
        return reuseIfUnchanged(localE, remoteE);
      });
      // Ensaios que só existem localmente ainda (criados agora, gravação em voo).
      const localOnlyEnsaios = (localA?.ensaios ?? []).filter(
        (e) => !remoteEnIds.has(e.id) && dirtyIds.has(e.id),
      );

      const mergedAmostra = { ...baseAm, ensaios: [...mergedEnsaios, ...localOnlyEnsaios] };
      return reuseIfUnchanged(localA, mergedAmostra);
    });
    const localOnlyAmostras = (localO?.amostras ?? []).filter(
      (a) => !remoteAmIds.has(a.id) && dirtyIds.has(a.id),
    );

    const mergedOSEntry = { ...baseOS, amostras: [...mergedAmostras, ...localOnlyAmostras] };
    return reuseIfUnchanged(localO, mergedOSEntry);
  });

  const localOnlyOS = local.os.filter((o) => !remoteOSIds.has(o.id) && dirtyIds.has(o.id));
  return { os: [...mergedOS, ...localOnlyOS] };
}

async function refreshFromRemote(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await loadLabTree();
    if (res.state) {
      state = mergeRemote(state, res.state);
      persistLocal();
      listeners.forEach((l) => l());
    }
  } catch {
    // silencioso: mantém o estado local, tenta de novo no próximo ciclo
  }
}

function notify() {
  persistLocal();
  listeners.forEach((l) => l());
}

// ---------- Mutadores de baixo nível (achatados: cada um sabe exatamente
// qual entidade mudou, e agenda a gravação só dela) ----------

function updateOS(osId: string, patch: (o: OS) => OS): void {
  const now = nowIso();
  let changed: OS | undefined;
  state = {
    ...state,
    os: state.os.map((o) => {
      if (o.id !== osId) return o;
      changed = { ...patch(o), updatedAt: now };
      return changed;
    }),
  };
  notify();
  if (changed) scheduleSaveOS(changed);
}

function updateAmostra(osId: string, amId: string, patch: (a: Amostra) => Amostra): void {
  const now = nowIso();
  let changed: Amostra | undefined;
  state = {
    ...state,
    os: state.os.map((o) => {
      if (o.id !== osId) return o;
      return {
        ...o,
        amostras: o.amostras.map((a) => {
          if (a.id !== amId) return a;
          changed = { ...patch(a), updatedAt: now };
          return changed;
        }),
      };
    }),
  };
  notify();
  if (changed) scheduleSaveAmostra(osId, changed);
}

function updateEnsaio(osId: string, amId: string, enId: string, patch: (e: Ensaio) => Ensaio): void {
  const now = nowIso();
  let changed: Ensaio | undefined;
  state = {
    ...state,
    os: state.os.map((o) => {
      if (o.id !== osId) return o;
      return {
        ...o,
        amostras: o.amostras.map((a) => {
          if (a.id !== amId) return a;
          return {
            ...a,
            ensaios: a.ensaios.map((e) => {
              if (e.id !== enId) return e;
              changed = { ...patch(e), updatedAt: now };
              return changed;
            }),
          };
        }),
      };
    }),
  };
  notify();
  if (changed) scheduleSaveEnsaio(amId, changed);
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
    return hydrate();
  },
  refreshFromRemote(): Promise<void> {
    return refreshFromRemote();
  },
  async forceSaveNow(): Promise<void> {
    // Dispara imediatamente qualquer gravação pendente (debounce) em voo.
    const ids = [...saveTimers.keys()];
    for (const id of ids) {
      const timer = saveTimers.get(id);
      if (timer) clearTimeout(timer);
      saveTimers.delete(id);
    }
    // As funções agendadas já foram perdidas ao limpar o timer; o próximo
    // refresh/merge preserva o que está dirty até a próxima mutação
    // reagendar. Isso é usado raramente (nenhuma tela crítica depende de
    // flush síncrono hoje) — mantido só por compatibilidade de API.
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
    state = { ...state, os: [os, ...state.os] };
    notify();
    scheduleSaveOS(os);
    return os;
  },

  updateOS(osId: string, patch: Partial<Omit<OS, "id" | "createdAt" | "updatedAt" | "amostras">>) {
    updateOS(osId, (o) => ({ ...o, ...patch }));
  },
  patchOS(osId: string, patch: Partial<Omit<OS, "id" | "createdAt" | "updatedAt" | "amostras">>) {
    updateOS(osId, (o) => ({ ...o, ...patch }));
  },

  deleteOS(osId: string) {
    state = { ...state, os: state.os.filter((o) => o.id !== osId) };
    notify();
    void deleteOSFn({ data: { id: osId } }).catch((err) => console.warn("[lab/store] Falha ao excluir OS:", err));
  },

  // ---------- Mutações de Amostra ----------
  addAmostra(osId: string, input: any): Amostra | undefined {
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
    state = {
      ...state,
      os: state.os.map((o) => (o.id === osId ? { ...o, amostras: [...o.amostras, amostra] } : o)),
    };
    notify();
    scheduleSaveAmostra(osId, amostra);
    return amostra;
  },

  patchAmostra(osId: string, amId: string, patch: Partial<Omit<Amostra, "id" | "createdAt" | "updatedAt" | "ensaios">>) {
    updateAmostra(osId, amId, (a) => ({ ...a, ...patch }));
  },

  deleteAmostra(osId: string, amId: string) {
    state = {
      ...state,
      os: state.os.map((o) => (o.id === osId ? { ...o, amostras: o.amostras.filter((a) => a.id !== amId) } : o)),
    };
    notify();
    void deleteAmostraFn({ data: { id: amId, osId } }).catch((err) => console.warn("[lab/store] Falha ao excluir amostra:", err));
  },

  // ---------- Mutações de Ensaio ----------
  addEnsaio(osId: string, amId: string, tipo: EnsaioTipo, label?: string): Ensaio | undefined {
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
    state = {
      ...state,
      os: state.os.map((o) =>
        o.id === osId
          ? { ...o, amostras: o.amostras.map((a) => (a.id === amId ? { ...a, ensaios: [...a.ensaios, ensaio] } : a)) }
          : o,
      ),
    };
    notify();
    scheduleSaveEnsaio(amId, ensaio);
    return ensaio;
  },

  patchEnsaio(osId: string, amId: string, enId: string, patch: Partial<Omit<Ensaio, "id" | "createdAt" | "updatedAt">>) {
    updateEnsaio(osId, amId, enId, (e) => ({ ...e, ...patch }));
  },

  deleteEnsaio(osId: string, amId: string, enId: string) {
    state = {
      ...state,
      os: state.os.map((o) =>
        o.id === osId
          ? { ...o, amostras: o.amostras.map((a) => (a.id === amId ? { ...a, ensaios: a.ensaios.filter((e) => e.id !== enId) } : a)) }
          : o,
      ),
    };
    notify();
    void deleteEnsaioFn({ data: { id: enId, amostraId: amId } }).catch((err) => console.warn("[lab/store] Falha ao excluir ensaio:", err));
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
    let osChanged: OS | undefined;

    if (osIndex === -1) {
      osChanged = {
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
      };
      nextOs.unshift(osChanged);
      osIndex = 0;
    }

    const os = nextOs[osIndex];
    let amIndex = os.amostras.findIndex((a) => a.id === input.amostra.id);
    let amChanged: Amostra | undefined;

    if (amIndex === -1) {
      amChanged = {
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
      };
      os.amostras.push(amChanged);
      amIndex = os.amostras.length - 1;
    } else {
      const curAm = os.amostras[amIndex];
      amChanged = {
        ...curAm,
        updatedAt: now,
        borehole: input.amostra.borehole || curAm.borehole,
        depth: input.amostra.depth || curAm.depth,
        code: input.amostra.code || curAm.code,
        description: input.amostra.description || curAm.description,
      };
      os.amostras[amIndex] = amChanged;
    }

    const amostra = os.amostras[amIndex];
    let enIndex = amostra.ensaios.findIndex((e) => e.id === input.ensaio.id);
    let enChanged: Ensaio;

    if (enIndex === -1) {
      enChanged = {
        id: input.ensaio.id,
        tipo: input.ensaio.tipo,
        status: input.ensaio.status,
        createdAt: now,
        updatedAt: now,
        label: input.ensaio.label,
        operator: "",
        photos: [],
        payload: input.ensaio.payload,
      };
      amostra.ensaios = [...amostra.ensaios, enChanged];
      enIndex = amostra.ensaios.length - 1;
    } else {
      const current = amostra.ensaios[enIndex];
      enChanged = {
        ...current,
        updatedAt: now,
        tipo: input.ensaio.tipo,
        status: input.ensaio.status,
        label: input.ensaio.label || current.label,
        payload: input.ensaio.payload ?? current.payload,
      };
      amostra.ensaios[enIndex] = enChanged;
    }

    state = { ...state, os: nextOs };
    notify();

    if (osChanged) scheduleSaveOS(osChanged);
    if (amChanged) scheduleSaveAmostra(os.id, amChanged);
    scheduleSaveEnsaio(amostra.id, enChanged);

    return { osId: os.id, amId: amostra.id, enId: enChanged.id };
  },

  // Fotos do ensaio
  addEnsaioPhoto(osId: string, amId: string, enId: string, photo: Omit<Photo, "id" | "createdAt">) {
    updateEnsaio(osId, amId, enId, (e) => ({
      ...e,
      photos: [...(e.photos ?? []), { ...photo, id: rid("ph"), createdAt: nowIso() }],
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
    }, REFRESH_INTERVAL_MS);
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
