import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ChegadaTask, ChegadaColumn, Option } from "./chegada-amostras-store";
import fs from "node:fs";
import path from "node:path";

const CHEGADA_SCOPE_ID = "chegada_amostras_global_state";

export const DEFAULT_COLUMNS: ChegadaColumn[] = [
  { id: "registro", title: "Registro", subtitle: "Chegada de amostras", isSystem: true },
  { id: "recebimento", title: "Recebimento", subtitle: "Conferência inicial" },
  { id: "abrir-os", title: "Abrir OS", subtitle: "Abertura no sistema" },
  { id: "os-sistema", title: "OS no Sistema", subtitle: "Em processamento" },
];

export const DEFAULT_TIPO_OPTIONS: Option[] = [
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

const DEFAULT_INITIAL_TASKS: Record<string, ChegadaTask[]> = {
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

export interface SharedChegadaState {
  columns: ChegadaColumn[];
  tasks: Record<string, ChegadaTask[]>;
  tipoOptions: Option[];
  recebidoOptions: Option[];
  updatedAt: string;
}

const CHEGADA_DRIVE_FILENAME = "_chegada-amostras.json";

// Persistência local no servidor em .data/chegada_amostras.json
function getLocalChegadaFile(): string {
  const dir = path.join(process.cwd(), ".data");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, "chegada_amostras.json");
}

export function readLocalChegadaState(): SharedChegadaState {
  try {
    const file = getLocalChegadaFile();
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const columns = Array.isArray(parsed.columns) && parsed.columns.length > 0 ? parsed.columns : DEFAULT_COLUMNS;
        const tasks: Record<string, ChegadaTask[]> = {};
        columns.forEach((col: ChegadaColumn) => {
          tasks[col.id] = Array.isArray(parsed.tasks?.[col.id]) ? parsed.tasks[col.id] : [];
        });
        if (parsed.tasks && typeof parsed.tasks === "object") {
          Object.keys(parsed.tasks).forEach((k) => {
            if (!tasks[k] && Array.isArray(parsed.tasks[k])) {
              tasks[k] = parsed.tasks[k];
            }
          });
        }
        return {
          columns,
          tasks,
          tipoOptions: Array.isArray(parsed.tipoOptions) && parsed.tipoOptions.length > 0 ? parsed.tipoOptions : DEFAULT_TIPO_OPTIONS,
          recebidoOptions: Array.isArray(parsed.recebidoOptions) && parsed.recebidoOptions.length > 0 ? parsed.recebidoOptions : DEFAULT_RECEBIDO_OPTIONS,
          updatedAt: parsed.updatedAt || new Date().toISOString(),
        };
      }
    }
  } catch (e) {
    console.warn("[readLocalChegadaState] Erro:", e);
  }

  return {
    columns: DEFAULT_COLUMNS,
    tasks: DEFAULT_INITIAL_TASKS,
    tipoOptions: DEFAULT_TIPO_OPTIONS,
    recebidoOptions: DEFAULT_RECEBIDO_OPTIONS,
    updatedAt: new Date().toISOString(),
  };
}

export function writeLocalChegadaState(state: SharedChegadaState): void {
  try {
    const file = getLocalChegadaFile();
    fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
  } catch (e) {
    console.warn("[writeLocalChegadaState] Erro:", e);
  }

  // Grava de forma assíncrona no Google Drive
  try {
    import("@/lib/driveStorage").then(({ writeDriveJson, DRIVE_ROOT_FOLDER_ID }) => {
      writeDriveJson(CHEGADA_DRIVE_FILENAME, state, DRIVE_ROOT_FOLDER_ID).catch(() => {});
    });
  } catch {}
}

/** Handler puro de busca de estado */
export async function handleFetchSharedChegadaState(): Promise<SharedChegadaState> {
  const localState = readLocalChegadaState();

  // 1. Tenta buscar no Google Drive Soberano
  try {
    const { readDriveJson, DRIVE_ROOT_FOLDER_ID } = await import("@/lib/driveStorage");
    const driveState = await readDriveJson<SharedChegadaState>(CHEGADA_DRIVE_FILENAME, DRIVE_ROOT_FOLDER_ID);
    if (driveState?.tasks && typeof driveState.tasks === "object") {
      const driveUpdatedAt = driveState.updatedAt ? new Date(driveState.updatedAt).getTime() : 0;
      const localUpdatedAt = localState.updatedAt ? new Date(localState.updatedAt).getTime() : 0;

      if (driveUpdatedAt >= localUpdatedAt || Object.keys(localState.tasks).length === 0) {
        writeLocalChegadaState(driveState);
        return driveState;
      }
    }
  } catch {}

  // 2. Fallback no Supabase
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("lab_index")
      .select("extra, updated_at")
      .eq("scope_id", CHEGADA_SCOPE_ID)
      .maybeSingle();

    if (!error && data?.extra && typeof data.extra === "object") {
      const extra = data.extra as any;
      if (extra.tasks && typeof extra.tasks === "object") {
        const dbUpdatedAt = data.updated_at ? new Date(data.updated_at).getTime() : 0;
        const localUpdatedAt = localState.updatedAt ? new Date(localState.updatedAt).getTime() : 0;

        if (dbUpdatedAt >= localUpdatedAt || Object.keys(localState.tasks).length === 0) {
          const columns: ChegadaColumn[] = Array.isArray(extra.columns) && extra.columns.length > 0
            ? extra.columns
            : localState.columns;

          const mergedTasks: Record<string, ChegadaTask[]> = { ...localState.tasks };
          columns.forEach((col) => {
            mergedTasks[col.id] = Array.isArray(extra.tasks?.[col.id]) ? extra.tasks[col.id] : (mergedTasks[col.id] || []);
          });

          const mergedState: SharedChegadaState = {
            columns,
            tasks: mergedTasks,
            tipoOptions: Array.isArray(extra.tipoOptions) && extra.tipoOptions.length > 0 ? extra.tipoOptions : localState.tipoOptions,
            recebidoOptions: Array.isArray(extra.recebidoOptions) && extra.recebidoOptions.length > 0 ? extra.recebidoOptions : localState.recebidoOptions,
            updatedAt: data.updated_at || new Date().toISOString(),
          };

          writeLocalChegadaState(mergedState);
          return mergedState;
        }
      }
    }
  } catch (err) {
    console.warn("[handleFetchSharedChegadaState] Aviso Supabase:", err);
  }

  return localState;
}

/** Handler puro de criação de amostra */
export async function handleCreateSharedChegadaTask(
  data: Omit<ChegadaTask, "id" | "criadoEm"> & { id?: string; criadoEm?: string }
): Promise<{ success: boolean; task: ChegadaTask; fullState: SharedChegadaState }> {
  const nowIso = new Date().toISOString();
  const now = new Date();
  const d = String(now.getDate()).padStart(2, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const y = now.getFullYear();
  const hr = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const timeStr = `${d}/${m}/${y} ${hr}:${min}`;

  const newTask: ChegadaTask = {
    id: data.id || "amostra_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 7),
    osCliente: (data.osCliente || "").trim(),
    dataChegada: data.dataChegada || `${d}/${m}/${y}`,
    recebidoPor: Array.isArray(data.recebidoPor) ? data.recebidoPor : [],
    tipoAmostra: Array.isArray(data.tipoAmostra) ? data.tipoAmostra : [],
    relacaoAmostras: data.relacaoAmostras || "",
    sup: data.sup || "",
    priority: data.priority || "media",
    images: Array.isArray(data.images) ? data.images : [],
    criadoPor: data.criadoPor || "Colaborador",
    criadoEm: data.criadoEm || timeStr,
    origem: data.origem || "colaborador",
    updatedAt: timeStr,
  };

  const currentState = readLocalChegadaState();
  const columns = currentState.columns || DEFAULT_COLUMNS;
  const currentTasks: Record<string, ChegadaTask[]> = { ...currentState.tasks };

  columns.forEach((col) => {
    if (!currentTasks[col.id]) {
      currentTasks[col.id] = [];
    }
  });

  const targetCol = currentTasks.registro !== undefined ? "registro" : columns[0].id;
  const existingList = currentTasks[targetCol] || [];

  const filteredList = existingList.filter((t) => t.id !== newTask.id);
  currentTasks[targetCol] = [newTask, ...filteredList].sort((a, b) => {
    if (a.priority === "alta" && b.priority !== "alta") return -1;
    if (a.priority !== "alta" && b.priority === "alta") return 1;
    return 0;
  });

  let tipoOptions = [...(currentState.tipoOptions || DEFAULT_TIPO_OPTIONS)];
  for (const t of newTask.tipoAmostra) {
    if (!tipoOptions.some((opt) => opt.value.toLowerCase() === t.toLowerCase())) {
      tipoOptions.push({ label: t, value: t });
    }
  }

  let recebidoOptions = [...(currentState.recebidoOptions || DEFAULT_RECEBIDO_OPTIONS)];
  for (const r of newTask.recebidoPor) {
    if (!recebidoOptions.some((opt) => opt.value.toLowerCase() === r.toLowerCase())) {
      recebidoOptions.push({ label: r, value: r });
    }
  }

  const fullState: SharedChegadaState = {
    columns,
    tasks: currentTasks,
    tipoOptions,
    recebidoOptions,
    updatedAt: nowIso,
  };

  writeLocalChegadaState(fullState);

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("lab_index").upsert({
      scope_id: CHEGADA_SCOPE_ID,
      os_numero: newTask.osCliente.substring(0, 50),
      os_cliente: "CHEGADA_AMOSTRAS",
      workflow_status: "ativo",
      extra: fullState as any,
      updated_at: nowIso,
    });
  } catch (err) {
    console.warn("[handleCreateSharedChegadaTask] Aviso Supabase:", err);
  }

  return {
    success: true,
    task: newTask,
    fullState,
  };
}

/** Handler puro de salvamento de estado */
export async function handleSaveSharedChegadaState(data: {
  tasks: Record<string, ChegadaTask[]>;
  columns?: ChegadaColumn[];
  tipoOptions?: Option[];
  recebidoOptions?: Option[];
}): Promise<{ success: boolean; updatedAt: string }> {
  const nowIso = new Date().toISOString();
  const currentState = readLocalChegadaState();

  const columns = data.columns || currentState.columns || DEFAULT_COLUMNS;
  const tasks = data.tasks || currentState.tasks;
  const tipoOptions = data.tipoOptions || currentState.tipoOptions || DEFAULT_TIPO_OPTIONS;
  const recebidoOptions = data.recebidoOptions || currentState.recebidoOptions || DEFAULT_RECEBIDO_OPTIONS;

  const newState: SharedChegadaState = {
    columns,
    tasks,
    tipoOptions,
    recebidoOptions,
    updatedAt: nowIso,
  };

  writeLocalChegadaState(newState);

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("lab_index").upsert({
      scope_id: CHEGADA_SCOPE_ID,
      os_numero: "GLOBAL",
      os_cliente: "CHEGADA_AMOSTRAS",
      workflow_status: "ativo",
      extra: newState as any,
      updated_at: nowIso,
    });
  } catch (err) {
    console.warn("[handleSaveSharedChegadaState] Aviso Supabase:", err);
  }

  return { success: true, updatedAt: nowIso };
}

/** Handler puro de opções */
export async function handleAddSharedChegadaOption(data: {
  type: "tipo" | "recebido";
  name: string;
}): Promise<{ success: boolean; options: Option[] }> {
  const clean = data.name.trim();
  if (!clean) return { success: false, options: [] };

  const currentState = readLocalChegadaState();
  let updatedOptions: Option[] = [];

  if (data.type === "tipo") {
    const currentTipo = currentState.tipoOptions || DEFAULT_TIPO_OPTIONS;
    if (!currentTipo.some((o) => o.value.toLowerCase() === clean.toLowerCase())) {
      updatedOptions = [...currentTipo, { label: clean, value: clean }];
    } else {
      updatedOptions = currentTipo;
    }
    currentState.tipoOptions = updatedOptions;
  } else {
    const currentRec = currentState.recebidoOptions || DEFAULT_RECEBIDO_OPTIONS;
    if (!currentRec.some((o) => o.value.toLowerCase() === clean.toLowerCase())) {
      updatedOptions = [...currentRec, { label: clean, value: clean }];
    } else {
      updatedOptions = currentRec;
    }
    currentState.recebidoOptions = updatedOptions;
  }

  currentState.updatedAt = new Date().toISOString();
  writeLocalChegadaState(currentState);

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("lab_index").upsert({
      scope_id: CHEGADA_SCOPE_ID,
      os_numero: "GLOBAL",
      os_cliente: "CHEGADA_AMOSTRAS",
      workflow_status: "ativo",
      extra: currentState as any,
      updated_at: currentState.updatedAt,
    });
  } catch (err) {
    console.warn("[handleAddSharedChegadaOption] Aviso Supabase:", err);
  }

  return { success: true, options: updatedOptions };
}

// Server Functions exportadas para o TanStack Start / SSR
export const fetchSharedChegadaState = createServerFn({ method: "GET" })
  .handler(async (): Promise<SharedChegadaState> => {
    return handleFetchSharedChegadaState();
  });

export const saveSharedChegadaState = createServerFn({ method: "POST" })
  .validator((d: { tasks: Record<string, ChegadaTask[]>; columns?: ChegadaColumn[]; tipoOptions?: Option[]; recebidoOptions?: Option[] }) => d)
  .handler(async ({ data }): Promise<{ success: boolean; updatedAt: string }> => {
    return handleSaveSharedChegadaState(data);
  });

export const createSharedChegadaTask = createServerFn({ method: "POST" })
  .validator((task: Omit<ChegadaTask, "id" | "criadoEm"> & { id?: string; criadoEm?: string }) => task)
  .handler(async ({ data }): Promise<{ success: boolean; task: ChegadaTask; fullState: SharedChegadaState }> => {
    return handleCreateSharedChegadaTask(data);
  });

export const addSharedChegadaOption = createServerFn({ method: "POST" })
  .validator((d: { type: "tipo" | "recebido"; name: string }) => d)
  .handler(async ({ data }): Promise<{ success: boolean; options: Option[] }> => {
    return handleAddSharedChegadaOption(data);
  });
