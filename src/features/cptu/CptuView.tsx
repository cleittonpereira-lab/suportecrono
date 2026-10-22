/**
 * Acompanhamento de CPTu: cabeçalho com o resumo dos pendentes, planilha (um
 * CPTu por linha, com os pontos de controle editáveis), mapa e visão por OS.
 * Os dados vêm do extrato da SOND importado aqui; as OS são cruzadas com a
 * planilha de Cadastro de OS.
 */
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileSpreadsheet,
  History,
  Link2,
  List,
  Map as MapIcon,
  Ruler,
  Search,
  Timer,
  UploadCloud,
  Building2,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { SondButton } from "@/components/sond-button";
import {
  atualizarCptu,
  getCadastroCptu,
  getCptu,
  importarCptu,
  type CptuEstado,
  type CptuOsInfo,
} from "@/lib/cptu.functions";
import { CptuMap, STATUS_COR } from "./CptuMap";
import {
  CPTU_STATUS,
  RELATORIO_LABEL,
  STATUS_LABEL,
  aplicarPatch,
  chaveCptu,
  chaveOs,
  cotasDissipacao,
  diasDesde,
  estaPendente,
  etapasFaltando,
  foiExecutado,
  lerExtratoSond,
  parseCsvSond,
  preFuro,
  profundidadePrevista,
  prontoParaConcluir,
  resumir,
  type CptuLinhaImportada,
  type CptuPatch,
  type CptuRegistro,
  type CptuStatus,
  type RelatorioStatus,
} from "./logic";

const QK = ["cptu"] as const;
const QK_CAD = ["cptu-cadastro"] as const;
/** Valor do filtro de tomador para as OS que não estão no Cadastro de OS. */
const FORA_DO_CADASTRO = "__fora__";

const fmtM = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const fmtData = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const fmtDataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const STATUS_BADGE: Record<CptuStatus, string> = {
  PENDENTE:
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
  PRIORIDADE:
    "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
  EXECUTADO:
    "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30",
  CONCLUIDO:
    "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
  CANCELADO:
    "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-500/15 dark:text-zinc-400 dark:border-zinc-500/30",
};

type FiltroEtapa =
  "todas" | "faltando" | "sem-recebimento" | "sem-verificacao" | "sem-relatorio" | "prontos";

// ── Dados ────────────────────────────────────────────────────────────────────

function useCptu() {
  const fn = useServerFn(getCptu);
  return useQuery({
    queryKey: QK,
    queryFn: () => fn(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

function useCadastro() {
  const fn = useServerFn(getCadastroCptu);
  return useQuery({ queryKey: QK_CAD, queryFn: () => fn(), staleTime: 5 * 60_000 });
}

function useAtualizar() {
  const qc = useQueryClient();
  const fn = useServerFn(atualizarCptu);
  return useMutation({
    mutationFn: (v: { ids: string[]; patch: CptuPatch }) => fn({ data: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: QK });
      const antes = qc.getQueryData<CptuEstado>(QK);
      if (antes) {
        const ids = new Set(v.ids);
        const em = new Date().toISOString();
        qc.setQueryData<CptuEstado>(QK, {
          ...antes,
          registros: antes.registros.map((r) =>
            ids.has(r.id) ? aplicarPatch(r, v.patch, em, "você") : r,
          ),
        });
      }
      return { antes };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData(QK, ctx.antes);
      toast.error(`Não salvou: ${e instanceof Error ? e.message : String(e)}`);
    },
    onSuccess: ({ alterados }) => {
      const porId = new Map(alterados.map((r) => [r.id, r]));
      qc.setQueryData<CptuEstado>(QK, (atual) =>
        atual ? { ...atual, registros: atual.registros.map((r) => porId.get(r.id) ?? r) } : atual,
      );
    },
  });
}

// ── Página ───────────────────────────────────────────────────────────────────

export function CptuView() {
  const { data, isLoading, error } = useCptu();
  const { data: cad } = useCadastro();
  const atualizar = useAtualizar();
  const [importarAberto, setImportarAberto] = useState(false);

  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<Set<CptuStatus>>(new Set());
  const [osFiltro, setOsFiltro] = useState<string>("todas");
  const [tomadorFiltro, setTomadorFiltro] = useState<string>("todos");
  const [etapa, setEtapa] = useState<FiltroEtapa>("todas");
  const [mostrarAusentes, setMostrarAusentes] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [focado, setFocado] = useState<string | null>(null);
  const [aba, setAba] = useState("planilha");

  const porOs = cad?.porOs ?? {};
  const infoOs = (os: string): CptuOsInfo | undefined => porOs[chaveOs(os)];
  const tomadorDe = (os: string) => infoOs(os)?.tomador?.trim() || FORA_DO_CADASTRO;

  const todos = useMemo(() => {
    const regs = data?.registros ?? [];
    return [...regs].sort((a, b) => {
      // Prioridade e pendentes antigos primeiro.
      const ordem: Record<CptuStatus, number> = {
        PRIORIDADE: 0,
        PENDENTE: 1,
        EXECUTADO: 2,
        CONCLUIDO: 3,
        CANCELADO: 4,
      };
      if (ordem[a.status] !== ordem[b.status]) return ordem[a.status] - ordem[b.status];
      if (a.os !== b.os) return a.os.localeCompare(b.os);
      return a.identificacao.localeCompare(b.identificacao, "pt-BR", { numeric: true });
    });
  }, [data]);

  const ativos = useMemo(
    () => todos.filter((r) => mostrarAusentes || !r.ausenteNaSond),
    [todos, mostrarAusentes],
  );
  const resumo = useMemo(() => resumir(ativos), [ativos]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return ativos.filter((r) => {
      if (statusFiltro.size && !statusFiltro.has(r.status)) return false;
      if (osFiltro !== "todas" && r.os !== osFiltro) return false;
      if (tomadorFiltro !== "todos" && tomadorDe(r.os) !== tomadorFiltro) return false;
      if (etapa === "faltando" && etapasFaltando(r).length === 0) return false;
      if (etapa === "sem-recebimento" && !(foiExecutado(r) && !r.recebimentoCampo)) return false;
      if (etapa === "sem-verificacao" && !(foiExecutado(r) && !r.verificacaoBrutos)) return false;
      if (etapa === "sem-relatorio" && !(foiExecutado(r) && r.relatorio !== "SIM_SOND"))
        return false;
      if (etapa === "prontos" && !prontoParaConcluir(r)) return false;
      if (q) {
        const info = infoOs(r.os);
        const alvo =
          `${r.os} ${r.identificacao} ${r.observacoes} ${r.obsCampo} ${info?.tomador ?? ""} ${info?.obra ?? ""} ${info?.local ?? ""}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativos, busca, statusFiltro, osFiltro, tomadorFiltro, etapa, porOs]);

  // Tomadores com quantos CPTu cada um tem; "fora do cadastro" vai por último.
  const listaTomadores = useMemo(() => {
    const cont = new Map<string, number>();
    for (const r of ativos) cont.set(tomadorDe(r.os), (cont.get(tomadorDe(r.os)) ?? 0) + 1);
    return [...cont.entries()].sort(([a], [b]) =>
      a === FORA_DO_CADASTRO ? 1 : b === FORA_DO_CADASTRO ? -1 : a.localeCompare(b, "pt-BR"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativos, porOs]);

  // Com um tomador escolhido, a lista de OS mostra só as dele.
  const listaOs = useMemo(
    () =>
      [...new Set(ativos.map((r) => r.os))]
        .filter((os) => tomadorFiltro === "todos" || tomadorDe(os) === tomadorFiltro)
        .sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ativos, tomadorFiltro, porOs],
  );

  const salvar = (ids: string[], patch: CptuPatch) => atualizar.mutate({ ids, patch });

  const toggleStatus = (s: CptuStatus) =>
    setStatusFiltro((prev) => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });

  const limparFiltros = () => {
    setBusca("");
    setStatusFiltro(new Set());
    setOsFiltro("todas");
    setTomadorFiltro("todos");
    setEtapa("todas");
  };
  const temFiltro =
    busca ||
    statusFiltro.size ||
    osFiltro !== "todas" ||
    tomadorFiltro !== "todos" ||
    etapa !== "todas";

  const ultimaImportacao = data?.importacoes.at(-1);

  if (isLoading)
    return <div className="py-16 text-center text-sm text-muted-foreground">Carregando CPTu…</div>;
  // Falha numa atualização em segundo plano não esconde o que já carregou.
  if (error && !data)
    return (
      <div className="py-16 text-center text-sm text-destructive">
        Erro ao carregar: {String((error as Error).message ?? error)}
      </div>
    );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5">
        {/* Barra de ações */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {ultimaImportacao ? (
              <>
                Última importação da SOND:{" "}
                <b className="text-foreground">{fmtDataHora(ultimaImportacao.em)}</b> por{" "}
                {ultimaImportacao.por}
                {" · "}
                {ultimaImportacao.total} CPTu, {ultimaImportacao.novos} novos,{" "}
                {ultimaImportacao.statusAlterados} com status alterado
              </>
            ) : (
              "Nenhum extrato importado ainda."
            )}
            {cad?.aviso && <span className="ml-2 text-amber-600">· {cad.aviso}</span>}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportarExcel(filtrados, infoOs)}
              disabled={!filtrados.length}
            >
              <Download className="mr-1.5 h-4 w-4" /> Exportar Excel
            </Button>
            <Button size="sm" onClick={() => setImportarAberto(true)}>
              <UploadCloud className="mr-1.5 h-4 w-4" /> Importar extrato da SOND
            </Button>
          </div>
        </div>

        {todos.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
              <div className="font-medium">Importe o extrato do mapa da SOND para começar</div>
              <p className="max-w-md text-sm text-muted-foreground">
                Na SOND, exporte o mapa em modo tabela (CSV ou Excel) e envie aqui. Cada CPTu vira
                uma linha, com os pontos de controle começando em "Não".
              </p>
              <Button onClick={() => setImportarAberto(true)}>
                <UploadCloud className="mr-1.5 h-4 w-4" /> Importar extrato
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Cabecalho
              resumo={resumo}
              registros={ativos}
              infoOs={infoOs}
              onFiltrar={(f) => {
                limparFiltros();
                if (f.status) setStatusFiltro(new Set(f.status));
                if (f.etapa) setEtapa(f.etapa);
                if (f.os) setOsFiltro(f.os);
                setAba("planilha");
              }}
            />

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar CPTu, OS, cliente, obra…"
                  className="h-9 w-64 pl-8"
                />
              </div>
              {CPTU_STATUS.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleStatus(s)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${
                    statusFiltro.has(s)
                      ? STATUS_BADGE[s] + " ring-2 ring-offset-1 ring-primary/30"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COR[s] }} />
                  {STATUS_LABEL[s]}{" "}
                  <span className="tabular-nums opacity-70">{resumo.porStatus[s]}</span>
                </button>
              ))}
              <Select
                value={tomadorFiltro}
                onValueChange={(t) => {
                  setTomadorFiltro(t);
                  // A OS escolhida pode não ser desse tomador.
                  if (t !== "todos" && osFiltro !== "todas" && tomadorDe(osFiltro) !== t)
                    setOsFiltro("todas");
                }}
              >
                <SelectTrigger className="h-8 w-52 text-xs">
                  <SelectValue placeholder="Tomador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os tomadores</SelectItem>
                  {listaTomadores.map(([t, n]) => (
                    <SelectItem key={t} value={t}>
                      {t === FORA_DO_CADASTRO ? "OS fora do cadastro" : t}{" "}
                      <span className="opacity-60">({n})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={osFiltro} onValueChange={setOsFiltro}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder="OS" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as OS</SelectItem>
                  {listaOs.map((os) => (
                    <SelectItem key={os} value={os}>
                      {os} {infoOs(os)?.tomador ? `· ${infoOs(os)!.tomador}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={etapa} onValueChange={(v) => setEtapa(v as FiltroEtapa)}>
                <SelectTrigger className="h-8 w-52 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as etapas</SelectItem>
                  <SelectItem value="faltando">Executados com etapa faltando</SelectItem>
                  <SelectItem value="sem-recebimento">Sem recebimento de campo</SelectItem>
                  <SelectItem value="sem-verificacao">Sem verificação dos brutos</SelectItem>
                  <SelectItem value="sem-relatorio">Sem relatório</SelectItem>
                  <SelectItem value="prontos">Prontos para concluir</SelectItem>
                </SelectContent>
              </Select>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox
                  checked={mostrarAusentes}
                  onCheckedChange={(v) => setMostrarAusentes(v === true)}
                />
                Mostrar os que saíram da SOND
              </label>
              {temFiltro ? (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={limparFiltros}>
                  <X className="mr-1 h-3.5 w-3.5" /> Limpar filtros
                </Button>
              ) : null}
            </div>

            <Tabs value={aba} onValueChange={setAba} className="space-y-3">
              <TabsList className="bg-muted/40 border">
                <TabsTrigger value="planilha" className="gap-1.5 text-xs">
                  <List className="h-3.5 w-3.5" /> Planilha{" "}
                  <span className="opacity-60">({filtrados.length})</span>
                </TabsTrigger>
                <TabsTrigger value="mapa" className="gap-1.5 text-xs">
                  <MapIcon className="h-3.5 w-3.5" /> Mapa
                </TabsTrigger>
                <TabsTrigger value="por-os" className="gap-1.5 text-xs">
                  <Building2 className="h-3.5 w-3.5" /> Por OS
                </TabsTrigger>
              </TabsList>

              <TabsContent value="planilha" className="space-y-2">
                {selecionados.size > 0 && (
                  <AcoesEmLote
                    qtd={selecionados.size}
                    onAplicar={(patch) => {
                      salvar([...selecionados], patch);
                      toast.success(`${selecionados.size} CPTu atualizados.`);
                    }}
                    onLimpar={() => setSelecionados(new Set())}
                  />
                )}
                <Planilha
                  registros={filtrados}
                  infoOs={infoOs}
                  selecionados={selecionados}
                  setSelecionados={setSelecionados}
                  salvar={salvar}
                  onVerNoMapa={(id) => {
                    setFocado(id);
                    setAba("mapa");
                  }}
                />
              </TabsContent>

              <TabsContent value="mapa" forceMount className="data-[state=inactive]:hidden">
                <CptuMap
                  registros={filtrados}
                  selecionado={focado}
                  onSelecionar={setFocado}
                  className="h-[600px]"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {filtrados.filter((r) => r.lat != null).length} de {filtrados.length} CPTu com
                  coordenadas. O mapa segue os filtros acima.
                </p>
              </TabsContent>

              <TabsContent value="por-os">
                <PorOs
                  registros={filtrados}
                  infoOs={infoOs}
                  onAbrirOs={(os) => {
                    setOsFiltro(os);
                    setAba("planilha");
                  }}
                />
              </TabsContent>
            </Tabs>
          </>
        )}

        <ImportarDialog
          aberto={importarAberto}
          onFechar={() => setImportarAberto(false)}
          existentes={todos}
        />
      </div>
    </TooltipProvider>
  );
}

// ── Cabeçalho resumo ─────────────────────────────────────────────────────────

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={onClick ? "cursor-pointer transition hover:border-primary/40 hover:shadow-sm" : ""}
      onClick={onClick}
    >
      <CardContent className="flex items-start justify-between gap-2 py-4">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div
            className={`whitespace-nowrap font-display text-xl font-semibold tabular-nums 2xl:text-2xl ${accent ?? ""}`}
          >
            {value}
          </div>
          {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon className={`h-4 w-4 ${accent ?? "text-muted-foreground"}`} />
        </div>
      </CardContent>
    </Card>
  );
}

type FiltroRapido = { status?: CptuStatus[]; etapa?: FiltroEtapa; os?: string };

function Cabecalho({
  resumo,
  registros,
  infoOs,
  onFiltrar,
}: {
  resumo: ReturnType<typeof resumir>;
  registros: CptuRegistro[];
  infoOs: (os: string) => CptuOsInfo | undefined;
  onFiltrar: (f: FiltroRapido) => void;
}) {
  const pendentesPorOs = useMemo(() => {
    const m = new Map<
      string,
      { os: string; pend: number; prio: number; metros: number; maisAntigo: number }
    >();
    for (const r of registros) {
      if (!estaPendente(r)) continue;
      const g = m.get(r.os) ?? { os: r.os, pend: 0, prio: 0, metros: 0, maisAntigo: 0 };
      g.pend++;
      if (r.status === "PRIORIDADE") g.prio++;
      g.metros += profundidadePrevista(r.criterio) ?? 0;
      g.maisAntigo = Math.max(g.maisAntigo, diasDesde(r.desde) ?? 0);
      m.set(r.os, g);
    }
    return [...m.values()].sort((a, b) => b.prio - a.prio || b.pend - a.pend);
  }, [registros]);

  const executados = resumo.porStatus.EXECUTADO + resumo.porStatus.CONCLUIDO;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi
          icon={Timer}
          label="CPTu pendentes"
          value={resumo.pendentes}
          sub={
            <>
              <span className="font-semibold text-rose-600">
                {resumo.porStatus.PRIORIDADE} prioridade
              </span>{" "}
              · {resumo.osComPendentes} OS
            </>
          }
          accent="text-amber-600"
          onClick={() => onFiltrar({ status: ["PENDENTE", "PRIORIDADE"] })}
        />
        <Kpi
          icon={Ruler}
          label="Metros executados"
          value={`${fmtM(resumo.metrosExecutados)} m`}
          sub={`${executados} CPTu executados`}
          accent="text-sky-600"
          onClick={() => onFiltrar({ status: ["EXECUTADO", "CONCLUIDO"] })}
        />
        <Kpi
          icon={Ruler}
          label="Metros previstos a executar"
          value={`${fmtM(resumo.metrosPrevistosPendentes)} m`}
          sub={
            resumo.pendentesSemPrevisao
              ? `+ ${resumo.pendentesSemPrevisao} até o limite do equipamento`
              : "pelo critério de paralisação"
          }
        />
        <Kpi
          icon={AlertTriangle}
          label="Pendentes há +30 dias"
          value={resumo.pendentesHaMaisDe30Dias}
          accent={resumo.pendentesHaMaisDe30Dias ? "text-rose-600" : undefined}
          sub="desde a liberação na SOND"
        />
        <Kpi
          icon={ClipboardCheck}
          label="Executados c/ etapa faltando"
          value={registros.filter((r) => etapasFaltando(r).length > 0).length}
          sub={`${resumo.semRecebimento} receb. · ${resumo.semVerificacao} verif. · ${resumo.semRelatorio} relat.`}
          accent="text-violet-600"
          onClick={() => onFiltrar({ etapa: "faltando" })}
        />
        <Kpi
          icon={CheckCircle2}
          label="Prontos para concluir"
          value={resumo.prontosParaConcluir}
          sub={`${resumo.porStatus.CONCLUIDO} concluídos · ${resumo.porStatus.CANCELADO} cancelados`}
          accent="text-emerald-600"
          onClick={() => onFiltrar({ etapa: "prontos" })}
        />
      </div>

      {pendentesPorOs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pendentes por OS</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {pendentesPorOs.map((g) => {
                const info = infoOs(g.os);
                return (
                  <button
                    key={g.os}
                    onClick={() => onFiltrar({ os: g.os, status: ["PENDENTE", "PRIORIDADE"] })}
                    className="min-w-[190px] max-w-[230px] shrink-0 rounded-md border bg-background px-3 py-2 text-left transition hover:border-primary/40 hover:bg-muted/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold">{g.os}</span>
                      {g.prio > 0 && (
                        <span className="rounded bg-rose-100 px-1.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                          {g.prio} prior.
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground" title={info?.obra}>
                      {info?.tomador || "OS fora do cadastro"}
                    </div>
                    <div className="mt-1 flex items-baseline justify-between text-[11px]">
                      <span>
                        <b className="text-sm tabular-nums">{g.pend}</b> pend.
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {fmtM(g.metros)} m prev.
                      </span>
                    </div>
                    <div
                      className={`text-[10px] ${g.maisAntigo > 30 ? "text-rose-600" : "text-muted-foreground"}`}
                    >
                      mais antigo há {g.maisAntigo} dias
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Planilha ─────────────────────────────────────────────────────────────────

function SimNao({
  valor,
  onChange,
  desabilitado,
}: {
  valor: boolean;
  onChange: (v: boolean) => void;
  desabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={desabilitado}
      onClick={() => onChange(!valor)}
      className={`inline-flex h-7 w-14 items-center justify-center rounded-md border text-xs font-semibold transition disabled:opacity-40 ${
        valor
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
          : "border-border bg-background text-muted-foreground hover:bg-muted"
      }`}
      title={valor ? "Sim — clique para marcar Não" : "Não — clique para marcar Sim"}
    >
      {valor ? "Sim" : "Não"}
    </button>
  );
}

function StatusSelect({
  valor,
  onChange,
  compacto,
}: {
  valor: CptuStatus;
  onChange: (s: CptuStatus) => void;
  compacto?: boolean;
}) {
  return (
    <Select value={valor} onValueChange={(v) => onChange(v as CptuStatus)}>
      <SelectTrigger
        className={`h-7 border text-xs font-semibold ${STATUS_BADGE[valor]} ${compacto ? "w-28" : "w-32"}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {CPTU_STATUS.map((s) => (
          <SelectItem key={s} value={s} className="text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COR[s] }} />
              {STATUS_LABEL[s]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RelatorioSelect({
  valor,
  onChange,
}: {
  valor: RelatorioStatus;
  onChange: (v: RelatorioStatus) => void;
}) {
  return (
    <Select value={valor} onValueChange={(v) => onChange(v as RelatorioStatus)}>
      <SelectTrigger
        className={`h-7 w-[118px] text-xs font-semibold ${
          valor === "SIM_SOND"
            ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300"
            : "text-muted-foreground"
        }`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="NAO" className="text-xs">
          Não
        </SelectItem>
        <SelectItem value="SIM_SOND" className="text-xs">
          Sim, na Sond
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

function ObservacaoCell({ valor, onSalvar }: { valor: string; onSalvar: (v: string) => void }) {
  const [texto, setTexto] = useState(valor);
  const ultimo = useRef(valor);
  if (valor !== ultimo.current) {
    // Atualizou por fora (outra pessoa / importação): acompanha.
    ultimo.current = valor;
    setTexto(valor);
  }
  const salvar = () => {
    const t = texto.trim();
    if (t !== valor) onSalvar(t);
  };
  return (
    <Input
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setTexto(valor);
      }}
      placeholder="Anotar…"
      className="h-7 min-w-[180px] text-xs"
    />
  );
}

function LinksCell({ r, salvar }: { r: CptuRegistro; salvar: (patch: CptuPatch) => void }) {
  const [aberto, setAberto] = useState(false);
  const [ref, setRef] = useState(r.linkSondagemRef);
  const [brutos, setBrutos] = useState(r.linkDadosBrutos);
  const valido = (s: string) => s === "" || /^https?:\/\//i.test(s);
  return (
    <div className="flex items-center gap-1">
      <LinkIcone href={r.linkSondagemRef} rotulo="Sondagem de referência" sigla="Ref" />
      <LinkIcone href={r.linkDadosBrutos} rotulo="Dados brutos" sigla="Brutos" />
      <Popover
        open={aberto}
        onOpenChange={(o) => {
          setAberto(o);
          if (o) {
            setRef(r.linkSondagemRef);
            setBrutos(r.linkDadosBrutos);
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar links">
            <Link2 className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96 space-y-3" align="end">
          <div className="text-sm font-medium">{r.identificacao}</div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Sondagem de referência (Google Drive ou SOND)
            </label>
            <Input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="https://…"
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Dados brutos (planilha)</label>
            <Input
              value={brutos}
              onChange={(e) => setBrutos(e.target.value)}
              placeholder="https://…"
              className="h-8 text-xs"
            />
          </div>
          {!(valido(ref.trim()) && valido(brutos.trim())) && (
            <p className="text-xs text-destructive">
              O link precisa começar com http:// ou https://
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!(valido(ref.trim()) && valido(brutos.trim()))}
              onClick={() => {
                salvar({ linkSondagemRef: ref.trim(), linkDadosBrutos: brutos.trim() });
                setAberto(false);
              }}
            >
              Salvar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function LinkIcone({ href, rotulo, sigla }: { href: string; rotulo: string; sigla: string }) {
  if (!href) {
    return (
      <span
        className="inline-flex h-6 items-center rounded border border-dashed px-1.5 text-[10px] text-muted-foreground/60"
        title={`${rotulo}: sem link`}
      >
        {sigla}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-6 items-center gap-0.5 rounded border border-primary/30 bg-primary/5 px-1.5 text-[10px] font-semibold text-primary hover:bg-primary/10"
      title={`${rotulo}: ${href}`}
    >
      {sigla} <ExternalLink className="h-2.5 w-2.5" />
    </a>
  );
}

function HistoricoBotao({ r }: { r: CptuRegistro }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Histórico">
          <History className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96" align="end">
        <div className="mb-2 text-sm font-medium">Histórico · {r.identificacao}</div>
        <ol className="max-h-72 space-y-1.5 overflow-y-auto text-xs">
          {[...r.historico].reverse().map((h, i) => (
            <li key={i} className="border-l-2 pl-2">
              <div className="text-muted-foreground">
                {fmtDataHora(h.em)} · {h.por}
              </div>
              <div>
                <b>{h.campo}</b>
                {h.de ? (
                  <>
                    : {h.de} → {h.para}
                  </>
                ) : (
                  <>: {h.para}</>
                )}
              </div>
            </li>
          ))}
        </ol>
      </PopoverContent>
    </Popover>
  );
}

function Planilha({
  registros,
  infoOs,
  selecionados,
  setSelecionados,
  salvar,
  onVerNoMapa,
}: {
  registros: CptuRegistro[];
  infoOs: (os: string) => CptuOsInfo | undefined;
  selecionados: Set<string>;
  setSelecionados: (s: Set<string>) => void;
  salvar: (ids: string[], patch: CptuPatch) => void;
  onVerNoMapa: (id: string) => void;
}) {
  const todosMarcados = registros.length > 0 && registros.every((r) => selecionados.has(r.id));
  const th =
    "sticky top-0 z-10 bg-muted px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap";
  const td = "px-2 py-1.5 align-middle";

  if (!registros.length) {
    return (
      <div className="rounded-lg border py-10 text-center text-sm text-muted-foreground">
        Nenhum CPTu com esses filtros.
      </div>
    );
  }

  return (
    <div className="max-h-[70vh] overflow-auto rounded-lg border">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className={th}>
              <Checkbox
                checked={todosMarcados}
                onCheckedChange={(v) =>
                  setSelecionados(v === true ? new Set(registros.map((r) => r.id)) : new Set())
                }
                aria-label="Selecionar todos"
              />
            </th>
            <th className={th}>OS</th>
            <th className={th}>Tomador</th>
            <th className={th}>Obra / Local</th>
            <th className={th}>CPTu</th>
            <th className={th}>Status</th>
            <th className={th}>Desde</th>
            <th className={th}>Prof. (m)</th>
            <th className={th}>Receb. dados campo</th>
            <th className={th}>Verif. dados brutos</th>
            <th className={th}>Relatório</th>
            <th className={th}>Links</th>
            <th className={th}>Observações</th>
            <th className={th}>Obs. de campo</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {registros.map((r) => {
            const info = infoOs(r.os);
            const prev = profundidadePrevista(r.criterio);
            const furo = preFuro(r.criterio);
            const cotas = cotasDissipacao(r.criterio);
            const dias = diasDesde(r.desde);
            const faltando = etapasFaltando(r);
            const marcado = selecionados.has(r.id);
            return (
              <tr
                key={r.id}
                className={`border-t hover:bg-muted/30 ${marcado ? "bg-primary/5" : ""} ${r.ausenteNaSond ? "opacity-60" : ""}`}
              >
                <td className={td}>
                  <Checkbox
                    checked={marcado}
                    onCheckedChange={(v) => {
                      const n = new Set(selecionados);
                      if (v === true) n.add(r.id);
                      else n.delete(r.id);
                      setSelecionados(n);
                    }}
                    aria-label={`Selecionar ${r.identificacao}`}
                  />
                </td>
                <td className={td}>
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <span className="font-mono font-semibold">{r.os}</span>
                    <SondButton os={r.os} />
                  </div>
                  {info?.sup && (
                    <div className="whitespace-nowrap text-[10px] text-muted-foreground">
                      {info.sup}
                    </div>
                  )}
                </td>
                <td className={td}>
                  {info ? (
                    <div className="max-w-[150px] text-[11px] font-medium leading-tight">
                      {info.tomador}
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted-foreground/60">fora do cadastro</div>
                  )}
                </td>
                <td className={td}>
                  {info && (info.obra || info.local) ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="min-w-[220px] max-w-[300px] cursor-default">
                          {info.obra && (
                            <div className="line-clamp-2 text-[11px] leading-tight">
                              {info.obra}
                            </div>
                          )}
                          {info.local && (
                            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                              {info.local}
                            </div>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm text-xs">
                        <div className="font-semibold">{info.tomador}</div>
                        {info.obra && <div>{info.obra}</div>}
                        {info.local && <div className="text-muted-foreground">{info.local}</div>}
                        <div className="mt-1 text-muted-foreground">
                          {info.sup && <>{info.sup} · </>}cadastro de {info.mes}
                          {info.cptuCadastro ? ` · ${info.cptuCadastro} CPTu no cadastro` : ""}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
                <td className={td}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="cursor-default">
                        <div className="whitespace-nowrap font-medium">{r.identificacao}</div>
                        <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                          {furo != null && (
                            <span className="rounded bg-muted px-1">pré-furo {fmtM(furo)} m</span>
                          )}
                          {cotas.length > 0 && (
                            <span className="rounded bg-muted px-1">{cotas.length} dissip.</span>
                          )}
                          {r.ausenteNaSond && (
                            <span className="rounded bg-zinc-200 px-1 text-zinc-700">
                              saiu da SOND
                            </span>
                          )}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md text-xs">
                      <div className="font-semibold">Critério de paralisação</div>
                      <div>{r.criterio || "—"}</div>
                      {cotas.length > 0 && (
                        <div className="mt-1">Dissipações: {cotas.join(" · ")}</div>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </td>
                <td className={td}>
                  <StatusSelect valor={r.status} onChange={(s) => salvar([r.id], { status: s })} />
                  {prontoParaConcluir(r) && (
                    <div className="mt-0.5 text-[10px] font-medium text-emerald-600">
                      pronto p/ concluir
                    </div>
                  )}
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  <div>{fmtData(r.desde)}</div>
                  {dias != null && estaPendente(r) && (
                    <div
                      className={`text-[10px] ${dias > 30 ? "font-semibold text-rose-600" : "text-muted-foreground"}`}
                    >
                      há {dias} dias
                    </div>
                  )}
                </td>
                <td className={`${td} whitespace-nowrap tabular-nums`}>
                  <div className={r.profundidade ? "font-semibold" : "text-muted-foreground"}>
                    {r.profundidade ? fmtM(r.profundidade) : "—"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    prev. {prev != null ? fmtM(prev) : "limite equip."}
                  </div>
                </td>
                <td className={td}>
                  <SimNao
                    valor={r.recebimentoCampo}
                    onChange={(v) => salvar([r.id], { recebimentoCampo: v })}
                  />
                </td>
                <td className={td}>
                  <SimNao
                    valor={r.verificacaoBrutos}
                    onChange={(v) => salvar([r.id], { verificacaoBrutos: v })}
                  />
                </td>
                <td className={td}>
                  <RelatorioSelect
                    valor={r.relatorio}
                    onChange={(v) => salvar([r.id], { relatorio: v })}
                  />
                  {faltando.length > 0 && (
                    <div className="mt-0.5 text-[10px] text-violet-600">
                      falta: {faltando.join(", ")}
                    </div>
                  )}
                </td>
                <td className={td}>
                  <LinksCell r={r} salvar={(p) => salvar([r.id], p)} />
                </td>
                <td className={td}>
                  <ObservacaoCell
                    valor={r.observacoes}
                    onSalvar={(v) => salvar([r.id], { observacoes: v })}
                  />
                </td>
                <td className={td}>
                  {r.obsCampo ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="max-w-[200px] cursor-default truncate text-[11px]">
                          {r.obsCampo}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md text-xs">{r.obsCampo}</TooltipContent>
                    </Tooltip>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  {r.lat != null && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Ver no mapa"
                      onClick={() => onVerNoMapa(r.id)}
                    >
                      <MapIcon className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <HistoricoBotao r={r} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AcoesEmLote({
  qtd,
  onAplicar,
  onLimpar,
}: {
  qtd: number;
  onAplicar: (p: CptuPatch) => void;
  onLimpar: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
      <b>{qtd} selecionados</b>
      <span className="text-muted-foreground">· aplicar a todos:</span>
      <Select onValueChange={(v) => onAplicar({ status: v as CptuStatus })}>
        <SelectTrigger className="h-7 w-36 text-xs">
          <SelectValue placeholder="Status…" />
        </SelectTrigger>
        <SelectContent>
          {CPTU_STATUS.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">
              {STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => onAplicar({ recebimentoCampo: true })}
      >
        Recebimento: Sim
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => onAplicar({ verificacaoBrutos: true })}
      >
        Verificação: Sim
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => onAplicar({ relatorio: "SIM_SOND" })}
      >
        Relatório: Sim, na Sond
      </Button>
      <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={onLimpar}>
        <X className="mr-1 h-3.5 w-3.5" /> Limpar seleção
      </Button>
    </div>
  );
}

// ── Por OS ───────────────────────────────────────────────────────────────────

function PorOs({
  registros,
  infoOs,
  onAbrirOs,
}: {
  registros: CptuRegistro[];
  infoOs: (os: string) => CptuOsInfo | undefined;
  onAbrirOs: (os: string) => void;
}) {
  const grupos = useMemo(() => {
    const m = new Map<string, CptuRegistro[]>();
    for (const r of registros) m.set(r.os, [...(m.get(r.os) ?? []), r]);
    return [...m.entries()]
      .map(([os, regs]) => {
        const res = resumir(regs);
        const validos = regs.length - res.porStatus.CANCELADO;
        const feitos = res.porStatus.EXECUTADO + res.porStatus.CONCLUIDO;
        return {
          os,
          regs,
          res,
          validos,
          feitos,
          pct: validos ? Math.round((feitos / validos) * 100) : 0,
        };
      })
      .sort(
        (a, b) =>
          b.res.porStatus.PRIORIDADE - a.res.porStatus.PRIORIDADE ||
          b.res.pendentes - a.res.pendentes,
      );
  }, [registros]);

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {grupos.map((g) => {
        const info = infoOs(g.os);
        return (
          <Card
            key={g.os}
            className="cursor-pointer transition hover:border-primary/40"
            onClick={() => onAbrirOs(g.os)}
          >
            <CardContent className="space-y-2 py-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{g.os}</span>
                    <SondButton os={g.os} variant="button" />
                  </div>
                  <div className="truncate text-xs font-medium">
                    {info?.tomador ?? "OS fora do cadastro"}
                  </div>
                  {info?.obra && (
                    <div className="line-clamp-2 text-[11px] text-muted-foreground">
                      {info.obra}
                    </div>
                  )}
                  {info?.local && (
                    <div className="truncate text-[11px] text-muted-foreground">{info.local}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-display text-xl font-semibold tabular-nums">
                    {g.feitos}/{g.validos}
                  </div>
                  <div className="text-[10px] text-muted-foreground">executados</div>
                </div>
              </div>
              <Progress value={g.pct} className="h-1.5" />
              <div className="flex flex-wrap gap-1">
                {CPTU_STATUS.filter((s) => g.res.porStatus[s] > 0).map((s) => (
                  <Badge key={s} variant="outline" className={`text-[10px] ${STATUS_BADGE[s]}`}>
                    {g.res.porStatus[s]} {STATUS_LABEL[s].toLowerCase()}
                  </Badge>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-x-3 text-[11px] text-muted-foreground">
                <span>
                  Executado: <b className="text-foreground">{fmtM(g.res.metrosExecutados)} m</b>
                </span>
                <span>
                  A executar:{" "}
                  <b className="text-foreground">{fmtM(g.res.metrosPrevistosPendentes)} m</b>
                </span>
                <span>
                  Sem recebimento: <b className="text-foreground">{g.res.semRecebimento}</b>
                </span>
                <span>
                  Sem relatório: <b className="text-foreground">{g.res.semRelatorio}</b>
                </span>
                {info?.cptuCadastro ? (
                  <span className="col-span-2">No cadastro de OS: {info.cptuCadastro} CPTu</span>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Importação ───────────────────────────────────────────────────────────────

async function lerArquivo(file: File): Promise<string[][]> {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let texto = new TextDecoder("utf-8").decode(bytes);
  // Arquivo salvo em Latin-1 (Excel antigo): os acentos viram caractere inv\u00E1lido.
  if (texto.includes("\uFFFD")) texto = new TextDecoder("windows-1252").decode(bytes);
  return parseCsvSond(texto);
}

function ImportarDialog({
  aberto,
  onFechar,
  existentes,
}: {
  aberto: boolean;
  onFechar: () => void;
  existentes: CptuRegistro[];
}) {
  const qc = useQueryClient();
  const importarFn = useServerFn(importarCptu);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [linhas, setLinhas] = useState<CptuLinhaImportada[] | null>(null);
  const [ignoradas, setIgnoradas] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const previa = useMemo(() => {
    if (!linhas) return null;
    const porId = new Map(existentes.map((r) => [r.id, r]));
    let novos = 0;
    let mudaStatus = 0;
    const ids = new Set<string>();
    for (const l of linhas) {
      const id = chaveCptu(l.os, l.identificacao);
      ids.add(id);
      const r = porId.get(id);
      if (!r) novos++;
      else if (
        r.statusSond !== l.status &&
        r.status !== "CONCLUIDO" &&
        r.status !== "CANCELADO" &&
        r.status !== l.status
      )
        mudaStatus++;
    }
    const saem = existentes.filter((r) => !ids.has(r.id) && !r.ausenteNaSond).length;
    const porStatus = Object.fromEntries(
      CPTU_STATUS.map((s) => [s, linhas.filter((l) => l.status === s).length]),
    ) as Record<CptuStatus, number>;
    return { novos, mudaStatus, saem, porStatus };
  }, [linhas, existentes]);

  const importar = useMutation({
    mutationFn: () =>
      importarFn({ data: { arquivo: arquivo?.name ?? "extrato", linhas: linhas ?? [] } }),
    onSuccess: ({ resumo, estado }) => {
      qc.setQueryData(QK, estado);
      toast.success(
        resumo
          ? `Importado: ${resumo.total} CPTu · ${resumo.novos} novos · ${resumo.statusAlterados} com status alterado`
          : "Importado.",
      );
      fechar();
    },
    onError: (e) => toast.error(`Falha ao importar: ${e instanceof Error ? e.message : String(e)}`),
  });

  function fechar() {
    setArquivo(null);
    setLinhas(null);
    setErro(null);
    setIgnoradas(0);
    if (inputRef.current) inputRef.current.value = "";
    onFechar();
  }

  async function escolher(f: File | undefined) {
    setErro(null);
    setLinhas(null);
    if (!f) return;
    setArquivo(f);
    try {
      const r = lerExtratoSond(await lerArquivo(f));
      if (r.erro) setErro(r.erro);
      else if (!r.linhas.length) setErro("Nenhum CPTu encontrado no arquivo.");
      else {
        setLinhas(r.linhas);
        setIgnoradas(r.ignoradas);
      }
    } catch (e) {
      setErro(`Não consegui ler o arquivo: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar extrato da SOND</DialogTitle>
          <DialogDescription>
            Exportação do mapa em modo tabela (CSV ou Excel). O status e os dados de campo são
            atualizados; seus pontos de controle, observações e links ficam como estão.
          </DialogDescription>
        </DialogHeader>

        <div
          className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition hover:border-primary/50 hover:bg-muted/30"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void escolher(e.dataTransfer.files?.[0]);
          }}
        >
          <UploadCloud className="h-8 w-8 text-muted-foreground" />
          <div className="text-sm font-medium">
            {arquivo ? arquivo.name : "Clique ou arraste o arquivo aqui"}
          </div>
          <div className="text-xs text-muted-foreground">.csv, .xlsx</div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            className="hidden"
            onChange={(e) => void escolher(e.target.files?.[0])}
          />
        </div>

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        {linhas && previa && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
            <div>
              <b>{linhas.length}</b> CPTu no arquivo
              {ignoradas > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  · {ignoradas} linhas ignoradas (outro tipo ou OS de teste)
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {CPTU_STATUS.filter((s) => previa.porStatus[s]).map((s) => (
                <Badge key={s} variant="outline" className={`text-[11px] ${STATUS_BADGE[s]}`}>
                  {previa.porStatus[s]} {STATUS_LABEL[s].toLowerCase()}
                </Badge>
              ))}
            </div>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              <li>• {previa.novos} novos CPTu entram na planilha</li>
              <li>• {previa.mudaStatus} terão o status atualizado pela SOND</li>
              {previa.saem > 0 && (
                <li>
                  • {previa.saem} não estão mais no extrato (ficam guardados, marcados como "saiu da
                  SOND")
                </li>
              )}
            </ul>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={fechar}>
            Cancelar
          </Button>
          <Button disabled={!linhas || importar.isPending} onClick={() => importar.mutate()}>
            {importar.isPending ? "Importando…" : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Exportação ───────────────────────────────────────────────────────────────

async function exportarExcel(
  registros: CptuRegistro[],
  infoOs: (os: string) => CptuOsInfo | undefined,
) {
  const XLSX = await import("xlsx");
  const linhas = registros.map((r) => {
    const info = infoOs(r.os);
    const prev = profundidadePrevista(r.criterio);
    return {
      OS: r.os,
      Tomador: info?.tomador ?? "",
      Obra: info?.obra ?? "",
      Local: info?.local ?? "",
      SUP: info?.sup ?? "",
      CPTu: r.identificacao,
      Status: STATUS_LABEL[r.status],
      Desde: fmtData(r.desde),
      "Prof. executada (m)": r.profundidade,
      "Prof. prevista (m)": prev ?? "",
      "Recebimento dados campo": r.recebimentoCampo ? "Sim" : "Não",
      "Verificação dados brutos": r.verificacaoBrutos ? "Sim" : "Não",
      Relatório: RELATORIO_LABEL[r.relatorio],
      Observações: r.observacoes,
      "Sondagem de referência": r.linkSondagemRef,
      "Dados brutos": r.linkDadosBrutos,
      "Obs. de campo": r.obsCampo,
      "Critério de paralisação": r.criterio,
      Latitude: r.lat ?? "",
      Longitude: r.lng ?? "",
    };
  });
  const ws = XLSX.utils.json_to_sheet(linhas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "CPTu");
  XLSX.writeFile(wb, `acompanhamento-cptu-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
