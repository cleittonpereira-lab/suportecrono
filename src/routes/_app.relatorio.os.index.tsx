import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Layers,
  MapPin,
  Building,
  User,
  ExternalLink,
  Plus,
  RefreshCw,
  Sparkles,
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
import { labStore, useLabState } from "@/features/lab/store";
import { ENSAIO_LABEL, type EnsaioTipo } from "@/features/lab/types";
import {
  listPendenciasDigitacao,
  concluirPendenciaExterna,
  removerPendenciaDigitacao,
  type PendenciaDigitacao,
} from "@/lib/lab-pendencias.functions";
import { listRows } from "@/lib/programacao.functions";
import { useCadastroByOs } from "@/hooks/use-cadastro-by-os";
import { useAuth } from "@/hooks/use-auth";
import { detectMethodology } from "@/features/mesp-natural/calc";
import {
  formatReportFilename,
  generateOfficialPdfBlob,
  generateOfficialExcelBuffer,
  getEnsaioSigla,
  type ReportItemMeta,
} from "@/lib/report-export-generators";
import { normOs } from "@/lib/schedule-utils";
import { toast } from "sonner";
import JSZip from "jszip";

export const Route = createFileRoute("/_app/relatorio/os/")({
  component: CentralOsPage,
  head: () => ({
    meta: [
      { title: "Central da OS & Entregas de Laudos — Suporte INFRA" },
      { name: "description", content: "Visão panorâmica por OS com amostras, ensaios, status da esteira e downloads em lote." },
    ],
  }),
});

interface EnsaioItemOS {
  id: string;
  pendenciaId?: string;
  amostraId?: string;
  amostra: string;
  furo?: string;
  prof?: string;
  codigo?: string;
  ensaio: string;
  tipo: EnsaioTipo;
  status: "programado" | "execucao" | "em_digitacao" | "verificacao" | "aprovado" | "concluido_externo";
  tecnico?: string;
  digitador?: string;
  verificador?: string;
  aprovador?: string;
  revisao?: string;
}

interface OsGroup {
  osNumero: string;
  osId?: string;
  cliente: string;
  obra: string;
  local: string;
  sup?: string;
  ensaios: EnsaioItemOS[];
}

const STATUS_BADGE: Record<EnsaioItemOS["status"], { label: string; color: string }> = {
  programado: { label: "Programado (Gantt)", color: "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30" },
  execucao: { label: "Em Bancada", color: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30" },
  em_digitacao: { label: "Em Digitação", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  verificacao: { label: "Aguardando Verificação", color: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30" },
  aprovado: { label: "✓ Laudo Aprovado", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  concluido_externo: { label: "✓ Concluído Externo (Excel)", color: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/30" },
};

function extractSampleDetails(a: any) {
  if (!a) return { furo: "", prof: "", codigo: "" };

  // Furo / Identificação de Campo (nome da amostra em campo)
  let furo = a.furo || "";
  if (!furo && a.identificacao) {
    furo = String(a.identificacao).trim();
  }
  if (!furo && a.descricao) {
    const descParts = String(a.descricao).split(" — ");
    if (descParts[0]) {
      furo = descParts[0].trim();
    }
  }

  // Profundidade
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

  // Fallback se estiver no texto descritivo
  if (!prof && a.descricao) {
    const m = String(a.descricao).match(/(\d+[.,]?\d*)\s*[-–aà]\s*(\d+[.,]?\d*)\s*m?/i);
    if (m) {
      prof = `${m[1]} – ${m[2]} m`;
    }
  }

  const codigo = a.codigo_amostra || a.code || a.reportNumber || a.identificacao || "";
  return { furo, prof, codigo };
}

function CentralOsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const labState = useLabState();
  const cadastro = useCadastroByOs();
  const { displayName, user, profile } = useAuth();
  const currentUserName = displayName || profile?.nome || user?.email?.split("@")[0] || "Maurício Malanconi";

  const [busca, setBusca] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "em_andamento" | "concluidas">("all");
  const [expandedOs, setExpandedOs] = useState<Record<string, boolean>>({});

  // Lista de OSs e Ensaios excluídos persistidos localmente
  const [deletedOs, setDeletedOs] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("suporte_infra_deleted_os_v1");
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [deletedEnsaios, setDeletedEnsaios] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("suporte_infra_deleted_ensaios_v1");
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

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

  // Modal de Log de Download
  const [downloadLog, setDownloadLog] = useState<{
    open: boolean;
    osNumero: string;
    tipo: string;
    total: number;
    itens: Array<{ amostra: string; ensaio: string; formato: string; nomeArquivo: string }>;
  } | null>(null);

  // Queries
  const listPendenciasFn = useServerFn(listPendenciasDigitacao);
  const rows0Fn = useServerFn(listRows);
  const conclExtFn = useServerFn(concluirPendenciaExterna);
  const delFn = useServerFn(removerPendenciaDigitacao);

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

  // Agrupamento consolidado por OS com deduplicação rigorosa por Amostra + Tipo de Ensaio
  const osGroups = useMemo<OsGroup[]>(() => {
    const amMap = new Map<string, any>();
    const amByCode = new Map<string, any>();

    for (const a of amostrasProg) {
      if (a.id) amMap.set(String(a.id), a);
      if (a.codigo_amostra) amByCode.set(String(a.codigo_amostra).trim(), a);
      if (a.identificacao) amByCode.set(String(a.identificacao).trim(), a);
      if (a.numero_amostra) amByCode.set(String(a.numero_amostra).trim(), a);
      if (a.os_numero) {
        const nos = normOs(a.os_numero);
        if (a.codigo_amostra) amByCode.set(`${nos}:${String(a.codigo_amostra).trim()}`, a);
        if (a.identificacao) amByCode.set(`${nos}:${String(a.identificacao).trim()}`, a);
        if (a.numero_amostra) amByCode.set(`${nos}:${String(a.numero_amostra).trim()}`, a);
        if (a.id) amByCode.set(`${nos}:${String(a.id).trim()}`, a);
      }
    }

    const enMap = new Map(ensaiosProg.map((e) => [e.id, e]));
    const tpMap = new Map(tiposProg.map((t) => [t.id, t]));

    const groups = new Map<string, { group: OsGroup; itemsMap: Map<string, EnsaioItemOS> }>();

    const getOrCreateGroupData = (osNum: string) => {
      const cleanNum = (osNum || "").trim();
      if (!cleanNum || deletedOs.has(normOs(cleanNum))) return null;
      if (!groups.has(cleanNum)) {
        const cad = cadastro.lookup(cleanNum);
        groups.set(cleanNum, {
          group: {
            osNumero: cleanNum,
            cliente: cad?.tomador || `OS ${cleanNum}`,
            obra: cad?.obra || "",
            local: cad?.local || "",
            sup: cad?.sup || "",
            ensaios: [],
          },
          itemsMap: new Map<string, EnsaioItemOS>(),
        });
      }
      return groups.get(cleanNum)!;
    };

    // Helper para chave canônica única por amostra + metodologia
    const getTestKey = (amostraCodeOrId: string, tipoOrSigla: string) => {
      const amKey = (amostraCodeOrId || "AM-01").trim().toLowerCase();
      const m = detectMethodology(tipoOrSigla, tipoOrSigla) || "cisalhamento-direto";
      return `${amKey}::${m}`;
    };

    // 1. Inclui ensaios do labStore
    for (const os of labState.os) {
      if (deletedOs.has(normOs(os.numero))) continue;
      const gData = getOrCreateGroupData(os.numero);
      if (!gData) continue;
      const { group: g, itemsMap } = gData;
      g.osId = os.id;
      if (os.client && (!g.cliente || g.cliente.startsWith("OS "))) g.cliente = os.client;
      if (!g.obra && os.workNumber) g.obra = os.workNumber;
      if (!g.local && os.local) g.local = os.local;

      for (const am of os.amostras) {
        const amProg =
          amMap.get(am.id) ||
          (am.code ? amByCode.get(`${normOs(os.numero)}:${am.code}`) || amByCode.get(am.code) : undefined) ||
          (am.reportNumber ? amByCode.get(`${normOs(os.numero)}:${am.reportNumber}`) || amByCode.get(am.reportNumber) : undefined);
        const details = extractSampleDetails(amProg);

        for (const en of am.ensaios) {
          const rawSigla = (en as any).sigla || (en as any).ensaioNome || en.nome || (en as any).label || (en as any).codigo;
          const siglaEnsaio = rawSigla && rawSigla !== en.tipo && rawSigla !== ENSAIO_LABEL[en.tipo]
            ? rawSigla
            : ENSAIO_LABEL[en.tipo] || en.tipo;

          const enKey = `${normOs(os.numero)}:${am.reportNumber || am.code}:${siglaEnsaio}`;
          const enIdKey = `${normOs(os.numero)}:${en.id}`;
          if (deletedEnsaios.has(enKey) || deletedEnsaios.has(enIdKey)) continue;

          const sampleIdent = am.code || details.codigo || am.reportNumber || "AM-01";
          const testKey = getTestKey(sampleIdent, en.tipo);

          const item: EnsaioItemOS = {
            id: en.id,
            amostraId: am.id,
            amostra: sampleIdent,
            furo: am.borehole || details.furo || "",
            prof: am.depth || details.prof || "",
            codigo: am.code || details.codigo || "",
            ensaio: siglaEnsaio,
            tipo: en.tipo,
            status: en.status === "concluido" ? "aprovado" : "em_digitacao",
            digitador: en.operator || currentUserName,
            revisao: os.revision || "0",
          };

          itemsMap.set(testKey, item);
        }
      }
    }

    // 2. Inclui ensaios das pendências de digitação
    for (const p of pendencias) {
      if (deletedOs.has(normOs(p.os))) continue;
      const gData = getOrCreateGroupData(p.os);
      if (!gData) continue;
      const { group: g, itemsMap } = gData;

      const m = detectMethodology(p.ensaio, p.tipo_ensaio) || "cisalhamento-direto";
      const tipo = m as EnsaioTipo;
      const amName = p.amostra || "AM-01";
      const enKey = `${normOs(p.os)}:${amName}:${p.ensaio}`;
      const enIdKey = `${normOs(p.os)}:${p.id}`;
      if (deletedEnsaios.has(enKey) || deletedEnsaios.has(enIdKey)) continue;

      const amProg =
        amByCode.get(`${normOs(p.os)}:${p.amostra}`) ||
        amByCode.get(p.amostra || "") ||
        amMap.get(p.amostra || "");
      const details = extractSampleDetails(amProg);

      let st: EnsaioItemOS["status"] = "em_digitacao";
      if (p.status === "digitado") st = "verificacao";
      if (p.status === "aprovado") st = "aprovado";
      if (p.status === "concluido_externo") st = "concluido_externo";

      const sampleIdent = details.codigo || p.amostra || "AM-01";
      const testKey = getTestKey(sampleIdent, tipo);
      const existing = itemsMap.get(testKey);

      if (existing) {
        // Atualiza campos com dados enriquecidos da pendência
        existing.pendenciaId = p.id;
        if (!existing.furo && details.furo) existing.furo = details.furo;
        if (!existing.prof && details.prof) existing.prof = details.prof;
        if (!existing.codigo && details.codigo) existing.codigo = details.codigo;
        // Prioriza a sigla oficial da pendência (ex: "CD4.IN") se existente tiver nome genérico
        if (p.ensaio && (!existing.ensaio || existing.ensaio === existing.tipo || existing.ensaio.includes("cisalhamento-direto"))) {
          existing.ensaio = p.ensaio;
        }
        if (st === "aprovado" || st === "concluido_externo" || (st === "verificacao" && existing.status !== "aprovado")) {
          existing.status = st;
        }
        if (p.operador_nome) existing.tecnico = p.operador_nome;
        if (p.digitador_nome) existing.digitador = p.digitador_nome;
        if (p.verificador_nome) existing.verificador = p.verificador_nome;
        if (p.aprovador_nome) existing.aprovador = p.aprovador_nome;
      } else {
        itemsMap.set(testKey, {
          id: p.id,
          pendenciaId: p.id,
          amostra: sampleIdent,
          furo: details.furo,
          prof: details.prof,
          codigo: details.codigo,
          ensaio: p.ensaio,
          tipo,
          status: st,
          tecnico: p.operador_nome || undefined,
          digitador: p.digitador_nome || undefined,
          verificador: p.verificador_nome || undefined,
          aprovador: p.aprovador_nome || undefined,
          revisao: "0",
        });
      }
    }

    // 3. Inclui ensaios do Gantt de execução
    for (const prog of progs) {
      const e = enMap.get(prog.ensaio_id ?? "");
      const a = e ? amMap.get(e.amostra_id ?? "") : undefined;
      const t = e ? tpMap.get(e.tipo_ensaio_id ?? "") : undefined;
      const osNum = a?.os_numero;
      if (!osNum || deletedOs.has(normOs(osNum))) continue;

      const gData = getOrCreateGroupData(osNum);
      if (!gData) continue;
      const { group: g, itemsMap } = gData;

      const details = extractSampleDetails(a);
      const sampleIdent = details.codigo || a?.codigo_amostra || a?.identificacao || "—";
      const siglaEnsaio = t?.sigla || t?.codigo || e?.sigla || e?.codigo || t?.nome || "Ensaio";
      const m = detectMethodology(siglaEnsaio, t?.nome) || "cisalhamento-direto";
      const tipo = m as EnsaioTipo;

      const enKey = `${normOs(osNum)}:${sampleIdent}:${siglaEnsaio}`;
      const enIdKey = `${normOs(osNum)}:${prog.id}`;
      if (deletedEnsaios.has(enKey) || deletedEnsaios.has(enIdKey)) continue;

      const testKey = getTestKey(sampleIdent, tipo);
      const existing = itemsMap.get(testKey);

      if (existing) {
        // Melhora furo, prof e sigla com os dados diretos da programação do Gantt
        if (!existing.furo && details.furo) existing.furo = details.furo;
        if (!existing.prof && details.prof) existing.prof = details.prof;
        if (!existing.codigo && details.codigo) existing.codigo = details.codigo;
        if (siglaEnsaio && (!existing.ensaio || existing.ensaio === existing.tipo || existing.ensaio.includes("cisalhamento-direto"))) {
          existing.ensaio = siglaEnsaio;
        }
        if (!existing.tecnico && prog.tecnico) existing.tecnico = prog.tecnico;
      } else {
        const concluiu = !!prog.data_fim_real || prog.status === "concluido";
        const iniciou = !!prog.data_inicio_real || prog.status === "em_execucao";
        const st: EnsaioItemOS["status"] = concluiu ? "em_digitacao" : iniciou ? "execucao" : "programado";

        itemsMap.set(testKey, {
          id: prog.id,
          amostra: sampleIdent,
          furo: details.furo,
          prof: details.prof,
          codigo: details.codigo,
          ensaio: siglaEnsaio,
          tipo,
          status: st,
          tecnico: prog.tecnico || undefined,
          revisao: "0",
        });
      }
    }

    // Monta o array final de ensaios para cada grupo
    const result: OsGroup[] = [];
    for (const { group, itemsMap } of groups.values()) {
      group.ensaios = Array.from(itemsMap.values()).sort((a, b) => a.amostra.localeCompare(b.amostra));
      result.push(group);
    }

    return result.sort((a, b) => a.osNumero.localeCompare(b.osNumero));
  }, [labState, pendencias, progs, amostrasProg, ensaiosProg, tiposProg, equipsProg, cadastro, deletedOs, deletedEnsaios, currentUserName]);

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
            labStore.patchEnsaio(os.id, am.id, en.id, { status: "concluido" });
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

  // Baixa laudo individual em PDF
  async function downloadSinglePdf(group: OsGroup, en: EnsaioItemOS) {
    const meta: ReportItemMeta = {
      os: group.osNumero,
      cliente: group.cliente,
      obra: group.obra,
      local: group.local,
      amostraId: en.amostra,
      amostraCodigo: en.codigo || en.amostra,
      furo: en.furo,
      profundidade: en.prof,
      ensaio: en.ensaio,
      tipo: en.tipo,
      revisao: en.revisao || "0",
      status: "Aprovado",
      responsavel: en.aprovador || en.verificador || "Engº Maurício Silva · CREA-SP",
    };

    const filename = formatReportFilename({
      os: group.osNumero,
      amostraId: en.amostra,
      amostraCodigo: en.codigo || en.amostra,
      tipoOrNome: en.ensaio,
      revisao: en.revisao || "0",
      ext: "pdf",
    });

    toast.loading(`Gerando PDF de ${en.amostra}…`, { id: "single-pdf" });
    try {
      const blob = await generateOfficialPdfBlob(meta);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`PDF baixado com sucesso: ${filename}`, { id: "single-pdf" });
    } catch (err: any) {
      toast.error(`Erro ao gerar PDF: ${err.message}`, { id: "single-pdf" });
    }
  }

  // Baixa laudo individual em Excel
  async function downloadSingleExcel(group: OsGroup, en: EnsaioItemOS) {
    const meta: ReportItemMeta = {
      os: group.osNumero,
      cliente: group.cliente,
      obra: group.obra,
      local: group.local,
      amostraId: en.amostra,
      amostraCodigo: en.codigo || en.amostra,
      furo: en.furo,
      profundidade: en.prof,
      ensaio: en.ensaio,
      tipo: en.tipo,
      revisao: en.revisao || "0",
      status: "Aprovado",
      responsavel: en.aprovador || en.verificador || "Engº Maurício Silva · CREA-SP",
    };

    const filename = formatReportFilename({
      os: group.osNumero,
      amostraId: en.amostra,
      amostraCodigo: en.codigo || en.amostra,
      tipoOrNome: en.ensaio,
      revisao: en.revisao || "0",
      ext: "xlsx",
    });

    toast.loading(`Gerando planilha Excel de ${en.amostra}…`, { id: "single-xlsx" });
    try {
      const buffer = await generateOfficialExcelBuffer(meta);
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Planilha Excel baixada: ${filename}`, { id: "single-xlsx" });
    } catch (err: any) {
      toast.error(`Erro ao gerar Excel: ${err.message}`, { id: "single-xlsx" });
    }
  }

  // Download em massa por OS - COM ARQUIVOS REAIS E NOMENCLATURA PADRÃO
  async function handleBatchDownload(group: OsGroup, tipoDownload: "aprovados_pdf" | "pdf_excel" | "excel") {
    const ensaiosAprovados = group.ensaios.filter(
      (e) => e.status === "aprovado" || e.status === "concluido_externo",
    );

    if (ensaiosAprovados.length === 0) {
      toast.error("Não há laudos aprovados/concluídos nesta OS para baixar.");
      return;
    }

    toast.loading(`Gerando pacote oficial da OS ${group.osNumero}…`, { id: "batch-dl" });

    try {
      const zip = new JSZip();
      const folder = zip.folder(`OS_${group.osNumero}_Laudos_Oficiais`) || zip;

      const logItens: Array<{ amostra: string; ensaio: string; formato: string; nomeArquivo: string }> = [];

      let manifesto = `====================================================\n`;
      manifesto += `SUPORTE INFRA — PACOTE OFICIAL DE LAUDOS DE LABORATÓRIO\n`;
      manifesto += `OS: ${group.osNumero} | CLIENTE: ${group.cliente || "—"}\n`;
      manifesto += `OBRA: ${group.obra || "—"}\n`;
      manifesto += `LOCAL: ${group.local || "—"}\n`;
      manifesto += `DATA DE EMISSÃO: ${new Date().toLocaleString("pt-BR")}\n`;
      manifesto += `====================================================\n\n`;
      manifesto += `LAUDOS OFICIAIS EXPORTADOS (PADRÃO NOMENCLATURA CORPORATIVO):\n`;

      for (const en of ensaiosAprovados) {
        const meta: ReportItemMeta = {
          os: group.osNumero,
          cliente: group.cliente,
          obra: group.obra,
          local: group.local,
          amostraId: en.amostra,
          amostraCodigo: en.codigo || en.amostra,
          furo: en.furo,
          profundidade: en.prof,
          ensaio: en.ensaio,
          tipo: en.tipo,
          revisao: en.revisao || "0",
          status: "Aprovado",
          responsavel: en.aprovador || en.verificador || "Engº Maurício Silva · CREA-SP",
        };

        const formato = tipoDownload === "excel" ? "XLSX" : tipoDownload === "pdf_excel" ? "PDF + XLSX" : "PDF";

        // Gera o nome padronizado: OS - ID - Código - Sigla - Revisão
        const pdfName = formatReportFilename({
          os: group.osNumero,
          amostraId: en.amostra,
          amostraCodigo: en.codigo || en.amostra,
          tipoOrNome: en.ensaio,
          revisao: en.revisao || "0",
          ext: "pdf",
        });

        const xlsxName = formatReportFilename({
          os: group.osNumero,
          amostraId: en.amostra,
          amostraCodigo: en.codigo || en.amostra,
          tipoOrNome: en.ensaio,
          revisao: en.revisao || "0",
          ext: "xlsx",
        });

        if (tipoDownload === "pdf_excel" || tipoDownload === "excel") {
          const excelBuffer = await generateOfficialExcelBuffer(meta);
          folder.file(xlsxName, excelBuffer);
        }

        if (tipoDownload !== "excel") {
          const pdfBlob = await generateOfficialPdfBlob(meta);
          const pdfBuffer = await pdfBlob.arrayBuffer();
          folder.file(pdfName, pdfBuffer);
        }

        manifesto += `- Arquivo: ${tipoDownload === "excel" ? xlsxName : pdfName} | Amostra: ${en.amostra} | Furo: ${en.furo || "—"} | Prof: ${en.prof || "—"}\n`;
        logItens.push({
          amostra: en.amostra,
          ensaio: en.ensaio,
          formato,
          nomeArquivo: tipoDownload === "excel" ? xlsxName : pdfName,
        });
      }

      folder.file("MANIFESTO_DE_ENTREGA.txt", manifesto);

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `OS_${group.osNumero}_Laudos_Oficiais_${tipoDownload}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Pacote da OS ${group.osNumero} baixado com sucesso!`, { id: "batch-dl" });

      setDownloadLog({
        open: true,
        osNumero: group.osNumero,
        tipo:
          tipoDownload === "aprovados_pdf"
            ? "Relatórios Aprovados em PDF"
            : tipoDownload === "pdf_excel"
              ? "Relatórios Completos (PDF + Excel)"
              : "Planilhas em Excel",
        total: ensaiosAprovados.length,
        itens: logItens,
      });
    } catch (err: any) {
      toast.error(`Erro ao gerar download: ${err.message}`, { id: "batch-dl" });
    }
  }

  // Confirmação de exclusão
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
    if (tipo === "mesp-a") {
      navigate({ to: "/relatorio/mesp-a", search: {} });
      return;
    }

    const state = labStore.get();
    let os = state.os.find((o) => (o.numero ?? "").trim() === osNum.trim());
    const cad = cadastro.lookup(osNum);
    const client = cad?.tomador || `OS ${osNum}`;
    const work = cad?.obra || "";
    const loc = cad?.local || "";

    // Tenta resolver dados da amostra e equipamento do Gantt
    const amProg =
      amostrasProg.find((a) => (a.codigo_amostra || a.identificacao || a.id) === amCode && normOs(a.os_numero || "") === normOs(osNum)) ||
      amostrasProg.find((a) => (a.codigo_amostra || a.identificacao) === amCode) ||
      amostrasProg.find((a) => a.id === amCode);
    const details = extractSampleDetails(amProg);

    let equipNome = "";
    if (amProg) {
      const enItem = ensaiosProg.find((e) => e.amostra_id === amProg.id);
      if (enItem) {
        const pItem = progs.find((p) => p.ensaio_id === enItem.id);
        if (pItem?.equipamento_id) {
          const eq = equipsProg.find((eq) => eq.id === pItem.equipamento_id);
          if (eq?.nome) equipNome = eq.nome;
        }
      }
    }

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
      if (!os.technicalResp || os.technicalResp.includes("Maurício Silva")) {
        os.technicalResp = "Engº Maurício Malanconi - CREA: 5063078630";
        updated = true;
      }
      if (updated) labStore.patchOS(os.id, { client: os.client, workNumber: os.workNumber, local: os.local, technicalResp: os.technicalResp });
    }

    const cleanAm = (amCode || "AM-01").trim();
    let am = os.amostras.find((a) => (a.reportNumber ?? a.code ?? "").trim() === cleanAm);
    if (!am) {
      am = labStore.addAmostra(os.id, {
        reportNumber: cleanAm,
        code: details.codigo || cleanAm,
        borehole: details.furo,
        depth: details.prof,
        sampleType: amProg?.tipo || "Bloco indeformado",
        description: amProg?.descricao || "",
      });
    } else {
      let patchAm: any = {};
      if (!am.borehole && details.furo) patchAm.borehole = details.furo;
      if (!am.depth && details.prof) patchAm.depth = details.prof;
      if (!am.code && details.codigo) patchAm.code = details.codigo;
      if (!am.sampleType && amProg?.tipo) patchAm.sampleType = amProg.tipo;
      if (Object.keys(patchAm).length > 0) {
        labStore.patchAmostra(os.id, am.id, patchAm);
      }
    }

    const siglaEnsaio = siglaOuNome || ENSAIO_LABEL[tipo] || tipo;
    let en = am.ensaios.find((e) => e.tipo === tipo);
    if (!en) {
      en = labStore.addEnsaio(os.id, am.id, tipo, siglaEnsaio);
      labStore.patchEnsaio(os.id, am.id, en.id, {
        operator: currentUserName,
        nome: siglaEnsaio,
        sigla: siglaEnsaio,
        payload: {
          sample: {
            equipment: equipNome || undefined,
            typedBy: currentUserName,
            operator: currentUserName,
            technicalResp: "Engº Maurício Malanconi - CREA: 5063078630",
          },
        },
      });
    } else {
      if (siglaOuNome && siglaOuNome !== ENSAIO_LABEL[tipo]) {
        labStore.patchEnsaio(os.id, am.id, en.id, {
          nome: siglaOuNome,
          sigla: siglaOuNome,
        });
      }
    }

    navigate({
      to: "/relatorio/os/$osId/amostra/$amostraId/ensaio/$ensaioId",
      params: { osId: os.id, amostraId: am.id, ensaioId: en.id },
      search: {},
    });
  }

  return (
    <div className="space-y-6 w-full px-4 sm:px-6 md:px-8 py-6 pb-20">
      {/* Header Central da OS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-1.5 font-semibold">
            <FolderKanban className="h-3.5 w-3.5 text-primary" /> Painel de Laudos por Ordem de Serviço
          </div>
          <h1 className="mt-1 font-display text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Central de Ordens de Serviço & Laudos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Visão panorâmica em tela cheia: acompanhe todas as amostras, tipos de ensaio e status na esteira, com arquivamento e downloads em lote.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            asChild
            className="gap-1.5"
          >
            <Link to="/relatorio/pendentes" search={{ tab: undefined }}>
              <Layers className="h-4 w-4 text-muted-foreground" /> Central de Relatórios & SLAs
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              refetchPend();
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Barra de Busca e Filtros */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por OS, cliente, obra, local ou amostra..."
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-md border text-xs">
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
            Em Andamento
          </Button>
          <Button
            size="sm"
            variant={statusFilter === "concluidas" ? "secondary" : "ghost"}
            className="h-7 text-xs font-medium"
            onClick={() => setStatusFilter("concluidas")}
          >
            Concluídas
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
                                disabled={!hasAprovados}
                                className="h-8 text-xs gap-1.5 border-emerald-600/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 disabled:opacity-50"
                                onClick={() => handleBatchDownload(group, "aprovados_pdf")}
                              >
                                <FileText className="h-3.5 w-3.5 text-emerald-600" /> Aprovados (PDF)
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
                                disabled={!hasAprovados}
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
                      {pct < 100 && (
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

      {/* Modal de Log de Download */}
      <Dialog open={Boolean(downloadLog?.open)} onOpenChange={(o) => !o && setDownloadLog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Exportação Concluída com Sucesso!
            </DialogTitle>
            <DialogDescription className="text-xs">
              Pacote de laudos gerado para a <b>OS {downloadLog?.osNumero}</b> ({downloadLog?.tipo}).
            </DialogDescription>
          </DialogHeader>

          {downloadLog && (
            <div className="space-y-3 py-2">
              <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1.5 border">
                <div className="font-semibold text-foreground">
                  Total de laudos aprovados exportados: <span className="text-primary">{downloadLog.total}</span>
                </div>
                <div className="text-muted-foreground text-[11px]">
                  Todos os arquivos foram gerados no padrão corporativo e compactados em ZIP com manifesto.
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-semibold text-muted-foreground">Arquivos incluídos no pacote:</div>
                <div className="max-h-56 overflow-y-auto rounded border bg-card p-2 text-xs space-y-1.5">
                  {downloadLog.itens.map((it, idx) => (
                    <div key={idx} className="flex flex-col border-b pb-1.5 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">
                          {it.amostra} · {it.ensaio}
                        </span>
                        <Badge variant="secondary" className="text-[9px]">
                          {it.formato}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate" title={it.nomeArquivo}>
                        📄 {it.nomeArquivo}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button size="sm" onClick={() => setDownloadLog(null)}>
              Fechar
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