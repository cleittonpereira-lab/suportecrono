import { useState, useEffect, useCallback } from "react";
import {
  fetchSharedChegadaState,
  saveSharedChegadaState,
  createSharedChegadaTask,
  addSharedChegadaOption,
} from "./chegada-amostras.functions";

export type ColumnId = "registro" | "recebimento" | "abrir-os" | "os-sistema";

export type Priority = "baixa" | "media" | "alta";

export type RegistroOrigem = "colaborador" | "administrador";

export interface Option {
  label: string;
  value: string;
}

export interface ChegadaTask {
  id: string;
  osCliente: string;
  dataChegada: string;
  recebidoPor: string[];
  tipoAmostra: string[];
  relacaoAmostras: string;
  sup?: string;
  priority: Priority;
  images?: string[];
  criadoPor?: string;
  criadoEm?: string;
  origem?: RegistroOrigem;
  updatedAt?: string;
}

export const COLUMNS: { id: ColumnId; title: string; subtitle: string }[] = [
  { id: "registro", title: "Registro", subtitle: "Chegada de amostras" },
  { id: "recebimento", title: "Recebimento", subtitle: "Conferência inicial" },
  { id: "abrir-os", title: "Abrir OS", subtitle: "Abertura no sistema" },
  { id: "os-sistema", title: "OS no Sistema", subtitle: "Em processamento" },
];

export const TASKS_STORAGE_KEY = "chegada_amostras_tasks";
export const TIPO_AMOSTRA_STORAGE_KEY = "chegada_amostras_tipo_options";
export const RECEBIDO_STORAGE_KEY = "chegada_amostras_recebido_options";
export const CHEGADA_UPDATE_EVENT = "chegada_amostras_update";
export const CHEGADA_OPTIONS_EVENT = "chegada_options_update";

export const DEFAULT_TIPO_AMOSTRA_OPTIONS: Option[] = [
  { label: "DEF.1", value: "DEF.1" },
  { label: "DEF.5", value: "DEF.5" },
  { label: "DEF.20", value: "DEF.20" },
  { label: "DEF.60", value: "DEF.60" },
  { label: "BL.30", value: "BL.30" },
  { label: "BL.40", value: "BL.40" },
  { label: "SH.3", value: "SH.3" },
  { label: "SH.4", value: "SH.4" },
  { label: "DN.3", value: "DN.3" },
  { label: "DN.4", value: "DN.4" },
];

export const DEFAULT_RECEBIDO_OPTIONS: Option[] = [
  { label: "Rafael Hereman", value: "Rafael Hereman" },
  { label: "Renan Guerra", value: "Renan Guerra" },
  { label: "Renan Adriano", value: "Renan Adriano" },
  { label: "Rodrigo Silva", value: "Rodrigo Silva" },
  { label: "Murilo Freitas", value: "Murilo Freitas" },
  { label: "Thiago Araújo", value: "Thiago Araújo" },
];

export const INITIAL_TASKS: Record<ColumnId, ChegadaTask[]> = {
  registro: [
    {
      id: "demo-1",
      osCliente: "Alfa Geotecnia / OS 1029",
      dataChegada: "20/08/2026",
      recebidoPor: ["Rafael Hereman"],
      tipoAmostra: ["DEF.1", "BL.30"],
      relacaoAmostras: "5 sacos de solo argiloso",
      sup: "CONTRATO-001",
      priority: "alta",
      images: [],
      criadoPor: "Administrador",
      criadoEm: "20/08/2026 09:30",
      origem: "administrador",
    },
  ],
  recebimento: [],
  "abrir-os": [],
  "os-sistema": [],
};

// Helper to get formatted current datetime
export function formatNow(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const y = now.getFullYear();
  const hr = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${d}/${m}/${y} ${hr}:${min}`;
}

export function formatDateToday(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const y = now.getFullYear();
  return `${d}/${m}/${y}`;
}

// Tasks management (Local Cache)
export function getStoredTasks(): Record<ColumnId, ChegadaTask[]> {
  if (typeof window === "undefined") return INITIAL_TASKS;
  const saved = localStorage.getItem(TASKS_STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return {
        registro: Array.isArray(parsed.registro) ? parsed.registro : [],
        recebimento: Array.isArray(parsed.recebimento) ? parsed.recebimento : [],
        "abrir-os": Array.isArray(parsed["abrir-os"]) ? parsed["abrir-os"] : [],
        "os-sistema": Array.isArray(parsed["os-sistema"]) ? parsed["os-sistema"] : [],
      };
    } catch (e) {
      console.error("Error loading chegada tasks:", e);
    }
  }
  return INITIAL_TASKS;
}

export function saveStoredTasks(tasks: Record<ColumnId, ChegadaTask[]>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
  window.dispatchEvent(new CustomEvent(CHEGADA_UPDATE_EVENT, { detail: tasks }));

  // Sincroniza em segundo plano com o banco de dados global
  saveSharedChegadaState({
    data: {
      tasks,
      tipoOptions: getTipoAmostraOptions(),
      recebidoOptions: getRecebidoOptions(),
    },
  }).catch((err) => {
    console.warn("[saveStoredTasks] Sync warning:", err);
  });
}

export async function createChegadaRegistroAsync(
  data: Omit<ChegadaTask, "id" | "criadoEm"> & { id?: string; criadoEm?: string }
): Promise<ChegadaTask> {
  const current = getStoredTasks();
  const newTask: ChegadaTask = {
    id: data.id || "amostra_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
    osCliente: data.osCliente.trim(),
    dataChegada: data.dataChegada || formatDateToday(),
    recebidoPor: data.recebidoPor || [],
    tipoAmostra: data.tipoAmostra || [],
    relacaoAmostras: data.relacaoAmostras || "",
    sup: data.sup || "",
    priority: data.priority || "media",
    images: data.images || [],
    criadoPor: data.criadoPor || "Colaborador",
    criadoEm: data.criadoEm || formatNow(),
    origem: data.origem || "colaborador",
    updatedAt: formatNow(),
  };

  const updatedRegistro = [newTask, ...current.registro].sort((a, b) => {
    if (a.priority === "alta" && b.priority !== "alta") return -1;
    if (a.priority !== "alta" && b.priority === "alta") return 1;
    return 0;
  });

  const updatedTasks = {
    ...current,
    registro: updatedRegistro,
  };

  if (typeof window !== "undefined") {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(updatedTasks));
    window.dispatchEvent(new CustomEvent(CHEGADA_UPDATE_EVENT, { detail: updatedTasks }));
  }

  // Envia para o banco central compartilhado por todos os dispositivos
  try {
    const res = await createSharedChegadaTask({ data });
    if (res.fullState && typeof window !== "undefined") {
      localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(res.fullState.tasks));
      localStorage.setItem(TIPO_AMOSTRA_STORAGE_KEY, JSON.stringify(res.fullState.tipoOptions));
      localStorage.setItem(RECEBIDO_STORAGE_KEY, JSON.stringify(res.fullState.recebidoOptions));
      window.dispatchEvent(new CustomEvent(CHEGADA_UPDATE_EVENT, { detail: res.fullState.tasks }));
      window.dispatchEvent(new CustomEvent(CHEGADA_OPTIONS_EVENT));
    }
  } catch (err) {
    console.warn("[createChegadaRegistroAsync] Erro ao sincronizar com nuvem, mantido local:", err);
  }

  return newTask;
}

export function createChegadaRegistro(
  data: Omit<ChegadaTask, "id" | "criadoEm"> & { id?: string; criadoEm?: string }
): ChegadaTask {
  // Chamada síncrona local + trigger assíncrono para a nuvem
  const current = getStoredTasks();
  const newTask: ChegadaTask = {
    id: data.id || "amostra_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
    osCliente: data.osCliente.trim(),
    dataChegada: data.dataChegada || formatDateToday(),
    recebidoPor: data.recebidoPor || [],
    tipoAmostra: data.tipoAmostra || [],
    relacaoAmostras: data.relacaoAmostras || "",
    sup: data.sup || "",
    priority: data.priority || "media",
    images: data.images || [],
    criadoPor: data.criadoPor || "Colaborador",
    criadoEm: data.criadoEm || formatNow(),
    origem: data.origem || "colaborador",
    updatedAt: formatNow(),
  };

  const updatedRegistro = [newTask, ...current.registro].sort((a, b) => {
    if (a.priority === "alta" && b.priority !== "alta") return -1;
    if (a.priority !== "alta" && b.priority === "alta") return 1;
    return 0;
  });

  const updatedTasks = {
    ...current,
    registro: updatedRegistro,
  };

  if (typeof window !== "undefined") {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(updatedTasks));
    window.dispatchEvent(new CustomEvent(CHEGADA_UPDATE_EVENT, { detail: updatedTasks }));
  }

  // Dispara sincronização em nuvem
  createSharedChegadaTask({ data })
    .then((res) => {
      if (res?.fullState && typeof window !== "undefined") {
        localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(res.fullState.tasks));
        localStorage.setItem(TIPO_AMOSTRA_STORAGE_KEY, JSON.stringify(res.fullState.tipoOptions));
        localStorage.setItem(RECEBIDO_STORAGE_KEY, JSON.stringify(res.fullState.recebidoOptions));
        window.dispatchEvent(new CustomEvent(CHEGADA_UPDATE_EVENT, { detail: res.fullState.tasks }));
        window.dispatchEvent(new CustomEvent(CHEGADA_OPTIONS_EVENT));
      }
    })
    .catch((err) => {
      console.warn("[createChegadaRegistro] Sync cloud warning:", err);
    });

  return newTask;
}

// Managed Options (Tipo de Amostra)
export function getTipoAmostraOptions(): Option[] {
  if (typeof window === "undefined") return DEFAULT_TIPO_AMOSTRA_OPTIONS;
  const saved = localStorage.getItem(TIPO_AMOSTRA_STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {}
  }
  return DEFAULT_TIPO_AMOSTRA_OPTIONS;
}

export function addTipoAmostraOption(name: string): Option[] {
  const clean = name.trim();
  if (!clean) return getTipoAmostraOptions();
  const current = getTipoAmostraOptions();
  if (current.some((opt) => opt.value.toLowerCase() === clean.toLowerCase())) {
    return current;
  }
  const updated = [...current, { label: clean, value: clean }];
  if (typeof window !== "undefined") {
    localStorage.setItem(TIPO_AMOSTRA_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(CHEGADA_OPTIONS_EVENT));
  }

  // Envia para o banco central compartilhado
  addSharedChegadaOption({ data: { type: "tipo", name: clean } }).catch((err) => {
    console.warn("[addTipoAmostraOption] Cloud sync warning:", err);
  });

  return updated;
}

// Managed Options (Recebido por)
export function getRecebidoOptions(): Option[] {
  if (typeof window === "undefined") return DEFAULT_RECEBIDO_OPTIONS;
  const saved = localStorage.getItem(RECEBIDO_STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {}
  }
  return DEFAULT_RECEBIDO_OPTIONS;
}

export function addRecebidoOption(name: string): Option[] {
  const clean = name.trim();
  if (!clean) return getRecebidoOptions();
  const current = getRecebidoOptions();
  if (current.some((opt) => opt.value.toLowerCase() === clean.toLowerCase())) {
    return current;
  }
  const updated = [...current, { label: clean, value: clean }];
  if (typeof window !== "undefined") {
    localStorage.setItem(RECEBIDO_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(CHEGADA_OPTIONS_EVENT));
  }

  // Envia para o banco central compartilhado
  addSharedChegadaOption({ data: { type: "recebido", name: clean } }).catch((err) => {
    console.warn("[addRecebidoOption] Cloud sync warning:", err);
  });

  return updated;
}

/** Hook para sincronização automática em tempo real e background polling */
export function useChegadaRealtimeSync(onStateUpdated?: (tasks: Record<ColumnId, ChegadaTask[]>) => void) {
  const syncFromServer = useCallback(async () => {
    try {
      const serverState = await fetchSharedChegadaState();
      if (serverState?.tasks && typeof window !== "undefined") {
        const localTasks = getStoredTasks();
        const serverJson = JSON.stringify(serverState.tasks);
        const localJson = JSON.stringify(localTasks);

        if (serverJson !== localJson) {
          localStorage.setItem(TASKS_STORAGE_KEY, serverJson);
          window.dispatchEvent(new CustomEvent(CHEGADA_UPDATE_EVENT, { detail: serverState.tasks }));
          if (onStateUpdated) onStateUpdated(serverState.tasks);
        }

        if (Array.isArray(serverState.tipoOptions) && serverState.tipoOptions.length > 0) {
          localStorage.setItem(TIPO_AMOSTRA_STORAGE_KEY, JSON.stringify(serverState.tipoOptions));
        }
        if (Array.isArray(serverState.recebidoOptions) && serverState.recebidoOptions.length > 0) {
          localStorage.setItem(RECEBIDO_STORAGE_KEY, JSON.stringify(serverState.recebidoOptions));
        }
        window.dispatchEvent(new CustomEvent(CHEGADA_OPTIONS_EVENT));
      }
    } catch (e) {
      // Falha silenciosa para não travar a UI
    }
  }, [onStateUpdated]);

  useEffect(() => {
    // 1. Sincroniza imediatamente ao montar a tela
    syncFromServer();

    // 2. Sincroniza periodicamente a cada 3.5 segundos para garantir atualização simultânea entre múltiplos aparelhos
    const interval = setInterval(syncFromServer, 3500);

    // 3. Sincroniza ao focar na janela/aba
    const handleFocus = () => syncFromServer();
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [syncFromServer]);
}
