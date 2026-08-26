import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listRows,
  insertRow,
  updateRow,
  deleteRow,
  ensureColumns,
} from "@/lib/programacao.functions";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CalendarRange, Trash2, Pencil, Plus, ChevronLeft, ChevronRight, ChevronDown, ZoomIn, ZoomOut, CalendarDays, Activity, CheckCircle2, Clock, Info, ArrowLeftRight, ClipboardList, Printer, AlertTriangle, Search, X, Archive, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { equipColor } from "@/lib/equip-colors";
const suporteLogoUrl = "/suporte-infra-logo.png";
import {
  allocateWorkloadOnDays,
  endIsoFromDur,
  nextBusinessDayIso,
  addBusinessOffsetIso,
  nextAvailableWorkDay,
  normalizeDurationDays,
  parseIncluirFds,
  isBusinessDayIso,
} from "@/lib/business-days";
import { criarPendenciaDigitacao } from "@/lib/lab-pendencias.functions";
import { formatDurReal, durRealDays } from "@/lib/duracao-real";
import {
  SHEET_AMOSTRAS,
  SHEET_ENSAIOS,
  SHEET_PROGS,
  SHEET_TIPOS,
  SHEET_EQUIPS,
  PROG_COLUMNS,
  parseProgramacaoRow,
  type Programacao,
} from "@/lib/programacao-model";
import { recalculateDownstream } from "@/lib/programacao-cascade";

type Amostra = {
  id: string;
  os_numero: string;
  codigo_amostra: string | null;
  tipo: string | null;
  identificacao: string | null;
  topo_m: string | null;
  base_m: string | null;
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
type TipoEnsaio = { id: string; nome: string; cor_gantt: string | null; equipamentos_ids: string[] };
type Equipamento = { id: string; nome: string };

/* ------------------------------- Rota ------------------------------- */
export const Route = createFileRoute("/_app/programacao/gantt")({
  component: GanttPage,
});

function GanttPage() {
  const qc = useQueryClient();

  // garante colunas na aba Programações (roda uma vez)
  useEffect(() => {
    ensureColumns({ data: { sheet: SHEET_PROGS, columns: PROG_COLUMNS } }).catch(() => {});
  }, []);

  const { data: amostras = [] } = useQuery({
    queryKey: ["amostras"],
    queryFn: async () =>
      (await listRows({ data: { sheet: SHEET_AMOSTRAS } })).map((r) => ({
        id: r.id,
        os_numero: r.os_numero || r.os || r.OS || r.osNumero || "",
        codigo_amostra: r.codigo_amostra || r.codigo || r.code || r.amostra || r.identificacao || null,
        tipo: r.tipo || null,
        // "descricao" na aba Amostras guarda "identificação — Coleta: ..."
        identificacao: (r.descricao || "").split(" — ")[0] || r.identificacao || r.codigo_amostra || null,
        topo_m: r.topo_m || null,
        base_m: r.base_m || null,
      })) as Amostra[],
  });
  const { data: ensaios = [] } = useQuery({
    queryKey: ["ensaios"],
    queryFn: async () =>
      (await listRows({ data: { sheet: SHEET_ENSAIOS } })).map((r) => ({
        id: r.id,
        amostra_id: r.amostra_id || r.amostraId || r.amostra || "",
        tipo_ensaio_id: r.tipo_ensaio_id || r.tipoEnsaioId || r.tipo_id || r.tipo || "",
        status: r.status || "pendente",
        prazo: r.prazo || null,
        observacoes: r.observacoes || null,
        detalhes_tecnicos: r.detalhes_tecnicos || null,
      })) as Ensaio[],
  });
  const { data: tipos = [] } = useQuery({
    queryKey: ["tipos_ensaio_min"],
    queryFn: async () =>
      (await listRows({ data: { sheet: SHEET_TIPOS } })).map((r) => ({
        id: r.id,
        nome: r.nome ?? "",
        cor_gantt: r.cor_gantt || null,
        equipamentos_ids: (r.equipamentos_ids || "").split(",").map((s) => s.trim()).filter(Boolean),
      })) as TipoEnsaio[],
  });
  const { data: equipamentos = [] } = useQuery({
    queryKey: ["equipamentos_min"],
    queryFn: async () =>
      (await listRows({ data: { sheet: SHEET_EQUIPS } })).map((r) => ({
        id: r.id,
        nome: r.nome ?? "",
      })) as Equipamento[],
  });
  const { data: progs = [] } = useQuery({
    queryKey: ["programacoes_full"],
    queryFn: async () =>
      (await listRows({ data: { sheet: SHEET_PROGS } })).map(parseProgramacaoRow),
  });

  const tipoById = useMemo(() => new Map(tipos.map((t) => [t.id, t])), [tipos]);
  const equipById = useMemo(() => new Map(equipamentos.map((e) => [e.id, e])), [equipamentos]);
  const amostraById = useMemo(() => new Map(amostras.map((a) => [a.id, a])), [amostras]);
  const ensaioById = useMemo(() => new Map(ensaios.map((e) => [e.id, e])), [ensaios]);

  /* ---- Janela de tempo (padrão: hoje - 3 dias) ---- */
  const [anchor, setAnchor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 3);
    return d;
  });
  const [dias, setDias] = useState(30);

  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < dias; i++) {
      const d = new Date(anchor);
      d.setDate(anchor.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [anchor, dias]);

  const [dayW, setDayW] = useState(22); // px por dia (zoom) — estilo MS Project

  // Largura da coluna esquerda (Equipamento / Ensaio) — redimensionável com duplo-clique p/ auto-size
  const [leftW, setLeftW] = useState<number>(() => {
    if (typeof window === "undefined") return 320;
    const v = Number(window.localStorage.getItem("gantt-leftw"));
    return Number.isFinite(v) && v >= 220 && v <= 900 ? v : 320;
  });
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("gantt-leftw", String(leftW));
  }, [leftW]);
  const startResizeLeft = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = leftW;
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(900, Math.max(220, startW + (ev.clientX - startX)));
      setLeftW(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Colunas fixas de meta (Início / Fim / Dur.) — mantidas enxutas
  const META_TEMPLATE = "64px 64px 44px";
  const META_START_COL = 5; // 1: nome, 2: início, 3: fim, 4: dur, 5+: dias

  // Agrupamento de dias por mês para header de dois níveis
  const monthSpans = useMemo(() => {
    const spans: { label: string; span: number }[] = [];
    for (const d of days) {
      const label = `${monthLong(d)} ${d.getFullYear()}`;
      const last = spans[spans.length - 1];
      if (last && last.label === label) last.span += 1;
      else spans.push({ label, span: 1 });
    }
    return spans;
  }, [days]);

  /* ---- Filtro por equipamento ---- */
  const [filtroEquip, setFiltroEquip] = useState<string>("todos");
  const [filtroEnsaio, setFiltroEnsaio] = useState<string>("todos");
  const [busca, setBusca] = useState("");

  const matchBusca = (p: Programacao, q: string) => {
    if (!q) return true;
    const e = ensaioById.get(p.ensaio_id);
    const a = e ? amostraById.get(e.amostra_id) : undefined;
    const tipo = e ? tipoById.get(e.tipo_ensaio_id)?.nome : "";
    const eq = p.equipamento_id ? equipById.get(p.equipamento_id)?.nome : "";
    const hay = [
      a?.os_numero,
      a?.codigo_amostra,
      a?.identificacao,
      tipo,
      eq,
      p.tecnico,
      p.observacoes,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  };

  const progsFiltradas = useMemo(() => {
    return progs.filter((p) => {
      if (p.status === "concluido") return false;
      if (filtroEquip !== "todos" && (p.equipamento_id ?? "") !== filtroEquip) return false;
      if (filtroEnsaio !== "todos") {
        const e = ensaioById.get(p.ensaio_id);
        if (!e || e.tipo_ensaio_id !== filtroEnsaio) return false;
      }
      if (!matchBusca(p, busca)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progs, filtroEquip, filtroEnsaio, ensaioById, amostraById, tipoById, equipById, busca]);

  const concluidos = useMemo(
    () => progs.filter((p) => p.status === "concluido"),
    [progs],
  );

  /* ---- Agrupamento por equipamento ---- */
  const grupos = useMemo(() => {
    const map = new Map<string, Programacao[]>();
    for (const p of progsFiltradas) {
      const k = p.equipamento_id || "__sem__";
      const list = map.get(k) ?? [];
      list.push(p);
      map.set(k, list);
    }
    return Array.from(map.entries()).map(([k, items]) => ({
      equipamentoId: k === "__sem__" ? null : k,
      nome: k === "__sem__" ? "Sem equipamento" : equipById.get(k)?.nome || "—",
      items: items.sort((a, b) => (a.data_inicio || "").localeCompare(b.data_inicio || "")),
    }));
  }, [progsFiltradas, equipById]);

  /* ---- Ensaios ainda sem programação ---- */
  const ensaiosSemProg = useMemo(() => {
    const progSet = new Set(progs.map((p) => p.ensaio_id));
    return ensaios.filter((e) => !progSet.has(e.id) && e.status !== "cancelado" && e.status !== "concluido");
  }, [ensaios, progs]);

  // Auto-size da coluna esquerda (duplo-clique no divisor) — mede o maior rótulo visível
  const autoSizeLeft = () => {
    if (typeof document === "undefined") return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const fontLabel = "600 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"; // text-xs font-medium
    const fontGroup = "700 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    const PAD = 24 + 12 + 24; // px-3 esquerda/direita + marcador + folga p/ contador
    let maxW = 0;
    for (const g of grupos) {
      ctx.font = fontGroup;
      const gW = ctx.measureText(g.nome).width + 24 /* chevron+badge */ + 40 /* contador ensaios */;
      if (gW > maxW) maxW = gW;
      ctx.font = fontLabel;
      for (const p of g.items) {
        const e = ensaioById.get(p.ensaio_id);
        const t = e ? tipoById.get(e.tipo_ensaio_id) : null;
        const a = e ? amostraById.get(e.amostra_id) : null;
        const txt = `${t?.nome || "Ensaio"} • ${a?.codigo_amostra || "amostra"}${a?.tipo ? ` (${a.tipo})` : ""}${a?.identificacao ? ` • ${a.identificacao}` : ""}${a?.os_numero ? ` • OS ${a.os_numero}` : ""}`;
        const w = ctx.measureText(txt).width;
        if (w > maxW) maxW = w;
      }
    }
    const needed = Math.ceil(maxW + PAD);
    setLeftW(Math.min(900, Math.max(220, needed)));
  };

  /* ---- Mutations ---- */
  const savProg = useMutation({
    mutationFn: async (p: { id?: string; row: Partial<Programacao> }) => {
      if (p.id) {
        await updateRow({ data: { sheet: SHEET_PROGS, id: p.id, patch: p.row as Record<string, unknown> } });
        // Espelha as observações da programação para o ensaio vinculado —
        // assim Central e Gantt permanecem sempre em sincronia.
        if ("observacoes" in p.row) {
          const prog = progs.find((x) => x.id === p.id);
          const ensaioId = (p.row.ensaio_id as string | undefined) || prog?.ensaio_id;
          if (ensaioId) {
            try {
              await updateRow({
                data: {
                  sheet: SHEET_ENSAIOS,
                  id: ensaioId,
                  patch: { observacoes: (p.row.observacoes as string | null) ?? "" },
                },
              });
            } catch { /* segue mesmo se o espelho falhar */ }
          }
        }
        // Ponte Gantt -> Relatório (Pendente de digitação):
        // Só criamos pendência ao CONCLUIR e apenas para ensaios NÃO
        // digitalizáveis via QR (ensaios digitalizáveis, como M.ESP.A,
        // nascem na aba Digitalização quando o operador envia os dados).
        if (p.row.status === "concluido") {
          try {
            const prog = progs.find((x) => x.id === p.id);
            if (prog) {
              const e = ensaioById.get(prog.ensaio_id);
              const a = e ? amostraById.get(e.amostra_id) : undefined;
              const tipoNome = e ? tipoById.get(e.tipo_ensaio_id)?.nome ?? null : null;
              const equipNome = prog.equipamento_id ? equipById.get(prog.equipamento_id)?.nome ?? null : null;
              const isMespA = /m\.?\s*esp\.?\s*a|massa\s+espec[ií]fica\s+aparente/i.test(tipoNome ?? "");
              // M.ESP.A tem fluxo de Digitalização próprio — não duplicamos aqui.
              if (!isMespA && a?.os_numero) {
                await criarPendenciaDigitacao({
                  data: {
                    os: a.os_numero,
                    amostra: a.codigo_amostra ?? null,
                    ensaio: tipoNome ?? "Ensaio",
                    tipo_ensaio: tipoNome,
                    equipamento: equipNome,
                    programacao_id: prog.id,
                    origem: "gantt",
                    operador_nome: prog.tecnico ?? null,
                  },
                });
              }
            }
          } catch { /* não bloqueia a conclusão se a ponte falhar */ }
        }
      } else {
        await insertRow({ data: { sheet: SHEET_PROGS, row: p.row as Record<string, unknown> } });
        // Ao criar uma programação com observação, propaga para o ensaio.
        if (p.row.ensaio_id && p.row.observacoes) {
          try {
            await updateRow({
              data: {
                sheet: SHEET_ENSAIOS,
                id: p.row.ensaio_id as string,
                patch: { observacoes: p.row.observacoes as string },
              },
            });
          } catch { /* segue mesmo se o espelho falhar */ }
        }
      }
    },
    onSuccess: () => {
      toast.success("Programação salva");
      qc.invalidateQueries({ queryKey: ["programacoes_full"] });
      qc.invalidateQueries({ queryKey: ["programacoes"] });
      qc.invalidateQueries({ queryKey: ["ensaios"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
  });
  const delProg = useMutation({
    mutationFn: async (id: string) => {
      await deleteRow({ data: { sheet: SHEET_PROGS, id } });
    },
    onSuccess: () => {
      toast.success("Programação removida");
      qc.invalidateQueries({ queryKey: ["programacoes_full"] });
      qc.invalidateQueries({ queryKey: ["programacoes"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover"),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Programacao | null>(null);
  const [preselectEnsaioId, setPreselectEnsaioId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const allKeys = grupos.map((g) => g.equipamentoId ?? "__sem__");
  const allCollapsed = allKeys.length > 0 && allKeys.every((k) => collapsed.has(k));
  const toggleAll = () => {
    if (allCollapsed) setCollapsed(new Set());
    else setCollapsed(new Set(allKeys));
  };

  // KPIs
  const kpis = useMemo(() => {
    const total = progs.length;
    const concluido = progs.filter((p) => p.status === "concluido").length;
    const emExec = progs.filter((p) => p.status === "em_execucao").length;
    const pendente = progs.filter((p) => p.status === "planejado").length;
    const avgProg = total > 0 ? Math.round(progs.reduce((s, p) => s + computeLiveProgress(p), 0) / total) : 0;
    return { total, concluido, emExec, pendente, avgProg };
  }, [progs]);

  // Details panel (opens on bar/label click; edit is a secondary action)
  const [detailProg, setDetailProg] = useState<Programacao | null>(null);
  const [trocarOpen, setTrocarOpen] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [concluidosOpen, setConcluidosOpen] = useState(false);

  /* ---- Drag-and-drop nativo ----
   * Suporta duas origens:
   *  1) card em "Ensaios sem programação" → cria nova programação
   *  2) barra existente do timeline → reprograma (equipamento + data)
   * O alvo é sempre a faixa horizontal de um equipamento; o dia é
   * calculado pela posição X do mouse dentro da faixa.
   */
  const [dragEnsaioId, setDragEnsaioId] = useState<string | null>(null);
  const [dragProg, setDragProg] = useState<Programacao | null>(null);
  const [dropTarget, setDropTarget] = useState<
    { equipId: string | null; dayIndex: number } | null
  >(null);

  const isDragging = dragEnsaioId != null || dragProg != null;

  const dayIndexFromEvent = (
    ev: React.DragEvent<HTMLDivElement>,
    daysLen: number,
    dayWidth: number,
  ) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    return Math.max(0, Math.min(daysLen - 1, Math.floor(x / dayWidth)));
  };

  const handleTimelineDragOver = (
    equipId: string | null,
    ev: React.DragEvent<HTMLDivElement>,
  ) => {
    if (!isDragging) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = dragProg ? "move" : "copy";
    const idx = dayIndexFromEvent(ev, days.length, dayW);
    if (!dropTarget || dropTarget.equipId !== equipId || dropTarget.dayIndex !== idx) {
      setDropTarget({ equipId, dayIndex: idx });
    }
  };

  const handleTimelineDrop = (
    equipamentoId: string | null,
    ev: React.DragEvent<HTMLDivElement>,
  ) => {
    ev.preventDefault();
    const idx = dayIndexFromEvent(ev, days.length, dayW);
    const iso = toIso(days[idx]);
    if (dragProg) {
      const dur = dragProg.duracao_dias || 1;
      const incluir = dragProg.incluir_fds;
      const fim = endIsoFromDur(iso, dur, incluir);
      savProg.mutate({
        id: dragProg.id,
        row: {
          equipamento_id: equipamentoId ?? "",
          data_inicio_prevista: iso,
          data_inicio: iso,
          data_fim: fim,
        },
      });
    } else if (dragEnsaioId) {
      savProg.mutate({
        row: {
          ensaio_id: dragEnsaioId,
          equipamento_id: equipamentoId ?? "",
          data_inicio_prevista: iso,
          data_inicio: iso,
          duracao_dias: 1,
          data_fim: iso,
          status: "planejado",
          progresso: 0,
          incluir_fds: false,
        },
      });
    }
    setDragEnsaioId(null);
    setDragProg(null);
    setDropTarget(null);
  };

  const clearDrag = () => {
    setDragEnsaioId(null);
    setDragProg(null);
    setDropTarget(null);
  };

  // Cascata de reagendamento: ao iniciar/terminar um ensaio, recalcula o
  // início dos sucessores (predecessor_id, ou próximo do mesmo equipamento)
  // a partir da nova data efetiva — pra frente (termina antes) ou pra trás
  // (atrasa). Mesmo motor usado pelo scan.tsx, pra bancada e escritório se
  // comportarem de forma idêntica.
  const runCascade = async (anchorProgId: string, anchorFinishIso: string) => {
    const { shifted } = await recalculateDownstream(anchorProgId, anchorFinishIso, progs, async (id, patch) => {
      await updateRow({ data: { sheet: SHEET_PROGS, id, patch } });
    });
    if (shifted > 0) {
      toast.info(`${shifted} ensaio(s) reagendado(s) automaticamente`);
      qc.invalidateQueries({ queryKey: ["programacoes_full"] });
      qc.invalidateQueries({ queryKey: ["programacoes"] });
    }
    return shifted;
  };

  /* ---- Impressão do Gantt (linha do tempo visual + tabela com status) ---- */
  const imprimirGantt = () => {
    const win = window.open("", "_blank", "width=1400,height=900");
    if (!win) { toast.error("Popup bloqueado"); return; }
    const escapeHtml = (s: string) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const dataStr = new Date().toLocaleString("pt-BR");
    const inicioStr = formatBr(toIso(anchor));
    const fimStr = formatBr(toIso(days[days.length - 1] ?? anchor));
    const filtroInfo = [
      filtroEquip !== "todos" ? `Equipamento: ${equipById.get(filtroEquip)?.nome || "—"}` : null,
      filtroEnsaio !== "todos" ? `Tipo: ${tipoById.get(filtroEnsaio)?.nome || "—"}` : null,
      busca ? `Busca: "${busca}"` : null,
      `Janela: ${inicioStr} → ${fimStr} (${days.length}d)`,
    ].filter(Boolean).join(" • ");

    const startIso = toIso(anchor);
    const endIso = toIso(days[days.length - 1] ?? anchor);
    const DAY_MS = 86400000;
    const startMs = new Date(startIso + "T00:00:00").getTime();
    const endMs = new Date(endIso + "T00:00:00").getTime();
    const totalDays = Math.max(1, Math.round((endMs - startMs) / DAY_MS) + 1);
    const COL_W = 26; // px por dia na impressão
    const gridWidth = totalDays * COL_W;
    const INFO_W = 430; // largura painel de informações à esquerda
    const hojeIso = toIso(new Date());
    const hojeMs = new Date(hojeIso + "T00:00:00").getTime();
    const hojeLeft = hojeMs >= startMs && hojeMs <= endMs
      ? ((hojeMs - startMs) / DAY_MS) * COL_W + COL_W / 2
      : -1;

    const statusMeta = (s: Programacao["status"]) =>
      s === "concluido"
        ? { label: "Concluído", bg: "#16a34a", fg: "#fff" }
        : s === "em_execucao"
        ? { label: "Em execução", bg: "#F0B43C", fg: "#1a1a1a" }
        : { label: "Programado", bg: "#2563eb", fg: "#fff" };

    const dayCellsHtml = days
      .map((d) => {
        const iso = toIso(d);
        const wk = d.getDay();
        const isWeekend = wk === 0 || wk === 6;
        const isToday = iso === hojeIso;
        const bg = isToday ? "#fff4d1" : isWeekend ? "#f4f4f4" : "#fff";
        const cls = `daycell${isToday ? " today" : ""}${isWeekend ? " wknd" : ""}`;
        return `<div class="${cls}" style="width:${COL_W}px;background:${bg}"><div class="dc-d">${d.getDate()}</div><div class="dc-w">${weekdayShort(d)}</div></div>`;
      })
      .join("");

    const monthHeaderHtml = monthSpans
      .map((m) => `<div class="mhead" style="width:${m.span * COL_W}px">${m.label}</div>`)
      .join("");

    // Fundos de fim de semana (verticais) para as linhas de programação
    const wknCols = days
      .map((d, i) => {
        const wk = d.getDay();
        if (wk !== 0 && wk !== 6) return "";
        return `<div class="wkband" style="left:${i * COL_W}px;width:${COL_W}px"></div>`;
      })
      .join("");

    const rowFor = (p: Programacao) => {
      const ens = ensaioById.get(p.ensaio_id);
      const amo = ens ? amostraById.get(ens.amostra_id) : null;
      const tipo = ens ? tipoById.get(ens.tipo_ensaio_id) : null;
      const s = p.data_inicio || p.data_inicio_prevista;
      const e = p.data_fim || (s ? endIsoFromDur(s, p.duracao_dias || 1, p.incluir_fds) : null);
      const meta = statusMeta(p.status);
      const prev = p.data_inicio_prevista;
      const real = p.data_inicio_real;
      const atrasoDias = prev && real
        ? Math.round((new Date(real + "T00:00:00").getTime() - new Date(prev + "T00:00:00").getTime()) / DAY_MS)
        : 0;

      // Barra planejada (sombra) — se houver desvio entre prev e real
      let plannedBar = "";
      if (prev && real && real !== prev) {
        const pStart = new Date(prev + "T00:00:00").getTime();
        const pEnd = new Date(endIsoFromDur(prev, p.duracao_dias || 1, p.incluir_fds) + "T00:00:00").getTime();
        const vS = Math.max(pStart, startMs);
        const vE = Math.min(pEnd, endMs);
        if (vE >= vS) {
          const left = ((vS - startMs) / DAY_MS) * COL_W;
          const w = Math.max(COL_W * 0.5, ((vE - vS) / DAY_MS + 1) * COL_W - 2);
          plannedBar = `<div class="bar-planned" style="left:${left}px;width:${w}px"></div>`;
        }
      }

      let mainBar = "";
      if (s && e) {
        const sMs = new Date(s + "T00:00:00").getTime();
        const eMs2 = new Date(e + "T00:00:00").getTime();
        const visS = Math.max(sMs, startMs);
        const visE = Math.min(eMs2, endMs);
        if (visE >= visS) {
          const left = ((visS - startMs) / DAY_MS) * COL_W;
          const width = Math.max(COL_W * 0.6, ((visE - visS) / DAY_MS + 1) * COL_W - 2);
          const prog = computeLiveProgress(p);
          const barBg = isBarOverdue(p) ? "var(--status-atrasado)" : meta.bg;
          mainBar = `<div class="bar" style="left:${left}px;width:${width}px;background:${barBg};color:${meta.fg}">
              <div class="bar-fill" style="width:${prog}%"></div>
              <span class="bar-lbl">${escapeHtml(tipo?.nome || "")} ${prog ? `· ${prog}%` : ""}</span>
            </div>`;
        }
      }

      const infoPills = [
        s ? `<span class="chip"><b>Início</b> ${formatBr(s)}</span>` : "",
        e ? `<span class="chip"><b>Fim</b> ${formatBr(e)}</span>` : "",
        `<span class="chip"><b>Dur.</b> ${p.duracao_dias}d</span>`,
        atrasoDias > 0 ? `<span class="chip chip-late"><b>Atraso</b> +${atrasoDias}d</span>` : "",
      ].filter(Boolean).join("");

      return `<div class="row">
        <div class="row-info">
          <div class="row-info-top">
            <span class="pill" style="background:${meta.bg};color:${meta.fg}">${meta.label}</span>
            <span class="os">OS ${escapeHtml(amo?.os_numero || "—")}</span>
            <span class="tec">${escapeHtml(p.tecnico || "—")}</span>
          </div>
          <div class="row-info-title">
            <b>${escapeHtml(amo?.codigo_amostra || "—")}</b>
            <span class="mut"> · ${escapeHtml(tipo?.nome || "—")}</span>
          </div>
          ${amo?.identificacao ? `<div class="row-info-sub">${escapeHtml(amo.identificacao)}</div>` : ""}
          <div class="row-chips">${infoPills}</div>
        </div>
        <div class="row-timeline">
          ${wknCols}
          ${plannedBar}
          ${mainBar}
          ${hojeLeft >= 0 ? `<div class="today-line" style="left:${hojeLeft}px"></div>` : ""}
        </div>
      </div>`;
    };

    const gruposHtml = grupos
      .map((g) => {
        const rows = g.items.map(rowFor).join("");
        return `<section class="grupo">
          <div class="grupo-head">
            <h3>${escapeHtml(g.nome)}</h3>
            <span class="mut">${g.items.length} ${g.items.length === 1 ? "ensaio" : "ensaios"}</span>
          </div>
          ${rows}
        </section>`;
      })
      .join("");

    const logoUrl = `${window.location.origin}${suporteLogoUrl}`;
    const logoImg = `<img src="${logoUrl}" alt="Suporte INFRA" style="height:44px;width:auto" onerror="this.style.display='none'"/>`;

    const totalWidth = INFO_W + gridWidth;
    // A3 landscape útil ≈ 408mm ≈ 1542px @ 96dpi (descontando margens da @page).
    const PRINT_MAX_PX = 1540;
    const printZoom = Math.min(1, PRINT_MAX_PX / totalWidth);

    win.document.write(`<!doctype html><html><head><meta charset="utf-8"/>
      <title>Gantt de ensaios — Suporte INFRA</title>
      <style>
        * { box-sizing: border-box; }
        html, body {
          font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif;
          margin: 14px; color: #1a1a1a;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        /* Força o navegador a imprimir cores/fundos em todos os elementos coloridos */
        header, .board, .head-row, .head-info, .head-cal, .month-row, .day-row,
        .mhead, .daycell, .grupo, .grupo-head, .row, .row-info, .row-timeline,
        .wkband, .bar, .bar-fill, .bar-planned, .today-line, .pill, .chip,
        .legend, .legend .sw {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        header { display:flex; align-items:center; gap:12px; border-bottom:2px solid #F0B43C; padding-bottom:10px; margin-bottom:12px; }
        header .brand { font-weight:800; font-size:18px; letter-spacing:-0.02em; }
        header .brand span { color:#F0B43C; }
        header .meta { margin-left:auto; text-align:right; font-size:11px; color:#555; }
        .mut { color:#8a8a8a; font-weight: 400; }

        .board { width: ${totalWidth}px; border: 1px solid #e2e2e2; border-radius: 6px; overflow: hidden; }

        /* Cabeçalho (Info | Meses | Dias) */
        .head-row { display:flex; background:#fafafa; border-bottom:1px solid #e2e2e2; }
        .head-info { width:${INFO_W}px; padding:8px 12px; border-right:2px solid #d4d4d4; }
        .head-info .t { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:#666; font-weight:700; }
        .head-info .s { font-size:11px; color:#555; margin-top:2px; }
        .head-cal { flex:0 0 auto; }
        .month-row, .day-row { display:flex; }
        .mhead { border-right:1px solid #ddd; padding:5px 8px; font-size:11px; font-weight:700; background:#fafafa; text-transform:uppercase; letter-spacing:.05em; color:#333; }
        .day-row { border-top:1px solid #eee; }
        .daycell { border-right:1px solid #eee; text-align:center; padding:3px 0; font-size:9px; line-height:1.15; }
        .daycell .dc-d { font-weight:700; color:#333; font-size:10px; }
        .daycell .dc-w { color:#999; font-size:8px; text-transform:uppercase; margin-top:1px; }
        .daycell.today .dc-d { color:#c78a00; }
        .daycell.wknd .dc-w { color:#c66; }

        /* Grupo por equipamento */
        .grupo { border-top:2px solid #d4d4d4; page-break-inside: avoid; }
        .grupo:first-of-type { border-top:0; }
        .grupo-head { display:flex; align-items:baseline; gap:10px; padding:6px 12px; background:#F0B43C; color:#1a1a1a; border-bottom:1px solid #d4a028; }
        .grupo-head h3 { margin:0; font-size:12px; text-transform:uppercase; letter-spacing:.06em; }
        .grupo-head .mut { color: rgba(26,26,26,.7); font-size:10px; }

        /* Linha (info + timeline) */
        .row { display:flex; border-bottom:1px solid #ececec; min-height: 58px; }
        .row:last-child { border-bottom:0; }
        .row-info { width:${INFO_W}px; padding:6px 12px; border-right:2px solid #d4d4d4; background:#fff; }
        .row-info-top { display:flex; align-items:center; gap:6px; font-size:9.5px; color:#555; }
        .row-info-top .os { font-family: ui-monospace, Menlo, monospace; color:#1a1a1a; font-weight:700; }
        .row-info-top .tec { margin-left:auto; color:#666; font-style: italic; }
        .row-info-title { font-size:12px; margin-top:3px; line-height:1.25; }
        .row-info-sub { font-size:10px; color:#777; margin-top:1px; }
        .row-chips { display:flex; flex-wrap:wrap; gap:4px; margin-top:4px; }
        .chip { display:inline-flex; align-items:center; gap:4px; padding:1px 6px; border:1px solid #e2e2e2; border-radius:3px; font-size:9px; color:#444; background:#fafafa; }
        .chip b { color:#111; font-weight:700; }
        .chip-late { background:#fdecea; border-color:#f5b7b1; color:#a04040; }
        .chip-late b { color:#a04040; }
        .pill { display:inline-block; padding:1px 6px; border-radius:8px; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.03em; }

        /* Timeline por linha */
        .row-timeline {
          position:relative; flex:0 0 auto; width:${gridWidth}px; height:auto;
          background-image: linear-gradient(to right, #f0f0f0 1px, transparent 1px);
          background-size: ${COL_W}px 100%;
        }
        .wkband { position:absolute; top:0; bottom:0; background:#f7f7f7; }
        .bar {
          position:absolute; top:14px; height:26px; border-radius:4px; font-size:10px; font-weight:700;
          padding:0 6px; overflow:hidden; display:flex; align-items:center;
          box-shadow: 0 1px 0 rgba(0,0,0,.12), inset 0 -2px 0 rgba(0,0,0,.12);
        }
        .bar-fill { position:absolute; left:0; top:0; bottom:0; background: rgba(255,255,255,.28); border-right:1px dashed rgba(255,255,255,.6); }
        .bar-lbl { position:relative; white-space:nowrap; text-overflow:ellipsis; overflow:hidden; }
        .bar-planned {
          position:absolute; top:18px; height:18px; border:1px dashed #999; background: repeating-linear-gradient(45deg,#fff,#fff 3px,#eee 3px,#eee 6px);
          border-radius:3px; opacity:.9;
        }
        .today-line { position:absolute; top:0; bottom:0; width:2px; background:#e11d48; z-index:5; }

        .legend { display:flex; flex-wrap:wrap; gap:14px; font-size:10px; color:#555; margin: 8px 2px 12px; }
        .legend .sw { display:inline-block; width:12px; height:12px; border-radius:2px; margin-right:5px; vertical-align:middle; }
        .legend .sw-dashed { border:1px dashed #999; background: repeating-linear-gradient(45deg,#fff,#fff 2px,#eee 2px,#eee 4px); }
        .legend .sw-today { background:#e11d48; width:2px; height:12px; margin-right:6px; }

        @page { size: A3 landscape; margin: 6mm; }
        @media print {
          .noprint { display:none !important; }
          html, body { margin: 0 !important; padding: 0 !important; }
          /* Encaixa o board na largura da página A3 landscape mantendo proporções */
          .board { zoom: ${printZoom}; }
          .legend { zoom: ${printZoom}; }
          .head-row, .row { page-break-inside: avoid; break-inside: avoid; }
          .grupo { page-break-inside: auto; }
          .grupo-head { page-break-after: avoid; break-after: avoid; }
          header { page-break-after: avoid; }
        }
      </style>
      </head><body>
      <header>
        ${logoImg}
        <div>
          <div style="font-size:10px;color:#777;text-transform:uppercase;letter-spacing:.2em">Gantt de ensaios</div>
        </div>
        <div class="meta">
          <div><b>${dataStr}</b></div>
          <div>${escapeHtml(filtroInfo)}</div>
        </div>
      </header>
      <div class="legend">
        <span><span class="sw" style="background:#334155"></span>Planejado</span>
        <span><span class="sw" style="background:#F0B43C"></span>Em execução</span>
        <span><span class="sw" style="background:#059669"></span>Concluído</span>
        <span><span class="sw sw-dashed"></span>Previsto (quando houve remanejo)</span>
        <span><span class="sw sw-today"></span>Hoje</span>
      </div>
      <div class="board">
        <div class="head-row">
          <div class="head-info">
            <div class="t">Ensaio · OS · Status</div>
            <div class="s">Informações à esquerda · Linha do tempo à direita</div>
          </div>
          <div class="head-cal">
            <div class="month-row" style="width:${gridWidth}px">${monthHeaderHtml}</div>
            <div class="day-row" style="width:${gridWidth}px">${dayCellsHtml}</div>
          </div>
        </div>
        ${gruposHtml || '<div style="padding:20px;text-align:center" class="mut">Nenhuma programação na janela / filtros atuais.</div>'}
      </div>
      <div class="noprint" style="margin-top:16px;text-align:center">
        <button onclick="window.print()" style="padding:8px 20px;font-size:14px;background:#F0B43C;border:0;border-radius:4px;cursor:pointer">Imprimir / Salvar PDF</button>
      </div>
      <script>setTimeout(() => window.print(), 500);</script>
      </body></html>`);
    win.document.close();
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow="Programação · Timeline"
        icon={CalendarRange}
        title="Programação de ensaios"
        description={<>Linha do tempo por equipamento • {days.length} dias a partir de {formatBr(toIso(anchor))}</>}
      />
      {/* Barra de ações e filtros do Gantt */}
      <div className="flex flex-wrap items-end gap-2">
          <Button variant="outline" onClick={() => setAgendaOpen(true)}>
            <ClipboardList className="h-4 w-4" /> Agenda / PDF
          </Button>
          <Button variant="outline" onClick={imprimirGantt}>
            <Printer className="h-4 w-4" /> Imprimir Gantt
          </Button>
          <Button variant="outline" onClick={() => setConcluidosOpen(true)}>
            <Archive className="h-4 w-4" /> Concluídos
            <Badge variant="secondary" className="ml-1">{concluidos.length}</Badge>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/programacao/scan">
              <ScanLine className="h-4 w-4" /> Leitor QR
            </Link>
          </Button>
          <div>
            <Label className="text-xs text-muted-foreground">Busca</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="OS, amostra, ensaio, equip., técnico..."
                className="w-64 pl-7 pr-7"
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => setBusca("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label="Limpar busca"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Início</Label>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  const d = new Date(anchor);
                  d.setDate(d.getDate() - 14);
                  setAnchor(d);
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                value={toIso(anchor)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setAnchor(new Date(v + "T00:00:00"));
                }}
                className="w-40"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  const d = new Date(anchor);
                  d.setDate(d.getDate() + 14);
                  setAnchor(d);
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Dias</Label>
            <Select value={String(dias)} onValueChange={(v) => setDias(Number(v))}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="14">14</SelectItem>
                <SelectItem value="30">30</SelectItem>
                <SelectItem value="42">42</SelectItem>
                <SelectItem value="60">60</SelectItem>
                <SelectItem value="90">90</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Equipamento</Label>
            <Select value={filtroEquip} onValueChange={setFiltroEquip}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {equipamentos.map((eq) => (
                  <SelectItem key={eq.id} value={eq.id}>{eq.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Tipo de ensaio</Label>
            <Select value={filtroEnsaio} onValueChange={setFiltroEnsaio}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {tipos.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setPreselectEnsaioId(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Nova programação
          </Button>
        </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard icon={<CalendarDays className="h-3.5 w-3.5" />} label="Programações" value={kpis.total} tone="default" />
        <KpiCard icon={<Activity className="h-3.5 w-3.5" />} label="Em execução" value={kpis.emExec} tone="amber" />
        <KpiCard icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Concluídas" value={kpis.concluido} tone="emerald" />
      </div>

      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-2 py-2 px-3 border-b bg-gradient-to-r from-muted/60 via-muted/30 to-transparent">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              {grupos.length} equipamento(s)
            </span>
            <span className="text-border">•</span>
            <span>{progsFiltradas.length} barra(s) no filtro</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground mr-1">Zoom</span>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setDayW((w) => Math.max(14, w - 4))}>
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setDayW((w) => Math.min(64, w + 4))}>
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <div style={{ minWidth: leftW + days.length * dayW }}>
            {/* Header de datas (dois níveis) */}
            <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b">
              {/* Linha 1: meses */}
              <div
                className="grid"
                style={{ gridTemplateColumns: `${leftW}px ${META_TEMPLATE} repeat(${days.length}, ${dayW}px)` }}
              >
                <div className="sticky left-0 z-30 bg-background border-r px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center justify-between gap-2 relative">
                  <span>Equipamento / ensaio</span>
                  {allKeys.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleAll}
                      className="text-[10px] font-medium text-primary hover:underline"
                    >
                      {allCollapsed ? "Expandir tudo" : "Recolher tudo"}
                    </button>
                  )}
                  <div
                    onMouseDown={startResizeLeft}
                    onDoubleClick={autoSizeLeft}
                    title="Arraste para redimensionar · Duplo-clique para auto-ajustar"
                    className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-primary/60 active:bg-primary z-40"
                  />
                </div>
                <div className="border-r border-b bg-muted/40 px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-center">Início</div>
                <div className="border-r border-b bg-muted/40 px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-center">Fim</div>
                <div className="border-r border-b bg-muted/40 px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-center">Dur.</div>
                {monthSpans.map((m, i) => (
                  <div
                    key={i}
                    className="border-r border-b bg-muted/40 px-2 py-1 text-[11px] font-semibold text-foreground/80 uppercase tracking-wide truncate"
                    style={{ gridColumn: `span ${m.span}` }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
              {/* Linha 2: dias */}
              <div
                className="grid"
                style={{ gridTemplateColumns: `${leftW}px ${META_TEMPLATE} repeat(${days.length}, ${dayW}px)` }}
              >
                <div className="sticky left-0 z-30 bg-background border-r" />
                <div className="border-r border-border/50 bg-background" />
                <div className="border-r border-border/50 bg-background" />
                <div className="border-r border-border/50 bg-background" />
                {days.map((d, i) => {
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const isToday = sameDay(d, new Date());
                  return (
                    <div
                      key={i}
                      className={`border-r border-border/50 py-1 text-center relative ${isWeekend ? "bg-muted/20" : ""} ${isToday ? "bg-primary/10" : ""}`}
                    >
                      <div className={`text-[11px] leading-none ${isToday ? "font-bold text-primary" : "font-medium text-foreground/80"}`}>{d.getDate()}</div>
                      <div className={`text-[9px] uppercase mt-0.5 ${isToday ? "text-primary/80 font-semibold" : "text-muted-foreground"}`}>{weekdayShort(d)}</div>
                      {isToday && <div className="absolute -bottom-px left-0 right-0 h-0.5 bg-primary" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {grupos.length === 0 && (
              <div className="p-12 text-center">
                <CalendarRange className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                <div className="text-sm font-medium">Nenhuma programação no período</div>
                <div className="text-xs text-muted-foreground mt-1">Clique em "Nova programação" para começar.</div>
              </div>
            )}

            {grupos.map((g) => (
              <div key={g.equipamentoId ?? "sem"} className="border-b last:border-b-0">
                {(() => {
                  const key = g.equipamentoId ?? "__sem__";
                  const isCollapsed = collapsed.has(key);
                  const c = g.equipamentoId ? equipColor(g.nome) : null;
                  return (
                    <div
                      className="grid border-b border-border/60"
                      style={{ gridTemplateColumns: `${leftW}px ${META_TEMPLATE} repeat(${days.length}, ${dayW}px)` }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleGroup(key)}
                        className="sticky left-0 z-10 flex items-center gap-2 px-2 py-1.5 text-xs font-semibold border-r border-border/60 text-left relative overflow-hidden"
                        title={isCollapsed ? "Expandir" : "Recolher"}
                        style={{
                          width: leftW,
                          background: c
                            ? `color-mix(in oklab, ${c.bg} 55%, var(--background))`
                            : undefined,
                        }}
                      >
                        {c && (
                          <span
                            className="absolute left-0 top-0 bottom-0 w-1.5"
                            style={{ background: c.border }}
                          />
                        )}
                        {isCollapsed ? (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        {c ? (
                          <span
                            className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold shrink-0 tracking-wide"
                            style={{ backgroundColor: "rgba(255,255,255,0.7)", color: c.text, border: `1px solid ${c.border}` }}
                          >
                            {g.nome}
                          </span>
                        ) : (
                          <span className="truncate">{g.nome}</span>
                        )}
                        <span className="ml-auto text-[10px] font-medium" style={{ color: c?.text ?? undefined }}>
                          {g.items.length} {g.items.length === 1 ? "ensaio" : "ensaios"}
                        </span>
                      </button>
                      <div className="border-r border-border/40 bg-muted/20" />
                      <div className="border-r border-border/40 bg-muted/20" />
                      <div className="border-r border-border/40 bg-muted/20" />
                      <div
                        className="relative"
                        style={{ gridColumn: `${META_START_COL} / span ${days.length}`, height: 26 }}
                        onDragOver={(ev) => handleTimelineDragOver(g.equipamentoId, ev)}
                        onDrop={(ev) => handleTimelineDrop(g.equipamentoId, ev)}
                        onDragLeave={() => setDropTarget(null)}
                      >
                        <BarBackground days={days} dayW={dayW} />
                        {isDragging &&
                          dropTarget?.equipId === g.equipamentoId && (
                            <div
                              className="absolute top-0 bottom-0 pointer-events-none rounded-sm ring-2 ring-primary/70 bg-primary/15"
                              style={{
                                left: dropTarget.dayIndex * dayW,
                                width: dayW,
                              }}
                            />
                          )}
                      </div>
                    </div>
                  );
                })()}
                {!collapsed.has(g.equipamentoId ?? "__sem__") && (() => {
                  // Cascata visual (estilo MS Project): quando várias tarefas
                  // fracionárias começam no mesmo dia no mesmo equipamento,
                  // deslocamos cada uma pela soma das durações anteriores para
                  // que apareçam encadeadas dentro da célula do dia.
                  const offsets = new Map<string, number>();
                  const acc = new Map<string, number>();
                  for (const it of g.items) {
                    const s = it.data_inicio;
                    if (!s) continue;
                    const dur = it.duracao_dias || 0;
                    const isFrac = dur > 0 && dur < 1;
                    if (!isFrac) { acc.set(s, 0); continue; }
                    const cur = acc.get(s) || 0;
                    offsets.set(it.id, cur);
                    acc.set(s, cur + dur);
                  }
                  return g.items.map((p, idx) => {
                  const e = ensaioById.get(p.ensaio_id);
                  const t = e ? tipoById.get(e.tipo_ensaio_id) : null;
                  const a = e ? amostraById.get(e.amostra_id) : null;
                  const cor = t?.cor_gantt || "#6366f1";
                  const label = `${t?.nome || "Ensaio"} • ${a?.codigo_amostra || "amostra"}${a?.os_numero ? ` • OS ${a.os_numero}` : ""}`;
                  const durLabel = p.data_inicio ? formatDur(p.duracao_dias) : "—";
                  const rowBg = idx % 2 === 1 ? "bg-muted/30" : "bg-background";
                  // Marcador de prazo da OS na timeline (linha vermelha tracejada)
                  let prazoLeft = -1;
                  if (e?.prazo) {
                    const pDate = new Date(e.prazo + "T00:00:00");
                    const first = days[0];
                    const last = days[days.length - 1];
                    if (!isNaN(pDate.getTime()) && pDate >= first && pDate <= last) {
                      const idxDay = Math.round((pDate.getTime() - first.getTime()) / 86400000);
                      prazoLeft = idxDay * dayW + dayW / 2;
                    }
                  }
                  return (
                    <div
                      key={p.id}
                      className={`grid items-center hover:bg-primary/5 transition-colors border-b border-border/30 last:border-b-0 ${idx % 2 === 1 ? "bg-muted/15" : ""}`}
                      style={{ gridTemplateColumns: `${leftW}px ${META_TEMPLATE} repeat(${days.length}, ${dayW}px)` }}
                    >
                      <div className={`px-3 py-1 text-xs border-r border-border/40 truncate flex items-center gap-2 sticky left-0 z-10 ${idx % 2 === 1 ? "bg-muted/30" : "bg-background"}`}>
                        <span
                          className="h-3.5 w-[3px] rounded-full shrink-0"
                          style={{ background: cor }}
                        />
                        <button
                          className="truncate text-left hover:text-primary font-medium"
                          onClick={() => {
                            setDetailProg(p);
                          }}
                          title={label}
                        >
                          <span className="text-foreground">{t?.nome || "Ensaio"}</span>
                          <span className="text-muted-foreground"> • {a?.codigo_amostra || "amostra"}{a?.tipo ? ` (${a.tipo})` : ""}{a?.identificacao ? ` • ${a.identificacao}` : ""}{a?.os_numero ? ` • OS ${a.os_numero}` : ""}</span>
                        </button>
                        <button
                          type="button"
                          className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                          onClick={(ev) => { ev.stopPropagation(); setDetailProg(p); }}
                          title="Ver detalhes"
                          aria-label="Ver detalhes"
                        >
                          <Info className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className={`px-1 py-1 text-[10px] tabular-nums text-center border-r border-border/40 text-foreground/80 ${rowBg}`}>
                        {p.data_inicio ? formatBr(p.data_inicio) : "—"}
                      </div>
                      <div className={`px-1 py-1 text-[10px] tabular-nums text-center border-r border-border/40 text-foreground/80 ${rowBg}`}>
                        {p.data_fim ? formatBr(p.data_fim) : "—"}
                      </div>
                      <div className={`px-1 py-1 text-[10px] tabular-nums text-center border-r border-border/40 font-semibold text-muted-foreground ${rowBg}`}>
                        {durLabel}
                      </div>
                      <div
                        className="relative"
                        style={{ gridColumn: `${META_START_COL} / span ${days.length}`, height: 28 }}
                        onDragOver={(ev) => handleTimelineDragOver(g.equipamentoId, ev)}
                        onDrop={(ev) => handleTimelineDrop(g.equipamentoId, ev)}
                        onDragLeave={() => setDropTarget(null)}
                      >
                        <BarBackground days={days} dayW={dayW} />
                        {prazoLeft >= 0 && (
                          <div
                            className="absolute top-0 bottom-0 pointer-events-none"
                            style={{ left: prazoLeft }}
                            title={`Prazo da OS: ${formatBr(e!.prazo!)}`}
                          >
                            <div
                              className="h-full w-px"
                              style={{
                                background:
                                  "repeating-linear-gradient(to bottom, var(--status-atrasado) 0 4px, transparent 4px 8px)",
                              }}
                            />
                            <span
                              className="absolute -top-0.5 left-1 px-1 rounded-sm text-[9px] font-bold text-white whitespace-nowrap"
                              style={{ background: "var(--status-atrasado)" }}
                            >
                              Prazo
                            </span>
                          </div>
                        )}
                        <Bar
                          days={days}
                          dayW={dayW}
                          inicio={p.data_inicio}
                          fim={p.data_fim}
                          dur={p.duracao_dias}
                          offsetFrac={offsets.get(p.id) || 0}
                          progresso={computeLiveProgress(p)}
                          cor={cor}
                          overdue={isBarOverdue(p)}
                          onClick={() => {
                            setDetailProg(p);
                          }}
                          draggable
                          onDragStart={() => {
                            setDragEnsaioId(null);
                            setDragProg(p);
                          }}
                          onDragEnd={clearDrag}
                        />
                        {isDragging &&
                          dropTarget?.equipId === g.equipamentoId && (
                            <div
                              className="absolute top-0 bottom-0 pointer-events-none rounded-sm ring-2 ring-primary/70 bg-primary/15"
                              style={{
                                left: dropTarget.dayIndex * dayW,
                                width: dayW,
                              }}
                            />
                          )}
                      </div>
                    </div>
                  );
                  });
                })()}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {ensaiosSemProg.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Ensaios sem programação</CardTitle>
            <CardDescription>
              {ensaiosSemProg.length} ensaio(s) aguardando alocação —
              <span className="ml-1 font-medium text-foreground">
                arraste para a faixa de um equipamento
              </span>{" "}
              ou clique para abrir o formulário.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {ensaiosSemProg.map((e) => {
              const t = tipoById.get(e.tipo_ensaio_id);
              const a = amostraById.get(e.amostra_id);
              return (
                <Button
                  key={e.id}
                  size="sm"
                  variant="outline"
                  draggable
                  onDragStart={(ev) => {
                    setDragProg(null);
                    setDragEnsaioId(e.id);
                    ev.dataTransfer.effectAllowed = "copy";
                  }}
                  onDragEnd={clearDrag}
                  style={{ cursor: "grab" }}
                  onClick={() => {
                    setEditing(null);
                    setPreselectEnsaioId(e.id);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="h-3 w-3" />
                  {t?.nome || "Ensaio"} • {a?.codigo_amostra || "amostra"}
                  {a?.os_numero ? ` • OS ${a.os_numero}` : ""}
                </Button>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar programação" : "Nova programação"}
            </DialogTitle>
          </DialogHeader>
          <ProgForm
            key={editing?.id ?? preselectEnsaioId ?? "new"}
            editing={editing}
            preselectEnsaioId={preselectEnsaioId}
            ensaios={ensaios}
            amostraById={amostraById}
            tipoById={tipoById}
            equipamentos={equipamentos}
            progs={progs}
            loading={savProg.isPending}
            onDelete={
              editing
                ? () => {
                    if (confirm("Remover esta programação?")) {
                      delProg.mutate(editing.id, {
                        onSuccess: () => setDialogOpen(false),
                      });
                    }
                  }
                : undefined
            }
            onSubmit={(row) =>
              savProg.mutate(
                { id: editing?.id, row },
                { onSuccess: () => setDialogOpen(false) },
              )
            }
          />
        </DialogContent>
      </Dialog>

      <ProgDetalhesDialog
        prog={detailProg}
        onOpenChange={(o) => !o && setDetailProg(null)}
        ensaioById={ensaioById}
        amostraById={amostraById}
        tipoById={tipoById}
        equipById={equipById}
        loading={savProg.isPending}
        onEdit={() => {
          if (!detailProg) return;
          setEditing(detailProg);
          setPreselectEnsaioId(null);
          setDetailProg(null);
          setDialogOpen(true);
        }}
        onIniciar={(tecnico) => {
          if (!detailProg) return;
          if (!tecnico) { toast.error("Selecione o executor"); return; }
          const hoje = toIso(new Date());
          const nowTs = new Date().toISOString();
          const dur = detailProg.duracao_dias || 1;
          const novoFim = endIsoFromDur(hoje, dur, detailProg.incluir_fds);
          const progId = detailProg.id;
          savProg.mutate(
            {
              id: detailProg.id,
              row: {
                data_inicio_real: hoje,
                inicio_real_ts: nowTs,
                status: "em_execucao",
                progresso: 0,
                data_inicio: hoje,
                data_fim: novoFim,
                tecnico,
              },
            },
            {
              onSuccess: async () => {
                setDetailProg(null);
                await runCascade(progId, novoFim);
              },
            },
          );
        }}
        onTrocar={() => {
          if (!detailProg) return;
          setTrocarOpen(true);
        }}
        onTerminar={() => {
          if (!detailProg) return;
          if (!confirm("Confirmar término deste ensaio? A data de hoje será registrada.")) return;
          const hoje = toIso(new Date());
          const nowTs = new Date().toISOString();
          const inicioEff = detailProg.data_inicio_real || detailProg.data_inicio || hoje;
          const progId = detailProg.id;
          savProg.mutate(
            {
              id: detailProg.id,
              row: {
                data_fim_real: hoje,
                fim_real_ts: nowTs,
                status: "concluido",
                progresso: 100,
                data_inicio: inicioEff,
                data_fim: hoje,
              },
            },
            {
              onSuccess: async () => {
                setDetailProg(null);
                // Termina antes do previsto -> puxa o início do próximo;
                // termina depois -> atrasa o próximo. Mesma cascata do onIniciar.
                await runCascade(progId, hoje);
              },
            },
          );
        }}
      />

      <TrocarProgramacaoDialog
        open={trocarOpen}
        onOpenChange={setTrocarOpen}
        origem={detailProg}
        progs={progs}
        ensaioById={ensaioById}
        amostraById={amostraById}
        tipoById={tipoById}
        equipById={equipById}
        equipamentos={equipamentos}
        loading={savProg.isPending}
        onSwap={async (destino) => {
          if (!detailProg) return;
          const A = detailProg;
          const B = destino;
          try {
            await updateRow({
              data: {
                sheet: SHEET_PROGS,
                id: A.id,
                patch: {
                  equipamento_id: B.equipamento_id,
                  data_inicio_prevista: B.data_inicio_prevista,
                  data_inicio: B.data_inicio_prevista,
                  data_fim: B.data_inicio_prevista
                    ? endIsoFromDur(B.data_inicio_prevista, A.duracao_dias || 1, A.incluir_fds)
                    : null,
                },
              },
            });
            await updateRow({
              data: {
                sheet: SHEET_PROGS,
                id: B.id,
                patch: {
                  equipamento_id: A.equipamento_id,
                  data_inicio_prevista: A.data_inicio_prevista,
                  data_inicio: A.data_inicio_prevista,
                  data_fim: A.data_inicio_prevista
                    ? endIsoFromDur(A.data_inicio_prevista, B.duracao_dias || 1, B.incluir_fds)
                    : null,
                },
              },
            });
            toast.success("Programações trocadas");
            qc.invalidateQueries({ queryKey: ["programacoes_full"] });
            qc.invalidateQueries({ queryKey: ["programacoes"] });
            setTrocarOpen(false);
            setDetailProg(null);
          } catch (err: any) {
            toast.error(err?.message ?? "Falha ao trocar");
          }
        }}
        onMove={async (equipDestId, dataIso) => {
          if (!detailProg) return;
          const A = detailProg;
          try {
            await updateRow({
              data: {
                sheet: SHEET_PROGS,
                id: A.id,
                patch: {
                  equipamento_id: equipDestId,
                  data_inicio_prevista: dataIso,
                  data_inicio: dataIso,
                  data_fim: dataIso
                    ? endIsoFromDur(dataIso, A.duracao_dias || 1, A.incluir_fds)
                    : null,
                },
              },
            });
            toast.success("Programação movida");
            qc.invalidateQueries({ queryKey: ["programacoes_full"] });
            qc.invalidateQueries({ queryKey: ["programacoes"] });
            setTrocarOpen(false);
            setDetailProg(null);
          } catch (err: any) {
            toast.error(err?.message ?? "Falha ao mover");
          }
        }}
      />

      <AgendaDialog
        open={agendaOpen}
        onOpenChange={setAgendaOpen}
        progs={progs}
        ensaioById={ensaioById}
        amostraById={amostraById}
        tipoById={tipoById}
        equipById={equipById}
        equipamentos={equipamentos}
        tipos={tipos}
      />

      <ConcluidosDialog
        open={concluidosOpen}
        onOpenChange={setConcluidosOpen}
        concluidos={concluidos}
        ensaioById={ensaioById}
        amostraById={amostraById}
        tipoById={tipoById}
        equipById={equipById}
        equipamentos={equipamentos}
        tipos={tipos}
      />
    </div>
  );
}

/* ------------------------ Sub-componentes ------------------------ */

function BarBackground({ days, dayW }: { days: Date[]; dayW: number }) {
  return (
    <div className="absolute inset-0 flex">
      {days.map((d, i) => {
        const weekend = d.getDay() === 0 || d.getDay() === 6;
        const today = sameDay(d, new Date());
        return (
          <div
            key={i}
            style={{ width: dayW }}
            className={`border-r border-border/30 ${weekend ? "bg-muted/15" : ""} ${today ? "bg-primary/5" : ""} relative`}
          >
            {today && <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-primary/70" />}
          </div>
        );
      })}
    </div>
  );
}

function Bar({
  days, dayW, inicio, fim, dur, offsetFrac, progresso, cor, overdue, onClick,
  draggable, onDragStart, onDragEnd,
}: {
  days: Date[]; dayW: number;
  inicio: string | null; fim: string | null;
  dur?: number;
  offsetFrac?: number;
  progresso: number; cor: string;
  overdue?: boolean;
  onClick: () => void;
  draggable?: boolean;
  onDragStart?: (ev: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: (ev: React.DragEvent<HTMLButtonElement>) => void;
}) {
  if (!inicio) return null;
  const start = new Date(inicio + "T00:00:00");
  const end = fim ? new Date(fim + "T00:00:00") : start;
  const first = days[0];
  const last = days[days.length - 1];
  if (end < first || start > last) return null;
  const startIdx = Math.max(0, Math.round((start.getTime() - first.getTime()) / 86400000));
  const endIdx = Math.min(days.length - 1, Math.round((end.getTime() - first.getTime()) / 86400000));
  // Duração fracionária (ex.: 0,25 = 1/4 da célula do dia), estilo MS Project
  const isFractional = typeof dur === "number" && dur > 0 && dur < 1;
  const offset = isFractional && offsetFrac ? offsetFrac * dayW : 0;
  const left = startIdx * dayW + 1 + offset;
  const width = isFractional
    ? Math.max(4, dur! * dayW - 2)
    : Math.max(dayW - 2, (endIdx - startIdx + 1) * dayW - 2);
  const prog = Math.max(0, Math.min(100, progresso || 0));
  const done = prog >= 100;
  const barColor = overdue ? "var(--status-atrasado)" : cor;
  return (
    <button
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="group absolute top-[3px] h-[14px] rounded-[3px] text-[9px] font-semibold text-white flex items-center px-1.5 overflow-hidden hover:brightness-110 hover:shadow-sm transition-all"
      style={{
        left,
        width,
        background: `color-mix(in oklab, ${barColor} 22%, transparent)`,
        border: `1px solid color-mix(in oklab, ${barColor} 55%, transparent)`,
        color: `color-mix(in oklab, ${barColor} 45%, black)`,
        cursor: draggable ? "grab" : "pointer",
      }}
      title={`${inicio}${fim && fim !== inicio ? ` → ${fim}` : ""} • ${prog}%`}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-l-[3px]"
        style={{
          width: `${prog}%`,
          background: `linear-gradient(90deg, ${barColor} 0%, color-mix(in oklab, ${barColor} 80%, white) 100%)`,
        }}
      />
      <span
        className="relative flex items-center gap-1 font-semibold"
        style={{ color: prog >= 40 ? "white" : `color-mix(in oklab, ${barColor} 40%, black)` }}
      >
        {done && <CheckCircle2 className="h-2.5 w-2.5" />}
        {prog}%
      </span>
    </button>
  );
}

function ProgForm({
  editing, preselectEnsaioId, ensaios, amostraById, tipoById, equipamentos, progs,
  loading, onSubmit, onDelete,
}: {
  editing: Programacao | null;
  preselectEnsaioId: string | null;
  ensaios: Ensaio[];
  amostraById: Map<string, Amostra>;
  tipoById: Map<string, TipoEnsaio>;
  equipamentos: Equipamento[];
  progs: Programacao[];
  loading: boolean;
  onSubmit: (row: Partial<Programacao>) => void;
  onDelete?: () => void;
}) {
  const [ensaioId, setEnsaioId] = useState(editing?.ensaio_id ?? preselectEnsaioId ?? "");
  const [equipId, setEquipId] = useState(editing?.equipamento_id ?? "");
  const [inicio, setInicio] = useState(editing?.data_inicio_prevista ?? editing?.data_inicio ?? toIso(new Date()));
  const [duracao, setDuracao] = useState(String(editing?.duracao_dias ?? 1));
  const [obs, setObs] = useState(editing?.observacoes ?? "");
  const [incluirFds, setIncluirFds] = useState<boolean>(editing?.incluir_fds ?? false);

  // Ao editar uma programação existente sem observação própria, herda do ensaio.
  useEffect(() => {
    if (!editing) return;
    if (obs.trim()) return;
    const e = ensaios.find((x) => x.id === editing.ensaio_id);
    if (!e) return;
    const src = (e.observacoes ?? (e as any).detalhes_tecnicos ?? "").toString();
    if (src) setObs(src);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  const ensaioSel = ensaios.find((e) => e.id === ensaioId);
  // Ao criar uma programação nova, herda a observação do ensaio quando
  // ainda não foi digitada nada — mantendo os campos alinhados.
  useEffect(() => {
    if (editing) return;
    if (!ensaioSel) return;
    if (obs.trim()) return;
    const src = (ensaioSel.observacoes ?? (ensaioSel as any).detalhes_tecnicos ?? "").toString();
    if (src) setObs(src);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensaioId]);
  const tipoSel = ensaioSel ? tipoById.get(ensaioSel.tipo_ensaio_id) : null;
  const allowedIds = tipoSel?.equipamentos_ids ?? [];
  const equipsFiltrados = allowedIds.length > 0
    ? equipamentos.filter((eq) => allowedIds.includes(eq.id))
    : equipamentos;

  // Próxima data disponível por equipamento considerando carga fracionária do dia.
  // Ex.: duração 0,25 ocupa 25% do dia; 4 ensaios de 0,25 cabem na mesma data.
  const hojeIso = toIso(new Date());
  const disponibilidade = useMemo(() => {
    const durAtual = normalizeDurationDays(duracao);
    return equipsFiltrados.map((eq) => {
      const ocupacoes = progs.filter(
        (p) => p.equipamento_id === eq.id && (p.data_inicio_prevista || p.data_inicio || p.data_fim) && (!editing || p.id !== editing.id),
      );
      const dayLoads = new Map<string, number>();
      for (const p of ocupacoes) {
        allocateWorkloadOnDays(
          dayLoads,
          p.data_inicio_prevista || p.data_inicio || p.data_fim || hojeIso,
          p.duracao_dias || 1,
          p.incluir_fds,
        );
      }
      const proxima = nextAvailableWorkDay(dayLoads, hojeIso, incluirFds, durAtual);
      return { eq, proxima, ocupado: ocupacoes.length };
    }).sort((a, b) => a.proxima.localeCompare(b.proxima));
  }, [equipsFiltrados, progs, hojeIso, editing, duracao, incluirFds]);

  const selectEquip = (id: string, proxima: string) => {
    setEquipId(id);
    setInicio(proxima);
  };

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        if (!ensaioId) { toast.error("Selecione o ensaio"); return; }
        if (!inicio) { toast.error("Informe a data de início prevista"); return; }
        const dur = normalizeDurationDays(duracao);
        // Se o início cair em fim de semana/feriado e a opção não estiver
        // marcada, empurra para o próximo dia útil.
        const inicioAjustado = nextBusinessDayIso(inicio, incluirFds);
        const fimPrev = endIsoFromDur(inicioAjustado, dur, incluirFds);
        // Se já iniciou (real), a data efetiva de início segue o real
        const inicioEff = editing?.data_inicio_real || inicioAjustado;
        const fimEff = editing?.data_fim_real || endIsoFromDur(inicioEff, dur, incluirFds);
        onSubmit({
          ensaio_id: ensaioId,
          equipamento_id: equipId || null,
          data_inicio_prevista: inicioAjustado,
          duracao_dias: dur,
          data_inicio: inicioEff,
          data_fim: fimEff,
          status: editing?.status ?? "planejado",
          progresso:
            editing?.status === "concluido"
              ? 100
              : 0,
          observacoes: obs || null,
          incluir_fds: incluirFds,
        });
      }}
      className="space-y-3"
    >
      <div>
        <Label>Ensaio</Label>
        <Select value={ensaioId} onValueChange={setEnsaioId} disabled={!!editing}>
          <SelectTrigger><SelectValue placeholder="Selecione o ensaio" /></SelectTrigger>
          <SelectContent>
            {ensaios.map((e) => {
              const a = amostraById.get(e.amostra_id);
              const t = tipoById.get(e.tipo_ensaio_id);
              return (
                <SelectItem key={e.id} value={e.id}>
                  {t?.nome || "Ensaio"} — {a?.codigo_amostra || "amostra"}
                  {a?.os_numero ? ` (OS ${a.os_numero})` : ""}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Equipamento</Label>
        <Select value={equipId || "__none__"} onValueChange={(v) => setEquipId(v === "__none__" ? "" : v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Sem equipamento</SelectItem>
            {equipsFiltrados.map((eq) => (
              <SelectItem key={eq.id} value={eq.id}>{eq.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {allowedIds.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Mostrando apenas equipamentos vinculados ao tipo de ensaio.
          </p>
        )}
        {ensaioSel && disponibilidade.length > 0 && (
          <div className="mt-2 rounded-md border divide-y">
            <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground bg-muted/40">
              Próxima disponibilidade (mais cedo primeiro)
            </div>
            {disponibilidade.map(({ eq, proxima, ocupado }, idx) => {
              const selected = equipId === eq.id;
              const isEarliest = idx === 0;
              const c = equipColor(eq.nome);
              return (
                <button
                  key={eq.id}
                  type="button"
                  onClick={() => selectEquip(eq.id, proxima)}
                  className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 text-xs text-left hover:bg-muted/40 ${
                    selected ? "bg-primary/10" : ""
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span
                      className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
                    >
                      {eq.nome}
                    </span>
                    <span className={`h-2 w-2 rounded-full ${ocupado === 0 ? "bg-emerald-500" : "bg-amber-500"}`} />
                    {isEarliest && (
                      <Badge variant="secondary" className="text-[9px] py-0 px-1">mais cedo</Badge>
                    )}
                  </span>
                  <span className="text-muted-foreground shrink-0">
                    {proxima === hojeIso ? "livre hoje" : `livre em ${formatBr(proxima)}`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Início previsto</Label>
          <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </div>
        <div>
          <Label>Duração (dias)</Label>
          <Input
            type="number"
            min={0.25}
            step={0.25}
            value={duracao}
            onChange={(e) => setDuracao(e.target.value)}
          />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground -mt-1">
        O fim previsto é{" "}
        <b>
          {inicio
            ? formatBr(
                endIsoFromDur(
                  nextBusinessDayIso(inicio, incluirFds),
                  normalizeDurationDays(duracao),
                  incluirFds,
                ),
              )
            : "—"}
        </b>
        .{" "}
        {incluirFds
          ? "Contando sábados, domingos e feriados."
          : "Sábados, domingos e feriados não contam."}
        {" "}Quando o técnico iniciar o ensaio, a barra do Gantt será deslocada
        automaticamente para a data real, mantendo a duração.
      </p>
      <label className="flex items-start gap-2 rounded-md border p-2 text-xs cursor-pointer select-none hover:bg-muted/40">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={incluirFds}
          onChange={(e) => setIncluirFds(e.target.checked)}
        />
        <span>
          <span className="font-medium">Considerar finais de semana e feriados</span>
          <span className="block text-muted-foreground">
            Por padrão, sábados, domingos e feriados (nacionais, SP e São Pedro/SP)
            não são contados na duração do ensaio.
          </span>
        </span>
      </label>
      <div>
        <Label>Observações</Label>
        <Input value={obs} onChange={(e) => setObs(e.target.value)} />
      </div>
      <DialogFooter className="gap-2 sm:justify-between">
        {onDelete ? (
          <Button type="button" variant="destructive" onClick={onDelete} disabled={loading}>
            <Trash2 className="h-4 w-4" /> Remover
          </Button>
        ) : <span />}
        <Button type="submit" disabled={loading}>
          {editing ? (<><Pencil className="h-4 w-4" /> Salvar</>) : (<><Plus className="h-4 w-4" /> Criar</>)}
        </Button>
      </DialogFooter>
    </form>
  );
}

/* ------------------------------ Utils ------------------------------ */
function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function monthShort(d: Date) {
  return ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"][d.getMonth()];
}
function monthLong(d: Date) {
  return ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"][d.getMonth()];
}
function weekdayShort(d: Date) {
  return ["dom","seg","ter","qua","qui","sex","sáb"][d.getDay()];
}
function formatBr(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}
function formatDur(duracao: number) {
  const n = normalizeDurationDays(duracao, 0);
  return `${Number.isInteger(n) ? n : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}d`;
}
function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toIso(d);
}
function diffDaysIso(a: string, b: string): number {
  const da = new Date(a + "T00:00:00").getTime();
  const db = new Date(b + "T00:00:00").getTime();
  return Math.round((db - da) / 86400000);
}

/**
 * Progresso vivo (calculado em runtime, não persistido):
 *  - status "planejado"   → 0%
 *  - status "em_execucao" → (dias decorridos desde o início real) / duração * 100,
 *                            travado em 99% até a conclusão
 *  - status "concluido"   → 100%
 * Respeita dias úteis quando `incluir_fds` for falso.
 */
function elapsedDaysWorked(startIso: string, todayIso: string, incluirFds: boolean): number {
  if (todayIso < startIso) return 0;
  if (incluirFds) return diffDaysIso(startIso, todayIso) + 1;
  let count = 0;
  let cur = startIso;
  const guard = diffDaysIso(startIso, todayIso) + 2;
  for (let i = 0; i < guard; i++) {
    if (isBusinessDayIso(cur)) count++;
    if (cur === todayIso) break;
    cur = addDaysIso(cur, 1);
  }
  return count;
}
function computeLiveProgress(p: {
  status: string;
  data_inicio_real: string | null;
  data_inicio: string | null;
  duracao_dias: number;
  incluir_fds: boolean;
}): number {
  if (p.status === "concluido") return 100;
  const inicio = p.data_inicio_real || (p.status === "em_execucao" ? p.data_inicio : null);
  if (!inicio) return 0;
  const dur = Math.max(0.01, Number(p.duracao_dias) || 1);
  const hoje = toIso(new Date());
  const elapsed = elapsedDaysWorked(inicio, hoje, !!p.incluir_fds);
  const pct = Math.round((elapsed / dur) * 100);
  return Math.max(1, Math.min(99, pct));
}
function isBarOverdue(p: {
  status: string;
  data_fim: string | null;
  data_fim_real: string | null;
}): boolean {
  if (p.status === "concluido") return false;
  if (!p.data_fim) return false;
  const hoje = toIso(new Date());
  return hoje > p.data_fim && !p.data_fim_real;
}

function ProgDetalhesDialog({
  prog, onOpenChange, ensaioById, amostraById, tipoById, equipById,
  onEdit, onIniciar, onTerminar, onTrocar, loading,
}: {
  prog: Programacao | null;
  onOpenChange: (open: boolean) => void;
  ensaioById: Map<string, Ensaio>;
  amostraById: Map<string, Amostra>;
  tipoById: Map<string, TipoEnsaio>;
  equipById: Map<string, Equipamento>;
  onEdit: () => void;
  onIniciar: (tecnico: string) => void;
  onTerminar: () => void;
  onTrocar: () => void;
  loading: boolean;
}) {
  const open = !!prog;
  const e = prog ? ensaioById.get(prog.ensaio_id) : null;
  const a = e ? amostraById.get(e.amostra_id) : null;
  const t = e ? tipoById.get(e.tipo_ensaio_id) : null;
  const eq = prog?.equipamento_id ? equipById.get(prog.equipamento_id) : null;
  const cor = t?.cor_gantt || "#6366f1";

  const iniPrev = prog?.data_inicio_prevista ?? null;
  const dur = prog?.duracao_dias ?? 0;
  const fimPrev = iniPrev && dur ? endIsoFromDur(iniPrev, dur, prog?.incluir_fds ?? false) : null;
  const iniReal = prog?.data_inicio_real ?? null;
  const fimReal = prog?.data_fim_real ?? null;
  const iniRealTs = prog?.inicio_real_ts ?? null;
  const fimRealTs = prog?.fim_real_ts ?? null;
  const durRealTxt = formatDurReal(iniReal, fimReal, iniRealTs, fimRealTs);
  const status = prog?.status ?? "planejado";

  const statusMeta = {
    planejado: { label: "Programado", cls: "status-pill status-programado" },
    em_execucao: { label: "Em execução", cls: "status-pill status-execucao" },
    concluido: { label: "Concluído", cls: "status-pill status-concluido" },
  }[status];

  const previsaoTermino = iniReal && dur ? endIsoFromDur(iniReal, dur, prog?.incluir_fds ?? false) : fimPrev;
  const EXECUTORES = ["Rosângela Oliveira", "Rodrigo", "Renan Adriano"];
  const [execSel, setExecSel] = useState<string>("");
  useEffect(() => { setExecSel(prog?.tecnico || ""); }, [prog?.id, prog?.tecnico]);

  const dIni = iniPrev && iniReal ? diffDaysIso(iniPrev, iniReal) : null;
  const dFim = fimPrev && fimReal ? diffDaysIso(fimPrev, fimReal) : null;
  const dText = (n: number | null) =>
    n == null ? "—" : n === 0 ? "no prazo" : n > 0 ? `${n}d atraso` : `${Math.abs(n)}d adiantado`;
  const dTone = (n: number | null) =>
    n == null ? "text-muted-foreground" : n > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="h-3 w-1.5 rounded-sm" style={{ background: cor }} />
            <span className="truncate">{t?.nome || "Ensaio"}</span>
            <Badge className={statusMeta.cls}>{statusMeta.label}</Badge>
          </DialogTitle>
          <CardDescription className="mt-1">
            {a?.codigo_amostra || "amostra"}
            {a?.tipo ? ` (${a.tipo})` : ""}
            {a?.os_numero ? ` • OS ${a.os_numero}` : ""}
            {eq ? ` • ${eq.nome}` : ""}
          </CardDescription>
        </DialogHeader>

        {a && (a.identificacao || a.tipo || a.topo_m || a.base_m) && (
          <div className="rounded-md border bg-muted/20 p-2 text-xs grid grid-cols-2 gap-x-3 gap-y-1">
            {a.identificacao && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Identificação: </span>
                <span className="font-medium">{a.identificacao}</span>
              </div>
            )}
            {a.tipo && (
              <div><span className="text-muted-foreground">Tipo: </span><span className="font-medium">{a.tipo}</span></div>
            )}
            {a.codigo_amostra && (
              <div><span className="text-muted-foreground">Código: </span><span className="font-medium">{a.codigo_amostra}</span></div>
            )}
            {(a.topo_m || a.base_m) && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Profundidade: </span>
                <span className="font-medium tabular-nums">{a.topo_m || "—"} / {a.base_m || "—"} m</span>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 py-1">
          <Metric label="Início previsto" value={iniPrev ? formatBr(iniPrev) : "—"} />
          <Metric label="Duração prevista" value={dur ? `${dur} dia(s)` : "—"} />
          <Metric label="Início real" value={iniReal ? formatBr(iniReal) : "—"} muted={!iniReal} />
          <Metric label="Duração real" value={durRealTxt ?? "—"} muted={!durRealTxt} />
        </div>

        {status === "planejado" && (
          <div className="rounded-md border p-3 space-y-2 bg-muted/30">
            <div className="text-xs text-muted-foreground">
              Iniciar execução agora registra o tempo real e desloca a barra do Gantt para hoje, mantendo a duração prevista.
            </div>
            <div>
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Executor
              </Label>
              <Select value={execSel} onValueChange={setExecSel}>
                <SelectTrigger className="h-8 mt-1">
                  <SelectValue placeholder="Selecione o executor" />
                </SelectTrigger>
                <SelectContent>
                  {EXECUTORES.map((n) => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => onIniciar(execSel)}
              disabled={loading || !execSel}
            >
              <Activity className="h-4 w-4" /> Iniciar execução
            </Button>
          </div>
        )}

        {status === "em_execucao" && (
          <div className="rounded-md border p-3 space-y-2 bg-amber-500/5">
            {prog?.tecnico && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Executor</span>
                <span className="font-semibold">{prog.tecnico}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Previsão de término</span>
              <span className="font-semibold tabular-nums">
                {previsaoTermino ? formatBr(previsaoTermino) : "—"}
              </span>
            </div>
            <Button
              className="w-full"
              variant="default"
              onClick={onTerminar}
              disabled={loading}
            >
              <CheckCircle2 className="h-4 w-4" /> Registrar término do ensaio
            </Button>
          </div>
        )}

        {status === "concluido" && (
          <div className="rounded-md border p-3 bg-emerald-500/5 space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Aderência
            </div>
            <div className="flex items-center justify-between text-xs">
              <span>Início real × previsto</span>
              <span className={`font-semibold tabular-nums ${dTone(dIni)}`}>{dText(dIni)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span>Término real × previsto</span>
              <span className={`font-semibold tabular-nums ${dTone(dFim)}`}>{dText(dFim)}</span>
            </div>
          </div>
        )}

        {(() => {
          const obs =
            (prog?.observacoes && prog.observacoes.trim()) ||
            (e?.observacoes && e.observacoes.trim()) ||
            ((e as any)?.detalhes_tecnicos && (e as any).detalhes_tecnicos.trim()) ||
            "";
          if (!obs) return null;
          return (
            <div className="text-xs">
              <div className="text-muted-foreground mb-0.5">Observações</div>
              <div className="rounded-md border bg-muted/20 p-2 whitespace-pre-wrap">{obs}</div>
            </div>
          );
        })()}

        <DialogFooter className="pt-2">
          {status === "planejado" && (
            <Button variant="outline" size="sm" onClick={onTrocar}>
              <ArrowLeftRight className="h-3.5 w-3.5" /> Trocar programação
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" /> Editar programação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------- ConcluidosDialog --------------------------- */
function ConcluidosDialog({
  open, onOpenChange, concluidos,
  ensaioById, amostraById, tipoById, equipById, equipamentos, tipos,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  concluidos: Programacao[];
  ensaioById: Map<string, Ensaio>;
  amostraById: Map<string, Amostra>;
  tipoById: Map<string, TipoEnsaio>;
  equipById: Map<string, Equipamento>;
  equipamentos: Equipamento[];
  tipos: TipoEnsaio[];
}) {
  const [busca, setBusca] = useState("");
  const [fEquip, setFEquip] = useState<string>("todos");
  const [fTipo, setFTipo] = useState<string>("todos");
  const [fAtraso, setFAtraso] = useState<string>("todos"); // todos | adiantado | no_prazo | atrasado

  const rows = useMemo(() => {
    return concluidos
      .map((p) => {
        const e = ensaioById.get(p.ensaio_id);
        const a = e ? amostraById.get(e.amostra_id) : undefined;
        const tipo = e ? tipoById.get(e.tipo_ensaio_id) : undefined;
        const eq = p.equipamento_id ? equipById.get(p.equipamento_id) : undefined;
        const iniPrev = p.data_inicio_prevista;
        const dur = p.duracao_dias || 1;
        const fimPrev = iniPrev ? endIsoFromDur(iniPrev, dur, p.incluir_fds) : null;
        const iniReal = p.data_inicio_real;
        const fimReal = p.data_fim_real;
        const iniRealTs = p.inicio_real_ts;
        const fimRealTs = p.fim_real_ts;
        const durReal = durRealDays(iniReal, fimReal, iniRealTs, fimRealTs);
        const durRealTxt = formatDurReal(iniReal, fimReal, iniRealTs, fimRealTs);
        const atrasoFim = fimPrev && fimReal ? diffDaysIso(fimPrev, fimReal) : null; // + atrasado, - adiantado
        return {
          p, e, a, tipo, eq,
          os: a?.os_numero || "",
          amostra: a?.codigo_amostra || "",
          tipoNome: tipo?.nome || "",
          equipNome: eq?.nome || (p.equipamento_id ? "—" : "Sem equipamento"),
          tecnico: p.tecnico || "",
          iniPrev, fimPrev, iniReal, fimReal,
          durPrev: dur, durReal, durRealTxt, atrasoFim,
          observacoes: p.observacoes || "",
        };
      })
      .sort((x, y) => (y.fimReal || "").localeCompare(x.fimReal || ""));
  }, [concluidos, ensaioById, amostraById, tipoById, equipById]);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (fEquip !== "todos" && (r.p.equipamento_id ?? "") !== fEquip) return false;
      if (fTipo !== "todos" && (r.e?.tipo_ensaio_id ?? "") !== fTipo) return false;
      if (fAtraso !== "todos") {
        const at = r.atrasoFim;
        if (fAtraso === "adiantado" && !(at !== null && at < 0)) return false;
        if (fAtraso === "no_prazo" && !(at !== null && at === 0)) return false;
        if (fAtraso === "atrasado" && !(at !== null && at > 0)) return false;
      }
      if (q) {
        const hay = [r.os, r.amostra, r.tipoNome, r.equipNome, r.tecnico, r.observacoes]
          .join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, busca, fEquip, fTipo, fAtraso]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const noPrazo = filtered.filter((r) => r.atrasoFim !== null && r.atrasoFim <= 0).length;
    const atrasados = filtered.filter((r) => r.atrasoFim !== null && r.atrasoFim > 0).length;
    const durMedia = (() => {
      const arr = filtered.map((r) => r.durReal).filter((n): n is number => n != null);
      if (!arr.length) return null;
      return Math.round((arr.reduce((s, n) => s + n, 0) / arr.length) * 10) / 10;
    })();
    return { total, noPrazo, atrasados, durMedia };
  }, [filtered]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-primary" />
            Ensaios concluídos
            <Badge variant="secondary">{concluidos.length}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="md:col-span-2">
            <Label className="text-[10px] uppercase text-muted-foreground">Busca</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="OS, amostra, ensaio, equipamento, técnico..."
                className="h-8 pl-7"
              />
            </div>
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Equipamento</Label>
            <Select value={fEquip} onValueChange={setFEquip}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {equipamentos.map((eq) => (<SelectItem key={eq.id} value={eq.id}>{eq.nome}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Tipo de ensaio</Label>
            <Select value={fTipo} onValueChange={setFTipo}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {tipos.map((t) => (<SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Prazo</Label>
            <Select value={fAtraso} onValueChange={setFAtraso}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="adiantado">Adiantado</SelectItem>
                <SelectItem value="no_prazo">No prazo</SelectItem>
                <SelectItem value="atrasado">Atrasado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="rounded border bg-muted/30 px-2 py-1.5">
            <div className="text-muted-foreground">Total</div>
            <div className="text-lg font-semibold">{stats.total}</div>
          </div>
          <div className="rounded border bg-emerald-500/10 px-2 py-1.5">
            <div className="text-muted-foreground">No prazo / adiantado</div>
            <div className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">{stats.noPrazo}</div>
          </div>
          <div className="rounded border bg-red-500/10 px-2 py-1.5">
            <div className="text-muted-foreground">Atrasados</div>
            <div className="text-lg font-semibold text-red-700 dark:text-red-300">{stats.atrasados}</div>
          </div>
          <div className="rounded border bg-muted/30 px-2 py-1.5">
            <div className="text-muted-foreground">Duração real média</div>
            <div className="text-lg font-semibold">{stats.durMedia ?? "—"}{stats.durMedia != null ? " d" : ""}</div>
          </div>
        </div>

        <div className="flex-1 overflow-auto rounded border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr className="text-left">
                <th className="p-2">OS</th>
                <th className="p-2">Amostra</th>
                <th className="p-2">Ensaio</th>
                <th className="p-2">Equipamento</th>
                <th className="p-2">Técnico</th>
                <th className="p-2">Previsto</th>
                <th className="p-2">Real</th>
                <th className="p-2 text-right">Dur. prev.</th>
                <th className="p-2 text-right">Dur. real</th>
                <th className="p-2 text-right">Atraso</th>
                <th className="p-2">Observações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-6 text-center text-muted-foreground">
                    Nenhum ensaio concluído encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const atrasoCls =
                    r.atrasoFim == null
                      ? "text-muted-foreground"
                      : r.atrasoFim > 0
                      ? "text-red-600 dark:text-red-400"
                      : r.atrasoFim < 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground";
                  const atrasoLabel =
                    r.atrasoFim == null ? "—" : r.atrasoFim > 0 ? `+${r.atrasoFim}d` : `${r.atrasoFim}d`;
                  return (
                    <tr key={r.p.id} className="border-t hover:bg-muted/30">
                      <td className="p-2 font-medium whitespace-nowrap">{r.os || "—"}</td>
                      <td className="p-2 whitespace-nowrap">{r.amostra || "—"}</td>
                      <td className="p-2">{r.tipoNome || "—"}</td>
                      <td className="p-2 whitespace-nowrap">{r.equipNome}</td>
                      <td className="p-2 whitespace-nowrap">{r.tecnico || "—"}</td>
                      <td className="p-2 whitespace-nowrap text-muted-foreground">
                        {r.iniPrev ? formatBr(r.iniPrev) : "—"}
                        {r.fimPrev ? ` → ${formatBr(r.fimPrev)}` : ""}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {r.iniReal ? formatBr(r.iniReal) : "—"}
                        {r.fimReal ? ` → ${formatBr(r.fimReal)}` : ""}
                      </td>
                      <td className="p-2 text-right tabular-nums">{r.durPrev}d</td>
                      <td className="p-2 text-right tabular-nums">{r.durRealTxt ?? "—"}</td>
                      <td className={`p-2 text-right tabular-nums font-medium ${atrasoCls}`}>{atrasoLabel}</td>
                      <td className="p-2 max-w-[240px] truncate text-muted-foreground" title={r.observacoes}>
                        {r.observacoes || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="rounded-md border bg-background p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={`text-sm font-semibold tabular-nums mt-0.5 ${muted ? "text-muted-foreground" : ""}`}>{value}</div>
    </div>
  );
}

function KpiCard({
  icon, label, value, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone: "default" | "primary" | "emerald" | "amber";
}) {
  const toneMap = {
    default: { icon: "bg-muted text-foreground", bar: "bg-foreground/30" },
    primary: { icon: "bg-primary/15 text-primary", bar: "bg-primary" },
    emerald: { icon: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
    amber: { icon: "bg-amber-500/15 text-amber-600 dark:text-amber-400", bar: "bg-amber-500" },
  }[tone];
  return (
    <Card className="relative overflow-hidden border-border/60 shadow-none hover:shadow-sm transition-shadow">
      <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${toneMap.bar}`} />
      <CardContent className="p-2.5 pl-3 flex items-center gap-2.5">
        <div className={`h-7 w-7 rounded-md flex items-center justify-center ${toneMap.icon}`}>{icon}</div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
          <div className="text-base font-bold leading-none mt-1 tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------------- Trocar programação ---------------------- */
function TrocarProgramacaoDialog({
  open, onOpenChange, origem, progs, ensaioById, amostraById, tipoById, equipById, equipamentos, loading, onSwap, onMove,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  origem: Programacao | null;
  progs: Programacao[];
  ensaioById: Map<string, Ensaio>;
  amostraById: Map<string, Amostra>;
  tipoById: Map<string, TipoEnsaio>;
  equipById: Map<string, Equipamento>;
  equipamentos: Equipamento[];
  loading: boolean;
  onSwap: (destino: Programacao) => void;
  onMove: (equipDestId: string, dataIso: string) => void;
}) {
  const [equipDestId, setEquipDestId] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [moveDate, setMoveDate] = useState<string>("");

  useEffect(() => {
    if (open) {
      setEquipDestId("");
      setSelectedId("");
      setMoveDate(origem?.data_inicio_prevista || toIso(new Date()));
    }
  }, [open, origem?.id]);

  // Equipamentos elegíveis: sem ensaios em execução e diferentes do da origem.
  // Para o modo "mover", equipamentos livres (sem qualquer programação) também
  // aparecem — inclusive quando não há candidato para troca.
  const equipsElegiveis = useMemo(() => {
    return equipamentos
      .filter((eq) => {
        const hasExec = progs.some(
          (p) => p.equipamento_id === eq.id && p.status === "em_execucao",
        );
        return !hasExec;
      })
      .map((eq) => {
        const isMesmo = !!origem && eq.id === origem.equipamento_id;
        const outros = progs.some(
          (p) => p.equipamento_id === eq.id && p.id !== origem?.id,
        );
        const livre = !outros;
        return { eq, livre, isMesmo };
      });
  }, [equipamentos, progs, origem]);

  // Modo derivado: se o equipamento escolhido está livre, apenas movemos;
  // se tem outras programações, oferecemos a troca com uma amostra próxima.
  const equipDestLivre = useMemo(
    () => equipsElegiveis.find((x) => x.eq.id === equipDestId)?.livre ?? false,
    [equipsElegiveis, equipDestId],
  );
  const modo: "trocar" | "mover" = equipDestLivre ? "mover" : "trocar";

  // Origem também precisa estar em um equipamento sem em_execucao
  const origemOk = origem && !progs.some(
    (p) => p.equipamento_id === origem.equipamento_id && p.status === "em_execucao",
  );

  // Candidatos: planejados no equipamento destino, com data próxima (±10d) da origem
  const candidatos = useMemo(() => {
    if (!origem || !equipDestId) return [] as Programacao[];
    const ref = origem.data_inicio_prevista;
    return progs
      .filter((p) =>
        p.equipamento_id === equipDestId &&
        p.status === "planejado" &&
        p.id !== origem.id &&
        p.data_inicio_prevista &&
        (!ref || Math.abs(diffDaysIso(ref, p.data_inicio_prevista!)) <= 10),
      )
      .sort((a, b) => (a.data_inicio_prevista || "").localeCompare(b.data_inicio_prevista || ""));
  }, [origem, equipDestId, progs]);

  const label = (p: Programacao) => {
    const e = ensaioById.get(p.ensaio_id);
    const a = e ? amostraById.get(e.amostra_id) : null;
    const t = e ? tipoById.get(e.tipo_ensaio_id) : null;
    return `${a?.codigo_amostra || "amostra"} • ${t?.nome || "ensaio"}${a?.os_numero ? ` • OS ${a.os_numero}` : ""}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-primary" /> Trocar programação
          </DialogTitle>
        </DialogHeader>
        {!origemOk && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
            Este equipamento tem ensaios em execução — troca não permitida.
          </div>
        )}
        {origem && origemOk && (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border bg-muted/30 p-2 text-xs">
              <div className="text-[10px] uppercase font-semibold text-muted-foreground">Amostra atual</div>
              <div className="font-medium">{label(origem)}</div>
              <div className="text-muted-foreground">
                {equipById.get(origem.equipamento_id || "")?.nome || "sem equipamento"} • {origem.data_inicio_prevista ? formatBr(origem.data_inicio_prevista) : "—"}
              </div>
            </div>
            <div>
              <Label>Equipamento destino</Label>
              <Select value={equipDestId} onValueChange={(v) => { setEquipDestId(v); setSelectedId(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecione o equipamento destino" /></SelectTrigger>
                <SelectContent>
                  {equipsElegiveis.length === 0 ? (
                    <div className="px-2 py-1 text-xs text-muted-foreground">Nenhum equipamento elegível.</div>
                  ) : equipsElegiveis.map(({ eq, livre, isMesmo }) => (
                    <SelectItem key={eq.id} value={eq.id}>
                      <span className="flex items-center gap-2">
                        {eq.nome}
                        {isMesmo && (
                          <span className="text-[10px] rounded bg-primary/15 text-primary px-1">mesmo equipamento</span>
                        )}
                        {livre && (
                          <span className="text-[10px] rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-1">livre</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Escolha o <span className="text-primary font-medium">mesmo equipamento</span> para reordenar a execução entre as amostras já programadas nele. Equipamentos <span className="text-emerald-700 dark:text-emerald-400 font-medium">livres</span> permitem apenas mover a amostra. Os demais permitem trocar com uma amostra próxima.
              </p>
            </div>
            {equipDestId && modo === "trocar" && (
              <div>
                <Label>Amostra a trocar (datas próximas — ±10d)</Label>
                <div className="mt-1 rounded-md border max-h-64 overflow-y-auto divide-y">
                  {candidatos.length === 0 && (
                    <div className="p-3 text-xs text-muted-foreground text-center">
                      Nenhuma programação próxima neste equipamento. Escolha um equipamento marcado como "livre" para apenas mover a amostra.
                    </div>
                  )}
                  {candidatos.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      className={`w-full text-left px-2 py-1.5 text-xs hover:bg-muted/40 ${selectedId === c.id ? "bg-primary/10" : ""}`}
                    >
                      <div className="font-medium">{label(c)}</div>
                      <div className="text-muted-foreground tabular-nums">
                        {c.data_inicio_prevista ? formatBr(c.data_inicio_prevista) : "—"} • {c.duracao_dias}d
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {equipDestId && modo === "mover" && (
              <div>
                <Label>Data de início prevista</Label>
                <Input
                  type="date"
                  value={moveDate}
                  onChange={(e) => setMoveDate(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  A programação será movida para o equipamento escolhido, mantendo a duração ({origem.duracao_dias || 1}d).
                </p>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {modo === "trocar" ? (
            <Button
              disabled={!selectedId || loading}
              onClick={() => {
                const dest = candidatos.find((c) => c.id === selectedId);
                if (dest) onSwap(dest);
              }}
            >
              <ArrowLeftRight className="h-4 w-4" /> Confirmar troca
            </Button>
          ) : (
            <Button
              disabled={!equipDestId || !moveDate || loading}
              onClick={() => onMove(equipDestId, moveDate)}
            >
              <ArrowLeftRight className="h-4 w-4" /> Confirmar movimentação
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------- Agenda + PDF ---------------------- */
function AgendaDialog({
  open, onOpenChange, progs, ensaioById, amostraById, tipoById, equipById, equipamentos, tipos,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  progs: Programacao[];
  ensaioById: Map<string, Ensaio>;
  amostraById: Map<string, Amostra>;
  tipoById: Map<string, TipoEnsaio>;
  equipById: Map<string, Equipamento>;
  equipamentos: Equipamento[];
  tipos: TipoEnsaio[];
}) {
  const [horizonte, setHorizonte] = useState<"7" | "15" | "30">("7");
  const [fEquip, setFEquip] = useState<string>("todos");
  const [fTipo, setFTipo] = useState<string>("todos");
  const [fOs, setFOs] = useState<string>("todos");

  const hoje = toIso(new Date());
  const limite = addDaysIso(hoje, Number(horizonte));

  const osOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of progs) {
      const e = ensaioById.get(p.ensaio_id);
      const a = e ? amostraById.get(e.amostra_id) : null;
      if (a?.os_numero) set.add(a.os_numero);
    }
    return Array.from(set).sort();
  }, [progs, ensaioById, amostraById]);

  const passesFilters = (p: Programacao) => {
    if (p.status === "concluido") return false;
    if (fEquip !== "todos" && (p.equipamento_id ?? "") !== fEquip) return false;
    const e = ensaioById.get(p.ensaio_id);
    if (fTipo !== "todos" && (!e || e.tipo_ensaio_id !== fTipo)) return false;
    const a = e ? amostraById.get(e.amostra_id) : null;
    if (fOs !== "todos" && (a?.os_numero ?? "") !== fOs) return false;
    return !!p.data_inicio_prevista;
  };

  const buckets = useMemo(() => {
    const atrasados: Programacao[] = [];
    const hojeArr: Programacao[] = [];
    const proximos: Programacao[] = [];
    for (const p of progs) {
      if (!passesFilters(p)) continue;
      const d = p.data_inicio_prevista!;
      if (p.status === "em_execucao") continue;
      if (d < hoje) atrasados.push(p);
      else if (d === hoje) hojeArr.push(p);
      else if (d <= limite) proximos.push(p);
    }
    const sortFn = (a: Programacao, b: Programacao) =>
      (a.data_inicio_prevista || "").localeCompare(b.data_inicio_prevista || "");
    atrasados.sort(sortFn); hojeArr.sort(sortFn); proximos.sort(sortFn);
    return { atrasados, hojeArr, proximos };
  }, [progs, hoje, limite, fEquip, fTipo, fOs, ensaioById, amostraById]);

  const groupByEquip = (arr: Programacao[]) => {
    const map = new Map<string, Programacao[]>();
    for (const p of arr) {
      const k = p.equipamento_id || "__sem__";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return Array.from(map.entries()).map(([k, items]) => ({
      nome: k === "__sem__" ? "Sem equipamento" : equipById.get(k)?.nome || "—",
      items,
    }));
  };

  const rowInfo = (p: Programacao) => {
    const e = ensaioById.get(p.ensaio_id);
    const a = e ? amostraById.get(e.amostra_id) : null;
    const t = e ? tipoById.get(e.tipo_ensaio_id) : null;
    return {
      os: a?.os_numero || "—",
      codigo: a?.codigo_amostra || "—",
      tipoAm: a?.tipo || "—",
      ident: a?.identificacao || "",
      profundidade: a?.topo_m || a?.base_m ? `${a?.topo_m || "—"} / ${a?.base_m || "—"} m` : "—",
      ensaio: t?.nome || "—",
      inicio: p.data_inicio_prevista ? formatBr(p.data_inicio_prevista) : "—",
      fim: p.data_inicio_prevista ? formatBr(endIsoFromDur(p.data_inicio_prevista, p.duracao_dias || 1, p.incluir_fds)) : "—",
      tecnico: p.tecnico || "",
      inicioReal: p.data_inicio_real ? formatBr(p.data_inicio_real) : "",
    };
  };

  const renderBlock = (titulo: string, tone: string, arr: Programacao[]) => {
    const grupos = groupByEquip(arr);
    return (
      <div className="space-y-2">
        <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${tone}`}>
          <span className="h-2 w-2 rounded-full bg-current" />
          {titulo} <span className="text-muted-foreground font-normal">({arr.length})</span>
        </div>
        {arr.length === 0 && <div className="text-xs text-muted-foreground italic pl-4">Nenhum</div>}
        {grupos.map((g) => (
          <div key={g.nome} className="rounded-md border overflow-hidden">
            <div className="px-2 py-1 text-[11px] font-semibold bg-muted/40">{g.nome}</div>
            <div className="divide-y">
              {g.items.map((p) => {
                const r = rowInfo(p);
                return (
                  <div key={p.id} className="grid grid-cols-[80px_1fr_100px_80px] gap-2 items-center px-2 py-1 text-xs">
                    <div className="tabular-nums font-semibold">{r.inicio}</div>
                    <div className="truncate">
                      <span className="font-medium">{r.codigo}</span>
                      <span className="text-muted-foreground"> • {r.ensaio}</span>
                      {r.ident && <span className="text-muted-foreground"> • {r.ident}</span>}
                    </div>
                    <div className="text-muted-foreground truncate">OS {r.os}</div>
                    <div className="text-muted-foreground tabular-nums text-right">{p.duracao_dias}d</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const gerarPdf = () => {
    const win = window.open("", "_blank", "width=1000,height=800");
    if (!win) { toast.error("Popup bloqueado"); return; }
    const dataStr = new Date().toLocaleString("pt-BR");
    const filtroInfo = [
      fEquip !== "todos" ? `Equipamento: ${equipById.get(fEquip)?.nome}` : null,
      fTipo !== "todos" ? `Tipo: ${tipoById.get(fTipo)?.nome}` : null,
      fOs !== "todos" ? `OS: ${fOs}` : null,
      `Horizonte: ${horizonte}d`,
    ].filter(Boolean).join(" • ");

    const blockHtml = (titulo: string, arr: Programacao[]) => {
      const grupos = groupByEquip(arr);
      if (arr.length === 0) return `<h2>${titulo}</h2><p class="empty">Nenhum</p>`;
      return `<h2>${titulo} <span class="count">(${arr.length})</span></h2>` + grupos.map((g) => `
        <h3>${g.nome}</h3>
        <table>
          <thead>
            <tr>
              <th>OS</th><th>Amostra</th><th>Tipo</th><th>Identificação</th>
              <th>Ensaio</th><th>Início prev.</th><th>Fim prev.</th>
              <th>Data moldagem</th><th>Início real</th><th>Laboratorista</th>
            </tr>
          </thead>
          <tbody>
            ${g.items.map((p) => {
              const r = rowInfo(p);
              return `<tr>
                <td>${r.os}</td>
                <td><b>${r.codigo}</b></td>
                <td>${r.tipoAm}</td>
                <td>${r.ident}</td>
                <td>${r.ensaio}</td>
                <td class="num">${r.inicio}</td>
                <td class="num">${r.fim}</td>
                <td class="blank"></td>
                <td class="num">${r.inicioReal}</td>
                <td class="blank"></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      `).join("");
    };

    const logoUrl = `${window.location.origin}${suporteLogoUrl}`;
    const logoImg = `<img src="${logoUrl}" alt="Suporte INFRA" style="height:44px;width:auto" onerror="this.style.display='none'"/>`;

    win.document.write(`<!doctype html><html><head><meta charset="utf-8"/>
      <title>Agenda de ensaios — Suporte INFRA</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 24px; color: #222; }
        header { display:flex; align-items:center; gap:12px; border-bottom:2px solid #F0B43C; padding-bottom:10px; margin-bottom:16px; }
        header .brand { font-weight:800; font-size:18px; letter-spacing:-0.02em; }
        header .brand span { color:#F0B43C; }
        header .meta { margin-left:auto; text-align:right; font-size:11px; color:#555; }
        h1 { font-size: 16px; margin: 0 0 4px; }
        h2 { font-size: 13px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: .05em; color:#333; border-bottom:1px solid #ddd; padding-bottom:4px; }
        h2 .count { color: #888; font-weight: 400; }
        h3 { font-size: 12px; margin: 10px 0 4px; color:#555; background:#f4f4f4; padding:4px 6px; border-radius:3px; }
        table { width:100%; border-collapse: collapse; font-size: 10.5px; }
        th, td { border:1px solid #ddd; padding: 4px 5px; text-align:left; vertical-align: top; }
        th { background:#fafafa; font-weight:700; text-transform: uppercase; font-size: 9px; letter-spacing: .04em; }
        td.num { text-align: right; font-variant-numeric: tabular-nums; }
        td.blank { height: 20px; background: repeating-linear-gradient(45deg,#fff,#fff 3px,#f6f6f6 3px,#f6f6f6 6px); }
        p.empty { color:#999; font-style: italic; font-size:11px; }
        .filters { font-size: 11px; color:#555; }
        @media print { .noprint { display: none; } body { margin: 12mm; } }
      </style>
      </head><body>
      <header>
        ${logoImg}
        <div>
          <div style="font-size:10px;color:#777;text-transform:uppercase;letter-spacing:.2em">Agenda de ensaios</div>
        </div>
        <div class="meta">
          <div><b>${dataStr}</b></div>
          <div class="filters">${filtroInfo}</div>
        </div>
      </header>
      ${blockHtml("Atrasados — deveriam ter iniciado", buckets.atrasados)}
      ${blockHtml("Hoje", buckets.hojeArr)}
      ${blockHtml(`Próximos (${horizonte} dias)`, buckets.proximos)}
      <div class="noprint" style="margin-top:20px;text-align:center">
        <button onclick="window.print()" style="padding:8px 20px;font-size:14px;background:#F0B43C;border:0;border-radius:4px;cursor:pointer">Imprimir / Salvar PDF</button>
      </div>
      <script>setTimeout(() => window.print(), 500);</script>
      </body></html>`);
    win.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" /> Agenda de ensaios
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Horizonte</Label>
            <Select value={horizonte} onValueChange={(v) => setHorizonte(v as any)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Essa semana (7d)</SelectItem>
                <SelectItem value="15">Próximos 15 dias</SelectItem>
                <SelectItem value="30">Próximos 30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Equipamento</Label>
            <Select value={fEquip} onValueChange={setFEquip}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {equipamentos.map((eq) => (<SelectItem key={eq.id} value={eq.id}>{eq.nome}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Tipo de ensaio</Label>
            <Select value={fTipo} onValueChange={setFTipo}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {tipos.map((t) => (<SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">OS</Label>
            <Select value={fOs} onValueChange={setFOs}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {osOptions.map((os) => (<SelectItem key={os} value={os}>OS {os}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          {renderBlock("Atrasados", "text-red-600 dark:text-red-400", buckets.atrasados)}
          {renderBlock("Hoje", "text-amber-600 dark:text-amber-400", buckets.hojeArr)}
          {renderBlock(`Próximos (${horizonte}d)`, "text-primary", buckets.proximos)}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={gerarPdf}>
            <Printer className="h-4 w-4" /> Gerar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}