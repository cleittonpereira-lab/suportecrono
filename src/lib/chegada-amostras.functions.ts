import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ChegadaTask, ColumnId, Option } from "./chegada-amostras-store";

const CHEGADA_SCOPE_ID = "chegada_amostras_global_state";

const DEFAULT_INITIAL_TASKS: Record<ColumnId, ChegadaTask[]> = {
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

const DEFAULT_TIPO_OPTIONS: Option[] = [
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

const DEFAULT_RECEBIDO_OPTIONS: Option[] = [
  { label: "Rafael Hereman", value: "Rafael Hereman" },
  { label: "Renan Guerra", value: "Renan Guerra" },
  { label: "Renan Adriano", value: "Renan Adriano" },
  { label: "Rodrigo Silva", value: "Rodrigo Silva" },
  { label: "Murilo Freitas", value: "Murilo Freitas" },
  { label: "Thiago Araújo", value: "Thiago Araújo" },
];

export interface SharedChegadaState {
  tasks: Record<ColumnId, ChegadaTask[]>;
  tipoOptions: Option[];
  recebidoOptions: Option[];
  updatedAt: string;
}

/** Busca o estado global compartilhado entre todos os dispositivos */
export const fetchSharedChegadaState = createServerFn({ method: "GET" })
  .handler(async (): Promise<SharedChegadaState> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("lab_index")
        .select("extra, updated_at")
        .eq("scope_id", CHEGADA_SCOPE_ID)
        .maybeSingle();

      if (!error && data?.extra && typeof data.extra === "object") {
        const extra = data.extra as any;
        return {
          tasks: {
            registro: Array.isArray(extra.tasks?.registro) ? extra.tasks.registro : [],
            recebimento: Array.isArray(extra.tasks?.recebimento) ? extra.tasks.recebimento : [],
            "abrir-os": Array.isArray(extra.tasks?.["abrir-os"]) ? extra.tasks["abrir-os"] : [],
            "os-sistema": Array.isArray(extra.tasks?.["os-sistema"]) ? extra.tasks["os-sistema"] : [],
          },
          tipoOptions: Array.isArray(extra.tipoOptions) && extra.tipoOptions.length > 0 ? extra.tipoOptions : DEFAULT_TIPO_OPTIONS,
          recebidoOptions: Array.isArray(extra.recebidoOptions) && extra.recebidoOptions.length > 0 ? extra.recebidoOptions : DEFAULT_RECEBIDO_OPTIONS,
          updatedAt: data.updated_at || new Date().toISOString(),
        };
      }
    } catch (err) {
      console.warn("[fetchSharedChegadaState] Aviso ao buscar do banco:", err);
    }

    return {
      tasks: DEFAULT_INITIAL_TASKS,
      tipoOptions: DEFAULT_TIPO_OPTIONS,
      recebidoOptions: DEFAULT_RECEBIDO_OPTIONS,
      updatedAt: new Date().toISOString(),
    };
  });

/** Salva o estado completo no banco global compartilhado */
export const saveSharedChegadaState = createServerFn({ method: "POST" })
  .validator((d: { tasks: Record<ColumnId, ChegadaTask[]>; tipoOptions?: Option[]; recebidoOptions?: Option[] }) => d)
  .handler(async ({ data }): Promise<{ success: boolean; updatedAt: string }> => {
    const nowIso = new Date().toISOString();
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Pega estado existente para não perder opções se não passadas
      const { data: existing } = await supabaseAdmin
        .from("lab_index")
        .select("extra")
        .eq("scope_id", CHEGADA_SCOPE_ID)
        .maybeSingle();

      const existingExtra = (existing?.extra as any) || {};

      const extraToSave = {
        tasks: data.tasks,
        tipoOptions: data.tipoOptions || existingExtra.tipoOptions || DEFAULT_TIPO_OPTIONS,
        recebidoOptions: data.recebidoOptions || existingExtra.recebidoOptions || DEFAULT_RECEBIDO_OPTIONS,
        savedAt: nowIso,
      };

      await supabaseAdmin.from("lab_index").upsert({
        scope_id: CHEGADA_SCOPE_ID,
        os_numero: "GLOBAL",
        os_cliente: "CHEGADA_AMOSTRAS",
        workflow_status: "ativo",
        extra: extraToSave as any,
        updated_at: nowIso,
      });

      return { success: true, updatedAt: nowIso };
    } catch (err) {
      console.error("[saveSharedChegadaState] Erro ao salvar estado global:", err);
      return { success: false, updatedAt: nowIso };
    }
  });

/** Registra uma nova chegada de amostra vinda de qualquer dispositivo */
export const createSharedChegadaTask = createServerFn({ method: "POST" })
  .validator((task: Omit<ChegadaTask, "id" | "criadoEm"> & { id?: string; criadoEm?: string }) => task)
  .handler(async ({ data }): Promise<{ success: boolean; task: ChegadaTask; fullState?: SharedChegadaState }> => {
    const nowIso = new Date().toISOString();
    const now = new Date();
    const d = String(now.getDate()).padStart(2, "0");
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const y = now.getFullYear();
    const hr = String(now.getHours()).padStart(2, "0");
    const min = String(now.getMinutes()).padStart(2, "0");
    const timeStr = `${d}/${m}/${y} ${hr}:${min}`;

    const newTask: ChegadaTask = {
      id: data.id || "amostra_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      osCliente: data.osCliente.trim(),
      dataChegada: data.dataChegada || `${d}/${m}/${y}`,
      recebidoPor: data.recebidoPor || [],
      tipoAmostra: data.tipoAmostra || [],
      relacaoAmostras: data.relacaoAmostras || "",
      sup: data.sup || "",
      priority: data.priority || "media",
      images: data.images || [],
      criadoPor: data.criadoPor || "Colaborador",
      criadoEm: data.criadoEm || timeStr,
      origem: data.origem || "colaborador",
      updatedAt: timeStr,
    };

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: existing } = await supabaseAdmin
        .from("lab_index")
        .select("extra")
        .eq("scope_id", CHEGADA_SCOPE_ID)
        .maybeSingle();

      const extra = (existing?.extra as any) || {};
      const currentTasks: Record<ColumnId, ChegadaTask[]> = {
        registro: Array.isArray(extra.tasks?.registro) ? extra.tasks.registro : [],
        recebimento: Array.isArray(extra.tasks?.recebimento) ? extra.tasks.recebimento : [],
        "abrir-os": Array.isArray(extra.tasks?.["abrir-os"]) ? extra.tasks["abrir-os"] : [],
        "os-sistema": Array.isArray(extra.tasks?.["os-sistema"]) ? extra.tasks["os-sistema"] : [],
      };

      // Adiciona o novo card na coluna registro
      currentTasks.registro = [newTask, ...currentTasks.registro].sort((a, b) => {
        if (a.priority === "alta" && b.priority !== "alta") return -1;
        if (a.priority !== "alta" && b.priority === "alta") return 1;
        return 0;
      });

      // Atualiza opções se tiverem novos itens
      let tipoOptions: Option[] = Array.isArray(extra.tipoOptions) && extra.tipoOptions.length > 0 ? extra.tipoOptions : DEFAULT_TIPO_OPTIONS;
      if (newTask.tipoAmostra.length > 0) {
        for (const t of newTask.tipoAmostra) {
          if (!tipoOptions.some(opt => opt.value.toLowerCase() === t.toLowerCase())) {
            tipoOptions = [...tipoOptions, { label: t, value: t }];
          }
        }
      }

      let recebidoOptions: Option[] = Array.isArray(extra.recebidoOptions) && extra.recebidoOptions.length > 0 ? extra.recebidoOptions : DEFAULT_RECEBIDO_OPTIONS;
      if (newTask.recebidoPor.length > 0) {
        for (const r of newTask.recebidoPor) {
          if (!recebidoOptions.some(opt => opt.value.toLowerCase() === r.toLowerCase())) {
            recebidoOptions = [...recebidoOptions, { label: r, value: r }];
          }
        }
      }

      const newExtra = {
        tasks: currentTasks,
        tipoOptions,
        recebidoOptions,
        savedAt: nowIso,
      };

      await supabaseAdmin.from("lab_index").upsert({
        scope_id: CHEGADA_SCOPE_ID,
        os_numero: newTask.osCliente.substring(0, 50),
        os_cliente: "CHEGADA_AMOSTRAS",
        workflow_status: "ativo",
        extra: newExtra as any,
        updated_at: nowIso,
      });

      return {
        success: true,
        task: newTask,
        fullState: {
          tasks: currentTasks,
          tipoOptions,
          recebidoOptions,
          updatedAt: nowIso,
        },
      };
    } catch (err) {
      console.error("[createSharedChegadaTask] Erro ao salvar card no banco:", err);
      return { success: false, task: newTask };
    }
  });

/** Adiciona uma nova opção global (tipo de amostra ou responsável) */
export const addSharedChegadaOption = createServerFn({ method: "POST" })
  .validator((d: { type: "tipo" | "recebido"; name: string }) => d)
  .handler(async ({ data }): Promise<{ success: boolean; options: Option[] }> => {
    const clean = data.name.trim();
    if (!clean) return { success: false, options: [] };

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: existing } = await supabaseAdmin
        .from("lab_index")
        .select("extra")
        .eq("scope_id", CHEGADA_SCOPE_ID)
        .maybeSingle();

      const extra = (existing?.extra as any) || {};
      const currentTipo: Option[] = Array.isArray(extra.tipoOptions) ? extra.tipoOptions : DEFAULT_TIPO_OPTIONS;
      const currentRec: Option[] = Array.isArray(extra.recebidoOptions) ? extra.recebidoOptions : DEFAULT_RECEBIDO_OPTIONS;

      let updatedOptions: Option[] = [];

      if (data.type === "tipo") {
        if (!currentTipo.some(o => o.value.toLowerCase() === clean.toLowerCase())) {
          updatedOptions = [...currentTipo, { label: clean, value: clean }];
        } else {
          updatedOptions = currentTipo;
        }
        extra.tipoOptions = updatedOptions;
      } else {
        if (!currentRec.some(o => o.value.toLowerCase() === clean.toLowerCase())) {
          updatedOptions = [...currentRec, { label: clean, value: clean }];
        } else {
          updatedOptions = currentRec;
        }
        extra.recebidoOptions = updatedOptions;
      }

      await supabaseAdmin.from("lab_index").upsert({
        scope_id: CHEGADA_SCOPE_ID,
        os_numero: "GLOBAL",
        os_cliente: "CHEGADA_AMOSTRAS",
        workflow_status: "ativo",
        extra,
        updated_at: new Date().toISOString(),
      });

      return { success: true, options: updatedOptions };
    } catch (err) {
      console.error("[addSharedChegadaOption] Erro ao salvar opcao:", err);
      return { success: false, options: [] };
    }
  });
