import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { detectMethodology, methodologyRoute } from "@/features/mesp-natural/calc";
import { labStore } from "@/features/lab/store";
import type { EnsaioTipo } from "@/features/lab/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  listPendenciasDigitacao,
  atualizarPendenciaDigitacao,
  removerPendenciaDigitacao,
  type PendenciaDigitacao,
} from "@/lib/lab-pendencias.functions";
import { listRows } from "@/lib/programacao.functions";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCadastroByOs } from "@/hooks/use-cadastro-by-os";
import { EmissoesInner } from "@/components/emissoes-inner";

export const Route = createFileRoute("/_app/relatorio/pendentes")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Digitação & Emissões — Suporte INFRA" },
      { name: "description", content: "Fluxo integrado desde a execução no Gantt até a emissão final do laudo." },
    ],
  }),
  component: PendentesPage,
});

const STATUS_LABEL: Record<PendenciaDigitacao["status"], string> = {
  pendente: "Pendente",
  em_digitacao: "Em digitação",
  digitado: "Digitado",
  verificado: "Verificado",
  aprovado: "Aprovado",
};

const STATUS_COLOR: Record<PendenciaDigitacao["status"], string> = {
  pendente: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  em_digitacao: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
  digitado: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30",
  verificado: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30",
  aprovado: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
};

function PendentesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const activeTab = search.tab ?? "visao-geral";
  const list = useServerFn(listPendenciasDigitacao);
  const upd = useServerFn(atualizarPendenciaDigitacao);
  const del = useServerFn(removerPendenciaDigitacao);
  const rows0Fn = useServerFn(listRows);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["lab-pendencias"],
    queryFn: () => list(),
  });

  // Próximos ensaios: programações em execução na aba Programação.
  const { data: progs = [] } = useQuery({
    queryKey: ["prox-ensaios-progs"],
    queryFn: async () => rows0Fn({ data: { sheet: "Programações" } }),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
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

  const proximos = useMemo(() => {
    const amMap = new Map(amostrasProg.map((a) => [a.id, a]));
    const enMap = new Map(ensaiosProg.map((e) => [e.id, e]));
    const tpMap = new Map(tiposProg.map((t) => [t.id, t]));
    const eqMap = new Map(equipsProg.map((e) => [e.id, e]));
    // Já criadas como pendência (evita duplicar sinal)
    const jaPend = new Set(rows.map((r) => `${r.os}||${r.amostra ?? ""}||${r.ensaio}`));
    const items = progs
      .filter((p) => {
        const st = (p.status || "").toLowerCase();
        const iniciou = !!p.data_inicio_real;
        const concluiu = !!p.data_fim_real || st === "concluido";
        return iniciou && !concluiu;
      })
      .map((p) => {
        const e = enMap.get(p.ensaio_id ?? "");
        const a = e ? amMap.get(e.amostra_id ?? "") : undefined;
        const t = e ? tpMap.get(e.tipo_ensaio_id ?? "") : undefined;
        const eq = p.equipamento_id ? eqMap.get(p.equipamento_id) : undefined;
        return {
          id: p.id,
          os: a?.os_numero ?? "—",
          amostra: a?.codigo_amostra ?? null,
          ensaio: t?.nome ?? "Ensaio",
          equipamento: eq?.nome ?? null,
          inicio_real: p.data_inicio_real || null,
          previsao_fim: p.data_fim || null,
          tecnico: p.tecnico || null,
        };
      })
      .filter((r) => !jaPend.has(`${r.os}||${r.amostra ?? ""}||${r.ensaio}`))
      .sort((x, y) => (x.previsao_fim ?? "").localeCompare(y.previsao_fim ?? ""));
    return items;
  }, [progs, amostrasProg, ensaiosProg, tiposProg, equipsProg, rows]);

  const [busca, setBusca] = useState("");

  const cadastro = useCadastroByOs();

  const filterBy = (
    status: PendenciaDigitacao["status"],
    opts?: { origem?: "gantt" | "digitalizacao" | "any" },
  ) => {
    const origem = opts?.origem ?? "any";
    const q = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (r.status !== status) return false;
      if (origem === "gantt" && r.origem === "digitalizacao") return false;
      if (origem === "digitalizacao" && r.origem !== "digitalizacao") return false;
      if (!q) return true;
      return (
        r.os.toLowerCase().includes(q) ||
        (r.amostra ?? "").toLowerCase().includes(q) ||
        r.ensaio.toLowerCase().includes(q) ||
        (r.tipo_ensaio ?? "").toLowerCase().includes(q)
      );
    });
  };

  // Em Execução = digitalização iniciada via QR, ainda sem dados finais.
  const emExecucao = useMemo(
    () => rows.filter((r) => r.status === "em_digitacao" && r.origem === "digitalizacao"),
    [rows],
  );

  // Enviados p/ digitação = pendências criadas pela Digitalização (QR)
  const enviadosDigit = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((r) => {
      if (r.origem !== "digitalizacao" || r.status !== "pendente") return false;
      if (!q) return true;
      return (
        r.os.toLowerCase().includes(q) ||
        (r.amostra ?? "").toLowerCase().includes(q) ||
        r.ensaio.toLowerCase().includes(q)
      );
    });
  }, [rows, busca]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { pendente: 0, em_digitacao: 0, digitado: 0, verificado: 0, aprovado: 0 };
    rows.forEach((r) => (c[r.status] = (c[r.status] ?? 0) + 1));
    return c;
  }, [rows]);

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: PendenciaDigitacao["status"] }) =>
      upd({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lab-pendencias"] });
      toast.success("Status atualizado.");
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lab-pendencias"] });
      toast.success("Pendência removida.");
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError: (e: any) => toast.error(e.message),
  });

  const [confirmStart, setConfirmStart] = useState<PendenciaDigitacao | null>(null);

  // Metodologias com processamento/relatório implementados hoje:
  // M.ESP.A, Triaxial CID e Adensamento. Para ensaios ainda sem
  // metodologia (ex.: Triaxial UU) o botão fica desabilitado.
  const metodologiaDe = (r: PendenciaDigitacao) =>
    detectMethodology(r.ensaio, r.tipo_ensaio);

  /**
   * Abre o editor de digitação da pendência.
   * - M.ESP.A: rota dedicada `/relatorio/mesp-a?pendencia=<id>`.
   * - Triaxial CID / Adensamento: os editores vivem em
   *   `/relatorio/os/$osId/amostra/$amostraId/ensaio/$ensaioId` e exigem
   *   OS/Amostra/Ensaio no labStore. Aqui garantimos (find-or-create)
   *   essas entidades a partir dos dados da pendência antes de navegar.
   */
  function abrirDigitacao(r: PendenciaDigitacao) {
    const metodo = metodologiaDe(r);
    if (!metodo) return;
    if (metodo === "mesp-a") {
      navigate({ to: methodologyRoute(metodo), search: { pendencia: r.id } });
      return;
    }
    const tipo: EnsaioTipo =
      metodo === "adensamento" ? "adensamento" : "triaxial-cid";
    const state = labStore.get();
    let os = state.os.find((o) => (o.numero ?? "").trim() === r.os.trim());
    if (!os) os = labStore.createOS({ numero: r.os });
    const amCode = (r.amostra ?? "").trim();
    let am = os.amostras.find(
      (a) => (a.reportNumber ?? a.code ?? "").trim() === amCode,
    );
    if (!am) am = labStore.addAmostra(os.id, { reportNumber: amCode, code: amCode });
    let en = am.ensaios.find((e) =>
      metodo === "adensamento"
        ? e.tipo === "adensamento"
        : e.tipo === "triaxial-cid" || e.tipo === "triaxial-cid-sat" || e.tipo === "triaxial-cid-nat",
    );
    if (!en) en = labStore.addEnsaio(os.id, am.id, tipo, r.tipo_ensaio ?? r.ensaio);
    navigate({
      to: "/relatorio/os/$osId/amostra/$amostraId/ensaio/$ensaioId",
      params: { osId: os.id, amostraId: am.id, ensaioId: en.id },
    });
  }

  const osInfo = (os: string) => {
    const c = cadastro.lookup(os);
    if (!c) return null;
    return (
      <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">
        {[c.tomador, c.obra].filter(Boolean).join(" · ")}
      </div>
    );
  };

  return (
    <div className="space-y-6 w-full">
      <PageHeader
        eyebrow="Relatório · Laboratório"
        icon={ClipboardList}
        title="Digitação & Emissões"
        description="Fluxo integrado: ensaios saem do Gantt para digitação, verificação e aprovação — tudo em um só lugar."
      />

      <div className="relative max-w-md">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por OS, amostra, ensaio..."
          className="pl-8"
        />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => navigate({ to: "/relatorio/pendentes", search: { tab: v } })} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto justify-start gap-1 w-full">
          <TabsTrigger value="visao-geral" className="gap-1">
            <LayoutDashboard className="h-3.5 w-3.5" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="proximos" className="gap-1">
            <FlaskConical className="h-3.5 w-3.5" />
            Próximos ({proximos.length})
          </TabsTrigger>
          <TabsTrigger value="pendente" className="gap-1">
            <ClipboardList className="h-3.5 w-3.5" />
            Pendentes ({rows.filter(r => r.status === "pendente" && r.origem !== "digitalizacao").length})
          </TabsTrigger>
          <TabsTrigger value="em_execucao" className="gap-1">
            <PlayCircle className="h-3.5 w-3.5" />
            Em execução ({emExecucao.length})
          </TabsTrigger>
          <TabsTrigger value="enviados" className="gap-1">
            <Send className="h-3.5 w-3.5" />
            Enviados p/ digitação ({enviadosDigit.length})
          </TabsTrigger>
          <TabsTrigger value="em_digitacao" className="gap-1">
            <Activity className="h-3.5 w-3.5" />
            Em digitação ({rows.filter(r => r.status === "em_digitacao" && r.origem !== "digitalizacao").length})
          </TabsTrigger>
          <TabsTrigger value="verificacao" className="gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            Aguardando Verificação
          </TabsTrigger>
          <TabsTrigger value="aprovacao" className="gap-1">
            <Clock className="h-3.5 w-3.5" />
            Aguardando Aprovação
          </TabsTrigger>
          <TabsTrigger value="aprovados" className="gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Aprovados
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {(["pendente", "em_digitacao", "digitado", "verificado", "aprovado"] as const).map((s) => (
              <Card key={s}>
                <CardContent className="pt-4 pb-3">
                  <div className="text-xs text-muted-foreground">{STATUS_LABEL[s]}</div>
                  <div className="text-2xl font-semibold">{counts[s] ?? 0}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <MiniStat icon={FlaskConical} label="Próximos (em execução no Gantt)" value={proximos.length} />
            <MiniStat icon={PlayCircle} label="Em execução (digitalização)" value={emExecucao.length} />
            <MiniStat icon={Send} label="Enviados para digitação" value={enviadosDigit.length} />
            <MiniStat icon={Stamp} label="Aprovados (histórico)" value={counts.aprovado ?? 0} />
          </div>
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              <p className="mb-2">
                Fluxo canônico — cada etapa registra <b>quem</b> executou e <b>quando</b>, com
                cálculo automático de SLA:
              </p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Próximos ensaios (Gantt em execução)</li>
                <li>Pendentes (Gantt concluído, digitação não iniciada)</li>
                <li>Em execução (QR lido, digitação iniciada, sem dados finais)</li>
                <li>Enviados para digitação (digitalização finalizada no campo)</li>
                <li>Em digitação (digitador processando os dados)</li>
                <li>Aguardando verificação → Aguardando aprovação → Aprovados</li>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="enviados">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground mb-3">
                Ensaios enviados pela <b>Digitalização</b> (QR/scanner). Ao iniciar a
                digitação, o relatório abre já com os dados coletados no laboratório.
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>OS</TableHead>
                      <TableHead>Amostra</TableHead>
                      <TableHead>Ensaio</TableHead>
                      <TableHead>Enviado por</TableHead>
                      <TableHead>Enviado em</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enviadosDigit.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          <div>{r.os}</div>
                          {osInfo(r.os)}
                        </TableCell>
                        <TableCell>{r.amostra ?? "—"}</TableCell>
                        <TableCell>
                          <div>{r.ensaio}</div>
                          {r.tipo_ensaio && <div className="text-xs text-muted-foreground">{r.tipo_ensaio}</div>}
                        </TableCell>
                        <TableCell className="text-sm">{r.operador_nome ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          {r.updated_at ? format(new Date(r.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button size="sm" onClick={() => setConfirmStart(r)}>
                            <Play className="h-3.5 w-3.5 mr-1" />
                            Iniciar digitação
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { if (confirm("Remover este envio?")) remove.mutate(r.id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {enviadosDigit.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Nenhum ensaio enviado pela Digitalização.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="proximos">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground mb-3">
                Ensaios <b>em execução</b> no Gantt — assim que forem concluídos, aparecerão automaticamente na aba <b>Pendente</b>.
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>OS</TableHead>
                      <TableHead>Amostra</TableHead>
                      <TableHead>Ensaio</TableHead>
                      <TableHead>Equipamento</TableHead>
                      <TableHead>Técnico</TableHead>
                      <TableHead>Início real</TableHead>
                      <TableHead>Previsão fim</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {proximos.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          <div>{r.os}</div>
                          {osInfo(r.os)}
                        </TableCell>
                        <TableCell>{r.amostra ?? "—"}</TableCell>
                        <TableCell>{r.ensaio}</TableCell>
                        <TableCell>{r.equipamento ?? "—"}</TableCell>
                        <TableCell>{r.tecnico ?? "—"}</TableCell>
                        <TableCell className="text-sm">{fmtDay(r.inicio_real)}</TableCell>
                        <TableCell className="text-sm">{fmtDay(r.previsao_fim)}</TableCell>
                      </TableRow>
                    ))}
                    {proximos.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          Nenhum ensaio em execução no momento.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pendente">
          <Card>
            <CardContent className="pt-6">
              {isLoading ? (
                <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>OS</TableHead>
                        <TableHead>Amostra</TableHead>
                        <TableHead>Ensaio</TableHead>
                        <TableHead>Equipamento</TableHead>
                        <TableHead>Concluído em</TableHead>
                        <TableHead>Operador</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filterBy("pendente", { origem: "gantt" }).map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">
                            <div>{r.os}</div>
                            {osInfo(r.os)}
                          </TableCell>
                          <TableCell>{r.amostra ?? "—"}</TableCell>
                          <TableCell>
                            <div>{r.ensaio}</div>
                            {r.tipo_ensaio && <div className="text-xs text-muted-foreground">{r.tipo_ensaio}</div>}
                          </TableCell>
                          <TableCell>{r.equipamento ?? "—"}</TableCell>
                          <TableCell className="text-sm">
                            {r.data_conclusao
                              ? format(new Date(r.data_conclusao), "dd/MM/yyyy HH:mm", { locale: ptBR })
                              : "—"}
                          </TableCell>
                          <TableCell className="text-sm">{r.operador_nome ?? "—"}</TableCell>
                          <TableCell className="text-right space-x-1">
                            {metodologiaDe(r) ? (
                              <Button
                                size="sm"
                                onClick={() => setConfirmStart(r)}
                                disabled={setStatus.isPending}
                              >
                                <Play className="h-3.5 w-3.5 mr-1" />
                                Iniciar digitação
                              </Button>
                            ) : (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span tabIndex={0}>
                                      <Button size="sm" variant="outline" disabled>
                                        <Play className="h-3.5 w-3.5 mr-1" />
                                        Metodologia em breve
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    A digitalização deste ensaio ainda não está disponível.
                                    Assim que a metodologia de processamento for implementada,
                                    o botão será habilitado automaticamente.
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { if (confirm("Remover esta pendência?")) remove.mutate(r.id); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filterBy("pendente", { origem: "gantt" }).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            Nenhuma pendência aguardando digitação.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="em_digitacao">
          <Card>
            <CardContent className="pt-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>OS</TableHead>
                      <TableHead>Amostra</TableHead>
                      <TableHead>Ensaio</TableHead>
                      <TableHead>Digitador</TableHead>
                      <TableHead>Iniciado em</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filterBy("em_digitacao", { origem: "gantt" }).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          <div>{r.os}</div>
                          {osInfo(r.os)}
                        </TableCell>
                        <TableCell>{r.amostra ?? "—"}</TableCell>
                        <TableCell>
                          <div>{r.ensaio}</div>
                          {r.tipo_ensaio && <div className="text-xs text-muted-foreground">{r.tipo_ensaio}</div>}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{r.digitador_nome ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          {r.updated_at ? format(new Date(r.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_COLOR[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {(() => {
                            const metodo = metodologiaDe(r);
                            if (!metodo) return null;
                            return (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="mr-1"
                                onClick={() =>
                                  abrirDigitacao(r)
                                }
                              >
                                <FileEdit className="h-3.5 w-3.5 mr-1" />
                                Abrir digitação
                              </Button>
                            );
                          })()}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setStatus.mutate({ id: r.id, status: "digitado" })}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                            Marcar como digitado
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filterBy("em_digitacao", { origem: "gantt" }).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          Nenhum ensaio em digitação no momento.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="em_execucao">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground mb-3">
                Ensaios com QR lido e digitação iniciada no laboratório — dados finais ainda
                não foram enviados.
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>OS</TableHead>
                      <TableHead>Amostra</TableHead>
                      <TableHead>Ensaio</TableHead>
                      <TableHead>Operador</TableHead>
                      <TableHead>Iniciado em</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emExecucao.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          <div>{r.os}</div>
                          {osInfo(r.os)}
                        </TableCell>
                        <TableCell>{r.amostra ?? "—"}</TableCell>
                        <TableCell>
                          <div>{r.ensaio}</div>
                          {r.tipo_ensaio && <div className="text-xs text-muted-foreground">{r.tipo_ensaio}</div>}
                        </TableCell>
                        <TableCell className="text-sm">{r.operador_nome ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          {r.updated_at ? format(new Date(r.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {metodologiaDe(r) && (
                            <Button size="sm" variant="secondary" onClick={() => abrirDigitacao(r)}>
                              <FileEdit className="h-3.5 w-3.5 mr-1" />
                              Abrir digitação
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {emExecucao.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Nenhum ensaio em execução na digitalização.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="verificacao" className="mt-0">
          <EmissoesInner embedded singleTab="verificacao" hideHeader />
        </TabsContent>
        <TabsContent value="aprovacao" className="mt-0">
          <EmissoesInner embedded singleTab="aprovacao" hideHeader />
        </TabsContent>
        <TabsContent value="aprovados" className="mt-0">
          <EmissoesInner embedded singleTab="aprovados" hideHeader />
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!confirmStart} onOpenChange={(o) => !o && setConfirmStart(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Iniciar digitação?</AlertDialogTitle>
            <AlertDialogDescription>
              Ao iniciar, esta pendência ficará vinculada ao seu usuário como digitador responsável.
              {confirmStart && (
                <div className="mt-3 p-3 rounded-md border bg-muted/40 text-sm text-foreground space-y-0.5">
                  <div><b>OS:</b> {confirmStart.os}</div>
                  <div><b>Amostra:</b> {confirmStart.amostra ?? "—"}</div>
                  <div><b>Ensaio:</b> {confirmStart.ensaio}</div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmStart) return;
                const pend = confirmStart;
                const metodo = metodologiaDe(pend);
                // 1) Fecha o diálogo e navega imediatamente para o módulo
                //    de relatório correspondente. Não bloqueamos a navegação
                //    no resultado da mutação — se ela falhar, o usuário ainda
                //    consegue trabalhar no relatório e um toast avisa o erro.
                setConfirmStart(null);
                if (metodo) {
                  abrirDigitacao(pend);
                }
                // 2) Atualiza status em background.
                setStatus.mutate(
                  { id: pend.id, status: "em_digitacao" },
                  {
                    onError: (e) =>
                      toast.error(
                        "Falha ao marcar como em digitação: " +
                          (e instanceof Error ? e.message : String(e)),
                      ),
                  },
                );
              }}
            >
              Sim, iniciar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function fmtDay(iso: string | null) {
  if (!iso) return "—";
  try {
    return format(new Date(iso + (iso.length === 10 ? "T00:00:00" : "")), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return iso;
  }
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FlaskConical;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground truncate">{label}</div>
          <div className="text-xl font-semibold tabular-nums">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}