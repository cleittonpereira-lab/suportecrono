import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { detectMethodology, methodologyRoute, type SupportedMethodology } from "@/features/mesp-natural/calc";
import { laudoDoEnsaio, montarMapa } from "@/lib/compatibilidade-laudos";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
  RefreshCw,
  Inbox,
  PackageCheck,
} from "lucide-react";
import { toast } from "sonner";
import { podeConcluirFora, podeVerificar } from "@/lib/papeis";
import { FAMILIAS, familiaDoEnsaio, type Familia } from "@/lib/familia-ensaio";
import { EmitidosView } from "@/features/lab/components/EmitidosView";
import {
  ETAPAS_DO_LAUDO,
  combinarEtapas,
  corEtapa,
  etapaParaPendencia,
  normalizarEtapa,
  pendenciaParaEtapa,
  rotuloEtapa,
} from "@/lib/etapa-laudo";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCadastroByOs } from "@/hooks/use-cadastro-by-os";
import { useAuth } from "@/hooks/use-auth";
import { EmissoesInner } from "@/components/emissoes-inner";
import { MesaDeLaudos } from "@/features/lab/components/MesaDeLaudos";
import { EntregasView } from "@/features/lab/components/EntregasView";
import { useLaudosNoFluxo } from "@/features/lab/hooks/use-laudos-no-fluxo";
import { filaDoLaudo } from "@/lib/mesa-de-laudos";
import { OsReportsView } from "@/features/lab/components/OsReportsView";
import { evaluateSla, formatHours, type SlaStatus } from "@/lib/sla-calc";

export const Route = createFileRoute("/_app/relatorio/pendentes")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Central de Relatórios — Suporte INFRA" },
      {
        name: "description",
        content: "Da bancada ao laudo emitido: fila da bancada, digitação, verificação e aprovação.",
      },
    ],
  }),
  component: CentralRelatoriosPage,
});

// Rótulos e cores de src/lib/etapa-laudo.ts (os mesmos da visão por OS, da
// página da OS e da Central de Emissões), no vocabulário gravado nas pendências.
const STATUS_PENDENCIA = ETAPAS_DO_LAUDO.map(etapaParaPendencia);
const STATUS_LABEL = Object.fromEntries(
  STATUS_PENDENCIA.map((s) => [s, rotuloEtapa(pendenciaParaEtapa(s))]),
) as Record<PendenciaDigitacao["status"], string>;
const STATUS_COLOR = Object.fromEntries(
  STATUS_PENDENCIA.map((s) => [s, corEtapa(pendenciaParaEtapa(s))]),
) as Record<PendenciaDigitacao["status"], string>;

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

/** Os laudos que o app sabe abrir (features/mesp-natural/calc.ts → methodologyRoute). */
const METODOLOGIAS: SupportedMethodology[] = [
  "cisalhamento-direto",
  "adensamento",
  "triaxial-cid",
  "mesp-a",
  "asf-dap",
  "asf-tb",
  "perm-v",
  "compressao-simples",
];

/** As colunas da esteira (Kanban) — o filtro de etapa e os cartões do topo usam as mesmas. */
type EtapaFiltro = "all" | "digitacao" | "verificacao" | "aprovacao" | "concluidos";
const ETAPA_FILTRO: Record<Exclude<EtapaFiltro, "all">, { rotulo: string; status: PendenciaDigitacao["status"][] }> = {
  digitacao: { rotulo: "Em digitação", status: ["pendente", "em_digitacao"] },
  verificacao: { rotulo: "Aguardando verificação", status: ["digitado"] },
  aprovacao: { rotulo: "Aguardando aprovação", status: ["verificado"] },
  concluidos: { rotulo: "Concluídos (falta entregar)", status: ["aprovado", "concluido_externo"] },
};

const ABAS = ["meus-laudos", "entregas", "gantt-fila", "fluxo-relatorios", "emissoes-historico", "por-os"] as const;
type Aba = (typeof ABAS)[number];

/** Prazos (SLA) de uma pendência, pelas datas gravadas no payload. */
function slaDaPendencia(r: PendenciaDigitacao) {
  const payload = (r.payload as Record<string, any>) || {};
  return evaluateSla({
    execucaoConcluidaAt: payload.execucao_concluida_at || r.created_at,
    digitacaoIniciadaAt: payload.digitacao_started_at,
    digitacaoConcluidaAt: payload.digitacao_finished_at,
    verificadoAt: payload.verificado_at,
    aprovadoAt: payload.aprovado_at,
  });
}


// normOs/normAmostra/normMethod: ver src/lib/pendencia-match.ts (compartilhado com os editores de relatório).

function CentralRelatoriosPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = Route.useSearch();
  // Quem só digita abre em "Para digitar"; quem verifica/aprova, em "Meus laudos".
  const authDaAba = useAuth();
  const abaPadrao: Aba = podeVerificar({ role: authDaAba.role, labRole: authDaAba.profile?.labRole })
    ? "meus-laudos"
    : "gantt-fila";
  // A aba "dashboard-sla" (números fixos, removida) cai na esteira, onde está o prazo de cada laudo.
  const activeTab: Aba = (ABAS as readonly string[]).includes(search.tab ?? "")
    ? (search.tab as Aba)
    : search.tab === "dashboard-sla"
      ? "fluxo-relatorios"
      : abaPadrao;
  const listFn = useServerFn(listPendenciasDigitacao);
  const updFn = useServerFn(atualizarPendenciaDigitacao);
  const conclExtFn = useServerFn(concluirPendenciaExterna);
  const criarAvulsoFn = useServerFn(criarRelatorioAvulso);
  const delFn = useServerFn(removerPendenciaDigitacao);
  const rows0Fn = useServerFn(listRows);

  const [busca, setBusca] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  // "digitar" = bancada finalizada e laudo não iniciado/em digitação: o que falta a quem digita.
  const [ganttFilter, setGanttFilter] = useState<"digitar" | "all" | "concluido" | "execucao" | "planejado">("digitar");
  // Filtro por tipo de ensaio, o mesmo em todas as abas (substitui os itens por tipo do menu).
  const [familia, setFamilia] = useState<Familia | "all">("all");
  const [soMeus, setSoMeus] = useState(false);
  const [etapaFiltro, setEtapaFiltro] = useState<EtapaFiltro>("all");

  const { user, role, profile } = useAuth();
  // "Legado Excel" (concluído fora da Central): só quem verifica — o servidor também confere.
  const podeMarcarFora = podeConcluirFora({ role, labRole: profile?.labRole });

  // Modais
  const [avulsoOpen, setAvulsoOpen] = useState(false);
  const [avulsoData, setAvulsoData] = useState({
    os: "",
    cliente: "",
    obra: "",
    amostra: "",
    ensaio: ENSAIO_LABEL["cisalhamento-direto"],
    tipo_ensaio: "cisalhamento-direto",
    operador_nome: "",
    observacoes: "",
  });

  const [externoModal, setExternoModal] = useState<PendenciaDigitacao | null>(null);
  const [externoObs, setExternoObs] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<PendenciaDigitacao | null>(null);
  const [excluirEnsaioTambem, setExcluirEnsaioTambem] = useState(false);

  // Queries
  const labState = useLabState();

  const { data: rows = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["lab-pendencias"],
    queryFn: () => listFn(),
    // Mesmo intervalo das outras telas que usam esta consulta (visão por OS,
    // lista por tipo): o menor intervalo entre elas é o que vale.
    refetchInterval: 30_000,
  });

  function mapWorkflowStatus(status?: string | null): PendenciaDigitacao["status"] {
    return etapaParaPendencia(normalizarEtapa(status) ?? "em_digitacao");
  }

  // Lista unificada de pendências (Supabase + Estado soberano labState)
  const allPendencias = useMemo(() => {
    const map = new Map<string, PendenciaDigitacao>();

    for (const r of rows) {
      const key = `${normOs(r.os)}::${normAmostra(r.amostra || "")}::${normMethod(r.ensaio || r.tipo_ensaio)}`;
      // Um objeto só para as duas chaves. Eram duas cópias: o labStore abaixo
      // atualizava uma, e a deduplicação no fim podia ficar com a outra, ainda
      // com o status antigo.
      const item = { ...r, status: mapWorkflowStatus(r.status) };
      map.set(key, item);
      map.set(r.id, item);
    }

    if (labState?.os) {
      for (const o of labState.os) {
        for (const a of o.amostras) {
          for (const e of a.ensaios) {
            const hasData = e.payload && Object.keys(e.payload).length > 0;
            const etapaEnsaio = normalizarEtapa(e.status) ?? "em_digitacao";
            const isEmProgresso = etapaEnsaio !== "em_digitacao" || hasData || e.status === "em_digitacao" || e.status === "processando";
            if (!isEmProgresso) continue;

            const key = `${normOs(o.numero)}::${normAmostra(a.reportNumber || a.code || "")}::${normMethod(e.sigla || e.nome || e.tipo)}`;
            const existing = map.get(key) || map.get(e.id);

            if (existing) {
              // Regra única (src/lib/etapa-laudo.ts): o fluxo formal do ensaio
              // vence; fora dele, a etapa mais avançada. Antes o status do
              // ensaio sobrescrevia sempre: um rascunho com dados apagava um
              // "Concluído fora (Excel)" ou um "Aguardando verificação" da pendência.
              existing.status = etapaParaPendencia(combinarEtapas(etapaEnsaio, pendenciaParaEtapa(existing.status)));
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
                status: etapaParaPendencia(combinarEtapas(etapaEnsaio, null)),
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

    // O map acima guarda cada pendência tanto pela chave normalizada
    // (os+amostra+metodologia) quanto pelo id bruto — isso ajuda o merge com
    // o labStore acima a achar uma pendência já existente mesmo quando o
    // texto do ensaio não bate exatamente. Efeito colateral: se duas
    // pendências no servidor têm ids diferentes pro MESMO ensaio real (ex.:
    // criadas por dois fluxos de digitalização com texto de ensaio
    // ligeiramente diferente), as duas sobrevivem em map.values() porque
    // cada uma também está indexada pelo próprio id. Corrige agrupando de
    // novo pela chave normalizada e mantendo só a mais recente de cada
    // grupo — garante uma linha por ensaio na tela mesmo que o backend
    // tenha duplicado o registro.
    const porChaveNormalizada = new Map<string, PendenciaDigitacao>();
    for (const p of map.values()) {
      const k = `${normOs(p.os)}::${normAmostra(p.amostra || "")}::${normMethod(p.ensaio || p.tipo_ensaio)}`;
      const atual = porChaveNormalizada.get(k);
      if (!atual || new Date(p.updated_at || p.created_at) > new Date(atual.updated_at || atual.created_at)) {
        porChaveNormalizada.set(k, p);
      }
    }

    return Array.from(porChaveNormalizada.values()).sort(
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
  // Sigla → laudo como o laboratório declarou em Programação → Tipos de Ensaio
  // (coluna "Tipo de Relatório"). Antes a Central ignorava essa coluna.
  const mapaLaudos = useMemo(() => montarMapa(tiposProg as any[]), [tiposProg]);

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

    const doProgs = progs.map((p) => {
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
        programacaoId: p.id as string | null,
        os: a?.os_numero ?? "—",
        amostra: a?.codigo_amostra ?? a?.identificacao ?? "—",
        furo: a?.identificacao ?? "",
        prof: a?.topo_m && a?.base_m ? `${a.topo_m} – ${a.base_m} m` : "",
        // Sem tipo cadastrado, a etiqueta da planilha (ex.: "CD3.IN") — antes aparecia o status ("pendente").
        ensaio: t?.nome ?? e?.etiqueta ?? "Tipo não identificado",
        tipoEnsaioNome: t?.nome ?? e?.etiqueta ?? "",
        equipamento: eq?.nome ?? "—",
        inicio_real: p.data_inicio_real || p.inicio_real_ts || null,
        fim_real: p.data_fim_real || p.fim_real_ts || null,
        data_fim_prevista: p.data_fim || null,
        tecnico: p.tecnico || null,
        stage,
      };
    });

    // Sistema unificado: um ensaio sem Programação formal (equipamento/data
    // agendados), mas com digitação ativa (QR já escaneado, "em_digitacao"),
    // também conta como "em bancada" — alguém está de fato trabalhando nele.
    // Evita duplicar quando o MESMO ensaio já tem Programação formal (nesse
    // caso a pendência associada aparece via "Ações de Processamento" na
    // linha vinda de doProgs, não precisa de uma segunda linha).
    const jaProgramado = new Set(
      doProgs.map((g) => `${normOs(g.os)}::${normAmostra(g.amostra)}::${normMethod(g.ensaio || g.tipoEnsaioNome)}`),
    );
    const doPendencias = allPendencias
      // "pendente" era convertido em "em_digitacao" na leitura; agora fica como está.
      .filter((r) => r.status === "em_digitacao" || r.status === "pendente")
      .filter((r) => !jaProgramado.has(`${normOs(r.os)}::${normAmostra(r.amostra || "")}::${normMethod(r.ensaio || r.tipo_ensaio)}`))
      .map((r) => ({
        id: `pend_${r.id}`,
        programacaoId: null as string | null,
        os: r.os,
        amostra: r.amostra ?? "—",
        furo: "",
        prof: "",
        ensaio: r.ensaio,
        tipoEnsaioNome: r.ensaio,
        equipamento: "—",
        inicio_real: r.created_at || null,
        fim_real: null as string | null,
        data_fim_prevista: null as string | null,
        tecnico: r.digitador_nome || r.operador_nome || null,
        stage: "execucao" as const,
      }));

    return [...doProgs, ...doPendencias];
  }, [progs, amostrasProg, ensaiosProg, tiposProg, equipsProg, allPendencias]);

  // Laudos no fluxo formal (uma leitura para o quadro, as entregas e os cartões).
  const { data: laudos = [] } = useLaudosNoFluxo();
  // Laudo aprovado e ENTREGUE (SOND + GDrive) sai da esteira — antes todo
  // aprovado ficava empilhado em "Concluídos" para sempre.
  const chavesEntregues = useMemo(() => {
    const s = new Set<string>();
    for (const l of laudos) {
      if (!l.entrega?.entregue) continue;
      for (const am of [l.amostra_numero, l.amostra_code]) {
        if (am) s.add(`${normOs(l.os_numero)}::${normAmostra(am)}::${normMethod(l.ensaio_tipo || l.ensaio_nome)}`);
      }
    }
    return s;
  }, [laudos]);
  const naoEntregue = (r: PendenciaDigitacao) =>
    !chavesEntregues.has(`${normOs(r.os)}::${normAmostra(r.amostra || "")}::${normMethod(r.ensaio || r.tipo_ensaio)}`);
  // Tipos que aparecem na bancada ou nos laudos (só esses viram botão no filtro).
  const familiasPresentes = useMemo(() => {
    const s = new Set<Familia>();
    for (const g of ganttQueue) s.add(familiaDoEnsaio(g.tipoEnsaioNome, g.ensaio));
    for (const l of laudos) s.add(familiaDoEnsaio(l.ensaio_tipo, l.ensaio_nome));
    return FAMILIAS.filter((f) => s.has(f.id));
  }, [ganttQueue, laudos]);
  // Devolvidos pelo verificador e revisões reabertas: voltam para quem digita.
  const devolvidos = useMemo(
    () =>
      laudos
        .filter((l) => l.status === "rejeitado_verificacao" || l.status === "em_revisao")
        .filter((l) => familia === "all" || familiaDoEnsaio(l.ensaio_tipo, l.ensaio_nome) === familia),
    [laudos, familia],
  );

  const resumoDoFluxo = useMemo(() => {
    const dia = 86_400_000;
    let verificar = 0, aprovar = 0, aEntregar = 0, entregues30 = 0;
    for (const l of laudos) {
      if (l.rev == null) continue;
      if (familia !== "all" && familiaDoEnsaio(l.ensaio_tipo, l.ensaio_nome) !== familia) continue;
      const fila = filaDoLaudo(l.status);
      if (fila === "verificar") verificar++;
      else if (fila === "aprovar") aprovar++;
      else if (fila === "aprovado" && l.entrega) {
        if (!l.entrega.entregue) aEntregar++;
        else if (Date.now() - Date.parse(l.entrega.entregueEm ?? "") < 30 * dia) entregues30++;
      }
    }
    return { verificar, aprovar, aEntregar, entregues30 };
  }, [laudos, familia]);

  // Filtro de busca global + status/tipo/"só meus"
  const filteredRows = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return allPendencias.filter((r) => {
      if (!naoEntregue(r)) return false;
      if (soMeus && user?.id && r.digitador_user_id !== user.id && r.operador_user_id !== user.id) return false;
      if (etapaFiltro !== "all" && !ETAPA_FILTRO[etapaFiltro].status.includes(r.status)) return false;
      if (familia !== "all" && familiaDoEnsaio(r.tipo_ensaio, r.ensaio) !== familia) return false;
      if (!q) return true;
      return (
        r.os.toLowerCase().includes(q) ||
        (r.amostra ?? "").toLowerCase().includes(q) ||
        r.ensaio.toLowerCase().includes(q) ||
        (r.tipo_ensaio ?? "").toLowerCase().includes(q) ||
        (r.operador_nome ?? "").toLowerCase().includes(q) ||
        (r.digitador_nome ?? "").toLowerCase().includes(q)
      );
    });
  }, [allPendencias, busca, soMeus, etapaFiltro, familia, user, chavesEntregues]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Pendência de digitação da linha da bancada (mesma OS, amostra/furo e tipo). */
  const acharPendencia = (item: { os: string; amostra: string; furo: string; ensaio: string; tipoEnsaioNome: string }) => {
    const itemOsNorm = normOs(item.os);
    const itemAmNorm = normAmostra(item.amostra);
    const itemFuroNorm = normAmostra(item.furo);
    const itemMethNorm = normMethod(item.ensaio || item.tipoEnsaioNome);
    return (
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
      )
    );
  };
  /** Para digitar: bancada finalizada e laudo ainda não enviado para verificação. */
  const faltaDigitar = (item: (typeof ganttQueue)[number]) => {
    if (item.stage !== "concluido") return false;
    const p = acharPendencia(item);
    return !p || p.status === "pendente" || p.status === "em_digitacao";
  };
  const ganttDaFamilia = useMemo(
    () =>
      familia === "all"
        ? ganttQueue
        : ganttQueue.filter((g) => familiaDoEnsaio(g.tipoEnsaioNome, g.ensaio) === familia),
    [ganttQueue, familia],
  );

  const filteredGantt = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return ganttDaFamilia.filter((item) => {
      if (ganttFilter === "digitar") {
        if (!faltaDigitar(item)) return false;
      } else if (ganttFilter !== "all" && item.stage !== ganttFilter) return false;
      if (!q) return true;
      return (
        item.os.toLowerCase().includes(q) ||
        item.amostra.toLowerCase().includes(q) ||
        item.ensaio.toLowerCase().includes(q) ||
        item.equipamento.toLowerCase().includes(q) ||
        (item.tecnico ?? "").toLowerCase().includes(q)
      );
    });
  }, [ganttDaFamilia, ganttFilter, busca, allPendencias]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendDaFamilia =
    familia === "all" ? allPendencias : allPendencias.filter((r) => familiaDoEnsaio(r.tipo_ensaio, r.ensaio) === familia);

  // Contadores
  const counts = useMemo(() => {
    const c = {
      ganttDigitar: ganttDaFamilia.filter(faltaDigitar).length,
      ganttConcluidos: ganttDaFamilia.filter((g) => g.stage === "concluido").length,
      ganttExecucao: ganttDaFamilia.filter((g) => g.stage === "execucao").length,
      ganttPlanejado: ganttDaFamilia.filter((g) => g.stage === "planejado").length,
      em_digitacao: pendDaFamilia.filter((r) => r.status === "em_digitacao" || r.status === "pendente").length,
      verificacao: pendDaFamilia.filter((r) => r.status === "digitado").length,
      aprovacao: pendDaFamilia.filter((r) => r.status === "verificado").length,
      concluidos: pendDaFamilia.filter((r) => (r.status === "aprovado" || r.status === "concluido_externo") && naoEntregue(r)).length,
    };
    return c;
  }, [ganttDaFamilia, allPendencias, chavesEntregues, familia]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cartões do topo: cada um abre a aba e o filtro que mostram exatamente o que ele conta.
  const irPara = (tab: Aba) => navigate({ to: "/relatorio/pendentes", search: { tab } });
  const naEsteira = (f: Exclude<EtapaFiltro, "all">) => () => {
    irPara("fluxo-relatorios");
    setEtapaFiltro(f);
  };
  const cartoesDeEtapa = [
    {
      chave: "bancada",
      rotulo: "Para digitar",
      valor: counts.ganttDigitar,
      dica: "Bancada finalizada, laudo por fazer",
      classe: "border-amber-500/20 bg-amber-50/30 dark:bg-amber-950/10",
      corTexto: "text-amber-700 dark:text-amber-400",
      ativo: activeTab === "gantt-fila" && ganttFilter === "digitar",
      abrir: () => {
        irPara("gantt-fila");
        setGanttFilter("digitar");
      },
    },
    {
      chave: "digitacao",
      rotulo: ETAPA_FILTRO.digitacao.rotulo,
      valor: counts.em_digitacao,
      dica: "Cálculos e gráficos",
      classe: "border-sky-500/20 bg-sky-50/30 dark:bg-sky-950/10",
      corTexto: "text-sky-700 dark:text-sky-400",
      ativo: activeTab === "fluxo-relatorios" && etapaFiltro === "digitacao",
      abrir: naEsteira("digitacao"),
    },
    {
      chave: "verificacao",
      rotulo: ETAPA_FILTRO.verificacao.rotulo,
      valor: resumoDoFluxo.verificar,
      dica: "Conferência técnica — abre Meus laudos",
      classe: "border-violet-500/20 bg-violet-50/30 dark:bg-violet-950/10",
      corTexto: "text-violet-700 dark:text-violet-400",
      ativo: false,
      abrir: () => irPara("meus-laudos"),
    },
    {
      chave: "aprovacao",
      rotulo: ETAPA_FILTRO.aprovacao.rotulo,
      valor: resumoDoFluxo.aprovar,
      dica: "Assinatura do RT — abre Meus laudos",
      classe: "border-indigo-500/20 bg-indigo-50/30 dark:bg-indigo-950/10",
      corTexto: "text-indigo-700 dark:text-indigo-400",
      ativo: false,
      abrir: () => irPara("meus-laudos"),
    },
    {
      chave: "entregar",
      rotulo: "A entregar",
      valor: resumoDoFluxo.aEntregar,
      dica: "Aprovados — falta SOND/GDrive",
      classe: "border-orange-500/20 bg-orange-50/30 dark:bg-orange-950/10",
      corTexto: "text-orange-700 dark:text-orange-400",
      ativo: activeTab === "entregas",
      abrir: () => irPara("entregas"),
    },
    {
      chave: "entregues",
      rotulo: "Entregues (30 dias)",
      valor: resumoDoFluxo.entregues30,
      dica: "SOND e GDrive marcados",
      classe: "border-emerald-500/20 bg-emerald-50/30 dark:bg-emerald-950/10",
      corTexto: "text-emerald-700 dark:text-emerald-400",
      ativo: false,
      abrir: () => irPara("entregas"),
    },
  ];

  // Mutações. Verificar e aprovar NÃO têm atalho aqui: acontecem no laudo e na
  // aba "Meus laudos" (fluxo formal, com revisão e responsáveis).
  // Os botões "Aprovar Verificação"/"Aprovar Final" do Kanban mudavam só o
  // status da pendência, e o fluxo formal o sobrepunha — pareciam não ter efeito.
  const concluirExternoMutation = useMutation({
    mutationFn: (v: { id: string; observacao?: string; os?: string; amostra?: string | null; ensaio?: string; tipo_ensaio?: string | null; equipamento?: string | null }) => conclExtFn({ data: v }),
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
      setExcluirEnsaioTambem(false);
      toast.success("Pendência excluída.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /**
   * A Central reconstrói o card sozinha a partir do PRÓPRIO ensaio sempre que
   * ele tem progresso (payload ou status além de "em digitação") — ver
   * `allPendencias` acima. "Excluir pendência" some com o registro de
   * acompanhamento, mas não com isso: pra um ensaio que já avançou (aguardando
   * verificação/aprovação, por exemplo), o card sempre volta. Achar o
   * ensaio real por trás do card permite excluí-lo de vez — usado só quando o
   * usuário confirma explicitamente que quer apagar os dados, não só o card.
   */
  function acharEnsaioDaPendencia(p: PendenciaDigitacao): { osId: string; amId: string; enId: string } | null {
    if (!labState?.os) return null;
    const osN = normOs(p.os);
    const amN = normAmostra(p.amostra || "");
    const metN = normMethod(p.ensaio || p.tipo_ensaio);
    for (const o of labState.os) {
      if (normOs(o.numero) !== osN) continue;
      for (const a of o.amostras) {
        if (normAmostra(a.reportNumber || a.code || "") !== amN) continue;
        for (const e of a.ensaios) {
          if (e.id === p.id || normMethod(e.sigla || e.nome || e.tipo) === metN) {
            return { osId: o.id, amId: a.id, enId: e.id };
          }
        }
      }
    }
    return null;
  }

  // Roteamento inteligente para os editores de laudo
  // Ensaio sem laudo no app avisa — antes abria o Triaxial (daqui) ou o Cisalhamento (da fila) no lugar.
  function avisarSemLaudo(ensaio: string) {
    toast.error(`Não há laudo no app para "${ensaio}". Confira o tipo do ensaio na programação.`);
  }

  function abrirDigitacao(r: PendenciaDigitacao) {
    // A tabela do laboratório manda; a sigla é a reserva. Devolve a VARIANTE
    // do triaxial (CID/CIU/UU) — antes só existia "triaxial-cid".
    const tipo = laudoDoEnsaio(r.ensaio, r.tipo_ensaio, mapaLaudos);
    if (!tipo) return avisarSemLaudo(r.ensaio);
    abrirPorTipo(tipo, r.os, r.amostra ?? "", undefined, undefined, r.id, r.ensaio, r.status);
  }

  function abrirPorTipo(
    tipo: string,
    osNum: string,
    amCode: string,
    cliente?: string,
    obra?: string,
    pendenciaId?: string,
    siglaOficial?: string,
    currentStatus?: PendenciaDigitacao["status"],
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

    // Se temos pendência vinculada, marca como em_digitacao e grava o
    // vínculo com o ensaio (osId/amostraId/ensaioId) dentro do payload da
    // pendência — permite que uma próxima leitura do QR busque direto
    // (sem varrer pasta nenhuma) as fotos já adicionadas no escritório. Só
    // regride o status pra em_digitacao se ele ainda não tiver avançado —
    // só ABRIR um laudo já digitado/verificado/aprovado (ex.: reabrir pra
    // gerar uma nova revisão pós-aprovação) não pode fazer o Kanban voltar
    // a mostrá-lo como "Em Digitação".
    if (pendenciaId) {
      const jaAvancou = currentStatus === "digitado" || currentStatus === "verificado" || currentStatus === "aprovado" || currentStatus === "concluido_externo";
      updFn({
        data: {
          id: pendenciaId,
          status: jaAvancou && currentStatus ? currentStatus : "em_digitacao",
          payload: { _linkedEnsaio: { osId: os.id, amostraId: am.id, ensaioId: en.id } },
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
            <Sparkles className="h-3.5 w-3.5 text-primary" /> Laudos
          </div>
          <h1 className="mt-1 font-display text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Central de Relatórios
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Da bancada ao laudo entregue: digitação, verificação, aprovação e entrega (SOND e GDrive).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setAvulsoOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Relatório avulso
          </Button>
          <Button variant="outline" onClick={() => navigate({ to: "/programacao/gantt" })} className="gap-1.5">
            <Calendar className="h-4 w-4 text-muted-foreground" /> Ver Gantt
          </Button>
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Atualizar" aria-label="Atualizar">
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Etapas: cada cartão abre a aba e o filtro que mostram o que ele conta */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {cartoesDeEtapa.map((c) => (
          <Card
            key={c.chave}
            role="button"
            tabIndex={0}
            onClick={c.abrir}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                c.abrir();
              }
            }}
            className={`cursor-pointer transition-shadow hover:shadow-md ${c.classe} ${c.ativo ? "ring-2 ring-primary/60" : ""}`}
          >
            <CardContent className="p-3">
              <div className={`text-[10px] font-semibold uppercase tracking-wider ${c.corTexto}`}>{c.rotulo}</div>
              <div className="text-xl font-bold text-foreground mt-1 tabular-nums">{c.valor}</div>
              <div className="text-[10px] text-muted-foreground">{c.dica}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tipo de ensaio — vale para todas as abas */}
      {familiasPresentes.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold text-muted-foreground">Tipo de ensaio:</span>
          {[{ id: "all" as const, rotulo: "Todos" }, ...familiasPresentes].map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={familia === f.id ? "default" : "outline"}
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => setFamilia(f.id)}
            >
              {f.rotulo}
            </Button>
          ))}
        </div>
      )}

      {/* Busca e filtros — só nas abas em que valem (as outras duas têm os seus) */}
      {(activeTab === "gantt-fila" || activeTab === "fluxo-relatorios") && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={
                activeTab === "gantt-fila"
                  ? "Filtrar por OS, amostra, ensaio, equipamento ou técnico..."
                  : "Filtrar por OS, amostra, ensaio ou responsável..."
              }
              className="pl-9 text-xs"
            />
          </div>

          {activeTab === "fluxo-relatorios" && (
            <div className="flex flex-wrap items-center gap-2">
              <Select value={etapaFiltro} onValueChange={(v) => setEtapaFiltro(v as EtapaFiltro)}>
                <SelectTrigger className="h-8 w-[190px] text-xs">
                  <SelectValue placeholder="Etapa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as etapas</SelectItem>
                  {(Object.keys(ETAPA_FILTRO) as Exclude<EtapaFiltro, "all">[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {ETAPA_FILTRO[k].rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <label className="flex items-center gap-1.5 text-xs text-muted-foreground pl-1 cursor-pointer select-none">
                <Switch checked={soMeus} onCheckedChange={setSoMeus} />
                Só meus
              </label>

              {(etapaFiltro !== "all" || soMeus || busca) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => {
                    setEtapaFiltro("all");
                    setSoMeus(false);
                    setBusca("");
                  }}
                >
                  Limpar filtros
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tabs Principais da Central */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => navigate({ to: "/relatorio/pendentes", search: { tab: v } })}
        className="space-y-4"
      >
        <TabsList className="flex flex-wrap h-auto justify-start gap-1 w-full bg-muted/40 p-1 border">
          <TabsTrigger value="meus-laudos" className="gap-1.5 text-xs font-semibold">
            <Inbox className="h-3.5 w-3.5 text-primary" />
            Meus laudos
          </TabsTrigger>
          <TabsTrigger value="entregas" className="gap-1.5 text-xs">
            <PackageCheck className="h-3.5 w-3.5 text-orange-600" />
            Entregas ({resumoDoFluxo.aEntregar})
          </TabsTrigger>
          <TabsTrigger value="gantt-fila" className="gap-1.5 text-xs">
            <FlaskConical className="h-3.5 w-3.5 text-amber-600" />
            Para digitar ({counts.ganttDigitar})
          </TabsTrigger>
          <TabsTrigger value="fluxo-relatorios" className="gap-1.5 text-xs">
            <Layers className="h-3.5 w-3.5 text-sky-600" />
            Esteira dos laudos ({counts.em_digitacao + counts.verificacao + counts.aprovacao})
          </TabsTrigger>
          <TabsTrigger value="emissoes-historico" className="gap-1.5 text-xs">
            <ShieldCheck className="h-3.5 w-3.5 text-violet-600" />
            Todos os laudos emitidos
          </TabsTrigger>
          <TabsTrigger value="por-os" className="gap-1.5 text-xs">
            <Building className="h-3.5 w-3.5 text-orange-600" />
            Por OS
          </TabsTrigger>
        </TabsList>

        {/* =========================================================================
            ABA 1: FILA DO GANTT & EXECUÇÃO (QUAIS ENSAIOS DEVO PROCESSAR)
           ========================================================================= */}
        <TabsContent value="gantt-fila" className="space-y-4">
          {devolvidos.length > 0 && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-3">
              <div className="mb-2 text-xs font-semibold text-rose-800 dark:text-rose-300">
                Devolvidos para correção ({devolvidos.length}) — corrija e envie para verificação de novo
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {devolvidos.map((l) => {
                  const p = l.scope_id.split("/");
                  const ids = { osId: p[p.indexOf("os") + 1], amostraId: p[p.indexOf("amostra") + 1], ensaioId: p[p.indexOf("ensaio") + 1] };
                  return (
                    <div key={l.scope_id} className="flex items-start justify-between gap-2 rounded-md border bg-card p-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-semibold">
                          OS {l.os_numero} · {l.amostra_numero || l.amostra_code} · {ENSAIO_LABEL[l.ensaio_tipo as keyof typeof ENSAIO_LABEL] ?? l.ensaio_nome}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {l.status === "em_revisao"
                            ? `Rev-${String(l.rev ?? 0).padStart(2, "0")} reaberta para correção`
                            : `“${l.verification_comment ?? "sem comentário"}” — ${l.verified_by_name ?? "verificador"}`}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="h-7 shrink-0 text-xs"
                        onClick={() => navigate({ to: "/relatorio/os/$osId/amostra/$amostraId/ensaio/$ensaioId", params: ids })}
                      >
                        Corrigir
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/20 p-3 rounded-lg border">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">Exibir:</span>
              <div className="flex items-center gap-1 bg-background p-0.5 rounded-md border text-xs">
                <Button
                  size="sm"
                  variant={ganttFilter === "digitar" ? "secondary" : "ghost"}
                  className="h-7 text-xs font-medium"
                  onClick={() => setGanttFilter("digitar")}
                >
                  Para digitar ({counts.ganttDigitar})
                </Button>
                <Button
                  size="sm"
                  variant={ganttFilter === "concluido" ? "secondary" : "ghost"}
                  className="h-7 text-xs font-medium"
                  onClick={() => setGanttFilter("concluido")}
                >
                  Bancada finalizada — todos ({counts.ganttConcluidos})
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
                  Todos ({ganttDaFamilia.length})
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
                  <TableHead className="w-36 text-center">Último Salvamento</TableHead>
                  <TableHead className="w-32 text-center">Conclusão / Início</TableHead>
                  <TableHead className="w-56 text-right">Ações de Processamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGantt.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground text-sm">
                      Nenhum ensaio encontrado para os filtros selecionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredGantt.map((item) => {
                    const cad = cadastro.lookup(item.os);
                    const tomadorObra = [cad?.tomador, cad?.obra].filter(Boolean).join(" · ");
                    const pendExistente = acharPendencia(item);

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
                        </TableCell>
                        <TableCell className="text-center text-xs">
                          {pendExistente && pendExistente.status !== "pendente" ? (
                            <div className="space-y-0.5">
                              <div className="font-medium text-foreground">
                                {format(new Date(pendExistente.updated_at), "dd/MM HH:mm", { locale: ptBR })}
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate max-w-[130px] mx-auto">
                                {pendExistente.aprovador_nome ||
                                  pendExistente.verificador_nome ||
                                  pendExistente.digitador_nome ||
                                  pendExistente.operador_nome ||
                                  "—"}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
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
                                    const tipo = laudoDoEnsaio(item.ensaio, item.tipoEnsaioNome, mapaLaudos);
                                    if (!tipo) return avisarSemLaudo(item.ensaio);
                                    abrirPorTipo(tipo, item.os, item.amostra, cad?.tomador, cad?.obra, pendExistente?.id, item.ensaio, pendExistente?.status);
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
                            {podeMarcarFora && (
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
                            )}
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
              Acompanhe a esteira de cada laudo: <b>Digitação &rarr; Verificação &rarr; Aprovação &rarr; Entrega</b>. Laudo entregue (SOND + GDrive) sai daqui — veja a aba Entregas.
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
                        onExterno={podeMarcarFora ? () => setExternoModal(r) : undefined}
                        onDelete={() => setDeleteConfirm(r)}
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
                        onDelete={() => setDeleteConfirm(r)}
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
                        onDelete={() => setDeleteConfirm(r)}
                      />
                    ))}
                </div>
              </div>

              {/* Coluna 4: Concluídos */}
              <div className="bg-muted/30 rounded-lg p-3 border space-y-3">
                <div className="flex items-center justify-between border-b pb-2">
                  <div className="font-bold text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" /> 4. Aprovados — falta entregar
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
                    <TableHead className="w-40 text-center">Prazo (SLA)</TableHead>
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
                      <TableCell className="text-center">
                        {(() => {
                          const sla = slaDaPendencia(r);
                          return (
                            <Badge variant="outline" className={`${SLA_BADGE_COLOR[sla.overallStatus]} text-[10px]`}>
                              {SLA_LABEL[sla.overallStatus]} · {sla.totalLeadTime.formattedDuration}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => abrirDigitacao(r)}>
                            Abrir Laudo
                          </Button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirm(r)}
                            title="Excluir pendência"
                            className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer p-1"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* =========================================================================
            HISTÓRICO DE EMISSÕES — verificar/aprovar agora é pela aba "Meus laudos"
            (e no próprio laudo, que refaz o PDF); aqui fica o que já saiu.
           ========================================================================= */}
        <TabsContent value="emissoes-historico">
          <EmitidosView familia={familia} />
        </TabsContent>

        {/* =========================================================================
            MEUS LAUDOS — o que falta verificar, aprovar e corrigir, por pessoa
           ========================================================================= */}
        <TabsContent value="meus-laudos">
          <MesaDeLaudos familia={familia} />
        </TabsContent>

        {/* =========================================================================
            ENTREGAS — aprovados por OS, com os checks SOND e GDrive do cliente
           ========================================================================= */}
        <TabsContent value="entregas">
          <EntregasView familia={familia} />
        </TabsContent>

        {/* =========================================================================
            ABA 4: POR OS (VISÃO AGRUPADA, DOWNLOADS E ARQUIVAMENTO EM LOTE)
           ========================================================================= */}
        <TabsContent value="por-os">
          <OsReportsView />
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
                  onValueChange={(v) =>
                    setAvulsoData((s) => ({ ...s, tipo_ensaio: v, ensaio: ENSAIO_LABEL[v as EnsaioTipo] ?? v }))
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {METODOLOGIAS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {ENSAIO_LABEL[m] ?? m}
                      </SelectItem>
                    ))}
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
                  concluirExternoMutation.mutate({
                    id: externoModal.id,
                    observacao: externoObs,
                    os: externoModal.os,
                    amostra: externoModal.amostra,
                    ensaio: externoModal.ensaio,
                    tipo_ensaio: externoModal.tipo_ensaio,
                    equipamento: externoModal.equipamento,
                  });
                }
              }}
            >
              {concluirExternoMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirmar Conclusão Externa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteConfirm)} onOpenChange={(o) => { if (!o) { setDeleteConfirm(null); setExcluirEnsaioTambem(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pendência de digitação?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              {deleteConfirm && (
                <div className="space-y-3">
                  <div>
                    OS <strong>{deleteConfirm.os}</strong> · Amostra{" "}
                    <strong>{deleteConfirm.amostra || "Amostra Geral"}</strong> ·{" "}
                    <strong>{deleteConfirm.ensaio}</strong>
                    <br />
                    Isso remove a pendência da Central de Relatórios — se houver dados digitados,
                    eles não serão apagados, apenas o card de acompanhamento. Se o ensaio já tem
                    progresso, o card volta sozinho (é reconstruído a partir do próprio ensaio).
                    Não pode ser desfeito.
                  </div>
                  <label className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs">
                    <Checkbox
                      checked={excluirEnsaioTambem}
                      onCheckedChange={(v) => setExcluirEnsaioTambem(v === true)}
                      className="mt-0.5"
                    />
                    <span>
                      <strong className="text-destructive">Também excluir o ensaio e os dados digitados</strong> — use
                      só se este for um ensaio criado por engano/duplicado (ex.: "Relatório avulso"). Apaga de vez,
                      sem volta, e é o único jeito de fazer o card não voltar quando o ensaio já tem progresso.
                    </span>
                  </label>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeMutation.isPending}
              onClick={() => {
                if (!deleteConfirm) return;
                if (excluirEnsaioTambem) {
                  const alvo = acharEnsaioDaPendencia(deleteConfirm);
                  if (alvo) labStore.deleteEnsaio(alvo.osId, alvo.amId, alvo.enId);
                }
                removeMutation.mutate(deleteConfirm.id);
              }}
            >
              {removeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  onExterno,
  onDelete,
}: {
  item: PendenciaDigitacao;
  onAction: () => void;
  actionLabel: string;
  actionIcon: React.ComponentType<{ className?: string }>;
  onExterno?: () => void;
  onDelete?: () => void;
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
        <div className="flex items-center gap-1 shrink-0">
          <Badge variant="outline" className={`${SLA_BADGE_COLOR[sla.overallStatus]} text-[9px] px-1 py-0`}>
            {SLA_LABEL[sla.overallStatus]}
          </Badge>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              title="Excluir pendência"
              className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
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
        {onExterno && (
          <Button size="sm" variant="ghost" className="w-full h-6 text-[10px] text-muted-foreground" onClick={onExterno}>
            <FileSpreadsheet className="h-3 w-3 mr-1 text-emerald-600" /> Marcar Legado Excel
          </Button>
        )}
      </div>
    </div>
  );
}