/**
 * Hub de uma OS de Ensaio Especial — concentra identificação, recebimento de
 * amostras, ensaios & relatórios, emissões e o chat dessa OS numa página só,
 * em rolagem linear (sem abas), com o chat fixo ao lado.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Building,
  MapPin,
  CalendarClock,
  History,
  Archive,
  ArchiveRestore,
  Package,
  FlaskConical,
  Send,
  MessageSquare,
  ExternalLink,
  Loader2,
  CheckCircle2,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Truck,
  ClipboardCheck,
  PlayCircle,
  Hourglass,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCadastroByOs } from "@/hooks/use-cadastro-by-os";
import { useOsGroups, abrirEnsaioNaCentral, type EnsaioItemOS } from "@/features/lab/hooks/use-os-groups";
import { ENSAIO_LABEL } from "@/features/lab/types";
import { normOs, splitSetores, splitEscopo } from "@/lib/schedule-utils";
import { useSchedule } from "@/hooks/use-schedule";
import { listEmissoes } from "@/lib/emissoes.functions";
import { fetchSharedChegadaState } from "@/lib/chegada-amostras.functions";
import { getOsHub, atualizarDataAcordada, arquivarOs, desarquivarOs } from "@/lib/os-hub.functions";
import { OsChatPanel } from "@/features/lab/components/OsChatPanel";
import { OsGanttMini } from "@/features/lab/components/OsGanttMini";
import { useOsEntregas, EntregasTable } from "@/components/os-entregas-panel";
import { SetorBadges } from "@/components/setor-badges";
import { SondButton } from "@/components/sond-button";

export const Route = createFileRoute("/_app/relatorio/especiais/$osNumero")({
  ssr: false,
  component: OsEspecialHubPage,
});

/** "YYYY-MM-DD" (de <input type="date">) não tem hora — new Date(str) direto
 * interpreta como UTC meia-noite, o que exibe um dia a menos em fusos
 * negativos (Brasil). Constrói a partir dos componentes locais. */
function parseLocalDate(dateOnly: string): Date {
  const [y, m, d] = dateOnly.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

const STATUS_LABEL: Record<EnsaioItemOS["status"], string> = {
  programado: "Programado (Gantt)",
  execucao: "Em Bancada",
  em_digitacao: "Em Digitação",
  verificacao: "Aguardando Verificação",
  aprovado: "Laudo Aprovado",
  concluido_externo: "Concluído Externo",
};

const STATUS_COLOR: Record<EnsaioItemOS["status"], string> = {
  programado: "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30",
  execucao: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
  em_digitacao: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  verificacao: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30",
  aprovado: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  concluido_externo: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/30",
};

function SectionCard({
  icon: Icon,
  title,
  right,
  children,
  defaultOpen = true,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 cursor-pointer text-left"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <CardTitle className="text-sm flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" /> {title}
          </CardTitle>
        </button>
        {right}
      </CardHeader>
      {open && <CardContent>{children}</CardContent>}
    </Card>
  );
}

function OsEspecialHubPage() {
  const { osNumero } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const cadastro = useCadastroByOs();
  const { osGroups, amostrasProg, ensaiosProg, progs, tiposProg, equipsProg, currentUserName } = useOsGroups();

  const getOsHubFn = useServerFn(getOsHub);
  const atualizarDataFn = useServerFn(atualizarDataAcordada);
  const arquivarFn = useServerFn(arquivarOs);
  const desarquivarFn = useServerFn(desarquivarOs);
  const listEmissoesFn = useServerFn(listEmissoes);
  const fetchChegadaFn = useServerFn(fetchSharedChegadaState);

  const [statusFiltro, setStatusFiltro] = useState<"all" | EnsaioItemOS["status"]>("all");
  const [tipoFiltro, setTipoFiltro] = useState<string>("all");

  const cad = cadastro.lookup(osNumero);
  const group = osGroups.find((g) => normOs(g.osNumero) === normOs(osNumero));
  const ensaios = group?.ensaios ?? [];
  const ensaiosFiltrados = ensaios.filter((e) => {
    if (statusFiltro !== "all" && e.status !== statusFiltro) return false;
    if (tipoFiltro !== "all" && e.tipo !== tipoFiltro) return false;
    return true;
  });
  const tiposDisponiveis = Array.from(new Set(ensaios.map((e) => e.tipo)));

  const kpi = useMemo(() => {
    const programados = ensaios.filter((e) => e.status === "programado").length;
    const executados = ensaios.length - programados;
    return { total: ensaios.length, programados, executados };
  }, [ensaios]);

  const { data: scheduleData } = useSchedule();
  const { passadas: entregasPassadas, futuras: entregasFuturas, isLoading: entregasLoading } = useOsEntregas({ os: osNumero });

  const { setoresUnificados, escoposUnificados } = useMemo(() => {
    const setores = new Set<string>();
    const escopoTags = new Set<string>();
    const escopoExtras = new Set<string>();
    for (const r of scheduleData?.rows ?? []) {
      if (normOs(r.os) !== normOs(osNumero)) continue;
      for (const s of splitSetores(r.setor)) setores.add(s);
      const { tags, extras } = splitEscopo(r.escopo);
      for (const t of tags) escopoTags.add(t);
      for (const e of extras) if (e.trim()) escopoExtras.add(e.trim());
    }
    return { setoresUnificados: Array.from(setores), escoposUnificados: [...Array.from(escopoTags), ...Array.from(escopoExtras)] };
  }, [scheduleData, osNumero]);

  const { data: hub, refetch: refetchHub } = useQuery({
    queryKey: ["os-hub", osNumero],
    queryFn: () => getOsHubFn({ data: { osNumero } }),
    refetchInterval: 15_000,
  });

  const { data: emissoes = [] } = useQuery({
    queryKey: ["emissoes-os", osNumero],
    queryFn: () => listEmissoesFn({ data: {} }),
    select: (rows) => rows.filter((r) => r.os_numero && normOs(r.os_numero) === normOs(osNumero)),
  });

  const { data: chegadaState } = useQuery({
    queryKey: ["chegada-shared-state"],
    queryFn: () => fetchChegadaFn(),
  });

  const recebimentos = useMemo(() => {
    if (!chegadaState) return [];
    const all = Object.values(chegadaState.tasks).flat();
    const q = osNumero.toLowerCase();
    return all.filter((t) => (t.osCliente || "").toLowerCase().includes(q));
  }, [chegadaState, osNumero]);

  const [dateDialogOpen, setDateDialogOpen] = useState(false);
  const [novaData, setNovaData] = useState("");
  const [savingDate, setSavingDate] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);

  async function handleSalvarData() {
    if (!novaData) return;
    setSavingDate(true);
    try {
      await atualizarDataFn({ data: { osNumero, novaData } });
      await refetchHub();
      setDateDialogOpen(false);
      setNovaData("");
      toast.success("Data acordada atualizada.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar data.");
    } finally {
      setSavingDate(false);
    }
  }

  async function handleArquivar() {
    setArchiving(true);
    try {
      await arquivarFn({ data: { osNumero } });
      await refetchHub();
      qc.invalidateQueries({ queryKey: ["os-hub"] });
      setArchiveConfirmOpen(false);
      toast.success("OS arquivada — não vai mais aparecer na lista de Ensaios Especiais.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao arquivar.");
    } finally {
      setArchiving(false);
    }
  }

  async function handleDesarquivar() {
    try {
      await desarquivarFn({ data: { osNumero } });
      await refetchHub();
      toast.success("OS reativada.");
    } catch (e: any) {
      toast.error(e.message || "Erro ao reativar.");
    }
  }

  function abrirEnsaio(item: EnsaioItemOS) {
    abrirEnsaioNaCentral(
      navigate,
      { cadastro, amostrasProg, ensaiosProg, progs, equipsProg, currentUserName },
      osNumero,
      item.amostra,
      item.tipo,
      item.ensaio,
    );
  }

  return (
    <div className="space-y-5 w-full px-4 sm:px-6 md:px-8 pb-20">
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" asChild>
        <Link to="/relatorio/especiais" search={{ tab: undefined }}>
          <ArrowLeft className="h-4 w-4" /> Ensaios Especiais
        </Link>
      </Button>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b pb-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/80">
            Hub da OS · Ensaio Especial
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight mt-1">OS {osNumero}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{cad?.tomador || group?.cliente}</p>
          {hub?.arquivada && (
            <Badge variant="outline" className="mt-1.5 gap-1.5 bg-slate-500/10 text-slate-600 border-slate-500/30">
              <Archive className="h-3 w-3" /> Arquivada em {hub.arquivadaEm ? format(new Date(hub.arquivadaEm), "dd/MM/yyyy", { locale: ptBR }) : ""} por {hub.arquivadaPor}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <SondButton os={osNumero} variant="button" />
          {hub?.arquivada ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDesarquivar}>
              <ArchiveRestore className="h-4 w-4" /> Reativar OS
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setArchiveConfirmOpen(true)}>
              <Archive className="h-4 w-4" /> Arquivar OS
            </Button>
          )}
        </div>
      </div>

      {/* Barra de KPIs rápidos */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card p-3 flex items-center gap-2.5">
          <ClipboardCheck className="h-5 w-5 text-primary shrink-0" />
          <div>
            <div className="text-lg font-bold tabular-nums leading-none">{kpi.total}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Ensaios Programados</div>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3 flex items-center gap-2.5">
          <PlayCircle className="h-5 w-5 text-sky-600 shrink-0" />
          <div>
            <div className="text-lg font-bold tabular-nums leading-none">{kpi.executados}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Ensaios Executados</div>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3 flex items-center gap-2.5">
          <Hourglass className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <div className="text-lg font-bold tabular-nums leading-none">{kpi.programados}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Programações Pendentes</div>
          </div>
        </div>
      </div>

      {/* Layout linear: conteúdo da OS rolando à esquerda, chat fixo à direita */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <div className="grid gap-5 md:grid-cols-2">
            <SectionCard icon={Building} title="Identificação">
              <div className="space-y-1.5 text-sm">
                <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{cad?.tomador || group?.cliente || "—"}</span></div>
                <div><span className="text-muted-foreground">Obra:</span> <span className="font-medium">{cad?.obra || group?.obra || "—"}</span></div>
                <div className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-muted-foreground" /> <span className="font-medium">{cad?.local || group?.local || "—"}</span></div>
                {cad?.sup && <div><span className="text-muted-foreground">Sup.:</span> <span className="font-medium">{cad.sup}</span></div>}
              </div>
            </SectionCard>

            <SectionCard icon={CalendarClock} title="Data Acordada com Cliente" right={<Button size="sm" variant="outline" onClick={() => setDateDialogOpen(true)}>Atualizar</Button>}>
              <div className="space-y-3">
                <div>
                  <div className="text-lg font-semibold">
                    {hub?.dataAcordadaAtual ? format(parseLocalDate(hub.dataAcordadaAtual), "dd/MM/yyyy", { locale: ptBR }) : "Não definida"}
                  </div>
                  {hub?.dataAcordadaOriginal && hub.dataAcordadaOriginal !== hub.dataAcordadaAtual && (
                    <div className="text-[11px] text-muted-foreground">
                      Data original: {format(parseLocalDate(hub.dataAcordadaOriginal), "dd/MM/yyyy", { locale: ptBR })}
                    </div>
                  )}
                </div>
                {hub && hub.historicoData.length > 0 && (
                  <div className="border-t pt-2 space-y-1">
                    <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                      <History className="h-3 w-3" /> Histórico
                    </div>
                    {hub.historicoData.slice().reverse().map((h, i) => (
                      <div key={i} className="text-[11px] text-muted-foreground flex items-center justify-between">
                        <span>{format(parseLocalDate(h.data), "dd/MM/yyyy", { locale: ptBR })}</span>
                        <span>{h.alteradoPor} · {format(new Date(h.alteradoEm), "dd/MM HH:mm", { locale: ptBR })}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>
          </div>

          <SectionCard icon={Package} title={`Recebimento de Amostras (${recebimentos.length})`}>
            {recebimentos.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">Nenhum registro de recebimento encontrado pra essa OS.</div>
            ) : (
              <div className="space-y-2">
                {recebimentos.map((t) => (
                  <div key={t.id} className="rounded-lg border bg-muted/20 p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{t.osCliente}</span>
                      <Badge variant="outline" className="text-[10px]">{t.dataChegada}</Badge>
                    </div>
                    <div className="text-muted-foreground">Recebido por: {(t.recebidoPor || []).join(", ") || "—"}</div>
                    <div className="text-muted-foreground">Tipo: {(t.tipoAmostra || []).join(", ") || "—"}</div>
                    {t.relacaoAmostras && <div className="text-muted-foreground">Relação: {t.relacaoAmostras}</div>}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard icon={Truck} title={`Entregas & Cronograma (${entregasPassadas.length + entregasFuturas.length})`}>
            {(setoresUnificados.length > 0 || escoposUnificados.length > 0) && (
              <div className="mb-3 pb-3 border-b space-y-1.5">
                {setoresUnificados.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap text-xs">
                    <span className="text-muted-foreground shrink-0">Setores:</span>
                    <SetorBadges setor={setoresUnificados.join(" / ")} size="xs" />
                  </div>
                )}
                {escoposUnificados.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap text-xs">
                    <span className="text-muted-foreground shrink-0">Escopo:</span>
                    {escoposUnificados.map((e) => (
                      <Badge key={e} variant="outline" className="text-[10px]">{e}</Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
            {entregasLoading ? (
              <div className="text-sm text-muted-foreground py-2">Carregando entregas...</div>
            ) : entregasPassadas.length + entregasFuturas.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">Nenhuma entrega registrada pra essa OS.</div>
            ) : (
              <div className="space-y-4">
                <EntregasTable title={`Realizadas / Atrasadas (${entregasPassadas.length})`} rows={entregasPassadas} />
                {entregasFuturas.length > 0 && (
                  <EntregasTable title={`Futuras (${entregasFuturas.length})`} rows={entregasFuturas} highlight />
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard icon={CalendarRange} title="Gantt da OS (planejado × real)">
            <OsGanttMini
              osNumero={osNumero}
              progs={progs}
              ensaiosProg={ensaiosProg}
              amostrasProg={amostrasProg}
              tiposProg={tiposProg}
              equipsProg={equipsProg}
            />
          </SectionCard>

          <SectionCard
            icon={FlaskConical}
            title={`Ensaios & Relatórios (${ensaiosFiltrados.length}/${ensaios.length})`}
            right={
              ensaios.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Select value={statusFiltro} onValueChange={(v) => setStatusFiltro(v as typeof statusFiltro)}>
                    <SelectTrigger className="h-7 w-[150px] text-[11px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os status</SelectItem>
                      {(Object.keys(STATUS_LABEL) as EnsaioItemOS["status"][]).map((s) => (
                        <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
                    <SelectTrigger className="h-7 w-[150px] text-[11px]">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os tipos</SelectItem>
                      {tiposDisponiveis.map((t) => (
                        <SelectItem key={t} value={t}>{ENSAIO_LABEL[t] ?? t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            }
          >
            {ensaios.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">Nenhum ensaio vinculado a essa OS ainda.</div>
            ) : ensaiosFiltrados.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">Nenhum ensaio corresponde a esse filtro.</div>
            ) : (
              <div className="space-y-2">
                {ensaiosFiltrados.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-foreground truncate">{e.amostra} · {e.ensaio}</div>
                      <div className="text-muted-foreground mt-0.5">
                        {e.furo && `Furo ${e.furo} · `}{e.prof}
                        {e.digitador && ` · Digitador: ${e.digitador}`}
                        {e.verificador && ` · Verificador: ${e.verificador}`}
                        {e.aprovador && ` · Aprovador: ${e.aprovador}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={STATUS_COLOR[e.status]}>{STATUS_LABEL[e.status]}</Badge>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => abrirEnsaio(e)}>
                        Abrir <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard icon={Send} title={`Emissões (${emissoes.length})`}>
            {emissoes.length === 0 ? (
              <div className="text-sm text-muted-foreground py-2">Nenhuma emissão registrada pra essa OS ainda.</div>
            ) : (
              <div className="space-y-2">
                {emissoes.map((em) => (
                  <div key={em.scope_id} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground truncate">{em.amostra_code} · {em.ensaio_nome || em.ensaio_tipo}</div>
                      <div className="text-muted-foreground">
                        {em.decided_by_name ? `Aprovado por ${em.decided_by_name}` : em.verified_by_name ? `Verificado por ${em.verified_by_name}` : "Aguardando"}
                        {em.decided_at && ` · ${format(new Date(em.decided_at), "dd/MM/yyyy", { locale: ptBR })}`}
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 gap-1">
                      {em.status === "aprovado" && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                      {em.status} {em.rev != null && `· rev.${em.rev}`}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Chat fixo ao lado — acompanha a rolagem da página */}
        <div className="lg:sticky lg:top-4">
          <div className="flex items-center gap-1.5 text-sm font-semibold mb-2">
            <MessageSquare className="h-4 w-4 text-primary" /> Chat da OS
          </div>
          <OsChatPanel osNumero={osNumero} messages={hub?.messages ?? []} onPosted={() => refetchHub()} />
        </div>
      </div>

      {/* Dialog: atualizar data acordada */}
      <Dialog open={dateDialogOpen} onOpenChange={setDateDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Atualizar Data Acordada</DialogTitle>
            <DialogDescription className="text-xs">
              A data original fica registrada no histórico e nunca é sobrescrita.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label className="text-xs">Nova data acordada com o cliente</Label>
            <Input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} className="h-9 text-sm" />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDateDialogOpen(false)}>Cancelar</Button>
            <Button size="sm" disabled={!novaData || savingDate} onClick={handleSalvarData}>
              {savingDate ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação: arquivar OS */}
      <AlertDialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar OS {osNumero}?</AlertDialogTitle>
            <AlertDialogDescription>
              A OS deixa de aparecer na lista de Ensaios Especiais (fica acessível de novo com "Mostrar arquivadas" ou reativando por aqui). Use isso quando a OS já estiver concluída. Nenhum dado é apagado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={archiving} onClick={handleArquivar}>
              {archiving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Arquivar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
