import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { insertRow, updateRow, listRows } from "@/lib/programacao.functions";
import { optimizeSchedule } from "@/lib/ai-optimize.functions";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertCircle,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Zap,
  Bot,
  Target,
  Loader2,
  ArrowLeftRight,
  Layers,
  FlaskConical,
  AlertTriangle,
  CheckCircle2,
  ChevronUp,
  Split,
  Settings2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  allocateWorkloadOnDays,
  endIsoFromDur,
  nextBusinessDayIso,
  subBusinessDaysIso,
  nextAvailableWorkDay,
  normalizeDurationDays,
} from "@/lib/business-days";


/* ---------------------------------- Tipos ---------------------------------- */
type Amostra = {
  id: string;
  os_numero: string;
  codigo_amostra: string | null;
  tomador?: string | null;
};
type Ensaio = {
  id: string;
  amostra_id: string;
  tipo_ensaio_id: string;
  status: string;
  prazo: string | null;
  observacoes?: string | null;
  detalhes_tecnicos?: string | null;
};
type TipoEnsaio = {
  id: string;
  nome: string;
  cor_gantt: string | null;
  equipamentos_ids?: string[];
};
type Equipamento = { id: string; nome: string };
type Programacao = {
  id: string;
  ensaio_id: string;
  status: string;
  data_inicio_prevista: string | null;
  duracao_dias: number;
  data_fim: string | null;
  equipamento_id: string | null;
  incluir_fds: boolean;
};

type PlanItem = {
  ensaioId: string;
  equipId: string | null;
  inicio: string;
  fim: string;
  dur: number;
  motivo?: string;
  isSplit?: boolean;
  parentEnsaioId?: string;
  incluirFds?: boolean;
  equipExcluidos?: string[];
};

type OverridesByTipo = Record<string, { fds: boolean; excludes: string[] }>;


type Modo = "cascata" | "otimizada" | "ia";

const SHEET_PROGS = "Programações";

/* --------------------------------- Utils --------------------------------- */
const todayIso = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};
const fmtBr = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date((iso.length === 10 ? iso + "T00:00:00" : iso));
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};
const diffDays = (a: string, b: string) => {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((da - db) / 86_400_000);
};

/* -------------------------- Componente principal -------------------------- */
export function BulkProgramarDialog({
  open,
  onOpenChange,
  amostras,
  ensaios,
  tipos,
  equipamentos,
  programacoes,
  osDeadlines,
  osTomadores,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  amostras: Amostra[];
  ensaios: Ensaio[];
  tipos: TipoEnsaio[];
  equipamentos: Equipamento[];
  programacoes: Programacao[];
  /** deadline (data de entrega prevista) por OS, ISO YYYY-MM-DD */
  osDeadlines: Map<string, string>;
  /** tomador por OS (para exibir na lista) */
  osTomadores: Map<string, string>;
}) {
  const qc = useQueryClient();
  const insertFn = useServerFn(insertRow);
  const updateFn = useServerFn(updateRow);
  const optimizeFn = useServerFn(optimizeSchedule);
  const equipMut = useMutation({
    mutationFn: () => listRows({ data: { sheet: "Equipamentos" } }),
  });


  const [tab, setTab] = useState<"selecionar" | "cascata" | "preview">("selecionar");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>("__all__");
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [agrupamento, setAgrupamento] = useState<"os" | "tipo">("os");
  const [startDate, setStartDate] = useState<string>(todayIso());
  const [startMode, setStartMode] = useState<"asap" | "custom">("asap");
  const [startDatesByTipo, setStartDatesByTipo] = useState<Record<string, string>>({});
  const [dursByTipo, setDursByTipo] = useState<Record<string, string>>({});
  const [equipByTipo, setEquipByTipo] = useState<Record<string, string>>({});
  const [incluirFds, setIncluirFds] = useState(false);
  const [obsBulk, setObsBulk] = useState("");
  const [ordem, setOrdem] = useState<"prazo" | "os" | "tipo">("prazo");
  const [modo, setModo] = useState<Modo>("cascata");
  const [iaLoading, setIaLoading] = useState(false);
  const [plano, setPlano] = useState<PlanItem[] | null>(null);
  const [overrides, setOverrides] = useState<OverridesByTipo>({});
  const [startDatesByOs, setStartDatesByOs] = useState<Record<string, string>>({});


  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setTab("selecionar");
      setSel(new Set());
      setBusca("");
      setFiltroTipo("__all__");
      setStartDate(todayIso());
      setStartMode("asap");
      setStartDatesByTipo({});
      setStartDatesByOs({});
      setEquipByTipo({});
      setIncluirFds(false);
      setObsBulk("");
      setOrdem("prazo");
      setModo("cascata");
      setPlano(null);
      setExpandidas(new Set());
      setAgrupamento("os");
    }
  }, [open]);

  const amostraById = useMemo(() => new Map(amostras.map((a) => [a.id, a])), [amostras]);
  const tipoById = useMemo(() => new Map(tipos.map((t) => [t.id, t])), [tipos]);
  const equipById = useMemo(() => new Map(equipamentos.map((e) => [e.id, e])), [equipamentos]);

  // Tipos presentes na seleção — para os cards de duração
  const tiposSelecionados = useMemo(() => {
    const ids = new Set<string>();
    for (const e of ensaios) if (sel.has(e.id)) ids.add(e.tipo_ensaio_id);
    return Array.from(ids)
      .map((id) => tipoById.get(id))
      .filter((t): t is TipoEnsaio => !!t)
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [sel, ensaios, tipoById]);

  // Inicializa duração dos tipos ao entrar na cascata (padrão 1 dia)
  useEffect(() => {
    if (tab !== "cascata") return;
    setDursByTipo((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const t of tiposSelecionados) {
        if (next[t.id] == null) {
          next[t.id] = "1";
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tab, tiposSelecionados]);

  const durOf = (tipoId: string): number => {
    return normalizeDurationDays(dursByTipo[tipoId] ?? "1", 1);
  };
  const equipsCompatOf = (tipoId: string): Equipamento[] => {
    const tipo = tipoById.get(tipoId);
    const allowed = tipo?.equipamentos_ids ?? [];
    return allowed.length > 0
      ? equipamentos.filter((eq) => allowed.includes(eq.id))
      : equipamentos;
  };
  const resolvedEquipsOf = (tipoId: string): Equipamento[] => {
    const pick = equipByTipo[tipoId];
    const compat = equipsCompatOf(tipoId);
    if (!pick || pick === "__auto__") return compat;
    const one = compat.find((e) => e.id === pick);
    return one ? [one] : compat;
  };
  const alvoDaOs = (os: string): string | null => {
    const dl = osDeadlines.get(os);
    if (!dl) return null;
    return subBusinessDaysIso(dl, 3, incluirFds);
  };

  const addLoad = (
    dayLoads: Map<string, number>,
    startIso: string | null | undefined,
    duracao: unknown,
    useFds: boolean,
  ) => {
    if (!startIso) return;
    allocateWorkloadOnDays(dayLoads, startIso, duracao, useFds);
  };

  const seedEquipmentLoads = () => {
    const loads = new Map<string, Map<string, number>>();
    for (const p of programacoes) {
      if (!p.equipamento_id) continue;
      const dayLoads = loads.get(p.equipamento_id) ?? new Map<string, number>();
      addLoad(dayLoads, p.data_inicio_prevista || p.data_fim, p.duracao_dias || 1, p.incluir_fds);
      loads.set(p.equipamento_id, dayLoads);
    }
    return loads;
  };

  const loadsFor = (loads: Map<string, Map<string, number>>, equipId: string) => {
    const existing = loads.get(equipId);
    if (existing) return existing;
    const created = new Map<string, number>();
    loads.set(equipId, created);
    return created;
  };

  // Ensaios sem programação
  const pendentes = useMemo(() => {
    const progIds = new Set(programacoes.map((p) => p.ensaio_id));
    return ensaios.filter(
      (e) => !progIds.has(e.id) && e.status !== "cancelado" && e.status !== "concluido",
    );
  }, [ensaios, programacoes]);

  // Filtragem
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pendentes.filter((e) => {
      if (filtroTipo !== "__all__" && e.tipo_ensaio_id !== filtroTipo) return false;
      if (!q) return true;
      const a = amostraById.get(e.amostra_id);
      const t = tipoById.get(e.tipo_ensaio_id);
      const hay = `${a?.os_numero ?? ""} ${a?.codigo_amostra ?? ""} ${a?.tomador ?? ""} ${t?.nome ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [pendentes, busca, filtroTipo, amostraById, tipoById]);

  // Agrupamento por OS
  const grupos = useMemo(() => {
    const map = new Map<string, Ensaio[]>();
    for (const e of filtrados) {
      const a = amostraById.get(e.amostra_id);
      const os = a?.os_numero || (e as any).os_numero || (e as any).os || "Geral";
      const arr = map.get(os) ?? [];
      arr.push(e);
      map.set(os, arr);
    }
    // Ordena OSs por prazo asc (sem prazo por último)
    return Array.from(map.entries()).sort(([a], [b]) => {
      const da = osDeadlines.get(a) || "9999-12-31";
      const db = osDeadlines.get(b) || "9999-12-31";
      if (da !== db) return da.localeCompare(db);
      return a.localeCompare(b);
    });
  }, [filtrados, amostraById, osDeadlines]);

  // Agrupamento por tipo de ensaio — útil quando entram muitas amostras do mesmo ensaio
  const gruposTipo = useMemo(() => {
    const map = new Map<string, Ensaio[]>();
    for (const e of filtrados) {
      const arr = map.get(e.tipo_ensaio_id) ?? [];
      arr.push(e);
      map.set(e.tipo_ensaio_id, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      const na = tipoById.get(a)?.nome || "";
      const nb = tipoById.get(b)?.nome || "";
      return na.localeCompare(nb);
    });
  }, [filtrados, tipoById]);

  const toggleOs = (os: string, ens: Ensaio[]) => {
    setSel((prev) => {
      const next = new Set(prev);
      const allIn = ens.every((e) => next.has(e.id));
      if (allIn) ens.forEach((e) => next.delete(e.id));
      else ens.forEach((e) => next.add(e.id));
      return next;
    });
  };
  const toggleAll = () => {
    setSel((prev) => {
      const allIn = filtrados.every((e) => prev.has(e.id));
      if (allIn) return new Set();
      return new Set(filtrados.map((e) => e.id));
    });
  };
  const toggleExp = (os: string) => {
    setExpandidas((prev) => {
      const n = new Set(prev);
      if (n.has(os)) n.delete(os);
      else n.add(os);
      return n;
    });
  };

  const toggleTipoSel = (tipoId: string, ens: Ensaio[]) => {
    setSel((prev) => {
      const next = new Set(prev);
      const allIn = ens.every((e) => next.has(e.id));
      if (allIn) ens.forEach((e) => next.delete(e.id));
      else ens.forEach((e) => next.add(e.id));
      return next;
    });
  };

  /* ------------------------------ Cascata ------------------------------ */
  const buildPlan = (): PlanItem[] => {
    const selecionados = filtrados.filter((e) => sel.has(e.id));
    if (selecionados.length === 0) return [];

    // Ocupação inicial por equipamento a partir das programações existentes.
    const equipmentLoads = seedEquipmentLoads();

    const baseStart = nextBusinessDayIso(startDate, incluirFds);

    // Mapeamento de amostra para ensaios selecionados (para encontrar ensaios da mesma OS)
    const ensaiosPorOs = new Map<string, Ensaio[]>();
    for (const e of selecionados) {
      const os = amostraById.get(e.amostra_id)?.os_numero || "—";
      const arr = ensaiosPorOs.get(os) ?? [];
      arr.push(e);
      ensaiosPorOs.set(os, arr);
    }

    // Ordenação da fila
    const sorted = [...selecionados].sort((a, b) => {
      const aa = amostraById.get(a.amostra_id);
      const bb = amostraById.get(b.amostra_id);
      
      // Se forem da mesma OS, respeita o Start Date da OS se existir
      if (aa?.os_numero === bb?.os_numero && aa?.os_numero) {
        // Dentro da mesma OS, a ordem secundária pode ser por tipo ou prazo
      }

      if (ordem === "prazo" || modo === "otimizada") {
        const pa =
          (aa?.os_numero && startDatesByOs[aa.os_numero]) ||
          (aa?.os_numero && alvoDaOs(aa.os_numero)) ||
          osDeadlines.get(aa?.os_numero ?? "") ||
          a.prazo ||
          "9999-12-31";
        const pb =
          (bb?.os_numero && startDatesByOs[bb.os_numero]) ||
          (bb?.os_numero && alvoDaOs(bb.os_numero)) ||
          osDeadlines.get(bb?.os_numero ?? "") ||
          b.prazo ||
          "9999-12-31";
        if (pa !== pb) return pa.localeCompare(pb);
      } else if (ordem === "tipo") {
        const ta = tipoById.get(a.tipo_ensaio_id)?.nome || "";
        const tb = tipoById.get(b.tipo_ensaio_id)?.nome || "";
        if (ta !== tb) return ta.localeCompare(tb);
      }
      const oa = aa?.os_numero || "";
      const ob = bb?.os_numero || "";
      if (oa !== ob) return oa.localeCompare(ob);
      return (aa?.codigo_amostra || "").localeCompare(bb?.codigo_amostra || "");
    });

    const plan: PlanItem[] = [];
    for (const e of sorted) {
      const a = amostraById.get(e.amostra_id);
      const osStart = a?.os_numero ? startDatesByOs[a.os_numero] : null;
      const typeStart = startDatesByTipo[e.tipo_ensaio_id];

      // Prioridade: Data por OS > Data por Tipo > Base Start
      let startAdj = baseStart;
      if (startMode === "custom") {
        if (osStart) {
          startAdj = nextBusinessDayIso(osStart, incluirFds);
        } else if (typeStart) {
          startAdj = nextBusinessDayIso(typeStart, incluirFds);
        }
      }

      const typeOverrides = overrides[e.tipo_ensaio_id];
      const taskFds = typeOverrides?.fds ?? incluirFds;
      const excludes = typeOverrides?.excludes ?? [];

      const candidatos = resolvedEquipsOf(e.tipo_ensaio_id).filter(eq => !excludes.includes(eq.id));
      const totalDur = durOf(e.tipo_ensaio_id);

      if (candidatos.length === 0) {
        plan.push({
          ensaioId: e.id,
          equipId: null,
          inicio: startAdj,
          fim: endIsoFromDur(startAdj, totalDur, taskFds),
          dur: totalDur,
          motivo: "Sem equipamento disponível ou todos excluídos",
          incluirFds: taskFds
        });
        continue;
      }

      let best: { eq: Equipamento; inicio: string; dayLoads: Map<string, number> } | null = null;
      for (const eq of candidatos) {
        const eqOverride = overrides[eq.id];
        const useFdsForEq = eqOverride?.fds ?? taskFds;
        
        const dayLoads = loadsFor(equipmentLoads, eq.id);
        const inicioEq = nextAvailableWorkDay(dayLoads, startAdj, useFdsForEq, totalDur);
        if (!best || inicioEq < best.inicio) best = { eq, inicio: inicioEq, dayLoads };
      }

      const eqOverride = best ? overrides[best.eq.id] : null;
      const finalFds = eqOverride?.fds ?? taskFds;

      const allocated = allocateWorkloadOnDays(best!.dayLoads, best!.inicio, totalDur, finalFds);
      plan.push({
        ensaioId: e.id,
        equipId: best!.eq.id,
        inicio: allocated.inicio,
        fim: allocated.fim,
        dur: totalDur,
        incluirFds: finalFds
      });
    }
    return plan;
  };


  const gerarPreview = () => {
    setModo("cascata");
    const p = buildPlan();
    if (p.length === 0) {
      toast.error("Selecione pelo menos um ensaio");
      return;
    }
    setPlano(p);
    setTab("preview");
  };

  /**
   * Prévia recalculada em tempo real conforme durações / equipamentos / start / ordem mudam.
   */
  const liveCascade = useMemo(() => {
    if (tab !== "cascata" || sel.size === 0) return [] as PlanItem[];
    return buildPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, sel, dursByTipo, equipByTipo, incluirFds, ordem, startDate, startDatesByTipo, startDatesByOs, startMode, overrides, programacoes]);

  const liveMetrics = useMemo(() => {
    let estouram = 0;
    let semEquip = 0;
    let noPrazo = 0;
    let semDeadline = 0;
    for (const it of liveCascade) {
      if (!it.equipId) semEquip++;
      const e = ensaios.find((x) => x.id === it.ensaioId);
      const os = e ? amostraById.get(e.amostra_id)?.os_numero || "" : "";
      const dl = osDeadlines.get(os);
      if (!dl) { semDeadline++; continue; }
      const d = diffDays(it.fim, dl);
      if (d > 0) estouram++;
      else noPrazo++;
    }
    return { estouram, semEquip, noPrazo, semDeadline, total: liveCascade.length };
  }, [liveCascade, ensaios, amostraById, osDeadlines]);

  /** Sugestão de alocação por tipo: qual equipamento a cascata usaria hoje e quando ele fica livre. */
  const tipoPreview = useMemo(() => {
    const out = new Map<
      string,
      { equipId: string | null; equipNome: string; disponivelA: string; count: number }
    >();
    if (tab !== "cascata") return out;

    // recalcula ocupação fracionária real (mesma lógica de buildPlan)
    const equipmentLoads = seedEquipmentLoads();
    const startAdj = nextBusinessDayIso(startDate, incluirFds);

    for (const t of tiposSelecionados) {
      const count = ensaios.filter((e) => sel.has(e.id) && e.tipo_ensaio_id === t.id).length;
      const candidatos = resolvedEquipsOf(t.id);
      if (candidatos.length === 0) {
        out.set(t.id, { equipId: null, equipNome: "—", disponivelA: startAdj, count });
        continue;
      }
      const dur = durOf(t.id);
      let best: { eq: Equipamento; inicio: string } | null = null;
      for (const eq of candidatos) {
        const inicioEq = nextAvailableWorkDay(loadsFor(equipmentLoads, eq.id), startAdj, incluirFds, dur);
        if (!best || inicioEq < best.inicio) best = { eq, inicio: inicioEq };
      }
      out.set(t.id, {
        equipId: best!.eq.id,
        equipNome: best!.eq.nome,
        disponivelA: best!.inicio,
        count,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, tiposSelecionados, equipByTipo, sel, programacoes, startDate, incluirFds]);

  const gerarPreviewOtimizada = () => {
    setModo("otimizada");
    const p = buildPlan();
    if (p.length === 0) {
      toast.error("Selecione pelo menos um ensaio");
      return;
    }
    setPlano(p);
    setTab("preview");
  };

  const gerarPreviewIA = async () => {
    const selecionados = filtrados.filter((e) => sel.has(e.id));
    if (selecionados.length === 0) {
      toast.error("Selecione pelo menos um ensaio");
      return;
    }
    setIaLoading(true);
    setModo("ia");
    try {
      const startAdj = nextBusinessDayIso(startDate, incluirFds);
      const equipmentLoads = seedEquipmentLoads();
      const tarefas = selecionados.map((e) => {
        const a = amostraById.get(e.amostra_id);
        const t = tipoById.get(e.tipo_ensaio_id);
        const os = a?.os_numero || "";
        const deadline = osDeadlines.get(os) || e.prazo || null;
        const equipsFiltrados = resolvedEquipsOf(e.tipo_ensaio_id).map((x) => x.id);
        return {
          ensaioId: e.id,
          os,
          amostra: a?.codigo_amostra || "",
          tipoId: e.tipo_ensaio_id,
          tipoNome: t?.nome || "",
          equiposCompat: equipsFiltrados,
          dur: durOf(e.tipo_ensaio_id),
          deadline,
          alvo: os ? alvoDaOs(os) : null,
        };
      });
      const equips = equipamentos.map((eq) => ({
        id: eq.id,
        nome: eq.nome,
        disponivelA: nextAvailableWorkDay(loadsFor(equipmentLoads, eq.id), startAdj, incluirFds, 0.25),
      }));
      const res = await optimizeFn({
        data: { hoje: startAdj, incluirFds, tarefas, equipamentos: equips },
      });
      // Mescla resultado com fallback: qualquer ensaio faltante volta ao cascata simples
      const map = new Map(res.plan.map((p) => [p.ensaioId, p]));
      const fallback = buildPlan();
      const merged: PlanItem[] = selecionados.map((e) => {
        const ai = map.get(e.id) as any;
        if (ai) {
          return {
            ensaioId: e.id,
            equipId: ai.equipId,
            inicio: ai.inicio,
            fim: ai.fim,
            dur: durOf(e.tipo_ensaio_id),
            motivo: ai.equipId ? undefined : "IA não encontrou equipamento",
          };
        }

        const fb = fallback.find((f) => f.ensaioId === e.id);
        return fb ?? {
          ensaioId: e.id,
          equipId: null,
          inicio: startAdj,
          fim: startAdj,
          dur: durOf(e.tipo_ensaio_id),
          motivo: "não alocado",
        };
      });
      setPlano(rebuildPlanDates(merged));
      setTab("preview");
      toast.success("Prévia otimizada pela IA");
    } catch (err: any) {
      toast.error(err?.message ?? "Falha na otimização IA");
    } finally {
      setIaLoading(false);
    }
  };

  /* ------------------------------ Aplicar ------------------------------ */
  const aplicar = useMutation({
    mutationFn: async () => {
      if (!plano) return 0;
      let ok = 0;
      for (const item of plano) {
        const obs = obsBulk.trim() || null;
        await insertFn({
          data: {
            sheet: SHEET_PROGS,
            row: {
              ensaio_id: item.ensaioId,
              equipamento_id: item.equipId,
              data_inicio_prevista: item.inicio,
              data_inicio: item.inicio,
              data_fim: item.fim,
              duracao_dias: item.dur,
              status: "planejado",
              progresso: 0,
              observacoes: obs,
              incluir_fds: item.incluirFds ?? incluirFds,
            },
          },
        });
        if (obs) {
          try {
            await updateFn({
              data: { sheet: "Ensaios", id: item.ensaioId, patch: { observacoes: obs } },
            });
          } catch { /* mirror best-effort */ }
        }
        ok++;
      }
      return ok;
    },
    onSuccess: (n) => {
      toast.success(`${n} programação(ões) criada(s) em cascata`);
      qc.invalidateQueries({ queryKey: ["programacoes"] });
      qc.invalidateQueries({ queryKey: ["programacoes_full"] });
      qc.invalidateQueries({ queryKey: ["ensaios"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao aplicar em cascata"),
  });

  const selCount = sel.size;
  const totalPendentes = pendentes.length;

  const swapPlanItems = (idxA: number, idxB: number) => {
    setPlano((prev) => {
      if (!prev) return prev;
      const next = prev.slice();
      const a = next[idxA];
      const b = next[idxB];
      if (!a || !b) return prev;
      next[idxA] = { ...a, equipId: b.equipId, inicio: b.inicio, fim: b.fim };
      next[idxB] = { ...b, equipId: a.equipId, inicio: a.inicio, fim: a.fim };
      return rebuildPlanDates(next);
    });
    toast.success("Ensaios trocados");
  };

  /** Reordena o item na lista (subir/descer na ordem de execução da prévia). */
  const movePlanItem = (idx: number, dir: -1 | 1) => {
    setPlano((prev) => {
      if (!prev) return prev;
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[idx], next[j]] = [next[j], next[idx]];
      return rebuildPlanDates(next);
    });
  };

  /** Edita equipamento e/ou duração de um item da prévia, recalculando o fim. */
  const updatePlanItem = (
    idx: number,
    patch: { equipId?: string | null; dur?: number },
  ) => {
    setPlano((prev) => {
      if (!prev) return prev;
      const cur = prev[idx];
      if (!cur) return prev;
      const nextEquip = patch.equipId !== undefined ? patch.equipId : cur.equipId;
      const nextDur = patch.dur !== undefined ? normalizeDurationDays(patch.dur, cur.dur) : cur.dur;
      const next = prev.slice();
      next[idx] = {
        ...cur,
        equipId: nextEquip,
        dur: nextDur,
        motivo: nextEquip ? undefined : cur.motivo,
      };
      return rebuildPlanDates(next);
    });
  };

  /**
   * Recalcula inicio/fim de todos os itens do plano respeitando a ordem
   * atual e as programações já existentes em cada equipamento. Isso garante
   * que trocas de equipamento, duração e reordenações se propaguem em
   * cascata na prévia (e, ao aplicar, no Gantt).
   */
  const rebuildPlanDates = (arr: PlanItem[]): PlanItem[] => {
    const equipmentLoads = seedEquipmentLoads();
    const enById = new Map(ensaios.map(e => [e.id, e]));
    const baseStart = nextBusinessDayIso(startDate, incluirFds);
    return arr.map((item) => {
      const en = enById.get(item.ensaioId);
      const a = en ? amostraById.get(en.amostra_id) : null;
      const osStart = a?.os_numero ? startDatesByOs[a.os_numero] : null;
      const typeStart = en ? startDatesByTipo[en.tipo_ensaio_id] : null;
      
      let startAdj = baseStart;
      if (startMode === "custom") {
        if (osStart) {
          startAdj = nextBusinessDayIso(osStart, incluirFds);
        } else if (typeStart) {
          startAdj = nextBusinessDayIso(typeStart, incluirFds);
        }
      }

      const dur = item.dur;
      const eqOverride = item.equipId ? overrides[item.equipId] : null;
      const useFds = eqOverride?.fds ?? item.incluirFds ?? incluirFds;

      if (!item.equipId) {
        return {
          ...item,
          inicio: startAdj,
          fim: endIsoFromDur(startAdj, dur, useFds),
          incluirFds: useFds
        };
      }
      const dayLoads = loadsFor(equipmentLoads, item.equipId);
      const inicioLivre = nextAvailableWorkDay(dayLoads, startAdj, useFds, dur);
      const allocated = allocateWorkloadOnDays(dayLoads, inicioLivre, dur, useFds);
      const inicio = allocated.inicio;
      const fim = allocated.fim;
      return { ...item, inicio, fim, incluirFds: useFds };
    });
  };

  /* --------------------------------- UI --------------------------------- */
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">


        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            Programações Pendentes
            <Badge variant="secondary">{totalPendentes} ensaio(s)</Badge>
            {selCount > 0 && (
              <Badge className="bg-primary text-primary-foreground">{selCount} selecionado(s)</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Programe vários ensaios de uma vez, com alocação automática em cascata por equipamento e respeito aos prazos das OSs.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-fit">
            <TabsTrigger value="selecionar">1. Selecionar</TabsTrigger>
            <TabsTrigger value="cascata" disabled={selCount === 0}>2. Cascata</TabsTrigger>
            <TabsTrigger value="preview" disabled={!plano}>3. Prévia</TabsTrigger>
          </TabsList>

          {/* -------- TAB 1: Seleção -------- */}
          {tab === "selecionar" && (
            <div className="flex-1 flex flex-col overflow-hidden mt-3 gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Buscar por OS, amostra, tomador ou ensaio..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="h-9 max-w-xs"
                />
                <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                  <SelectTrigger className="h-9 w-56">
                    <SelectValue placeholder="Filtrar por tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos os tipos</SelectItem>
                    {tipos.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={toggleAll}>
                  {filtrados.every((e) => sel.has(e.id)) && filtrados.length > 0
                    ? "Desmarcar todos"
                    : "Selecionar todos"}
                </Button>
                <div className="inline-flex rounded-md border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setAgrupamento("os")}
                    className={`px-2.5 h-9 text-xs inline-flex items-center gap-1.5 ${agrupamento === "os" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
                  >
                    <Layers className="h-3.5 w-3.5" /> Por OS
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgrupamento("tipo")}
                    className={`px-2.5 h-9 text-xs inline-flex items-center gap-1.5 border-l ${agrupamento === "tipo" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}
                  >
                    <FlaskConical className="h-3.5 w-3.5" /> Por tipo
                  </button>
                </div>
                <div className="ml-auto text-xs text-muted-foreground">
                  Mostrando {filtrados.length} de {totalPendentes} ensaio(s)
                </div>
              </div>

              <ScrollArea className="h-[500px] border rounded-md">
                {filtrados.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground text-center">
                    Nada por aqui. ✅
                  </p>
                ) : agrupamento === "os" ? (
                  <div className="divide-y">
                    {grupos.map(([os, ens]) => {
                      const exp = expandidas.has(os);
                      const allIn = ens.every((e) => sel.has(e.id));
                      const someIn = !allIn && ens.some((e) => sel.has(e.id));
                      const deadline = osDeadlines.get(os);
                      const tomador = osTomadores.get(os) || "";
                      const diff = deadline ? diffDays(deadline, todayIso()) : null;
                      const dlColor =
                        diff == null
                          ? "bg-muted text-muted-foreground"
                          : diff < 0
                          ? "bg-red-500/15 text-red-700 dark:text-red-300"
                          : diff <= 5
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
                      return (
                        <div key={os}>
                          <div className="flex items-center gap-2 px-3 py-2 hover:bg-accent/40">
                            <Checkbox
                              checked={allIn ? true : someIn ? "indeterminate" : false}
                              onCheckedChange={() => toggleOs(os, ens)}
                            />
                            <button
                              className="flex-1 flex items-center gap-2 min-w-0 text-left"
                              onClick={() => toggleExp(os)}
                            >
                              {exp ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                              <span className="font-semibold text-sm">OS {os}</span>
                              {startMode === "custom" && (
                                <div 
                                  className="flex items-center gap-1.5 ml-2 bg-amber-50/50 p-1 rounded border border-amber-100" 
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Label className="text-[9px] font-bold text-amber-700 uppercase shrink-0">INÍCIO OS {os}:</Label>
                                  <Input
                                    type="date"
                                    value={startDatesByOs[os] ?? ""}
                                    onChange={(e) =>
                                      setStartDatesByOs((prev) => ({ ...prev, [os]: e.target.value }))
                                    }
                                    className="h-7 w-32 text-[10px] px-1 border-amber-200 focus-visible:ring-amber-500"
                                  />
                                </div>
                              )}
                              <Badge variant="secondary" className="text-[10px]">{ens.length} pendente(s)</Badge>
                              {tomador && (
                                <span className="text-xs text-muted-foreground truncate">— {tomador}</span>
                              )}
                              <span className={`ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${dlColor}`}>
                                <CalendarClock className="h-3 w-3" />
                                Prazo: {fmtBr(deadline)}
                                {diff != null && (
                                  <span className="opacity-80">
                                    {diff < 0 ? `(${Math.abs(diff)}d vencido)` : diff === 0 ? "(hoje)" : `(em ${diff}d)`}
                                  </span>
                                )}
                              </span>
                            </button>
                          </div>
                          {exp && (
                            <div className="pl-10 pr-3 pb-2 space-y-1">
                              {ens.map((e) => {
                                const a = amostraById.get(e.amostra_id);
                                const t = tipoById.get(e.tipo_ensaio_id);
                                return (
                                  <label
                                    key={e.id}
                                    className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent cursor-pointer text-sm"
                                  >
                                    <Checkbox
                                      checked={sel.has(e.id)}
                                      onCheckedChange={(c) => {
                                        setSel((prev) => {
                                          const n = new Set(prev);
                                          if (c) n.add(e.id);
                                          else n.delete(e.id);
                                          return n;
                                        });
                                      }}
                                    />
                                    <span
                                      className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium"
                                      style={t?.cor_gantt ? { borderColor: t.cor_gantt } : undefined}
                                    >
                                      {t?.cor_gantt && <span className="h-2 w-2 rounded-sm mr-1" style={{ background: t.cor_gantt }} />}
                                      {t?.nome || (e as any).tipo_nome || "Ensaio"}
                                    </span>
                                    <span className="text-muted-foreground">·</span>
                                    <span className="font-medium">{a?.codigo_amostra || (a as any)?.identificacao || (e as any).amostra_nome || "Amostra"}</span>
                                    {e.prazo && (
                                      <span className="ml-auto text-[11px] text-muted-foreground">
                                        prazo do ensaio: {fmtBr(e.prazo)}
                                      </span>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="divide-y">
                    {gruposTipo.map(([tipoId, ens]) => {
                      const t = tipoById.get(tipoId);
                      const key = `tipo:${tipoId}`;
                      const exp = expandidas.has(key);
                      const allIn = ens.every((e) => sel.has(e.id));
                      const someIn = !allIn && ens.some((e) => sel.has(e.id));
                      const osSet = new Set(ens.map((e) => amostraById.get(e.amostra_id)?.os_numero).filter(Boolean));
                      const urgentes = ens.filter((e) => {
                        const os = amostraById.get(e.amostra_id)?.os_numero;
                        const dl = os ? osDeadlines.get(os) : null;
                        return dl && diffDays(dl, todayIso()) <= 5;
                      }).length;
                      return (
                        <div key={tipoId}>
                          <div className="flex items-center gap-2 px-3 py-2 hover:bg-accent/40">
                            <Checkbox
                              checked={allIn ? true : someIn ? "indeterminate" : false}
                              onCheckedChange={() => toggleTipoSel(tipoId, ens)}
                            />
                            <button
                              className="flex-1 flex items-center gap-2 min-w-0 text-left"
                              onClick={() => toggleExp(key)}
                            >
                              {exp ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                              <span
                                className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium"
                                style={t?.cor_gantt ? { borderColor: t.cor_gantt } : undefined}
                              >
                                {t?.cor_gantt && <span className="h-2 w-2 rounded-sm" style={{ background: t.cor_gantt }} />}
                                {t?.nome || (ens[0] as any)?.tipo_nome || "Ensaio"}
                              </span>
                              <Badge variant="secondary" className="text-[10px]">{ens.length} amostra(s)</Badge>
                              <span className="text-xs text-muted-foreground">
                                em {osSet.size} OS{osSet.size > 1 ? "s" : ""}
                              </span>
                              {urgentes > 0 && (
                                <span className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium bg-red-500/15 text-red-700 dark:text-red-300">
                                  <AlertTriangle className="h-3 w-3" />
                                  {urgentes} urgente(s)
                                </span>
                              )}
                            </button>
                          </div>
                          {exp && (
                            <div className="pl-10 pr-3 pb-2 space-y-1">
                              {ens.map((e) => {
                                const a = amostraById.get(e.amostra_id);
                                const osNum = a?.os_numero || (e as any).os_numero || "Geral";
                                const dl = osNum !== "Geral" ? osDeadlines.get(osNum) : null;
                                return (
                                  <label
                                    key={e.id}
                                    className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent cursor-pointer text-sm"
                                  >
                                    <Checkbox
                                      checked={sel.has(e.id)}
                                      onCheckedChange={(c) => {
                                        setSel((prev) => {
                                          const n = new Set(prev);
                                          if (c) n.add(e.id);
                                          else n.delete(e.id);
                                          return n;
                                        });
                                      }}
                                    />
                                    <span className="font-medium text-xs">OS {osNum}</span>
                                    <span className="text-muted-foreground">·</span>
                                    <span>{a?.codigo_amostra || (a as any)?.identificacao || (e as any).amostra_nome || "Amostra"}</span>
                                    {dl && (
                                      <span className="ml-auto text-[11px] text-muted-foreground">
                                        prazo: {fmtBr(dl)}
                                      </span>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>

              <div className="flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button
                  disabled={selCount === 0}
                  onClick={() => setTab("cascata")}
                  className="gap-1.5"
                >
                  <Sparkles className="h-4 w-4" />
                  Configurar cascata ({selCount})
                </Button>
              </div>
            </div>
          )}

          {/* -------- TAB 2: Cascata -------- */}
          {tab === "cascata" && (
            <div className="flex-1 overflow-y-auto mt-3 space-y-4 pr-1">
              {/* Banner de conflito em tempo real */}
              {liveMetrics.total > 0 && (
                <div
                  className={`rounded-md border p-3 flex flex-wrap items-center gap-3 text-xs ${
                    liveMetrics.estouram > 0 || liveMetrics.semEquip > 0
                      ? "border-[color:var(--status-atrasado)]/40 bg-[color:var(--status-atrasado)]/10"
                      : "border-[color:var(--status-concluido)]/40 bg-[color:var(--status-concluido)]/10"
                  }`}
                >
                  {liveMetrics.estouram > 0 || liveMetrics.semEquip > 0 ? (
                    <AlertTriangle className="h-4 w-4 shrink-0 text-[color:var(--status-atrasado)]" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[color:var(--status-concluido)]" />
                  )}
                  <div className="flex-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span>
                      <strong>{liveMetrics.total}</strong> ensaio(s) selecionado(s)
                    </span>
                    {liveMetrics.noPrazo > 0 && (
                      <span className="text-[color:var(--status-concluido)]">
                        ✓ {liveMetrics.noPrazo} no prazo
                      </span>
                    )}
                    {liveMetrics.estouram > 0 && (
                      <span className="text-[color:var(--status-atrasado)] font-semibold">
                        ⚠ {liveMetrics.estouram} estouram o prazo com esta configuração
                      </span>
                    )}
                    {liveMetrics.semEquip > 0 && (
                      <span className="text-[color:var(--status-em_execucao)] font-semibold">
                        ⚠ {liveMetrics.semEquip} sem equipamento
                      </span>
                    )}
                    {liveMetrics.semDeadline > 0 && (
                      <span className="text-muted-foreground">
                        {liveMetrics.semDeadline} sem prazo definido
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground">
                    Ajuste durações/equipamentos abaixo — o cálculo é ao vivo.
                  </span>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <Label>Data de referência global</Label>
                  <Input 
                    type="date" 
                    value={startDate} 
                    onChange={(e) => setStartDate(e.target.value)} 
                    disabled={startMode === "custom"}
                    className={startMode === "custom" ? "opacity-50" : ""}
                  />
                </div>
                <div>
                  <Label>Ordenação da fila</Label>
                  <Select value={ordem} onValueChange={(v) => setOrdem(v as typeof ordem)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prazo">Por prazo da OS (mais urgente primeiro)</SelectItem>
                      <SelectItem value="os">Por número da OS</SelectItem>
                      <SelectItem value="tipo">Por tipo de ensaio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2 pb-1">
                  <div 
                    className="flex items-center gap-2 text-sm cursor-pointer select-none bg-muted/30 p-2 rounded-md border hover:bg-muted/50 transition-colors w-full"
                    onClick={() => setIncluirFds(!incluirFds)}
                  >
                    <div 
                      className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${incluirFds ? 'bg-primary border-primary' : 'bg-transparent border-input'}`}
                    >
                      {incluirFds && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                    </div>
                    Considerar finais de semana e feriados
                  </div>
                </div>
                <div>
                  <Label>Data de Início</Label>
                  <Select value={startMode} onValueChange={(v) => setStartMode(v as typeof startMode)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asap">O quanto antes (Referência)</SelectItem>
                      <SelectItem value="custom">Definir por tipo / OS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Prazo-alvo</Label>
                  <div className="h-9 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Target className="h-3.5 w-3.5" />
                    Otimizador tenta terminar até <strong>3 dias úteis antes</strong> do prazo da OS.
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm">Duração por tipo de ensaio ({tiposSelecionados.length})</Label>
                  <span className="text-[11px] text-muted-foreground">Ajuste o tempo que cada tipo leva no equipamento.</span>
                </div>
                {tiposSelecionados.length === 0 ? (
                  <div className="text-xs text-muted-foreground rounded-md border p-3">
                    Nenhum tipo detectado — volte e selecione ensaios.
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {tiposSelecionados.map((t) => {
                      const count = filtrados.filter((e) => sel.has(e.id) && e.tipo_ensaio_id === t.id).length;
                      const suggest = tipoPreview.get(t.id);
                      const typeOverride = overrides[t.id] || { fds: incluirFds, excludes: [] };


                      return (
                        <div key={t.id} className="rounded-md border p-2 bg-card space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex flex-col gap-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium"
                                  style={t.cor_gantt ? { borderColor: t.cor_gantt } : undefined}
                                >
                                  {t.cor_gantt && <span className="h-2 w-2 rounded-sm" style={{ background: t.cor_gantt }} />}
                                  {t.nome}
                                </span>
                                <Badge variant="secondary" className="text-[10px]">{count}×</Badge>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {equipsCompatOf(t.id).map(eq => {
                                  const isFds = overrides[eq.id]?.fds;
                                  if (!isFds) return null;
                                  return (
                                    <Badge key={eq.id} variant="outline" className="h-4 px-1 text-[8px] bg-amber-500/10 text-amber-600 border-amber-200 uppercase font-bold">
                                      {eq.nome}: FDS
                                    </Badge>
                                  );
                                })}
                              </div>
                            </div>
                            
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-7 w-7">
                                  <Settings2 className="h-3.5 w-3.5" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-64 p-3 space-y-3" align="end" side="top">
                                <div className="space-y-2">
                                  <Label className="text-xs">Configurações por Equipamento</Label>
                                  <div className="space-y-2">
                                    {equipsCompatOf(t.id).map(eq => {
                                      const eqOverride = overrides[eq.id] || { fds: false, excludes: [] };
                                      const typeOverride = overrides[t.id] || { fds: false, excludes: [] };
                                      const isExcluded = typeOverride.excludes.includes(eq.id);
                                      
                                      return (
                                        <div key={eq.id} className="flex items-center justify-between gap-2 p-1.5 rounded-md border bg-muted/30">
                                          <div className="flex flex-col min-w-0">
                                            <span className={`text-[11px] font-medium truncate ${isExcluded ? 'text-muted-foreground line-through' : ''}`}>
                                              {eq.nome}
                                            </span>
                                          </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                              <div 
                                                className="flex items-center gap-1.5 cursor-pointer select-none px-2 py-1 hover:bg-muted rounded transition-colors border"
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  setOverrides(prev => {
                                                    const currentEq = prev[eq.id] || { fds: false, excludes: [] };
                                                    return {
                                                      ...prev,
                                                      [eq.id]: { ...currentEq, fds: !currentEq.fds }
                                                    };
                                                  });
                                                }}
                                              >
                                                <div 
                                                  className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${overrides[eq.id]?.fds ? 'bg-primary border-primary' : 'bg-transparent border-input'}`}
                                                >
                                                  {overrides[eq.id]?.fds && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                                                </div>
                                                <Label 
                                                  className="text-[10px] uppercase font-bold text-muted-foreground pointer-events-none"
                                                >
                                                  FDS
                                                </Label>
                                              </div>
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className={`h-6 w-6 ${isExcluded ? 'text-primary' : 'text-muted-foreground'}`}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setOverrides(prev => {
                                                  const curr = prev[t.id] || { fds: false, excludes: [] };
                                                  const nextExcludes = isExcluded
                                                    ? curr.excludes.filter(id => id !== eq.id)
                                                    : [...curr.excludes, eq.id];
                                                  return { ...prev, [t.id]: { ...curr, excludes: nextExcludes } };
                                                });
                                              }}
                                            >
                                              <X className="h-3.5 w-3.5" />
                                            </Button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    {equipsCompatOf(t.id).length === 0 && (
                                      <span className="text-[10px] text-muted-foreground italic text-center block py-2">Nenhum equipamento compatível</span>
                                    )}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            {startMode === "custom" && (
                              <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground uppercase">Início</Label>
                                <Input
                                  type="date"
                                  value={startDatesByTipo[t.id] ?? startDate}
                                  onChange={(e) =>
                                    setStartDatesByTipo((prev) => ({ ...prev, [t.id]: e.target.value }))
                                  }
                                  className="h-8 text-[10px] px-1"
                                />
                              </div>
                            )}
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground uppercase">Duração (dias)</Label>
                              <Input
                                type="number"
                                step={0.25}
                                min={0.25}
                                value={dursByTipo[t.id] ?? "1"}
                                onChange={(e) =>
                                  setDursByTipo((prev) => ({ ...prev, [t.id]: e.target.value }))
                                }
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground uppercase">Equipamento</Label>
                              <Select
                                value={equipByTipo[t.id] ?? "__auto__"}
                                onValueChange={(v) =>
                                  setEquipByTipo((prev) => ({ ...prev, [t.id]: v }))
                                }
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__auto__">Auto</SelectItem>
                                  {equipsCompatOf(t.id).map((eq) => (
                                    <SelectItem key={eq.id} value={eq.id}>{eq.nome}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {suggest && (
                            <div className="mt-1 flex items-center gap-1 rounded-sm bg-muted/50 px-1.5 py-1 text-[10px]">
                              <Target className="h-3 w-3 text-primary" />
                              <span className="text-muted-foreground truncate">Usará: {suggest.equipNome}</span>
                              <span className="ml-auto tabular-nums text-muted-foreground">
                                livre {fmtBr(suggest.disponivelA)}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}

                  </div>
                )}
              </div>

              <div>
                <Label>Observações técnicas (aplica em todos)</Label>
                <Input
                  value={obsBulk}
                  onChange={(e) => setObsBulk(e.target.value)}
                  placeholder="Opcional — se preenchido, sobrescreve as observações dos ensaios selecionados."
                />
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setTab("selecionar")}>Voltar</Button>
                <Button variant="outline" onClick={gerarPreview} className="gap-1.5">
                  <Zap className="h-4 w-4" />
                  Prévia em cascata
                </Button>
                <Button variant="outline" onClick={gerarPreviewOtimizada} className="gap-1.5">
                  <Target className="h-4 w-4" />
                  Otimizada (alvo D-3)
                </Button>
                <Button onClick={gerarPreviewIA} disabled={iaLoading} className="gap-1.5">
                  {iaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                  {iaLoading ? "IA planejando..." : "Prévia otimizada IA"}
                </Button>
              </div>
            </div>
          )}

          {/* -------- TAB 3: Preview -------- */}
          {tab === "preview" && plano && (
            <div className="flex-1 flex flex-col overflow-hidden mt-3 gap-3">
              <div className="flex items-center gap-2 text-xs">
                <Badge className="uppercase" variant="secondary">
                  Modo: {modo === "ia" ? "IA" : modo === "otimizada" ? "Otimizada (D-3)" : "Cascata"}
                </Badge>
                <span className="text-muted-foreground">
                  Alvo = terminar até 3 dias úteis antes do prazo da OS.
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <Stat label="Ensaios" value={plano.length} />
                <Stat label="Equipamentos usados" value={new Set(plano.map((p) => p.equipId).filter(Boolean)).size} />
                <Stat label="Sem equipamento" value={plano.filter((p) => !p.equipId).length} tone={plano.some((p) => !p.equipId) ? "warn" : "ok"} />
                <Stat
                  label="Janela"
                  value={
                    plano.length
                      ? `${fmtBr(plano.reduce((m, p) => (p.inicio < m ? p.inicio : m), plano[0].inicio))} → ${fmtBr(plano.reduce((m, p) => (p.fim > m ? p.fim : m), plano[0].fim))}`
                      : "—"
                  }
                />
              </div>

              <div className="h-[400px] border rounded-md overflow-auto bulk-preview-scroll">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                    <tr className="text-left">
                      <th className="px-2 py-1.5 font-medium w-16">Ordem</th>
                      <th className="px-2 py-1.5 font-medium">OS</th>
                      <th className="px-2 py-1.5 font-medium">Amostra</th>
                      <th className="px-2 py-1.5 font-medium">Ensaio</th>
                      <th className="px-2 py-1.5 font-medium min-w-[180px]">Equipamento</th>
                      <th className="px-2 py-1.5 font-medium">Início</th>
                      <th className="px-2 py-1.5 font-medium">Fim</th>
                      <th className="px-2 py-1.5 font-medium w-20">Dur.</th>
                      <th className="px-2 py-1.5 font-medium">Alvo (D-3)</th>
                      <th className="px-2 py-1.5 font-medium">vs Prazo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plano.map((item, idx) => {
                      const e = ensaios.find((x) => x.id === item.ensaioId);
                      const a = e ? amostraById.get(e.amostra_id) : null;
                      const t = e ? tipoById.get(e.tipo_ensaio_id) : null;
                      const os = a?.os_numero || "—";
                      const dl = osDeadlines.get(os);
                      const diff = dl ? diffDays(item.fim, dl) : null;
                      const alvo = os ? alvoDaOs(os) : null;
                      const diffAlvo = alvo ? diffDays(item.fim, alvo) : null;
                      const equipsPermitidos = (() => {
                        const allowed = t?.equipamentos_ids ?? [];
                        return allowed.length ? equipamentos.filter((eq) => allowed.includes(eq.id)) : equipamentos;
                      })();
                      return (
                        <tr key={idx} className="border-t hover:bg-accent/40">
                          <td className="px-2 py-1">
                            <div className="flex items-center gap-1">
                              <span className="tabular-nums text-muted-foreground w-5 text-right">{idx + 1}</span>
                              <div className="flex flex-col">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-4 w-4"
                                  title="Subir na ordem"
                                  disabled={idx === 0}
                                  onClick={() => movePlanItem(idx, -1)}
                                >
                                  <ChevronUp className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-4 w-4"
                                  title="Descer na ordem"
                                  disabled={idx === plano.length - 1}
                                  onClick={() => movePlanItem(idx, 1)}
                                >
                                  <ChevronDown className="h-3 w-3" />
                                </Button>
                              </div>
                              {/* Split buttons removed per user request */}
                            </div>
                          </td>


                          <td className="px-2 py-1 font-medium">{os}</td>
                          <td className="px-2 py-1">{a?.codigo_amostra || "—"}</td>
                          <td className="px-2 py-1">
                            <div className="flex flex-col gap-1">
                              <span
                                className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5"
                                style={t?.cor_gantt ? { borderColor: t.cor_gantt } : undefined}
                              >
                                {t?.cor_gantt && <span className="h-2 w-2 rounded-sm" style={{ background: t.cor_gantt }} />}
                                {t?.nome ?? "—"}
                              </span>
                              {item.isSplit && (
                                <Badge variant="outline" className="text-[9px] py-0 h-4 border-primary/30 text-primary">
                                  DESMEMBRADO
                                </Badge>
                              )}
                            </div>
                          </td>

                          <td className="px-2 py-1">
                            <Select
                              value={item.equipId ?? "__none__"}
                              onValueChange={(v) => updatePlanItem(idx, { equipId: v === "__none__" ? null : v })}
                            >
                              <SelectTrigger
                                className={`h-7 text-xs ${!item.equipId ? "border-amber-500/50 text-amber-700" : ""}`}
                              >
                                <SelectValue placeholder="Sem equipamento" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Sem equipamento</SelectItem>
                                {equipsPermitidos.map((eq) => (
                                  <SelectItem key={eq.id} value={eq.id}>
                                    {eq.nome}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {item.motivo && (
                              <div className="text-[10px] text-amber-600 mt-0.5">{item.motivo}</div>
                            )}
                          </td>
                          <td className="px-2 py-1">{fmtBr(item.inicio)}</td>
                          <td className="px-2 py-1">{fmtBr(item.fim)}</td>
                          <td className="px-2 py-1">
                            <Input
                              type="number"
                              min={0.25}
                              step={0.25}
                              value={item.dur}
                              onChange={(ev) => {
                                const n = Number(ev.target.value);
                                if (!Number.isFinite(n) || n <= 0) return;
                                updatePlanItem(idx, { dur: n });
                              }}
                              className="h-7 w-16 text-xs px-1.5 tabular-nums"
                            />
                          </td>
                          <td className="px-2 py-1">
                            {alvo == null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span className={diffAlvo != null && diffAlvo <= 0 ? "text-emerald-600" : "text-amber-700"}>
                                {fmtBr(alvo)}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1">
                            {diff == null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : diff <= 0 ? (
                              <span className="text-emerald-600">no prazo{diff < 0 ? ` (${Math.abs(diff)}d antes)` : ""}</span>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="text-red-600 font-medium"
                                  title={dl ? `Prazo da OS: ${fmtBr(dl)}` : undefined}
                                >
                                  Estoura em {diff}d
                                  {dl ? (
                                    <span className="text-[10px] text-red-600/80 font-normal ml-1">
                                      (prazo {fmtBr(dl)})
                                    </span>
                                  ) : null}
                                </span>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button size="sm" variant="outline" className="h-6 px-1.5 gap-1 text-[10px]">
                                      <ArrowLeftRight className="h-3 w-3" />
                                      Trocar
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent align="end" className="w-96 p-0">
                                    <div className="px-3 py-2 border-b text-xs font-medium bg-muted/40">
                                      Trocar com outro ensaio
                                      <div className="text-[10px] text-muted-foreground font-normal">
                                        Ao trocar, os dois ensaios permutam equipamento e datas.
                                      </div>
                                    </div>
                                    <ScrollArea className="max-h-72">
                                      {plano.filter((_, i) => i !== idx).length === 0 ? (
                                        <p className="p-3 text-xs text-muted-foreground">Nenhum outro ensaio no plano.</p>
                                      ) : (
                                        <ul className="divide-y">
                                          {plano.map((other, j) => {
                                            if (j === idx) return null;
                                            const oe = ensaios.find((x) => x.id === other.ensaioId);
                                            const oa = oe ? amostraById.get(oe.amostra_id) : null;
                                            const ot = oe ? tipoById.get(oe.tipo_ensaio_id) : null;
                                            const oos = oa?.os_numero || "—";
                                            const odl = osDeadlines.get(oos);
                                            const odiff = odl ? diffDays(other.fim, odl) : null;
                                            const eqNome = other.equipId
                                              ? equipById.get(other.equipId)?.nome || "—"
                                              : "Sem equipamento";
                                            return (
                                              <li key={j}>
                                                <button
                                                  className="w-full text-left px-3 py-1.5 hover:bg-accent text-xs flex items-center gap-2"
                                                  onClick={() => swapPlanItems(idx, j)}
                                                >
                                                  <div className="flex-1 min-w-0">
                                                    <div className="font-medium truncate">
                                                      OS {oos} · {oa?.codigo_amostra || "—"} · {ot?.nome || "—"}
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground truncate">
                                                      {eqNome} · {fmtBr(other.inicio)} → {fmtBr(other.fim)} ({other.dur}d)
                                                    </div>
                                                  </div>
                                                  {odiff != null && (
                                                    <span className={`text-[10px] font-medium ${odiff > 0 ? "text-red-600" : "text-emerald-600"}`}>
                                                      {odiff > 0 ? `+${odiff}d` : odiff === 0 ? "no prazo" : `${odiff}d`}
                                                    </span>
                                                  )}
                                                </button>
                                              </li>
                                            );
                                          })}
                                        </ul>
                                      )}
                                    </ScrollArea>
                                  </PopoverContent>
                                </Popover>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <MiniGantt
                plano={plano}
                ensaios={ensaios}
                amostraById={amostraById}
                tipoById={tipoById}
                equipById={equipById}
                incluirFds={incluirFds}
                programacoes={programacoes}
              />

              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setTab("cascata")}>Ajustar</Button>
                <Button
                  onClick={() => aplicar.mutate()}
                  disabled={aplicar.isPending}
                  className="gap-1.5"
                >
                  <Sparkles className="h-4 w-4" />
                  {aplicar.isPending
                    ? "Aplicando..."
                    : `Confirmar e criar ${plano.length} programação(ões)`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>

  );
}


function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "ok" | "warn";
}) {
  const bg =
    tone === "warn"
      ? "bg-amber-500/10 border-amber-500/40"
      : tone === "ok"
      ? "bg-emerald-500/10 border-emerald-500/40"
      : "bg-muted/40 border-border";
  return (
    <div className={`rounded-md border p-2 ${bg}`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

/* ------------------------------ Mini-Gantt ------------------------------ */
function MiniGantt({
  plano,
  ensaios,
  amostraById,
  tipoById,
  equipById,
  programacoes,
}: {
  plano: PlanItem[];
  ensaios: Ensaio[];
  amostraById: Map<string, Amostra>;
  tipoById: Map<string, TipoEnsaio>;
  equipById: Map<string, Equipamento>;
  incluirFds: boolean;
  programacoes: Programacao[];
}) {
  if (plano.length === 0) return null;
  const ensaioById = new Map(ensaios.map((e) => [e.id, e]));

  const parse = (iso: string) => new Date(iso + "T00:00:00").getTime();
  const DAY = 86_400_000;

  // Filtrar programações passadas para o equipamento
  const pastItemsByEquip = useMemo(() => {
    const map = new Map<string, Array<{ inicio: string; fim: string; label: string; dur: number }>>();
    for (const prog of programacoes) {
      if (!prog.equipamento_id || !prog.data_inicio_prevista) continue;
      const arr = map.get(prog.equipamento_id) ?? [];
      arr.push({
        inicio: prog.data_inicio_prevista,
        fim: prog.data_fim || prog.data_inicio_prevista,
        label: "Antiga",
        dur: prog.duracao_dias
      });
      map.set(prog.equipamento_id, arr);
    }
    return map;
  }, [programacoes]);


  const minMs = plano.reduce((m, p) => Math.min(m, parse(p.inicio)), parse(plano[0].inicio));
  const maxMs = plano.reduce((m, p) => Math.max(m, parse(p.fim)), parse(plano[0].fim));
  const totalDays = Math.max(1, Math.round((maxMs - minMs) / DAY) + 1);
  const dayPx = totalDays <= 7 ? 120 : totalDays <= 14 ? 90 : totalDays <= 30 ? 60 : 40;
  const width = totalDays * dayPx;

  // Em vez de agrupar por equipamento, cada item é uma linha para ser fiel ao Gantt comum
  // Ordena por data de início, depois OS
  const orderedItems = [...plano].sort((a, b) => {
    if (a.inicio !== b.inicio) return a.inicio.localeCompare(b.inicio);
    const ea = ensaioById.get(a.ensaioId);
    const eb = ensaioById.get(b.ensaioId);
    const oa = ea ? amostraById.get(ea.amostra_id)?.os_numero || "" : "";
    const ob = eb ? amostraById.get(eb.amostra_id)?.os_numero || "" : "";
    return oa.localeCompare(ob);
  });

  const tickEvery = totalDays <= 15 ? 1 : totalDays <= 30 ? 2 : totalDays <= 60 ? 5 : 7;
  const ticks: { offset: number; label: string; isWeekend: boolean }[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(minMs + i * DAY);
    const wk = d.getDay(); // 0=Sun, 6=Sat
    const isWeekend = wk === 0 || wk === 6;
    if (i % tickEvery === 0 || isWeekend) {
      ticks.push({
        offset: i * dayPx,
        label: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        isWeekend
      });
    }
  }

  return (
    <div className="border rounded-md flex flex-col h-[500px]">
      <div className="px-3 py-1.5 border-b bg-muted/40 text-xs font-semibold flex items-center gap-2 shrink-0">
        <CalendarClock className="h-3.5 w-3.5" />
        Prévia visual (mini-Gantt) — {orderedItems.length} ensaios, {totalDays} dias
      </div>
      
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar fixa - Estilo Gantt Convencional */}
        <div className="w-64 shrink-0 border-r bg-muted/20 flex flex-col">
          <div className="h-10 border-b shrink-0 flex items-center px-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            OS / Amostra / Ensaio
          </div>
          <ScrollArea className="flex-1 bulk-gantt-sidebar">
            {orderedItems.map((it, idx) => {
              const e = ensaioById.get(it.ensaioId);
              const a = e ? amostraById.get(e.amostra_id) : null;
              const t = e ? tipoById.get(e.tipo_ensaio_id) : null;
              return (
                <div key={idx} className="h-10 px-3 flex flex-col justify-center text-[11px] border-b hover:bg-accent/30 transition-colors group">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="font-bold text-primary shrink-0">OS {a?.os_numero || "—"}</span>
                    <span className="text-muted-foreground shrink-0 opacity-50">•</span>
                    <span className="truncate">{a?.codigo_amostra || "—"}</span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground truncate italic">
                    {t?.nome || "—"}
                  </div>
                </div>
              );
            })}
          </ScrollArea>
        </div>

        {/* Timeline scrollable - Estilo Gantt Convencional */}
        <div className="flex-1 overflow-auto bg-grid-slate-100/50 dark:bg-grid-slate-800/50">
          <div style={{ width, position: "relative", minHeight: "100%" }}>
            {/* Header com datas - Estilo MS Project */}
            <div className="h-10 border-b sticky top-0 bg-background/95 backdrop-blur z-10 flex">
              {Array.from({ length: totalDays }).map((_, i) => {
                const d = new Date(minMs + i * DAY);
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                const showLabel = i % tickEvery === 0;
                
                // Nomes dos meses para o topo
                const isStartOfMonth = d.getDate() === 1 || i === 0;
                const monthLabel = isStartOfMonth ? d.toLocaleDateString("pt-BR", { month: 'short' }).toUpperCase() : null;

                return (
                  <div 
                    key={i} 
                    className={`shrink-0 border-l relative flex flex-col items-center justify-center ${isWeekend ? 'bg-muted/40' : ''}`}
                    style={{ width: dayPx }}
                  >
                    {monthLabel && (
                      <span className="absolute -top-px left-1 text-[8px] font-bold text-primary/70">{monthLabel}</span>
                    )}
                    <span className={`text-[9px] font-medium ${isWeekend ? 'text-muted-foreground/60' : ''}`}>
                      {d.getDate().toString().padStart(2, '0')}
                    </span>
                    <span className="text-[8px] opacity-40 uppercase">{d.toLocaleDateString("pt-BR", { weekday: 'narrow' })}</span>
                  </div>
                );
              })}
            </div>

            {/* Grid e Barras */}
            <div className="relative">
              {orderedItems.map((it, idx) => {
                const e = ensaioById.get(it.ensaioId);
                const t = e ? tipoById.get(e.tipo_ensaio_id) : null;
                const left = Math.round(((parse(it.inicio) - minMs) / DAY) * dayPx);
                const durDays = Math.max(it.dur || 1, (parse(it.fim) - parse(it.inicio)) / DAY + 1);
                const w = durDays * dayPx - 6;

                // Programações passadas para o mesmo equipamento
                const pasts = it.equipId ? pastItemsByEquip.get(it.equipId) || [] : [];
                
                return (
                  <div key={idx} className="h-10 relative border-b group hover:bg-accent/20 transition-colors">
                    {/* Linhas verticais de grid */}
                    {Array.from({ length: totalDays }).map((_, i) => {
                      const d = new Date(minMs + i * DAY);
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      return (
                        <div 
                          key={i} 
                          className={`absolute top-0 h-full border-l border-border/10 ${isWeekend ? 'bg-muted/10' : ''}`} 
                          style={{ left: i * dayPx, width: dayPx }} 
                        />
                      );
                    })}

                    {/* Barras cinzas de programações antigas */}
                    {pasts.map((p, pidx) => {
                      const pStart = parse(p.inicio);
                      const pEnd = parse(p.fim);
                      if (pEnd < minMs || pStart > maxMs) return null;
                      
                      const pLeft = Math.round(((Math.max(pStart, minMs) - minMs) / DAY) * dayPx);
                      const pW = Math.round(((Math.min(pEnd, maxMs) - Math.max(pStart, minMs)) / DAY + 1) * dayPx) - 6;
                      
                      return (
                        <div
                          key={`past-${pidx}`}
                          className="absolute top-6 h-2 bg-muted-foreground/20 rounded-full border border-border/10 pointer-events-none z-0"
                          style={{ left: pLeft + 3, width: Math.max(4, pW) }}
                        />
                      );
                    })}
                    
                    {/* A barra do ensaio atual - Estilo Gantt Moderno */}
                    <div
                      title={`${it.inicio} → ${it.fim}\n${it.dur}d\nEquip: ${it.equipId ? equipById.get(it.equipId)?.nome : 'N/A'}`}
                      className="absolute top-2 h-6 rounded-md shadow-sm text-[10px] text-white px-2.5 flex items-center overflow-hidden transition-all hover:scale-[1.02] hover:shadow-md z-10 select-none group-hover:brightness-110"
                      style={{ 
                        left: left + 3, 
                        width: Math.max(20, w),
                        backgroundColor: t?.cor_gantt || '#f59e0b',
                        border: '1px solid rgba(0,0,0,0.1)'
                      }}
                    >
                      <span className="truncate font-semibold drop-shadow-sm">
                        {t?.nome}
                      </span>
                      {durDays > 1.5 && (
                        <span className="ml-auto text-[8px] opacity-80 font-mono">
                          {it.dur}d
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}