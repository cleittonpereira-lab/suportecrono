import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate, Link } from "@tanstack/react-router";
import {
  FlaskConical,
  Beaker,
  Layers,
  Search,
  Plus,
  Play,
  CheckCircle2,
  Clock,
  ShieldCheck,
  FileSpreadsheet,
  Calendar,
  User,
  ArrowRight,
  Activity,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLabState, labStore } from "@/features/lab/store";
import { ENSAIO_LABEL, type EnsaioTipo } from "@/features/lab/types";
import {
  listPendenciasDigitacao,
  concluirPendenciaExterna,
  criarRelatorioAvulso,
  type PendenciaDigitacao,
} from "@/lib/lab-pendencias.functions";
import { listRows } from "@/lib/programacao.functions";
import { useCadastroByOs } from "@/hooks/use-cadastro-by-os";
import { evaluateSla, formatHours } from "@/lib/sla-calc";
import { detectMethodology } from "@/features/mesp-natural/calc";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

function extractSampleDetails(a: any) {
  if (!a) return { furo: "", prof: "" };
  let furo = a.furo || "";
  if (!furo && a.identificacao && a.identificacao !== a.codigo_amostra) {
    furo = a.identificacao;
  }
  if (!furo && a.descricao) {
    const descParts = String(a.descricao).split(" — ");
    if (descParts[0] && descParts[0] !== a.codigo_amostra) {
      furo = descParts[0].trim();
    }
  }

  let prof = "";
  if (a.topo_m && a.base_m) {
    prof = `${a.topo_m} – ${a.base_m} m`;
  } else if (a.profundidade) {
    prof = String(a.profundidade).includes("m") ? String(a.profundidade) : `${a.profundidade} m`;
  } else if (a.topo_m) {
    prof = `${a.topo_m} m`;
  } else if (a.depth) {
    prof = String(a.depth).includes("m") ? String(a.depth) : `${a.depth} m`;
  }

  if (!prof && a.descricao) {
    const m = String(a.descricao).match(/(\d+[.,]?\d*)\s*[-–aà]\s*(\d+[.,]?\d*)\s*m?/i);
    if (m) prof = `${m[1]} – ${m[2]} m`;
  }

  return { furo, prof };
}

export function EnsaioListByType({ tipo }: { tipo: EnsaioTipo }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const labState = useLabState();
  const [busca, setBusca] = useState("");
  const [activeTab, setActiveTab] = useState<string>("gantt");

  // Modais
  const [avulsoOpen, setAvulsoOpen] = useState(false);
  const [avulsoData, setAvulsoData] = useState({
    os: "",
    cliente: "",
    obra: "",
    amostra: "",
    operador_nome: "",
    observacoes: "",
  });

  const [externoModal, setExternoModal] = useState<any | null>(null);
  const [externoObs, setExternoObs] = useState("");

  // Server functions
  const listPendenciasFn = useServerFn(listPendenciasDigitacao);
  const rows0Fn = useServerFn(listRows);
  const criarAvulsoFn = useServerFn(criarRelatorioAvulso);
  const conclExtFn = useServerFn(concluirPendenciaExterna);

  const cadastro = useCadastroByOs();

  // Queries
  const { data: pendencias = [], refetch: refetchPend } = useQuery({
    queryKey: ["lab-pendencias"],
    queryFn: () => listPendenciasFn(),
    refetchInterval: 30_000,
  });

  const { data: progs = [] } = useQuery({
    queryKey: ["prox-ensaios-progs"],
    queryFn: async () => rows0Fn({ data: { sheet: "Programações" } }),
    staleTime: 60_000,
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

  // Filtra itens do Gantt específicos deste tipo de ensaio
  const ganttItems = useMemo(() => {
    const amMap = new Map(amostrasProg.map((a) => [a.id, a]));
    const enMap = new Map(ensaiosProg.map((e) => [e.id, e]));
    const tpMap = new Map(tiposProg.map((t) => [t.id, t]));
    const eqMap = new Map(equipsProg.map((e) => [e.id, e]));

    return progs
      .map((p) => {
        const e = enMap.get(p.ensaio_id ?? "");
        const a = e ? amMap.get(e.amostra_id ?? "") : undefined;
        const t = e ? tpMap.get(e.tipo_ensaio_id ?? "") : undefined;
        const eq = p.equipamento_id ? eqMap.get(p.equipamento_id) : undefined;
        const nomeEnsaio = t?.nome ?? e?.status ?? "";
        const m = detectMethodology(nomeEnsaio, t?.nome);
        // Mapeamento explícito cadastrado em "Tipos de Ensaio" (Programação ·
        // Cadastro) — quando configurado, é autoritativo e substitui o
        // adivinhamento por texto abaixo. Sem isso, ensaios com sigla fora do
        // padrão (ex.: "TRI4.UU") podiam cair no ensaio errado por engano.
        const tipoRelatorio = (t?.tipo_relatorio as string | undefined) || undefined;

        // Verifica se corresponde ao tipo atual
        const match = tipoRelatorio
          ? tipoRelatorio === tipo
          : (tipo === "cisalhamento-direto" && (m === "cisalhamento-direto" || nomeEnsaio.toLowerCase().includes("cisalh"))) ||
            (tipo === "adensamento" && (m === "adensamento" || nomeEnsaio.toLowerCase().includes("adens"))) ||
            ((tipo === "triaxial-cid" || tipo === "triaxial-cid-sat" || tipo === "triaxial-cid-nat") &&
              (m === "triaxial-cid" || nomeEnsaio.toLowerCase().includes("tri"))) ||
            (tipo === "triaxial-uu" && /\buu\b|\btri\.?\s*uu\b/i.test(nomeEnsaio)) ||
            (tipo === "triaxial-ciu" && /\bciu\b|\btri\.?\s*ciu\b/i.test(nomeEnsaio)) ||
            (tipo === "mesp-a" && (m === "mesp-a" || nomeEnsaio.toLowerCase().includes("mesp"))) ||
            (tipo === "asf-dap" && (m === "asf-dap" || nomeEnsaio.toLowerCase().includes("densidade aparente"))) ||
            (tipo === "perm-v" && nomeEnsaio.toLowerCase().includes("permeabilidade")) ||
            (tipo === "compressao-simples" && nomeEnsaio.toLowerCase().includes("compress"));

        if (!match) return null;

        const st = (p.status || "").toLowerCase();
        const concluiu = !!p.data_fim_real || st === "concluido";
        const iniciou = !!p.data_inicio_real || st === "em_execucao";

        let stage: "concluido" | "execucao" | "planejado" = "planejado";
        if (concluiu) stage = "concluido";
        else if (iniciou) stage = "execucao";

        const details = extractSampleDetails(a);

        return {
          id: p.id,
          os: a?.os_numero ?? "—",
          amostra: a?.codigo_amostra ?? a?.identificacao ?? "—",
          furo: details.furo || a?.identificacao || "",
          prof: details.prof,
          ensaio: nomeEnsaio || ENSAIO_LABEL[tipo],
          equipamento: eq?.nome ?? "—",
          fim_real: p.data_fim_real || null,
          inicio_real: p.data_inicio_real || null,
          tecnico: p.tecnico || null,
          stage,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [progs, amostrasProg, ensaiosProg, tiposProg, equipsProg, tipo]);

  // Filtra pendências de digitação deste tipo
  const laudosItems = useMemo(() => {
    return pendencias.filter((r) => {
      const m = detectMethodology(r.ensaio, r.tipo_ensaio);
      if (tipo === "cisalhamento-direto") return m === "cisalhamento-direto" || r.tipo_ensaio === "cisalhamento-direto";
      if (tipo === "adensamento") return m === "adensamento" || r.tipo_ensaio === "adensamento";
      if (tipo === "triaxial-cid" || tipo === "triaxial-cid-sat" || tipo === "triaxial-cid-nat")
        return m === "triaxial-cid" || r.tipo_ensaio?.includes("triaxial");
      if (tipo === "triaxial-uu") return /\buu\b|\btri\.?\s*uu\b/i.test(r.ensaio ?? "") || r.tipo_ensaio === "triaxial-uu";
      if (tipo === "triaxial-ciu") return /\bciu\b|\btri\.?\s*ciu\b/i.test(r.ensaio ?? "") || r.tipo_ensaio === "triaxial-ciu";
      if (tipo === "mesp-a") return m === "mesp-a" || r.tipo_ensaio === "mesp-a";
      if (tipo === "asf-dap") return m === "asf-dap" || r.tipo_ensaio === "asf-dap";
      if (tipo === "perm-v") return r.tipo_ensaio === "perm-v" || /permeabilidade/i.test(r.ensaio ?? "");
      if (tipo === "compressao-simples") return r.tipo_ensaio === "compressao-simples" || /compress/i.test(r.ensaio ?? "");
      return false;
    });
  }, [pendencias, tipo]);

  // Contadores específicos deste tipo
  const counts = useMemo(() => {
    const prontosBancada = ganttItems.filter((g) => g.stage === "concluido").length;
    const emBancada = ganttItems.filter((g) => g.stage === "execucao").length;
    const emDigitacao = laudosItems.filter((l) => l.status === "em_digitacao" || l.status === "pendente").length;
    const emVerificacao = laudosItems.filter((l) => l.status === "digitado").length;
    const aprovados = laudosItems.filter((l) => l.status === "aprovado" || l.status === "concluido_externo").length;
    return { prontosBancada, emBancada, emDigitacao, emVerificacao, aprovados };
  }, [ganttItems, laudosItems]);

  // Filtro de busca
  const filteredGantt = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return ganttItems;
    return ganttItems.filter(
      (g) =>
        g.os.toLowerCase().includes(q) ||
        g.amostra.toLowerCase().includes(q) ||
        g.ensaio.toLowerCase().includes(q) ||
        g.equipamento.toLowerCase().includes(q) ||
        (g.tecnico ?? "").toLowerCase().includes(q),
    );
  }, [ganttItems, busca]);

  const filteredLaudos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return laudosItems;
    return laudosItems.filter(
      (l) =>
        l.os.toLowerCase().includes(q) ||
        (l.amostra ?? "").toLowerCase().includes(q) ||
        (l.digitador_nome ?? "").toLowerCase().includes(q) ||
        (l.operador_nome ?? "").toLowerCase().includes(q),
    );
  }, [laudosItems, busca]);

  // Abre editor com dados limpos e vinculados
  function abrirEnsaio(osNum: string, amCode: string, pendenciaId?: string, siglaOficial?: string) {
    if (tipo === "mesp-a") {
      navigate({ to: "/relatorio/mesp-a", search: { pendencia: pendenciaId } });
      return;
    }

    const state = labStore.get();
    let os = state.os.find((o) => (o.numero ?? "").trim() === osNum.trim());
    const cad = cadastro.lookup(osNum);
    if (!os) {
      os = labStore.createOS({
        numero: osNum,
        client: cad?.tomador || "",
        workNumber: cad?.obra || "",
        local: cad?.local || "",
      });
    } else if (!os.local && cad?.local) {
      os.local = cad.local;
    }

    const cleanAm = amCode.trim() || "AM-01";
    let am = os.amostras.find((a) => (a.reportNumber ?? a.code ?? "").trim() === cleanAm);
    if (!am) {
      am = labStore.addAmostra(os.id, { reportNumber: cleanAm, code: cleanAm });
    }
    if (!am) return;

    const sigla = siglaOficial || ENSAIO_LABEL[tipo];
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
      en = labStore.addEnsaio(os.id, am.id, tipo, sigla);
    }

    if (!en) return;

    navigate({
      to: "/relatorio/os/$osId/amostra/$amostraId/ensaio/$ensaioId",
      params: { osId: os.id, amostraId: am.id, ensaioId: en.id },
    });
  }

  return (
    <div className="space-y-6 w-full px-4 sm:px-6 md:px-8 py-6 pb-20">
      {/* Header Específico do Ensaio */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-1.5 font-semibold">
            <FlaskConical className="h-3.5 w-3.5 text-primary" /> Central de Processamento
          </div>
          <h1 className="mt-1 font-display text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            {ENSAIO_LABEL[tipo]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gestão dedicada: fila da bancada, digitação sem dados herdados, conferência e emissão dos laudos de {ENSAIO_LABEL[tipo]}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setAvulsoOpen(true)}
            className="gap-1.5 shadow-sm bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Iniciar Ensaio Avulso
          </Button>
          <Button
            variant="outline"
            asChild
            className="gap-1.5"
          >
            <Link to="/relatorio/pendentes" search={{ tab: undefined }}>
              <Layers className="h-4 w-4 text-muted-foreground" /> Central Geral
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              refetchPend();
              qc.invalidateQueries({ queryKey: ["prox-ensaios-progs"] });
            }}
          >
            <Activity className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Cards de Métricas Específicas do Ensaio */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Card className="border-amber-500/20 bg-amber-50/30 dark:bg-amber-950/10">
          <CardContent className="p-3">
            <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
              Prontos na Bancada
            </div>
            <div className="text-2xl font-bold text-amber-900 dark:text-amber-200 mt-1">
              {counts.prontosBancada}
            </div>
            <div className="text-[10px] text-muted-foreground">Aguardando laudo</div>
          </CardContent>
        </Card>

        <Card className="border-sky-500/20 bg-sky-50/30 dark:bg-sky-950/10">
          <CardContent className="p-3">
            <div className="text-[10px] font-semibold text-sky-700 dark:text-sky-400 uppercase tracking-wider">
              Em Bancada
            </div>
            <div className="text-2xl font-bold text-sky-900 dark:text-sky-200 mt-1">
              {counts.emBancada}
            </div>
            <div className="text-[10px] text-muted-foreground">Executando no lab</div>
          </CardContent>
        </Card>

        <Card className="border-blue-500/20 bg-blue-50/30 dark:bg-blue-950/10">
          <CardContent className="p-3">
            <div className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
              Em Digitação
            </div>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-200 mt-1">
              {counts.emDigitacao}
            </div>
            <div className="text-[10px] text-muted-foreground">Cálculos & curvas</div>
          </CardContent>
        </Card>

        <Card className="border-violet-500/20 bg-violet-50/30 dark:bg-violet-950/10">
          <CardContent className="p-3">
            <div className="text-[10px] font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wider">
              Verificação
            </div>
            <div className="text-2xl font-bold text-violet-900 dark:text-violet-200 mt-1">
              {counts.emVerificacao}
            </div>
            <div className="text-[10px] text-muted-foreground">Conferência técnica</div>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-emerald-50/30 dark:bg-emerald-950/10">
          <CardContent className="p-3">
            <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
              Aprovados / Concluídos
            </div>
            <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-200 mt-1">
              {counts.aprovados}
            </div>
            <div className="text-[10px] text-muted-foreground">Emitidos oficialmente</div>
          </CardContent>
        </Card>
      </div>

      {/* Busca */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={`Buscar ensaios de ${ENSAIO_LABEL[tipo]} por OS, amostra ou técnico...`}
          className="pl-9 text-xs"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/40 p-1 border">
          <TabsTrigger value="gantt" className="text-xs gap-1.5">
            <FlaskConical className="h-3.5 w-3.5 text-amber-600" />
            Fila do Gantt & Bancada ({counts.prontosBancada + counts.emBancada})
          </TabsTrigger>
          <TabsTrigger value="laudos" className="text-xs gap-1.5">
            <Activity className="h-3.5 w-3.5 text-sky-600" />
            Laudos em Processamento ({laudosItems.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Fila do Gantt */}
        <TabsContent value="gantt" className="space-y-3">
          <div className="rounded-lg border bg-card overflow-hidden shadow-xs">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-28">OS / Obra</TableHead>
                  <TableHead className="w-36">Amostra / Furo</TableHead>
                  <TableHead>Equipamento</TableHead>
                  <TableHead className="w-36">Técnico Bancada</TableHead>
                  <TableHead className="w-32">Status Bancada</TableHead>
                  <TableHead className="w-32 text-center">Conclusão / Início</TableHead>
                  <TableHead className="w-52 text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredGantt.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                      Nenhum ensaio de {ENSAIO_LABEL[tipo]} na fila da bancada no momento.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredGantt.map((item) => {
                    const cad = cadastro.lookup(item.os);
                    const tomadorObra = [cad?.tomador, cad?.obra].filter(Boolean).join(" · ");

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
                        <TableCell className="text-xs text-foreground">{item.equipamento}</TableCell>
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
                        <TableCell className="text-center text-xs">
                          {item.fim_real ? (
                            <div className="font-medium text-foreground">
                              {format(new Date(item.fim_real), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                            </div>
                          ) : item.inicio_real ? (
                            <div className="text-muted-foreground">
                              Início: {format(new Date(item.inicio_real), "dd/MM/yyyy", { locale: ptBR })}
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            className="h-8 text-xs gap-1 shadow-xs bg-primary text-primary-foreground hover:bg-primary/90"
                            onClick={() => abrirEnsaio(item.os, item.amostra)}
                          >
                            <Play className="h-3.5 w-3.5 fill-current" /> Iniciar Relatório
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Tab 2: Laudos em Processamento */}
        <TabsContent value="laudos" className="space-y-3">
          <div className="rounded-lg border bg-card overflow-hidden shadow-xs">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-28">OS</TableHead>
                  <TableHead className="w-36">Amostra</TableHead>
                  <TableHead>Status Laudo</TableHead>
                  <TableHead className="w-32">Digitador</TableHead>
                  <TableHead className="w-32">Verificador</TableHead>
                  <TableHead className="w-32">Aprovador</TableHead>
                  <TableHead className="w-28 text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLaudos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                      Nenhum laudo em processamento ativo para este ensaio.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLaudos.map((r) => (
                    <TableRow key={r.id} className="hover:bg-muted/30">
                      <TableCell className="font-bold text-xs">{r.os}</TableCell>
                      <TableCell className="text-xs">{r.amostra || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.digitador_nome || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.verificador_nome || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.aprovador_nome || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => abrirEnsaio(r.os, r.amostra ?? "", r.id, r.ensaio)}
                        >
                          Abrir Laudo
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal Avulso */}
      <Dialog open={avulsoOpen} onOpenChange={setAvulsoOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Plus className="h-5 w-5 text-primary" /> Novo Ensaio de {ENSAIO_LABEL[tipo]}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Inicie a digitação de uma nova amostra de {ENSAIO_LABEL[tipo]} com os campos totalmente limpos e prontos para preenchimento.
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
                <Label className="text-xs">Identificação da Amostra *</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="Ex: AM-01 (Furo SP-01)"
                  value={avulsoData.amostra}
                  onChange={(e) => setAvulsoData((s) => ({ ...s, amostra: e.target.value }))}
                />
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

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAvulsoOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!avulsoData.os}
              onClick={() => {
                setAvulsoOpen(false);
                abrirEnsaio(avulsoData.os, avulsoData.amostra);
              }}
              className="gap-1.5"
            >
              <Play className="h-4 w-4 fill-current" />
              Iniciar Digitação Limpa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}