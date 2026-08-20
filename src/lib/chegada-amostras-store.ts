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
  dataChegada: string; // "DD/MM/YYYY"
  recebidoPor: string[];
  tipoAmostra: string[];
  relacaoAmostras: string;
  sup: string;
  priority: Priority;
  images: string[];
  criadoPor?: string;
  criadoEm?: string; // "DD/MM/YYYY HH:mm"
  origem?: RegistroOrigem;
  updatedAt?: string;
}

export const COLUMNS: { id: ColumnId; title: string }[] = [
  { id: "registro", title: "Registro" },
  { id: "recebimento", title: "Recebimento" },
  { id: "abrir-os", title: "Abrir OS" },
  { id: "os-sistema", title: "OS no sistema" },
];

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

const TASKS_STORAGE_KEY = "chegada_amostras_tasks";
const TIPO_AMOSTRA_STORAGE_KEY = "chegada_amostras_tipo_options";
const RECEBIDO_STORAGE_KEY = "chegada_amostras_recebido_options";

export const CHEGADA_UPDATE_EVENT = "chegada_amostras_update";
export const CHEGADA_OPTIONS_EVENT = "chegada_options_update";

export const INITIAL_TASKS: Record<ColumnId, ChegadaTask[]> = {
  registro: [
    {
      id: "1",
      osCliente: "Alfa / OS 1029",
      dataChegada: "05/08/2026",
      recebidoPor: ["Rafael Hereman"],
      tipoAmostra: ["DEF.1"],
      relacaoAmostras: "5 sacos de solo argiloso",
      sup: "CONTRATO-001",
      priority: "alta",
      images: [],
      criadoPor: "Administrador",
      criadoEm: "05/08/2026 09:30",
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

// Tasks management
export function getStoredTasks(): Record<ColumnId, ChegadaTask[]> {
  if (typeof window === "undefined") return INITIAL_TASKS;
  const saved = localStorage.getItem(TASKS_STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Ensure all columns exist
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
}

export function createChegadaRegistro(
  data: Omit<ChegadaTask, "id" | "criadoEm"> & { id?: string; criadoEm?: string }
): ChegadaTask {
  const current = getStoredTasks();
  const newTask: ChegadaTask = {
    id: data.id || Math.random().toString(36).substring(2, 9),
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

  saveStoredTasks(updatedTasks);
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
  return updated;
}
