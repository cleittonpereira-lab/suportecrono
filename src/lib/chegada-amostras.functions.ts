import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ChegadaTask, ChegadaColumn, Option } from "./chegada-amostras-store";

/**
 * Partes de data/hora no fuso de São Paulo, a partir do instante UTC real do `Date` —
 * essencial aqui porque este arquivo roda no servidor, cujo relógio de sistema é
 * tipicamente UTC (ex.: a maioria das plataformas de hospedagem/funções na nuvem),
 * não o fuso local do Brasil. Sem essa conversão explícita, `.getHours()` no servidor
 * ficava ~3h à frente do horário real de São Paulo (bug reportado: "Hora do Registro"
 * do comprovante saindo adiantada, enquanto data/hora das fotos — que já convertem
 * pro fuso certo — saíam corretas). Duplicado propositalmente de
 * `chegada-amostras-store.ts` (mesmo padrão já usado ali) em vez de importar de lá —
 * esse arquivo roda no servidor e `chegada-amostras-store.ts` importa DESTE arquivo,
 * então importar na direção contrária criaria um ciclo de módulos.
 */
function getSaoPauloPartsServer(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function gerarNumeroControleServer(): string {
  const p = getSaoPauloPartsServer();
  return `REC-${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}`;
}
import { readDriveJson, writeDriveJson, DRIVE_ROOT_FOLDER_ID } from "@/lib/driveStorage";

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
  /**
   * Contador de revisão do quadro inteiro — incrementado a cada gravação
   * bem-sucedida. Usado para bloqueio otimista em `handleSaveSharedChegadaState`:
   * sem isso, uma aba com o quadro desatualizado podia sobrescrever por cima
   * de registros criados por outra pessoa nesse meio-tempo (bug real, ver
   * histórico — dados de "Chegada de Amostras" somem/reaparecem entre usuários).
   */
  rev: number;
}

const CHEGADA_DRIVE_FILENAME = "_chegada-amostras.json";

/** Lê o estado compartilhado direto do Drive (fonte de verdade), com fallback para os padrões na primeira execução. */
export async function readLocalChegadaState(): Promise<SharedChegadaState> {
  try {
    const parsed = await readDriveJson<SharedChegadaState>(CHEGADA_DRIVE_FILENAME, DRIVE_ROOT_FOLDER_ID);
    if (parsed && typeof parsed === "object" && parsed.tasks) {
      const columns = Array.isArray(parsed.columns) && parsed.columns.length > 0 ? parsed.columns : DEFAULT_COLUMNS;
      const tasks: Record<string, ChegadaTask[]> = {};
      columns.forEach((col: ChegadaColumn) => {
        tasks[col.id] = Array.isArray(parsed.tasks?.[col.id]) ? parsed.tasks[col.id] : [];
      });
      Object.keys(parsed.tasks).forEach((k) => {
        if (!tasks[k] && Array.isArray(parsed.tasks[k])) {
          tasks[k] = parsed.tasks[k];
        }
      });
      return {
        columns,
        tasks,
        tipoOptions: Array.isArray(parsed.tipoOptions) && parsed.tipoOptions.length > 0 ? parsed.tipoOptions : DEFAULT_TIPO_OPTIONS,
        recebidoOptions: Array.isArray(parsed.recebidoOptions) && parsed.recebidoOptions.length > 0 ? parsed.recebidoOptions : DEFAULT_RECEBIDO_OPTIONS,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
        // Arquivos gravados antes desta correção não têm `rev` — trata como 0.
        rev: typeof parsed.rev === "number" ? parsed.rev : 0,
      };
    }
  } catch (e) {
    console.warn("[readLocalChegadaState] Erro ao ler do Drive:", e);
  }

  return {
    columns: DEFAULT_COLUMNS,
    tasks: DEFAULT_INITIAL_TASKS,
    tipoOptions: DEFAULT_TIPO_OPTIONS,
    recebidoOptions: DEFAULT_RECEBIDO_OPTIONS,
    updatedAt: new Date(0).toISOString(),
    rev: 0,
  };
}

/** Grava o estado compartilhado no Drive, aguardando a escrita terminar antes de responder. */
export async function writeLocalChegadaState(state: SharedChegadaState): Promise<void> {
  await writeDriveJson(CHEGADA_DRIVE_FILENAME, state, DRIVE_ROOT_FOLDER_ID);
}

/** Handler puro de busca de estado */
export async function handleFetchSharedChegadaState(): Promise<SharedChegadaState> {
  return readLocalChegadaState();
}

/**
 * Handler puro de criação de amostra.
 *
 * Corrida com outras gravações no mesmo arquivo (ex.: o quadro do admin
 * salvando por `handleSaveSharedChegadaState` ao mesmo tempo, ou dois
 * operadores registrando quase juntos): sem proteção, um read-modify-write
 * puro faz a última gravação apagar a outra inteira — bug real de perda de
 * dados (o operador via "sucesso" na tela, mas o registro nunca chegava ao
 * quadro do admin). Diferente de `handleSaveSharedChegadaState` (que recusa
 * e pede pro cliente repetir, correto pra edição de quadro inteiro), aqui é
 * um append — dá pra resolver sozinho tentando de novo com o estado mais
 * recente, sem precisar de intervenção do usuário.
 */
export async function handleCreateSharedChegadaTask(
  data: Omit<ChegadaTask, "id" | "criadoEm"> & { id?: string; criadoEm?: string }
): Promise<{ success: boolean; task: ChegadaTask; fullState: SharedChegadaState }> {
  const p = getSaoPauloPartsServer();
  const timeStr = `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;

  const newTask: ChegadaTask = {
    id: data.id || "amostra_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 7),
    osCliente: (data.osCliente || "").trim(),
    dataChegada: data.dataChegada || `${p.day}/${p.month}/${p.year}`,
    recebidoPor: Array.isArray(data.recebidoPor) ? data.recebidoPor : [],
    tipoAmostra: Array.isArray(data.tipoAmostra) ? data.tipoAmostra : [],
    relacaoAmostras: data.relacaoAmostras || "",
    sup: data.sup || "",
    priority: data.priority || "media",
    images: Array.isArray(data.images) ? data.images : [],
    amostras: Array.isArray(data.amostras) ? data.amostras : undefined,
    assinaturaCliente: data.assinaturaCliente ?? null,
    observacoes: data.observacoes || "",
    criadoPor: data.criadoPor || "Colaborador",
    criadoEm: data.criadoEm || timeStr,
    origem: data.origem || "colaborador",
    numeroControle: data.numeroControle || gerarNumeroControleServer(),
    updatedAt: timeStr,
  };

  const MAX_ATTEMPTS = 6;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const currentState = await readLocalChegadaState();
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

    const tipoOptions = [...(currentState.tipoOptions || DEFAULT_TIPO_OPTIONS)];
    for (const t of newTask.tipoAmostra) {
      if (!tipoOptions.some((opt) => opt.value.toLowerCase() === t.toLowerCase())) {
        tipoOptions.push({ label: t, value: t });
      }
    }

    const recebidoOptions = [...(currentState.recebidoOptions || DEFAULT_RECEBIDO_OPTIONS)];
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
      updatedAt: new Date().toISOString(),
      rev: currentState.rev + 1,
    };

    // Confere de novo, bem antes de gravar, se ninguém escreveu nesse meio
    // tempo — se escreveu, descarta essa tentativa e recomeça com o estado
    // fresco (em vez de sobrescrever com base numa leitura já desatualizada).
    const verifyState = await readLocalChegadaState();
    if (verifyState.rev !== currentState.rev) {
      continue;
    }

    await writeLocalChegadaState(fullState);

    return {
      success: true,
      task: newTask,
      fullState,
    };
  }

  throw new Error(
    "Não foi possível registrar a chegada — muitas gravações concorrentes no momento. Tente novamente em instantes.",
  );
}

/**
 * Handler puro de salvamento de estado.
 *
 * Bloqueio otimista: o cliente manda o `rev` que ele leu por último
 * (`expectedRev`). Se o `rev` atual no Drive já for maior que isso, alguém
 * gravou uma mudança nesse meio-tempo — recusa a gravação (em vez de
 * sobrescrever o quadro inteiro com uma cópia desatualizada) e devolve o
 * estado atual pro cliente se atualizar e o usuário repetir a ação.
 * Sem isso, uma aba com o quadro velho na memória apagava silenciosamente
 * registros criados por outra pessoa (bug real de perda de dados).
 */
export async function handleSaveSharedChegadaState(data: {
  tasks: Record<string, ChegadaTask[]>;
  columns?: ChegadaColumn[];
  tipoOptions?: Option[];
  recebidoOptions?: Option[];
  expectedRev?: number;
}): Promise<
  | { success: true; updatedAt: string; rev: number }
  | { success: false; conflict: true; currentState: SharedChegadaState }
> {
  const nowIso = new Date().toISOString();
  const currentState = await readLocalChegadaState();

  if (typeof data.expectedRev === "number" && currentState.rev > data.expectedRev) {
    return { success: false, conflict: true, currentState };
  }

  const columns = data.columns || currentState.columns || DEFAULT_COLUMNS;
  const tasks = data.tasks || currentState.tasks;
  const tipoOptions = data.tipoOptions || currentState.tipoOptions || DEFAULT_TIPO_OPTIONS;
  const recebidoOptions = data.recebidoOptions || currentState.recebidoOptions || DEFAULT_RECEBIDO_OPTIONS;
  const rev = currentState.rev + 1;

  const newState: SharedChegadaState = {
    columns,
    tasks,
    tipoOptions,
    recebidoOptions,
    updatedAt: nowIso,
    rev,
  };

  await writeLocalChegadaState(newState);

  return { success: true, updatedAt: nowIso, rev };
}

/** Handler puro de opções */
export async function handleAddSharedChegadaOption(data: {
  type: "tipo" | "recebido";
  name: string;
}): Promise<{ success: boolean; options: Option[] }> {
  const clean = data.name.trim();
  if (!clean) return { success: false, options: [] };

  const MAX_ATTEMPTS = 6;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const currentState = await readLocalChegadaState();
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
    currentState.rev = currentState.rev + 1;

    // Mesma proteção de `handleCreateSharedChegadaTask` — confere de novo
    // antes de gravar, pra não apagar uma gravação concorrente.
    const verifyState = await readLocalChegadaState();
    if (verifyState.rev !== currentState.rev - 1) {
      continue;
    }

    await writeLocalChegadaState(currentState);
    return { success: true, options: updatedOptions };
  }

  throw new Error("Não foi possível salvar a opção — muitas gravações concorrentes no momento. Tente novamente.");
}

// Server Functions exportadas para o TanStack Start / SSR
export const fetchSharedChegadaState = createServerFn({ method: "GET" })
  .handler(async (): Promise<SharedChegadaState> => {
    return handleFetchSharedChegadaState();
  });

export const saveSharedChegadaState = createServerFn({ method: "POST" })
  .validator(
    (d: {
      tasks: Record<string, ChegadaTask[]>;
      columns?: ChegadaColumn[];
      tipoOptions?: Option[];
      recebidoOptions?: Option[];
      expectedRev?: number;
    }) => d,
  )
  .handler(async ({ data }) => {
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
