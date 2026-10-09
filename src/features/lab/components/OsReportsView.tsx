import { useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  FolderKanban,
  FileText,
  Search,
  Download,
  FileSpreadsheet,
  FileArchive,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  Play,
  MapPin,
  Building,
  User,
  ExternalLink,
  Plus,
  RefreshCw,
  Archive,
  Loader2,
  AlertCircle,
  Eye,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { labStore } from "@/features/lab/store";
import { ENSAIO_LABEL, type EnsaioTipo } from "@/features/lab/types";
import {
  concluirPendenciaExterna,
  removerPendenciaDigitacao,
} from "@/lib/lab-pendencias.functions";
import { useOsGroups, extractSampleDetails, abrirEnsaioNaCentral, type EnsaioItemOS, type OsGroup } from "@/features/lab/hooks/use-os-groups";
import { normOs } from "@/lib/schedule-utils";
import { toast } from "sonner";
import { ETAPAS_COM_BANCADA, corEtapa, rotuloEtapa } from "@/lib/etapa-laudo";
import { useAuth } from "@/hooks/use-auth";
import { podeConcluirFora } from "@/lib/papeis";
import { useLaudosNoFluxo } from "@/features/lab/hooks/use-laudos-no-fluxo";
import { usePacoteDeLaudos } from "@/features/lab/hooks/use-pacote-de-laudos";

// Rótulos e cores de src/lib/etapa-laudo.ts — os mesmos da Central e da página da OS.
const STATUS_BADGE = Object.fromEntries(
  ETAPAS_COM_BANCADA.map((e) => [e, { label: rotuloEtapa(e), color: corEtapa(e) }]),
) as Record<EnsaioItemOS["status"], { label: string; color: string }>;

export function OsReportsView() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { role, profile } = useAuth();
  // Arquivar como "Concluído fora (Excel)": só quem verifica (lib/papeis.ts; o servidor confere).
  const podeMarcarFora = podeConcluirFora({ role, labRole: profile?.labRole });
  const {
    osGroups,
    pendencias,
    refetchPend,
    progs,
    amostrasProg,
    ensaiosProg,
    tiposProg,
    equipsProg,
    cadastro,
    currentUserName,
    deletedOs,
    setDeletedOs,
    deletedEnsaios,
    setDeletedEnsaios,
  } = useOsGroups();

  const [busca, setBusca] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "em_andamento" | "concluidas">("all");
  const [expandedOs, setExpandedOs] = useState<Record<string, boolean>>({});

  // PDFs: sempre o arquivo ORIGINAL do Drive (assinado), na maior revisão
  // aprovada. Antes estes botões geravam um PDF genérico na hora, sem os
  // resultados do ensaio.
  const { data: laudosNoFluxo } = useLaudosNoFluxo();
  const { baixar: baixarPacote, baixarUm, progresso: progressoPacote } = usePacoteDeLaudos();
  const laudosAprovadosDaOs = (osNumero: string) =>
    (laudosNoFluxo ?? []).filter((r) => normOs(r.os_numero ?? "") === normOs(osNumero) && r.rev_aprovada != null);
  const laudoDoEnsaio = (en: EnsaioItemOS) =>
    (laudosNoFluxo ?? []).find((r) => r.scope_id.endsWith(`/ensaio/${en.id}`));

  // Modal de Exclusão com Confirmação
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    type: "os" | "ensaio";
    osNumero: string;
    osId?: string;
    ensaio?: EnsaioItemOS;
  } | null>(null);

  // Modal de Arquivamento de OS
  const [archiveModal, setArchiveModal] = useState<OsGroup | null>(null);
  const [archiveObs, setArchiveObs] = useState("OS Arquivada — Relatório entregue fora da Central (Planilha Excel)");
  const [archiving, setArchiving] = useState(false);

  // Queries
  const conclExtFn = useServerFn(concluirPendenciaExterna);
  const delFn = useServerFn(removerPendenciaDigitacao);

  // Filtro de busca
  const filteredGroups = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return osGroups.filter((g) => {
      if (statusFilter === "concluidas") {
        const total = g.ensaios.length;
        const conc = g.ensaios.filter((e) => e.status === "aprovado" || e.status === "concluido_externo").length;
        if (total === 0 || conc < total) return false;
      }
      if (statusFilter === "em_andamento") {
        const conc = g.ensaios.filter((e) => e.status === "aprovado" || e.status === "concluido_externo").length;
        if (g.ensaios.length > 0 && conc === g.ensaios.length) return false;
      }

      if (!q) return true;
      return (
        g.osNumero.toLowerCase().includes(q) ||
        g.cliente.toLowerCase().includes(q) ||
        g.obra.toLowerCase().includes(q) ||
        g.local.toLowerCase().includes(q) ||
        (g.sup ?? "").toLowerCase().includes(q) ||
        g.ensaios.some((e) => e.amostra.toLowerCase().includes(q) || e.ensaio.toLowerCase().includes(q))
      );
    });
  }, [osGroups, busca, statusFilter]);

  // Arquivar OS em massa
  async function handleArchiveOs() {
    if (!archiveModal) return;
    setArchiving(true);
    try {
      const pendenciasOs = pendencias.filter((p) => p.os.trim() === archiveModal.osNumero.trim());
      for (const p of pendenciasOs) {
        if (p.status !== "aprovado" && p.status !== "concluido_externo") {
          await conclExtFn({ data: { id: p.id, observacao: archiveObs } });
        }
      }

      const state = labStore.get();
      const os = state.os.find((o) => (o.numero ?? "").trim() === archiveModal.osNumero.trim());
      if (os) {
        for (const am of os.amostras) {
          for (const en of am.ensaios) {
            // "Concluído fora (Excel)", como as pendências acima — "concluido" é
            // aprovado para o status único, e os laudos apareciam aprovados.
            labStore.patchEnsaio(os.id, am.id, en.id, { status: "concluido_externo" });
          }
        }
      }

      qc.invalidateQueries({ queryKey: ["lab-pendencias"] });
      toast.success(`OS ${archiveModal.osNumero} arquivada como 'Entregue fora da Central (Excel)'!`);
      setArchiveModal(null);
    } catch (err: any) {
      toast.error(`Erro ao arquivar OS: ${err.message}`);
    } finally {
      setArchiving(false);
    }
  }

  // Baixa laudo individual em PDF: o original do Drive, na maior revisão aprovada.
  async function downloadSinglePdf(_group: OsGroup, en: EnsaioItemOS) {
    const laudo = laudoDoEnsaio(en);
    if (!laudo || laudo.rev_aprovada == null) {
      toast.error(`${en.amostra} · ${en.ensaio}: não há revisão aprovada com PDF no Drive para baixar.`);
      return;
    }
    await baixarUm(laudo);
  }

  // Baixa a planilha individual: a ORIGINAL do Drive, da maior revisão aprovada.
  async function downloadSingleExcel(_group: OsGroup, en: EnsaioItemOS) {
    const laudo = laudoDoEnsaio(en);
    if (!laudo || laudo.rev_aprovada == null) {
      toast.error(`${en.amostra} · ${en.ensaio}: não há revisão aprovada para baixar a planilha.`);
      return;
    }
    await baixarUm(laudo, "xlsx");
  }

  // Download em lote por OS: arquivos ORIGINAIS do Drive (PDF e/ou planilha), última revisão aprovada.
  // Antes os três botões geravam arquivos genéricos na hora, sem os resultados do ensaio.
  async function handleBatchDownload(group: OsGroup, tipoDownload: "aprovados_pdf" | "pdf_excel" | "excel") {
    const laudos = laudosAprovadosDaOs(group.osNumero);
    if (laudos.length === 0) {
      toast.error(`OS ${group.osNumero}: nenhum laudo com revisão aprovada no fluxo para baixar.`);
      return;
    }
    await baixarPacote(laudos, tipoDownload === "aprovados_pdf" ? "pdf" : tipoDownload === "pdf_excel" ? "pdf_xlsx" : "xlsx");
  }

  function handleDeleteConfirm() {
    if (!deleteModal) return;
    if (deleteModal.type === "os") {
      if (deleteModal.osId) {
        labStore.deleteOS(deleteModal.osId);
      }
      const next = new Set(deletedOs);
      next.add(normOs(deleteModal.osNumero));
      setDeletedOs(next);
      localStorage.setItem("suporte_infra_deleted_os_v1", JSON.stringify(Array.from(next)));

      // Remove também pendências vinculadas de forma segura
      const pendenciasOs = pendencias.filter((p) => normOs(p.os) === normOs(deleteModal.osNumero));
      for (const p of pendenciasOs) {
        delFn({ data: { id: p.id } }).catch(() => {});
      }
      qc.invalidateQueries({ queryKey: ["lab-pendencias"] });
      toast.success(`OS ${deleteModal.osNumero} excluída.`);
    } else if (deleteModal.type === "ensaio" && deleteModal.ensaio) {
      const en = deleteModal.ensaio;
      if (deleteModal.osId && en.amostraId && en.id) {
        labStore.deleteEnsaio(deleteModal.osId, en.amostraId, en.id);
      }
      if (en.pendenciaId) {
        delFn({ data: { id: en.pendenciaId } }).catch(() => {});
      }
      const next = new Set(deletedEnsaios);
      next.add(`${normOs(deleteModal.osNumero)}:${en.amostra}:${en.ensaio}`);
      next.add(`${normOs(deleteModal.osNumero)}:${en.id}`);
      setDeletedEnsaios(next);
      localStorage.setItem("suporte_infra_deleted_ensaios_v1", JSON.stringify(Array.from(next)));
      qc.invalidateQueries({ queryKey: ["lab-pendencias"] });
      toast.success(`Ensaio ${en.ensaio} excluído.`);
    }
    setDeleteModal(null);
  }

  // Navega para abrir ou digitar ensaio
  function abrirEnsaio(osNum: string, amCode: string, tipo: EnsaioTipo, siglaOuNome?: string) {
    abrirEnsaioNaCentral(
      navigate,
      { cadastro, amostrasProg, ensaiosProg, progs, equipsProg, currentUserName },
      osNum,
      amCode,
      tipo,
      siglaOuNome,
    );
  }

  const kpiStats = useMemo(() => {
    let totalOs = osGroups.length;
    let osConcluidas = 0;
    let osEmAndamento = 0;
    let totalEnsaios = 0;
    let ensaiosAprovados = 0;
    let ensaiosEmDigitacao = 0;
    let ensaiosFilaGantt = 0;

    for (const g of osGroups) {
      const gTotal = g.ensaios.length;
      const gAprov = g.ensaios.filter((e) => e.status === "aprovado" || e.status === "concluido_externo").length;
      if (gTotal > 0 && gAprov === gTotal) {
        osConcluidas++;
      } else {
        osEmAndamento++;
      }
      totalEnsaios += gTotal;
      ensaiosAprovados += gAprov;
      // Laudo em andamento: da digitação até a aprovação. Contava também todo
      // ensaio com pendência — inclusive os já aprovados.
      ensaiosEmDigitacao += g.ensaios.filter(
        (e) =>
          e.status === "pendente" ||
          e.status === "em_digitacao" ||
          e.status === "aguardando_verificacao" ||
          e.status === "aguardando_aprovacao",
      ).length;
      ensaiosFilaGantt += g.ensaios.filter((e) => e.status === "programado" || e.status === "execucao").length;
    }

    return {
      totalOs,
      osConcluidas,
      osEmAndamento,
      totalEnsaios,
      ensaiosAprovados,
      ensaiosEmDigitacao,
      ensaiosFilaGantt,
    };
  }, [osGroups]);

  return (
    <div className="space-y-6">
      {/* Header da aba Por OS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">Ordens de Serviço & Laudos</h2>
          <p className="text-xs text-muted-foreground">
            Todas as amostras, tipos de ensaio e status na esteira, com arquivamento e downloads em lote por OS.
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            refetchPend();
          }}
          title="Atualizar"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Cards de Indicadores Rápidos (Identidade Visual 100% Unificada) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-l-4 border-l-amber-500 bg-card/60 shadow-2xs">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Total de OS
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-foreground">{kpiStats.totalOs}</div>
            <div className="text-[10px] text-muted-foreground">Ordens cadastradas</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-sky-500 bg-card/60 shadow-2xs">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Em Andamento
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-sky-700 dark:text-sky-400">{kpiStats.osEmAndamento}</div>
            <div className="text-[10px] text-muted-foreground">OS ativas na esteira</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 bg-card/60 shadow-2xs">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              100% Concluídas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{kpiStats.osConcluidas}</div>
            <div className="text-[10px] text-muted-foreground">Laudos emitidos</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-indigo-500 bg-card/60 shadow-2xs">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Total de Laudos
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-foreground">{kpiStats.totalEnsaios}</div>
            <div className="text-[10px] text-muted-foreground">Ensaios vinculados</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-violet-500 bg-card/60 shadow-2xs">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Em Digitação
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-violet-700 dark:text-violet-400">{kpiStats.ensaiosEmDigitacao}</div>
            <div className="text-[10px] text-muted-foreground">Cálculos & gráficos</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-600 bg-card/60 shadow-2xs">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Laudos Aprovados
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{kpiStats.ensaiosAprovados}</div>
            <div className="text-[10px] text-muted-foreground">Prontos p/ entrega</div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Busca e Filtros */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20 p-3 rounded-lg border">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por OS, cliente, obra, local ou amostra..."
            className="pl-9 text-xs bg-background"
          />
        </div>

        <div className="flex items-center gap-1 bg-background p-0.5 rounded-md border text-xs">
          <Button
            size="sm"
            variant={statusFilter === "all" ? "secondary" : "ghost"}
            className="h-7 text-xs font-medium"
            onClick={() => setStatusFilter("all")}
          >
            Todas ({osGroups.length})
          </Button>
          <Button
            size="sm"
            variant={statusFilter === "em_andamento" ? "secondary" : "ghost"}
            className="h-7 text-xs font-medium"
            onClick={() => setStatusFilter("em_andamento")}
          >
            Em Andamento ({kpiStats.osEmAndamento})
          </Button>
          <Button
            size="sm"
            variant={statusFilter === "concluidas" ? "secondary" : "ghost"}
            className="h-7 text-xs font-medium"
            onClick={() => setStatusFilter("concluidas")}
          >
            Concluídas ({kpiStats.osConcluidas})
          </Button>
        </div>
      </div>

      {/* Lista Panorâmica de OS em Tela Cheia */}
      <div className="space-y-4">
        {filteredGroups.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma Ordem de Serviço encontrada com os critérios selecionados.
            </CardContent>
          </Card>
        ) : (
          filteredGroups.map((group) => {
            const isExpanded = expandedOs[group.osNumero] ?? true;
            const totalEnsaios = group.ensaios.length;
            const concluidos = group.ensaios.filter((e) => e.status === "aprovado" || e.status === "concluido_externo").length;
            const pct = totalEnsaios > 0 ? Math.round((concluidos / totalEnsaios) * 100) : 0;
            const hasAprovados = concluidos > 0;

            return (
              <Card key={group.osNumero} className="overflow-hidden border-border/80 shadow-xs hover:border-primary/40 transition-colors">
                {/* Header do Card da OS */}
                <div className="p-4 bg-muted/20 border-b flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => setExpandedOs((prev) => ({ ...prev, [group.osNumero]: !isExpanded }))}
                      className="mt-1 p-1 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground"
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-bold text-sm text-foreground bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20">
                          OS {group.osNumero}
                        </span>
                        {group.sup && (
                          <span className="text-[11px] font-mono font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            SUP {group.sup}
                          </span>
                        )}
                        <span className="font-semibold text-sm text-foreground">
                          {group.cliente}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                        {group.obra && (
                          <div className="flex items-center gap-1">
                            <Building className="h-3.5 w-3.5 text-muted-foreground/70" />
                            <span>Obra: <b>{group.obra}</b></span>
                          </div>
                        )}
                        {group.local && (
                          <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                            <MapPin className="h-3.5 w-3.5" />
                            <span>Local: {group.local}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Ações em Lote e Indicadores */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="text-right pr-2">
                      <div className="text-xs font-bold text-foreground">
                        {concluidos} / {totalEnsaios} Laudos Aprovados
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {pct}% Concluído
                      </div>
                    </div>

                    {/* Botões de Download em Lote (Somente o que foi aprovado) */}
                    <div className="flex items-center gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={(!hasAprovados && laudosAprovadosDaOs(group.osNumero).length === 0) || !!progressoPacote}
                                className="h-8 text-xs gap-1.5 border-emerald-600/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 disabled:opacity-50"
                                onClick={() => handleBatchDownload(group, "aprovados_pdf")}
                              >
                                <FileText className="h-3.5 w-3.5 text-emerald-600" />{" "}
                                {progressoPacote ? `Baixando ${progressoPacote.feitos}/${progressoPacote.total}…` : "Aprovados (PDF)"}
                              </Button>
                            </span>
                          </TooltipTrigger>
                          {!hasAprovados && (
                            <TooltipContent>
                              Nenhum laudo concluído ou aprovado nesta OS para exportar.
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={(!hasAprovados && laudosAprovadosDaOs(group.osNumero).length === 0) || !!progressoPacote}
                                className="h-8 text-xs gap-1.5 disabled:opacity-50"
                                onClick={() => handleBatchDownload(group, "pdf_excel")}
                              >
                                <FileArchive className="h-3.5 w-3.5 text-primary" /> PDF + Excel
                              </Button>
                            </span>
                          </TooltipTrigger>
                          {!hasAprovados && (
                            <TooltipContent>
                              Nenhum laudo concluído ou aprovado nesta OS para exportar.
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={!hasAprovados}
                                className="h-8 text-xs gap-1 text-muted-foreground disabled:opacity-50"
                                onClick={() => handleBatchDownload(group, "excel")}
                              >
                                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Excel
                              </Button>
                            </span>
                          </TooltipTrigger>
                          {!hasAprovados && (
                            <TooltipContent>
                              Nenhum laudo concluído ou aprovado nesta OS para exportar.
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>

                      {/* Botão Arquivar OS (Entregue fora da Central) */}
                      {pct < 100 && podeMarcarFora && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-8 text-xs gap-1 text-amber-800 dark:text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30"
                          onClick={() => setArchiveModal(group)}
                          title="Arquivar OS e marcar ensaios como entregues fora da Central (Planilha Excel)"
                        >
                          <Archive className="h-3.5 w-3.5" /> Arquivar OS (Excel)
                        </Button>
                      )}

                      {/* Botão Excluir OS */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs gap-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteModal({ open: true, type: "os", osNumero: group.osNumero, osId: group.osId })}
                        title="Excluir OS da visualização"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Excluir OS
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Tabela de Amostras e Ensaios da OS */}
                {isExpanded && (
                  <div className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40 text-[11px]">
                          <TableHead className="w-44">Amostra / Código</TableHead>
                          <TableHead className="w-40">Furo / Profundidade</TableHead>
                          <TableHead>Ensaio / Metodologia</TableHead>
                          <TableHead className="w-48">Status na Esteira</TableHead>
                          <TableHead className="w-36">Responsável</TableHead>
                          <TableHead className="w-56 text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.ensaios.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                              Nenhum ensaio cadastrado para esta OS.
                            </TableCell>
                          </TableRow>
                        ) : (
                          group.ensaios.map((en, idx) => {
                            const badge = STATUS_BADGE[en.status];
                            const isConcluido = en.status === "aprovado" || en.status === "concluido_externo";

                            return (
                              <TableRow key={`${en.id}-${idx}`} className="hover:bg-muted/20 text-xs">
                                <TableCell className="font-semibold text-foreground">
                                  {en.amostra}
                                  {en.codigo && en.codigo !== en.amostra && (
                                    <div className="text-[10px] text-muted-foreground font-mono">{en.codigo}</div>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {en.furo && <div className="font-medium text-foreground">{en.furo}</div>}
                                  {en.prof && (
                                    <div className="text-[10px] text-muted-foreground font-mono">
                                      Prof: {en.prof}
                                    </div>
                                  )}
                                  {!en.furo && !en.prof && <span className="text-muted-foreground">—</span>}
                                </TableCell>
                                <TableCell>
                                  <div className="font-semibold text-primary">{en.ensaio}</div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={`${badge.color} text-[10px]`}>
                                    {badge.label}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {en.aprovador || en.verificador || en.digitador || en.tecnico || currentUserName}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    {/* Botões diretos para ensaios aprovados/concluídos */}
                                    {isConcluido && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 px-2 text-[11px] gap-1 text-emerald-700 border-emerald-600/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                          onClick={() => downloadSinglePdf(group, en)}
                                          title="Baixar laudo individual em PDF"
                                        >
                                          <FileText className="h-3 w-3 text-emerald-600" /> PDF
                                        </Button>

                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 px-2 text-[11px] gap-1 text-slate-700 border-slate-300 hover:bg-muted"
                                          onClick={() => downloadSingleExcel(group, en)}
                                          title="Baixar laudo individual em Excel (.xlsx)"
                                        >
                                          <FileSpreadsheet className="h-3 w-3 text-emerald-600" /> Excel
                                        </Button>
                                      </>
                                    )}

                                    <Button
                                      size="sm"
                                      variant={isConcluido ? "ghost" : "outline"}
                                      className="h-7 text-xs gap-1 hover:border-primary hover:text-primary"
                                      onClick={() => abrirEnsaio(group.osNumero, en.amostra, en.tipo, en.ensaio)}
                                      title={isConcluido ? "Visualizar detalhes do ensaio" : "Digitar e calcular ensaio"}
                                    >
                                      {isConcluido ? (
                                        <>
                                          <Eye className="h-3 w-3" /> Ver
                                        </>
                                      ) : (
                                        <>
                                          <Play className="h-3 w-3 fill-current" /> Digitar
                                        </>
                                      )}
                                    </Button>

                                    {/* Botão Excluir Linha (Ensaio) */}
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                      onClick={() =>
                                        setDeleteModal({
                                          open: true,
                                          type: "ensaio",
                                          osNumero: group.osNumero,
                                          osId: group.osId,
                                          ensaio: en,
                                        })
                                      }
                                      title="Excluir este ensaio"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      {/* Modal de Arquivar OS (Entregue fora da Central) */}
      <Dialog open={Boolean(archiveModal)} onOpenChange={(o) => !o && setArchiveModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-400">
              <Archive className="h-5 w-5 text-amber-600" /> Arquivar OS — Entregue fora da Central
            </DialogTitle>
            <DialogDescription className="text-xs">
              Marque todos os ensaios pendentes da <b>OS {archiveModal?.osNumero}</b> como concluídos externamente nas planilhas de Excel legadas.
            </DialogDescription>
          </DialogHeader>

          {archiveModal && (
            <div className="space-y-3 py-2 text-xs">
              <div className="p-3 bg-muted/40 rounded-lg space-y-1 border">
                <div><span className="font-semibold">OS:</span> {archiveModal.osNumero}</div>
                <div><span className="font-semibold">Cliente:</span> {archiveModal.cliente}</div>
                <div><span className="font-semibold">Obra:</span> {archiveModal.obra || "—"}</div>
                <div><span className="font-semibold">Ensaios que serão concluídos:</span> {archiveModal.ensaios.length}</div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Justificativa / Observação do Arquivamento</Label>
                <Input
                  className="h-8 text-xs"
                  value={archiveObs}
                  onChange={(e) => setArchiveObs(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setArchiveModal(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={archiving}
              className="bg-amber-700 hover:bg-amber-800 text-white gap-1.5"
              onClick={handleArchiveOs}
            >
              {archiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirmar Arquivamento da OS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Exclusão (OS ou Ensaio) */}
      <Dialog open={Boolean(deleteModal?.open)} onOpenChange={(o) => !o && setDeleteModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-destructive">
              <Trash2 className="h-5 w-5 text-destructive" />
              {deleteModal?.type === "os"
                ? `Excluir OS ${deleteModal.osNumero}`
                : `Excluir Ensaio da OS ${deleteModal?.osNumero}`}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {deleteModal?.type === "os"
                ? `Tem certeza que deseja excluir a OS ${deleteModal.osNumero} e todos os seus ensaios da Central? Esta ação oculta a OS e remove os ensaios digitados.`
                : `Tem certeza que deseja excluir o ensaio "${deleteModal?.ensaio?.ensaio}" (Amostra: ${deleteModal?.ensaio?.amostra}) da OS ${deleteModal?.osNumero}?`}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => setDeleteModal(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteConfirm}>
              Confirmar Exclusão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}