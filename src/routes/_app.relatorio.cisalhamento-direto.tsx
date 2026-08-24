import { SyncStatusBadge } from "@/components/SyncStatusBadge";
import { saveSharedDraft, loadSharedDraft } from "@/lib/draft.functions";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { useCadastroByOs } from "@/hooks/use-cadastro-by-os";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Download,
  FileText,
  Beaker,
  Activity,
  BarChart3,
  FlaskConical,
  Settings2,
  Plus,
  Trash2,
  History,
  Eye,
  Send,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  ClipboardPaste,
  Cloud,
  CheckCircle2,
  MessageSquareQuote,
  AlertTriangle,
  Upload,
  FileSpreadsheet,
  ZoomIn,
  ZoomOut,
  User,
  FileEdit,
  Maximize2,
} from "lucide-react";
import { toast } from "sonner";
import { toCanvas, toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import {
  listVersions,
  saveVersion,
  nextRev,
  deleteVersion,
  downloadVersion,
  viewVersion,
  type ReportVersion,
} from "@/features/cisalhamento-direto/report-versions";
import { syncRevision, fetchDriveStatus } from "@/features/cisalhamento-direto/driveSync";
import {
  listApprovals,
  requestApproval,
  verifyApproval,
  decideApproval,
  type ApprovalRow,
} from "@/lib/approvals.functions";
import { getWorkflowStatuses } from "@/lib/driveSync.functions";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { PhotoUploader } from "@/features/lab/components/PhotoUploader";
import { WorkflowFarol } from "@/features/lab/components/WorkflowFarol";
import { useOptionalLabEnsaio } from "@/features/lab/context";
import type {
  CDSample,
  CDSpecimen,
  CDSpecimenResults,
  CDEnvelopeResult,
  CDReading,
  CDAxisCfg,
} from "@/features/cisalhamento-direto/types";
import { SEED_CD_SAMPLE, makeEmptyCDSpecimen } from "@/features/cisalhamento-direto/seed";
import { loadDraft, saveDraft, fetchRemoteDraft } from "@/features/cisalhamento-direto/draftStore";
import { processSpecimen, fitEnvelope } from "@/features/cisalhamento-direto/domain/calc";
import { cn } from "@/lib/utils";
import { EnsaioListByType } from "@/features/lab/components/EnsaioListByType";
import { PickerWithCreate } from "@/features/cisalhamento-direto/PickerWithCreate";
import { CDCpSelector } from "@/features/cisalhamento-direto/components/CDCpSelector";
import { CDMoldagemFicha } from "@/features/cisalhamento-direto/components/CDMoldagemFicha";
import { CDSummaryPage } from "@/features/cisalhamento-direto/components/CDSummaryPage";
import { CDConsolidationPage } from "@/features/cisalhamento-direto/components/CDConsolidationPage";
import { CDShearChartsPage } from "@/features/cisalhamento-direto/components/CDShearChartsPage";
import {
  CDReportPage1,
  CDReportPage2,
  CDReportPage3,
  CDReportPage4,
  CDReportPage5,
  CDReportPage6,
  CDReportPages,
  getReportTitle,
} from "@/features/cisalhamento-direto/components/CDReportPages";
import { CDSpecimensSummaryCard } from "@/features/cisalhamento-direto/components/CDSpecimensSummaryCard";
import { CDImportDialog } from "@/features/cisalhamento-direto/components/CDImportDialog";
import { parseCDXlsx } from "@/features/cisalhamento-direto/importXlsx";
import { exportCDRawDataXlsx } from "@/features/cisalhamento-direto/exportXlsx";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export const Route = createFileRoute("/_app/relatorio/cisalhamento-direto")({
  component: () => {
    const ctx = useOptionalLabEnsaio();
    return ctx?.ensaio ? <CDPage /> : <EnsaioListByType tipo="cisalhamento-direto" />;
  },
  head: () => ({
    meta: [
      { title: "Cisalhamento Direto — Suporte INFRA" },
      {
        name: "description",
        content: "Processamento e relatório de ensaio de cisalhamento direto de solos (ASTM D3080).",
      },
    ],
  }),
});

function NumField({
  label,
  value,
  onChange,
  step = 1,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="h-8 text-xs"
      />
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listRows } from "@/lib/programacao.functions";
import { labStore } from "@/features/lab/store";
import { SampleEditDialog } from "@/components/SampleEditDialog";
import { AneisManagerDialog } from "@/components/AneisManagerDialog";
import { useAuth } from "@/hooks/use-auth";
import { parseGanttSampleData } from "@/lib/sample-parser";

export function CDPage() {
  const ctx = useOptionalLabEnsaio();
  const { lookup } = useCadastroByOs();
  const cad = ctx?.os?.numero ? lookup(ctx.os.numero) : undefined;
  const { displayName, user, profile, role } = useAuth();
  const currentUserName = displayName || profile?.nome || user?.email?.split("@")[0] || "Cleitton Pereira";
  const isAdmin = role === "admin" || user?.email?.includes("cleitton") || user?.id === "cleitton-admin-local";
  const isVerificador = role === "verificador" || role === "gestor" || isAdmin;
  const navigate = useNavigate();
  const [sampleEditOpen, setSampleEditOpen] = useState(false);

  const rows0Fn = useServerFn(listRows);
  const { data: amostrasProg = [] } = useQuery({
    queryKey: ["cd-gantt-amostras"],
    queryFn: async () => rows0Fn({ data: { sheet: "Amostras" } }),
    staleTime: 60_000,
  });
  const { data: progsGantt = [] } = useQuery({
    queryKey: ["cd-gantt-progs"],
    queryFn: async () => rows0Fn({ data: { sheet: "Programações" } }),
    staleTime: 60_000,
  });
  const { data: equipsGantt = [] } = useQuery({
    queryKey: ["cd-gantt-equips"],
    queryFn: async () => rows0Fn({ data: { sheet: "Equipamentos" } }),
    staleTime: 60_000,
  });

  const scopeId =
    ctx && ctx.os && ctx.amostra && ctx.ensaio
      ? `os/${ctx.os.id}/amostra/${ctx.amostra.id}/ensaio/${ctx.ensaio.id}`
      : (ctx?.ensaio?.id ?? "local");

  const draftRef = useRef<ReturnType<typeof loadDraft>>(null);
  if (draftRef.current === null) draftRef.current = loadDraft(scopeId);

  const payloadDraft = (ctx?.ensaio?.payload as any);
  const draft = payloadDraft ?? draftRef.current ?? undefined;

  const initialSample: CDSample = ctx
    ? {
        client: ctx.os.client || cad?.tomador || "",
        workNumber: ctx.os.workNumber || cad?.obra || "",
        os: ctx.os.numero || "",
        local: ctx.os.local || cad?.local || "",
        operator: draft?.sample?.operator || ctx.ensaio.operator || ctx.os.operator || currentUserName,
        technicalResp: ctx.os.technicalResp || "Engº Maurício Malanconi - CREA: 5063078630",
        revision: ctx.os.revision || "0",
        reportNumber: ctx.amostra.reportNumber || "",
        borehole: ctx.amostra.borehole || "",
        depth: ctx.amostra.depth || "",
        description: ctx.amostra.description || "",
        code: ctx.amostra.code || "",
        granulometricDescription: ctx.amostra.granulometricDescription || "",
        date: new Date().toISOString().split("T")[0],
        typedBy: draft?.sample?.typedBy || ctx.ensaio.operator || currentUserName,
        geometry: "circular",
        dimensionMm: 60,
        equipment: (ctx.ensaio.payload as any)?.sample?.equipment || "Cisalhamento Direto",
        Gs: 2.70,
        rhoW: 1.0,
        applyMembrane: false,
        membraneE: 1400,
        membraneT: 0.3,
        testCondition: "inundado",
        applyAreaCorrection: true,
        sampleState: "indeformada",
      }
    : { ...SEED_CD_SAMPLE, typedBy: currentUserName, operator: currentUserName };

  const [sample, setSample] = useState<CDSample>(() => (draft?.sample ? { ...initialSample, ...draft.sample } : initialSample));

  useEffect(() => {
    if (!sample.typedBy && currentUserName) {
      setSample((prev) => ({ ...prev, typedBy: currentUserName }));
    }
  }, [currentUserName]);

  // Resolução automática e instantânea de Furo, Profundidade e Metadados do Gantt
  useEffect(() => {
    if (amostrasProg.length === 0) return;
    const osNum = (sample.os || ctx?.os?.numero || "").trim();
    const amKey = (sample.reportNumber || sample.code || ctx?.amostra?.reportNumber || ctx?.amostra?.code || "").trim();
    if (!amKey && !osNum) return;

    const found =
      amostrasProg.find((a: any) => {
        const aOs = (a.os_numero || "").trim();
        if (osNum && aOs && aOs !== osNum) return false;
        return (
          (a.codigo_amostra && String(a.codigo_amostra).trim() === amKey) ||
          (a.identificacao && String(a.identificacao).trim() === amKey) ||
          (a.id && String(a.id).trim() === amKey) ||
          (a.numero_amostra && String(a.numero_amostra).trim() === amKey)
        );
      }) ||
      amostrasProg.find((a: any) => {
        return (
          (a.codigo_amostra && String(a.codigo_amostra).trim() === amKey) ||
          (a.identificacao && String(a.identificacao).trim() === amKey) ||
          (a.id && String(a.id).trim() === amKey)
        );
      });

    if (found) {
      const parsed = parseGanttSampleData(found);
      const furoFound = parsed.furo;
      const depthFound = parsed.prof;
      const codeFound = parsed.codigo;
      const typeFound = parsed.tipo;
      const descFound = parsed.desc;

      // Busca equipamento alocado
      let equipFound = "";
      if (progsGantt.length > 0 && equipsGantt.length > 0) {
        const eqMap = new Map(equipsGantt.map((eq: any) => [eq.id, eq.nome]));
        const pr = progsGantt.find((p: any) => p.ensaio_id && p.equipamento_id);
        if (pr?.equipamento_id) equipFound = String(eqMap.get(pr.equipamento_id) || "");
      }

      setSample((prev) => {
        let changed = false;
        const next = { ...prev };
        if (!next.borehole && furoFound) { next.borehole = furoFound; changed = true; }
        if (!next.depth && depthFound) { next.depth = depthFound; changed = true; }
        if (!next.code && codeFound) { next.code = codeFound; changed = true; }
        if (descFound && !next.description) { next.description = descFound; changed = true; }
        if (typeFound && !next.sampleState) {
          next.sampleState = typeFound.toLowerCase().includes("deform") ? "recompactada" : "indeformada";
          changed = true;
        }
        if ((!next.equipment || next.equipment === "Cisalhamento Direto") && equipFound) {
          next.equipment = equipFound;
          changed = true;
        }
        if (cad?.tomador && (!next.client || next.client.startsWith("OS "))) { next.client = cad.tomador; changed = true; }
        if (cad?.obra && !next.workNumber) { next.workNumber = cad.obra; changed = true; }
        if (cad?.local && !next.local) { next.local = cad.local; changed = true; }
        if (!next.technicalResp || next.technicalResp.includes("Maurício Silva")) {
          next.technicalResp = "Engº Maurício Malanconi - CREA: 5063078630";
          changed = true;
        }
        return changed ? next : prev;
      });

      if (ctx && ctx.os && ctx.amostra) {
        if (!ctx.amostra.borehole && furoFound) {
          labStore.patchAmostra(ctx.os.id, ctx.amostra.id, {
            borehole: furoFound,
            depth: depthFound || ctx.amostra.depth,
            code: codeFound || ctx.amostra.code,
          });
        }
      }
    }
  }, [amostrasProg, progsGantt, equipsGantt, cad, ctx]);
  const [specimens, setSpecimens] = useState<CDSpecimen[]>(() =>
    draft?.specimens && draft.specimens.length > 0
      ? draft.specimens
      : [makeEmptyCDSpecimen("CP1", 0), makeEmptyCDSpecimen("CP2", 1), makeEmptyCDSpecimen("CP3", 2)],
  );
  const [selectedCpId, setSelectedCpId] = useState<string>(() => draft?.selectedCpId ?? specimens[0]?.id ?? "CP1");
  const [tab, setTab] = useState(() => draft?.tab ?? "amostra");

  const [adjust, setAdjust] = useState(() => draft?.adjust ?? {
    mSobreCP: 0,
    espMembrana: 0,
    aPistao: 0,
    hTopcap: 0,
    fAtritoPistao: 0,
  });

  const [axisCfg, setAxisCfg] = useState<CDAxisCfg>(() => draft?.axisCfg ?? {
    ehMax: 0,
    tauMax: 0,
    vertDispMin: 0,
    vertDispMax: 0,
    sigmaNMax: 0,
    tauEnvelopeMax: 0,
    sqrtTMax: 0,
    adensDispMax: 0,
  });

  const [zoom, setZoom] = useState(85);

  const [idOpen, setIdOpen] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [obsDialogOpen, setObsDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const [capsOpen, setCapsOpen] = useState(true);
  const [geomOpen, setGeomOpen] = useState(true);
  const [indicesOpen, setIndicesOpen] = useState(true);
  const [finalOpen, setFinalOpen] = useState(true);
  const [photoOpen, setPhotoOpen] = useState(true);

  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [versions, setVersions] = useState<ReportVersion[]>([]);
  const [driveStatus, setDriveStatus] = useState<any>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null);
  const [wfStatus, setWfStatus] = useState(() => (ctx?.ensaio as any)?.status || "digitacao");
  const [previewVersionPdf, setPreviewVersionPdf] = useState<{ url: string; title: string } | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  // Diálogo de confirmação
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    destructive?: boolean;
    onConfirm?: () => void;
  }>({ open: false, title: "", description: "" });

  const askConfirm = (opts: {
    title: string;
    description: string;
    confirmLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
  }) => setConfirmState({ open: true, ...opts });

  // Diálogo de Decisão / Aprovação
  const [decideOpen, setDecideOpen] = useState<null | {
    rev: number;
    stage: "verify" | "approve";
    decision: "verificado" | "rejeitado_verificacao" | "aprovado" | "rejeitado";
  }>(null);
  const [decideComment, setDecideComment] = useState("");
  const [decideBusy, setDecideBusy] = useState(false);
  const [remoteLoaded, setRemoteLoaded] = useState(false);

  const refreshVersions = async () => {
    const v = await listVersions(scopeId);
    setVersions(v);
  };

  const refreshDriveStatus = async () => {
    try {
      const s = await fetchDriveStatus(scopeId);
      setDriveStatus(s);
    } catch (err) {
      console.warn(err);
    }
  };

  const refreshApprovals = async () => {
    try {
      const rows = await listApprovals({ data: { scopeId } });
      setApprovals(rows);
      const res = await getWorkflowStatuses({ data: { scopeIds: [scopeId] } });
      const fetchedWf = res.statuses[scopeId];
      if (fetchedWf) {
        setWfStatus(fetchedWf);
      } else if (rows.length > 0) {
        const latestRev = rows[0];
        if (latestRev.status === "pendente_verificacao" || latestRev.status === "verificado") setWfStatus("aguardando_verificacao");
        else if (latestRev.status === "pendente_aprovacao") setWfStatus("aguardando_aprovacao");
        else if (latestRev.status === "aprovado") setWfStatus("aprovado");
      } else if ((ctx?.ensaio as any)?.status) {
        setWfStatus((ctx?.ensaio as any).status);
      }
    } catch (err) {
      console.warn(err);
    }
  };

  useEffect(() => {
    refreshVersions();
    refreshDriveStatus();
    refreshApprovals();
    fetchRemoteDraft(scopeId, {
      osNum: ctx?.os?.numero,
      amCode: ctx?.amostra?.reportNumber || ctx?.amostra?.code,
      ensaioTipo: "cisalhamento-direto",
    }).then((remote) => {
      if (remote) {
        if (remote.sample) setSample((s) => ({ ...s, ...remote.sample }));
        if (remote.specimens && remote.specimens.length > 0) setSpecimens(remote.specimens);
        if (remote.selectedCpId) setSelectedCpId(remote.selectedCpId);
        if (remote.tab) setTab(remote.tab);
        if (remote.adjust) setAdjust((a: any) => ({ ...a, ...remote.adjust }));
        if (remote.axisCfg) setAxisCfg((cfg) => ({ ...cfg, ...remote.axisCfg }));
        if (remote.photos && remote.photos.length > 0 && ctx?.os?.id && ctx?.amostra?.id && ctx?.ensaio?.id) {
          labStore.setEnsaioPhotos(ctx.os.id, ctx.amostra.id, ctx.ensaio.id, remote.photos as any);
        }
      }
      setRemoteLoaded(true);
    }).catch(() => {
      setRemoteLoaded(true);
    });
  }, [scopeId]);

  useEffect(() => {
    if (!remoteLoaded) return;
    const h = window.setTimeout(() => {
      const draftPhotos = ctx?.photos ?? (draft as any)?.photos ?? [];
      const draftData = { sample, specimens, selectedCpId, tab, adjust, axisCfg, photos: draftPhotos };
      saveDraft(scopeId, draftData);
      if (ctx?.ensaio) ctx.onPayloadChange(draftData);
    }, 400);
    return () => window.clearTimeout(h);
  }, [remoteLoaded, scopeId, sample, specimens, selectedCpId, tab, adjust, axisCfg, ctx, ctx?.photos]);

  const sortedSpecimens = useMemo(
    () => [...specimens].sort((a, b) => (a.normalStressTarget ?? 0) - (b.normalStressTarget ?? 0)),
    [specimens],
  );
  const results = useMemo(() => sortedSpecimens.map((cp) => processSpecimen(cp, sample)), [sortedSpecimens, sample]);

  const selIdx = Math.max(
    0,
    sortedSpecimens.findIndex((s) => s.id === selectedCpId),
  );
  const cp = sortedSpecimens[selIdx] ?? sortedSpecimens[0];
  const res = results[selIdx] ?? results[0];

  const envelope = useMemo(() => {
    const pts = results.map((r, i) => ({ sigma: r.sigmaN, tau: r.tauPeak, cp: sortedSpecimens[i].id }));
    return fitEnvelope(pts);
  }, [results, sortedSpecimens]);

  const suggestedAxisCfg = useMemo<CDAxisCfg>(() => {
    let maxStrain = 15;
    let maxTau = 100;
    let minVert = -5;
    let maxVert = 5;

    results.forEach((r) => {
      r.curve.forEach((p) => {
        if (p.horizStrainPct > maxStrain) maxStrain = p.horizStrainPct;
        if (p.shearStress > maxTau) maxTau = p.shearStress;
        if (p.vertDispMm < minVert) minVert = p.vertDispMm;
        if (p.vertDispMm > maxVert) maxVert = p.vertDispMm;
      });
    });

    const sigmaVals = results.map((r) => r.sigmaN);
    const maxSigma = sigmaVals.length ? Math.max(...sigmaVals, 100) : 100;
    const sigmaNMax = Math.max(100, Math.ceil((maxSigma * 1.25) / 50) * 50);

    const tauVals = results.map((r) => r.tauPeak);
    const envEnd = envelope ? envelope.c + sigmaNMax * Math.tan((envelope.phiDeg * Math.PI) / 180) : 100;
    const maxTauEnv = Math.max(...tauVals, envEnd, 100);
    const tauEnvelopeMax = Math.max(100, Math.ceil((maxTauEnv * 1.15) / 50) * 50);

    return {
      ehMax: Math.ceil(maxStrain / 5) * 5,
      tauMax: Math.ceil(maxTau / 20) * 20,
      vertDispMin: Math.floor(minVert),
      vertDispMax: Math.ceil(maxVert),
      sigmaNMax,
      tauEnvelopeMax,
      sqrtTMax: 5,
      adensDispMax: 2,
    };
  }, [results, envelope]);

  const updateAxis = <K extends keyof CDAxisCfg>(k: K, v: number) => {
    setAxisCfg((s) => ({ ...s, [k]: v }));
  };

  const updateSample = (k: keyof CDSample, v: any) => setSample((s) => ({ ...s, [k]: v }));
  const updateSpecimen = (id: string, patch: Partial<CDSpecimen>) =>
    setSpecimens((sps) => sps.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const applyAdjustToAll = () => {
    setSpecimens((sp) => sp.map((c) => ({ ...c, ...adjust })));
    setAdjustOpen(false);
    toast.success("Parâmetros aplicados a todos os CPs");
  };

  const addCp = () => {
    const nextIdx = specimens.length;
    const novo = makeEmptyCDSpecimen(`CP${nextIdx + 1}`, nextIdx);
    setSpecimens((s) => [...s, novo]);
    setSelectedCpId(novo.id);
  };

  const removeCp = (id: string) => {
    if (specimens.length <= 1) {
      toast.error("Deve haver pelo menos um CP");
      return;
    }
    const alvo = specimens.find((c) => c.id === id);
    const label = alvo?.displayId ?? alvo?.id ?? id;
    askConfirm({
      title: `Apagar ${label}?`,
      description: `Todos os dados deste CP (moldagem, adensamento, leituras de cisalhamento) serão apagados.`,
      confirmLabel: "Apagar",
      destructive: true,
      onConfirm: () => {
        setSpecimens((s) => s.filter((x) => x.id !== id));
        if (selectedCpId === id) {
          const remaining = specimens.filter((x) => x.id !== id);
          setSelectedCpId(remaining[0]?.id ?? "");
        }
        toast.success(`${label} removido.`);
      },
    });
  };

  // Importação de arquivo XLSX de ensaio
  const handleImportXlsxFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls,.csv";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const buf = await file.arrayBuffer();
        const parsed = parseCDXlsx(buf, file.name);
        if (!parsed.shear.length) {
          toast.error("Nenhuma leitura de cisalhamento identificada no arquivo.");
          return;
        }
        updateSpecimen(cp.id, {
          shearData: parsed.shear,
          consolidationData: parsed.consolidation.length ? parsed.consolidation : cp.consolidationData,
        });
        toast.success(`${parsed.shear.length} pontos de ensaio importados de ${file.name}!`);
      } catch (err) {
        toast.error("Erro ao ler arquivo: " + (err instanceof Error ? err.message : String(err)));
      }
    };
    input.click();
  };

  // Cálculo do total de páginas
  const photoPagesCount = Math.max(1, Math.ceil(sortedSpecimens.length / 3));
  const totalPages = 5 + photoPagesCount; // P1 (Condições), P2 (Resumo), P3 (Gráficos), P4 (Envoltória), P5.. (Fotos), P6 (Fórmulas)

  /**
   * Renderiza o PDF do relatório e devolve como Blob (para download direto ou salvar como versão).
   */
  const buildReportPdfBlob = async (): Promise<Blob> => {
    const el = reportRef.current;
    if (!el) throw new Error("Container do relatório não encontrado.");

    // Salva estilos originais do container de impressão
    const prevStyle = {
      position: el.style.position,
      top: el.style.top,
      left: el.style.left,
      width: el.style.width,
      zIndex: el.style.zIndex,
      opacity: el.style.opacity,
      visibility: el.style.visibility,
    };

    // Força o container em tamanho real 210mm 1:1 (sem influência de zoom da tela)
    Object.assign(el.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "210mm",
      background: "#ffffff",
      pointerEvents: "none",
      zIndex: "2147483647",
      opacity: "1",
      visibility: "visible",
    });

    // Aguarda renderização dos componentes e gráficos SVG
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
    await new Promise((r) => setTimeout(r, 200));

    try {
      const pages = Array.from(el.querySelectorAll<HTMLElement>(".printable-report"));
      if (pages.length === 0) throw new Error("Nenhuma página do relatório encontrada.");

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const W = 210, H = 297;

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const dataUrl = await toPng(page, {
          pixelRatio: 2.5,
          cacheBust: true,
          backgroundColor: "#ffffff",
          style: {
            transform: "none",
            margin: "0",
            padding: "5mm 8mm",
            width: "210mm",
            height: "297mm",
            maxWidth: "210mm",
            maxHeight: "297mm",
            boxSizing: "border-box",
            overflow: "hidden",
          },
          filter: (node) => !(node instanceof HTMLElement && node.classList.contains("no-print")),
        });

        if (i > 0) pdf.addPage("a4", "portrait");
        pdf.addImage(dataUrl, "PNG", 0, 0, W, H, undefined, "FAST");
      }

      return pdf.output("blob");
    } finally {
      // Restaura estilos originais do container
      Object.assign(el.style, prevStyle);
    }
  };

  const handleGeneratePdf = async () => {
    setPdfBusy(true);
    const toastId = toast.loading("Gerando PDF do relatório…");
    try {
      const blob = await buildReportPdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base = (sample.workNumber || sample.os || "relatorio").toString().replace(/[^\w-]+/g, "_");
      a.download = `Cisalhamento-Direto_${base}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF gerado e baixado com sucesso!", { id: toastId });
    } catch (err) {
      toast.error("Erro ao gerar PDF: " + (err instanceof Error ? err.message : String(err)), { id: toastId });
    } finally {
      setPdfBusy(false);
    }
  };

  const handleExportXlsx = async () => {
    const tid = toast.loading("Gerando Planilha Excel Executiva...");
    try {
      const base = (sample.workNumber || sample.os || sample.reportNumber || "relatorio")
        .toString()
        .replace(/[^\w-]+/g, "_");
      const filename = `Cisalhamento-Direto_${base}_LaudoExecutivo.xlsx`;
      await exportCDRawDataXlsx({
        sample,
        specimens: sortedSpecimens,
        results,
        envelope,
        photos: ctx?.photos || [],
        approvals,
        versions,
        filename,
      });
      toast.success("Planilha Excel Executiva (.xlsx) exportada com sucesso!", { id: tid });
    } catch (err) {
      toast.error("Erro ao exportar planilha Excel: " + (err instanceof Error ? err.message : String(err)), { id: tid });
    }
  };

  const handleSaveVersion = async (opts?: { skipVerification?: boolean }) => {
    const skipVerification = opts?.skipVerification === true;
    setWfStatus(skipVerification ? "aguardando_aprovacao" : "aguardando_verificacao");
    setSaveBusy(true);
    const tid = toast.loading("Gerando e salvando versão PDF…");
    try {
      const blob = await buildReportPdfBlob();
      const rev = await nextRev(scopeId);
      const base = (sample.workNumber || sample.os || "relatorio").toString().replace(/[^\w-]+/g, "_");
      const filename = `Cisalhamento-Direto_${base}_Rev-${String(rev).padStart(2, "0")}.pdf`;
      const saved = await saveVersion({ scopeId, rev, filename, size: blob.size, pdfBlob: blob });
      await refreshVersions();

      // Sincronização com o Drive em segundo plano
      try {
        const fotos = (ctx?.photos ?? [])
          .map((p) => {
            const m = /^data:(.*?);base64,(.*)$/.exec(p.dataUrl);
            const mimeType = m?.[1] || "image/jpeg";
            const b64 = m?.[2] || "";
            const ext = mimeType.split("/")[1] || "jpg";
            return {
              cpId: p.specimenId || "geral",
              filename: `${p.kind}_${p.id}.${ext}`,
              mimeType,
              base64: b64,
            };
          })
          .filter((f) => f.base64.length > 0);

        const resDrive = await syncRevision({
          scopeId,
          rev: saved.rev,
          pdfBlob: blob,
          pdfFilename: filename,
          sample,
          specimens,
          results,
          envelope,
          photos: ctx?.photos || [],
          ctxOs: ctx?.os,
          ctxAmostra: ctx?.amostra,
          ctxEnsaio: { tipo: "cisalhamento-direto", nome: sample.reportNumber },
          fotos,
        });
        if (resDrive?.folderUrl) setDriveFolderUrl(resDrive.folderUrl);
        await refreshDriveStatus();
      } catch (err) {
        console.warn("Drive sync standby:", err);
      }

      await requestApproval({
        data: {
          scopeId,
          rev: saved.rev,
          filename,
          skipVerification,
          index: {
            os_numero: sample.os,
            os_cliente: sample.client,
            amostra_code: sample.reportNumber || sample.code,
            ensaio_tipo: "cisalhamento-direto",
            ensaio_nome: "Cisalhamento Direto",
          },
        },
      });
      const currentDraft = { sample, specimens, selectedCpId, tab, adjust, axisCfg, photos: ctx?.photos || [] };
      saveDraft(scopeId, currentDraft);
      if (ctx && ctx.os && ctx.amostra && ctx.ensaio) {
        labStore.patchEnsaio(ctx.os.id, ctx.amostra.id, ctx.ensaio.id, {
          payload: currentDraft,
          status: skipVerification ? "aguardando_aprovacao" : "aguardando_verificacao",
        });
      }
      setWfStatus(skipVerification ? "aguardando_aprovacao" : "aguardando_verificacao");
      await refreshApprovals();

      toast.success(
        skipVerification
          ? `Versão Rev ${String(saved.rev).padStart(2, "0")} gerada e enviada para aprovação!`
          : `Versão Rev ${String(saved.rev).padStart(2, "0")} gerada e enviada para verificação!`,
        { id: tid },
      );
    } catch (err) {
      console.error("Erro ao salvar versão / enviar para aprovação:", err);
      toast.error("Erro ao salvar versão / solicitar verificação: " + (err instanceof Error ? err.message : String(err)), { id: tid });
    } finally {
      setSaveBusy(false);
    }
  };

  return (
    <>
      {/* Diálogo de confirmação global */}
      <Dialog open={confirmState.open} onOpenChange={(o) => setConfirmState((s) => ({ ...s, open: o }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmState.title}</DialogTitle>
            <DialogDescription className="whitespace-pre-line">{confirmState.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setConfirmState((s) => ({ ...s, open: false }))}>
              Cancelar
            </Button>
            <Button
              variant={confirmState.destructive ? "destructive" : "default"}
              onClick={() => {
                confirmState.onConfirm?.();
                setConfirmState((s) => ({ ...s, open: false }));
              }}
            >
              {confirmState.confirmLabel ?? "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Importação de Dados */}
      <CDImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        cpLabel={cp.displayId ?? cp.id}
        onImportShear={(readings) => updateSpecimen(cp.id, { shearData: readings })}
        onImportConsolidation={(readings) => updateSpecimen(cp.id, { consolidationData: readings })}
      />

      {/* Diálogo de Decisão / Aprovação */}
      <Dialog open={decideOpen !== null} onOpenChange={(o) => !o && setDecideOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decideOpen?.decision === "aprovado"
                ? "Aprovar Relatório"
                : decideOpen?.decision === "rejeitado" || decideOpen?.decision === "rejeitado_verificacao"
                  ? "Rejeitar Relatório"
                  : "Verificar Relatório"}
            </DialogTitle>
            <DialogDescription>
              Revisão {decideOpen ? String(decideOpen.rev).padStart(2, "0") : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-xs font-semibold">Comentários ou Observações Técnicas</Label>
            <Textarea
              placeholder="Adicione observações sobre a verificação ou motivos de rejeição..."
              value={decideComment}
              onChange={(e) => setDecideComment(e.target.value)}
              className="h-24 text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDecideOpen(null)} disabled={decideBusy}>
              Cancelar
            </Button>
            <Button
              variant={
                decideOpen?.decision === "rejeitado" || decideOpen?.decision === "rejeitado_verificacao"
                  ? "destructive"
                  : "default"
              }
              disabled={decideBusy}
              onClick={async () => {
                if (!decideOpen) return;
                setDecideBusy(true);
                try {
                  if (decideOpen.stage === "verify") {
                    await verifyApproval({
                      data: {
                        scopeId,
                        rev: decideOpen.rev,
                        decision: decideOpen.decision as any,
                        comment: decideComment,
                      },
                    });
                  } else {
                    await decideApproval({
                      data: {
                        scopeId,
                        rev: decideOpen.rev,
                        decision: decideOpen.decision as any,
                        comment: decideComment,
                      },
                    });
                  }
                  await refreshApprovals();
                  toast.success("Decisão registrada com sucesso!");
                  setDecideOpen(null);
                  setDecideComment("");
                } catch (err) {
                  toast.error("Falha ao registrar: " + (err instanceof Error ? err.message : String(err)));
                } finally {
                  setDecideBusy(false);
                }
              }}
            >
              {decideBusy ? "Processando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pop-up Modal de Visualização do Relatório PDF */}
      <Dialog
        open={previewVersionPdf !== null}
        onOpenChange={(open) => {
          if (!open && previewVersionPdf) {
            URL.revokeObjectURL(previewVersionPdf.url);
            setPreviewVersionPdf(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-4 sm:p-6 gap-3">
          <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b">
            <div>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {previewVersionPdf?.title}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Visualização do laudo técnico oficial em alta resolução
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 mr-6">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={() => {
                  if (!previewVersionPdf) return;
                  const a = document.createElement("a");
                  a.href = previewVersionPdf.url;
                  a.download = previewVersionPdf.title;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
              >
                <Download className="h-3.5 w-3.5" /> Baixar PDF
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 w-full h-full min-h-0 bg-muted/40 rounded-lg overflow-hidden border">
            {previewVersionPdf && (
              <iframe
                src={`${previewVersionPdf.url}#toolbar=1&navpanes=0`}
                className="w-full h-full border-0 rounded-lg"
                title="Pré-visualização do Relatório"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex h-full flex-col bg-background p-4 lg:p-6 pb-20">
        {/* Top Header com Farol e Ações */}
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FlaskConical className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">ASTM D3080:2023</Badge>
                <WorkflowFarol status={
                  (() => {
                    const rawSt = wfStatus || approvals[0]?.status || (ctx?.ensaio as any)?.status || "digitacao";
                    if (rawSt === "aguardando_verificacao" || rawSt === "pendente_verificacao" || rawSt === "digitado" || rawSt === "verificacao") return "aguardando_verificacao";
                    if (rawSt === "aguardando_aprovacao" || rawSt === "pendente_aprovacao" || rawSt === "verificado") return "aguardando_aprovacao";
                    if (rawSt === "aprovado" || rawSt === "concluido") return "aprovado";
                    if (rawSt === "rejeitado" || rawSt === "rejeitado_verificacao") return "rejeitado";
                    return "digitacao";
                  })()
                } />
                <SyncStatusBadge state="synced" />
              </div>
              <h1 className="mt-1 text-xl font-bold tracking-tight">
                {getReportTitle(sample.testCondition)}
              </h1>
              <p className="text-xs text-muted-foreground">
                Determinação dos parâmetros de resistência ao cisalhamento: Coesão (c') e Ângulo de Atrito (φ').
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end">
            {/* Botão Contextual de Fluxo */}
            {(() => {
              const rawSt = wfStatus || approvals[0]?.status || (ctx?.ensaio as any)?.status || "digitacao";
              const isAguardandoVerif = rawSt === "aguardando_verificacao" || rawSt === "pendente_verificacao" || rawSt === "digitado" || rawSt === "verificacao";
              const isAguardandoAprov = rawSt === "aguardando_aprovacao" || rawSt === "pendente_aprovacao" || rawSt === "verificado";
              const isAprovado = rawSt === "aprovado" || rawSt === "concluido";
              const rev = approvals[0]?.rev ?? 0;

              if (isAguardandoVerif) {
                if (isVerificador || isAdmin) {
                  return (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-violet-500/50 bg-violet-500/10 text-violet-800 dark:text-violet-300 font-semibold px-3 py-1.5 text-xs">
                        ✓ Em Verificação
                      </Badge>
                      <Button
                        size="sm"
                        onClick={async () => {
                          setSaveBusy(true);
                          const tid = toast.loading("Enviando para aprovação RT…");
                          try {
                            await verifyApproval({ data: { scopeId, rev, decision: "verificado" } });
                            await refreshApprovals();
                            toast.success("Enviado para aprovação RT ✓", { id: tid });
                          } catch (err) {
                            toast.error("Falha: " + (err instanceof Error ? err.message : String(err)), { id: tid });
                          } finally {
                            setSaveBusy(false);
                          }
                        }}
                        disabled={saveBusy}
                        className="gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold text-xs"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Verificar Laudo — Enviar p/ Aprovação
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSaveVersion()}
                        disabled={saveBusy}
                        className="text-xs"
                      >
                        Gerar Nova Prévia
                      </Button>
                    </div>
                  );
                }
                return (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-violet-500/50 bg-violet-500/10 text-violet-800 dark:text-violet-300 font-semibold px-3 py-1.5 text-xs">
                      ✓ Aguardando Verificação
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSaveVersion()}
                      disabled={saveBusy}
                      className="text-xs"
                    >
                      Atualizar / Gerar Nova Prévia
                    </Button>
                  </div>
                );
              }

              if (isAguardandoAprov) {
                if (isAdmin) {
                  return (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-indigo-500/50 bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 font-semibold px-3 py-1.5 text-xs">
                        ✓ Aguardando Aprovação RT
                      </Badge>
                      <Button
                        size="sm"
                        onClick={() => setDecideOpen({ rev, stage: "approve", decision: "aprovado" })}
                        className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Aprovar Laudo Oficial
                      </Button>
                    </div>
                  );
                }
                return (
                  <Badge variant="outline" className="border-indigo-500/50 bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 font-semibold px-3 py-1.5 text-xs">
                    ✓ Aguardando Aprovação RT
                  </Badge>
                );
              }

              if (isAprovado) {
                return (
                  <div className="flex items-center gap-2">
                    <Badge className="bg-emerald-600 text-white font-semibold px-3 py-1.5 text-xs">
                      ✓ Laudo Oficial Aprovado
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSaveVersion({ skipVerification: true })}
                      disabled={saveBusy}
                      className="text-xs gap-1.5"
                    >
                      <Send className="h-3.5 w-3.5" /> Gerar Nova Revisão
                    </Button>
                  </div>
                );
              }

              return (
                <Button size="sm" onClick={() => handleSaveVersion()} disabled={saveBusy} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
                  <Send className="h-4 w-4" />
                  {saveBusy ? "Enviando…" : "Terminei a digitação — Enviar para verificação"}
                </Button>
              );
            })()}

            {/* Observação da Operação (Gantt) */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setObsDialogOpen(true)}
              className="gap-1.5 border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200 hover:bg-amber-500/20 text-xs font-semibold shadow-xs"
            >
              <Eye className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              Observação da Operação
            </Button>

            {/* Parâmetros de Ajuste */}
            <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings2 className="mr-1.5 h-4 w-4" />
                  Ajustes
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Parâmetros de Ajuste do Ensaio</DialogTitle>
                  <DialogDescription>Valores comuns a todos os corpos de prova de cisalhamento.</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3 py-2">
                  <NumField
                    label="Massa sobre CP (g)"
                    value={adjust.mSobreCP}
                    step={0.01}
                    onChange={(v) => setAdjust((a: any) => ({ ...a, mSobreCP: v }))}
                  />
                  <NumField
                    label="Atrito Pistão (kgf)"
                    value={adjust.fAtritoPistao}
                    step={0.01}
                    onChange={(v) => setAdjust((a: any) => ({ ...a, fAtritoPistao: v }))}
                  />
                  <NumField
                    label="Massa Esp. Água (g/cm³)"
                    value={sample.rhoW || 1.0}
                    step={0.001}
                    onChange={(v) => updateSample("rhoW", v)}
                  />
                  <NumField
                    label="Gs (Densidade Grãos)"
                    value={sample.Gs}
                    step={0.01}
                    onChange={(v) => updateSample("Gs", v)}
                  />
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setAdjustOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={applyAdjustToAll}>Aplicar a todos os CPs</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Importar / Colar Leituras (ASTM D3080) */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
              className="border-primary/50 bg-primary/10 text-primary hover:bg-primary/20 font-semibold"
            >
              <ClipboardPaste className="mr-1.5 h-4 w-4 text-primary" /> Importar / Colar Leituras (ASTM D3080)
            </Button>

            {/* Exportar Dados Brutos (XLSX) */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportXlsx}
              className="border-emerald-600/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            >
              <FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-600" /> Exportar Dados Brutos (XLSX)
            </Button>

            {/* Visualizar Relatório */}
            <Button variant="outline" size="sm" onClick={() => setReportOpen(true)}>
              <Eye className="mr-1.5 h-4 w-4" /> Visualizar Relatório
            </Button>
          </div>
        </div>

        {/* Barra Superior: Responsáveis com herança automática (Gantt & Login) */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card/60 px-4 py-2.5 shadow-xs">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Operador Bancada (Gantt):</span>
            <Badge variant="secondary" className="font-semibold text-xs text-foreground px-2 py-0.5">
              {sample.operator || (ctx?.ensaio?.operator) || "Rodrigo"}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <FileEdit className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground font-medium">Digitado por (Login):</span>
            <Badge variant="secondary" className="font-semibold text-xs text-foreground px-2 py-0.5">
              {sample.typedBy || currentUserName}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span className="text-xs text-muted-foreground font-medium">Resp. Técnico:</span>
            <span className="text-xs font-semibold text-foreground">
              {sample.technicalResp || "Engº Maurício Malanconi - CREA: 5063078630"}
            </span>
          </div>
        </div>

        {/* Identificação da amostra (comum a todos os CPs) - retrátil */}
        {ctx ? (
          <Card className="mb-4 border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">
                    Amostra {ctx.amostra.reportNumber || "—"} · OS {ctx.os.numero}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {sample.client || ctx.os.client || "—"} · Furo {sample.borehole || ctx.amostra.borehole || "—"} · Prof. {sample.depth || ctx.amostra.depth || "—"}
                    {ctx.coords && (
                      <> · N {ctx.coords.N ?? "—"} · E {ctx.coords.E ?? "—"} · Cota {ctx.coords.cota ?? "—"}</>
                    )}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setObsDialogOpen(true)}
                    className="text-xs text-amber-700 dark:text-amber-400 hover:underline font-semibold cursor-pointer flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/30 shadow-2xs"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Observação da Operação
                  </button>
                  <button
                    type="button"
                    onClick={() => setSampleEditOpen(true)}
                    className="text-xs text-primary hover:underline font-semibold cursor-pointer flex items-center gap-1"
                  >
                    editar amostra →
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-muted-foreground">Condição do ensaio</div>
                  <div className="font-medium">
                    {sample.testCondition === "inundado" ? "CDinun — Inundado" : "CDnat — Natural"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Condição da amostra</div>
                  <div className="font-medium">
                    {sample.sampleState === "compactada"
                      ? `Compactada${sample.compactionEnergy ? ` · ${sample.compactionEnergy}` : ""}${
                          typeof sample.compactionDegreePct === "number"
                            ? ` · GC ${sample.compactionDegreePct}%`
                            : ""
                        }`
                      : sample.sampleState === "recompactada"
                        ? "Recompactada"
                        : sample.sampleState === "indeformada"
                          ? `Indeformada${sample.sampleType ? ` · ${sample.sampleType}` : ""}`
                          : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Equipamento</div>
                  <div className="font-medium">{sample.equipment || "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Geometria</div>
                  <div className="font-medium">
                    {sample.geometry === "circular"
                      ? `Circular (Ø ${sample.dimensionMm || 60} mm)`
                      : `Quadrada (${sample.dimensionMm || 60} mm)`}
                  </div>
                </div>
              </div>
              <div className="mt-3 border-t border-border/50 pt-2">
                <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  Corpos de prova ({sortedSpecimens.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sortedSpecimens.map((s) => (
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px]"
                    >
                      <span className="font-semibold">{s.displayId ?? s.id}</span>
                      <span className="text-muted-foreground">
                        · σn = {s.normalStressTarget} kPa
                      </span>
                    </span>
                  ))}
                  {sortedSpecimens.length === 0 && (
                    <span className="text-muted-foreground">Nenhum CP cadastrado.</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-4">
            <CardHeader
              className="cursor-pointer select-none pb-2"
              onClick={() => setIdOpen((v) => !v)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {idOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <CardTitle className="text-sm">Identificação da amostra</CardTitle>
                </div>
                <CardDescription className="text-xs">
                  {sample.client || "—"} · {sample.workNumber || "—"} · {sample.borehole || "—"}
                </CardDescription>
              </div>
            </CardHeader>
            {idOpen && (
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {([
                  ["client", "Cliente"], ["workNumber", "Obra"], ["reportNumber", "Amostra"],
                  ["borehole", "Furo"], ["depth", "Profundidade (m)"], ["local", "Local"],
                  ["code", "Código"], ["os", "O.S."], ["revision", "Revisão"],
                  ["technicalResp", "Responsável Técnico"],
                  ["coordN", "Coord. N (m)"], ["coordE", "Coord. E (m)"], ["coordCota", "Cota (m)"],
                ] as [keyof CDSample, string][]).map(([k, label]) => (
                  <div key={k}>
                    <Label className="text-xs">{label}</Label>
                    <Input
                      value={String(sample[k] ?? "")}
                      onChange={(e) => updateSample(k, e.target.value)}
                    />
                  </div>
                ))}
                <div className="col-span-full">
                  <Label className="text-xs">Descrição tátil-visual</Label>
                  <Input value={sample.description} onChange={(e) => updateSample("description", e.target.value)} />
                </div>
                <div className="col-span-full">
                  <Label className="text-xs">Descrição granulométrica</Label>
                  <Input value={sample.granulometricDescription ?? ""} onChange={(e) => updateSample("granulometricDescription", e.target.value)} />
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Abas Principais de Edição */}
        <Tabs value={tab} onValueChange={setTab} className="flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center gap-2">
            <TabsList className="grid flex-1 grid-cols-5">
              <TabsTrigger value="amostra"><Beaker className="mr-1.5 h-3.5 w-3.5" />Amostra</TabsTrigger>
              <TabsTrigger value="adensamento">Adensamento</TabsTrigger>
              <TabsTrigger value="cisalhamento"><Activity className="mr-1.5 h-3.5 w-3.5" />Cisalhamento</TabsTrigger>
              <TabsTrigger value="envoltoria"><BarChart3 className="mr-1.5 h-3.5 w-3.5" />Envoltória</TabsTrigger>
              <TabsTrigger value="versoes"><History className="mr-1.5 h-3.5 w-3.5" />Versões</TabsTrigger>
            </TabsList>
            <Button
              type="button"
              onClick={() => setReportOpen(true)}
              className="gap-2 shrink-0"
            >
              <FileText className="h-4 w-4" /> Gerar Relatório
            </Button>
          </div>

          <div className="flex-1 overflow-auto mt-4 pr-1">
            {/* Aba 1: Amostra */}
            <TabsContent value="amostra" className="m-0 space-y-4">
              {/* Propriedades e Condições do Ensaio */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-medium">Propriedades e Condições do Ensaio</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs">Tipo / Condição do Ensaio</Label>
                    <Select
                      value={sample.testCondition}
                      onValueChange={(v) => updateSample("testCondition", v as "inundado" | "natural")}
                    >
                      <SelectTrigger className="h-9 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inundado">Inundado — CDinun</SelectItem>
                        <SelectItem value="natural">Natural (Umidade Natural) — CDnat</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Densidade dos Grãos (Gs)</Label>
                    <Input
                      type="number"
                      step={0.01}
                      value={sample.Gs}
                      onChange={(e) => updateSample("Gs", parseFloat(e.target.value) || 0)}
                      className="h-9 text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Geometria da Caixa</Label>
                    <Select
                      value={sample.geometry || "circular"}
                      onValueChange={(v) => updateSample("geometry", v as "circular" | "quadrada")}
                    >
                      <SelectTrigger className="h-9 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="circular">Circular (Ø nominal)</SelectItem>
                        <SelectItem value="quadrada">Quadrada (Lado nominal)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Correção de Área (ASTM D3080)</Label>
                    <Select
                      value={sample.applyAreaCorrection !== false ? "sim" : "nao"}
                      onValueChange={(v) => updateSample("applyAreaCorrection", v === "sim")}
                    >
                      <SelectTrigger className="h-9 mt-1 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sim">Sim — Corrigir Área (Acor)</SelectItem>
                        <SelectItem value="nao">Não — Área Inicial Constante (A₀)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-full grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <Label className="text-xs">Equipamento Utilizado</Label>
                      <div className="mt-1">
                        <PickerWithCreate
                          kind="equipments"
                          value={sample.equipment ?? ""}
                          onChange={(v) => updateSample("equipment", v)}
                          placeholder="Selecione o equipamento…"
                          createLabel="Novo equipamento"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Dimensões Características (mm)</Label>
                      <Input
                        type="number"
                        value={sample.dimensionMm || 60}
                        onChange={(e) => updateSample("dimensionMm", parseFloat(e.target.value) || 0)}
                        placeholder="Ex.: 60 mm"
                        className="h-9 text-xs mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Condição da Amostra</Label>
                      <Select
                        value={sample.sampleState ?? "indeformada"}
                        onValueChange={(v) =>
                          updateSample("sampleState", v as "indeformada" | "compactada" | "recompactada")
                        }
                      >
                        <SelectTrigger className="h-9 text-xs mt-1">
                          <SelectValue placeholder="Selecione…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="indeformada">Indeformada</SelectItem>
                          <SelectItem value="compactada">Compactada</SelectItem>
                          <SelectItem value="recompactada">Recompactada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {sample.sampleState === "indeformada" && (
                    <div className="col-span-full sm:col-span-2">
                      <Label className="text-xs">Tipo de Amostragem</Label>
                      <Input
                        value={sample.sampleType ?? ""}
                        onChange={(e) => updateSample("sampleType", e.target.value)}
                        placeholder="Ex.: Bloco indeformado, Tubo Shelby, Denison…"
                        className="h-8 text-xs mt-1"
                      />
                    </div>
                  )}

                  {sample.sampleState === "compactada" && (
                    <div className="col-span-full grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Energia de Compactação</Label>
                        <Select
                          value={sample.compactionEnergy ?? ""}
                          onValueChange={(v) =>
                            updateSample("compactionEnergy", v as "PN" | "PI" | "PM")
                          }
                        >
                          <SelectTrigger className="h-8 text-xs mt-1">
                            <SelectValue placeholder="Selecione a energia…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PN">Proctor Normal (PN)</SelectItem>
                            <SelectItem value="PI">Proctor Intermediário (PI)</SelectItem>
                            <SelectItem value="PM">Proctor Modificado (PM)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Grau de Compactação Alvo (GC %)</Label>
                        <Input
                          type="number"
                          step={0.1}
                          value={sample.compactionDegreePct ?? ""}
                          onChange={(e) =>
                            updateSample(
                              "compactionDegreePct",
                              e.target.value ? parseFloat(e.target.value) : undefined
                            )
                          }
                          placeholder="Ex.: 95 %"
                          className="h-8 text-xs mt-1"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between py-3">
                  <div>
                    <CardTitle className="text-sm font-medium">Corpos de Prova e Ficha de Moldagem</CardTitle>
                    <CardDescription className="text-xs">
                      Cadastre os corpos de prova, dimensões e cápsulas de umidade inicial/final.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setImportOpen(true)} className="border-primary/50 bg-primary/10 text-primary hover:bg-primary/20 font-semibold">
                      <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" /> Importar / Colar Leituras (ASTM D3080)
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleImportXlsxFile}>
                      <Upload className="mr-1.5 h-3.5 w-3.5" /> Planilha Completa (XLSX)
                    </Button>
                    <Button size="sm" variant="outline" onClick={addCp}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar CP
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Resumo Fixo por CP (Idêntico ao Triaxial CID) */}
                  <CDSpecimensSummaryCard sample={sample} specimens={sortedSpecimens} results={results} />

                  <CDCpSelector
                    specimens={sortedSpecimens}
                    selectedId={selectedCpId}
                    onSelect={setSelectedCpId}
                    onRemove={removeCp}
                    canRemove={specimens.length > 1}
                  />

                  <CDMoldagemFicha
                    cp={cp}
                    res={res}
                    sample={sample}
                    onCp={(patch) => updateSpecimen(cp.id, patch)}
                    capsOpen={capsOpen}
                    onToggleCaps={() => setCapsOpen(!capsOpen)}
                    geomOpen={geomOpen}
                    onToggleGeom={() => setGeomOpen(!geomOpen)}
                    indicesOpen={indicesOpen}
                    onToggleIndices={() => setIndicesOpen(!indicesOpen)}
                    finalOpen={finalOpen}
                    onToggleFinal={() => setFinalOpen(!finalOpen)}
                    photoOpen={photoOpen}
                    onTogglePhoto={() => setPhotoOpen(!photoOpen)}
                    ctx={ctx}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Aba 2: Adensamento */}
            <TabsContent value="adensamento" className="m-0 space-y-4">
              <CDCpSelector specimens={sortedSpecimens} selectedId={selectedCpId} onSelect={setSelectedCpId} />
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm">
                          Leituras de Adensamento — {cp.displayId ?? cp.id} (σn = {fmt(cp.normalStressTarget, 0)} kPa)
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Tabela de recalque vertical em função do tempo.
                        </CardDescription>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
                        <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" /> Colar Leituras
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="max-h-[360px] overflow-auto border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Tempo (min)</TableHead>
                            <TableHead className="text-xs">√t (min½)</TableHead>
                            <TableHead className="text-xs">Recalque Δh (mm)</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(cp.consolidationData || []).map((r, i) => (
                            <TableRow key={i}>
                              <TableCell className="py-1">
                                <Input
                                  type="number"
                                  step="0.1"
                                  value={r.timeMin}
                                  onChange={(e) => {
                                    const next = [...(cp.consolidationData || [])];
                                    next[i].timeMin = parseFloat(e.target.value) || 0;
                                    updateSpecimen(cp.id, { consolidationData: next });
                                  }}
                                  className="h-7 w-24 text-xs"
                                />
                              </TableCell>
                              <TableCell className="py-1 text-xs text-muted-foreground">
                                {fmt(Math.sqrt(Math.max(0, r.timeMin)), 2)}
                              </TableCell>
                              <TableCell className="py-1">
                                <Input
                                  type="number"
                                  step="0.001"
                                  value={r.settlementMm}
                                  onChange={(e) => {
                                    const next = [...(cp.consolidationData || [])];
                                    next[i].settlementMm = parseFloat(e.target.value) || 0;
                                    updateSpecimen(cp.id, { consolidationData: next });
                                  }}
                                  className="h-7 w-24 text-xs"
                                />
                              </TableCell>
                              <TableCell className="py-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-destructive"
                                  onClick={() => {
                                    const next = (cp.consolidationData || []).filter((_, idx) => idx !== i);
                                    updateSpecimen(cp.id, { consolidationData: next });
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updateSpecimen(cp.id, {
                          consolidationData: [...(cp.consolidationData || []), { timeMin: 0, settlementMm: 0 }],
                        })
                      }
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar Ponto
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Curva de Adensamento — {cp.displayId ?? cp.id}</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[380px] p-2">
                    <CDConsolidationPage results={[res]} />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Aba 3: Cisalhamento */}
            <TabsContent value="cisalhamento" className="m-0 space-y-4">
              <CDCpSelector specimens={sortedSpecimens} selectedId={selectedCpId} onSelect={setSelectedCpId} />
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm">
                          Leituras de Cisalhamento — {cp.displayId ?? cp.id}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Tensão normal alvo: {fmt(cp.normalStressTarget, 0)} kPa
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
                          <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" /> Colar Leituras
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="max-h-[360px] overflow-auto border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Disp. H (mm)</TableHead>
                            <TableHead className="text-xs">Recalque V (mm)</TableHead>
                            <TableHead className="text-xs">Força (N)</TableHead>
                            <TableHead className="text-xs">Carga (kgf)</TableHead>
                            <TableHead className="text-xs">Área Corrigida (cm²)</TableHead>
                            <TableHead className="text-xs">τ (kPa)</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cp.shearData.map((r, i) => {
                            const calcPoint = res.curve[i];
                            const forceN = r.shearForce ?? (r.loadKgf ? r.loadKgf * 9.80665 : 0);
                            const loadKgf = r.loadKgf ?? (r.shearForce ? r.shearForce / 9.80665 : 0);
                            return (
                              <TableRow key={i}>
                                <TableCell className="py-1">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={r.horizDispMm}
                                    onChange={(e) => {
                                      const next = [...cp.shearData];
                                      next[i].horizDispMm = parseFloat(e.target.value) || 0;
                                      updateSpecimen(cp.id, { shearData: next });
                                    }}
                                    className="h-7 w-20 text-xs"
                                  />
                                </TableCell>
                                <TableCell className="py-1">
                                  <Input
                                    type="number"
                                    step="0.001"
                                    value={r.vertDispMm}
                                    onChange={(e) => {
                                      const next = [...cp.shearData];
                                      next[i].vertDispMm = parseFloat(e.target.value) || 0;
                                      updateSpecimen(cp.id, { shearData: next });
                                    }}
                                    className="h-7 w-20 text-xs"
                                  />
                                </TableCell>
                                <TableCell className="py-1">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={parseFloat(forceN.toFixed(2))}
                                    onChange={(e) => {
                                      const next = [...cp.shearData];
                                      const nVal = parseFloat(e.target.value) || 0;
                                      next[i].shearForce = nVal;
                                      next[i].loadKgf = nVal / 9.80665;
                                      updateSpecimen(cp.id, { shearData: next });
                                    }}
                                    className="h-7 w-20 text-xs font-mono"
                                  />
                                </TableCell>
                                <TableCell className="py-1 text-xs text-muted-foreground font-mono">
                                  {fmt(loadKgf, 2)}
                                </TableCell>
                                <TableCell className="py-1 text-xs text-muted-foreground">
                                  {fmt(calcPoint?.areaCorr, 2)}
                                </TableCell>
                                <TableCell className="py-1 text-xs font-semibold">
                                  {fmt(calcPoint?.shearStress, 1)}
                                </TableCell>
                                <TableCell className="py-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-destructive"
                                    onClick={() => {
                                      const next = cp.shearData.filter((_, idx) => idx !== i);
                                      updateSpecimen(cp.id, { shearData: next });
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updateSpecimen(cp.id, {
                          shearData: [...cp.shearData, { horizDispMm: 0, shearForce: 0, vertDispMm: 0 }],
                        })
                      }
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar Linha
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Curvas de Cisalhamento e Dilatância</CardTitle>
                  </CardHeader>
                  <CardContent className="h-[380px] p-2">
                    <CDShearChartsPage results={results} />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Aba 4: Envoltória */}
            <TabsContent value="envoltoria" className="m-0 space-y-4">
              <CDSummaryPage sample={sample} specimens={sortedSpecimens} results={results} envelope={envelope} />
            </TabsContent>

            {/* Aba 5: Revisões & Versões */}
            <TabsContent value="versoes" className="m-0 space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
                  <div>
                    <CardTitle className="text-sm">Revisões do Relatório</CardTitle>
                    <CardDescription className="text-xs">
                      Cada clique em <b>Salvar Versão</b> cria uma nova revisão (Rev 00, 01, 02...) armazenada localmente e
                      enviada ao <b>Google Drive da Suporte</b> (PDF · dados · fotos).
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportXlsx}
                      className="gap-1.5 border-emerald-600/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                    >
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Exportar Dados Brutos (XLSX)
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        setDriveBusy(true);
                        const tid = toast.loading("Sincronizando com o Google Drive…");
                        try {
                          await refreshDriveStatus();
                          toast.success("Status atualizado ✓", { id: tid });
                        } catch (err) {
                          toast.error("Erro: " + (err as Error).message, { id: tid });
                        } finally {
                          setDriveBusy(false);
                        }
                      }}
                      disabled={driveBusy}
                      className="gap-1.5"
                    >
                      <RefreshCw className={cn("h-4 w-4", driveBusy && "animate-spin")} />
                      Sincronizar com Drive
                    </Button>
                    <Button size="sm" onClick={() => setReportOpen(true)} className="gap-1.5">
                      <FileText className="h-4 w-4" /> Abrir Relatório
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {versions.length === 0 ? (
                    <div className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      Nenhuma revisão salva ainda. Abra o relatório e clique em <b>Salvar Versão</b>.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Prévia / Revisão</TableHead>
                          <TableHead>Data / Hora</TableHead>
                          <TableHead>Arquivo</TableHead>
                          <TableHead className="text-right">Tamanho</TableHead>
                          <TableHead className="w-28 text-center">Drive</TableHead>
                          <TableHead className="w-56 text-center">Aprovação</TableHead>
                          <TableHead className="w-56 text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {versions.map((v) => {
                          const appr = approvals.find((a) => a.rev === v.rev) ?? null;
                          const isApproved = appr?.status === "aprovado";
                          const label = isApproved
                            ? `Rev ${String(v.rev).padStart(2, "0")}`
                            : `Prévia ${String(v.rev).padStart(2, "0")}`;
                          return (
                            <TableRow key={v.id}>
                              <TableCell className="font-semibold">{label}</TableCell>
                              <TableCell className="text-xs">
                                {new Intl.DateTimeFormat("pt-BR", {
                                  timeZone: "America/Sao_Paulo",
                                  dateStyle: "short",
                                  timeStyle: "medium",
                                }).format(new Date(v.createdAt))}
                              </TableCell>
                              <TableCell className="text-xs font-mono">{v.filename}</TableCell>
                              <TableCell className="text-right text-xs">{(v.size / 1024).toFixed(0)} KB</TableCell>
                              <TableCell className="text-center">
                                {(() => {
                                  const entry = driveStatus?.entries.find(
                                    (e: any) => e.rev === v.rev && e.kind === "pdf",
                                  );
                                  if (!entry)
                                    return (
                                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                        <Cloud className="h-3 w-3" /> —
                                      </span>
                                    );
                                  if (entry.status === "ok")
                                    return (
                                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600">
                                        <CheckCircle2 className="h-3 w-3" /> ok
                                      </span>
                                    );
                                  return (
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] text-destructive"
                                      title={entry.error ?? ""}
                                    >
                                      <AlertTriangle className="h-3 w-3" /> erro
                                    </span>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  variant={
                                    appr?.status === "aprovado"
                                      ? "default"
                                      : appr?.status?.includes("rejeitado")
                                        ? "destructive"
                                        : "secondary"
                                  }
                                >
                                  {appr?.status ?? "digitacao"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1 text-xs text-emerald-700 dark:text-emerald-400"
                                    onClick={() => handleExportXlsx()}
                                    title="Exportar Dados Brutos (XLSX)"
                                  >
                                    <FileSpreadsheet className="h-3 w-3 text-emerald-600" /> XLSX
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1 text-xs"
                                    onClick={() => {
                                      const url = URL.createObjectURL(v.pdfBlob);
                                      setPreviewVersionPdf({ url, title: v.filename });
                                    }}
                                    title="Visualizar PDF em Pop-up"
                                  >
                                    <Eye className="h-3 w-3" /> Visualizar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    className="gap-1 text-xs"
                                    onClick={() => downloadVersion(v)}
                                    title="Baixar PDF"
                                  >
                                    <Download className="h-3 w-3" /> Baixar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-destructive"
                                    onClick={() => {
                                      if (confirm("Excluir esta revisão?")) deleteVersion(v.id).then(refreshVersions);
                                    }}
                                    title="Excluir"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>

        {/* Rodapé Fixo Inferior — Resultados Finais (Idêntico ao Triaxial CID) */}
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-card/95 px-6 py-2.5 backdrop-blur shadow-lg">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-foreground">Resultados finais</div>
              <div className="text-[11px] text-muted-foreground">
                Envoltória efetiva ajustada pelo conjunto de CPs (Mohr-Coulomb)
              </div>
            </div>
            <div className="flex items-center gap-8">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">φ' (EFETIVO)</div>
                <div className="text-sm font-bold text-foreground">
                  {envelope ? `${fmt(envelope.phiDeg, 2)}°` : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">c' (EFETIVO)</div>
                <div className="text-sm font-bold text-foreground">
                  {envelope ? `${fmt(envelope.c, 2)} kPa` : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">R² (AJUSTE)</div>
                <div className="text-sm font-bold text-foreground">
                  {envelope ? fmt(envelope.r2, 3) : "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Nº CPS</div>
                <div className="text-sm font-bold text-foreground">{sortedSpecimens.length}</div>
              </div>
            </div>
          </div>
        </div>

        {/* RELATÓRIO — cópia sempre montada para rasterização offscreen / impressão */}
        <div
          ref={reportRef}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "210mm",
            background: "#ffffff",
            pointerEvents: "none",
            zIndex: -9999,
            opacity: 0,
          }}
          className="print-only-report mx-auto flex flex-col items-center gap-4"
        >
          <CDReportPage1 sample={sample} specimens={sortedSpecimens} totalPages={totalPages} />
          <CDReportPage2 sample={sample} specimens={sortedSpecimens} results={results} totalPages={totalPages} />
          <CDReportPage3 sample={sample} specimens={sortedSpecimens} results={results} totalPages={totalPages} axisCfg={axisCfg} />
          <CDReportPage4 sample={sample} specimens={sortedSpecimens} results={results} envelope={envelope} totalPages={totalPages} axisCfg={axisCfg} />
          {Array.from({ length: photoPagesCount }).map((_, pIdx) => (
            <CDReportPage5
              key={pIdx}
              sample={sample}
              specimens={sortedSpecimens}
              photos={ctx?.photos || []}
              pageIndex={pIdx}
              totalPages={totalPages}
            />
          ))}
          <CDReportPage6 sample={sample} totalPages={totalPages} />
        </div>
        <style>{`
          @media print {
            .print-only-report {
              position: static !important;
              left: auto !important;
              top: auto !important;
              opacity: 1 !important;
              z-index: 1 !important;
              pointer-events: auto !important;
            }
            .print-only-report > div { page-break-after: always; break-after: page; margin: 0 !important; }
            .print-only-report > div:last-child { page-break-after: auto; break-after: auto; }
            .printable-report { box-shadow: none !important; }
          }
        `}</style>

        {/* Modal de Pré-visualização do Relatório Completo com Ajuste de Eixos */}
        <Dialog open={reportOpen} onOpenChange={setReportOpen}>
          <DialogContent className="max-w-[96vw] w-[96vw] h-[95vh] flex flex-col p-0 overflow-hidden">
            {/* Cabeçalho com Controles de Zoom */}
            <div className="flex flex-wrap items-center justify-between px-6 py-3 border-b bg-card gap-2">
              <div>
                <DialogTitle className="text-base font-bold text-foreground">
                  {getReportTitle(sample.testCondition)} — Pré-visualização ({totalPages} Páginas)
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  A4 · Use o painel lateral para ajustar as escalas e limites dos eixos em tempo real.
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2 bg-muted/60 rounded-md p-1 border">
                <span className="text-[11px] font-medium text-muted-foreground px-1.5">Zoom da pré-visualização:</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setZoom((z) => Math.max(40, z - 10))}
                  title="Diminuir Zoom"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs font-semibold px-1.5 min-w-[36px] text-center">{zoom}%</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setZoom((z) => Math.min(150, z + 10))}
                  title="Aumentar Zoom"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setZoom(85)}
                  title="Ajustar Padrão (85%)"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Conteúdo: Relatório + Painel Lateral de Ajuste de Eixos */}
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
              {/* Lado Esquerdo: Visualizador de Páginas */}
              <div className="flex-1 min-w-0 h-full overflow-auto bg-[#525659] p-8 flex justify-center">
                <div
                  style={{
                    transform: `scale(${zoom / 100})`,
                    transformOrigin: "top center",
                    transition: "transform 0.12s ease-out",
                  }}
                  className="flex flex-col items-center gap-8 shrink-0 pb-12"
                >
                  {/* Página 1 */}
                  <div className="w-[210mm] h-[297mm] shadow-2xl bg-white shrink-0 overflow-hidden">
                    <CDReportPage1 sample={sample} specimens={sortedSpecimens} totalPages={totalPages} />
                  </div>

                  {/* Página 2 */}
                  <div className="w-[210mm] h-[297mm] shadow-2xl bg-white shrink-0 overflow-hidden">
                    <CDReportPage2 sample={sample} specimens={sortedSpecimens} results={results} totalPages={totalPages} />
                  </div>

                  {/* Página 3 */}
                  <div className="w-[210mm] h-[297mm] shadow-2xl bg-white shrink-0 overflow-hidden">
                    <CDReportPage3 sample={sample} specimens={sortedSpecimens} results={results} totalPages={totalPages} axisCfg={axisCfg} />
                  </div>

                  {/* Página 4 */}
                  <div className="w-[210mm] h-[297mm] shadow-2xl bg-white shrink-0 overflow-hidden">
                    <CDReportPage4 sample={sample} specimens={sortedSpecimens} results={results} envelope={envelope} totalPages={totalPages} axisCfg={axisCfg} />
                  </div>

                  {/* Páginas de Fotos (Página 5 em diante) */}
                  {Array.from({ length: photoPagesCount }).map((_, pIdx) => (
                    <div key={pIdx} className="w-[210mm] h-[297mm] shadow-2xl bg-white shrink-0 overflow-hidden">
                      <CDReportPage5
                        sample={sample}
                        specimens={sortedSpecimens}
                        photos={ctx?.photos || []}
                        pageIndex={pIdx}
                        totalPages={totalPages}
                      />
                    </div>
                  ))}

                  {/* Página Final: Fórmulas */}
                  <div className="w-[210mm] h-[297mm] shadow-2xl bg-white shrink-0 overflow-hidden">
                    <CDReportPage6 sample={sample} totalPages={totalPages} />
                  </div>
                </div>
              </div>

              {/* Lado Direito: Painel de Ajuste de Eixos dos Gráficos */}
              <aside className="w-full lg:w-[380px] shrink-0 h-full overflow-y-auto border-l bg-card flex flex-col shadow-sm">
                <div className="border-b p-4 bg-muted/20">
                  <div className="text-sm font-semibold text-primary">Ajuste de Eixos dos Gráficos</div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Define os limites de cada eixo. Aplicado a todos os gráficos do relatório e da análise.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-3 w-full font-medium"
                    onClick={() => setAxisCfg(suggestedAxisCfg)}
                  >
                    Aplicar valores sugeridos pelos dados
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-1 w-full text-xs text-muted-foreground"
                    onClick={() =>
                      setAxisCfg({
                        ehMax: 0,
                        tauMax: 0,
                        vertDispMin: 0,
                        vertDispMax: 0,
                        sigmaNMax: 0,
                        tauEnvelopeMax: 0,
                        sqrtTMax: 0,
                        adensDispMax: 0,
                      })
                    }
                  >
                    Restaurar automático
                  </Button>
                  <p className="mt-1 text-[10px] text-muted-foreground text-center">
                    Calcula automaticamente os limites ideais a partir dos resultados do ensaio.
                  </p>
                </div>

                <div className="grid gap-3 p-4">
                  <AxisGroup title="Deformação Horizontal (εh [%])">
                    <AxisField label="máximo" step="1" value={axisCfg.ehMax} onChange={(v) => updateAxis("ehMax", v)} />
                  </AxisGroup>

                  <AxisGroup title="Tensão Cisalhante — Curvas (τ [kPa])">
                    <AxisField label="máximo" step="10" value={axisCfg.tauMax} onChange={(v) => updateAxis("tauMax", v)} />
                  </AxisGroup>

                  <AxisGroup title="Deformação Vertical (εv [%])">
                    <AxisField label="mínimo (expansão)" step="0.5" value={axisCfg.vertDispMin} onChange={(v) => updateAxis("vertDispMin", v)} />
                    <AxisField label="máximo (contração)" step="0.5" value={axisCfg.vertDispMax} onChange={(v) => updateAxis("vertDispMax", v)} />
                  </AxisGroup>

                  <AxisGroup title="Tensão Normal Efetiva — Envoltória (σ'n [kPa])">
                    <AxisField label="máximo" step="25" value={axisCfg.sigmaNMax} onChange={(v) => updateAxis("sigmaNMax", v)} />
                  </AxisGroup>

                  <AxisGroup title="Tensão Cisalhante — Envoltória (τ [kPa])">
                    <AxisField label="máximo" step="25" value={axisCfg.tauEnvelopeMax} onChange={(v) => updateAxis("tauEnvelopeMax", v)} />
                  </AxisGroup>

                  <AxisGroup title="Adensamento (√t [min^0,5])">
                    <AxisField label="máximo" step="0.5" value={axisCfg.sqrtTMax} onChange={(v) => updateAxis("sqrtTMax", v)} />
                  </AxisGroup>

                  <AxisGroup title="Adensamento Recalque (Δh [mm])">
                    <AxisField label="máximo" step="0.1" value={axisCfg.adensDispMax} onChange={(v) => updateAxis("adensDispMax", v)} />
                  </AxisGroup>
                </div>
              </aside>
            </div>

            <DialogFooter className="px-6 py-3 border-t bg-background flex flex-wrap items-center justify-between gap-2">
              <Button variant="outline" onClick={() => setReportOpen(false)}>
                Fechar
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleExportXlsx}
                  className="gap-1.5 border-emerald-600/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                >
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Exportar Dados Brutos (XLSX)
                </Button>
                <Button variant="secondary" onClick={handleGeneratePdf} disabled={pdfBusy}>
                  <Download className="mr-2 h-4 w-4" /> {pdfBusy ? "Gerando PDF…" : "Baixar PDF"}
                </Button>
                <Button onClick={() => handleSaveVersion()} disabled={saveBusy}>
                  <Send className="mr-2 h-4 w-4" /> {saveBusy ? "Salvando…" : "Salvar Versão / Enviar"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal Completo de Edição da Amostra */}
              {/* Modal de Observações e Instruções Operacionais do Gantt */}
      <Dialog open={obsDialogOpen} onOpenChange={setObsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <Eye className="h-5 w-5 text-amber-600" />
              Observações da Operação & Instruções do Gantt
            </DialogTitle>
            <DialogDescription className="text-xs">
              Instruções técnicas, tensões normais programadas e notas operacionais vinculadas a esta amostra.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-muted/40 rounded-lg border border-border/60 text-xs">
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">OS / Obra</span>
                <span className="font-semibold text-foreground">{sample.os || ctx?.os?.numero || "OS-MODELO"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Amostra / Furo</span>
                <span className="font-semibold text-foreground">{sample.reportNumber || ctx?.amostra?.reportNumber || "AM-MODELO"} · {sample.borehole || ctx?.amostra?.borehole || "SH-01"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Técnico Bancada</span>
                <span className="font-semibold text-foreground">{sample.operator || ctx?.ensaio?.operator || "Laboratorista Bancada"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Equipamento</span>
                <span className="font-semibold text-foreground">{sample.equipment || "Prensa Cisalhamento Direto"}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                <MessageSquareQuote className="h-4 w-4 text-amber-600" />
                Instruções Técnicas da Programação (Gantt)
              </label>
              <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-foreground font-medium leading-relaxed">
                {(ctx?.ensaio as any)?.observacoes || (ctx?.amostra as any)?.observacoes || sample.observations || "Nenhuma observação cadastrada na programação."}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground">
                Critérios Operacionais & Detalhes da Amostra
              </label>
              <div className="p-3 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground leading-relaxed">
                {sample.description || "Amostra indeformada talhada em anéis normalizados. Realizar saturação prévia dos CPs antes do adensamento inicial."}
              </div>
            </div>
          </div>

          <DialogFooter className="flex justify-between sm:justify-end gap-2">
            <Button variant="default" size="sm" onClick={() => setObsDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SampleEditDialog
          open={sampleEditOpen}
          onOpenChange={setSampleEditOpen}
          data={{
            osId: ctx?.os?.id,
            amostraId: ctx?.amostra?.id,
            osNumero: sample.os,
            client: sample.client,
            workNumber: sample.workNumber,
            local: sample.local,
            technicalResp: sample.technicalResp,
            revision: String(sample.revision ?? "0"),
            reportNumber: sample.reportNumber,
            code: sample.code,
            borehole: sample.borehole,
            depth: sample.depth,
            coordN: sample.coordN,
            coordE: sample.coordE,
            coordCota: sample.coordCota,
            datum: (sample as any).datum || "SIRGAS 2000",
            sampleType: sample.sampleType,
            sampleState: sample.sampleState,
            description: sample.description,
            granulometricDescription: sample.granulometricDescription,
            equipment: sample.equipment,
          }}
          onSave={(updated) => {
            setSample((prev) => ({
              ...prev,
              ...updated,
              client: updated.client || prev.client,
              workNumber: updated.workNumber || prev.workNumber,
              local: updated.local || prev.local,
              technicalResp: updated.technicalResp || prev.technicalResp,
              reportNumber: updated.reportNumber || prev.reportNumber,
              code: updated.code || prev.code,
              borehole: updated.borehole || prev.borehole,
              depth: updated.depth || prev.depth,
              description: updated.description || prev.description,
              granulometricDescription: updated.granulometricDescription || prev.granulometricDescription,
              sampleType: updated.sampleType || prev.sampleType,
              sampleState: (updated.sampleState as any) || prev.sampleState,
              equipment: updated.equipment || prev.equipment,
            }));
          }}
        />
      </div>
    </>
  );
}

function AxisGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
      <div className="mb-2 text-xs font-semibold text-foreground">{title}</div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function AxisField({
  label,
  value,
  onChange,
  step = "any",
}: {
  label: string;
  value?: number;
  onChange: (v: number) => void;
  step?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <Input
        className="h-8 text-xs bg-background"
        type="number"
        step={step}
        value={value === 0 || value == null ? "" : value}
        placeholder="Auto"
        onChange={(e) => onChange(e.target.value === "" ? 0 : parseFloat(e.target.value) || 0)}
      />
    </label>
  );
}
