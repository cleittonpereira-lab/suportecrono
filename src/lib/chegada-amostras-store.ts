import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  fetchSharedChegadaState,
  saveSharedChegadaState,
  createSharedChegadaTask,
  addSharedChegadaOption,
} from "./chegada-amostras.functions";

export type ColumnId = string;

export interface ChegadaColumn {
  id: string;
  title: string;
  subtitle?: string;
  isSystem?: boolean;
}

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

export const DEFAULT_COLUMNS: ChegadaColumn[] = [
  { id: "registro", title: "Registro", subtitle: "Chegada de amostras", isSystem: true },
  { id: "recebimento", title: "Recebimento", subtitle: "Conferência inicial" },
  { id: "abrir-os", title: "Abrir OS", subtitle: "Abertura no sistema" },
  { id: "os-sistema", title: "OS no Sistema", subtitle: "Em processamento" },
];

export const COLUMNS = DEFAULT_COLUMNS; // compatibilidade

export const TASKS_STORAGE_KEY = "chegada_amostras_tasks";
export const COLUMNS_STORAGE_KEY = "chegada_amostras_columns";
export const TIPO_AMOSTRA_STORAGE_KEY = "chegada_amostras_tipo_options";
export const RECEBIDO_STORAGE_KEY = "chegada_amostras_recebido_options";

export const CHEGADA_UPDATE_EVENT = "chegada_amostras_update";
export const CHEGADA_COLUMNS_EVENT = "chegada_columns_update";
export const CHEGADA_OPTIONS_EVENT = "chegada_options_update";

export const REV_STORAGE_KEY = "chegada_amostras_rev";

/**
 * Revisão do quadro compartilhado que este cliente sabe que já leu.
 * Enviada como `expectedRev` em toda gravação — o servidor recusa a
 * gravação (em vez de sobrescrever) se o quadro real já estiver à frente
 * disso. Ver `handleSaveSharedChegadaState` em `chegada-amostras.functions.ts`.
 */
let knownRev = 0;

export function getKnownChegadaRev(): number {
  if (knownRev > 0) return knownRev;
  if (typeof window === "undefined") return 0;
  const saved = localStorage.getItem(REV_STORAGE_KEY);
  const parsed = saved ? parseInt(saved, 10) : 0;
  knownRev = Number.isFinite(parsed) ? parsed : 0;
  return knownRev;
}

function setKnownChegadaRev(rev: number): void {
  knownRev = rev;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(REV_STORAGE_KEY, String(rev));
  } catch {}
}

type SaveChegadaResult = Awaited<ReturnType<typeof saveSharedChegadaState>>;

/**
 * Trata a resposta de uma gravação do quadro: em caso de sucesso, avança a
 * revisão conhecida; em caso de conflito (outra pessoa gravou no meio
 * tempo), NÃO aplica a gravação local — atualiza a tela com o estado real
 * do servidor e avisa o usuário para repetir a ação, em vez de deixar a
 * gravação antiga sobrescrever silenciosamente o que a outra pessoa fez.
 */
function handleChegadaSaveResult(res: SaveChegadaResult): void {
  if (res.success) {
    setKnownChegadaRev(res.rev);
    return;
  }
  if (!res.conflict || typeof window === "undefined") return;
  const cs = res.currentState;
  try {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(cs.tasks));
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(cs.columns));
    localStorage.setItem(TIPO_AMOSTRA_STORAGE_KEY, JSON.stringify(cs.tipoOptions));
    localStorage.setItem(RECEBIDO_STORAGE_KEY, JSON.stringify(cs.recebidoOptions));
  } catch {}
  setKnownChegadaRev(cs.rev);
  window.dispatchEvent(new CustomEvent(CHEGADA_UPDATE_EVENT, { detail: cs.tasks }));
  window.dispatchEvent(new CustomEvent(CHEGADA_COLUMNS_EVENT, { detail: cs.columns }));
  window.dispatchEvent(new CustomEvent(CHEGADA_OPTIONS_EVENT));
  toast.warning("Quadro atualizado por outra pessoa", {
    description: "Alguém mexeu no quadro de Chegada de Amostras ao mesmo tempo. A tela foi atualizada com a versão mais recente — repita sua última ação se ela não aparecer.",
  });
}

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

export const INITIAL_TASKS: Record<string, ChegadaTask[]> = {
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

// Helper de formatação de data e hora
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

// Columns management
export function getStoredColumns(): ChegadaColumn[] {
  if (typeof window === "undefined") return DEFAULT_COLUMNS;
  const saved = localStorage.getItem(COLUMNS_STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.error("Error loading columns:", e);
    }
  }
  return DEFAULT_COLUMNS;
}

export function saveStoredColumns(columns: ChegadaColumn[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(columns));
  window.dispatchEvent(new CustomEvent(CHEGADA_COLUMNS_EVENT, { detail: columns }));

  saveSharedChegadaState({
    data: {
      columns,
      tasks: getStoredTasks(),
      tipoOptions: getTipoAmostraOptions(),
      recebidoOptions: getRecebidoOptions(),
      expectedRev: getKnownChegadaRev(),
    },
  }).then(handleChegadaSaveResult).catch((e) => console.warn("[saveStoredColumns] Sync warning:", e));
}

export function createChegadaColumn(title: string, subtitle?: string): ChegadaColumn {
  const cleanTitle = title.trim();
  const columns = getStoredColumns();
  const id = "col_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 6);
  const newCol: ChegadaColumn = {
    id,
    title: cleanTitle,
    subtitle: subtitle?.trim() || undefined,
  };

  const updatedColumns = [...columns, newCol];
  const currentTasks = getStoredTasks();
  if (!currentTasks[id]) {
    currentTasks[id] = [];
  }

  if (typeof window !== "undefined") {
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(updatedColumns));
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(currentTasks));
    window.dispatchEvent(new CustomEvent(CHEGADA_COLUMNS_EVENT, { detail: updatedColumns }));
    window.dispatchEvent(new CustomEvent(CHEGADA_UPDATE_EVENT, { detail: currentTasks }));
  }

  saveSharedChegadaState({
    data: {
      columns: updatedColumns,
      tasks: currentTasks,
      tipoOptions: getTipoAmostraOptions(),
      recebidoOptions: getRecebidoOptions(),
      expectedRev: getKnownChegadaRev(),
    },
  }).then(handleChegadaSaveResult).catch((e) => console.warn("[createChegadaColumn] Sync warning:", e));

  return newCol;
}

export function deleteChegadaColumn(columnId: string): boolean {
  if (columnId === "registro") {
    return false; // Coluna de entrada principal protegida
  }

  const columns = getStoredColumns();
  const updatedColumns = columns.filter((c) => c.id !== columnId);
  const currentTasks = getStoredTasks();

  const { [columnId]: deletedTasks, ...remainingTasks } = currentTasks;

  if (typeof window !== "undefined") {
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(updatedColumns));
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(remainingTasks));
    window.dispatchEvent(new CustomEvent(CHEGADA_COLUMNS_EVENT, { detail: updatedColumns }));
    window.dispatchEvent(new CustomEvent(CHEGADA_UPDATE_EVENT, { detail: remainingTasks }));
  }

  saveSharedChegadaState({
    data: {
      columns: updatedColumns,
      tasks: remainingTasks,
      tipoOptions: getTipoAmostraOptions(),
      recebidoOptions: getRecebidoOptions(),
      expectedRev: getKnownChegadaRev(),
    },
  }).then(handleChegadaSaveResult).catch((e) => console.warn("[deleteChegadaColumn] Sync warning:", e));

  return true;
}

// Tasks management
export function getStoredTasks(): Record<string, ChegadaTask[]> {
  if (typeof window === "undefined") return INITIAL_TASKS;
  const saved = localStorage.getItem(TASKS_STORAGE_KEY);
  const columns = getStoredColumns();
  const result: Record<string, ChegadaTask[]> = {};

  columns.forEach((c) => {
    result[c.id] = [];
  });

  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object") {
        Object.keys(parsed).forEach((k) => {
          result[k] = Array.isArray(parsed[k]) ? parsed[k] : [];
        });
      }
    } catch (e) {
      console.error("Error loading chegada tasks:", e);
    }
  }

  return result;
}

export function saveStoredTasks(tasks: Record<string, ChegadaTask[]>, columns?: ChegadaColumn[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
  window.dispatchEvent(new CustomEvent(CHEGADA_UPDATE_EVENT, { detail: tasks }));

  const cols = columns || getStoredColumns();

  saveSharedChegadaState({
    data: {
      columns: cols,
      tasks,
      tipoOptions: getTipoAmostraOptions(),
      recebidoOptions: getRecebidoOptions(),
      expectedRev: getKnownChegadaRev(),
    },
  }).then(handleChegadaSaveResult).catch((err) => {
    console.warn("[saveStoredTasks] Sync warning:", err);
  });
}

/** Criação assíncrona com sincronização instantânea em nuvem e resposta garantida */
export async function createChegadaRegistroAsync(
  data: Omit<ChegadaTask, "id" | "criadoEm"> & { id?: string; criadoEm?: string }
): Promise<ChegadaTask> {
  const current = getStoredTasks();
  const newTask: ChegadaTask = {
    id: data.id || "amostra_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
    osCliente: (data.osCliente || "").trim(),
    dataChegada: data.dataChegada || formatDateToday(),
    recebidoPor: Array.isArray(data.recebidoPor) ? data.recebidoPor : [],
    tipoAmostra: Array.isArray(data.tipoAmostra) ? data.tipoAmostra : [],
    relacaoAmostras: data.relacaoAmostras || "",
    sup: data.sup || "",
    priority: data.priority || "media",
    images: Array.isArray(data.images) ? data.images : [],
    criadoPor: data.criadoPor || "Colaborador",
    criadoEm: data.criadoEm || formatNow(),
    origem: data.origem || "colaborador",
    updatedAt: formatNow(),
  };

  const targetCol = current.registro !== undefined ? "registro" : Object.keys(current)[0] || "registro";
  const updatedRegistro = [newTask, ...(current[targetCol] || [])].sort((a, b) => {
    if (a.priority === "alta" && b.priority !== "alta") return -1;
    if (a.priority !== "alta" && b.priority === "alta") return 1;
    return 0;
  });

  const updatedTasks = {
    ...current,
    [targetCol]: updatedRegistro,
  };

  if (typeof window !== "undefined") {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(updatedTasks));
    window.dispatchEvent(new CustomEvent(CHEGADA_UPDATE_EVENT, { detail: updatedTasks }));
  }

  // Envia para o servidor
  try {
    const res = await createSharedChegadaTask({ data });
    if (res?.fullState && typeof window !== "undefined") {
      if (Array.isArray(res.fullState.columns) && res.fullState.columns.length > 0) {
        localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(res.fullState.columns));
        window.dispatchEvent(new CustomEvent(CHEGADA_COLUMNS_EVENT, { detail: res.fullState.columns }));
      }
      localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(res.fullState.tasks));
      localStorage.setItem(TIPO_AMOSTRA_STORAGE_KEY, JSON.stringify(res.fullState.tipoOptions));
      localStorage.setItem(RECEBIDO_STORAGE_KEY, JSON.stringify(res.fullState.recebidoOptions));
      window.dispatchEvent(new CustomEvent(CHEGADA_UPDATE_EVENT, { detail: res.fullState.tasks }));
      window.dispatchEvent(new CustomEvent(CHEGADA_OPTIONS_EVENT));
      if (typeof res.fullState.rev === "number") setKnownChegadaRev(res.fullState.rev);
    }
  } catch (err) {
    console.warn("[createChegadaRegistroAsync] Erro ao sincronizar com nuvem, mantido local:", err);
  }

  return newTask;
}

export function createChegadaRegistro(
  data: Omit<ChegadaTask, "id" | "criadoEm"> & { id?: string; criadoEm?: string }
): ChegadaTask {
  const current = getStoredTasks();
  const newTask: ChegadaTask = {
    id: data.id || "amostra_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
    osCliente: (data.osCliente || "").trim(),
    dataChegada: data.dataChegada || formatDateToday(),
    recebidoPor: Array.isArray(data.recebidoPor) ? data.recebidoPor : [],
    tipoAmostra: Array.isArray(data.tipoAmostra) ? data.tipoAmostra : [],
    relacaoAmostras: data.relacaoAmostras || "",
    sup: data.sup || "",
    priority: data.priority || "media",
    images: Array.isArray(data.images) ? data.images : [],
    criadoPor: data.criadoPor || "Colaborador",
    criadoEm: data.criadoEm || formatNow(),
    origem: data.origem || "colaborador",
    updatedAt: formatNow(),
  };

  const targetCol = current.registro !== undefined ? "registro" : Object.keys(current)[0] || "registro";
  const updatedRegistro = [newTask, ...(current[targetCol] || [])].sort((a, b) => {
    if (a.priority === "alta" && b.priority !== "alta") return -1;
    if (a.priority !== "alta" && b.priority === "alta") return 1;
    return 0;
  });

  const updatedTasks = {
    ...current,
    [targetCol]: updatedRegistro,
  };

  if (typeof window !== "undefined") {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(updatedTasks));
    window.dispatchEvent(new CustomEvent(CHEGADA_UPDATE_EVENT, { detail: updatedTasks }));
  }

  createSharedChegadaTask({ data })
    .then((res) => {
      if (res?.fullState && typeof window !== "undefined") {
        if (Array.isArray(res.fullState.columns) && res.fullState.columns.length > 0) {
          localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(res.fullState.columns));
          window.dispatchEvent(new CustomEvent(CHEGADA_COLUMNS_EVENT, { detail: res.fullState.columns }));
        }
        localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(res.fullState.tasks));
        localStorage.setItem(TIPO_AMOSTRA_STORAGE_KEY, JSON.stringify(res.fullState.tipoOptions));
        localStorage.setItem(RECEBIDO_STORAGE_KEY, JSON.stringify(res.fullState.recebidoOptions));
        window.dispatchEvent(new CustomEvent(CHEGADA_UPDATE_EVENT, { detail: res.fullState.tasks }));
        window.dispatchEvent(new CustomEvent(CHEGADA_OPTIONS_EVENT));
        if (typeof res.fullState.rev === "number") setKnownChegadaRev(res.fullState.rev);
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

  addSharedChegadaOption({ data: { type: "recebido", name: clean } }).catch((err) => {
    console.warn("[addRecebidoOption] Cloud sync warning:", err);
  });

  return updated;
}

/** Hook de Sincronização em Tempo Real */
export function useChegadaRealtimeSync(
  onTasksUpdated?: (tasks: Record<string, ChegadaTask[]>) => void,
  onColumnsUpdated?: (columns: ChegadaColumn[]) => void
) {
  const syncFromServer = useCallback(async () => {
    try {
      const serverState = await fetchSharedChegadaState();
      if (serverState && typeof window !== "undefined") {
        // 1. Colunas
        if (Array.isArray(serverState.columns) && serverState.columns.length > 0) {
          const localCols = getStoredColumns();
          const serverColsJson = JSON.stringify(serverState.columns);
          const localColsJson = JSON.stringify(localCols);
          if (serverColsJson !== localColsJson) {
            localStorage.setItem(COLUMNS_STORAGE_KEY, serverColsJson);
            window.dispatchEvent(new CustomEvent(CHEGADA_COLUMNS_EVENT, { detail: serverState.columns }));
            if (onColumnsUpdated) onColumnsUpdated(serverState.columns);
          }
        }

        // 2. Tasks
        if (serverState.tasks && typeof serverState.tasks === "object") {
          const localTasks = getStoredTasks();
          const serverJson = JSON.stringify(serverState.tasks);
          const localJson = JSON.stringify(localTasks);

          if (serverJson !== localJson) {
            localStorage.setItem(TASKS_STORAGE_KEY, serverJson);
            window.dispatchEvent(new CustomEvent(CHEGADA_UPDATE_EVENT, { detail: serverState.tasks }));
            if (onTasksUpdated) onTasksUpdated(serverState.tasks);
          }
        }

        // 3. Opções
        if (Array.isArray(serverState.tipoOptions) && serverState.tipoOptions.length > 0) {
          localStorage.setItem(TIPO_AMOSTRA_STORAGE_KEY, JSON.stringify(serverState.tipoOptions));
        }
        if (Array.isArray(serverState.recebidoOptions) && serverState.recebidoOptions.length > 0) {
          localStorage.setItem(RECEBIDO_STORAGE_KEY, JSON.stringify(serverState.recebidoOptions));
        }
        window.dispatchEvent(new CustomEvent(CHEGADA_OPTIONS_EVENT));

        // Mantém a revisão conhecida em dia mesmo sem edição local — é o
        // que evita a maioria dos conflitos: ao editar, o `expectedRev`
        // enviado já reflete o quadro mais recente, não uma cópia velha.
        if (typeof serverState.rev === "number") {
          setKnownChegadaRev(serverState.rev);
        }
      }
    } catch (e) {
      // Falha silenciosa
    }
  }, [onTasksUpdated, onColumnsUpdated]);

  useEffect(() => {
    // 1. Sincroniza imediatamente na montagem
    syncFromServer();

    // 2. Polling ativo a cada 2.5 segundos para captura imediata entre dispositivos
    const interval = setInterval(syncFromServer, 2500);

    // 3. Sincroniza ao focar na janela/aba ou quando a tela se torna visível
    const handleFocus = () => syncFromServer();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") syncFromServer();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [syncFromServer]);
}
