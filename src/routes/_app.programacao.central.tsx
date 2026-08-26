import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { ClipboardList as PageIcon } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listRows, insertRow, updateRow, deleteRow, ensureColumns } from "@/lib/programacao.functions";
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
import { ProgramarDetalhesDialog } from "@/components/programar-detalhes-dialog";
import { BulkProgramarDialog } from "@/components/bulk-programar-dialog";
import { fetchCadastroOs } from "@/lib/cadastro.functions";
import { useSchedule } from "@/hooks/use-schedule";
import { fetchEntregues } from "@/lib/sheets.functions";
import { splitSetores, splitEscopo, parseBrDate, parseEntregaMeta } from "@/lib/schedule-utils";
import { endIsoFromDur, normalizeDurationDays, parseIncluirFds, nextBusinessDayIso } from "@/lib/business-days";
import { formatDurReal } from "@/lib/duracao-real";
import type { ScheduleRow } from "@/lib/sheets.functions";
import { SetorBadges } from "@/components/setor-badges";

const suporteLogoUrl = "/suporte-infra-logo.png";
import { EscopoBadges } from "@/components/escopo-badges";
import { OsFullDetailsDialog } from "@/components/os-full-details-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, FlaskConical, ClipboardList, AlertCircle, ChevronsUpDown, Check, Info, Printer } from "lucide-react";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { Upload, ChevronDown, ChevronRight } from "lucide-react";
import { ImportEnsaiosDialog } from "@/components/import-ensaios-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutGrid, List, Rows3, Sheet as SheetIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

function fmtDur(n: number | null | undefined) {
  if (n == null) return "—";
  const dur = normalizeDurationDays(n, 0);
  if (dur < 1) {
    const h = Math.round(dur * 24 * 10) / 10;
    return `${String(h).replace(".", ",")}h`;
  }
  return Number.isInteger(dur) ? String(dur) : dur.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/* ------------------------------- Tipos ------------------------------- */
type Amostra = {
  id: string;
  os_numero: string;
  codigo_amostra: string | null;
  descricao: string | null;
  tipo: string | null;
  tomador: string | null;
  obra: string | null;
  data_recebimento: string | null;
  prioridade: "baixa" | "media" | "alta" | "urgente";
  observacoes: string | null;
};
type Ensaio = {
  id: string;
  amostra_id: string;
  tipo_ensaio_id: string;
  status: "pendente" | "programado" | "em_execucao" | "concluido" | "cancelado";
  prioridade: "baixa" | "media" | "alta" | "urgente";
  prazo: string | null;
  observacoes: string | null;
  detalhes_tecnicos: string | null;
};
type TipoEnsaio = { id: string; nome: string; cor_gantt: string | null; tempo_medio_h: number | null };
type TipoEnsaioFull = TipoEnsaio & { equipamentos_ids: string[] };

/** Status derivado do ensaio cruzando com a programação do Gantt. */
type EfStatus =
  | "pendente"
  | "atrasado"
  | "programado"
  | "em_execucao"
  | "concluido"
  | "cancelado";

const EF_LABEL: Record<EfStatus, string> = {
  pendente: "Prog. pendente",
  atrasado: "Atrasado",
  programado: "Programado",
  em_execucao: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};
const EF_COLOR: Record<EfStatus, string> = {
  pendente: "status-pill status-pendente border-dashed border-muted-foreground/30",
  atrasado: "status-pill status-atrasado shadow-[0_0_8px_rgba(var(--status-atrasado-rgb,239,68,68),0.3)]",
  programado: "status-pill status-programado",
  em_execucao: "status-pill status-execucao animate-pulse-slow",
  concluido: "status-pill status-concluido",
  cancelado: "status-pill status-pendente opacity-60",
};

// Paleta por coluna do Kanban — tinta a coluna, o cartão e a barra superior.
const EF_KANBAN: Record<EfStatus, { col: string; bar: string; card: string; dot: string }> = {
  pendente: {
    col: "border-border bg-muted/40",
    bar: "status-bar-pendente",
    card: "border-border hover:border-muted-foreground/50",
    dot: "status-bar-pendente",
  },
  atrasado: {
    col: "border-[color-mix(in_oklch,var(--status-atrasado)_35%,transparent)] bg-[color-mix(in_oklch,var(--status-atrasado)_6%,transparent)]",
    bar: "status-bar-atrasado",
    card: "border-[color-mix(in_oklch,var(--status-atrasado)_25%,transparent)] hover:border-[color-mix(in_oklch,var(--status-atrasado)_60%,transparent)]",
    dot: "status-bar-atrasado",
  },
  programado: {
    col: "border-[color-mix(in_oklch,var(--status-programado)_30%,transparent)] bg-[color-mix(in_oklch,var(--status-programado)_5%,transparent)]",
    bar: "status-bar-programado",
    card: "border-[color-mix(in_oklch,var(--status-programado)_25%,transparent)] hover:border-[color-mix(in_oklch,var(--status-programado)_55%,transparent)]",
    dot: "status-bar-programado",
  },
  em_execucao: {
    col: "border-[color-mix(in_oklch,var(--status-execucao)_35%,transparent)] bg-[color-mix(in_oklch,var(--status-execucao)_8%,transparent)]",
    bar: "status-bar-execucao",
    card: "border-[color-mix(in_oklch,var(--status-execucao)_30%,transparent)] hover:border-[color-mix(in_oklch,var(--status-execucao)_60%,transparent)]",
    dot: "status-bar-execucao",
  },
  concluido: {
    col: "border-[color-mix(in_oklch,var(--status-concluido)_30%,transparent)] bg-[color-mix(in_oklch,var(--status-concluido)_6%,transparent)]",
    bar: "status-bar-concluido",
    card: "border-[color-mix(in_oklch,var(--status-concluido)_25%,transparent)] hover:border-[color-mix(in_oklch,var(--status-concluido)_55%,transparent)]",
    dot: "status-bar-concluido",
  },
  cancelado: {
    col: "border-border bg-muted/30",
    bar: "bg-muted-foreground/40",
    card: "border-border hover:border-muted-foreground/60",
    dot: "bg-muted-foreground/60",
  },
};

const PRIO_LABEL = { baixa: "Baixa", media: "Média", alta: "Alta", urgente: "Urgente" } as const;
const PRIO_COLOR: Record<Amostra["prioridade"], string> = {
  baixa: "bg-muted text-muted-foreground",
  media: "status-pill status-programado",
  alta: "status-pill status-execucao",
  urgente: "status-pill status-atrasado",
};
const STATUS_LABEL: Record<Ensaio["status"], string> = {
  pendente: "Pendente",
  programado: "Programado",
  em_execucao: "Em execução",
  concluido: "Concluído",
  cancelado: "Cancelado",
};
const STATUS_COLOR: Record<Ensaio["status"], string> = {
  pendente: "status-pill status-pendente",
  programado: "status-pill status-programado",
  em_execucao: "status-pill status-execucao",
  concluido: "status-pill status-concluido",
  cancelado: "status-pill status-pendente opacity-60",
};

function parseAmostra(r: Record<string, string>): Amostra {
  return {
    id: r.id,
    os_numero: r.os_numero || r.os || r.OS || r.osNumero || "",
    codigo_amostra: r.codigo_amostra || r.codigo || r.code || r.amostra || r.identificacao || null,
    descricao: r.descricao || r.identificacao || null,
    tipo: r.tipo || null,
    tomador: r.tomador || null,
    obra: r.obra || null,
    data_recebimento: r.data_recebimento || null,
    prioridade: (r.prioridade || "media") as Amostra["prioridade"],
    observacoes: r.observacoes || null,
  };
}
function parseEnsaio(r: Record<string, string>): Ensaio {
  return {
    id: r.id,
    amostra_id: r.amostra_id || r.amostraId || r.amostra || "",
    tipo_ensaio_id: r.tipo_ensaio_id || r.tipoEnsaioId || r.tipo_id || r.tipo || "",
    status: (r.status || "pendente") as Ensaio["status"],
    prioridade: (r.prioridade || "media") as Ensaio["prioridade"],
    prazo: r.prazo || null,
    observacoes: r.observacoes || null,
    detalhes_tecnicos: r.detalhes_tecnicos || null,
  };
}

/* ------------------------------- Rota ------------------------------- */
export const Route = createFileRoute("/_app/programacao/central")({
  component: CentralPage,
});

function CentralPage() {
  const qc = useQueryClient();

  const { data: cadastroData } = useQuery({
    queryKey: ["cadastro-os-all"],
    queryFn: () => fetchCadastroOs(),
  });
  const cadastro = cadastroData?.rows ?? [];
  const { data: scheduleData } = useSchedule();
  const { data: entreguesData } = useQuery({
    queryKey: ["entregues-all"],
    queryFn: () => fetchEntregues(),
  });
  // Bucket selector: filtra pelas OSs de escopo especial (Cisalhamento /
  // Triaxiais Mec. Solos / Adensamento) OU pelas OSs com tag de setor
  // "Especiais" (podem ainda não ter escopo definido).
  const [osBucket, setOsBucket] = useState<"escopo" | "tag">("escopo");
  const ESCOPOS_ESPECIAIS = useMemo(
    () => new Set(["Cisalhamento", "Triaxiais Mec. Solos", "Adensamento"]),
    [],
  );
  const escopoEspeciaisOs = useMemo(() => {
    const s = new Set<string>();
    for (const r of scheduleData?.rows ?? []) {
      if (!r.os) continue;
      const { tags } = splitEscopo(r.escopo);
      if (tags.some((t) => ESCOPOS_ESPECIAIS.has(t))) s.add(r.os);
    }
    return s;
  }, [scheduleData, ESCOPOS_ESPECIAIS]);
  const tagEspeciaisOs = useMemo(() => {
    const s = new Set<string>();
    for (const r of scheduleData?.rows ?? []) {
      if (r.os && splitSetores(r.setor).includes("Especiais")) s.add(r.os);
    }
    // Desconta as OSs que já aparecem em "OS Especiais" (por escopo)
    for (const os of escopoEspeciaisOs) s.delete(os);
    return s;
  }, [scheduleData, escopoEspeciaisOs]);
  const especiaisOs = osBucket === "escopo" ? escopoEspeciaisOs : tagEspeciaisOs;
  // Índice por OS: agrupa setores, escopos e mantém a linha mais recente da planilha
  const osScheduleIndex = useMemo(() => {
    const m = new Map<
      string,
      { setores: Set<string>; escopos: Set<string>; row: ScheduleRow }
    >();
    for (const r of scheduleData?.rows ?? []) {
      if (!r.os) continue;
      const cur = m.get(r.os) ?? {
        setores: new Set<string>(),
        escopos: new Set<string>(),
        row: r,
      };
      for (const s of splitSetores(r.setor)) cur.setores.add(s);
      const { tags, extras } = splitEscopo(r.escopo);
      for (const t of tags) cur.escopos.add(t);
      for (const e of extras) cur.escopos.add(e);
      cur.row = r; // última linha vence
      m.set(r.os, cur);
    }
    return m;
  }, [scheduleData]);
  const [detailOs, setDetailOs] = useState<ScheduleRow | null>(null);
  const { data: amostras = [] } = useQuery({
    queryKey: ["amostras"],
    queryFn: async () =>
      (await listRows({ data: { sheet: SHEET_AMOSTRAS } })).map(parseAmostra),
  });
  const { data: ensaios = [] } = useQuery({
    queryKey: ["ensaios"],
    queryFn: async () =>
      (await listRows({ data: { sheet: SHEET_ENSAIOS } })).map(parseEnsaio),
  });
  const { data: tipos = [] } = useQuery({
    queryKey: ["tipos_ensaio_min"],
    queryFn: async () => {
      const rows = await listRows({ data: { sheet: SHEET_TIPOS } });
      return rows.map((r) => ({
        id: r.id,
        nome: r.nome ?? "",
        cor_gantt: r.cor_gantt || null,
        equipamentos_ids: (r.equipamentos_ids || "").split(",").map((s) => s.trim()).filter(Boolean),
        tempo_medio_h: r.tempo_medio_h ? Number(r.tempo_medio_h) : null,
      })) as TipoEnsaioFull[];
    },
  });
  const { data: programacoes = [] } = useQuery({
    queryKey: ["programacoes"],
    queryFn: async () => {
      const rows = await listRows({ data: { sheet: SHEET_PROGS } });
      return rows.map(parseProgramacaoRow);
    },
  });
  const { data: equipamentos = [] } = useQuery({
    queryKey: ["equipamentos"],
    queryFn: async () => {
      const rows = await listRows({ data: { sheet: SHEET_EQUIPS } });
      return rows.map((r) => ({ id: r.id, nome: r.nome ?? "", codigo: r.codigo ?? "" }));
    },
  });
  const equipById = useMemo(() => new Map(equipamentos.map((e) => [e.id, e])), [equipamentos]);

  /** Deadline (data de entrega) por OS, extraído do Cronograma → ISO YYYY-MM-DD.
   *  Regra: usa a data da entrega marcada como "Final" (a maior, se houver
   *  mais de uma). Se não existir "Final", usa a MAIOR data entre as
   *  Parciais (última parcial programada). Como fallback (sem marcação
   *  Parcial/Final na coluna P), usa a menor data conhecida. */
  const osDeadlines = useMemo(() => {
    const finals = new Map<string, string>();
    const parciais = new Map<string, string>();
    const semMeta = new Map<string, string>();
    for (const r of scheduleData?.rows ?? []) {
      if (!r.os) continue;
      const d = parseBrDate(r.dataEntrega);
      if (!d) continue;
      const iso = d.toISOString().slice(0, 10);
      const meta = parseEntregaMeta(r.escopo);
      if (meta.tipo === "Final") {
        const cur = finals.get(r.os);
        if (!cur || iso > cur) finals.set(r.os, iso);
      } else if (meta.tipo === "Parcial") {
        const cur = parciais.get(r.os);
        if (!cur || iso > cur) parciais.set(r.os, iso);
      } else {
        const cur = semMeta.get(r.os);
        if (!cur || iso < cur) semMeta.set(r.os, iso);
      }
    }
    const m = new Map<string, string>();
    const oss = new Set<string>([...finals.keys(), ...parciais.keys(), ...semMeta.keys()]);
    for (const os of oss) {
      m.set(os, finals.get(os) ?? parciais.get(os) ?? semMeta.get(os)!);
    }
    return m;
  }, [scheduleData]);

  const osInfoIndex = useMemo(() => {
    const index = new Map<string, { tomador: string; obra: string }>();
    const put = (os: string | null | undefined, tomador?: string | null, obra?: string | null, prefer = false) => {
      const key = (os ?? "").trim();
      if (!key) return;
      const cur = index.get(key) ?? { tomador: "", obra: "" };
      const next = { ...cur };
      const t = (tomador ?? "").trim();
      const o = (obra ?? "").trim();
      if (t && (prefer || !next.tomador)) next.tomador = t;
      if (o && (prefer || !next.obra)) next.obra = o;
      index.set(key, next);
    };

    // Fontes auxiliares primeiro; Cadastro OS por último como fonte mais forte.
    for (const r of scheduleData?.rows ?? []) put(r.os, r.tomador, null);
    for (const r of entreguesData?.rows ?? []) put(r.os, r.tomador, null);
    for (const a of amostras) put(a.os_numero, a.tomador, a.obra);
    for (const c of cadastro) put(c.os, c.tomador, c.obra, true);

    return index;
  }, [scheduleData, entreguesData, amostras, cadastro]);

  const tipoById = useMemo(() => new Map(tipos.map((t) => [t.id, t])), [tipos]);
  const progByEnsaio = useMemo(
    () => new Map(programacoes.map((p) => [p.ensaio_id, p])),
    [programacoes],
  );
  const todayIso = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  }, []);
  const effStatus = (e: Ensaio): EfStatus => {
    if (e.status === "concluido" || e.status === "cancelado") return e.status;
    const p = progByEnsaio.get(e.id);
    if (!p) return "pendente";
    if (p.status === "concluido") return "concluido";
    if (p.status === "em_execucao") return "em_execucao";
    if (p.data_inicio_prevista && p.data_inicio_prevista < todayIso) return "atrasado";
    return "programado";
  };

  /* ------- Helpers de datas para colunas Previsto / Real / Atraso ------- */
  const parseIso = (s: string | null | undefined): Date | null => {
    if (!s) return null;
    const d = new Date(s.length === 10 ? s + "T00:00:00" : s);
    return isNaN(d.getTime()) ? null : d;
  };
  const fmtBr = (s: string | null | undefined) => {
    const d = parseIso(s);
    if (!d) return "—";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  };
  const addDaysIso = (iso: string, days: number) => {
    const d = parseIso(iso)!;
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const diffDays = (a: string, b: string) => {
    const da = parseIso(a)!;
    const db = parseIso(b)!;
    return Math.round((da.getTime() - db.getTime()) / 86_400_000);
  };
  /**
   * Atraso = comparação real x previsto.
   * - Concluído: fim_real - fim_previsto
   * - Em execução: início_real - início_previsto
   * - Planejado: se hoje > início_previsto → hoje - início_previsto (não iniciado no prazo)
   * Negativo = adiantado, positivo = atrasado.
   */
  const computeAtraso = (p: Programacao): { dias: number | null; tipo: "inicio" | "fim" | "aberto" | null } => {
    if (!p.data_inicio_prevista) return { dias: null, tipo: null };
    const fimPrev = p.data_fim || endIsoFromDur(p.data_inicio_prevista, p.duracao_dias, p.incluir_fds);
    if (p.status === "concluido" && p.data_fim_real) {
      return { dias: diffDays(p.data_fim_real, fimPrev), tipo: "fim" };
    }
    if (p.status === "em_execucao" && p.data_inicio_real) {
      return { dias: diffDays(p.data_inicio_real, p.data_inicio_prevista), tipo: "inicio" };
    }
    if (p.data_inicio_prevista < todayIso) {
      return { dias: diffDays(todayIso, p.data_inicio_prevista), tipo: "aberto" };
    }
    return { dias: null, tipo: null };
  };
  const ensaiosSemProg = useMemo(() => {
    const programados = new Set(programacoes.map((p) => p.ensaio_id));
    return ensaios.filter((e) => !programados.has(e.id) && e.status !== "cancelado" && e.status !== "concluido");
  }, [ensaios, programacoes]);
  const [pendentesOpen, setPendentesOpen] = useState(false);
  const [detalhesLoteOpen, setDetalhesLoteOpen] = useState(false);
  const [detalhesEnsaio, setDetalhesEnsaio] = useState<{ ensaio: Ensaio; amostra: Amostra } | null>(null);

  // Garante coluna `detalhes_tecnicos` na aba Ensaios (idempotente, roda uma vez por sessão)
  useEffect(() => {
    ensureColumns({ data: { sheet: SHEET_ENSAIOS, columns: ["detalhes_tecnicos"] } }).catch(() => {});
    ensureColumns({ data: { sheet: SHEET_PROGS, columns: ["predecessor_id"] } }).catch(() => {});
  }, []);

  /* ---- OS list: mescla cadastro + amostras (algumas OS podem não estar no cadastro) ---- */
  const [busca, setBusca] = useState("");
  const [osSelecionada, setOsSelecionada] = useState<string | null>(null);

  const osList = useMemo(() => {
    type Item = { os: string; tomador: string; obra: string; qtdAmostras: number };
    const map = new Map<string, Item>();
    for (const c of cadastro) {
      if (!c.os) continue;
      if (!especiaisOs.has(c.os)) continue;
      const info = osInfoIndex.get(c.os);
      map.set(c.os, {
        os: c.os,
        tomador: c.tomador || info?.tomador || "",
        obra: c.obra || info?.obra || "",
        qtdAmostras: 0,
      });
    }
    for (const a of amostras) {
      if (!especiaisOs.has(a.os_numero)) continue;
      const info = osInfoIndex.get(a.os_numero);
      const cur = map.get(a.os_numero) ?? {
        os: a.os_numero,
        tomador: a.tomador || info?.tomador || "",
        obra: a.obra || info?.obra || "",
        qtdAmostras: 0,
      };
      if (!cur.tomador) cur.tomador = a.tomador || info?.tomador || "";
      if (!cur.obra) cur.obra = a.obra || info?.obra || "";
      cur.qtdAmostras += 1;
      map.set(a.os_numero, cur);
    }
    // Terceira fonte: Cronograma. Garante que OS Especiais que ainda não
    // possuem cadastro nem amostras cadastradas apareçam na lista.
    for (const r of scheduleData?.rows ?? []) {
      if (!r.os) continue;
      if (!especiaisOs.has(r.os)) continue;
      const info = osInfoIndex.get(r.os);
      const cur = map.get(r.os) ?? { os: r.os, tomador: "", obra: "", qtdAmostras: 0 };
      if (!cur.tomador) cur.tomador = r.tomador || info?.tomador || "";
      if (!cur.obra) cur.obra = info?.obra || "";
      map.set(r.os, cur);
    }
    const arr = Array.from(map.values()).sort((a, b) => a.os.localeCompare(b.os));
    const q = busca.trim().toLowerCase();
    if (!q) return arr;
    return arr.filter(
      (x) =>
        x.os.toLowerCase().includes(q) ||
        x.tomador.toLowerCase().includes(q) ||
        x.obra.toLowerCase().includes(q),
    );
  }, [cadastro, amostras, scheduleData, busca, especiaisOs, osInfoIndex]);

  const amostrasDaOs = useMemo(
    () => amostras.filter((a) => a.os_numero === osSelecionada),
    [amostras, osSelecionada],
  );

  // Contagens reais dos buckets (OSs efetivamente presentes em cadastro/amostras)
  const bucketCounts = useMemo(() => {
    const present = new Set<string>();
    for (const c of cadastro) if (c.os) present.add(c.os);
    for (const a of amostras) if (a.os_numero) present.add(a.os_numero);
    for (const r of scheduleData?.rows ?? []) if (r.os) present.add(r.os);
    let escopo = 0;
    let tag = 0;
    for (const os of present) {
      if (escopoEspeciaisOs.has(os)) escopo++;
      else if (tagEspeciaisOs.has(os)) tag++;
    }
    return { escopo, tag };
  }, [cadastro, amostras, scheduleData, escopoEspeciaisOs, tagEspeciaisOs]);

  /* ---- Mutations ---- */
  const upsertAmostra = useMutation({
    mutationFn: async (p: { id?: string; row: Partial<Amostra> }) => {
      if (p.id) {
        await updateRow({ data: { sheet: SHEET_AMOSTRAS, id: p.id, patch: p.row as Record<string, unknown> } });
      } else {
        await insertRow({ data: { sheet: SHEET_AMOSTRAS, row: p.row as Record<string, unknown> } });
      }
    },
    onSuccess: () => {
      toast.success("Amostra salva");
      qc.invalidateQueries({ queryKey: ["amostras"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar amostra"),
  });
  const delAmostra = useMutation({
    mutationFn: async (id: string) => {
      // remove ensaios da amostra primeiro
      const filhos = ensaios.filter((e) => e.amostra_id === id);
      for (const f of filhos) {
        await deleteRow({ data: { sheet: SHEET_ENSAIOS, id: f.id } });
      }
      await deleteRow({ data: { sheet: SHEET_AMOSTRAS, id } });
    },
    onSuccess: () => {
      toast.success("Amostra removida");
      qc.invalidateQueries({ queryKey: ["amostras"] });
      qc.invalidateQueries({ queryKey: ["ensaios"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover"),
  });

  const upsertEnsaio = useMutation({
    mutationFn: async (p: { id?: string; row: Partial<Ensaio> }) => {
      if (p.id) {
        await updateRow({ data: { sheet: SHEET_ENSAIOS, id: p.id, patch: p.row as Record<string, unknown> } });
        // Espelha observações do ensaio para a programação (se existir),
        // mantendo a Central e o Gantt sempre em sincronia.
        if ("observacoes" in p.row) {
          const prog = progByEnsaio.get(p.id);
          if (prog) {
            try {
              await updateRow({
                data: {
                  sheet: SHEET_PROGS,
                  id: prog.id,
                  patch: { observacoes: (p.row.observacoes as string | null) ?? "" },
                },
              });
            } catch { /* segue mesmo se o espelho falhar */ }
          }
        }
      } else {
        await insertRow({ data: { sheet: SHEET_ENSAIOS, row: p.row as Record<string, unknown> } });
      }
    },
    onSuccess: () => {
      toast.success("Ensaio salvo");
      qc.invalidateQueries({ queryKey: ["ensaios"] });
      qc.invalidateQueries({ queryKey: ["programacoes"] });
      qc.invalidateQueries({ queryKey: ["programacoes_full"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar ensaio"),
  });
  const delEnsaio = useMutation({
    mutationFn: async (id: string) => {
      await deleteRow({ data: { sheet: SHEET_ENSAIOS, id } });
    },
    onSuccess: () => {
      toast.success("Ensaio removido");
      qc.invalidateQueries({ queryKey: ["ensaios"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover"),
  });

  /* ---- Mutação: mudar status da Programação via drag-and-drop do Kanban ---- */
  const patchProg = useMutation({
    mutationFn: async (p: { id: string; patch: Record<string, unknown>; msg: string }) => {
      await updateRow({ data: { sheet: SHEET_PROGS, id: p.id, patch: p.patch } });
      return p.msg;
    },
    onSuccess: (msg) => {
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["programacoes"] });
      qc.invalidateQueries({ queryKey: ["programacoes_full"] });
      qc.invalidateQueries({ queryKey: ["ensaios"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao mover cartão"),
  });

  /* ---- Mutação: criar nova Programação (usado no click de linha pendente) ---- */
  const createProg = useMutation({
    mutationFn: async (row: Record<string, unknown>) => {
      await insertRow({ data: { sheet: SHEET_PROGS, row } });
    },
    onSuccess: () => {
      toast.success("Ensaio programado");
      qc.invalidateQueries({ queryKey: ["programacoes"] });
      qc.invalidateQueries({ queryKey: ["programacoes_full"] });
      qc.invalidateQueries({ queryKey: ["ensaios"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao programar"),
  });

  /** Mapeia uma transição do Kanban para o patch que a Programação deve receber.
   *  Retorna null se a transição não fizer sentido (ex.: pendente sem programação). */
  const kanbanTransition = (
    from: EfStatus,
    to: EfStatus,
    prog: Programacao | null,
  ): { patch: Record<string, unknown>; msg: string } | null => {
    if (from === to) return null;
    const hoje = new Date().toISOString().slice(0, 10);
    const nowTs = new Date().toISOString();
    // "pendente" no Kanban = sem programação → precisa abrir o diálogo (não dá pra soltar)
    if (!prog) return null;
    // programado / atrasado → em_execucao (iniciar)
    if ((from === "programado" || from === "atrasado") && to === "em_execucao") {
      return {
        patch: { status: "em_execucao", data_inicio_real: hoje, inicio_real_ts: nowTs, progresso: 50 },
        msg: "Ensaio iniciado",
      };
    }
    // em_execucao → concluido
    if (from === "em_execucao" && to === "concluido") {
      return {
        patch: { status: "concluido", data_fim_real: hoje, fim_real_ts: nowTs, progresso: 100 },
        msg: "Ensaio concluído",
      };
    }
    // concluido → em_execucao (reabrir)
    if (from === "concluido" && to === "em_execucao") {
      return {
        patch: { status: "em_execucao", data_fim_real: null, fim_real_ts: null, progresso: 50 },
        msg: "Ensaio reaberto",
      };
    }
    // em_execucao → programado (cancelar execução)
    if (from === "em_execucao" && to === "programado") {
      return {
        patch: { status: "planejado", data_inicio_real: null, inicio_real_ts: null, progresso: 0 },
        msg: "Execução cancelada",
      };
    }
    return null;
  };

  /** Colunas de destino permitidas para arrastar um cartão a partir de `from`. */
  const allowedTargets = (from: EfStatus): EfStatus[] => {
    switch (from) {
      case "programado":
      case "atrasado":
        return ["em_execucao"];
      case "em_execucao":
        return ["programado", "concluido"];
      case "concluido":
        return ["em_execucao"];
      default:
        return [];
    }
  };

  const [dragCard, setDragCard] = useState<{ ensaioId: string; from: EfStatus } | null>(null);
  const [dragOverCol, setDragOverCol] = useState<EfStatus | null>(null);

  /* ---- Dialogs ---- */
  const [amostraOpen, setAmostraOpen] = useState(false);
  const [amostraEdit, setAmostraEdit] = useState<Amostra | null>(null);
  const [ensaioOpen, setEnsaioOpen] = useState(false);
  const [ensaioEdit, setEnsaioEdit] = useState<Ensaio | null>(null);
  const [ensaioAmostraId, setEnsaioAmostraId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [collapsedAmostras, setCollapsedAmostras] = useState<Set<string>>(new Set());
  const toggleAmostra = (id: string) =>
    setCollapsedAmostras((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const [osCollapsed, setOsCollapsed] = useState(false);

  /* ---- Filtros da lista de amostras ---- */
  const [filtroBusca, setFiltroBusca] = useState("");
  const [filtroTipos, setFiltroTipos] = useState<Set<string>>(new Set());
  const [filtroEnsaios, setFiltroEnsaios] = useState<Set<string>>(new Set());

  const tiposDisponiveis = useMemo(() => {
    const s = new Set<string>();
    for (const a of amostrasDaOs) {
      const t = (a.tipo || "").trim().toUpperCase();
      if (t) s.add(t);
    }
    return Array.from(s).sort();
  }, [amostrasDaOs]);

  const ensaiosDisponiveis = useMemo(() => {
    const s = new Set<string>();
    for (const a of amostrasDaOs) {
      for (const e of ensaios.filter((x) => x.amostra_id === a.id)) {
        const nome = tipoById.get(e.tipo_ensaio_id)?.nome;
        if (nome) s.add(nome.trim().toUpperCase());
      }
    }
    return Array.from(s).sort();
  }, [amostrasDaOs, ensaios, tipoById]);

  const amostrasFiltradas = useMemo(() => {
    const q = filtroBusca.trim().toLowerCase();
    return amostrasDaOs.filter((a) => {
      if (filtroTipos.size) {
        const t = (a.tipo || "").trim().toUpperCase();
        if (!filtroTipos.has(t)) return false;
      }
      if (filtroEnsaios.size) {
        const nomes = ensaios
          .filter((e) => e.amostra_id === a.id)
          .map((e) => (tipoById.get(e.tipo_ensaio_id)?.nome || "").trim().toUpperCase());
        if (!nomes.some((n) => filtroEnsaios.has(n))) return false;
      }
      if (!q) return true;
      return (
        (a.codigo_amostra || "").toLowerCase().includes(q) ||
        (a.descricao || "").toLowerCase().includes(q) ||
        (a.tipo || "").toLowerCase().includes(q)
      );
    });
  }, [amostrasDaOs, filtroBusca, filtroTipos, filtroEnsaios, ensaios, tipoById]);

  /* ---- Resumo da OS (estilo SOND) ---- */
  const resumoOs = useMemo(() => {
    const amostrasMap = new Map<string, number>();
    for (const a of amostrasDaOs) {
      const key = (a.tipo || a.codigo_amostra?.replace(/[\d\-\s_.]/g, "") || "—").toUpperCase().trim() || "—";
      amostrasMap.set(key, (amostrasMap.get(key) ?? 0) + 1);
    }
    const ensaiosMap = new Map<string, number>();
    for (const a of amostrasDaOs) {
      for (const e of ensaios.filter((x) => x.amostra_id === a.id)) {
        const nome = tipoById.get(e.tipo_ensaio_id)?.nome || "—";
        ensaiosMap.set(nome, (ensaiosMap.get(nome) ?? 0) + 1);
      }
    }
    return {
      amostras: Array.from(amostrasMap.entries()).sort((a, b) => b[1] - a[1]),
      ensaios: Array.from(ensaiosMap.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [amostrasDaOs, ensaios, tipoById]);

  const osSelInfo = osList.find((o) => o.os === osSelecionada);
  const osInfo = cadastro.find((c) => c.os === osSelecionada);
  const osDisplayInfo = {
    tomador: osInfo?.tomador || osSelInfo?.tomador || (osSelecionada ? osInfoIndex.get(osSelecionada)?.tomador : "") || "",
    obra: osInfo?.obra || osSelInfo?.obra || (osSelecionada ? osInfoIndex.get(osSelecionada)?.obra : "") || "",
  };
  const [osPickerOpen, setOsPickerOpen] = useState(false);

  /* ---- Visão principal ---- */
  const [view, setView] = useState<"detalhe" | "kanban" | "ensaios" | "planilha">("detalhe");
  const { canAccess } = useAuth();
  const canPlanilha = canAccess("programacao_planilha");

  /* ---- Índices auxiliares ---- */
  const amostraById = useMemo(() => new Map(amostras.map((a) => [a.id, a])), [amostras]);

  /* ---- Status agregado por OS ---- */
  type OsStatus = "aguardando" | "em_andamento" | "concluida";
  const osStatusMap = useMemo(() => {
    const byOs = new Map<string, Ensaio[]>();
    for (const e of ensaios) {
      const a = amostraById.get(e.amostra_id);
      if (!a) continue;
      const arr = byOs.get(a.os_numero) ?? [];
      arr.push(e);
      byOs.set(a.os_numero, arr);
    }
    const map = new Map<string, { status: OsStatus; total: number; pendentes: number; andamento: number; concluidos: number }>();
    for (const o of osList) {
      const es = byOs.get(o.os) ?? [];
      const total = es.length;
      const pendentes = es.filter((e) => {
        const s = effStatus(e);
        return s === "pendente" || s === "atrasado";
      }).length;
      const andamento = es.filter((e) => {
        const s = effStatus(e);
        return s === "programado" || s === "em_execucao";
      }).length;
      const concluidos = es.filter((e) => effStatus(e) === "concluido").length;
      let status: OsStatus = "aguardando";
      if (total > 0 && concluidos === total) status = "concluida";
      else if (andamento > 0 || concluidos > 0) status = "em_andamento";
      map.set(o.os, { status, total, pendentes, andamento, concluidos });
    }
    return map;
  }, [osList, ensaios, amostraById, progByEnsaio, todayIso]);

  const osByStatus = useMemo(() => {
    const buckets: Record<OsStatus, typeof osList> = { aguardando: [], em_andamento: [], concluida: [] };
    for (const o of osList) {
      const s = osStatusMap.get(o.os)?.status ?? "aguardando";
      buckets[s].push(o);
    }
    return buckets;
  }, [osList, osStatusMap]);

  /* Sidebar: OSs ordenadas por urgência (atrasadas → prazo próximo → sem prazo) */
  const osListSorted = useMemo(() => {
    const score = (os: string) => {
      const st = osStatusMap.get(os)?.status;
      if (st === "concluida") return 1e9; // manda pro fim
      const d = osDeadlines.get(os);
      if (!d) return 1e8; // sem prazo depois das concluídas
      const days = Math.ceil(
        (new Date(d + "T00:00:00").getTime() - new Date(todayIso + "T00:00:00").getTime()) / 86400000,
      );
      return days;
    };
    return [...osList].sort((a, b) => {
      const da = score(a.os);
      const db = score(b.os);
      if (da !== db) return da - db;
      return a.os.localeCompare(b.os);
    });
  }, [osList, osStatusMap, osDeadlines, todayIso]);

  /* ---- Ensaios linearizados para visão gerente ---- */
  const [filtroGlobal, setFiltroGlobal] = useState("");
  const [filtroStatusEnsaio, setFiltroStatusEnsaio] = useState<Ensaio["status"] | "todos">("todos");
  const [filtroPrazo, setFiltroPrazo] = useState<"todos" | "hoje" | "atrasado" | "semana">("todos");

  const ensaiosFlat = useMemo(() => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const em7 = new Date(hoje);
    em7.setDate(em7.getDate() + 7);
    const q = filtroGlobal.trim().toLowerCase();
    return ensaios
      .map((e) => {
        const a = amostraById.get(e.amostra_id);
        const t = tipoById.get(e.tipo_ensaio_id);
        return { e, a, t, ef: effStatus(e) };
      })
      .filter((r) => {
        if (!r.a) return false;
        if (filtroStatusEnsaio !== "todos" && r.e.status !== filtroStatusEnsaio) return false;
        if (filtroPrazo !== "todos") {
          if (!r.e.prazo) return false;
          const p = new Date(r.e.prazo);
          if (isNaN(p.getTime())) return false;
          p.setHours(0, 0, 0, 0);
          if (filtroPrazo === "hoje" && p.getTime() !== hoje.getTime()) return false;
          if (filtroPrazo === "atrasado" && !(p < hoje && r.e.status !== "concluido")) return false;
          if (filtroPrazo === "semana" && !(p >= hoje && p <= em7)) return false;
        }
        if (!q) return true;
        return (
          r.a.os_numero.toLowerCase().includes(q) ||
          (r.a.codigo_amostra || "").toLowerCase().includes(q) ||
          (r.a.tomador || "").toLowerCase().includes(q) ||
          (r.a.obra || "").toLowerCase().includes(q) ||
          (r.t?.nome || "").toLowerCase().includes(q)
        );
      })
      .sort((x, y) => {
        const px = x.e.prazo || "9999-99-99";
        const py = y.e.prazo || "9999-99-99";
        return px.localeCompare(py);
      });
  }, [ensaios, amostraById, tipoById, filtroGlobal, filtroStatusEnsaio, filtroPrazo, progByEnsaio, todayIso]);

  /* ---- Kanban: por ensaio, 5 colunas ---- */
  const KANBAN_COLS: EfStatus[] = [
    "pendente",
    "atrasado",
    "programado",
    "em_execucao",
    "concluido",
  ];
  const kanbanCards = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return ensaios
      .map((e) => {
        const a = amostraById.get(e.amostra_id);
        const t = tipoById.get(e.tipo_ensaio_id);
        const p = progByEnsaio.get(e.id) ?? null;
        return { e, a, t, p, ef: effStatus(e) };
      })
      .filter((r) => r.a && especiaisOs.has(r.a.os_numero))
      .filter((r) => {
        if (!q) return true;
        return (
          r.a!.os_numero.toLowerCase().includes(q) ||
          (r.a!.codigo_amostra || "").toLowerCase().includes(q) ||
          (r.a!.tomador || "").toLowerCase().includes(q) ||
          (r.a!.obra || "").toLowerCase().includes(q) ||
          (r.t?.nome || "").toLowerCase().includes(q)
        );
      });
  }, [ensaios, amostraById, tipoById, progByEnsaio, especiaisOs, busca, todayIso]);
  const kanbanByStatus = useMemo(() => {
    const m: Record<EfStatus, typeof kanbanCards> = {
      pendente: [], atrasado: [], programado: [], em_execucao: [], concluido: [], cancelado: [],
    };
    for (const c of kanbanCards) m[c.ef].push(c);
    return m;
  }, [kanbanCards]);

  const OS_STATUS_LABEL: Record<OsStatus, string> = {
    aguardando: "Aguardando programação",
    em_andamento: "Em andamento",
    concluida: "Concluída",
  };
  const OS_STATUS_COLOR: Record<OsStatus, string> = {
    aguardando: "border-amber-500/40 bg-amber-500/5",
    em_andamento: "border-sky-500/40 bg-sky-500/5",
    concluida: "border-emerald-500/40 bg-emerald-500/5",
  };
  const OS_STATUS_DOT: Record<OsStatus, string> = {
    aguardando: "bg-amber-500",
    em_andamento: "bg-sky-500",
    concluida: "bg-emerald-500",
  };

  /* ---- Impressão ---- */
  const escapeHtml = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const printHtml = (title: string, bodyHtml: string) => {
    const win = window.open("", "_blank", "width=1200,height=900");
    if (!win) return;
    const logoUrl = `${window.location.origin}${suporteLogoUrl}`;
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; margin: 16px; font-size: 11px; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .meta { color: #666; font-size: 10px; margin-bottom: 12px; }
  .doc-header { display:flex; align-items:center; gap:14px; border-bottom: 2px solid #F0B43C; padding-bottom: 8px; margin-bottom: 12px; }
  .doc-header img { height: 44px; width: auto; }
  .doc-header .kicker { font-size: 9px; text-transform: uppercase; letter-spacing: .2em; color: #777; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f4f4f4; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: #444; }
  .tag { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 9px; font-weight: 600; }
  .k-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
  .k-col { border: 1px solid #ccc; border-radius: 6px; padding: 6px; break-inside: avoid; }
  .k-col h3 { margin: 0 0 6px; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; padding: 4px 6px; border-radius: 4px; color: #fff; }
  .k-card { border: 1px solid #ddd; border-radius: 4px; padding: 5px 6px; margin-bottom: 5px; background: #fff; break-inside: avoid; font-size: 10px; }
  .k-card .os { font-weight: 700; font-family: ui-monospace, monospace; }
  .k-card .muted { color: #666; font-size: 9px; }
  .st-pendente { background:#f59e0b; } .st-atrasado { background:#ef4444; }
  .st-programado { background:#0ea5e9; } .st-em_execucao { background:#8b5cf6; }
  .st-concluido { background:#10b981; } .st-cancelado { background:#6b7280; }
  @media print { body { margin: 10mm; } @page { size: A3 landscape; } }
</style></head><body>
<div class="doc-header">
  <img src="${logoUrl}" alt="Suporte INFRA" onerror="this.style.display='none'"/>
  <div>
    <div class="kicker">Programação de ensaios</div>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">Gerado em ${new Date().toLocaleString("pt-BR")}</div>
  </div>
</div>
${bodyHtml}
<script>window.onload=function(){setTimeout(function(){window.print();},200);};</script>
</body></html>`);
    win.document.close();
  };

  const printKanban = () => {
    const cols = KANBAN_COLS.map((st) => {
      const items = kanbanByStatus[st];
      const cards = items.map(({ e, a, t, p }) => `
        <div class="k-card">
          <div class="os">OS ${escapeHtml(a?.os_numero || "")}${a?.codigo_amostra ? ` · ${escapeHtml(a.codigo_amostra)}` : ""}</div>
          <div>${escapeHtml(t?.nome || "—")}</div>
          ${a?.tomador ? `<div class="muted">${escapeHtml(a.tomador)}</div>` : ""}
          ${(p?.data_inicio_prevista || e.prazo) ? `<div class="muted">${p?.data_inicio_prevista ? `Início ${escapeHtml(p.data_inicio_prevista)}` : ""}${p?.data_inicio_prevista && e.prazo ? " · " : ""}${e.prazo ? `Prazo ${escapeHtml(e.prazo)}` : ""}</div>` : ""}
        </div>`).join("");
      return `<div class="k-col">
        <h3 class="st-${st}">${escapeHtml(EF_LABEL[st])} (${items.length})</h3>
        ${cards || '<div class="muted" style="padding:6px">Nenhum</div>'}
      </div>`;
    }).join("");
    printHtml(`Kanban de programação — ${osBucket === "escopo" ? "OS Especiais" : "Tag Especiais"}`, `<div class="k-grid">${cols}</div>`);
  };

  const printEnsaios = () => {
    const rows = ensaiosFlat.map(({ e, a, t, ef }) => `
      <tr>
        <td>${escapeHtml(a?.os_numero || "")}</td>
        <td>${escapeHtml(a?.codigo_amostra || "—")}</td>
        <td>${escapeHtml(t?.nome || "—")}</td>
        <td>${escapeHtml(EF_LABEL[ef])}</td>
        <td>${escapeHtml(PRIO_LABEL[e.prioridade])}</td>
        <td>${escapeHtml(e.prazo || "—")}</td>
        <td>${escapeHtml(a?.tomador || "—")}</td>
        <td>${escapeHtml(a?.obra || "—")}</td>
      </tr>`).join("");
    printHtml(`Todos os ensaios em programação (${ensaiosFlat.length})`,
      `<table><thead><tr>
        <th>OS</th><th>Amostra</th><th>Ensaio</th><th>Status</th><th>Prioridade</th><th>Prazo</th><th>Tomador</th><th>Obra</th>
      </tr></thead><tbody>${rows || '<tr><td colspan="8" style="text-align:center;padding:12px">Nenhum ensaio.</td></tr>'}</tbody></table>`);
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <PageHeader
        eyebrow="Programação · Operação"
        icon={PageIcon}
        title="Central de programação"
        description="Gerencie todas as OSs, amostras e ensaios em um só lugar."
        actions={
          <>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setPendentesOpen(true)}
          >
            <AlertCircle className="h-4 w-4 text-amber-600" />
            Programações Pendentes
            <Badge variant="secondary" className="ml-1">{ensaiosSemProg.length}</Badge>
          </Button>
          <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
            <TabsList>
              <TabsTrigger value="detalhe" className="gap-1.5"><List className="h-4 w-4" /> Por OS</TabsTrigger>
              <TabsTrigger value="kanban" className="gap-1.5"><LayoutGrid className="h-4 w-4" /> Kanban</TabsTrigger>
              <TabsTrigger value="ensaios" className="gap-1.5"><Rows3 className="h-4 w-4" /> Todos os ensaios</TabsTrigger>
              {canPlanilha && (
                <TabsTrigger value="planilha" className="gap-1.5"><SheetIcon className="h-4 w-4" /> Planilha (Gantt)</TabsTrigger>
              )}
            </TabsList>
          </Tabs>
          </>
        }
      />

      {/* Seletor de bucket: OS Especiais (por escopo) vs Tag Especiais (por setor) */}
      <Tabs value={osBucket} onValueChange={(v) => setOsBucket(v as typeof osBucket)}>
        <TabsList>
          <TabsTrigger value="escopo" className="gap-1.5">
            OS Especiais
            <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
              {bucketCounts.escopo}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="tag" className="gap-1.5">
            Tag Especiais
            <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
              {bucketCounts.tag}
            </Badge>
          </TabsTrigger>
        </TabsList>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {osBucket === "escopo"
            ? "OSs com escopo Cisalhamento, Triaxiais Mec. Solos ou Adensamento."
            : "OSs com setor marcado como Especiais (podem ainda não ter escopo definido)."}
        </p>
      </Tabs>

      {/* ============= VISÃO KANBAN ============= */}
      {view === "kanban" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar OS, amostra, ensaio, tomador..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="max-w-sm"
            />
            <span className="ml-auto text-xs text-muted-foreground">
              {kanbanCards.length} ensaio(s)
            </span>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={printKanban}>
              <Printer className="h-3.5 w-3.5" /> Imprimir Kanban
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {KANBAN_COLS.map((st) => {
              const items = kanbanByStatus[st];
              const tone = EF_KANBAN[st];
              const canDrop =
                dragCard != null && allowedTargets(dragCard.from).includes(st);
              const isOver = dragOverCol === st && canDrop;
              return (
                <div
                  key={st}
                  className={`rounded-lg border-2 p-2.5 overflow-hidden relative ${tone.col}`}
                  onDragOver={(ev) => {
                    if (!dragCard) return;
                    if (!allowedTargets(dragCard.from).includes(st)) return;
                    ev.preventDefault();
                    ev.dataTransfer.dropEffect = "move";
                    if (dragOverCol !== st) setDragOverCol(st);
                  }}
                  onDragLeave={() => {
                    if (dragOverCol === st) setDragOverCol(null);
                  }}
                  onDrop={(ev) => {
                    ev.preventDefault();
                    setDragOverCol(null);
                    if (!dragCard) return;
                    const card = kanbanCards.find((c) => c.e.id === dragCard.ensaioId);
                    const prog = card?.p ?? null;
                    const tr = kanbanTransition(dragCard.from, st, prog);
                    setDragCard(null);
                    if (!tr || !prog) return;
                    patchProg.mutate({ id: prog.id, patch: tr.patch, msg: tr.msg });
                  }}
                  style={{
                    outline: isOver ? "2px dashed var(--primary)" : undefined,
                    outlineOffset: isOver ? 2 : undefined,
                    opacity: dragCard && !canDrop && dragCard.from !== st ? 0.55 : 1,
                    transition: "outline 120ms, opacity 120ms",
                  }}
                >
                  <div className={`absolute inset-x-0 top-0 h-1 ${tone.bar}`} />
                  <div className="flex items-center justify-between mb-2 mt-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                      <Badge className={`${EF_COLOR[st]} h-5 text-[10px]`}>{EF_LABEL[st]}</Badge>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
                  </div>
                  <div className="space-y-1.5 max-h-[70vh] overflow-y-auto">
                    {items.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic px-1 py-2">
                        {isOver ? "Solte aqui" : "Nenhum"}
                      </p>
                    ) : items.map(({ e, a, t, p }) => {
                      const draggable = allowedTargets(st).length > 0 && !!p;
                      // Badge de tempo até o prazo (T-Xd / hoje / atrasado)
                      const prazoIso = e.prazo || p?.data_fim || null;
                      let prazoBadge: { label: string; cls: string } | null = null;
                      if (prazoIso && st !== "concluido") {
                        const dias = Math.round(
                          (new Date(prazoIso + "T00:00:00").getTime() -
                            new Date(todayIso + "T00:00:00").getTime()) /
                            86_400_000,
                        );
                        if (dias < 0) {
                          prazoBadge = {
                            label: `Atrasado ${Math.abs(dias)}d`,
                            cls: "bg-[color-mix(in_oklch,var(--status-atrasado)_18%,transparent)] text-[color:var(--status-atrasado)] border-[color-mix(in_oklch,var(--status-atrasado)_35%,transparent)]",
                          };
                        } else if (dias === 0) {
                          prazoBadge = {
                            label: "Hoje",
                            cls: "bg-[color-mix(in_oklch,var(--status-execucao)_18%,transparent)] text-[color:var(--status-execucao)] border-[color-mix(in_oklch,var(--status-execucao)_35%,transparent)]",
                          };
                        } else if (dias <= 3) {
                          prazoBadge = {
                            label: `T-${dias}d`,
                            cls: "bg-[color-mix(in_oklch,var(--status-execucao)_14%,transparent)] text-[color:var(--status-execucao)] border-[color-mix(in_oklch,var(--status-execucao)_30%,transparent)]",
                          };
                        } else if (dias <= 7) {
                          prazoBadge = {
                            label: `T-${dias}d`,
                            cls: "bg-[color-mix(in_oklch,var(--status-programado)_14%,transparent)] text-[color:var(--status-programado)] border-[color-mix(in_oklch,var(--status-programado)_30%,transparent)]",
                          };
                        } else {
                          prazoBadge = {
                            label: `T-${dias}d`,
                            cls: "bg-muted text-muted-foreground border-border",
                          };
                        }
                      }
                      const isDragging = dragCard?.ensaioId === e.id;
                      return (
                      <button
                        key={e.id}
                        draggable={draggable}
                        onDragStart={(ev) => {
                          if (!draggable) return;
                          setDragCard({ ensaioId: e.id, from: st });
                          ev.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDragCard(null);
                          setDragOverCol(null);
                        }}
                        onClick={() => {
                          if (a) { setOsSelecionada(a.os_numero); setView("detalhe"); }
                        }}
                        className={`w-full text-left rounded-lg border bg-card p-2 shadow-sm transition-all hover:scale-[1.02] hover:shadow-md active:cursor-grabbing group ${tone.card}`}
                        style={{
                          cursor: draggable ? "grab" : "pointer",
                          opacity: isDragging ? 0.4 : 1,
                        }}
                        title={draggable ? "Arraste para mover de coluna, ou clique para abrir" : "Clique para abrir"}
                      >
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">OS {a?.os_numero}</span>
                              {prazoBadge && (
                                <span className={`inline-flex items-center rounded border px-1 h-4 text-[9px] font-semibold tabular-nums ${prazoBadge.cls}`}>
                                  {prazoBadge.label}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {a?.codigo_amostra && (
                                <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-medium border-primary/20">{a.codigo_amostra}</Badge>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1.5 min-w-0">
                            {t?.cor_gantt && (
                              <span className="h-2.5 w-2.5 rounded-sm shrink-0 shadow-inner" style={{ background: t.cor_gantt }} />
                            )}
                            <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 border-primary/10 bg-primary/5 text-primary-foreground/80 dark:text-primary/90 font-medium truncate max-w-[140px]">
                              {t?.nome || "—"}
                            </Badge>
                          </div>

                          {a?.tomador && (
                            <div className="text-[9px] text-muted-foreground truncate border-t border-border/50 pt-1 mt-0.5">
                              {a.tomador}
                            </div>
                          )}
                        </div>
                      </button>
                      );

                    })}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Legenda de arraste */}
          <div className="text-[11px] text-muted-foreground pt-1 flex flex-wrap gap-x-4 gap-y-1">
            <span>Arraste os cartões entre colunas:</span>
            <span>Programado / Atrasado → <strong>Em andamento</strong> (iniciar)</span>
            <span>Em andamento ↔ <strong>Concluído</strong></span>
            <span>Em andamento → <strong>Programado</strong> (cancelar execução)</span>
          </div>
        </div>
      )}

      {/* ============= VISÃO TABELA DE ENSAIOS ============= */}
      {view === "ensaios" && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Buscar por OS, amostra, ensaio, tomador..."
                value={filtroGlobal}
                onChange={(e) => setFiltroGlobal(e.target.value)}
                className="max-w-sm"
              />
              <Select value={filtroStatusEnsaio} onValueChange={(v) => setFiltroStatusEnsaio(v as typeof filtroStatusEnsaio)}>
                <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  {Object.entries(STATUS_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filtroPrazo} onValueChange={(v) => setFiltroPrazo(v as typeof filtroPrazo)}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Qualquer prazo</SelectItem>
                  <SelectItem value="atrasado">Atrasados</SelectItem>
                  <SelectItem value="hoje">Vencem hoje</SelectItem>
                  <SelectItem value="semana">Próximos 7 dias</SelectItem>
                </SelectContent>
              </Select>
              <span className="ml-auto text-xs text-muted-foreground">{ensaiosFlat.length} ensaio(s)</span>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={printEnsaios}>
                <Printer className="h-3.5 w-3.5" /> Imprimir lista
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OS</TableHead>
                  <TableHead>Amostra</TableHead>
                  <TableHead>Ensaio</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Tomador</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ensaiosFlat.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">Nenhum ensaio encontrado.</TableCell></TableRow>
                ) : ensaiosFlat.map(({ e, a, t, ef }) => (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer"
                    onClick={() => {
                      if (a) { setOsSelecionada(a.os_numero); setView("detalhe"); }
                    }}
                  >
                    <TableCell className="font-medium">{a?.os_numero}</TableCell>
                    <TableCell>{a?.codigo_amostra || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {t?.cor_gantt && <span className="h-3 w-3 rounded-sm" style={{ background: t.cor_gantt }} />}
                        {t?.nome || "—"}
                      </div>
                    </TableCell>
                    <TableCell><Badge className={EF_COLOR[ef]}>{EF_LABEL[ef]}</Badge></TableCell>
                    <TableCell><Badge className={PRIO_COLOR[e.prioridade]}>{PRIO_LABEL[e.prioridade]}</Badge></TableCell>
                    <TableCell className="text-sm">{e.prazo || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">{a?.tomador || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ============= VISÃO PLANILHA (EDITÁVEL — ESTILO GANTT / MS PROJECT) ============= */}
      {view === "planilha" && canPlanilha && (
        <PlanilhaProjectView
          ensaiosFlat={ensaiosFlat}
          progByEnsaio={progByEnsaio}
          programacoes={programacoes}
          equipamentos={equipamentos}
          equipById={equipById}
          tipos={tipos}
          filtroGlobal={filtroGlobal}
          setFiltroGlobal={setFiltroGlobal}
          savePatch={(id, patch, msg) => patchProg.mutate({ id, patch, msg: msg ?? "Programação atualizada" })}
          createProg={(row) => createProg.mutate(row)}
          fmtBr={fmtBr}
          computeAtraso={computeAtraso}
        />
      )}

      {/* ============= VISÃO POR OS (LISTA + DETALHE) ============= */}
      {view === "detalhe" && (
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="h-fit lg:sticky lg:top-4">
          <CardHeader className="pb-2 space-y-2">
            <CardTitle className="text-sm">OSs ({osList.length})</CardTitle>
            <Input
              placeholder="Buscar OS..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-8 text-xs"
            />
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[70vh] overflow-y-auto">
              {osListSorted.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">Nenhuma OS.</p>
              ) : osListSorted.map((o) => {
                const s = osStatusMap.get(o.os);
                const active = o.os === osSelecionada;
                const sch = osScheduleIndex.get(o.os);
                const setores = sch ? Array.from(sch.setores).join(" / ") : "";
                const escopos = sch ? Array.from(sch.escopos).join(" / ") : "";
                const deadlineIso = osDeadlines.get(o.os) || null;
                let daysToDeadline: number | null = null;
                if (deadlineIso) {
                  daysToDeadline = Math.ceil(
                    (new Date(deadlineIso + "T00:00:00").getTime() -
                      new Date(todayIso + "T00:00:00").getTime()) /
                      86400000,
                  );
                }
                const pendentes = s?.pendentes ?? 0;
                // Urgência: vermelha se atrasado ou ≤5d com pendentes; âmbar se ≤10d com pendentes
                let urgencyBorder = "border-l-transparent";
                let deadlinePill: { label: string; cls: string } | null = null;
                if (daysToDeadline !== null && s?.status !== "concluida") {
                  if (daysToDeadline < 0) {
                    urgencyBorder = "border-l-red-500";
                    deadlinePill = { label: `Atrasado ${Math.abs(daysToDeadline)}d`, cls: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30" };
                  } else if (daysToDeadline === 0) {
                    urgencyBorder = "border-l-red-500";
                    deadlinePill = { label: "Hoje", cls: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30" };
                  } else if (daysToDeadline <= 5) {
                    urgencyBorder = pendentes > 0 ? "border-l-red-500" : "border-l-amber-500";
                    deadlinePill = { label: `T-${daysToDeadline}d`, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" };
                  } else if (daysToDeadline <= 10) {
                    urgencyBorder = "border-l-amber-500/60";
                    deadlinePill = { label: `T-${daysToDeadline}d`, cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20" };
                  } else {
                    deadlinePill = { label: `T-${daysToDeadline}d`, cls: "bg-muted text-muted-foreground border-border" };
                  }
                }
                return (
                  <div
                    key={o.os}
                    className={`border-b border-l-2 ${urgencyBorder} px-3 py-2 hover:bg-accent transition ${active ? "bg-accent" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <button
                        onClick={() => setOsSelecionada(o.os)}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${OS_STATUS_DOT[s?.status ?? "aguardando"]}`} />
                          <span className="font-semibold text-sm truncate">OS {o.os}</span>
                          <div className="ml-auto flex items-center gap-1 shrink-0">
                            {pendentes > 0 && (
                              <Badge
                                className="text-[10px] h-4 px-1.5 bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500/30 hover:bg-red-500/15"
                                title={`${pendentes} ensaio(s) sem programação`}
                              >
                                {pendentes} pend
                              </Badge>
                            )}
                            {o.qtdAmostras > 0 && (
                              <Badge variant="secondary" className="text-[10px] h-4 px-1.5" title="Amostras">
                                {o.qtdAmostras}
                              </Badge>
                            )}
                          </div>
                        </div>
                         <div className="truncate text-[11px] text-muted-foreground pl-4">{o.tomador || "Sem tomador"}</div>
                         {deadlineIso && (
                           <div className="pl-4 pt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                             <span>
                               Prazo{" "}
                               <span className="font-medium text-foreground/80">
                                 {new Date(deadlineIso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                               </span>
                             </span>
                             {deadlinePill && (
                               <span className={`inline-flex items-center rounded border px-1 h-4 text-[10px] font-semibold tabular-nums ${deadlinePill.cls}`}>
                                 {deadlinePill.label}
                               </span>
                             )}
                           </div>
                         )}
                        {sch && (setores || escopos) && (
                          <div className="pl-4 pt-1 space-y-1">
                            {setores && <SetorBadges setor={setores} size="xs" />}
                            {escopos && <EscopoBadges escopo={escopos} size="xs" />}
                          </div>
                        )}
                      </button>
                      {sch && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 shrink-0"
                          title="Ver detalhes completos"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailOs(sch.row);
                          }}
                        >
                          <Info className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {!osSelecionada ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Selecione uma OS na lista ao lado para cadastrar amostras e ensaios.
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <button
                      onClick={() => setOsCollapsed((v) => !v)}
                      className="mt-1 text-muted-foreground hover:text-foreground"
                      aria-label={osCollapsed ? "Expandir OS" : "Recolher OS"}
                    >
                      {osCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-base">OS {osSelecionada}</CardTitle>
                      <CardDescription className="truncate">
                        {osDisplayInfo.tomador || "Tomador não informado"} — {osDisplayInfo.obra || "Obra não informada"}
                      </CardDescription>
                      {(() => {
                        const sch = osScheduleIndex.get(osSelecionada);
                        if (!sch) return null;
                        const setores = Array.from(sch.setores).join(" / ");
                        const escopos = Array.from(sch.escopos).join(" / ");
                        if (!setores && !escopos) return null;
                        return (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {setores && <SetorBadges setor={setores} size="sm" />}
                            {escopos && <EscopoBadges escopo={escopos} size="sm" />}
                          </div>
                        );
                      })()}
                      {(resumoOs.amostras.length > 0 || resumoOs.ensaios.length > 0) && (
                        <div className="mt-2 space-y-1 text-[11px]">
                          {resumoOs.amostras.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="text-muted-foreground font-medium">Amostras:</span>
                              {resumoOs.amostras.map(([k, n]) => (
                                <Badge key={`a-${k}`} variant="secondary" className="h-5 px-1.5 text-[11px] font-mono">
                                  {n}{k}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {resumoOs.ensaios.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="text-muted-foreground font-medium">Ensaios Laboratório:</span>
                              {resumoOs.ensaios.map(([k, n]) => (
                                <Badge key={`e-${k}`} className="h-5 px-1.5 text-[11px] font-mono bg-primary/15 text-primary hover:bg-primary/20">
                                  {n}{k}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <Dialog
                    open={amostraOpen}
                    onOpenChange={(o) => {
                      setAmostraOpen(o);
                      if (!o) setAmostraEdit(null);
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                      <div className="flex items-center gap-1.5 p-1 rounded-md border bg-muted/30">
                        <Label className="text-[10px] font-bold text-muted-foreground uppercase shrink-0">Início OS {osSelecionada}:</Label>
                        <Input
                          type="date"
                          value={osDeadlines.get(`start_${osSelecionada}`) ?? ""}
                          onChange={(e) => {
                            // Simulamos a persistência ou passamos para o diálogo se necessário
                            // Por agora, apenas atualizamos o cache local para refletir na UI se houver re-render
                            // Na verdade, o ideal é que o BulkDialog gerencie isso, mas aqui damos visibilidade.
                          }}
                          className="h-7 w-32 text-[10px] px-1 focus-visible:ring-primary"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDetalhesLoteOpen(true)}
                        title="Programar detalhes técnicos para várias amostras de uma vez"
                      >
                        <FlaskConical className="h-4 w-4" /> Programar detalhes
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setImportOpen(true)}
                      >
                        <Upload className="h-4 w-4" /> Importar CSV/XLSX
                      </Button>
                      <DialogTrigger asChild>
                        <Button size="sm">
                          <Plus className="h-4 w-4" /> Nova amostra
                        </Button>
                      </DialogTrigger>
                    </div>
                    <AmostraForm
                      key={amostraEdit?.id ?? "new"}
                      amostra={amostraEdit}
                      osNumero={osSelecionada}
                      tomador={osDisplayInfo.tomador}
                      obra={osDisplayInfo.obra}
                      loading={upsertAmostra.isPending}
                      onSubmit={(row) =>
                        upsertAmostra.mutate(
                          { id: amostraEdit?.id, row },
                          {
                            onSuccess: () => {
                              setAmostraOpen(false);
                              setAmostraEdit(null);
                            },
                          },
                        )
                      }
                    />
                  </Dialog>
                </CardHeader>
                {!osCollapsed && <CardContent>
                  {amostrasDaOs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma amostra cadastrada para esta OS.
                    </p>
                  ) : (
                    <>
                      {/* Filtros */}
                      <div className="flex flex-wrap items-center gap-2 pb-2 border-b mb-2">
                        <Input
                          placeholder="Buscar amostra..."
                          value={filtroBusca}
                          onChange={(e) => setFiltroBusca(e.target.value)}
                          className="h-7 w-52 text-xs"
                        />
                        {tiposDisponiveis.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Tipo:</span>
                            {tiposDisponiveis.map((t) => {
                              const active = filtroTipos.has(t);
                              return (
                                <button
                                  key={t}
                                  onClick={() =>
                                    setFiltroTipos((prev) => {
                                      const next = new Set(prev);
                                      active ? next.delete(t) : next.add(t);
                                      return next;
                                    })
                                  }
                                  className={`text-[11px] rounded border px-1.5 py-0 leading-5 transition ${
                                    active
                                      ? "bg-sky-500/20 border-sky-500 text-foreground"
                                      : "bg-muted hover:bg-accent"
                                  }`}
                                >
                                  {t}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {ensaiosDisponiveis.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Ensaio:</span>
                            {ensaiosDisponiveis.map((t) => {
                              const active = filtroEnsaios.has(t);
                              return (
                                <button
                                  key={t}
                                  onClick={() =>
                                    setFiltroEnsaios((prev) => {
                                      const next = new Set(prev);
                                      active ? next.delete(t) : next.add(t);
                                      return next;
                                    })
                                  }
                                  className={`text-[11px] rounded border px-1.5 py-0 leading-5 transition ${
                                    active
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "bg-muted hover:bg-accent"
                                  }`}
                                >
                                  {t}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {(filtroTipos.size > 0 || filtroEnsaios.size > 0 || filtroBusca) && (
                          <button
                            onClick={() => {
                              setFiltroTipos(new Set());
                              setFiltroEnsaios(new Set());
                              setFiltroBusca("");
                            }}
                            className="text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            limpar filtros
                          </button>
                        )}
                        <span className="ml-auto text-[11px] text-muted-foreground">
                          {amostrasFiltradas.length} de {amostrasDaOs.length}
                        </span>
                      </div>
                      <div className="flex justify-end gap-2 pb-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px] px-2"
                          onClick={() => setCollapsedAmostras(new Set())}
                        >
                          Expandir todas
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[11px] px-2"
                          onClick={() => setCollapsedAmostras(new Set(amostrasDaOs.map((a) => a.id)))}
                        >
                          Recolher todas
                        </Button>
                      </div>
                      <div className="space-y-2">
                      {amostrasFiltradas.map((a) => {
                        const seus = ensaios.filter((e) => e.amostra_id === a.id);
                        const isCollapsed = collapsedAmostras.has(a.id);
                        return (
                          <div key={a.id} className="rounded-md border">
                            <div className="flex items-start justify-between gap-3 p-2">
                              <div className="flex items-start gap-2 flex-1 min-w-0">
                                <button
                                  onClick={() => toggleAmostra(a.id)}
                                  className="mt-0.5 text-muted-foreground hover:text-foreground"
                                  aria-label={isCollapsed ? "Expandir" : "Recolher"}
                                >
                                  {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </button>
                                <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <FlaskConical className="h-4 w-4 text-primary" />
                                  <span className="font-medium">
                                    {a.codigo_amostra || "Amostra sem código"}
                                  </span>
                                  <Badge className={PRIO_COLOR[a.prioridade]}>
                                    {PRIO_LABEL[a.prioridade]}
                                  </Badge>
                                  <Badge variant="secondary" className="text-[10px] h-4 px-1">
                                    {seus.length} ensaio(s)
                                  </Badge>
                                </div>
                                {!isCollapsed && a.descricao && (
                                  <p className="mt-1 text-xs text-muted-foreground">{a.descricao}</p>
                                )}
                                {!isCollapsed && a.data_recebimento && (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    Recebida em {a.data_recebimento}
                                  </p>
                                )}
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEnsaioAmostraId(a.id);
                                    setEnsaioEdit(null);
                                    setEnsaioOpen(true);
                                  }}
                                >
                                  <Plus className="h-3 w-3" /> Ensaio
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    setAmostraEdit(a);
                                    setAmostraOpen(true);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    if (
                                      confirm(
                                        `Remover amostra ${a.codigo_amostra || ""}? Isso remove também ${seus.length} ensaio(s).`,
                                      )
                                    )
                                      delAmostra.mutate(a.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            {!isCollapsed && seus.length > 0 && (
                              <Table className="border-t">
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Ensaio</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Previsto</TableHead>
                                    <TableHead>Real</TableHead>
                                    <TableHead>Atraso</TableHead>
                                    <TableHead className="w-20" />
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {seus.map((en) => {
                                    const t = tipoById.get(en.tipo_ensaio_id);
                                    const p = progByEnsaio.get(en.id);
                                    const obsTxt =
                                      en.observacoes || p?.observacoes || en.detalhes_tecnicos || "";
                                    const fimPrev = p?.data_inicio_prevista
                                      ? p.data_fim ||
                                        endIsoFromDur(
                                          p.data_inicio_prevista,
                                          p.duracao_dias,
                                          p.incluir_fds,
                                        )
                                      : null;
                                    const atraso = p ? computeAtraso(p) : { dias: null, tipo: null };
                                    return (
                                      <TableRow key={en.id}>
                                        <TableCell>
                                          <div className="flex items-center gap-2">
                                            {t?.cor_gantt && (
                                              <span
                                                className="h-3 w-3 rounded-sm"
                                                style={{ background: t.cor_gantt }}
                                              />
                                            )}
                                            {t?.nome || "Tipo removido"}
                                            {obsTxt && (
                                              <Badge
                                                variant="secondary"
                                                className="h-4 text-[9px] px-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                                title={obsTxt}
                                              >
                                                ✓ obs
                                              </Badge>
                                            )}
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          {(() => {
                                            const ef = effStatus(en);
                                            return (
                                              <Badge className={EF_COLOR[ef]}>{EF_LABEL[ef]}</Badge>
                                            );
                                          })()}
                                        </TableCell>
                                        <TableCell className="text-xs whitespace-nowrap">
                                          {p?.data_inicio_prevista ? (
                                            <span>
                                              {fmtBr(p.data_inicio_prevista)} → {fmtBr(fimPrev)}
                                              <span className="text-muted-foreground ml-1">
                                                ({fmtDur(p.duracao_dias)}d)
                                              </span>
                                            </span>
                                          ) : (
                                            <span className="text-muted-foreground">
                                              {en.prazo ? `prazo ${fmtBr(en.prazo)}` : "—"}
                                            </span>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-xs whitespace-nowrap">
                                          {p?.data_inicio_real ? (
                                            <span>
                                              {fmtBr(p.data_inicio_real)} →{" "}
                                              {p.data_fim_real ? fmtBr(p.data_fim_real) : (
                                                <span className="text-violet-600 dark:text-violet-300">em curso</span>
                                              )}
                                            </span>
                                          ) : (
                                            <span className="text-muted-foreground">—</span>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-xs whitespace-nowrap">
                                          {atraso.dias === null ? (
                                            <span className="text-muted-foreground">—</span>
                                          ) : atraso.dias === 0 ? (
                                            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                              no prazo
                                            </Badge>
                                          ) : atraso.dias < 0 ? (
                                            <Badge
                                              className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                              title={
                                                atraso.tipo === "fim"
                                                  ? "Conclusão adiantada em dias"
                                                  : "Início adiantado em dias"
                                              }
                                            >
                                              {atraso.dias}d
                                            </Badge>
                                          ) : (
                                            <Badge
                                              className="bg-red-500/15 text-red-700 dark:text-red-300"
                                              title={
                                                atraso.tipo === "fim"
                                                  ? "Concluído com atraso"
                                                  : atraso.tipo === "inicio"
                                                  ? "Início real após o previsto"
                                                  : "Não iniciado — dias após início previsto"
                                              }
                                            >
                                              +{atraso.dias}d
                                            </Badge>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            title="Ver detalhes"
                                            onClick={() => setDetalhesEnsaio({ ensaio: en, amostra: a })}
                                          >
                                            <Eye className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => {
                                              setEnsaioAmostraId(a.id);
                                              setEnsaioEdit(en);
                                              setEnsaioOpen(true);
                                            }}
                                          >
                                            <Pencil className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => {
                                              if (confirm("Remover ensaio?"))
                                                delEnsaio.mutate(en.id);
                                            }}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                        );
                      })}
                      </div>
                    </>
                  )}
                </CardContent>}
              </Card>
            </>
          )}

          {/* Ensaios sem programação */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                Ensaios pendentes desta OS
                <Badge variant="secondary">
                  {ensaiosSemProg.filter((e) => {
                    const a = amostras.find((x) => x.id === e.amostra_id);
                    return a?.os_numero === osSelecionada;
                  }).length}
                </Badge>
              </CardTitle>
              <CardDescription>
                Ensaios cadastrados desta OS que ainda não foram programados no Gantt.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const pendentesDaOs = ensaiosSemProg.filter((e) => {
                  const a = amostras.find((x) => x.id === e.amostra_id);
                  return a?.os_numero === osSelecionada;
                });
                if (pendentesDaOs.length === 0) {
                  return (
                <p className="text-sm text-muted-foreground">Nenhum pendente. Tudo programado. ✅</p>
                  );
                }
                return (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Amostra</TableHead>
                      <TableHead>Ensaio</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Prazo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendentesDaOs.map((en) => {
                      const a = amostras.find((x) => x.id === en.amostra_id);
                      const t = tipoById.get(en.tipo_ensaio_id);
                      return (
                        <TableRow key={en.id}>
                          <TableCell>{a?.codigo_amostra ?? "—"}</TableCell>
                          <TableCell>{t?.nome ?? "—"}</TableCell>
                          <TableCell>
                            {(() => {
                              const ef = effStatus(en);
                              return <Badge className={EF_COLOR[ef]}>{EF_LABEL[ef]}</Badge>;
                            })()}
                          </TableCell>
                          <TableCell className="text-sm">{en.prazo || "—"}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                );
              })()}
            </CardContent>
          </Card>
      </div>
      </div>
      )}

      {/* Ensaio dialog */}
      <Dialog
        open={ensaioOpen}
        onOpenChange={(o) => {
          setEnsaioOpen(o);
          if (!o) {
            setEnsaioEdit(null);
            setEnsaioAmostraId(null);
          }
        }}
      >
        {ensaioAmostraId && (
          <EnsaioForm
            key={ensaioEdit?.id ?? "new"}
            ensaio={ensaioEdit}
            amostraId={ensaioAmostraId}
            tipos={tipos}
            loading={upsertEnsaio.isPending}
            onSubmit={(row) =>
              upsertEnsaio.mutate(
                { id: ensaioEdit?.id, row },
                {
                  onSuccess: () => {
                    setEnsaioOpen(false);
                    setEnsaioEdit(null);
                    setEnsaioAmostraId(null);
                  },
                },
              )
            }
          />
        )}
      </Dialog>

      {osSelecionada && (
        <ImportEnsaiosDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          osNumero={osSelecionada}
          tomador={osDisplayInfo.tomador}
          obra={osDisplayInfo.obra}
          tipos={tipos}
        />
      )}
      <OsFullDetailsDialog
        row={detailOs}
        open={!!detailOs}
        onOpenChange={(o) => !o && setDetailOs(null)}
        hideRegistrar
        extraSection={(() => {
          if (!detailOs?.os) return null;
          const programados = new Set(programacoes.map((p) => p.ensaio_id));
          const amostrasOs = amostras.filter((a) => a.os_numero === detailOs.os);
          const linhas = amostrasOs.flatMap((a) =>
            ensaios
              .filter((e) => e.amostra_id === a.id)
              .map((e) => ({ a, e, t: tipoById.get(e.tipo_ensaio_id) })),
          );
          const programadosLinhas = linhas.filter(
            ({ e }) => programados.has(e.id) || e.status === "programado" || e.status === "em_execucao" || e.status === "concluido",
          );
          const pendentesLinhas = linhas.filter(
            ({ e }) => !programados.has(e.id) && e.status !== "cancelado" && e.status !== "concluido" && e.status !== "programado" && e.status !== "em_execucao",
          );
          const renderTable = (rows: typeof linhas) => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8">Amostra</TableHead>
                  <TableHead className="h-8">Ensaio</TableHead>
                  <TableHead className="h-8">Status</TableHead>
                  <TableHead className="h-8">Prioridade</TableHead>
                  <TableHead className="h-8">Prazo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ a, e, t }) => (
                  <TableRow key={e.id}>
                    <TableCell className="py-1.5 text-xs">{a.codigo_amostra || "—"}</TableCell>
                    <TableCell className="py-1.5 text-xs">
                      <div className="flex items-center gap-1.5">
                        {t?.cor_gantt && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: t.cor_gantt }} />}
                        {t?.nome || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="py-1.5">{(() => {
                      const ef = effStatus(e);
                      return <Badge className={`${EF_COLOR[ef]} h-5`}>{EF_LABEL[ef]}</Badge>;
                    })()}</TableCell>
                    <TableCell className="py-1.5"><Badge className={`${PRIO_COLOR[e.prioridade]} h-5`}>{PRIO_LABEL[e.prioridade]}</Badge></TableCell>
                    <TableCell className="py-1.5 text-xs">{e.prazo || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          );
          return (
            <section className="space-y-4">
              <div>
                <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2 inline-flex items-center gap-1.5">
                  <FlaskConical className="h-3.5 w-3.5" />
                  Ensaios programados ({programadosLinhas.length})
                </h2>
                {programadosLinhas.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhum ensaio programado para esta OS.</p>
                ) : renderTable(programadosLinhas)}
              </div>
              <div>
                <h2 className="text-xs uppercase tracking-wider text-muted-foreground mb-2 inline-flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                  Ensaios pendentes ({pendentesLinhas.length})
                </h2>
                {pendentesLinhas.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhum ensaio pendente.</p>
                ) : renderTable(pendentesLinhas)}
              </div>
            </section>
          );
        })()}
      />
      {/* Programações Pendentes — modo dinâmico com cascata em lote */}
      <BulkProgramarDialog
        open={pendentesOpen}
        onOpenChange={setPendentesOpen}
        amostras={amostras.map((a) => ({
          id: a.id,
          os_numero: a.os_numero,
          codigo_amostra: a.codigo_amostra,
          tomador: a.tomador || osInfoIndex.get(a.os_numero)?.tomador || null,
        }))}
        ensaios={ensaios}
        tipos={tipos}
        equipamentos={equipamentos}
        programacoes={programacoes}
        osDeadlines={osDeadlines}
        osTomadores={
          new Map(
            Array.from(osInfoIndex.entries()).map(([os, v]) => [os, v.tomador]),
          )
        }
      />
      {osSelecionada && (
        <ProgramarDetalhesDialog
          open={detalhesLoteOpen}
          onOpenChange={setDetalhesLoteOpen}
          os={osSelecionada}
          amostras={amostrasDaOs}
          ensaios={ensaios}
          tipos={tipos}
          ensaiosSheet={SHEET_ENSAIOS}
          programacoes={programacoes}
          progsSheet={SHEET_PROGS}
        />
      )}
      <EnsaioDetalhesDialog
        open={!!detalhesEnsaio}
        onOpenChange={(v) => !v && setDetalhesEnsaio(null)}
        ensaio={detalhesEnsaio?.ensaio ?? null}
        amostra={
          detalhesEnsaio
            ? (() => {
                const a = detalhesEnsaio.amostra;
                const c = cadastro.find((x) => x.os === a.os_numero);
                const info = osInfoIndex.get(a.os_numero);
                const sch = scheduleData?.rows?.find((x) => x.os === a.os_numero);
                const ent = entreguesData?.rows?.find((x) => x.os === a.os_numero);
                return {
                  ...a,
                  tomador: a.tomador || c?.tomador || info?.tomador || sch?.tomador || ent?.tomador || null,
                  obra: a.obra || c?.obra || info?.obra || null,
                };
              })()
            : null
        }
        tipo={detalhesEnsaio ? tipoById.get(detalhesEnsaio.ensaio.tipo_ensaio_id) ?? null : null}
        programacao={detalhesEnsaio ? progByEnsaio.get(detalhesEnsaio.ensaio.id) ?? null : null}
        equipamento={
          detalhesEnsaio
            ? equipById.get(progByEnsaio.get(detalhesEnsaio.ensaio.id)?.equipamento_id ?? "") ?? null
            : null
        }
        efStatus={detalhesEnsaio ? effStatus(detalhesEnsaio.ensaio) : null}
        atraso={detalhesEnsaio && progByEnsaio.get(detalhesEnsaio.ensaio.id) ? computeAtraso(progByEnsaio.get(detalhesEnsaio.ensaio.id)!) : { dias: null, tipo: null }}
        fmtBr={fmtBr}
        addDaysIso={addDaysIso}
        diffDays={diffDays}
      />
    </div>
  );
}

/* ---------------------- Dialog: Detalhes do Ensaio ---------------------- */
function EnsaioDetalhesDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ensaio: Ensaio | null;
  amostra: Amostra | null;
  tipo: TipoEnsaio | null;
  programacao: Programacao | null;
  equipamento: { id: string; nome: string; codigo?: string } | null;
  efStatus: EfStatus | null;
  atraso: { dias: number | null; tipo: "inicio" | "fim" | "aberto" | null };
  fmtBr: (s: string | null | undefined) => string;
  addDaysIso: (iso: string, days: number) => string;
  diffDays: (a: string, b: string) => number;
}) {
  const { open, onOpenChange, ensaio, amostra, tipo, programacao: p, equipamento, efStatus: ef, atraso, fmtBr, addDaysIso, diffDays } = props;
  if (!ensaio || !amostra) return null;
  const fimPrev = p?.data_inicio_prevista
    ? p.data_fim || endIsoFromDur(p.data_inicio_prevista, p.duracao_dias, p.incluir_fds)
    : null;
  const duracaoRealTxt = formatDurReal(
    p?.data_inicio_real,
    p?.data_fim_real,
    p?.inicio_real_ts,
    p?.fim_real_ts,
  );
  const obs = ensaio.observacoes || p?.observacoes || ensaio.detalhes_tecnicos || "";
  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value ?? <span className="text-muted-foreground">—</span>}</div>
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tipo?.cor_gantt && <span className="h-3 w-3 rounded-sm" style={{ background: tipo.cor_gantt }} />}
            {tipo?.nome || "Ensaio"} — {amostra.codigo_amostra || "amostra"}
            {ef && <Badge className={EF_COLOR[ef]}>{EF_LABEL[ef]}</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="OS" value={amostra.os_numero} />
          <Field label="Amostra" value={amostra.codigo_amostra} />
          <Field label="Tipo" value={amostra.tipo} />
          <Field label="Tomador" value={amostra.tomador} />
          <Field label="Obra" value={amostra.obra} />
          <Field label="Prioridade" value={PRIO_LABEL[amostra.prioridade]} />
        </div>

        <div className="rounded-md border p-3 space-y-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Programação</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Equipamento" value={equipamento ? `${equipamento.codigo ? equipamento.codigo + " — " : ""}${equipamento.nome}` : null} />
            <Field label="Executor" value={p?.tecnico} />
            <Field label="Prazo (ensaio)" value={ensaio.prazo ? fmtBr(ensaio.prazo) : null} />
            <Field
              label="Início previsto"
              value={p?.data_inicio_prevista ? fmtBr(p.data_inicio_prevista) : null}
            />
            <Field label="Fim previsto" value={fimPrev ? fmtBr(fimPrev) : null} />
            <Field label="Duração prevista" value={p ? `${fmtDur(p.duracao_dias)} dia(s)` : null} />
            <Field label="Início real" value={p?.data_inicio_real ? fmtBr(p.data_inicio_real) : null} />
            <Field
              label="Fim real"
              value={
                p?.data_fim_real
                  ? fmtBr(p.data_fim_real)
                  : p?.data_inicio_real
                  ? <span className="text-violet-600 dark:text-violet-300">em curso</span>
                  : null
              }
            />
            <Field label="Duração real" value={duracaoRealTxt} />
            <Field
              label="Atraso"
              value={
                atraso.dias === null ? null : atraso.dias === 0 ? (
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">no prazo</Badge>
                ) : atraso.dias < 0 ? (
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">{atraso.dias}d (adiantado)</Badge>
                ) : (
                  <Badge className="bg-red-500/15 text-red-700 dark:text-red-300">+{atraso.dias}d</Badge>
                )
              }
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Observações / Detalhes técnicos</div>
          <div className="rounded-md border p-3 text-sm whitespace-pre-wrap min-h-[64px]">
            {obs || <span className="text-muted-foreground">—</span>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Formulários ------------------------------ */
function AmostraForm({
  amostra,
  osNumero,
  tomador,
  obra,
  onSubmit,
  loading,
}: {
  amostra: Amostra | null;
  osNumero: string;
  tomador: string;
  obra: string;
  onSubmit: (row: Partial<Amostra>) => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<Partial<Amostra>>(
    amostra ?? { os_numero: osNumero, tomador, obra, prioridade: "media" },
  );
  const set = <K extends keyof Amostra>(k: K, v: Amostra[K] | null) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{amostra ? "Editar amostra" : `Nova amostra — OS ${osNumero}`}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Código da amostra</Label>
          <Input
            value={form.codigo_amostra ?? ""}
            onChange={(e) => set("codigo_amostra", e.target.value || null)}
          />
        </div>
        <div>
          <Label>Data de recebimento</Label>
          <Input
            type="date"
            value={form.data_recebimento ?? ""}
            onChange={(e) => set("data_recebimento", e.target.value || null)}
          />
        </div>
        <div className="col-span-2">
          <Label>Descrição</Label>
          <Input
            value={form.descricao ?? ""}
            onChange={(e) => set("descricao", e.target.value || null)}
          />
        </div>
        <div>
          <Label>Tomador</Label>
          <Input
            value={form.tomador ?? ""}
            onChange={(e) => set("tomador", e.target.value || null)}
          />
        </div>
        <div>
          <Label>Obra</Label>
          <Input
            value={form.obra ?? ""}
            onChange={(e) => set("obra", e.target.value || null)}
          />
        </div>
        <div>
          <Label>Prioridade</Label>
          <Select
            value={form.prioridade ?? "media"}
            onValueChange={(v) => set("prioridade", v as Amostra["prioridade"])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PRIO_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label>Observações</Label>
          <Textarea
            value={form.observacoes ?? ""}
            onChange={(e) => set("observacoes", e.target.value || null)}
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={loading}
          onClick={() => onSubmit({ ...form, os_numero: osNumero })}
        >
          {loading ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ============================================================
   Planilha estilo MS Project — agrupa por equipamento, mini-Gantt,
   somente ensaios NÃO concluídos. Pendentes de programação abaixo.
   ============================================================ */
type Equip = { id: string; nome: string };
type EnsaioFlatRow = {
  e: Ensaio;
  a: Amostra | undefined;
  t: TipoEnsaio | undefined;
  ef: EfStatus;
};

function PlanilhaProjectView({
  ensaiosFlat,
  progByEnsaio,
  programacoes,
  equipamentos,
  equipById,
  tipos,
  filtroGlobal,
  setFiltroGlobal,
  savePatch,
  createProg,
  fmtBr,
  computeAtraso,
}: {
  ensaiosFlat: EnsaioFlatRow[];
  progByEnsaio: Map<string, Programacao>;
  programacoes: Programacao[];
  equipamentos: Equip[];
  equipById: Map<string, Equip>;
  tipos: TipoEnsaioFull[];
  filtroGlobal: string;
  setFiltroGlobal: (v: string) => void;
  savePatch: (id: string, patch: Record<string, unknown>, msg?: string) => void;
  createProg: (row: Record<string, unknown>) => void;
  fmtBr: (s: string | null | undefined) => string;
  computeAtraso: (p: Programacao) => { dias: number | null; tipo: "inicio" | "fim" | "aberto" | null };
}) {
  const [subTab, setSubTab] = useState<"ativos" | "concluidos">("ativos");
  const [quickProg, setQuickProg] = useState<EnsaioFlatRow | null>(null);

  // Linhas com programação — separadas em ativas e concluídas
  const withProg = useMemo(() => {
    return ensaiosFlat
      .map((r) => ({ ...r, p: progByEnsaio.get(r.e.id) || null }))
      .filter((r): r is EnsaioFlatRow & { p: Programacao } => !!r.p);
  }, [ensaiosFlat, progByEnsaio]);

  const programadas = useMemo(
    () => withProg.filter((r) => r.p.status !== "concluido" && r.e.status !== "concluido" && r.e.status !== "cancelado"),
    [withProg],
  );
  const concluidas = useMemo(
    () => withProg.filter((r) => r.p.status === "concluido" || r.e.status === "concluido"),
    [withProg],
  );

  const pendentes = useMemo(() => {
    return ensaiosFlat.filter(
      (r) => !progByEnsaio.get(r.e.id) && r.e.status !== "concluido" && r.e.status !== "cancelado"
    );
  }, [ensaiosFlat, progByEnsaio]);

  // Grupos por equipamento
  const grupos = useMemo(() => {
    const map = new Map<string, { equip: Equip | null; rows: (EnsaioFlatRow & { p: Programacao })[] }>();
    for (const r of programadas) {
      const key = r.p.equipamento_id || "__sem__";
      const eq = r.p.equipamento_id ? equipById.get(r.p.equipamento_id) ?? null : null;
      const g = map.get(key) ?? { equip: eq, rows: [] };
      g.rows.push(r);
      map.set(key, g);
    }
    for (const g of map.values()) {
      g.rows.sort((a, b) => (a.p.data_inicio_prevista || "9999").localeCompare(b.p.data_inicio_prevista || "9999"));
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => {
      const na = a.equip?.nome || "Sem equipamento";
      const nb = b.equip?.nome || "Sem equipamento";
      return na.localeCompare(nb);
    });
  }, [programadas, equipById]);

  // Numeração global por linha (estilo MS Project) e índice p/ predecessores
  const rowNumberByProg = useMemo(() => {
    const m = new Map<string, number>();
    let n = 1;
    for (const [, g] of grupos) {
      for (const r of g.rows) {
        m.set(r.p.id, n);
        n += 1;
      }
    }
    return m;
  }, [grupos]);

  // Auto-encadear predecessores por equipamento na ordem exibida
  const autoLinkPredecessors = () => {
    let count = 0;
    for (const [, g] of grupos) {
      let prev: Programacao | null = null;
      for (const r of g.rows) {
        const desired = prev ? prev.id : "";
        const cur = r.p.predecessor_id ?? "";
        if (desired !== cur) {
          savePatch(r.p.id, { predecessor_id: desired }, "Predecessor atualizado");
          count++;
        }
        prev = r.p;
      }
    }
    if (count === 0) toast.info("Predecessores já estão encadeados.");
    else toast.success(`${count} predecessor(es) atualizado(s).`);
  };

  // Timeline
  const { days, dayPx } = useMemo(() => {
    const dayPx = 26;
    if (programadas.length === 0) return { days: [] as string[], dayPx };
    let min = "9999-99-99";
    let max = "0000-00-00";
    for (const r of programadas) {
      const s = r.p.data_inicio_prevista;
      if (!s) continue;
      const f = endIsoFromDur(s, r.p.duracao_dias, r.p.incluir_fds);
      if (s < min) min = s;
      if (f > max) max = f;
    }
    if (min === "9999-99-99") return { days: [] as string[], dayPx };
    // padding
    const start = new Date(min + "T00:00:00");
    start.setDate(start.getDate() - 2);
    const end = new Date(max + "T00:00:00");
    end.setDate(end.getDate() + 3);
    const out: string[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      out.push(`${y}-${m}-${dd}`);
    }
    return { days: out, dayPx };
  }, [programadas]);

  const dayIndex = useMemo(() => {
    const m = new Map<string, number>();
    days.forEach((d, i) => m.set(d, i));
    return m;
  }, [days]);

  const todayIso = new Date().toISOString().slice(0, 10);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setCollapsed((s) => ({ ...s, [k]: !s[k] }));

  // Filtro
  const q = filtroGlobal.trim().toLowerCase();
  const matches = (r: EnsaioFlatRow) => {
    if (!q) return true;
    return (
      (r.a?.os_numero || "").toLowerCase().includes(q) ||
      (r.a?.codigo_amostra || "").toLowerCase().includes(q) ||
      (r.a?.tomador || "").toLowerCase().includes(q) ||
      (r.a?.obra || "").toLowerCase().includes(q) ||
      (r.t?.nome || "").toLowerCase().includes(q)
    );
  };

  const barColor = (ef: EfStatus, atrasada: boolean) => {
    if (atrasada) return "hsl(0 72% 55%)";
    if (ef === "em_execucao") return "hsl(38 92% 50%)";
    if (ef === "programado") return "hsl(217 91% 60%)";
    return "hsl(215 16% 55%)";
  };

  const [LEFT_W, setLeftW] = useState<number>(() => {
    if (typeof window === "undefined") return 620;
    const v = Number(window.localStorage.getItem("planilha-leftw"));
    return Number.isFinite(v) && v >= 360 && v <= 1400 ? v : 620;
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("planilha-leftw", String(LEFT_W));
    }
  }, [LEFT_W]);
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = LEFT_W;
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(1400, Math.max(360, startW + (ev.clientX - startX)));
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
  const autoSizeLeft = () => {
    if (typeof document === "undefined") return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.font = "11px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    // Largura fixa das outras colunas da grid interna (# + cor + OS + Amostra + Início + Dur + Pred)
    const FIXED = 28 + 20 + 86 + 74 + 70 + 44 + 56;
    const GAPS = 7 * 4; // gap-1
    const PAD = 8;      // px-1 nas células
    const EXTRA = 24;   // folga p/ handle + arredondamentos
    let maxEnsaio = 0;
    for (const [, g] of grupos) {
      for (const r of g.rows) {
        const w = ctx.measureText(r.t?.nome || "—").width;
        if (w > maxEnsaio) maxEnsaio = w;
      }
      // Header do grupo (nome do equipamento) ocupa a largura toda
      const eqW = ctx.measureText(g.equip?.nome || "Sem equipamento").width + 60; // +chevron+badge
      const eqNeed = eqW - (FIXED - 0); // se maior que o resto, força ensaio maior
      if (eqNeed > maxEnsaio) maxEnsaio = eqNeed;
    }
    const needed = Math.ceil(FIXED + GAPS + PAD + maxEnsaio + EXTRA);
    const clamped = Math.min(1400, Math.max(360, needed));
    setLeftW(clamped);
  };
  const ROW_H = 26;

  // Cabeçalho de meses agrupados
  const monthHeaders = useMemo(() => {
    const groups: { key: string; label: string; span: number }[] = [];
    for (const d of days) {
      const dt = new Date(d + "T00:00:00");
      const key = `${dt.getFullYear()}-${dt.getMonth()}`;
      const label = dt.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.span += 1;
      else groups.push({ key, label, span: 1 });
    }
    return groups;
  }, [days]);

  // Coordenadas das barras para desenhar setas de predecessor (SVG overlay)
  type BarPos = { progId: string; left: number; width: number; top: number };
  const barPositions = useMemo(() => {
    const map = new Map<string, BarPos>();
    let visibleRow = 0;
    // header (mês) = 1 linha, header dias = 1 linha → cada grupo header + rows
    for (const [key, g] of grupos) {
      visibleRow += 1; // group header
      if (collapsed[key]) continue;
      for (const r of g.rows) {
        if (!matches(r)) continue;
        const startIdx = r.p.data_inicio_prevista ? dayIndex.get(r.p.data_inicio_prevista) : undefined;
        const dur = normalizeDurationDays(r.p.duracao_dias, 0.25);
        if (startIdx != null) {
          map.set(r.p.id, {
            progId: r.p.id,
            left: startIdx * dayPx,
            width: Math.max(dur, 0.25) * dayPx,
            top: visibleRow * ROW_H + ROW_H / 2,
          });
        }
        visibleRow += 1;
      }
    }
    return map;
  }, [grupos, collapsed, dayIndex, dayPx, q]);

  const totalHeight = useMemo(() => {
    let n = 0;
    for (const [key, g] of grupos) {
      n += 1;
      if (!collapsed[key]) n += g.rows.filter(matches).length;
    }
    return n * ROW_H;
  }, [grupos, collapsed, q]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-sm">Planilha (estilo MS Project)</CardTitle>
            <Tabs value={subTab} onValueChange={(v) => setSubTab(v as "ativos" | "concluidos")}>
              <TabsList className="h-8">
                <TabsTrigger value="ativos" className="text-xs">
                  Em programação ({programadas.length})
                </TabsTrigger>
                <TabsTrigger value="concluidos" className="text-xs">
                  Concluídos ({concluidas.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Input
              placeholder="Buscar por OS, amostra, ensaio, tomador..."
              value={filtroGlobal}
              onChange={(e) => setFiltroGlobal(e.target.value)}
              className="max-w-xs h-8 text-xs"
            />
            {subTab === "ativos" && (
              <>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={autoLinkPredecessors}>
                  Auto-encadear predecessores
                </Button>
                <span className="ml-auto text-xs text-muted-foreground">
                  {grupos.length} equipamento(s)
                </span>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {subTab === "ativos" ? (
            programadas.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhum ensaio em programação (não concluído). Use o Gantt para programar.
            </div>
          ) : (
            <div className="overflow-auto max-h-[70vh] border-t relative">
              <table className="text-[11px] border-collapse" style={{ minWidth: LEFT_W + days.length * dayPx }}>
                <thead className="sticky top-0 z-20 bg-muted/95 backdrop-blur">
                  <tr>
                    <th className="border-b border-r px-2 py-1 text-left font-medium sticky left-0 bg-muted/95 z-30 relative" style={{ width: LEFT_W, minWidth: LEFT_W }}>
                      <div className="grid grid-cols-[28px_20px_86px_74px_minmax(0,1fr)_70px_44px_56px] gap-1 items-center">
                        <span className="text-center">#</span>
                        <span></span>
                        <span>OS</span>
                        <span>Amostra</span>
                        <span>Ensaio</span>
                        <span>Início</span>
                        <span className="text-right">Dur</span>
                        <span>Pred.</span>
                      </div>
                      <div
                        onMouseDown={startResize}
                        onDoubleClick={autoSizeLeft}
                        title="Arraste para redimensionar"
                        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-primary/60 active:bg-primary z-40"
                      />
                    </th>
                    {monthHeaders.map((m, i) => (
                      <th
                        key={i}
                        colSpan={m.span}
                        className="border-b border-r px-1 py-1 text-center font-medium text-muted-foreground capitalize"
                        style={{ minWidth: m.span * dayPx }}
                      >
                        {m.label}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th className="border-b border-r sticky left-0 bg-muted/95 z-30" style={{ width: LEFT_W, minWidth: LEFT_W }}></th>
                    {days.map((d) => {
                      const dt = new Date(d + "T00:00:00");
                      const wk = dt.getDay();
                      const isWknd = wk === 0 || wk === 6;
                      const isToday = d === todayIso;
                      return (
                        <th
                          key={d}
                          className={`border-b border-r text-center text-[9px] font-normal py-0.5 ${isWknd ? "bg-muted-foreground/10 text-muted-foreground/70" : ""} ${isToday ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold" : ""}`}
                          style={{ width: dayPx, minWidth: dayPx }}
                        >
                          {dt.getDate()}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {grupos.map(([key, g]) => {
                    const isCollapsed = !!collapsed[key];
                    const rowsShown = g.rows.filter(matches);
                    const eqName = g.equip?.nome || "Sem equipamento";
                    // Predecessores possíveis dentro do grupo (mesmo equipamento)
                    const predOpts = g.rows.map((r) => ({
                      id: r.p.id,
                      label: `${rowNumberByProg.get(r.p.id)} · ${r.a?.os_numero ?? ""} / ${r.t?.nome ?? ""}`,
                    }));
                    return (
                      <>
                        {/* Header do grupo */}
                        <tr key={`h-${key}`} className="bg-accent/40 border-b">
                          <td className="border-r px-2 py-1 sticky left-0 bg-accent/40 z-10" style={{ width: LEFT_W, minWidth: LEFT_W }}>
                            <button
                              onClick={() => toggle(key)}
                              className="flex items-center gap-1.5 font-semibold text-xs w-full text-left"
                            >
                              {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              <span>{eqName}</span>
                              <Badge variant="secondary" className="ml-1 text-[10px] py-0 px-1.5">
                                {rowsShown.length}
                              </Badge>
                            </button>
                          </td>
                          {days.map((d) => {
                            const dt = new Date(d + "T00:00:00");
                            const wk = dt.getDay();
                            const isWknd = wk === 0 || wk === 6;
                            return (
                              <td key={d} className={`border-r ${isWknd ? "bg-muted-foreground/5" : ""}`} style={{ width: dayPx }} />
                            );
                          })}
                        </tr>
                        {/* Linhas do grupo */}
                        {!isCollapsed && rowsShown.map(({ e, a, t, ef, p: prog }) => {
                          const startIdx = prog.data_inicio_prevista ? dayIndex.get(prog.data_inicio_prevista) : undefined;
                          const dur = normalizeDurationDays(prog.duracao_dias, 0.25);
                          const fim = prog.data_inicio_prevista
                            ? endIsoFromDur(prog.data_inicio_prevista, prog.duracao_dias, prog.incluir_fds)
                            : null;
                          const atraso = computeAtraso(prog);
                          const atrasada = (atraso.dias ?? 0) > 0;
                          const cor = barColor(ef, atrasada);
                          const widthDays = Math.max(0.25, dur);
                          const barLeft = startIdx != null ? startIdx * dayPx : 0;
                          const barWidth = widthDays * dayPx;
                          const nRow = rowNumberByProg.get(prog.id) ?? 0;
                          return (
                            <tr key={prog.id} className="hover:bg-accent/30 border-b" style={{ height: ROW_H }}>
                              <td
                                className="border-r px-1 py-0.5 sticky left-0 bg-background z-10"
                                style={{ width: LEFT_W, minWidth: LEFT_W }}
                              >
                                <div className="grid grid-cols-[28px_20px_86px_74px_minmax(0,1fr)_70px_44px_56px] gap-1 items-center">
                                  <span className="text-[10px] text-muted-foreground tabular-nums text-center">{nRow}</span>
                                  <span
                                    className="h-2.5 w-2.5 rounded-sm"
                                    style={{ background: cor }}
                                    title={EF_LABEL[ef]}
                                  />
                                  <span className="font-medium truncate" title={a?.os_numero}>{a?.os_numero}</span>
                                  <span className="text-muted-foreground truncate">{a?.codigo_amostra || "—"}</span>
                                  <span className="truncate" title={t?.nome}>{t?.nome || "—"}</span>
                                  <input
                                    type="date"
                                    defaultValue={prog.data_inicio_prevista ?? ""}
                                    className="w-full bg-transparent px-1 py-0 rounded hover:bg-muted focus:bg-background focus:outline focus:outline-1 focus:outline-primary text-[10px]"
                                    onBlur={(ev) => {
                                      const newStart = ev.target.value || null;
                                      const oldStart = prog.data_inicio_prevista ?? null;
                                      if (newStart !== oldStart) {
                                        const patch: Record<string, any> = { data_inicio_prevista: newStart ?? "" };
                                        const newFim = newStart ? endIsoFromDur(newStart, prog.duracao_dias, prog.incluir_fds) : "";
                                        patch.data_fim = newFim;

                                        // Cascata de predecessores
                                        const successors = programadas.filter(p => p.p.predecessor_id === prog.id);
                                        if (successors.length > 0 && newFim) {
                                          successors.forEach(s => {
                                            const sStart = nextBusinessDayIso(new Date(new Date(newFim + "T00:00:00").getTime() + 86400000).toISOString().slice(0, 10), s.p.incluir_fds);
                                            const sFim = endIsoFromDur(sStart, s.p.duracao_dias, s.p.incluir_fds);
                                            savePatch(s.p.id, { 
                                              data_inicio_prevista: sStart, 
                                              data_fim: sFim 
                                            }, `Cascata: ${s.t?.nome}`);
                                          });
                                        }

                                        savePatch(prog.id, patch, "Início atualizado");
                                      }
                                    }}
                                  />
                                  <input
                                    type="number"
                                    step="0.25"
                                    min="0.25"
                                    defaultValue={prog.duracao_dias}
                                    className="w-full bg-transparent px-1 py-0 rounded hover:bg-muted focus:bg-background focus:outline focus:outline-1 focus:outline-primary text-right tabular-nums text-[10px]"
                                    onBlur={(ev) => {
                                      const raw = ev.target.value.replace(",", ".");
                                      const n = normalizeDurationDays(Number(raw), prog.duracao_dias);
                                      if (n !== prog.duracao_dias) {
                                        const patch: Record<string, any> = { duracao_dias: n };
                                        let updatedFim: string | null = null;
                                        if (prog.data_inicio_prevista) {
                                          updatedFim = endIsoFromDur(prog.data_inicio_prevista, n, prog.incluir_fds);
                                          patch.data_fim = updatedFim;
                                        }

                                        const successors = programadas.filter(p => p.p.predecessor_id === prog.id);
                                        if (successors.length > 0 && updatedFim) {
                                          successors.forEach(s => {
                                            const sStart = nextBusinessDayIso(new Date(new Date(updatedFim + "T00:00:00").getTime() + 86400000).toISOString().slice(0, 10), s.p.incluir_fds);
                                            const sFim = endIsoFromDur(sStart, s.p.duracao_dias, s.p.incluir_fds);
                                            savePatch(s.p.id, { 
                                              data_inicio_prevista: sStart, 
                                              data_fim: sFim 
                                            }, `Cascata: ${s.t?.nome}`);
                                          });
                                        }

                                        savePatch(prog.id, patch, "Duração atualizada");
                                      }
                                    }}
                                  />
                                  <select
                                    className="w-full bg-transparent px-0.5 py-0 rounded hover:bg-muted focus:bg-background focus:outline focus:outline-1 focus:outline-primary text-[10px]"
                                    value={prog.predecessor_id ?? ""}
                                    onChange={(ev) => {
                                      const v = ev.target.value || "";
                                      if (v === prog.id) return; // não pode ser ele mesmo
                                      savePatch(prog.id, { predecessor_id: v }, v ? "Predecessor definido" : "Predecessor removido");
                                    }}
                                    title="Predecessor (mesmo equipamento)"
                                  >
                                    <option value="">—</option>
                                    {predOpts
                                      .filter((o) => o.id !== prog.id)
                                      .map((o) => (
                                        <option key={o.id} value={o.id}>
                                          {o.label}
                                        </option>
                                      ))}
                                  </select>
                                </div>
                              </td>
                              <td className="p-0 relative" colSpan={days.length} style={{ height: 24 }}>
                                {/* grid de fundo */}
                                <div className="absolute inset-0 flex pointer-events-none">
                                  {days.map((d) => {
                                    const dt = new Date(d + "T00:00:00");
                                    const wk = dt.getDay();
                                    const isWknd = wk === 0 || wk === 6;
                                    const isToday = d === todayIso;
                                    return (
                                      <div
                                        key={d}
                                        className={`border-r ${isWknd ? "bg-muted-foreground/5" : ""} ${isToday ? "bg-amber-500/10" : ""}`}
                                        style={{ width: dayPx, minWidth: dayPx }}
                                      />
                                    );
                                  })}
                                </div>
                                {/* barra */}
                                {startIdx != null && (
                                  <div
                                    className="absolute top-1 rounded-sm shadow-sm cursor-help"
                                    style={{
                                      left: barLeft + 1,
                                      width: Math.max(barWidth - 2, 4),
                                      height: 16,
                                      background: cor,
                                    }}
                                    title={`${a?.os_numero} · ${t?.nome}\n${fmtBr(prog.data_inicio_prevista)} → ${fmtBr(fim)} (${dur}d)${atrasada ? `\nAtraso: +${atraso.dias}d` : ""}${prog.predecessor_id ? `\nPredecessor: linha ${rowNumberByProg.get(prog.predecessor_id) ?? "?"}` : ""}`}
                                  >
                                    <span className="absolute inset-0 flex items-center px-1 text-[9px] text-white font-medium truncate">
                                      {a?.codigo_amostra || t?.nome}
                                    </span>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    );
                  })}
                </tbody>
              </table>
              {/* SVG overlay para setas de predecessor (finish-to-start) */}
              <svg
                className="pointer-events-none absolute z-10"
                style={{ left: LEFT_W, top: ROW_H * 2, width: days.length * dayPx, height: totalHeight }}
              >
                <defs>
                  <marker id="pred-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                  </marker>
                </defs>
                <g className="text-muted-foreground/70">
                  {Array.from(barPositions.values()).map((to) => {
                    // Encontra a barra origem
                    let fromProgId: string | null = null;
                    for (const [, g] of grupos) {
                      for (const r of g.rows) {
                        if (r.p.id === to.progId) { fromProgId = r.p.predecessor_id; break; }
                      }
                      if (fromProgId !== undefined && fromProgId !== null) break;
                    }
                    if (!fromProgId) return null;
                    const from = barPositions.get(fromProgId);
                    if (!from) return null;
                    const x1 = from.left + from.width;
                    const y1 = from.top;
                    const x2 = to.left;
                    const y2 = to.top;
                    const midX = x1 + 6;
                    return (
                      <polyline
                        key={to.progId}
                        points={`${x1},${y1} ${midX},${y1} ${midX},${y2} ${x2},${y2}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1}
                        markerEnd="url(#pred-arrow)"
                      />
                    );
                  })}
                </g>
              </svg>
            </div>
            )
          ) : (
            /* ---- Sub-aba Concluídos ---- */
            <ConcluidosGantt
              rows={concluidas.filter(({ e, a, t }) => matches({ e, a, t } as EnsaioFlatRow))}
              equipById={equipById}
              fmtBr={fmtBr}
              computeAtraso={computeAtraso}
              LEFT_W={LEFT_W}
              ROW_H={ROW_H}
              dayPx={dayPx}
            />
          )}
        </CardContent>
      </Card>

      {/* Pendentes de programação — clique para programar */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <CardTitle className="text-sm">Pendentes de programação</CardTitle>
            <Badge variant="secondary" className="text-[10px]">{pendentes.length}</Badge>
            <span className="ml-auto text-xs text-muted-foreground">
              Clique em uma linha para programar rapidamente.
            </span>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {pendentes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum ensaio pendente. ✓</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/60 text-left">
                  <th className="border px-2 py-1 font-medium">OS</th>
                  <th className="border px-2 py-1 font-medium">Amostra</th>
                  <th className="border px-2 py-1 font-medium">Ensaio</th>
                  <th className="border px-2 py-1 font-medium">Tomador</th>
                  <th className="border px-2 py-1 font-medium">Prazo</th>
                  <th className="border px-2 py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {pendentes.filter(matches).map((row) => {
                  const { e, a, t, ef } = row;
                  return (
                  <tr
                    key={e.id}
                    className="hover:bg-accent/40 cursor-pointer"
                    onClick={() => setQuickProg(row)}
                    title="Clique para programar"
                  >
                    <td className="border px-2 py-1 font-medium">{a?.os_numero}</td>
                    <td className="border px-2 py-1">{a?.codigo_amostra || "—"}</td>
                    <td className="border px-2 py-1">
                      <div className="flex items-center gap-1.5">
                        {t?.cor_gantt && (
                          <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: t.cor_gantt }} />
                        )}
                        <span className="truncate">{t?.nome || "—"}</span>
                      </div>
                    </td>
                    <td className="border px-2 py-1 text-muted-foreground truncate max-w-[200px]">{a?.tomador || "—"}</td>
                    <td className="border px-2 py-1 tabular-nums">{fmtBr(e.prazo)}</td>
                    <td className="border px-2 py-1">
                      <span className={EF_COLOR[ef]}>{EF_LABEL[ef]}</span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Diálogo de programação rápida ao clicar em pendente */}
      <QuickProgramarDialog
        row={quickProg}
        tipos={tipos}
        equipamentos={equipamentos}
        onClose={() => setQuickProg(null)}
        onCreate={(payload) => {
          createProg(payload);
          setQuickProg(null);
        }}
      />
    </div>
  );
}

/* ---------- Sub-aba Concluídos: mini-Gantt "planejado vs. realizado" ---------- */
function ConcluidosGantt({
  rows,
  equipById,
  fmtBr,
  computeAtraso,
  LEFT_W,
  ROW_H,
  dayPx,
}: {
  rows: (EnsaioFlatRow & { p: Programacao })[];
  equipById: Map<string, Equip>;
  fmtBr: (s: string | null | undefined) => string;
  computeAtraso: (p: Programacao) => { dias: number | null; tipo: "inicio" | "fim" | "aberto" | null };
  LEFT_W: number;
  ROW_H: number;
  dayPx: number;
}) {
  // Agrupar por equipamento e ordenar por fim real
  const grupos = useMemo(() => {
    const map = new Map<string, { equip: Equip | null; rows: (EnsaioFlatRow & { p: Programacao })[] }>();
    for (const r of rows) {
      const key = r.p.equipamento_id || "__sem__";
      const eq = r.p.equipamento_id ? equipById.get(r.p.equipamento_id) ?? null : null;
      const g = map.get(key) ?? { equip: eq, rows: [] };
      g.rows.push(r);
      map.set(key, g);
    }
    for (const g of map.values()) {
      g.rows.sort((a, b) => (a.p.data_fim_real || a.p.data_inicio_prevista || "").localeCompare(b.p.data_fim_real || b.p.data_inicio_prevista || ""));
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => (a.equip?.nome || "zzz").localeCompare(b.equip?.nome || "zzz"));
  }, [rows, equipById]);

  // Timeline abrangendo planejado + realizado
  const days = useMemo(() => {
    if (rows.length === 0) return [] as string[];
    let min = "9999-99-99";
    let max = "0000-00-00";
    for (const r of rows) {
      const p = r.p;
      const cand: (string | null | undefined)[] = [
        p.data_inicio_prevista,
        p.data_inicio_prevista ? endIsoFromDur(p.data_inicio_prevista, p.duracao_dias, p.incluir_fds) : null,
        p.data_inicio_real,
        p.data_fim_real,
      ];
      for (const c of cand) {
        if (!c) continue;
        if (c < min) min = c;
        if (c > max) max = c;
      }
    }
    if (min === "9999-99-99") return [];
    const s = new Date(min + "T00:00:00");
    s.setDate(s.getDate() - 2);
    const e = new Date(max + "T00:00:00");
    e.setDate(e.getDate() + 3);
    const out: string[] = [];
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      out.push(`${y}-${m}-${dd}`);
    }
    return out;
  }, [rows]);

  const dayIndex = useMemo(() => {
    const m = new Map<string, number>();
    days.forEach((d, i) => m.set(d, i));
    return m;
  }, [days]);

  const monthHeaders = useMemo(() => {
    const groups: { key: string; label: string; span: number }[] = [];
    for (const d of days) {
      const dt = new Date(d + "T00:00:00");
      const key = `${dt.getFullYear()}-${dt.getMonth()}`;
      const label = dt.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.span += 1;
      else groups.push({ key, label, span: 1 });
    }
    return groups;
  }, [days]);

  // KPIs
  const kpi = useMemo(() => {
    let noPrazo = 0, atrasados = 0, adiantados = 0;
    let somaAtraso = 0, cont = 0;
    for (const r of rows) {
      const at = computeAtraso(r.p);
      if (at.dias == null) continue;
      cont++;
      somaAtraso += at.dias;
      if (at.dias > 0) atrasados++;
      else if (at.dias < 0) adiantados++;
      else noPrazo++;
    }
    return {
      total: rows.length,
      noPrazo,
      atrasados,
      adiantados,
      atrasoMedio: cont > 0 ? somaAtraso / cont : 0,
    };
  }, [rows, computeAtraso]);

  if (rows.length === 0) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Nenhum ensaio concluído ainda.</p>;
  }

  const rowSpan = (r: EnsaioFlatRow & { p: Programacao }) => {
    const p = r.p;
    const iPrevIdx = p.data_inicio_prevista ? dayIndex.get(p.data_inicio_prevista) : undefined;
    const fPrev = p.data_inicio_prevista ? endIsoFromDur(p.data_inicio_prevista, p.duracao_dias, p.incluir_fds) : null;
    const fPrevIdx = fPrev ? dayIndex.get(fPrev) : undefined;
    const iRealIdx = p.data_inicio_real ? dayIndex.get(p.data_inicio_real) : undefined;
    const fRealIdx = p.data_fim_real ? dayIndex.get(p.data_fim_real) : undefined;
    return { iPrevIdx, fPrevIdx, iRealIdx, fRealIdx };
  };

  return (
    <div className="space-y-3">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 p-3 border-b bg-muted/30">
        <KpiTile label="Concluídos" value={String(kpi.total)} tone="neutral" />
        <KpiTile label="No prazo" value={String(kpi.noPrazo)} tone="ok" />
        <KpiTile label="Adiantados" value={String(kpi.adiantados)} tone="ok" />
        <KpiTile label="Atrasados" value={String(kpi.atrasados)} tone="bad" />
        <KpiTile
          label="Atraso médio"
          value={`${kpi.atrasoMedio > 0 ? "+" : ""}${kpi.atrasoMedio.toFixed(1)}d`}
          tone={kpi.atrasoMedio > 0 ? "bad" : "ok"}
        />
      </div>

      <div className="overflow-auto max-h-[65vh] border-t relative">
        <table className="text-[11px] border-collapse" style={{ minWidth: LEFT_W + days.length * dayPx }}>
          <thead className="sticky top-0 z-20 bg-muted/95 backdrop-blur">
            <tr>
              <th
                className="border-b border-r px-2 py-1 text-left font-medium sticky left-0 bg-muted/95 z-30"
                style={{ width: LEFT_W, minWidth: LEFT_W }}
              >
                <div className="grid grid-cols-[86px_74px_1fr_110px_56px] gap-1 items-center">
                  <span>OS</span>
                  <span>Amostra</span>
                  <span>Ensaio</span>
                  <span>Fim real</span>
                  <span className="text-right">Atraso</span>
                </div>
              </th>
              {monthHeaders.map((m, i) => (
                <th
                  key={i}
                  colSpan={m.span}
                  className="border-b border-r px-1 py-1 text-center font-medium text-muted-foreground capitalize"
                  style={{ minWidth: m.span * dayPx }}
                >
                  {m.label}
                </th>
              ))}
            </tr>
            <tr>
              <th className="border-b border-r sticky left-0 bg-muted/95 z-30" style={{ width: LEFT_W, minWidth: LEFT_W }}></th>
              {days.map((d) => {
                const dt = new Date(d + "T00:00:00");
                const wk = dt.getDay();
                const isWknd = wk === 0 || wk === 6;
                return (
                  <th
                    key={d}
                    className={`border-b border-r px-0 py-1 text-center text-[9px] font-normal ${isWknd ? "bg-muted/60 text-muted-foreground" : "text-muted-foreground"}`}
                    style={{ minWidth: dayPx, width: dayPx }}
                  >
                    {dt.getDate()}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {grupos.map(([key, g]) => (
              <React.Fragment key={key}>
                <tr className="bg-muted/40">
                  <td
                    className="border-b border-r px-2 py-1 sticky left-0 bg-muted/40 z-10 font-medium text-[11px]"
                    style={{ width: LEFT_W, minWidth: LEFT_W }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span>{g.equip?.nome || "Sem equipamento"}</span>
                      <span className="text-muted-foreground text-[10px]">· {g.rows.length}</span>
                    </div>
                  </td>
                  <td colSpan={days.length} className="border-b" style={{ height: ROW_H }} />
                </tr>
                {g.rows.map(({ e, a, t, p }) => {
                  const { iPrevIdx, fPrevIdx, iRealIdx, fRealIdx } = rowSpan({ e, a, t, p } as any);
                  const at = computeAtraso(p);
                  const atrasado = (at.dias ?? 0) > 0;
                  const adiantado = (at.dias ?? 0) < 0;
                  const realColor = atrasado
                    ? "hsl(0 72% 52%)"
                    : adiantado
                      ? "hsl(160 70% 40%)"
                      : "hsl(150 60% 45%)";
                  return (
                    <tr key={e.id} className="hover:bg-accent/20" style={{ height: ROW_H }}>
                      <td
                        className="border-b border-r px-2 py-1 sticky left-0 bg-background z-10"
                        style={{ width: LEFT_W, minWidth: LEFT_W }}
                      >
                        <div className="grid grid-cols-[86px_74px_1fr_110px_56px] gap-1 items-center">
                          <span className="truncate font-medium" title={a?.os_numero}>{a?.os_numero}</span>
                          <span className="truncate text-muted-foreground">{a?.codigo_amostra || "—"}</span>
                          <span className="truncate flex items-center gap-1.5" title={t?.nome}>
                            {t?.cor_gantt && <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: t.cor_gantt }} />}
                            <span className="truncate">{t?.nome || "—"}</span>
                          </span>
                          <span className="tabular-nums text-muted-foreground">{fmtBr(p.data_fim_real)}</span>
                          <span
                            className={`text-right tabular-nums font-medium ${atrasado ? "text-red-600 dark:text-red-400" : adiantado ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
                          >
                            {at.dias == null ? "—" : `${at.dias > 0 ? "+" : ""}${at.dias}d`}
                          </span>
                        </div>
                      </td>
                      <td colSpan={days.length} className="relative border-b p-0" style={{ height: ROW_H }}>
                        {/* fundo com faixas de fim de semana */}
                        <div className="absolute inset-0 flex pointer-events-none">
                          {days.map((d) => {
                            const dt = new Date(d + "T00:00:00");
                            const wk = dt.getDay();
                            const isWknd = wk === 0 || wk === 6;
                            return (
                              <div
                                key={d}
                                style={{ width: dayPx, minWidth: dayPx }}
                                className={`border-r border-border/40 ${isWknd ? "bg-muted/30" : ""}`}
                              />
                            );
                          })}
                        </div>
                        {/* Barra planejada (contorno) */}
                        {iPrevIdx != null && fPrevIdx != null && (
                          <div
                            className="absolute rounded-sm border border-dashed"
                            style={{
                              left: iPrevIdx * dayPx + 1,
                              width: Math.max(dayPx * 0.5, (fPrevIdx - iPrevIdx + 1) * dayPx - 2),
                              top: 3,
                              height: 8,
                              borderColor: "hsl(215 20% 55%)",
                              background: "color-mix(in oklch, hsl(215 20% 55%) 10%, transparent)",
                            }}
                            title={`Planejado: ${fmtBr(p.data_inicio_prevista)} → ${fmtBr(endIsoFromDur(p.data_inicio_prevista!, p.duracao_dias, p.incluir_fds))}`}
                          />
                        )}
                        {/* Barra realizada (sólida colorida) */}
                        {iRealIdx != null && fRealIdx != null && (
                          <div
                            className="absolute rounded-sm shadow-sm"
                            style={{
                              left: iRealIdx * dayPx + 1,
                              width: Math.max(dayPx * 0.5, (fRealIdx - iRealIdx + 1) * dayPx - 2),
                              top: ROW_H - 12,
                              height: 8,
                              background: realColor,
                            }}
                            title={`Realizado: ${fmtBr(p.data_inicio_real)} → ${fmtBr(p.data_fim_real)}${at.dias != null ? ` · ${at.dias > 0 ? "+" : ""}${at.dias}d` : ""}`}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-4 px-3 pb-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-6 rounded-sm border border-dashed" style={{ borderColor: "hsl(215 20% 55%)", background: "color-mix(in oklch, hsl(215 20% 55%) 10%, transparent)" }} />
          <span>Planejado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-6 rounded-sm" style={{ background: "hsl(150 60% 45%)" }} />
          <span>Realizado (no prazo)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-6 rounded-sm" style={{ background: "hsl(160 70% 40%)" }} />
          <span>Adiantado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-6 rounded-sm" style={{ background: "hsl(0 72% 52%)" }} />
          <span>Atrasado</span>
        </div>
      </div>
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: string; tone: "ok" | "bad" | "neutral" }) {
  const toneCls =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
        ? "text-red-600 dark:text-red-400"
        : "text-foreground";
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${toneCls}`}>{value}</div>
    </div>
  );
}

/* ---------- Diálogo: programação rápida a partir da lista de pendentes ---------- */
function QuickProgramarDialog({
  row,
  tipos,
  equipamentos,
  onClose,
  onCreate,
}: {
  row: EnsaioFlatRow | null;
  tipos: TipoEnsaioFull[];
  equipamentos: Equip[];
  onClose: () => void;
  onCreate: (payload: Record<string, unknown>) => void;
}) {
  const [data, setData] = useState("");
  const [dur, setDur] = useState("1");
  const [equip, setEquip] = useState<string>("");
  const [fds, setFds] = useState(false);

  useEffect(() => {
    if (row) {
      const today = new Date().toISOString().slice(0, 10);
      setData(today);
      setDur("1");
      setFds(false);
      // Equipamento sugerido: primeiro compatível com o tipo
      const tipoFull = tipos.find((t) => t.id === row.e.tipo_ensaio_id);
      const sugestao = tipoFull?.equipamentos_ids?.[0] ?? "";
      setEquip(sugestao);
    }
  }, [row, tipos]);

  const tipoFull = row ? tipos.find((t) => t.id === row.e.tipo_ensaio_id) : null;
  const equipsCompat = tipoFull?.equipamentos_ids?.length
    ? equipamentos.filter((e) => tipoFull!.equipamentos_ids.includes(e.id))
    : equipamentos;

  const submit = () => {
    if (!row || !data) {
      toast.error("Informe a data de início.");
      return;
    }
    const d = normalizeDurationDays(Number(dur.replace(",", ".")), 1);
    onCreate({
      ensaio_id: row.e.id,
      status: "planejado",
      data_inicio_prevista: data,
      duracao_dias: d,
      data_fim: endIsoFromDur(data, d, fds),
      equipamento_id: equip || "",
      incluir_fds: fds,
      observacoes: row.e.observacoes || "",
      predecessor_id: "",
    });
  };

  return (
    <Dialog open={!!row} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Programar ensaio</DialogTitle>
        </DialogHeader>
        {row && (
          <div className="space-y-3">
            <div className="rounded-md border p-2 text-xs bg-muted/40">
              <div><span className="text-muted-foreground">OS:</span> <span className="font-medium">{row.a?.os_numero}</span></div>
              <div><span className="text-muted-foreground">Amostra:</span> {row.a?.codigo_amostra || "—"}</div>
              <div><span className="text-muted-foreground">Ensaio:</span> {row.t?.nome || "—"}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Início</Label>
                <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Duração (dias)</Label>
                <Input type="number" step="0.25" min="0.25" value={dur} onChange={(e) => setDur(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Equipamento</Label>
              <Select value={equip} onValueChange={setEquip}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {equipsCompat.length === 0 ? (
                    <div className="p-2 text-xs text-muted-foreground">Nenhum equipamento compatível.</div>
                  ) : equipsCompat.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={fds} onChange={(e) => setFds(e.target.checked)} />
              Incluir sábados/domingos na duração
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit}>Programar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EnsaioForm({
  ensaio,
  amostraId,
  tipos,
  onSubmit,
  loading,
}: {
  ensaio: Ensaio | null;
  amostraId: string;
  tipos: TipoEnsaio[];
  onSubmit: (row: Partial<Ensaio>) => void;
  loading: boolean;
}) {
  // Consolida "observações" e "detalhes técnicos" em um único campo.
  const initial: Partial<Ensaio> = ensaio
    ? {
        ...ensaio,
        observacoes:
          (ensaio.observacoes && ensaio.observacoes.trim()) ||
          (ensaio.detalhes_tecnicos && ensaio.detalhes_tecnicos.trim())
            ? ensaio.observacoes || ensaio.detalhes_tecnicos
            : null,
      }
    : { amostra_id: amostraId, status: "pendente", prioridade: "media" };
  const [form, setForm] = useState<Partial<Ensaio>>(initial);
  const set = <K extends keyof Ensaio>(k: K, v: Ensaio[K] | null) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{ensaio ? "Editar ensaio" : "Novo ensaio"}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Tipo de ensaio *</Label>
          <Select
            value={form.tipo_ensaio_id ?? ""}
            onValueChange={(v) => set("tipo_ensaio_id", v)}
          >
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              {tipos.length === 0 ? (
                <div className="p-2 text-xs text-muted-foreground">
                  Nenhum tipo cadastrado. Vá em Tipos de ensaio.
                </div>
              ) : (
                tipos.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Prioridade</Label>
          <Select
            value={form.prioridade ?? "media"}
            onValueChange={(v) => set("prioridade", v as Ensaio["prioridade"])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PRIO_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label>Prazo</Label>
          <Input
            type="date"
            value={form.prazo ?? ""}
            onChange={(e) => set("prazo", e.target.value || null)}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            O <strong>status</strong> e as <strong>datas de execução</strong> são controlados pela programação do Gantt.
          </p>
        </div>
        <div className="col-span-2">
          <Label>Observações / detalhes técnicos</Label>
          <Textarea
            value={form.observacoes ?? ""}
            onChange={(e) => set("observacoes", e.target.value || null)}
            placeholder="Ex: Degraus de carga: 25, 50, 100, 200 kPa. Duração 24h/estágio."
            rows={3}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Este texto é sincronizado com a programação do Gantt.
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!form.tipo_ensaio_id || loading}
          onClick={() => onSubmit({ ...form, amostra_id: amostraId })}
        >
          {loading ? "Salvando..." : "Salvar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}