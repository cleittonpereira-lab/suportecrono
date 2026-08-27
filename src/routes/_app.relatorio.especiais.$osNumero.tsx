/**
 * Hub de uma OS de Ensaio Especial — concentra identificação, recebimento de
 * amostras, programação/execução, ensaios & relatórios, emissões e o chat
 * dessa OS numa página própria (aberta a partir da aba "Ensaios Especiais").
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
  ClipboardList,
  FlaskConical,
  Send,
  MessageSquare,
  ExternalLink,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useCadastroByOs } from "@/hooks/use-cadastro-by-os";
import { useOsGroups, abrirEnsaioNaCentral, type EnsaioItemOS } from "@/features/lab/hooks/use-os-groups";
import { normOs } from "@/lib/schedule-utils";
import { listEmissoes } from "@/lib/emissoes.functions";
import { fetchSharedChegadaState } from "@/lib/chegada-amostras.functions";
import { getOsHub, atualizarDataAcordada, arquivarOs, desarquivarOs } from "@/lib/os-hub.functions";
import { OsChatPanel } from "@/features/lab/components/OsChatPanel";

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

function OsEspecialHubPage() {
  const { osNumero } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const cadastro = useCadastroByOs();
  const { osGroups, amostrasProg, ensaiosProg, progs, equipsProg, currentUserName } = useOsGroups();

  const getOsHubFn = useServerFn(getOsHub);
  const atualizarDataFn = useServerFn(atualizarDataAcordada);
  const arquivarFn = useServerFn(arquivarOs);
  const desarquivarFn = useServerFn(desarquivarOs);
  const listEmissoesFn = useServerFn(listEmissoes);
  const fetchChegadaFn = useServerFn(fetchSharedChegadaState);

  const cad = cadastro.lookup(osNumero);
  const group = osGroups.find((g) => normOs(g.osNumero) === normOs(osNumero));
  const ensaios = group?.ensaios ?? [];

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
    <div className="space-y-6 w-full px-4 sm:px-6 md:px-8 pb-20">
      <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" asChild>
        <Link to="/relatorio/pendentes" search={{ tab: "ensaios-especiais" }}>
          <ArrowLeft className="h-4 w-4" /> Ensaios Especiais
        </Link>
      </Button>

      <PageHeader
        eyebrow="Hub da OS · Ensaio Especial"
        title={`OS ${osNumero}`}
        description={cad?.tomador || group?.cliente}
        actions={
          hub?.arquivada ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDesarquivar}>
              <ArchiveRestore className="h-4 w-4" /> Reativar OS
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setArchiveConfirmOpen(true)}>
              <Archive className="h-4 w-4" /> Arquivar OS
            </Button>
          )
        }
      />

      {hub?.arquivada && (
        <Badge variant="outline" className="gap-1.5 bg-slate-500/10 text-slate-600 border-slate-500/30">
          <Archive className="h-3 w-3" /> OS arquivada em {hub.arquivadaEm ? format(new Date(hub.arquivadaEm), "dd/MM/yyyy", { locale: ptBR }) : ""} por {hub.arquivadaPor}
        </Badge>
      )}

      <Tabs defaultValue="visao-geral" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto justify-start gap-1 w-full bg-muted/40 p-1 border">
          <TabsTrigger value="visao-geral" className="gap-1.5 text-xs">
            <Building className="h-3.5 w-3.5" /> Visão Geral
          </TabsTrigger>
          <TabsTrigger value="recebimento" className="gap-1.5 text-xs">
            <Package className="h-3.5 w-3.5 text-amber-600" /> Recebimento ({recebimentos.length})
          </TabsTrigger>
          <TabsTrigger value="programacao" className="gap-1.5 text-xs">
            <ClipboardList className="h-3.5 w-3.5 text-sky-600" /> Programação & Execução
          </TabsTrigger>
          <TabsTrigger value="ensaios" className="gap-1.5 text-xs">
            <FlaskConical className="h-3.5 w-3.5 text-violet-600" /> Ensaios & Relatórios ({ensaios.length})
          </TabsTrigger>
          <TabsTrigger value="emissoes" className="gap-1.5 text-xs">
            <Send className="h-3.5 w-3.5 text-emerald-600" /> Emissões ({emissoes.length})
          </TabsTrigger>
          <TabsTrigger value="chat" className="gap-1.5 text-xs">
            <MessageSquare className="h-3.5 w-3.5 text-primary" /> Chat ({hub?.messages.length ?? 0})
          </TabsTrigger>
        </TabsList>

        {/* VISÃO GERAL */}
        <TabsContent value="visao-geral" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Building className="h-4 w-4 text-primary" /> Identificação
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{cad?.tomador || group?.cliente || "—"}</span></div>
                <div><span className="text-muted-foreground">Obra:</span> <span className="font-medium">{cad?.obra || group?.obra || "—"}</span></div>
                <div className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-muted-foreground" /> <span className="font-medium">{cad?.local || group?.local || "—"}</span></div>
                {cad?.sup && <div><span className="text-muted-foreground">Sup.:</span> <span className="font-medium">{cad.sup}</span></div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-primary" /> Data Acordada com Cliente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
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
                  <Button size="sm" variant="outline" onClick={() => setDateDialogOpen(true)}>Atualizar data</Button>
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
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* RECEBIMENTO */}
        <TabsContent value="recebimento" className="space-y-3">
          {recebimentos.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum registro de recebimento encontrado pra essa OS.</CardContent></Card>
          ) : (
            recebimentos.map((t) => (
              <Card key={t.id}>
                <CardContent className="p-4 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{t.osCliente}</span>
                    <Badge variant="outline" className="text-[10px]">{t.dataChegada}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">Recebido por: {(t.recebidoPor || []).join(", ") || "—"}</div>
                  <div className="text-xs text-muted-foreground">Tipo: {(t.tipoAmostra || []).join(", ") || "—"}</div>
                  {t.relacaoAmostras && <div className="text-xs text-muted-foreground">Relação: {t.relacaoAmostras}</div>}
                  {t.numeroControle && <div className="text-[10px] text-muted-foreground font-mono">{t.numeroControle}</div>}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* PROGRAMAÇÃO & EXECUÇÃO */}
        <TabsContent value="programacao" className="space-y-2">
          {ensaios.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum ensaio programado.</CardContent></Card>
          ) : (
            ensaios.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 text-xs">
                <div className="min-w-0">
                  <div className="font-semibold text-foreground truncate">{e.amostra} · {e.ensaio}</div>
                  <div className="text-muted-foreground">{e.furo && `Furo ${e.furo} · `}{e.prof}{e.tecnico && ` · Téc. ${e.tecnico}`}</div>
                </div>
                <Badge variant="outline" className={`${STATUS_COLOR[e.status]} shrink-0`}>{STATUS_LABEL[e.status]}</Badge>
              </div>
            ))
          )}
        </TabsContent>

        {/* ENSAIOS & RELATÓRIOS */}
        <TabsContent value="ensaios" className="space-y-2">
          {ensaios.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum ensaio vinculado a essa OS ainda.</CardContent></Card>
          ) : (
            ensaios.map((e) => (
              <Card key={e.id}>
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 text-xs">
                    <div className="font-semibold text-sm text-foreground truncate">{e.amostra} · {e.ensaio}</div>
                    <div className="text-muted-foreground mt-0.5">
                      {e.digitador && `Digitador: ${e.digitador}`}
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
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* EMISSÕES */}
        <TabsContent value="emissoes" className="space-y-2">
          {emissoes.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhuma emissão registrada pra essa OS ainda.</CardContent></Card>
          ) : (
            emissoes.map((em) => (
              <div key={em.scope_id} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 text-xs">
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
            ))
          )}
        </TabsContent>

        {/* CHAT */}
        <TabsContent value="chat">
          <OsChatPanel osNumero={osNumero} messages={hub?.messages ?? []} onPosted={() => refetchHub()} />
        </TabsContent>
      </Tabs>

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
