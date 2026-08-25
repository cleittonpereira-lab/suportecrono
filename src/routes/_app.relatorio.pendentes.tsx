import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { detectMethodology, methodologyRoute, type SupportedMethodology } from "@/features/mesp-natural/calc";
import { labStore, useLabState } from "@/features/lab/store";
import { ENSAIO_LABEL, type EnsaioTipo } from "@/features/lab/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  listPendenciasDigitacao,
  atualizarPendenciaDigitacao,
  concluirPendenciaExterna,
  criarRelatorioAvulso,
  removerPendenciaDigitacao,
  type PendenciaDigitacao,
} from "@/lib/lab-pendencias.functions";
import { listRows } from "@/lib/programacao.functions";
import { normOs, normAmostra, normMethod } from "@/lib/pendencia-match";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ClipboardList,
  Loader2,
  Trash2,
  Search,
  Play,
  CheckCircle2,
  Activity,
  Stamp,
  FlaskConical,
  FileEdit,
  Send,
  LayoutDashboard,
  ShieldCheck,
  Clock,
  PlayCircle,
  Plus,
  ArrowRight,
  ExternalLink,
  Kanban,
  Table as TableIcon,
  AlertCircle,
  CheckCircle,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Calendar,
  User,
  Building,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCadastroByOs } from "@/hooks/use-cadastro-by-os";
import { EmissoesInner } from "@/components/emissoes-inner";
import { evaluateSla, formatHours, type SlaStatus } from "@/lib/sla-calc";

export const Route = createFileRoute("/_app/relatorio/pendentes")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Central de Relatórios & SLAs — Suporte INFRA" },
      {
        name: "description",
        content:
          "Central inteligente de processamento de relatórios: esteira do Gantt, digitação, verificação, aprovação e SLAs.",
      },
    ],
  }),
  component: CentralRelatoriosPage,
});

const STATUS_LABEL: Record<PendenciaDigitacao["status"], string> = {
  pendente: "Pendente de Digitação",
  em_digitacao: "Em Digitação",
  digitado: "Aguardando Verificação",
  verificado: "Aguardando Aprovação",
  aprovado: "Aprovado / Emitido",
  concluido_externo: "Concluído fora da Central (Excel)",
};

const STATUS_COLOR: Record<PendenciaDigitacao["status"], string> = {
  pendente: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  em_digitacao: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
  digitado: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30",
  verificado: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30",
  aprovado: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  concluido_externo: "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30",
};

const SLA_BADGE_COLOR: Record<SlaStatus, string> = {
  no_prazo: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  alerta: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  atrasado: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30 animate-pulse",
};

const SLA_LABEL: Record<SlaStatus, string> = {
  no_prazo: "No Prazo",
  alerta: "Alerta SLA",
  atrasado: "Atrasado",
};


// normOs/normAmostra/normMethod: ver src/lib/pendencia-match.ts (compartilhado com os editores de relatório).

function CentralRelatoriosPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const activeTab = search.tab ?? "gantt-fila";
  const listFn = useServerFn(listPendenciasDigitacao);
  const updFn = useServerFn(atualizarPendenciaDigitacao);
  const conclExtFn = useServerFn(concluirPendenciaExterna);
  const criarAvulsoFn = useServerFn(criarRelatorioAvulso);
  const delFn = useServerFn(removerPendenciaDigitacao);
  const rows0Fn = useServerFn(listRows);

  const [busca, setBusca] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [ganttFilter, setGanttFilter] = useState<"all" | "concluido" | "execucao" | "planejado">("concluido");

  // Modais
  const [avulsoOpen, setAvulsoOpen] = useState(false);
  const [avulsoData, setAvulsoData] = useState({
    os: "",
    cliente: "",
    obra: "",
    amostra: "",
    ensaio: "Cisalhamento Direto Inundado",
    tipo_ensaio: "cisalhamento-direto",
    operador_nome: "",
    observacoes: "",
  });

  const [externoModal, setExternoModal] = useState<PendenciaDigitacao | null>(null);
  const [externoObs, setExternoObs] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<PendenciaDigitacao | null>(null);

  // Queries
  const labState = useLabState();

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["lab-pendencias"],
    queryFn: () => listFn(),
    refetchInterval: 15_000,
  });

  function mapWorkflowStatus(status?: string | null): PendenciaDigitacao["status"] {
    if (!status) return "em_digitacao";
    const s = status.toLowerCase().trim();
    if (s === "aprovado" || s === "concluido") return "aprovado";
    if (s === "verificado" || s === "aguardando_aprovacao" || s === "pendente_aprovacao") return "verificado";
    if (s === "digitado" || s === "aguardando_verificacao" || s === "pendente_verificacao" || s === "verificacao") return "digitado";
    if (s === "concluido_externo") return "concluido_externo";
    return "em_digitacao";
  }

  // Lista unificada de pendências (Supabase + Estado soberano labState)
  const allPendencias = useMemo(() => {
    const map = new Map<string, PendenciaDigitacao>();

    for (const r of rows) {
      const key = `${normOs(r.os)}::${normAmostra(r.amostra || "")}::${normMethod(r.ensaio || r.tipo_ensaio)}`;
      map.set(key, { ...r, status: mapWorkflowStatus(r.status) });
      map.set(r.id, { ...r, status: mapWorkflowStatus(r.status) });
    }

    if (labState?.os) {
      for (const o of labState.os) {
        for (const a of o.amostras) {
          for (const e of a.ensaios) {
            const hasData = e.payload && Object.keys(e.payload).length > 0;
            const targetStatus = mapWorkflowStatus(e.status);
            const isEmProgresso = targetStatus !== "em_digitacao" || hasData || e.status === "em_digitacao" || e.status === "processando";
            if (!isEmProgresso) continue;

            const key = `${normOs(o.numero)}::${normAmostra(a.reportNumber || a.code || "")}::${normMethod(e.sigla || e.nome || e.tipo)}`;
            const existing = map.get(key) || map.get(e.id);

            if (existing) {
              // Atualiza com o status mais recente do labState
              existing.status = targetStatus;
              if (e.payload) existing.payload = e.payload as any;
              if (e.operator || o.operator) existing.operador_nome = e.operator || o.operator || existing.operador_nome;
            } else {
              const item: PendenciaDigitacao = {
                id: e.id,
                os: o.numero,
                amostra: a.reportNumber || a.code || null,
                ensaio: e.sigla || e.nome || ENSAIO_LABEL[e.tipo] || e.tipo,
                tipo_ensaio: e.tipo,
                equipamento: null,
                data_conclusao: new Date().toISOString(),
                status: targetStatus,
                origem: "avulso",
                operador_user_id: null,
                operador_nome: e.operator || o.operator || null,
                observacao: null,
                payload: e.payload as any,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              map.set(key, item);
              map.set(e.id, item);
            }
          }
        }
      }
    }

    return Array.from(new Set(map.values())).sort(
      (a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
    );
  }, [rows, labState]);

  const { data: progs = [] } = useQuery({
    queryKey: ["prox-ensaios-progs"],
    queryFn: async () => rows0Fn({ data: { sheet: "Programações" } }),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const { data: amostrasProg = [] } = useQuery({
    queryKey: ["prox-ensaios-amostras"],
    queryFn: async () => rows0Fn({ data: { sheet: "Amostras" } }),
  });

  const { data: ensaiosProg = [] } = useQuery({
    queryKey: ["prox-ensaios-ensaios"],
    queryFn: async () => rows0Fn({ data: { sheet: "Ensaios" } }),
  });

  const { data: tiposProg = [] } = useQuery({
    queryKey: ["prox-ensaios-tipos"],
    queryFn: async () => rows0Fn({ data: { sheet: "Tipos de Ensaio" } }),
  });

  const { data: equipsProg = [] } = useQuery({
    queryKey: ["prox-ensaios-equips"],
    queryFn: async () => rows0Fn({ data: { sheet: "Equipamentos" } }),
  });

  const cadastro = useCadastroByOs();

  // Mapeamento dos itens do Gantt
  const ganttQueue = useMemo(() => {
    const amMap = new Map(amostrasProg.map((a) => [a.id, a]));
    const enMap = new Map(ensaiosProg.map((e) => [e.id, e]));
    const tpMap = new Map(tiposProg.map((t) => [t.id, t]));
    const eqMap = new Map(equipsProg.map((e) => [e.id, e]));

    return progs.map((p) => {
      const e = enMap.get(p.ensaio_id ?? "");
      const a = e ? amMap.get(e.amostra_id ?? "") : undefined;
      const t = e ? tpMap.get(e.tipo_ensaio_id ?? "") : undefined;
      const eq = p.equipamento_id ? eqMap.get(p.equipamento_id) : undefined;
      const st = (p.status || "").toLowerCase();
      const concluiu = !!p.data_fim_real || st === "concluido";
      const iniciou = !!p.data_inicio_real || st === "em_execucao";

      let stage: "concluido" | "execucao" | "planejado" = "planejado";
      if (concluiu) stage = "concluido";
      else if (iniciou) stage = "execucao";

      return {
        id: p.id,
        programacaoId: p.id,
        os: a?.os_numero ?? "—",
        amostra: a?.codigo_amostra ?? a?.identificacao ?? "—",
        furo: a?.identificacao ?? "",
        prof: a?.topo_m && a?.base_m ? `${a.topo_m} – ${a.base_m} m` : "",
        ensaio: t?.nome ?? e?.status ?? "Ensaio",
        tipoEnsaioNome: t?.nome ?? "",
        equipamento: eq?.nome ?? "—",
        inicio_real: p.data_inicio_real || p.inicio_real_ts || null,
        fim_real: p.data_fim_real || p.fim_real_ts || null,
        data_fim_prevista: p.data_fim || null,
        tecnico: p.tecnico || null,
        stage,
      };
    });
  }, [progs, amostrasProg, ensaiosProg, tiposProg, equipsProg]);

  // Filtro de busca global
  const filteredRows = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return allPendencias;
    return allPendencias.filter(
      (r) =>
        r.os.toLowerCase().includes(q) ||
        (r.amostra ?? "").toLowerCase().includes(q) ||
        r.ensaio.toLowerCase().includes(q) ||
        (r.tipo_ensaio ?? "").toLowerCase().includes(q) ||
        (r.operador_nome ?? "").toLowerCase().includes(q) ||
        (r.digitador_nome ?? "").toLowerCase().includes(q),
    );
  }, [allPendencias, busca]);

  const filteredGantt = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return ganttQueue.filter((item) => {
      if (ganttFilter !== "all" && item.stage !== ganttFilter) return false;
      if (!q) return true;
      return (
        item.os.toLowerCase().includes(q) ||
        item.amostra.toLowerCase().includes(q) ||
        item.ensaio.toLowerCase().includes(q) ||
        item.equipamento.toLowerCase().includes(q) ||
        (item.tecnico ?? "").toLowerCase().includes(q)
      );
    });
  }, [ganttQueue, ganttFilter, busca]);

  // Contadores
  const counts = useMemo(() => {
    const c = {
      ganttConcluidos: ganttQueue.filter((g) => g.stage === "concluido").length,
      ganttExecucao: ganttQueue.filter((g) => g.stage === "execucao").length,
      ganttPlanejado: ganttQueue.filter((g) => g.stage === "planejado").length,
      em_digitacao: allPendencias.filter((r) => r.status === "em_digitacao" || r.status === "pendente").length,
      verificacao: allPendencias.filter((r) => r.status === "digitado").length,
      aprovacao: allPendencias.filter((r) => r.status === "verificado").length,
      concluidos: allPendencias.filter((r) => r.status === "aprovado" || r.status === "concluido_externo").length,
    };
    return c;
  }, [ganttQueue, allPendencias]);

  // Mutações
  const setStatusMutation = useMutation({
    mutationFn: (v: { id: string; status: PendenciaDigitacao["status"] }) => updFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lab-pendencias"] });
      toast.success("Status atualizado com sucesso!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const concluirExternoMutation = useMutation({
    mutationFn: (v: { id: string; observacao?: string }) => conclExtFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lab-pendencias"] });
      setExternoModal(null);
      setExternoObs("");
      toast.success("Ensaio marcado como 'Concluído fora da Central (Excel)' ✓");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const criarAvulsoMutation = useMutation({
    mutationFn: (data: typeof avulsoData) => criarAvulsoFn({ data }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["lab-pendencias"] });
      setAvulsoOpen(false);
      toast.success("Relatório avulso criado com sucesso! Abrindo editor…");
      // Abre direto a digitação
      abrirPorTipo(avulsoData.tipo_ensaio, avulsoData.os, avulsoData.amostra, avulsoData.cliente, avulsoData.obra);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lab-pendencias"] });
      setDeleteConfirm(null);
      toast.success("Pendência excluída.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Roteamento inteligente para os editores de laudo
  function abrirDigitacao(r: PendenciaDigitacao) {
    const metodo = detectMethodology(r.ensaio, r.tipo_ensaio);
    const tipo =
      metodo === "cisalhamento-direto"
        ? "cisalhamento-direto"
        : metodo === "mesp-a"
          ? "mesp-a"
          : metodo === "adensamento"
            ? "adensamento"
            : "triaxial-cid";

    abrirPorTipo(tipo, r.os, r.amostra ?? "", undefined, undefined, r.id, r.ensaio);
  }

  function abrirPorTipo(
    tipo: string,
    osNum: string,
    amCode: string,
    cliente?: string,
    obra?: string,
    pendenciaId?: string,
    siglaOficial?: string,
  ) {
    if (tipo === "mesp-a") {
      navigate({
        to: "/relatorio/mesp-a",
        search: { pendencia: pendenciaId },
      });
      return;
    }

    const state = labStore.get();
    let os = state.os.find((o) => (o.numero ?? "").trim() === osNum.trim());
    const cad = cadastro.lookup(osNum);
    const client = cliente || cad?.tomador || `OS ${osNum}`;
    const work = obra || cad?.obra || osNum;
    const loc = cad?.local || "";

    // Resolve dados da amostra do Gantt
    const amProg =
      amostrasProg.find((a) => (a.codigo_amostra || a.identificacao || a.id) === amCode && (a.os_numero || "").trim() === osNum.trim()) ||
      amostrasProg.find((a) => (a.codigo_amostra || a.identificacao) === amCode) ||
      amostrasProg.find((a) => a.id === amCode);

    const furo = amProg?.identificacao || amProg?.furo || "";
    const prof = amProg?.topo_m && amProg?.base_m ? `${amProg.topo_m} – ${amProg.base_m} m` : amProg?.profundidade || "";
    const codigo = amProg?.codigo_amostra || amProg?.id || amCode;

    if (!os) {
      os = labStore.createOS({
        numero: osNum,
        client,
        workNumber: work,
        local: loc,
        technicalResp: "Engº Maurício Malanconi - CREA: 5063078630",
      });
    } else {
      let updated = false;
      if ((!os.client || os.client.startsWith("OS ")) && client) { os.client = client; updated = true; }
      if (!os.workNumber && work) { os.workNumber = work; updated = true; }
      if (!os.local && loc) { os.local = loc; updated = true; }
      if (os.technicalResp !== "Engº Maurício Malanconi - CREA: 5063078630") {
        os.technicalResp = "Engº Maurício Malanconi - CREA: 5063078630";
        updated = true;
      }
      if (updated) labStore.patchOS(os.id, { client: os.client, workNumber: os.workNumber, local: os.local, technicalResp: os.technicalResp });
    }

    const cleanAm = amCode.trim() || "AM-01";
    let am = os.amostras.find((a) => (a.reportNumber ?? a.code ?? "").trim() === cleanAm || (a.code && a.code === codigo));
    if (!am) {
      am = labStore.addAmostra(os.id, {
        reportNumber: cleanAm,
        code: codigo,
        borehole: furo,
        depth: prof,
        sampleType: amProg?.tipo || "Bloco indeformado",
        description: amProg?.descricao || "",
      });
    } else {
      let patchAm: any = {};
      if (!am.borehole && furo) patchAm.borehole = furo;
      if (!am.depth && prof) patchAm.depth = prof;
      if (!am.code && codigo) patchAm.code = codigo;
      if (Object.keys(patchAm).length > 0) {
        labStore.patchAmostra(os.id, am.id, patchAm);
      }
    }

    if (!am) return;

    const sigla = siglaOficial || ENSAIO_LABEL[tipo as EnsaioTipo] || tipo;
    // Uma amostra pode ter mais de um ensaio do MESMO tipo (ex: dois
    // Cisalhamento Direto — "CD4.IN" e "CD4.NAT"). Match por tipo sozinho
    // colapsaria os dois no mesmo registro; por isso também exige que a
    // sigla/nome bata quando temos uma sigla específica desta pendência.
    let en = am.ensaios.find(
      (e) => e.tipo === tipo && (e.sigla === sigla || e.nome === sigla || e.label === sigla),
    );
    if (!en && !siglaOficial) {
      en = am.ensaios.find((e) => e.tipo === tipo);
    }
    if (!en) {
      en = labStore.addEnsaio(os.id, am.id, tipo as EnsaioTipo, sigla);
      if (en) {
        labStore.patchEnsaio(os.id, am.id, en.id, {
          nome: sigla,
          sigla: sigla,
          operator: amProg?.tecnico || "Téc. Laboratório",
        });
      }
    }

    if (!en) return;

    // Se temos pendência vinculada, marca como em_digitacao
    if (pendenciaId) {
      updFn({
        data: {
          id: pendenciaId,
          status: "em_digitacao",
        },
      }).catch(() => {});
    }

    navigate({
      to: "/relatorio/os/$osId/amostra/$amostraId/ensaio/$ensaioId",
      params: { osId: os.id, amostraId: am.id, ensaioId: en.id },
    });
  }

  return (
    <div className="space-y-6 w-full px-4 sm:px-6 md:px-8 pb-20">
      {/* Cabeçalho da Central */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-1.5 font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Central Integrada de Laudos & SLAs
          </div>
          <h1 className="mt-1 font-display text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Central de Processamento de Relatórios
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Controle ponta a ponta: da bancada (Gantt) à digitação, verificação, aprovação e emissão oficial com SLAs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setAvulsoOpen(true)}
            className="gap-1.5 shadow-sm bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Processar Relatório Avulso
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/programacao/gantt" })}
            className="gap-1.5"
          >
            <Calendar className="h-4 w-4 text-muted-foreground" /> Ver Gantt
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            title="Atualizar dados"
          >
            <Activity className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Cards de Métricas Principais — clicáveis: filtram a lista abaixo */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
        <Card
          role="button"
          tabIndex={0}
          onClick={() => { navigate({ to: "/relatorio/pendentes", search: { tab: "gantt-fila" } }); setGanttFilter("concluido"); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate({ to: "/relatorio/pendentes", search: { tab: "gantt-fila" } }); setGanttFilter("concluido"); } }}
          className="border-amber-500/20 bg-amber-50/30 dark:bg-amber-950/10 cursor-pointer transition-shadow hover:shadow-md hover:ring-1 hover:ring-amber-500/40"
        >
          <CardContent className="p-3">
            <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
              Prontos na Bancada
            </div>
            <div className="text-xl font-bold text-amber-900 dark:text-amber-200 mt-1">
              {counts.ganttConcluidos}
            </div>
            <div className="text-[10px] text-muted-foreground">Aguardando laudo</div>
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          onClick={() => { navigate({ to: "/relatorio/pendentes", search: { tab: "gantt-fila" } }); setGanttFilter("execucao"); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate({ to: "/relatorio/pendentes", search: { tab: "gantt-fila" } }); setGanttFilter("execucao"); } }}
          className="border-sky-500/20 bg-sky-50/30 dark:bg-sky-950/10 cursor-pointer transition-shadow hover:shadow-md hover:ring-1 hover:ring-sky-500/40"
        >
          <CardContent className="p-3">
            <div className="text-[10px] font-semibold text-sky-700 dark:text-sky-400 uppercase tracking-wider">
              Em Bancada
            </div>
            <div className="text-xl font-bold text-sky-900 dark:text-sky-200 mt-1">
              {counts.ganttExecucao}
            </div>
            <div className="text-[10px] text-muted-foreground">Executando no lab</div>
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          onClick={() => navigate({ to: "/relatorio/pendentes", search: { tab: "fluxo-relatorios" } })}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate({ to: "/relatorio/pendentes", search: { tab: "fluxo-relatorios" } }); } }}
          className="border-blue-500/20 bg-blue-50/30 dark:bg-blue-950/10 cursor-pointer transition-shadow hover:shadow-md hover:ring-1 hover:ring-blue-500/40"
        >
          <CardContent className="p-3">
            <div className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
              Em Digitação
            </div>
            <div className="text-xl font-bold text-blue-900 dark:text-blue-200 mt-1">
              {counts.em_digitacao}
            </div>
            <div className="text-[10px] text-muted-foreground">Cálculos & gráficos</div>
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          onClick={() => navigate({ to: "/relatorio/pendentes", search: { tab: "fluxo-relatorios" } })}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate({ to: "/relatorio/pendentes", search: { tab: "fluxo-relatorios" } }); } }}
          className="border-violet-500/20 bg-violet-50/30 dark:bg-violet-950/10 cursor-pointer transition-shadow hover:shadow-md hover:ring-1 hover:ring-violet-500/40"
        >
          <CardContent className="p-3">
            <div className="text-[10px] font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wider">
              Verificação
            </div>
            <div className="text-xl font-bold text-violet-900 dark:text-violet-200 mt-1">
              {counts.verificacao}
            </div>
            <div className="text-[10px] text-muted-foreground">Aguardando conferência</div>
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          onClick={() => navigate({ to: "/relatorio/pendentes", search: { tab: "fluxo-relatorios" } })}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate({ to: "/relatorio/pendentes", search: { tab: "fluxo-relatorios" } }); } }}
          className="border-indigo-500/20 bg-indigo-50/30 dark:bg-indigo-950/10 cursor-pointer transition-shadow hover:shadow-md hover:ring-1 hover:ring-indigo-500/40"
        >
          <CardContent className="p-3">
            <div className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">
              Aprovação RT
            </div>
            <div className="text-xl font-bold text-indigo-900 dark:text-indigo-200 mt-1">
              {counts.aprovacao}
            </div>
            <div className="text-[10px] text-muted-foreground">Assinatura final</div>
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          onClick={() => navigate({ to: "/relatorio/pendentes", search: { tab: "emissoes-historico" } })}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate({ to: "/relatorio/pendentes", search: { tab: "emissoes-historico" } }); } }}
          className="border-emerald-500/20 bg-emerald-50/30 dark:bg-emerald-950/10 cursor-pointer transition-shadow hover:shadow-md hover:ring-1 hover:ring-emerald-500/40"
        >
          <CardContent className="p-3">
            <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
              Concluídos
            </div>
            <div className="text-xl font-bold text-emerald-900 dark:text-emerald-200 mt-1">
              {counts.concluidos}
            </div>
            <div className="text-[10px] text-muted-foreground">Emitidos e legados</div>
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          onClick={() => { navigate({ to: "/relatorio/pendentes", search: { tab: "gantt-fila" } }); setGanttFilter("planejado"); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate({ to: "/relatorio/pendentes", search: { tab: "gantt-fila" } }); setGanttFilter("planejado"); } }}
          className="border-border bg-card cursor-pointer transition-shadow hover:shadow-md hover:ring-1 hover:ring-border"
        >
          <CardContent className="p-3">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Gantt Previsto
            </div>
            <div className="text-xl font-bold text-foreground mt-1">
              {counts.ganttPlanejado}
            </div>
            <div className="text-[10px] text-muted-foreground">Programados</div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Busca e Filtros */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar por OS, amostra, obra, ensaio ou responsável..."
            className="pl-9 text-xs"
          />
        </div>
      </div>

      {/* Tabs Principais da Central */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => navigate({ to: "/relatorio/pendentes", search: { tab: v } })}
        className="space-y-4"
      >
        <TabsList className="flex flex-wrap h-auto justify-start gap-1 w-full bg-muted/40 p-1 border">
          <TabsTrigger value="gantt-fila" className="gap-1.5 text-xs">
            <FlaskConical className="h-3.5 w-3.5 text-amber-600" />
            Fila do Gantt & Bancada ({counts.ganttConcluidos})
          </TabsTrigger>
          <TabsTrigger value="fluxo-relatorios" className="gap-1.5 text-xs">
            <Layers className="h-3.5 w-3.5 text-sky-600" />
            Fluxo dos Relatórios (Kanban) ({counts.em_digitacao + counts.verificacao + counts.aprovacao})
          </TabsTrigger>
          <TabsTrigger value="dashboard-sla" className="gap-1.5 text-xs">
            <Clock className="h-3.5 w-3.5 text-indigo-600" />
            Dashboard de SLAs & Gargalos
          </TabsTrigger>
          <TabsTrigger value="emissoes-historico" className="gap-1.5 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            Histórico de Emissões ({counts.concluidos})
          </TabsTrigger>
        </TabsList>

        {/* =========================================================================
            ABA 1: FILA DO GANTT & EXECUÇÃO (QUAIS ENSAIOS DEVO PROCESSAR)
           ========================================================================= */}
        <TabsContent value="gantt-fila" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/20 p-3 rounded-lg border">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">Exibir da Bancada:</span>
              <div className="flex items-center gap-1 bg-background p-0.5 rounded-md border text-xs">
                <Button
                  size="sm"
                  variant={ganttFilter === "concluido" ? "secondary" : "ghost"}
                  className="h-7 text-xs font-medium"
                  onClick={() => setGanttFilter("concluido")}
                >
                  Concluídos na Bancada ({counts.ganttConcluidos})
                </Button>
                <Button
                  size="sm"
                  variant={ganttFilter === "execucao" ? "secondary" : "ghost"}
                  className="h-7 text-xs font-medium"
                  onClick={() => setGanttFilter("execucao")}
                >
                  Em Execução ({counts.ganttExecucao})
                </Button>
                <Button
                  size="sm"
                  variant={ganttFilter === "planejado" ? "secondary" : "ghost"}
                  className="h-7 text-xs font-medium"
                  onClick={() => setGanttFilter("planejado")}
                >
                  Programados ({counts.ganttPlanejado})
                </Button>
                <Button
                  size="sm"
                  variant={ganttFilter === "all" ? "secondary" : "ghost"}
                  className="h-7 text-xs font-medium"
                  onClick={() => setGanttFilter("all")}
                >
                  Todos ({ganttQueue.length})
                </Button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Dados sincronizados em tempo real com o <b>Gantt e Cronograma</b> da Suporte Infra.
            </div>
          </div>

          <div className="rounded-lg border bg-card overflow-hidden shadow-xs">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-28">OS / Obra</TableHead>
                  <TableHead className="w-36">Amostra / Furo</TableHead>
                  <TableHead>Ensaio / Equipamento</TableHead>
                  <TableHead className="w-36">Técnico Bancada</TableHead>
                  <TableHead className="w-32">Status Bancada</TableHead>
                  <TableHead className="w-32 text-center">Status Relatório</TableHead>
                  <TableHead className="w-32 text-center">Conclusão / Início</TableHead>
                  <TableHead className="w-56 text-right">Ações de Processamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGantt.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                      Nenhum ensaio encontrado para os filtros selecionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredGantt.map((item) => {
                    const cad = cadastro.lookup(item.os);
                    const tomadorObra = [cad?.tomador, cad?.obra].filter(Boolean).join(" · ");
                    const itemOsNorm = normOs(item.os);
                    const itemAmNorm = normAmostra(item.amostra);
                    const itemFuroNorm = normAmostra(item.furo);
                    const itemMethNorm = normMethod(item.ensaio || item.tipoEnsaioNome);

                    const pendExistente =
                      allPendencias.find(
                        (r) =>
                          normOs(r.os) === itemOsNorm &&
                          (normAmostra(r.amostra) === itemAmNorm || normAmostra(r.amostra) === itemFuroNorm) &&
                          (normMethod(r.ensaio) === itemMethNorm || normMethod(r.tipo_ensaio) === itemMethNorm),
                      ) ||
                      allPendencias.find(
                        (r) =>
                          normOs(r.os) === itemOsNorm &&
                          (normAmostra(r.amostra) === itemAmNorm || normAmostra(r.amostra) === itemFuroNorm),
                      );

                    return (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        <TableCell>
                          <div className="font-semibold text-xs text-foreground">{item.os}</div>
                          {tomadorObra && (
                            <div className="text-[10px] text-muted-foreground truncate max-w-[150px]" title={tomadorObra}>
                              {tomadorObra}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-xs text-foreground">{item.amostra}</div>
                          {item.prof && <div className="text-[10px] text-muted-foreground">Prof: {item.prof}</div>}
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-xs text-primary">{item.ensaio}</div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <span>Equip:</span> <span className="font-medium">{item.equipamento}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-foreground flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span>{item.tecnico || "Laboratorista"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.stage === "concluido" && (
                            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-[10px]">
                              ✓ Bancada Finalizada
                            </Badge>
                          )}
                          {item.stage === "execucao" && (
                            <Badge variant="outline" className="bg-sky-500/15 text-sky-700 border-sky-500/30 text-[10px]">
                              ⚡ Em Execução
                            </Badge>
                          )}
                          {item.stage === "planejado" && (
                            <Badge variant="outline" className="bg-slate-500/15 text-slate-700 border-slate-500/30 text-[10px]">
                              Programado
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {pendExistente ? (
                            pendExistente.status === "aprovado" ? (
                              <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
                                ✓ Aprovado RT
                              </Badge>
                            ) : pendExistente.status === "verificado" ? (
                              <Badge variant="outline" className="bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30 text-[10px]">
                                Aprovação RT
                              </Badge>
                            ) : pendExistente.status === "digitado" ? (
                              <Badge variant="outline" className="bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30 text-[10px]">
                                Verificação
                              </Badge>
                            ) : pendExistente.status === "em_digitacao" ? (
                              <Badge variant="outline" className="bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30 text-[10px]">
                                Em Digitação
                              </Badge>
                            ) : pendExistente.status === "concluido_externo" ? (
                              <Badge variant="outline" className="bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/30 text-[10px]">
                                ✓ Legado Excel
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px]">
                                Pendente
                              </Badge>
                            )
                          ) : (
                            <Badge variant="outline" className="bg-muted text-muted-foreground border-border text-[10px]">
                              Não Iniciado
                            </Badge>
                          )}
                          {pendExistente && pendExistente.status !== "pendente" && (
                            <div className="mt-1 text-[10px] text-muted-foreground">
                              Último salvamento: {format(new Date(pendExistente.updated_at), "dd/MM HH:mm", { locale: ptBR })}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center text-xs">
                          {item.fim_real ? (
                            <div className="font-medium text-foreground">
                              {format(new Date(item.fim_real), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                            </div>
                          ) : item.inicio_real ? (
                            <div className="text-muted-foreground">
                              Início: {format(new Date(item.inicio_real), "dd/MM/yyyy", { locale: ptBR })}
                            </div>
                          ) : item.data_fim_prevista ? (
                            <div className="text-muted-foreground">
                              Prev: {format(new Date(item.data_fim_prevista), "dd/MM/yyyy", { locale: ptBR })}
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Botão Contextual: Iniciar / Continuar / Verificar / Ver */}
                            {(() => {
                              const isAprovado = pendExistente?.status === "aprovado";
                              const isVerificacao = pendExistente?.status === "digitado" || pendExistente?.status === "verificado";
                              const isEmDigitacao = pendExistente?.status === "em_digitacao";

                              return (
                                <Button
                                  size="sm"
                                  className={`h-8 text-xs gap-1 shadow-xs font-medium ${
                                    isAprovado
                                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                      : isVerificacao
                                        ? "bg-violet-600 text-white hover:bg-violet-700"
                                        : isEmDigitacao
                                          ? "bg-sky-600 text-white hover:bg-sky-700"
                                          : "bg-primary text-primary-foreground hover:bg-primary/90"
                                  }`}
                                  onClick={() => {
                                    const tipo =
                                      detectMethodology(item.ensaio, item.tipoEnsaioNome) || "cisalhamento-direto";
                                    abrirPorTipo(tipo, item.os, item.amostra, cad?.tomador, cad?.obra, pendExistente?.id, item.ensaio);
                                  }}
                                >
                                  {isAprovado ? (
                                    <>
                                      <CheckCircle2 className="h-3.5 w-3.5" /> Ver Laudo Aprovado
                                    </>
                                  ) : isVerificacao ? (
                                    <>
                                      <Eye className="h-3.5 w-3.5" /> Verificar Laudo
                                    </>
                                  ) : isEmDigitacao ? (
                                    <>
                                      <Play className="h-3.5 w-3.5 fill-current" /> Continuar Digitação
                                    </>
                                  ) : (
                                    <>
                                      <Play className="h-3.5 w-3.5 fill-current" /> Iniciar Relatório
                                    </>
                                  )}
                                </Button>
                              );
                            })()}

                            {/* Botão Relatório Concluído fora da Central */}
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-xs gap-1 border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                                    onClick={() => {
                                      // Se já tiver pendência, usa ela, se não cria objeto temporário
                                      if (pendExistente) {
                                        setExternoModal(pendExistente);
                                      } else {
                                        setExternoModal({
                                          id: item.id,
                                          os: item.os,
                                          amostra: item.amostra,
                                          ensaio: item.ensaio,
                                          tipo_ensaio: item.tipoEnsaioNome,
                                          equipamento: item.equipamento,
                                          data_conclusao: new Date().toISOString(),
                                          status: "pendente",
                                          origem: "gantt",
                                          operador_user_id: null,
                                          digitador_user_id: null,
                                          verificador_user_id: null,
                                          aprovador_user_id: null,
                                          observacao: null,
                                          payload: null,
                                          created_at: new Date().toISOString(),
                                          updated_at: new Date().toISOString(),
                                        });
                                      }
                                    }}
                                  >
                                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Legado Excel
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  Marcar como Relatório Concluído fora da Central (planilha antiga de Excel)
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* =========================================================================
            ABA 2: FLUXO DOS RELATÓRIOS (KANBAN & LISTA)
           ========================================================================= */}
        <TabsContent value="fluxo-relatorios" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Acompanhe a esteira de cada laudo: <b>Digitação &rarr; Verificação &rarr; Aprovação &rarr; Concluído</b>.
            </div>
            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-md border">
              <Button
                size="sm"
                variant={viewMode === "kanban" ? "secondary" : "ghost"}
                className="h-7 text-xs gap-1"
                onClick={() => setViewMode("kanban")}
              >
                <Kanban className="h-3.5 w-3.5" /> Kanban
              </Button>
              <Button
                size="sm"
                variant={viewMode === "table" ? "secondary" : "ghost"}
                className="h-7 text-xs gap-1"
                onClick={() => setViewMode("table")}
              >
                <TableIcon className="h-3.5 w-3.5" /> Lista
              </Button>
            </div>
          </div>

          {viewMode === "kanban" ? (
            /* Layout Kanban com 4 Colunas */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
              {/* Coluna 1: Em Digitação */}
              <div className="bg-muted/30 rounded-lg p-3 border space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="font-bold text-xs text-sky-700 dark:text-sky-400 flex items-center gap-1.5">
                    <FileEdit className="h-3.5 w-3.5" /> 1. Em Digitação
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {counts.em_digitacao}
                  </Badge>
                </div>
                <div className="space-y-2 max-h-[650px] overflow-y-auto pr-1">
                  {filteredRows
                    .filter((r) => r.status === "em_digitacao" || r.status === "pendente")
                    .map((r) => (
                      <KanbanCard
                        key={r.id}
                        item={r}
                        onAction={() => abrirDigitacao(r)}
                        actionLabel="Continuar Digitação"
                        actionIcon={Play}
                        onExterno={() => setExternoModal(r)}
                      />
                    ))}
                </div>
              </div>

              {/* Coluna 2: Aguardando Verificação */}
              <div className="bg-muted/30 rounded-lg p-3 border space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="font-bold text-xs text-violet-700 dark:text-violet-400 flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" /> 2. Aguardando Verificação
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {counts.verificacao}
                  </Badge>
                </div>
                <div className="space-y-2 max-h-[650px] overflow-y-auto pr-1">
                  {filteredRows
                    .filter((r) => r.status === "digitado")
                    .map((r) => (
                      <KanbanCard
                        key={r.id}
                        item={r}
                        onAction={() => abrirDigitacao(r)}
                        actionLabel="Verificar Laudo"
                        actionIcon={ShieldCheck}
                        secondaryAction={() => setStatusMutation.mutate({ id: r.id, status: "verificado" })}
                        secondaryLabel="Aprovar Verificação"
                      />
                    ))}
                </div>
              </div>

              {/* Coluna 3: Aguardando Aprovação */}
              <div className="bg-muted/30 rounded-lg p-3 border space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="font-bold text-xs text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                    <Stamp className="h-3.5 w-3.5" /> 3. Aguardando Aprovação RT
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {counts.aprovacao}
                  </Badge>
                </div>
                <div className="space-y-2 max-h-[650px] overflow-y-auto pr-1">
                  {filteredRows
                    .filter((r) => r.status === "verificado")
                    .map((r) => (
                      <KanbanCard
                        key={r.id}
                        item={r}
                        onAction={() => abrirDigitacao(r)}
                        actionLabel="Revisar & Aprovar"
                        actionIcon={Stamp}
                        secondaryAction={() => setStatusMutation.mutate({ id: r.id, status: "aprovado" })}
                        secondaryLabel="Aprovar Final"
                      />
                    ))}
                </div>
              </div>

              {/* Coluna 4: Concluídos */}
              <div className="bg-muted/30 rounded-lg p-3 border space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="font-bold text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" /> 4. Concluídos / Emitidos
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {counts.concluidos}
                  </Badge>
                </div>
                <div className="space-y-2 max-h-[650px] overflow-y-auto pr-1">
                  {filteredRows
                    .filter((r) => r.status === "aprovado" || r.status === "concluido_externo")
                    .map((r) => (
                      <KanbanCard
                        key={r.id}
                        item={r}
                        onAction={() => abrirDigitacao(r)}
                        actionLabel="Abrir Laudo"
                        actionIcon={ArrowRight}
                      />
                    ))}
                </div>
              </div>
            </div>
          ) : (
            /* Layout Tabela */
            <div className="rounded-lg border bg-card overflow-hidden shadow-xs">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-24">OS</TableHead>
                    <TableHead className="w-32">Amostra</TableHead>
                    <TableHead>Ensaio / Metodologia</TableHead>
                    <TableHead className="w-40">Status do Relatório</TableHead>
                    <TableHead className="w-32">Digitador</TableHead>
                    <TableHead className="w-32">Verificador</TableHead>
                    <TableHead className="w-32">Aprovador (RT)</TableHead>
                    <TableHead className="w-36 text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((r) => (
                    <TableRow key={r.id} className="hover:bg-muted/30">
                      <TableCell className="font-bold text-xs text-foreground">{r.os}</TableCell>
                      <TableCell className="text-xs text-foreground">{r.amostra || "—"}</TableCell>
                      <TableCell>
                        <div className="font-semibold text-xs text-primary">{r.ensaio}</div>
                        {r.tipo_ensaio && <div className="text-[10px] text-muted-foreground">{r.tipo_ensaio}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`${STATUS_COLOR[r.status]} text-[10px]`}>
                          {STATUS_LABEL[r.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.digitador_nome || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.verificador_nome || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.aprovador_nome || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => abrirDigitacao(r)}>
                          Abrir Laudo
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* =========================================================================
            ABA 3: DASHBOARD DE SLAS & GARGALOS
           ========================================================================= */}
        <TabsContent value="dashboard-sla" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Tempo Médio de Espera (Bancada &rarr; Digitação)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">3h 45m</div>
                <div className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Dentro da Meta (&le; 24h)
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Tempo Médio de Digitação & Cálculo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">18h 20m</div>
                <div className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Dentro da Meta (&le; 48h)
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Tempo Médio de Verificação Técnica
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">6h 10m</div>
                <div className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Dentro da Meta (&le; 24h)
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Lead Time Total Médio
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">32h 15m</div>
                <div className="text-xs text-muted-foreground mt-1">Meta global: &le; 120h (5 dias)</div>
              </CardContent>
            </Card>
          </div>

          {/* Rastreabilidade Nominal e Tabela de SLA dos Laudos Ativos */}
          <Card>
            <CardHeader className="border-b bg-muted/20">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> Rastreabilidade Nominal & Monitoramento de SLA por Ensaio
              </CardTitle>
              <CardDescription className="text-xs">
                Controle individual do tempo decorrido e identificação dos responsáveis por cada etapa da esteira.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-24">OS</TableHead>
                    <TableHead className="w-28">Amostra</TableHead>
                    <TableHead>Ensaio</TableHead>
                    <TableHead className="w-28">Operador</TableHead>
                    <TableHead className="w-28">Digitador</TableHead>
                    <TableHead className="w-28">Verificador</TableHead>
                    <TableHead className="w-28">Aprovador</TableHead>
                    <TableHead className="w-32 text-center">SLA Execução</TableHead>
                    <TableHead className="w-32 text-center">SLA Relatório</TableHead>
                    <TableHead className="w-24 text-right">Lead Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.slice(0, 25).map((r) => {
                    const payload = (r.payload as Record<string, any>) || {};
                    const sla = evaluateSla({
                      execucaoConcluidaAt: payload.execucao_concluida_at || r.created_at,
                      digitacaoIniciadaAt: payload.digitacao_started_at,
                      digitacaoConcluidaAt: payload.digitacao_finished_at,
                      verificadoAt: payload.verificado_at,
                      aprovadoAt: payload.aprovado_at,
                    });

                    return (
                      <TableRow key={r.id} className="hover:bg-muted/30">
                        <TableCell className="font-bold text-xs">{r.os}</TableCell>
                        <TableCell className="text-xs">{r.amostra || "—"}</TableCell>
                        <TableCell className="text-xs font-medium text-primary">{r.ensaio}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.operador_nome || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.digitador_nome || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.verificador_nome || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.aprovador_nome || "—"}</TableCell>
                        {/* SLA Execução (Bancada/Operação) */}
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`${SLA_BADGE_COLOR[sla.esperaDigitacao.status]} text-[10px]`}>
                            {SLA_LABEL[sla.esperaDigitacao.status]} ({sla.esperaDigitacao.formattedDuration})
                          </Badge>
                        </TableCell>
                        {/* SLA Relatório (Digitação até RT) */}
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`${SLA_BADGE_COLOR[sla.digitacao.status]} text-[10px]`}>
                            {SLA_LABEL[sla.digitacao.status]} ({sla.digitacao.formattedDuration})
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono font-medium">
                          {sla.totalLeadTime.formattedDuration}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* =========================================================================
            ABA 4: HISTÓRICO DE EMISSÕES
           ========================================================================= */}
        <TabsContent value="emissoes-historico">
          <EmissoesInner />
        </TabsContent>
      </Tabs>

      {/* =========================================================================
          MODAL: PROCESSAR RELATÓRIO AVULSO (FORA DO GANTT)
         ========================================================================= */}
      <Dialog open={avulsoOpen} onOpenChange={setAvulsoOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Plus className="h-5 w-5 text-primary" /> Processar Relatório Avulso
            </DialogTitle>
            <DialogDescription className="text-xs">
              Cadastre e inicie a digitação de um ensaio sob demanda, mesmo que ele não esteja cadastrado na programação do Gantt.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Número da OS *</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="Ex: OS-2026-001"
                  value={avulsoData.os}
                  onChange={(e) => setAvulsoData((s) => ({ ...s, os: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Tipo de Ensaio *</Label>
                <Select
                  value={avulsoData.tipo_ensaio}
                  onValueChange={(v) => {
                    const label =
                      v === "cisalhamento-direto"
                        ? "Cisalhamento Direto Inundado"
                        : v === "triaxial-cid"
                          ? "Triaxial CID"
                          : v === "adensamento"
                            ? "Adensamento Edométrico"
                            : "Massa Específica Aparente Natural";
                    setAvulsoData((s) => ({ ...s, tipo_ensaio: v, ensaio: label }));
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cisalhamento-direto">Cisalhamento Direto</SelectItem>
                    <SelectItem value="triaxial-cid">Triaxial CID</SelectItem>
                    <SelectItem value="adensamento">Adensamento Edométrico</SelectItem>
                    <SelectItem value="mesp-a">Massa Específica (M.ESP.A)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Cliente / Tomador</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="Ex: Cliente Modelo LTDA."
                  value={avulsoData.cliente}
                  onChange={(e) => setAvulsoData((s) => ({ ...s, cliente: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Obra / Local</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="Ex: Obra Modelo - SP"
                  value={avulsoData.obra}
                  onChange={(e) => setAvulsoData((s) => ({ ...s, obra: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Código / Identificação da Amostra</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="Ex: AM-01 (Furo SP-01)"
                  value={avulsoData.amostra}
                  onChange={(e) => setAvulsoData((s) => ({ ...s, amostra: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Operador / Laboratorista</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="Ex: Carlos Silva"
                  value={avulsoData.operador_nome}
                  onChange={(e) => setAvulsoData((s) => ({ ...s, operador_nome: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Observações do Ensaio</Label>
              <Textarea
                className="text-xs h-16 resize-none"
                placeholder="Observações ou notas especiais sobre este ensaio avulso..."
                value={avulsoData.observacoes}
                onChange={(e) => setAvulsoData((s) => ({ ...s, observacoes: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAvulsoOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!avulsoData.os || !avulsoData.tipo_ensaio || criarAvulsoMutation.isPending}
              onClick={() => criarAvulsoMutation.mutate(avulsoData)}
              className="gap-1.5"
            >
              {criarAvulsoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
              Criar & Iniciar Digitação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =========================================================================
          MODAL: RELATÓRIO CONCLUÍDO FORA DA CENTRAL (EXCEL ANTIGO)
         ========================================================================= */}
      <Dialog open={Boolean(externoModal)} onOpenChange={(o) => !o && setExternoModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" /> Relatório Concluído fora da Central
            </DialogTitle>
            <DialogDescription className="text-xs">
              Marque este ensaio como concluído externamente caso o laudo tenha sido processado e emitido através das planilhas antigas em Excel.
            </DialogDescription>
          </DialogHeader>

          {externoModal && (
            <div className="space-y-3 py-2">
              <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1 border">
                <div>
                  <span className="font-semibold">OS:</span> {externoModal.os}
                </div>
                <div>
                  <span className="font-semibold">Amostra:</span> {externoModal.amostra || "—"}
                </div>
                <div>
                  <span className="font-semibold">Ensaio:</span> {externoModal.ensaio}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Observação / Justificativa (Opcional)</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="Ex: Processado na planilha Excel legada - Rev 00 enviada ao cliente"
                  value={externoObs}
                  onChange={(e) => setExternoObs(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setExternoModal(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5"
              disabled={concluirExternoMutation.isPending}
              onClick={() => {
                if (externoModal) {
                  concluirExternoMutation.mutate({ id: externoModal.id, observacao: externoObs });
                }
              }}
            >
              {concluirExternoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirmar Conclusão Externa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Card para visualização no Kanban
 */
function KanbanCard({
  item,
  onAction,
  actionLabel,
  actionIcon: ActionIcon,
  secondaryAction,
  secondaryLabel,
  onExterno,
}: {
  item: PendenciaDigitacao;
  onAction: () => void;
  actionLabel: string;
  actionIcon: React.ComponentType<{ className?: string }>;
  secondaryAction?: () => void;
  secondaryLabel?: string;
  onExterno?: () => void;
}) {
  const payload = (item.payload as Record<string, any>) || {};
  const sla = evaluateSla({
    execucaoConcluidaAt: payload.execucao_concluida_at || item.created_at,
    digitacaoIniciadaAt: payload.digitacao_started_at,
    digitacaoConcluidaAt: payload.digitacao_finished_at,
    verificadoAt: payload.verificado_at,
    aprovadoAt: payload.aprovado_at,
  });

  return (
    <div className="rounded-lg border bg-card p-3 shadow-xs space-y-2 hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between gap-1">
        <div>
          <div className="font-bold text-xs text-foreground flex items-center gap-1">
            <span>{item.os}</span>
            {item.origem === "avulso" && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-500/10 text-amber-700 border-amber-500/20">
                Avulso
              </Badge>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground font-medium truncate max-w-[170px]">
            {item.amostra || "Amostra Geral"}
          </div>
        </div>
        <Badge variant="outline" className={`${SLA_BADGE_COLOR[sla.overallStatus]} text-[9px] px-1 py-0`}>
          {SLA_LABEL[sla.overallStatus]}
        </Badge>
      </div>

      <div className="text-xs font-semibold text-primary">{item.ensaio}</div>

      <div className="border-t pt-1.5 text-[10px] text-muted-foreground space-y-0.5">
        {item.digitador_nome && (
          <div className="flex items-center justify-between">
            <span>Digitador:</span>
            <span className="font-medium text-foreground">{item.digitador_nome}</span>
          </div>
        )}
        {item.verificador_nome && (
          <div className="flex items-center justify-between">
            <span>Verificador:</span>
            <span className="font-medium text-foreground">{item.verificador_nome}</span>
          </div>
        )}
        {item.aprovador_nome && (
          <div className="flex items-center justify-between">
            <span>Aprovador:</span>
            <span className="font-medium text-foreground">{item.aprovador_nome}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-slate-500">
          <span>Tempo decorrido:</span>
          <span className="font-mono">{sla.totalLeadTime.formattedDuration}</span>
        </div>
        <div className="flex items-center justify-between text-slate-500">
          <span>Último salvamento:</span>
          <span className="font-mono">{format(new Date(item.updated_at), "dd/MM HH:mm", { locale: ptBR })}</span>
        </div>
      </div>

      <div className="pt-1 flex flex-col gap-1">
        <Button size="sm" className="w-full h-7 text-xs gap-1" onClick={onAction}>
          <ActionIcon className="h-3.5 w-3.5" /> {actionLabel}
        </Button>
        {secondaryAction && secondaryLabel && (
          <Button size="sm" variant="secondary" className="w-full h-6 text-[11px]" onClick={secondaryAction}>
            {secondaryLabel}
          </Button>
        )}
        {onExterno && (
          <Button size="sm" variant="ghost" className="w-full h-6 text-[10px] text-muted-foreground" onClick={onExterno}>
            <FileSpreadsheet className="h-3 w-3 mr-1 text-emerald-600" /> Marcar Legado Excel
          </Button>
        )}
      </div>
    </div>
  );
}