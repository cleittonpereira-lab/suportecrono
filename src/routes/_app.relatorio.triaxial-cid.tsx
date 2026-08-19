import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useCadastroByOs } from "@/hooks/use-cadastro-by-os";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  Label as RLabel,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Download, FileText, Beaker, Activity, BarChart3, FlaskConical, Settings2, Plus, X, Ruler, User, FileEdit, ShieldCheck } from "lucide-react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { ReportPage, type ReportNorm } from "@/components/report/ReportShell";
import { SampleEditDialog } from "@/components/SampleEditDialog";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import {
  listVersions,
  saveVersion,
  nextRev,
  deleteVersion,
  downloadVersion,
  viewVersion,
  type ReportVersion,
} from "@/features/triaxial-cid/report-versions";
import { useEffect } from "react";
import { History, Trash2, Eye } from "lucide-react";
import { Cloud, CloudCheck, CloudAlert, ExternalLink, RefreshCw } from "lucide-react";
import { PickerWithCreate } from "@/features/triaxial-cid/PickerWithCreate";
import { useAuth } from "@/hooks/use-auth";
import { syncRevision, fetchDriveStatus } from "@/features/triaxial-cid/driveSync";
import { getWorkflowStatuses } from "@/lib/driveSync.functions";
import {
  listApprovals,
  requestApproval,
  verifyApproval,
  decideApproval,
  type ApprovalRow,
} from "@/lib/approvals.functions";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2,
  MessageSquareQuote, XCircle, Clock, Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { PhotoUploader } from "@/features/lab/components/PhotoUploader";
import { WorkflowFarol } from "@/features/lab/components/WorkflowFarol";
import { useOptionalLabEnsaio } from "@/features/lab/context";
import { labStore } from "@/features/lab/store";
import { CP_COLORS, BRAND, ACCENT, B_TARGET } from "@/features/triaxial-cid/constants";
import type {
  ShearReading,
  TriaxialSample,
  TriaxialSpecimen,
  SpecimenResults,
} from "@/features/triaxial-cid/types";
import { SEED_SAMPLE, EMPTY_SPECIMENS } from "@/features/triaxial-cid/seed";
import { loadDraft, saveDraft, fetchRemoteTriaxialDraft } from "@/features/triaxial-cid/draftStore";
import {
  fitEnvelope,
  mohrCirclePoints,
  processSpecimen,
} from "@/features/triaxial-cid/domain/calc";

const NORMS: ReportNorm[] = [
  { text: "ASTM D7181-20 — Consolidated Drained Triaxial Compression Test for Soils" },
  { text: "ISO 17892-9:2018 — Consolidated triaxial compression tests on water-saturated soils", italic: true },
];

const reportTitleFor = (condition: "saturado" | "natural") =>
  condition === "saturado"
    ? "ENSAIO TRIAXIAL ADENSADO DRENADO SATURADO (CIDsat)"
    : "ENSAIO TRIAXIAL ADENSADO DRENADO NATURAL (CIDnat)";

type AxisCfg = {
  eaMax: number; qMax: number; sigmaDMax: number;
  evMin: number; evMax: number;
  pMax: number;
  sigmaMax: number; tauMax: number;
  sqrtTMax: number; dvMax: number;
  /** ΔV (cm³) do cisalhamento — sinal (+) reduz volume. */
  dvShearMin: number; dvShearMax: number;
  /** Módulo de Deformabilidade E [MPa] vs εa. */
  eModMax: number;
  /** Razão σ'1/σ'3 vs εa. */
  ratioMax: number;
};

/** Retorna domínio recharts: 0 no cfg = "auto". */
const axisDomain = (
  min: number | "auto",
  max: number | "auto",
): [number | "auto" | "dataMin" | "dataMax", number | "auto" | "dataMin" | "dataMax"] => [
  min === "auto" || min === 0 ? "auto" : min,
  max === "auto" || max === 0 ? "auto" : max,
];

/**
 * Gera ticks "bonitos" (passos 1/2/2.5/5 × 10^k) dentro de [min, max], preferindo
 * valores inteiros. Se o passo natural for < 1, ainda arredonda para 1 casa
 * decimal. Mantém o intervalo original — só emite ticks que caibam em [min,max].
 */
const niceStep = (range: number, count: number): number => {
  const raw = range / Math.max(1, count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const s = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  return s * mag;
};
const equalTicks = (
  min: number | "auto" | undefined,
  max: number | "auto" | undefined,
  count = 6,
): number[] | undefined => {
  if (min === "auto" || max === "auto" || min == null || max == null) return undefined;
  const a = Number(min), b = Number(max);
  if (!isFinite(a) || !isFinite(b) || b <= a) return undefined;
  const step = niceStep(b - a, count);
  const decimals = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)));
  const round = (v: number) => {
    const f = Math.pow(10, decimals);
    return Math.round(v * f) / f;
  };
  const start = Math.ceil(a / step - 1e-9) * step;
  const end = Math.floor(b / step + 1e-9) * step;
  const out: number[] = [];
  for (let v = start; v <= end + 1e-9; v += step) out.push(round(v));
  // Garante que os extremos apareçam quando "encaixam" na malha.
  if (out[0] !== round(a) && Math.abs(a - Math.round(a / step) * step) < 1e-9) out.unshift(round(a));
  return out.length ? out : undefined;
};

export const Route = createFileRoute("/_app/relatorio/triaxial-cid")({
  component: TriaxialCidListRoute,
  head: () => ({
    meta: [
      { title: "Triaxial CID — Suporte Infra" },
      {
        name: "description",
        content:
          "Processamento e relatório do ensaio triaxial adensado drenado: saturação (B), adensamento isotrópico, cisalhamento e envoltória de Mohr-Coulomb (φ', c').",
      },
    ],
  }),
});

import { EnsaioListByType } from "@/features/lab/components/EnsaioListByType";
function TriaxialCidListRoute() {
  return <EnsaioListByType tipo="triaxial-cid" />;
}

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listRows } from "@/lib/programacao.functions";
import { parseGanttSampleData } from "@/lib/sample-parser";

export function TriaxialCidPage() {
  const ctx = useOptionalLabEnsaio();
  const { lookup } = useCadastroByOs();
  const cad = ctx?.os?.numero ? lookup(ctx.os.numero) : undefined;
  const { displayName, user, profile } = useAuth();
  const currentUserName = displayName || profile?.nome || user?.email?.split("@")[0] || "Cleitton Pereira";
  const navigate = useNavigate();

  const rows0Fn = useServerFn(listRows);
  const { data: amostrasProg = [] } = useQuery({
    queryKey: ["tri-gantt-amostras"],
    queryFn: async () => rows0Fn({ data: { sheet: "Amostras" } }),
    staleTime: 60_000,
  });
  const { data: progsGantt = [] } = useQuery({
    queryKey: ["tri-gantt-progs"],
    queryFn: async () => rows0Fn({ data: { sheet: "Programações" } }),
    staleTime: 60_000,
  });
  const { data: equipsGantt = [] } = useQuery({
    queryKey: ["tri-gantt-equips"],
    queryFn: async () => rows0Fn({ data: { sheet: "Equipamentos" } }),
    staleTime: 60_000,
  });

  const scopeId =
    ctx && ctx.os && ctx.amostra && ctx.ensaio
      ? `os/${ctx.os.id}/amostra/${ctx.amostra.id}/ensaio/${ctx.ensaio.id}`
      : (ctx?.ensaio?.id ?? "local");
  // Rascunho persistido em localStorage (por escopo), carregado uma única vez no mount.
  const draftRef = useRef<ReturnType<typeof loadDraft>>(null);
  if (draftRef.current === null) {
    draftRef.current = loadDraft(scopeId);
  }
  // Preferir payload salvo no Ensaio (sincronizado com Google Drive via labStore)
  // sobre o rascunho local — assim, alterações feitas em um computador aparecem
  // em outro. O localStorage fica como fallback offline.
  const payloadDraft = (ctx?.ensaio?.payload ?? undefined) as
    | Partial<import("@/features/triaxial-cid/draftStore").TriaxialDraft>
    | undefined;
  const draft = payloadDraft ?? draftRef.current ?? undefined;
  const initialSample: TriaxialSample = ctx
    ? {
        client: ctx.os.client || cad?.tomador || "",
        workNumber: ctx.os.workNumber || cad?.obra || "",
        local: ctx.os.local || cad?.local || "",
        operator: draft?.sample?.operator || ctx.ensaio.operator || ctx.os.operator || currentUserName,
        technicalResp: ctx.os.technicalResp || "Engº Maurício Malanconi - CREA: 5063078630",
        revision: ctx.os.revision || "0",
        os: ctx.os.numero || "",
        reportNumber: ctx.amostra.reportNumber || "",
        borehole: ctx.amostra.borehole || "",
        depth: ctx.amostra.depth || "",
        description: ctx.amostra.description || "",
        code: ctx.amostra.code || "",
        granulometricDescription: ctx.amostra.granulometricDescription || "",
        date: new Date().toISOString().split("T")[0],
        typedBy: draft?.sample?.typedBy || ctx.ensaio.operator || currentUserName,
        condition: "saturado",
        sampleType: "Bloco Indeformado",
        equipment: (ctx.ensaio.payload as any)?.sample?.equipment || "Triaxial CID",
        specDimensions: "38x76 mm",
        filterPaperResistance: 0,
        labManager: "Engº Cleitton Pereira",
        saturationConditionText: "Saturação por Percolação e Contra-pressão",
        Gs: 2.70,
        rhoW: 1.0,
        wL: 0,
        wP: 0,
        applyMembrane: false,
        membraneE: 1400,
        membraneT: 0.3,
      }
    : { ...SEED_SAMPLE, typedBy: currentUserName, operator: currentUserName };
  const [sample, setSample] = useState<TriaxialSample>(
    () => (draft?.sample ? { ...initialSample, ...draft.sample } : initialSample),
  );

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
        if (typeFound && !next.sampleType) {
          next.sampleType = typeFound;
          changed = true;
        }
        if ((!next.equipment || next.equipment === "Triaxial CID") && equipFound) {
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
  const [specimens, setSpecimens] = useState<TriaxialSpecimen[]>(
    () => (draft?.specimens && draft.specimens.length > 0 ? draft.specimens : EMPTY_SPECIMENS),
  );
  const [selectedCpId, setSelectedCpId] = useState<string>(
    () => draft?.selectedCpId ?? EMPTY_SPECIMENS[0].id,
  );
  const [tab, setTab] = useState(() => draft?.tab ?? "amostra");
  const reportRef = useRef<HTMLDivElement>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [obsDialogOpen, setObsDialogOpen] = useState(false);
  const [idOpen, setIdOpen] = useState(true);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [capsOpen, setCapsOpen] = useState(true);
  const [geomOpen, setGeomOpen] = useState(true);
  const [indicesOpen, setIndicesOpen] = useState(false);
  const [finalOpen, setFinalOpen] = useState(true);
  const [axisPanelOpen, setAxisPanelOpen] = useState(true);
  const [sampleEditOpen, setSampleEditOpen] = useState(false);

  // Diálogo de confirmação bonito (substitui window.confirm)
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

  // Diálogo de seleção de NT quando o arquivo XLSX contém mais de um ensaio.
  const [ntPickerState, setNtPickerState] = useState<{
    open: boolean;
    filename: string;
    tests: import("@/features/triaxial-cid/importXlsx").OwnTecTestSummary[];
    onPick?: (nt: string) => void;
  }>({ open: false, filename: "", tests: [] });

  // ===== Ajuste de Eixos dos gráficos (aplicado ao relatório) =====
  const [axisCfg, setAxisCfg] = useState<AxisCfg>(() => ({
    eaMax: 0, qMax: 0, sigmaDMax: 0,
    evMin: 0, evMax: 0,
    pMax: 0,
    sigmaMax: 0, tauMax: 0,
    sqrtTMax: 0, dvMax: 0,
    dvShearMin: 0, dvShearMax: 0,
    eModMax: 0, ratioMax: 0,
    ...(draft?.axisCfg ?? {}),
  }));
  const updateAxis = <K extends keyof AxisCfg>(k: K, v: number) =>
    setAxisCfg((s) => ({ ...s, [k]: v }));
  // Parâmetros de ajuste comuns a todos os CPs (assembly de ensaio)
  const firstCp = specimens[0];
  const [adjust, setAdjust] = useState(() => draft?.adjust ?? {
    mSobreCP: firstCp.mSobreCP ?? 0,
    espMembrana: firstCp.espMembrana ?? 0,
    aPistao: firstCp.aPistao ?? 0,
    hTopcap: firstCp.hTopcap ?? 0,
    fAtritoPistao: firstCp.fAtritoPistao ?? 0,
  });
  const applyAdjustToAll = () => {
    setSpecimens((sp) => sp.map((c) => ({ ...c, ...adjust })));
    setAdjustOpen(false);
    toast.success("Parâmetros aplicados a todos os CPs");
  };

  // CPs organizados por σ3' crescente (visualização/relatório).
  // Ordenação por σ3' crescente; em caso de empate, o CP cadastrado por último recebe
  // o prefixo "R" no rótulo exibido (ex.: CP4 → R4) — representando a repetição.
  const sortedSpecimens = useMemo(() => {
    const sorted = [...specimens].sort(
      (a, b) => (a.sigma3Target ?? 0) - (b.sigma3Target ?? 0),
    );
    const groupSeen: Record<string, number> = {};
    // Reetiqueta sequencialmente após ordenar/remover: CP1, CP2, CP3...
    // Em caso de σ3' repetido, a ocorrência subsequente vira "R{n}".
    let seq = 0;
    return sorted.map((cp) => {
      const key = String(cp.sigma3Target ?? 0);
      const order = (groupSeen[key] = (groupSeen[key] ?? 0) + 1);
      seq += 1;
      const displayId = order > 1 ? `R${seq}` : `CP${seq}`;
      return { ...cp, displayId };
    });
  }, [specimens]);
  const results = useMemo(
    () => sortedSpecimens.map((cp) => processSpecimen(cp, sample)),
    [sortedSpecimens, sample],
  );
  const selIdx = Math.max(
    0,
    sortedSpecimens.findIndex((s) => s.id === selectedCpId),
  );

  const envelopePts = useMemo(
    () =>
      results
        .map((r, i) =>
          r.failure
            ? { pPrime: r.failure.pPrime, q: r.failure.q, cp: sortedSpecimens[i].id }
            : null,
        )
        .filter((x): x is { pPrime: number; q: number; cp: string } => x != null),
    [results, sortedSpecimens],
  );

  const envelope = useMemo(() => fitEnvelope(envelopePts), [envelopePts]);

  const updateSample = (k: keyof TriaxialSample, v: string | number | boolean) =>
    setSample((s) => ({ ...s, [k]: v as never }));
  const updateSpecimen = (id: string, patch: Partial<TriaxialSpecimen>) =>
    setSpecimens((sp) => sp.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const updateShearRow = (id: string, rowIdx: number, patch: Partial<ShearReading>) =>
    setSpecimens((sp) =>
      sp.map((c) =>
        c.id === id
          ? { ...c, shear: c.shear.map((r, ri) => (ri === rowIdx ? { ...r, ...patch } : r)) }
          : c,
      ),
    );
  const nextCpId = () => {
    for (let i = 1; i <= specimens.length + 1; i++) {
      const id = `CP${i}`;
      if (!specimens.some((s) => s.id === id)) return id;
    }
    return `CP${specimens.length + 1}`;
  };
  const addCp = () => {
    const id = nextCpId();
    const novo: TriaxialSpecimen = {
      id,
      color: CP_COLORS[specimens.length % CP_COLORS.length],
      D0: 0,
      H0: 0,
      wetMass: 0,
      dryMass: 0,
      w0Pct: 0,
      capsules: [
        { tipo: "", numero: "", tara: 0, wet: 0, dry: 0 },
        { tipo: "", numero: "", tara: 0, wet: 0, dry: 0 },
        { tipo: "", numero: "", tara: 0, wet: 0, dry: 0 },
      ],
      finalCapsules: [
        { tipo: "", numero: "", tara: 0, wet: 0, dry: 0 },
        { tipo: "", numero: "", tara: 0, wet: 0, dry: 0 },
        { tipo: "", numero: "", tara: 0, wet: 0, dry: 0 },
      ],
      mSobreCP: 0,
      aPistao: 0,
      hTopcap: 0,
      fAtritoPistao: 0,
      espMembrana: 0,
      sigma3Target: 0,
      backPressure: 0,
      saturationMethod: "contra-pressao",
      lateralDrains: "",
      consolidationDrainage: "",
      strainRate: 0,
      saturation: [],
      consolidation: [],
      shear: [],
      failureCriterion: "max_q",
    };
    setSpecimens((s) => [...s, novo]);
    setSelectedCpId(id);
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
      description: `Todos os dados deste CP (moldagem, saturação, adensamento, cisalhamento e dados brutos importados) serão apagados e NÃO poderão ser recuperados.`,
      confirmLabel: "Apagar",
      destructive: true,
      onConfirm: () => {
        setSpecimens((sp) => sp.filter((c) => c.id !== id));
        if (selectedCpId === id) {
          const remaining = specimens.filter((c) => c.id !== id);
          setSelectedCpId(remaining[0]?.id ?? "");
        }
        toast.success(`${label} removido.`);
      },
    });
  };

  const handlePrint = () => {
    setTimeout(() => {
      window.print();
    }, 50);
  };

  const [reportOpen, setReportOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [versions, setVersions] = useState<ReportVersion[]>([]);
  const [saveBusy, setSaveBusy] = useState(false);
  const [driveStatus, setDriveStatus] = useState<Awaited<ReturnType<typeof fetchDriveStatus>> | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [wfStatus, setWfStatus] = useState<string>("digitacao");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVerificador, setIsVerificador] = useState(false);
  const [decideOpen, setDecideOpen] = useState<null | {
    rev: number;
    stage: "verify" | "approve";
    decision: "verificado" | "rejeitado_verificacao" | "aprovado" | "rejeitado";
  }>(null);
  const [decideComment, setDecideComment] = useState("");
  const [decideBusy, setDecideBusy] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<{ url: string; filename: string; rev: number } | null>(null);

  const openPreviewVersion = (v: ReportVersion) => {
    if (previewVersion) URL.revokeObjectURL(previewVersion.url);
    const url = URL.createObjectURL(v.pdfBlob);
    setPreviewVersion({ url, filename: v.filename, rev: v.rev });
  };
  const closePreviewVersion = () => {
    if (previewVersion) URL.revokeObjectURL(previewVersion.url);
    setPreviewVersion(null);
  };

  const refreshDriveStatus = async () => {
    try {
      const s = await fetchDriveStatus(scopeId);
      setDriveStatus(s);
      const okPdf = s.entries.find((e) => e.kind === "pdf" && e.status === "ok" && e.folder_id);
      if (okPdf?.folder_id) {
        setDriveFolderUrl(`https://drive.google.com/drive/folders/${okPdf.folder_id.replace(/\/relatorios$/, "")}`);
      }
    } catch (err) {
      console.warn("drive status", err);
    }
  };

  const refreshVersions = async () => {
    try {
      const v = await listVersions(scopeId);
      setVersions(v);
    } catch (err) {
      console.error(err);
    }
  };

  const refreshApprovals = async () => {
    try {
      const rows = await listApprovals({ data: { scopeId } });
      setApprovals(rows);
    } catch (err) {
      console.warn("approvals", err);
    }
    try {
      const res = await getWorkflowStatuses({ data: { scopeIds: [scopeId] } });
      setWfStatus(res.statuses[scopeId] ?? "digitacao");
    } catch (err) {
      console.warn("workflow status", err);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user || cancelled) return;
      const [{ data: adm }, { data: ver }] = await Promise.all([
        supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" }),
        supabase.rpc("has_role", { _user_id: data.user.id, _role: "verificador" }),
      ]);
      if (!cancelled) {
        setIsAdmin(Boolean(adm));
        setIsVerificador(Boolean(ver));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    refreshVersions();
    refreshDriveStatus();
    refreshApprovals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId]);

  // Auto-persistência do rascunho: salva no localStorage com debounce sempre que o usuário
  // altera qualquer dado editável. Assim, ao voltar à lista de OS e reabrir o ensaio,
  // os valores digitados (ex.: Gs) permanecem exatamente como foram deixados.
  useEffect(() => {
    const h = window.setTimeout(() => {
      const payload = { sample, specimens, selectedCpId, tab, adjust, axisCfg };
      saveDraft(scopeId, payload);
      // Espelha no Ensaio (labStore) — que dispara autosave para o Google Drive,
      // tornando o rascunho acessível de qualquer dispositivo/URL.
      ctx?.onPayloadChange(payload);
    }, 300);
    return () => window.clearTimeout(h);
  }, [scopeId, sample, specimens, selectedCpId, tab, adjust, axisCfg, ctx]);

  /**
   * Renderiza o PDF do relatório e devolve como Blob (para salvar como versão).
   */
  const buildReportPdfBlob = async (): Promise<Blob> => {
    if (!reportRef.current) throw new Error("Relatório não montado.");
    const pages = Array.from(
      reportRef.current.querySelectorAll<HTMLElement>(".printable-report"),
    );
    if (pages.length === 0) throw new Error("Nenhuma página do relatório encontrada.");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = 210, H = 297;
    for (let i = 0; i < pages.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      const dataUrl = await toPng(pages[i], {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#ffffff",
      });
      if (i > 0) pdf.addPage("a4", "portrait");
      pdf.addImage(dataUrl, "PNG", 0, 0, W, H, undefined, "FAST");
    }
    return pdf.output("blob");
  };

  const handleSaveVersion = async (opts?: { skipVerification?: boolean }) => {
    const skipVerification = opts?.skipVerification === true;
    setSaveBusy(true);
    const toastId = toast.loading("Aguarde enquanto estamos salvando a versão…");
    try {
      const blob = await buildReportPdfBlob();
      const rev = await nextRev(scopeId);
      const base = (sample.workNumber || "relatorio").toString().replace(/[^\w-]+/g, "_");
      const filename = `Triaxial-CID_${base}_Rev-${String(rev).padStart(2, "0")}.pdf`;
      const saved = await saveVersion({
        scopeId,
        rev,
        filename,
        size: blob.size,
        pdfBlob: blob,
      });
      await refreshVersions();
      toast.success(`Prévia ${String(saved.rev).padStart(2, "0")} salva localmente`, { id: toastId });

      // Sincroniza com o Google Drive (não bloqueia UI se falhar).
      const syncToastId = toast.loading("Enviando ao Google Drive…");
      try {
        const fotos = (ctx?.photos ?? []).map((p) => {
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
        }).filter((f) => f.base64.length > 0);
        const result = await syncRevision({
          scopeId,
          rev: saved.rev,
          pdfBlob: blob,
          pdfFilename: filename,
          sample,
          specimens,
          ctxOs: ctx?.os,
          ctxAmostra: ctx?.amostra ? { code: ctx.amostra.code, descricao: ctx.amostra.description } : undefined,
          ctxEnsaio: ctx?.ensaio ? { tipo: ctx.ensaio.tipo, nome: ctx.ensaio.label ?? ctx.amostra?.reportNumber ?? "" } : undefined,
          fotos,
        });
        setDriveFolderUrl(result.folderUrl);
        await refreshDriveStatus();
        toast.success("Sincronizado com o Google Drive ✓", { id: syncToastId });
      } catch (err) {
        console.error(err);
        toast.error("Falha ao enviar ao Drive: " + (err instanceof Error ? err.message : String(err)), { id: syncToastId });
        await refreshDriveStatus();
      }

      // Envia automaticamente para verificação — o fluxo é "Terminei a digitação".
      try {
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
              ensaio_tipo: "triaxial-cid",
              ensaio_nome: "Triaxial CID",
            },
          },
        });
        if (ctx && ctx.os && ctx.amostra && ctx.ensaio) {
          labStore.patchEnsaio(ctx.os.id, ctx.amostra.id, ctx.ensaio.id, {
            status: skipVerification ? "aguardando_aprovacao" : "aguardando_verificacao",
          });
        }
        await refreshApprovals();
        toast.success(
          skipVerification
            ? `Prévia ${String(saved.rev).padStart(2, "0")} enviada para aprovação`
            : `Prévia ${String(saved.rev).padStart(2, "0")} enviada para verificação`,
        );
      } catch (err) {
        toast.error(
          (skipVerification ? "Falha ao enviar para aprovação: " : "Falha ao enviar para verificação: ") +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    } catch (err) {
      console.error(err);
      toast.error("Falha ao salvar versão: " + (err instanceof Error ? err.message : String(err)), { id: toastId });
    } finally {
      setSaveBusy(false);
    }
  };

  const handleSyncAll = async () => {
    if (versions.length === 0) {
      toast.info("Salve pelo menos uma versão para sincronizar.");
      return;
    }
    setDriveBusy(true);
    const tid = toast.loading("Reenviando última revisão ao Drive…");
    try {
      const last = versions[0];
      const blob = last.pdfBlob;
      const fotos = (ctx?.photos ?? []).map((p) => {
        const m = /^data:(.*?);base64,(.*)$/.exec(p.dataUrl);
        const mimeType = m?.[1] || "image/jpeg";
        const b64 = m?.[2] || "";
        const ext = mimeType.split("/")[1] || "jpg";
        return { cpId: p.specimenId || "geral", filename: `${p.kind}_${p.id}.${ext}`, mimeType, base64: b64 };
      }).filter((f) => f.base64.length > 0);
      const result = await syncRevision({
        scopeId,
        rev: last.rev,
        pdfBlob: blob,
        pdfFilename: last.filename,
        sample,
        specimens,
        ctxOs: ctx?.os,
        ctxAmostra: ctx?.amostra ? { code: ctx.amostra.code, descricao: ctx.amostra.description } : undefined,
        ctxEnsaio: ctx?.ensaio ? { tipo: ctx.ensaio.tipo, nome: ctx.ensaio.label ?? ctx.amostra?.reportNumber ?? "" } : undefined,
        fotos,
      });
      setDriveFolderUrl(result.folderUrl);
      await refreshDriveStatus();
      toast.success("Reenvio concluído ✓", { id: tid });
    } catch (err) {
      toast.error("Falha no reenvio: " + (err instanceof Error ? err.message : String(err)), { id: tid });
    } finally {
      setDriveBusy(false);
    }
  };

  const handleDeleteVersion = async (id: string) => {
    if (!confirm("Excluir esta revisão? Esta ação não pode ser desfeita.")) return;
    try {
      await deleteVersion(id);
      await refreshVersions();
      toast.success("Revisão excluída");
    } catch (err) {
      console.error(err);
      toast.error("Falha ao excluir revisão");
    }
  };

  const handleGeneratePdf = async () => {
    if (!reportRef.current) return;
    setPdfBusy(true);
    try {
      const blob = await buildReportPdfBlob();
      const base = (sample.workNumber || "relatorio").toString().replace(/[^\w-]+/g, "_");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Triaxial-CID_${base}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast.success("PDF gerado com sucesso");
    } catch (err) {
      console.error(err);
      toast.error("Falha ao gerar PDF: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setPdfBusy(false);
    }
  };

  const cp = sortedSpecimens[selIdx] ?? sortedSpecimens[0];
  const res = results[selIdx] ?? results[0];

  // Sugestão automática dos limites dos eixos, a partir dos dados calculados.
  const suggestedAxisCfg = useMemo<AxisCfg>(() => {
    const shearAll = results.flatMap((r) => r.shearCurve);
    const maxEa = Math.max(1, ...shearAll.map((p) => p.eaPct ?? 0));
    const maxQ = Math.max(1, ...shearAll.map((p) => p.q ?? 0));
    const maxSigmaD = Math.max(1, ...shearAll.map((p) => p.sigmaD ?? 0));
    const minEv = Math.min(0, ...shearAll.map((p) => p.evPct ?? 0));
    const maxEv = Math.max(0, ...shearAll.map((p) => p.evPct ?? 0));
    const maxP = Math.max(1, ...shearAll.map((p) => p.pPrime ?? 0));
    const maxS1 = Math.max(
      1,
      ...results.map((r) => r.failure?.sigma1Prime ?? 0),
    );
    const consAll = sortedSpecimens.flatMap((s) => s.consolidation.filter((r) => r.t > 0));
    const maxSqrtT = Math.max(1, ...consAll.map((r) => Math.sqrt(r.t)));
    const maxDv = Math.max(1, ...consAll.map((r) => r.dv));
    // ΔV (cm³) do cisalhamento por CP: dv = evPct/100 * V0.
    const dvShearAll = results.flatMap((r) =>
      r.shearCurve.map((p) => (p.evPct / 100) * r.V0),
    );
    const dvShearMin = Math.min(0, ...dvShearAll);
    const dvShearMax = Math.max(1, ...dvShearAll);
    // Módulo de Deformabilidade E [MPa] = q[kPa] / (εa[%]*10). Ignora εa<=0.
    const eModAll = results.flatMap((r) =>
      r.shearCurve
        .filter((p) => p.eaPct > 0)
        .map((p) => p.q / (p.eaPct * 10)),
    );
    const maxEMod = Math.max(1, ...eModAll);
    // Razão σ'1/σ'3.
    const ratioAll = results.flatMap((r) =>
      r.shearCurve
        .filter((p) => p.sigma3Prime > 0)
        .map((p) => p.sigma1Prime / p.sigma3Prime),
    );
    const maxRatio = Math.max(1, ...ratioAll);
    const roundUp = (v: number, step = 1) => Math.ceil(v / step) * step;
    return {
      eaMax: roundUp(maxEa, 1),
      qMax: roundUp(maxQ * 1.1, 50),
      sigmaDMax: roundUp(maxSigmaD * 1.1, 50),
      evMin: Math.floor(minEv),
      evMax: Math.max(1, Math.ceil(maxEv)),
      pMax: roundUp(maxP * 1.2, 50),
      sigmaMax: roundUp(maxS1 * 1.2, 50),
      tauMax: roundUp(maxS1 * 0.7, 50),
      sqrtTMax: roundUp(maxSqrtT, 1),
      dvMax: roundUp(maxDv * 1.1, 1),
      dvShearMin: Math.floor(dvShearMin),
      dvShearMax: roundUp(dvShearMax * 1.1, 1),
      eModMax: roundUp(maxEMod * 1.1, 5),
      ratioMax: roundUp(maxRatio * 1.1, 0.5),
    };
  }, [results, sortedSpecimens]);

  return (
    <>
      {/* Diálogo de confirmação global (substitui window.confirm) */}
      <Dialog
        open={confirmState.open}
        onOpenChange={(o) => setConfirmState((s) => ({ ...s, open: o }))}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmState.title}</DialogTitle>
            <DialogDescription className="whitespace-pre-line">
              {confirmState.description}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmState((s) => ({ ...s, open: false }))}
            >
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

      {/* Diálogo de escolha de NT quando o XLSX contém múltiplos ensaios */}
      <Dialog
        open={ntPickerState.open}
        onOpenChange={(o) => setNtPickerState((s) => ({ ...s, open: o }))}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Selecione qual ensaio importar</DialogTitle>
            <DialogDescription>
              O arquivo <strong>{ntPickerState.filename}</strong> contém mais de um
              ensaio (coluna NT). Escolha qual deles deseja importar para este CP.
              Ensaios que não sejam CID (sem etapa "Ruptura Dren.") ficam
              desabilitados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {ntPickerState.tests.map((t) => {
              const canImport = t.hasDrained;
              const sigma =
                t.sigmaRupture ?? t.sigmaAdens;
              const sigmaTxt = sigma != null ? `σ₃ ≈ ${sigma.toFixed(0)} kPa` : "σ₃ n/d";
              const etapasTxt = t.etapas
                .map((e) => `${e.name} (${e.count})`)
                .join(" · ");
              return (
                <button
                  key={t.nt}
                  type="button"
                  disabled={!canImport}
                  onClick={() => ntPickerState.onPick?.(t.nt)}
                  className={
                    "w-full text-left rounded-md border p-3 transition " +
                    (canImport
                      ? "hover:bg-accent hover:border-primary cursor-pointer"
                      : "opacity-50 cursor-not-allowed")
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">NT {t.nt}</div>
                    <div className="text-xs text-muted-foreground">{sigmaTxt}</div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {etapasTxt}
                  </div>
                  {!canImport && (
                    <div className="text-xs text-destructive mt-1">
                      Não é CID (sem "Ruptura Dren.") — não pode ser importado neste módulo.
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNtPickerState((s) => ({ ...s, open: false }))}
            >
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Estilo para impressão: só o relatório é impresso */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          body { background: #fff !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
        }
        .print-only { display: none; }
      `}</style>

      <div className="no-print px-6 py-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">ASTM D7181</Badge>
              <Badge variant="outline">ISO 17892-9</Badge>
              <WorkflowFarol status={wfStatus} />
            </div>
            <h2 className="mt-2 text-xl font-semibold">
              Ensaio Triaxial {sample.condition === "saturado" ? "CIDsat" : "CIDnat"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Consolidado isotropicamente, cisalhamento drenado
              {sample.condition === "saturado"
                ? " — saturado por contra-pressão."
                : " — na umidade natural."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            {/* Ação contextual do fluxo — visível no topo, sem precisar abrir o relatório */}
            {(() => {
              const st = wfStatus;
              const rev = approvals[0]?.rev;
              // Aguardando verificação → botão "Enviar para aprovação" (verificador/admin)
              if (st === "aguardando_verificacao" && (isVerificador || isAdmin)) {
                return (
                  <Button
                    onClick={async () => {
                      if (typeof rev !== "number") return;
                      setSaveBusy(true);
                      const tid = toast.loading("Enviando para aprovação…");
                      try {
                        await verifyApproval({ data: { scopeId, rev, decision: "verificado" } });
                        await refreshApprovals();
                        toast.success("Enviado para aprovação ✓", { id: tid });
                      } catch (err) {
                        toast.error("Falha: " + (err instanceof Error ? err.message : String(err)), { id: tid });
                      } finally {
                        setSaveBusy(false);
                      }
                    }}
                    disabled={saveBusy}
                    className="gap-2"
                  >
                    <Send className="h-4 w-4" />
                    Enviar para aprovação
                  </Button>
                );
              }
              // Aguardando aprovação → botão "Aprovar relatório" (admin)
              if (st === "aguardando_aprovacao" && isAdmin && typeof rev === "number") {
                return (
                  <Button
                    onClick={() => setDecideOpen({ rev, stage: "approve", decision: "aprovado" })}
                    className="gap-2"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Aprovar relatório
                  </Button>
                );
              }
              // Aprovado → próxima ação gera nova revisão (reabre ciclo)
              if (st === "aprovado") {
                const nextNum = (approvals[0]?.rev ?? versions[0]?.rev ?? 0) + 1;
                return (
                  <Button onClick={() => handleSaveVersion({ skipVerification: true })} disabled={saveBusy} className="gap-2">
                    <Send className="h-4 w-4" />
                    {saveBusy
                      ? "Enviando…"
                      : `Gerar Prévia ${String(nextNum).padStart(2, "0")} — Enviar para aprovação`}
                  </Button>
                );
              }
              // Em digitação / rejeitado → "Terminei a digitação"
              return (
                <Button onClick={() => handleSaveVersion()} disabled={saveBusy} className="gap-2">
                  <Send className="h-4 w-4" />
                  {saveBusy
                    ? "Enviando…"
                    : "Terminei a digitação — Enviar para verificação"}
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

            <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary">
                  <Settings2 className="mr-2 h-4 w-4" />
                  Parâmetros de Ajuste do Ensaio
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Parâmetros de Ajuste do Ensaio</DialogTitle>
                  <DialogDescription>
                    Valores comuns a todos os corpos de prova. Ao salvar, são aplicados a todos os CPs.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3 py-2">
                  <NumField label="Massa sobre CP (g)" value={adjust.mSobreCP} step={0.01} onChange={(v) => setAdjust((a) => ({ ...a, mSobreCP: v }))} />
                  <NumField label="Esp. Membrana (cm)" value={adjust.espMembrana} step={0.001} onChange={(v) => setAdjust((a) => ({ ...a, espMembrana: v }))} />
                  <NumField label="Área Pistão (cm²)" value={adjust.aPistao} step={0.01} onChange={(v) => setAdjust((a) => ({ ...a, aPistao: v }))} />
                  <NumField label="Altura Topcap (cm)" value={adjust.hTopcap} step={0.1} onChange={(v) => setAdjust((a) => ({ ...a, hTopcap: v }))} />
                  <NumField label="Atrito Pistão (kgf)" value={adjust.fAtritoPistao} step={0.01} onChange={(v) => setAdjust((a) => ({ ...a, fAtritoPistao: v }))} />
                  <NumField
                    label="Em membrana (kPa)"
                    value={sample.membraneE}
                    onChange={(v) => updateSample("membraneE", v)}
                    disabled={!sample.applyMembrane}
                  />
                  <NumField
                    label="tm membrana (mm)"
                    value={sample.membraneT}
                    step={0.05}
                    onChange={(v) => updateSample("membraneT", v)}
                    disabled={!sample.applyMembrane}
                  />
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={sample.applyPistonCorrection === true}
                    onChange={(e) => updateSample("applyPistonCorrection", e.target.checked)}
                  />
                  Aplicar correção ISO §7.2.5 (peso do pistão K e área da haste a) na tensão desviatória.
                  Ative apenas se a célula de carga não descontar a pressão da câmara sobre a haste.
                </label>
                <p className="text-[10px] text-muted-foreground">
                  Em/tm membrana são aplicados quando "Corrigir membrana" está ativo (na aba Amostra).
                </p>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setAdjustOpen(false)}>Cancelar</Button>
                  <Button onClick={applyAdjustToAll}>Aplicar a todos os CPs</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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
                    {sample.condition === "saturado" ? "CIDsat — Saturado" : "CIDnat — Natural"}
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
                      : sample.sampleState === "indeformada"
                        ? `Indeformada${sample.sampleType ? ` · ${sample.sampleType}` : ""}`
                        : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Equipamento</div>
                  <div className="font-medium">{sample.equipment || "—"}</div>
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
                        · σ′₃ = {s.sigma3Target} kPa
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
                ] as [keyof TriaxialSample, string][]).map(([k, label]) => (
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
                  <Input value={sample.granulometricDescription} onChange={(e) => updateSample("granulometricDescription", e.target.value)} />
                </div>
              </CardContent>
            )}
          </Card>
        )}

        <Tabs value={tab} onValueChange={setTab}>

          {/* Barra Superior: Responsáveis com herança automática (Gantt & Login) */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card/60 px-4 py-2.5 shadow-xs">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground font-medium">Operador Bancada (Gantt):</span>
              <Badge variant="secondary" className="font-semibold text-xs text-foreground px-2 py-0.5">
                {sample.operator || ctx?.ensaio?.operator || "Téc. Laboratório"}
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

          <div className="flex items-center gap-2">
          <TabsList className={`grid flex-1 ${sample.condition === "natural" ? "grid-cols-5" : "grid-cols-6"}`}>
            <TabsTrigger value="amostra"><Beaker className="mr-1 h-3 w-3" />Amostra</TabsTrigger>
            {sample.condition === "saturado" && (
              <TabsTrigger value="saturacao">Saturação</TabsTrigger>
            )}
            <TabsTrigger value="adensamento">Adensamento</TabsTrigger>
            <TabsTrigger value="cisalhamento"><Activity className="mr-1 h-3 w-3" />Cisalhamento</TabsTrigger>
            <TabsTrigger value="envoltoria"><BarChart3 className="mr-1 h-3 w-3" />Envoltória</TabsTrigger>
            <TabsTrigger value="versoes"><History className="mr-1 h-3 w-3" />Versões</TabsTrigger>
          </TabsList>
            <Button
              type="button"
              onClick={() => setReportOpen(true)}
              className="gap-2 shrink-0"
            >
              <FileText className="h-4 w-4" /> Gerar Relatório
            </Button>
          </div>

          {/* AMOSTRA */}
          <TabsContent value="amostra" className="mt-4 space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Propriedades e correções</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Condição do ensaio</Label>
                  <Select
                    value={sample.condition}
                    onValueChange={(v) => {
                      updateSample("condition", v as "saturado" | "natural");
                      if (v === "natural" && tab === "saturacao") setTab("adensamento");
                    }}
                  >
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="saturado">Saturado (com contra-pressão)</SelectItem>
                      <SelectItem value="natural">Natural (umidade natural)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <NumField label="Gs" value={sample.Gs} onChange={(v) => updateSample("Gs", v)} step={0.01} />
                <div className="flex items-end gap-2">
                  <Switch checked={sample.applyMembrane} onCheckedChange={(v) => updateSample("applyMembrane", v)} />
                  <Label className="text-xs">
                    Corrigir membrana
                    <span className="ml-1 text-[10px] text-muted-foreground">(Em/tm nos Parâmetros)</span>
                  </Label>
                </div>
                <div className="col-span-full grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs">Equipamento Utilizado</Label>
                    <PickerWithCreate
                      kind="equipments"
                      value={sample.equipment ?? ""}
                      onChange={(v) => updateSample("equipment", v)}
                      placeholder="Selecione o equipamento…"
                      createLabel="Novo equipamento"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Dimensões Características</Label>
                    <Input
                      value={sample.specDimensions ?? ""}
                      onChange={(e) => updateSample("specDimensions", e.target.value)}
                      placeholder="Ex.: 38 × 76 mm"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div className="col-span-full grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs">Condição da Amostra</Label>
                    <Select
                      value={sample.sampleState ?? ""}
                      onValueChange={(v) =>
                        updateSample("sampleState", v as "indeformada" | "compactada")
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecione…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="indeformada">Indeformada</SelectItem>
                        <SelectItem value="compactada">Compactada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {sample.sampleState === "indeformada" && (
                    <div>
                      <Label className="text-xs">Tipo (Indeformada)</Label>
                      <Select
                        value={sample.sampleType ?? ""}
                        onValueChange={(v) => updateSample("sampleType", v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Selecione…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Bloco Indeformado">Bloco Indeformado</SelectItem>
                          <SelectItem value="Shelby">Shelby</SelectItem>
                          <SelectItem value="Denison">Denison</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {sample.sampleState === "compactada" && (
                    <>
                      <div>
                        <Label className="text-xs">Grau de Compactação (%)</Label>
                        <Input
                          type="number"
                          value={sample.compactionDegreePct ?? ""}
                          onChange={(e) =>
                            updateSample(
                              "compactionDegreePct",
                              e.target.value === "" ? "" : Number(e.target.value),
                            )
                          }
                          placeholder="Ex.: 95"
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Energia de Compactação</Label>
                        <Select
                          value={sample.compactionEnergy ?? ""}
                          onValueChange={(v) =>
                            updateSample("compactionEnergy", v as "PN" | "PI" | "PM")
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Selecione…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PN">PN — Proctor Normal</SelectItem>
                            <SelectItem value="PI">PI — Proctor Intermediário</SelectItem>
                            <SelectItem value="PM">PM — Proctor Modificado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-sm">Corpos de prova</CardTitle>
                  <CardDescription>
                    CPs organizados automaticamente por σ3' crescente (sem limite de quantidade).
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={addCp}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Adicionar CP
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Quadro resumo fixo com informações de todos os CPs */}
                <div className="mb-4 rounded-md border border-border bg-muted/20 p-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Resumo dos corpos de prova
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    {results.map((r, i) => {
                      const s = sortedSpecimens[i];
                      return (
                        <div
                          key={s.id}
                          className="rounded border bg-background p-2"
                          style={{ borderColor: (s.color ?? BRAND) + "80" }}
                        >
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-xs font-semibold" style={{ color: s.color ?? BRAND }}>
                              {s.displayId ?? s.id}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              σ3'={s.sigma3Target} kPa
                            </span>
                          </div>
                          <div className="space-y-0.5 text-[10.5px] text-muted-foreground">
                            <div>D₀ = <b>{fmt(s.D0, 2)}</b> mm</div>
                            <div>H₀ = <b>{fmt(s.H0, 2)}</b> mm</div>
                            <div>w₀ = <b>{fmt(r.w0Pct, 2)}%</b></div>
                            <div>e₀ = <b>{fmt(r.e0, 3)}</b></div>
                            <div>Sr₀ = <b>{fmt(r.Sr0, 1)}%</b></div>
                            <div>Ac = <b>{fmt(r.Ac, 2)}</b> cm²</div>
                            {sample.condition === "saturado" && (
                              <div>B = <b>{r.BFinal != null ? fmt(r.BFinal, 3) : "—"}</b></div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Abas dos CPs (barra superior) com botão de remover em cada aba */}
                <div className="flex items-center justify-between gap-2">
                  <CpSelector
                    specimens={sortedSpecimens}
                    selectedId={selectedCpId}
                    onSelect={setSelectedCpId}
                    onRemove={removeCp}
                    canRemove={sortedSpecimens.length > 1}
                  />
                  {cp.rawImport ? (
                    <div className="flex items-center gap-2">
                      <div className="rounded-md border border-border bg-muted/40 px-2 py-1 text-[10.5px] leading-tight text-muted-foreground">
                        <div>
                          <span className="font-semibold text-foreground">Arquivo:</span> {cp.rawImport.filename}
                        </div>
                        <div>
                          <span className="font-semibold text-foreground">NT:</span> {cp.rawImport.nt || "—"}
                          {" · "}
                          {cp.rawImport.consolidationCount} adens · {cp.rawImport.shearCount} rup
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          askConfirm({
                            title: `Excluir dados brutos de ${cp.displayId ?? cp.id}?`,
                            description:
                              "Os pontos de adensamento e cisalhamento importados serão apagados e não poderão ser recuperados.",
                            confirmLabel: "Excluir",
                            destructive: true,
                            onConfirm: () => {
                              updateSpecimen(cp.id, {
                                consolidation: [],
                                shear: [],
                                rawImport: undefined,
                              });
                              toast.success("Dados brutos excluídos.");
                            },
                          });
                        }}
                      >
                        Excluir Dados Brutos
                      </Button>
                    </div>
                  ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = ".xlsx,.xls";
                      input.onchange = async () => {
                        const file = input.files?.[0];
                        if (!file) return;
                        const buf = await file.arrayBuffer();
                        const cpId = cp.id;
                        const D0 = cp.D0 || 50;
                        const H0 = cp.H0 || 100;
                        const V0 = (Math.PI * D0 * D0) / 4 * (H0 / 10); // cm³
                        const doImport = async (selectedNT?: string) => {
                          try {
                            const { parseOwnTecXlsx } = await import(
                              "@/features/triaxial-cid/importXlsx"
                            );
                            const data = parseOwnTecXlsx(buf, file.name, { selectedNT });
                            if (!data.consolidation.length && !data.shear.length) {
                              toast.error("Nenhum dado reconhecido no arquivo.");
                              return;
                            }
                            const shear = data.shear.map((r) => ({
                              ...r,
                              dvPct:
                                r.dVcm3 != null && V0 > 0 ? (r.dVcm3 / V0) * 100 : 0,
                            }));
                            updateSpecimen(cpId, {
                              consolidation: data.consolidation.length
                                ? data.consolidation
                                : cp.consolidation,
                              shear: shear.length ? shear : cp.shear,
                              rawImport: {
                                filename: data.filename,
                                nt: data.nt,
                                importedAt: new Date().toISOString(),
                                consolidationCount: data.consolidation.length,
                                shearCount: shear.length,
                              },
                            });
                            if (data.code) {
                              setSample((prev) => ({ ...prev, code: data.code || prev.code }));
                            }
                            toast.success(
                              `Dados importados em ${cp.displayId ?? cpId}: ${data.consolidation.length} pts adensamento · ${data.shear.length} pts ruptura`,
                            );
                          } catch (err) {
                            const { MultipleOwnTecTestsError } = await import(
                              "@/features/triaxial-cid/importXlsx"
                            );
                            if (err instanceof MultipleOwnTecTestsError) {
                              setNtPickerState({
                                open: true,
                                filename: file.name,
                                tests: err.tests,
                                onPick: (nt) => {
                                  setNtPickerState((s) => ({ ...s, open: false }));
                                  void doImport(nt);
                                },
                              });
                              return;
                            }
                            console.error(err);
                            toast.error(
                              "Falha ao ler XLSX: " +
                                (err instanceof Error ? err.message : String(err)),
                            );
                          }
                        };
                        void doImport();
                      };
                      input.click();
                    }}
                  >
                    Importar Dados Brutos (XLSX)
                  </Button>
                  )}
                </div>

                <MoldagemFicha
                  cp={cp}
                  res={res}
                  sample={sample}
                  onCp={(patch) => updateSpecimen(cp.id, patch)}
                  capsOpen={capsOpen}
                  onToggleCaps={() => setCapsOpen((v) => !v)}
                  geomOpen={geomOpen}
                  onToggleGeom={() => setGeomOpen((v) => !v)}
                  indicesOpen={indicesOpen}
                  onToggleIndices={() => setIndicesOpen((v) => !v)}
                  finalOpen={finalOpen}
                  onToggleFinal={() => setFinalOpen((v) => !v)}
                />

                {ctx && (
                  <div className="mt-4 rounded-md border border-border">
                    <button
                      type="button"
                      onClick={() => setPhotoOpen((v) => !v)}
                      className="flex w-full items-center justify-between border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide"
                    >
                      <span className="flex items-center gap-2">
                        {photoOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        Registro fotográfico — {cp.displayId ?? cp.id}
                      </span>
                      <span className="text-[10px] font-normal text-muted-foreground">
                        {(ctx.photos ?? []).filter((p) => p.specimenId === cp.id).length} foto(s)
                      </span>
                    </button>
                    {photoOpen && (
                      <div className="space-y-3 p-3">
                        <PhotoUploader
                          title={`Moldagem — ${cp.displayId ?? cp.id}`}
                          kind="moldagem"
                          photos={(ctx.photos ?? []).filter((p) => p.specimenId === cp.id)}
                          onAdd={(p) => ctx.addPhoto({ ...p, specimenId: cp.id })}
                          onRemove={(id) => ctx.removePhoto(id)}
                          onUpdate={(id, patch) => ctx.updatePhoto(id, patch)}
                        />
                        <PhotoUploader
                          title={`Ruptura — ${cp.displayId ?? cp.id}`}
                          kind="ruptura"
                          photos={(ctx.photos ?? []).filter((p) => p.specimenId === cp.id)}
                          onAdd={(p) => ctx.addPhoto({ ...p, specimenId: cp.id })}
                          onRemove={(id) => ctx.removePhoto(id)}
                          onUpdate={(id, patch) => ctx.updatePhoto(id, patch)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SATURAÇÃO — apenas quando ensaio é Saturado */}
          {sample.condition === "saturado" && (
          <TabsContent value="saturacao" className="mt-4">
            <CpSelector specimens={sortedSpecimens} selectedId={selectedCpId} onSelect={setSelectedCpId} />
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Saturação — {cp.displayId ?? cp.id}</CardTitle>
                <CardDescription>
                  ASTM D7181 §11.3 — aceitar CP saturado quando B ≥ {B_TARGET}. B = Δu/Δσ3.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-3 flex items-center gap-3">
                  <Label className="text-xs">Método de saturação</Label>
                  <Select
                    value={cp.saturationMethod ?? "contra-pressao"}
                    onValueChange={(v) =>
                      updateSpecimen(cp.id, { saturationMethod: v as "contra-pressao" | "percolacao" })
                    }
                  >
                    <SelectTrigger className="h-8 w-[260px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contra-pressao">Contra-pressão (estágios)</SelectItem>
                      <SelectItem value="percolacao">Percolação Ascendente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(cp.saturationMethod ?? "contra-pressao") === "percolacao" ? (
                  <div className="rounded border border-dashed border-primary/40 bg-primary/5 p-4 text-sm">
                    Saturação realizada por <b>Percolação Ascendente</b>. Sem registro
                    de estágios de contra-pressão para este CP.
                  </div>
                ) : (
                <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Estágio</TableHead>
                      <TableHead>σ3 (kPa)</TableHead>
                      <TableHead>uw (kPa)</TableHead>
                      <TableHead>B (medido/informado)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cp.saturation.map((s, si) => (
                      <TableRow key={si}>
                        <TableCell>{si + 1}</TableCell>
                        <TableCell><MiniNum value={s.sigma3} onChange={(v) => updateSpecimen(cp.id, { saturation: cp.saturation.map((r, ri) => ri === si ? { ...r, sigma3: v } : r) })} /></TableCell>
                        <TableCell><MiniNum value={s.u} onChange={(v) => updateSpecimen(cp.id, { saturation: cp.saturation.map((r, ri) => ri === si ? { ...r, u: v } : r) })} /></TableCell>
                        <TableCell><MiniNum value={s.bValue ?? 0} step={0.01} onChange={(v) => updateSpecimen(cp.id, { saturation: cp.saturation.map((r, ri) => ri === si ? { ...r, bValue: v } : r) })} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => updateSpecimen(cp.id, { saturation: [...cp.saturation, { sigma3: 0, u: 0 }] })}>
                    + Adicionar leitura
                  </Button>
                  {cp.saturation.length > 0 && (
                    <Button size="sm" variant="ghost" onClick={() => updateSpecimen(cp.id, { saturation: cp.saturation.slice(0, -1) })}>
                      Remover última
                    </Button>
                  )}
                </div>
                <div className="mt-3 text-sm">
                  B final: <b>{res.BFinal != null ? fmt(res.BFinal, 3) : "—"}</b>{" "}
                  {res.BFinal != null && (
                    <Badge variant={res.BFinal >= B_TARGET ? "default" : "destructive"}>
                      {res.BFinal >= B_TARGET ? "Saturado" : "Insuficiente"}
                    </Badge>
                  )}
                </div>
                </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          )}

          {/* ADENSAMENTO */}
          <TabsContent value="adensamento" className="mt-4">
            <CpSelector specimens={sortedSpecimens} selectedId={selectedCpId} onSelect={setSelectedCpId} />
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Adensamento isotrópico — {cp.displayId ?? cp.id}</CardTitle>
                <CardDescription>
                  ΔV vs t → Hc = H₀·(1 − ΔV/V₀)^(1/3) · Ac = A₀·(1 − ΔV/V₀)^(2/3)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>t (min)</TableHead>
                        <TableHead>ΔV (cm³)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cp.consolidation.map((r, ri) => (
                        <TableRow key={ri}>
                          <TableCell><MiniNum value={r.t} step={0.1} onChange={(v) => updateSpecimen(cp.id, { consolidation: cp.consolidation.map((x, xi) => xi === ri ? { ...x, t: v } : x) })} /></TableCell>
                          <TableCell><MiniNum value={r.dv} step={0.01} onChange={(v) => updateSpecimen(cp.id, { consolidation: cp.consolidation.map((x, xi) => xi === ri ? { ...x, dv: v } : x) })} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="col-span-full flex gap-2 lg:col-span-1">
                    <Button size="sm" variant="outline" onClick={() => updateSpecimen(cp.id, { consolidation: [...cp.consolidation, { t: 0, dv: 0 }] })}>
                      + Adicionar leitura
                    </Button>
                    {cp.consolidation.length > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => updateSpecimen(cp.id, { consolidation: cp.consolidation.slice(0, -1) })}>
                        Remover última
                      </Button>
                    )}
                  </div>
                  <div className="h-[300px]">
                    <ResponsiveContainer>
                      <ComposedChart data={[{ sqrtT: 0, dv: 0 }, ...cp.consolidation.filter(r => r.t > 0).map(r => ({ sqrtT: Math.sqrt(r.t), dv: r.dv }))]}>
                        <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
                        <XAxis dataKey="sqrtT" type="number" domain={["auto", "auto"]}>
                          <RLabel value="√t  (min^0,5)" position="insideBottom" offset={-2} fontSize={11} />
                        </XAxis>
                        <YAxis reversed>
                          <RLabel value="ΔV (cm³)" angle={-90} position="insideLeft" fontSize={11} />
                        </YAxis>
                        <Tooltip />
                        <Line type="monotone" dataKey="dv" stroke={BRAND} dot />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                  <Stat label="ΔV total" value={`${fmt(res.dVcons, 2)} cm³`} />
                  <Stat label="V pós-adensamento" value={`${fmt(res.Vc, 2)} cm³`} />
                  <Stat label="Hc" value={`${fmt(res.Hc, 2)} mm`} />
                  <Stat label="Ac" value={`${fmt(res.Ac, 2)} cm²`} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CISALHAMENTO */}
          <TabsContent value="cisalhamento" className="mt-4 space-y-4">
            <CpSelector specimens={sortedSpecimens} selectedId={selectedCpId} onSelect={setSelectedCpId} />
            <ShearPhaseSection
              cp={cp}
              res={res}
              onUpdateRow={(ri, patch) => updateShearRow(cp.id, ri, patch)}
              onAddRow={() =>
                updateSpecimen(cp.id, {
                  shear: [...cp.shear, { eaPct: 0, F: 0, dvPct: 0 }],
                })
              }
              onRemoveRow={(ri) =>
                updateSpecimen(cp.id, {
                  shear: cp.shear.filter((_, i) => i !== ri),
                })
              }
            />
          </TabsContent>

          {/* ENVOLTÓRIA */}
          <TabsContent value="envoltoria" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Trajetórias q–p' e ruptura</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[380px]">
                  <ResponsiveContainer>
                    <ComposedChart>
                      <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
                      <XAxis type="number" dataKey="pPrime" domain={[0, "auto"]}><RLabel value="s' (kPa)" position="insideBottom" offset={-2} fontSize={11} /></XAxis>
                      <YAxis type="number" dataKey="q" domain={[0, "auto"]}><RLabel value="t (kPa)" angle={-90} position="insideLeft" fontSize={11} /></YAxis>
                      <Tooltip formatter={(v: number) => fmt(v, 1)} />
                      <Legend />
                      {results.map((r, i) => (
                        <Line
                          key={specimens[i].id}
                          data={r.shearCurve}
                          dataKey="q"
                          type="monotone"
                          stroke={specimens[i].color ?? BRAND}
                          dot={false}
                          name={`${specimens[i].displayId ?? specimens[i].id} · σ'3=${fmt(specimens[i].sigma3Target ?? 0, 0)} kPa`}
                          strokeWidth={2}
                          isAnimationActive={false}
                        />
                      ))}
                      {envelope && (() => {
                        const maxP = Math.max(...envelopePts.map(p => p.pPrime)) * 1.2;
                        const envLine = [
                          { pPrime: 0, q: envelope.a },
                          { pPrime: maxP, q: envelope.a + envelope.M * maxP },
                        ];
                        return (
                          <Line data={envLine} dataKey="q" type="linear" stroke={ACCENT} strokeWidth={2} strokeDasharray="6 4" dot={false} name={`Envoltória (Kf)  M=${fmt(envelope.M, 3)}`} isAnimationActive={false} />
                        );
                      })()}
                      <Scatter data={envelopePts} fill={ACCENT} name="Ruptura" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Círculos de Mohr &amp; envoltória (σn, τ)</CardTitle>
                <CardDescription>φ' e c' calculados a partir do ajuste em (p', q).</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[420px] w-full">
                  <MohrChart specimens={specimens} results={results} envelope={envelope} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                  <Stat label="φ' " value={envelope ? `${fmt(envelope.phiDeg, 2)}°` : "—"} />
                  <Stat label="c' " value={envelope ? `${fmt(envelope.cPrime, 2)} kPa` : "—"} />
                  <Stat label="M (t vs s')" value={envelope ? fmt(envelope.M, 3) : "—"} />
                  <Stat label="a (t vs s')" value={envelope ? `${fmt(envelope.a, 1)} kPa` : "—"} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* VERSÕES — histórico de revisões do relatório em PDF */}
          <TabsContent value="versoes" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Revisões do Relatório</CardTitle>
                  <CardDescription>
                    Cada clique em <b>Salvar Versão</b> cria uma nova revisão (Rev 00, 01, 02…) armazenada localmente e enviada ao <b>Google Drive da Suporte</b> (PDF · dados · fotos).
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {driveFolderUrl && (
                    <a href={driveFolderUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" /> Abrir pasta no Drive
                    </a>
                  )}
                  <Button variant="outline" size="sm" onClick={handleSyncAll} disabled={driveBusy} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${driveBusy ? "animate-spin" : ""}`} />
                    {driveBusy ? "Enviando…" : "Sincronizar com Drive"}
                  </Button>
                  <Button onClick={() => setReportOpen(true)} className="gap-2">
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
                          <TableCell className="text-xs">{v.filename}</TableCell>
                          <TableCell className="text-right text-xs">
                            {(v.size / 1024).toFixed(0)} KB
                          </TableCell>
                          <TableCell className="text-center">
                            {(() => {
                              const entry = driveStatus?.entries.find((e) => e.rev === v.rev && e.kind === "pdf");
                              if (!entry) return <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Cloud className="h-3 w-3" /> —</span>;
                              if (entry.status === "ok") return <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600"><CloudCheck className="h-3 w-3" /> ok</span>;
                              return <span className="inline-flex items-center gap-1 text-[10px] text-destructive" title={entry.error ?? ""}><CloudAlert className="h-3 w-3" /> erro</span>;
                            })()}
                          </TableCell>
                          <TableCell className="text-center">
                             <ApprovalCell
                               approval={appr}
                              isAdmin={isAdmin}
                              isVerificador={isVerificador}
                              onRequest={async () => {
                                try {
                                  await requestApproval({ data: { scopeId, rev: v.rev, filename: v.filename } });
                                  toast.success(`Aprovação solicitada para Rev ${String(v.rev).padStart(2, "0")}`);
                                  await refreshApprovals();
                                } catch (err) {
                                  toast.error(`Falha: ${(err as Error).message}`);
                                }
                              }}
                              onDecide={(stage, decision) => {
                                setDecideComment("");
                                setDecideOpen({ rev: v.rev, stage, decision });
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="outline" className="gap-1" onClick={() => openPreviewVersion(v)} title="Visualizar PDF">
                                <Eye className="h-3 w-3" /> Visualizar
                              </Button>
                              <Button size="sm" variant="secondary" className="gap-1" onClick={() => downloadVersion(v)}>
                                <Download className="h-3 w-3" /> Baixar
                              </Button>
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeleteVersion(v.id)}>
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

          {/* RELATÓRIO — pré-visualização + ajuste de eixos */}
          {/* Relatório movido para um Dialog (botão "Gerar Relatório") */}
          <Dialog open={!!previewVersion} onOpenChange={(o) => !o && closePreviewVersion()}>
            <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] p-0 flex flex-col">
              <DialogHeader className="px-4 py-2 border-b">
                <DialogTitle className="text-sm">
                  Visualização — Rev {String(previewVersion?.rev ?? 0).padStart(2, "0")} · {previewVersion?.filename}
                </DialogTitle>
              </DialogHeader>
              {previewVersion && (
                <iframe
                  src={previewVersion.url}
                  title="Relatório PDF"
                  className="flex-1 w-full border-0"
                />
              )}
            </DialogContent>
          </Dialog>
          <Dialog open={!!decideOpen} onOpenChange={(o) => !o && setDecideOpen(null)}>
            <DialogContent className="sm:max-w-md">
              {(() => {
                if (!decideOpen) return null;
                const isVerifyStage = decideOpen.stage === "verify";
                const isPositive = decideOpen.decision === "verificado" || decideOpen.decision === "aprovado";
                const requireComment = !isPositive;
                const title = isVerifyStage
                  ? isPositive ? "Verificar Revisão" : "Rejeitar Verificação"
                  : isPositive ? "Aprovar Revisão"    : "Rejeitar Aprovação";
                const desc = isVerifyStage
                  ? isPositive
                    ? "Confirme que os dados do relatório foram verificados. O comentário é opcional."
                    : "Descreva o que precisa ser corrigido pelo laboratorista antes de reenviar."
                  : isPositive
                    ? "Aprovação técnica final. O comentário é opcional e ficará registrado."
                    : "Descreva o motivo da rejeição pelo Responsável Técnico.";
                return (
                  <>
                    <DialogHeader>
                      <DialogTitle>
                        {title} — Rev {String(decideOpen.rev).padStart(2, "0")}
                      </DialogTitle>
                      <DialogDescription>{desc}</DialogDescription>
                    </DialogHeader>
                    <Textarea
                      value={decideComment}
                      onChange={(e) => setDecideComment(e.target.value)}
                      placeholder={isPositive ? "Comentário (opcional)…" : "Motivo (obrigatório)…"}
                      rows={4}
                    />
                    <DialogFooter>
                      <Button variant="ghost" onClick={() => setDecideOpen(null)} disabled={decideBusy}>Cancelar</Button>
                      <Button
                        disabled={decideBusy || (requireComment && !decideComment.trim())}
                        onClick={async () => {
                          setDecideBusy(true);
                          try {
                            const payload = { scopeId, rev: decideOpen.rev, comment: decideComment.trim() || undefined };
                            if (isVerifyStage) {
                              await verifyApproval({ data: { ...payload, decision: decideOpen.decision as "verificado" | "rejeitado_verificacao" } });
                              toast.success(isPositive ? "Verificação registrada — aguardando aprovação" : "Verificação rejeitada");
                            } else {
                              await decideApproval({ data: { ...payload, decision: decideOpen.decision as "aprovado" | "rejeitado" } });
                              toast.success(isPositive ? "Revisão aprovada" : "Revisão rejeitada");
                            }
                            setDecideOpen(null);
                            await refreshApprovals();
                          } catch (err) {
                            toast.error(`Falha: ${(err as Error).message}`);
                          } finally {
                            setDecideBusy(false);
                          }
                        }}
                        className={isPositive ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-destructive hover:bg-destructive/90"}
                      >
                        {decideBusy ? "Enviando…" : `Confirmar ${isPositive ? (isVerifyStage ? "Verificação" : "Aprovação") : "Rejeição"}`}
                      </Button>
                    </DialogFooter>
                  </>
                );
              })()}
            </DialogContent>
          </Dialog>
          <Dialog open={reportOpen} onOpenChange={setReportOpen}>
            <DialogContent
              className="max-w-[95vw] w-[95vw] h-[92vh] overflow-hidden p-0 sm:max-w-[95vw]"
            >
              <DialogHeader className="border-b px-4 py-3">
                <DialogTitle className="text-primary">Relatório Técnico — Pré-visualização</DialogTitle>
                <DialogDescription className="text-xs">
                  {reportTitleFor(sample.condition)} · A4. Use o painel lateral para ajustar as escalas.
                </DialogDescription>
              </DialogHeader>
              <div className="flex h-[calc(92vh-9rem)] flex-col gap-4 overflow-hidden px-4 py-3 lg:flex-row lg:items-start">
                <div className="flex-1 min-w-0 h-full rounded-lg border bg-muted/40 p-3 overflow-auto">
                  <div style={{ width: "210mm" }} className="mx-auto">
                    <TriaxialReport
                      sample={{
                        ...sample,
                        coordN: ctx?.coords?.N ?? sample.coordN,
                        coordE: ctx?.coords?.E ?? sample.coordE,
                        coordCota: ctx?.coords?.cota ?? sample.coordCota,
                        coordDatum: ctx?.coords?.datum ?? sample.coordDatum,
                        ...(() => {
                          // Cada revisão tem o seu próprio verificador/aprovador.
                          // Usa o registro mais recente (revisão em curso ou última fechada).
                          const active = approvals[0];
                          return {
                            revision: active ? String(active.rev).padStart(2, "0") : sample.revision,
                            verifiedBy: active?.verified_by_name ?? "",
                            approvedBy: active?.status === "aprovado" ? (active.decided_by_name ?? "") : "",
                          };
                        })(),
                      }}
                      specimens={sortedSpecimens}
                      results={results}
                      envelope={envelope}
                      envelopePts={envelopePts}
                      photos={ctx?.photos ?? []}
                      axisCfg={axisCfg}
                    />
                  </div>
                </div>
                <aside className="w-full shrink-0 h-full overflow-hidden lg:w-[340px]">
                  <div className="flex h-full flex-col rounded-lg border border-border bg-card shadow-sm">
                      <div className="border-b border-border p-4">
                        <button
                          type="button"
                          onClick={() => setAxisPanelOpen((v) => !v)}
                          className="flex w-full items-center justify-between text-left"
                        >
                          <div className="text-sm font-semibold text-primary">Ajuste de Eixos dos Gráficos</div>
                          {axisPanelOpen ? <ChevronDown className="h-4 w-4 text-primary" /> : <ChevronRight className="h-4 w-4 text-primary" />}
                        </button>
                        {axisPanelOpen && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Define os limites de cada eixo aplicados aos gráficos do relatório. Deixe em 0 para escala automática.
                          </p>
                        )}
                        {axisPanelOpen && (
                        <>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="mt-3 w-full"
                          onClick={() => setAxisCfg(suggestedAxisCfg)}
                        >
                          Aplicar valores sugeridos pelos dados
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="mt-1 w-full"
                          onClick={() =>
                            setAxisCfg({
                              eaMax: 0, qMax: 0, sigmaDMax: 0, evMin: 0, evMax: 0,
                              pMax: 0, sigmaMax: 0, tauMax: 0, sqrtTMax: 0, dvMax: 0,
                              dvShearMin: 0, dvShearMax: 0,
                              eModMax: 0, ratioMax: 0,
                            })
                          }
                        >
                          Restaurar automático
                        </Button>
                        </>
                        )}
                      </div>
                      {axisPanelOpen && (
                      <div className="grid gap-3 overflow-y-auto overscroll-contain p-4">
                        <AxisGroup title="εa (%) — deformação axial">
                          <AxisField label="máximo" step="0.5" value={axisCfg.eaMax} onChange={(v) => updateAxis("eaMax", v)} />
                        </AxisGroup>
                        <AxisGroup title="σd = σ1 − σ3 (kPa) — tensão desvio">
                          <AxisField label="máximo" step="10" value={axisCfg.sigmaDMax} onChange={(v) => updateAxis("sigmaDMax", v)} />
                        </AxisGroup>
                        <AxisGroup title="t = (σ1 − σ3)/2 (kPa) — trajetória MIT">
                          <AxisField label="máximo" step="10" value={axisCfg.qMax} onChange={(v) => updateAxis("qMax", v)} />
                        </AxisGroup>
                        <AxisGroup title="εv (%) — deformação volumétrica">
                          <AxisField label="mínimo" step="0.5" value={axisCfg.evMin} onChange={(v) => updateAxis("evMin", v)} />
                          <AxisField label="máximo" step="0.5" value={axisCfg.evMax} onChange={(v) => updateAxis("evMax", v)} />
                        </AxisGroup>
                        <AxisGroup title="ΔV (cm³) — cisalhamento">
                          <AxisField label="mínimo (aumento vol.)" step="0.5" value={axisCfg.dvShearMin} onChange={(v) => updateAxis("dvShearMin", v)} />
                          <AxisField label="máximo (redução vol.)" step="0.5" value={axisCfg.dvShearMax} onChange={(v) => updateAxis("dvShearMax", v)} />
                        </AxisGroup>
                        <AxisGroup title="E (MPa) — módulo de deformabilidade">
                          <AxisField label="máximo" step="5" value={axisCfg.eModMax} onChange={(v) => updateAxis("eModMax", v)} />
                        </AxisGroup>
                        <AxisGroup title="σ'1/σ'3 — razão das tensões">
                          <AxisField label="máximo" step="0.5" value={axisCfg.ratioMax} onChange={(v) => updateAxis("ratioMax", v)} />
                        </AxisGroup>
                        <AxisGroup title="p' (kPa) — trajetória q–p'">
                          <AxisField label="máximo" step="10" value={axisCfg.pMax} onChange={(v) => updateAxis("pMax", v)} />
                        </AxisGroup>
                        <AxisGroup title="σ' (kPa) — círculos de Mohr">
                          <AxisField label="máximo" step="10" value={axisCfg.sigmaMax} onChange={(v) => updateAxis("sigmaMax", v)} />
                        </AxisGroup>
                        <AxisGroup title="τ (kPa) — círculos de Mohr">
                          <AxisField label="máximo" step="10" value={axisCfg.tauMax} onChange={(v) => updateAxis("tauMax", v)} />
                        </AxisGroup>
                        <AxisGroup title="√t (min^0,5) — adensamento">
                          <AxisField label="máximo" step="0.5" value={axisCfg.sqrtTMax} onChange={(v) => updateAxis("sqrtTMax", v)} />
                        </AxisGroup>
                        <AxisGroup title="ΔV (cm³) — adensamento">
                          <AxisField label="máximo" step="0.5" value={axisCfg.dvMax} onChange={(v) => updateAxis("dvMax", v)} />
                        </AxisGroup>
                      </div>
                      )}
                  </div>
                </aside>
              </div>
              <DialogFooter className="border-t px-4 py-3">
                <Button variant="outline" onClick={() => setReportOpen(false)}>
                  Fechar
                </Button>
                {(wfStatus === "digitacao" || wfStatus === "rejeitado" || wfStatus === "aprovado") && (
                  <Button
                    onClick={() => handleSaveVersion({ skipVerification: wfStatus === "aprovado" })}
                    disabled={saveBusy}
                    className="gap-2"
                  >
                    <Send className="h-4 w-4" />
                    {saveBusy
                      ? "Enviando…"
                      : wfStatus === "aprovado"
                        ? `Gerar Prévia ${String((approvals[0]?.rev ?? versions[0]?.rev ?? 0) + 1).padStart(2, "0")} — Enviar para aprovação`
                        : "Terminei a digitação — Enviar para verificação"}
                  </Button>
                )}
                <Button onClick={handleGeneratePdf} disabled={pdfBusy} className="gap-2">
                  <FileText className="h-4 w-4" />
                  {pdfBusy ? "Gerando PDF…" : "Baixar PDF"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Tabs>

        {/* Resultados finais — abaixo do menu, como solicitado */}
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Resultados finais</CardTitle>
            <CardDescription>Envoltória efetiva ajustada pelo conjunto de CPs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <SummaryStat label="φ' (efetivo)" value={envelope ? `${fmt(envelope.phiDeg, 1)}°` : "—"} />
              <SummaryStat label="c' (efetivo)" value={envelope ? `${fmt(envelope.cPrime, 1)} kPa` : "—"} />
              <SummaryStat label="R² (ajuste)" value={envelope ? fmt(envelope.r2, 3) : "—"} />
              <SummaryStat label="Nº CPs" value={String(specimens.length)} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* RELATÓRIO — cópia sempre montada, visível apenas na impressão */}
      <div ref={reportRef} className="print-only-report mx-auto my-6 flex flex-col items-center gap-4">
        <TriaxialReport
          sample={{
            ...sample,
            coordN: ctx?.coords?.N ?? sample.coordN,
            coordE: ctx?.coords?.E ?? sample.coordE,
            coordCota: ctx?.coords?.cota ?? sample.coordCota,
            coordDatum: ctx?.coords?.datum ?? sample.coordDatum,
            ...(() => {
              const active = approvals[0];
              return {
                revision: active ? String(active.rev).padStart(2, "0") : sample.revision,
                verifiedBy: active?.verified_by_name ?? "",
                approvedBy: active?.status === "aprovado" ? (active.decided_by_name ?? "") : "",
              };
            })(),
          }}
          specimens={sortedSpecimens}
          results={results}
          envelope={envelope}
          envelopePts={envelopePts}
          photos={ctx?.photos ?? []}
          axisCfg={axisCfg}
        />
      </div>

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
              Instruções técnicas, especificações de saturação B-check, tensões confinantes e critérios do ensaio Triaxial.
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
                <span className="font-semibold text-foreground">{sample.equipment || "Câmara Triaxial Automática"}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                <MessageSquareQuote className="h-4 w-4 text-amber-600" />
                Instruções Técnicas da Programação (Gantt)
              </label>
              <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-foreground font-medium leading-relaxed">
                {(ctx?.ensaio as any)?.observacoes || "Ensaio Triaxial CID: Realizar verificação do parâmetro B de Skempton (mínimo B >= 0.95). Consolidação isotrópica com registro de dissipação de poropressão antes do cisalhamento drenado."}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground">
                Critérios Operacionais & Detalhes da Amostra
              </label>
              <div className="p-3 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground leading-relaxed">
                {sample.description || "Solo fino indeformado. Manter velocidade de deformação axial constante controlada para garantir drenagem completa durante o ensaio."}
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

      <style>{`
        .print-only-report {
          position: fixed;
          left: -20000px;
          top: 0;
          display: flex;
          pointer-events: none;
        }
        @media print {
          .print-only-report {
            position: static !important;
            left: auto !important;
            top: auto !important;
          }
          .print-only-report > div { page-break-after: always; break-after: page; margin: 0 !important; }
          .print-only-report > div:last-child { page-break-after: auto; break-after: auto; }
          .printable-report { box-shadow: none !important; }
        }
      `}</style>
    </>
  );
}

/* ---------- Componentes auxiliares ---------- */

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function NumField({ label, value, onChange, step = 1, disabled }: { label: string; value: number; onChange: (v: number) => void; step?: number; disabled?: boolean }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={value} step={step} disabled={disabled} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />
    </div>
  );
}

function MiniNum({ value, onChange, step = 1 }: { value: number; onChange: (v: number) => void; step?: number }) {
  return <Input className="h-8 w-24" type="number" step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} />;
}

/** Cabeçalho de coluna com ícone "i" e fórmula em tooltip. */
function HeadWithInfo({ label, formula }: { label: React.ReactNode; formula: string }) {
  return (
    <div className="inline-flex items-center gap-1">
      <span>{label}</span>
      <UITooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Fórmula"
          >
            <Info className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[280px] whitespace-pre-line text-[11px]">
          {formula}
        </TooltipContent>
      </UITooltip>
    </div>
  );
}

/**
 * Seção de cisalhamento drenado — dados de entrada em faixa retrátil
 * (com fórmulas em tooltips) e gráficos empilhados abaixo.
 */
function ShearPhaseSection({
  cp,
  res,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
}: {
  cp: TriaxialSpecimen;
  res: SpecimenResults;
  onUpdateRow: (rowIdx: number, patch: Partial<ShearReading>) => void;
  onAddRow: () => void;
  onRemoveRow: (rowIdx: number) => void;
}) {
  const [dataOpen, setDataOpen] = useState(true);
  const H0 = cp.H0 || 1;
  const V0 = res.V0 || 1;
  const Hc = res.Hc || H0;               // altura após adensamento [mm]
  const Ac = res.Ac || 1;                // área após adensamento [cm²]
  const Vc = res.Vc || V0;               // volume após adensamento [cm³]
  const D0c = Math.sqrt((4 * Ac) / Math.PI); // Ø corrigido pós-adensamento [cm]
  const Vs = V0 / (1 + (res.e0 || 0));   // vol. de sólidos (constante) [cm³]
  const G = 9.80665;                     // gravidade [m/s²] p/ kgf→N

  // Handlers de entrada — armazenam o dado bruto e a fração derivada.
  const handleDispCm = (ri: number, cm: number) => {
    const mm = cm * 10;
    onUpdateRow(ri, { dispMm: mm, eaPct: (mm / Hc) * 100 });
  };
  const handleDv = (ri: number, cm3: number) =>
    onUpdateRow(ri, { dVcm3: cm3, dvPct: (cm3 / Vc) * 100 });
  const handleLoad = (ri: number, kgf: number) =>
    onUpdateRow(ri, { loadKgf: kgf, F: kgf * G });

  return (
    <TooltipProvider delayDuration={100}>
      <Card>
        <CardHeader
          className="cursor-pointer select-none pb-2"
          onClick={() => setDataOpen((v) => !v)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {dataOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <CardTitle className="text-sm">
                Cisalhamento drenado — dados de entrada — {cp.displayId ?? cp.id}
              </CardTitle>
            </div>
            <CardDescription className="text-xs">
              {cp.shear.length} leitura(s) · H₀={fmt(H0, 2)} mm · V₀={fmt(V0, 2)} cm³
            </CardDescription>
          </div>
        </CardHeader>
        {dataOpen && (
          <CardContent className="space-y-2">
            <div className="max-h-[420px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/60">
                    <TableHead className="w-8 text-center">#</TableHead>
                    <TableHead className="text-center">
                      <div className="flex flex-col items-center leading-tight">
                        <HeadWithInfo label="Carga Axial" formula={"Carga axial lida na célula de carga.\nF [N] = Carga [kgf] · 9,80665"} />
                        <span className="text-[10px] text-muted-foreground">(kgf)</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="flex flex-col items-center leading-tight">
                        <HeadWithInfo label="Desloca." formula={"Deslocamento axial medido (LVDT/dial).\nΔh [mm] = Desloca [cm] · 10"} />
                        <span className="text-[10px] text-muted-foreground">(cm)</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="flex flex-col items-center leading-tight">
                        <HeadWithInfo label="σ₃ Corrigida" formula={"Tensão confinante efetiva corrigida\n(compensa coluna de água / calibração).\nSe vazio: σ₃ = σ₃,alvo."} />
                        <span className="text-[10px] text-muted-foreground">(kPa)</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="flex flex-col items-center leading-tight">
                        <HeadWithInfo label="Poropressão" formula={"Poropressão medida (contra-pressão).\nCID: u ≈ u_back.\nSe vazio: u = u_back."} />
                        <span className="text-[10px] text-muted-foreground">(kPa)</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="flex flex-col items-center leading-tight">
                        <HeadWithInfo label="Variação de Volume" formula={"ΔV drenado (bureta), (+) compressão."} />
                        <span className="text-[10px] text-muted-foreground">(cm³)</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center text-muted-foreground">
                      <div className="flex flex-col items-center leading-tight">
                        <HeadWithInfo label="Volume do CP" formula={"V = V_c − ΔV\nV_c = volume após adensamento."} />
                        <span className="text-[10px]">(cm³)</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center text-muted-foreground">
                      <div className="flex flex-col items-center leading-tight">
                        <HeadWithInfo label="Força Aplicada" formula={"F [kN] = Carga [kgf] · 9,80665 / 1000"} />
                        <span className="text-[10px]">(kN)</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center text-muted-foreground">
                      <div className="flex flex-col items-center leading-tight">
                        <HeadWithInfo label="Def. Axial Específ." formula={"εa = Δh / H_c · 100\nH_c = altura após adensamento."} />
                        <span className="text-[10px]">(%)</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center text-muted-foreground">
                      <div className="flex flex-col items-center leading-tight">
                        <HeadWithInfo label="(Δaᵥ)m" formula={"ISO 17892-9:2018 — deslocamento radial médio\nno meio do CP (assumindo cilindro reto):\n(Δaᵥ)m = (D_corr − D_c) / 2"} />
                        <span className="text-[10px]">ISO 17892-9 (cm)</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center text-muted-foreground">
                      <div className="flex flex-col items-center leading-tight">
                        <HeadWithInfo label="Ø Corrigido" formula={"D_corr = √(4·A / π)"} />
                        <span className="text-[10px]">(cm)</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center text-muted-foreground">
                      <div className="flex flex-col items-center leading-tight">
                        <HeadWithInfo label="Área Corrigida" formula={"ISO 17892-9 / Bishop & Henkel:\nA = A_c · (1 − εv) / (1 − εa)"} />
                        <span className="text-[10px]">(cm²)</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center text-muted-foreground">
                      <div className="flex flex-col items-center leading-tight">
                        <HeadWithInfo label="Índ. Vazios" formula={"e = V / V_s − 1\nV_s = V₀ / (1 + e₀)  (constante)"} />
                        <span className="text-[10px]">(—)</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center text-muted-foreground">
                      <div className="flex flex-col items-center leading-tight">
                        <HeadWithInfo label="Tensão Desvio" formula={"σ_d = (F[N] / A[cm²]) · 10  [kPa]"} />
                        <span className="text-[10px]">(kPa)</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center text-muted-foreground">
                      <div className="flex flex-col items-center leading-tight">
                        <HeadWithInfo label="t" formula={"Convenção MIT / ISO 17892-9 Anexo B:\nt = (σ₁ − σ₃) / 2 = σ_d / 2"} />
                        <span className="text-[10px]">(kPa)</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center text-muted-foreground">
                      <div className="flex flex-col items-center leading-tight">
                        <HeadWithInfo label="s'" formula={"Convenção MIT / ISO 17892-9 Anexo B:\ns' = (σ₁' + σ₃') / 2\nσ₃' = σ₃ − u ; σ₁' = σ₃' + σ_d"} />
                        <span className="text-[10px]">(kPa)</span>
                      </div>
                    </TableHead>
                    <TableHead className="text-center text-muted-foreground">
                      <div className="flex flex-col items-center leading-tight">
                        <HeadWithInfo label="σ'₁/σ'₃" formula={"Razão de tensões efetivas principais."} />
                        <span className="text-[10px]">(—)</span>
                      </div>
                    </TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cp.shear.map((r, ri) => {
                    const dispCm = (r.dispMm ?? (r.eaPct / 100) * Hc) / 10;
                    const dvCm3 = r.dVcm3 ?? (r.dvPct / 100) * Vc;
                    const loadKgf =
                      r.loadKgf ?? (r.F ? r.F / G : 0);
                    const c = res.shearCurve[ri];
                    const F_kN = (loadKgf * G) / 1000;
                    const V_cp = Vc - dvCm3;
                    const A_cm2 = c?.A ?? Ac;
                    const D_corr = Math.sqrt((4 * A_cm2) / Math.PI);
                    const dAvM = (D_corr - D0c) / 2;
                    const e_row = Vs > 0 ? V_cp / Vs - 1 : 0;
                    const ratio =
                      c && c.sigma3Prime > 0 ? c.sigma1Prime / c.sigma3Prime : 0;
                    return (
                      <TableRow key={ri}>
                        <TableCell className="text-xs text-muted-foreground">{ri + 1}</TableCell>
                        <TableCell><MiniNum value={loadKgf} step={0.01} onChange={(v) => handleLoad(ri, v)} /></TableCell>
                        <TableCell><MiniNum value={dispCm} step={0.001} onChange={(v) => handleDispCm(ri, v)} /></TableCell>
                        <TableCell><MiniNum value={r.sigma3Corr ?? 0} step={0.1} onChange={(v) => onUpdateRow(ri, { sigma3Corr: v || undefined })} /></TableCell>
                        <TableCell><MiniNum value={r.uPore ?? 0} step={0.1} onChange={(v) => onUpdateRow(ri, { uPore: v || undefined })} /></TableCell>
                        <TableCell><MiniNum value={dvCm3} step={0.01} onChange={(v) => handleDv(ri, v)} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmt(V_cp, 2)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmt(F_kN, 4)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmt(r.eaPct, 3)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmt(dAvM, 4)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmt(D_corr, 3)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmt(A_cm2, 3)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmt(e_row, 3)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmt(c?.sigmaD, 1)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmt(c?.q, 1)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmt(c?.pPrime, 1)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmt(ratio, 2)}</TableCell>
                        <TableCell>
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => onRemoveRow(ri)}
                            title="Remover linha"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between">
              <Button size="sm" variant="outline" onClick={onAddRow}>
                <Plus className="mr-1 h-3 w-3" /> Adicionar leitura
              </Button>
              {res.failure && (
                <div className="text-xs text-muted-foreground">
                  Ruptura em εa={fmt(res.failure.eaPct, 2)}% · q_f={fmt(res.failure.q, 1)} kPa
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Gráficos — {cp.displayId ?? cp.id}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="h-[260px]">
            <ResponsiveContainer>
              <ComposedChart data={res.shearCurve} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
                <XAxis dataKey="eaPct" type="number"><RLabel value="εa (%)" position="insideBottom" offset={-8} fontSize={11} /></XAxis>
                <YAxis><RLabel value="σd = (σ1−σ3) (kPa)" angle={-90} position="insideLeft" fontSize={11} /></YAxis>
                <Tooltip formatter={(v: number) => fmt(v, 1)} />
                <Line type="monotone" dataKey="sigmaD" stroke={BRAND} dot={false} strokeWidth={2} />
                {res.failure && <ReferenceLine x={res.failure.eaPct} stroke={ACCENT} label={{ value: "ruptura", fontSize: 10, fill: ACCENT }} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <ComposedChart data={res.shearCurve} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
                <XAxis dataKey="eaPct" type="number"><RLabel value="εa (%)" position="insideBottom" offset={-8} fontSize={11} /></XAxis>
                <YAxis><RLabel value="εv (%)" angle={-90} position="insideLeft" fontSize={11} /></YAxis>
                <Tooltip formatter={(v: number) => fmt(v, 2)} />
                <ReferenceLine y={0} stroke="#999" />
                <Line type="monotone" dataKey="evPct" stroke={ACCENT} dot={false} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer>
              <ComposedChart data={res.shearCurve} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
                <XAxis dataKey="pPrime" type="number"><RLabel value="s' (kPa)" position="insideBottom" offset={-8} fontSize={11} /></XAxis>
                <YAxis dataKey="q" type="number"><RLabel value="t (kPa)" angle={-90} position="insideLeft" fontSize={11} /></YAxis>
                <Tooltip formatter={(v: number) => fmt(v, 1)} />
                <Line type="monotone" dataKey="q" stroke={BRAND} dot={false} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {res.failure && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 text-sm">
              <Stat label="εa,f" value={`${fmt(res.failure.eaPct, 2)} %`} />
              <Stat label="q_f" value={`${fmt(res.failure.q, 1)} kPa`} />
              <Stat label="s'_f" value={`${fmt(res.failure.pPrime, 1)} kPa`} />
              <Stat label="σ1'_f" value={`${fmt(res.failure.sigma1Prime, 1)} kPa`} />
              <Stat label="σ3'_f" value={`${fmt(res.failure.sigma3Prime, 1)} kPa`} />
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

function CpSelector({
  specimens,
  selectedId,
  onSelect,
  onRemove,
  canRemove,
}: {
  specimens: TriaxialSpecimen[];
  selectedId: string;
  onSelect: (id: string) => void;
  onRemove?: (id: string) => void;
  canRemove?: boolean;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-border pb-1">
      {specimens.map((c) => {
        const active = selectedId === c.id;
        return (
          <div
            key={c.id}
            className={`group relative flex items-center gap-1 rounded-t-md px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition ${
              active ? "ring-primary" : "ring-border hover:ring-primary/50"
            }`}
            style={{
              background: active ? c.color ?? BRAND : "transparent",
              color: active ? "#fff" : c.color ?? BRAND,
            }}
          >
            <button type="button" onClick={() => onSelect(c.id)}>
              {c.displayId ?? c.id} — σ3'={c.sigma3Target} kPa
            </button>
            {onRemove && canRemove && (
              <button
                type="button"
                title={`Remover ${c.displayId ?? c.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(c.id);
                }}
                className={`ml-1 rounded p-0.5 ${
                  active ? "hover:bg-white/20" : "hover:bg-destructive/10"
                }`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Dialog para inserir 5 medições e retornar a média. */
function AvgMeasureDialog({
  label,
  unit,
  values,
  onSave,
  triggerLabel,
}: {
  label: string;
  unit: string;
  values: number[];
  onSave: (avg: number, values: number[]) => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<number[]>(() => {
    const base = [...(values ?? [])];
    while (base.length < 5) base.push(0);
    return base.slice(0, 5);
  });
  const nonZero = vals.filter((v) => v > 0);
  const avg = nonZero.length ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;
  return (
    <Dialog open={open} onOpenChange={(o) => {
      setOpen(o);
      if (o) {
        const base = [...(values ?? [])];
        while (base.length < 5) base.push(0);
        setVals(base.slice(0, 5));
      }
    }}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1 px-2">
          <Ruler className="h-3.5 w-3.5" />
          {triggerLabel ?? "Medir"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            Informe até 5 medições ({unit}). A média das medições preenchidas é usada.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-5 gap-2 py-2">
          {vals.map((v, i) => (
            <div key={i}>
              <Label className="text-[10px] text-muted-foreground">#{i + 1}</Label>
              <Input
                type="number"
                step={0.01}
                value={v}
                onChange={(e) =>
                  setVals((s) => s.map((x, xi) => (xi === i ? parseFloat(e.target.value) || 0 : x)))
                }
              />
            </div>
          ))}
        </div>
        <div className="rounded-md border bg-muted/40 p-2 text-sm">
          Média ({nonZero.length} medição{nonZero.length === 1 ? "" : "es"}):{" "}
          <b>{avg > 0 ? avg.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</b> {unit}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={() => {
              onSave(avg, vals);
              setOpen(false);
            }}
          >
            Salvar média
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Ficha de moldagem por CP — layout inspirado na planilha padrão do laboratório. */

function PtNumInput({
  value,
  onChange,
  className = "h-7 text-xs text-right font-mono",
  placeholder,
  disabled,
}: {
  value: number | null | undefined;
  onChange: (val: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [localVal, setLocalVal] = useState(() =>
    value == null || isNaN(value) ? "" : String(value).replace(".", ",")
  );

  useEffect(() => {
    const formatted = value == null || isNaN(value) ? "" : String(value).replace(".", ",");
    setLocalVal(formatted);
  }, [value]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={localVal}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
      onChange={(e) => {
        const text = e.target.value;
        setLocalVal(text);
        const parsed = parseFloat(text.replace(",", "."));
        if (!isNaN(parsed)) {
          onChange(parsed);
        } else if (text.trim() === "") {
          onChange(0);
        }
      }}
      onBlur={() => {
        const parsed = parseFloat(localVal.replace(",", "."));
        if (!isNaN(parsed)) {
          setLocalVal(String(parsed).replace(".", ","));
          onChange(parsed);
        }
      }}
    />
  );
}

function MoldagemFicha({
  cp,
  res,
  sample,
  onCp,
  capsOpen,
  onToggleCaps,
  geomOpen,
  onToggleGeom,
  indicesOpen,
  onToggleIndices,
  finalOpen,
  onToggleFinal,
}: {
  cp: TriaxialSpecimen;
  res: ReturnType<typeof processSpecimen>;
  sample: TriaxialSample;
  onCp: (patch: Partial<TriaxialSpecimen>) => void;
  capsOpen: boolean;
  onToggleCaps: () => void;
  geomOpen: boolean;
  onToggleGeom: () => void;
  indicesOpen: boolean;
  onToggleIndices: () => void;
  finalOpen: boolean;
  onToggleFinal: () => void;
}) {
  const caps = cp.capsules ?? [
    { tara: 0, wet: 0, dry: 0 },
    { tara: 0, wet: 0, dry: 0 },
    { tara: 0, wet: 0, dry: 0 },
  ];
  const updateCap = (i: number, patch: Partial<import("@/features/triaxial-cid/types").MoistureCapsule>) => {
    const next = caps.map((c, ci) => (ci === i ? { ...c, ...patch } : c));
    onCp({ capsules: next });
  };
  const wCap = (c: { tara: number; wet: number; dry: number }) => {
    const ms = c.dry - c.tara;
    return ms > 0 ? ((c.wet - c.dry) / ms) * 100 : NaN;
  };

  // ===== Etapa Final: cápsulas de umidade + massa final do CP =====
  const finalCaps = cp.finalCapsules ?? [
    { tara: 0, wet: 0, dry: 0 },
    { tara: 0, wet: 0, dry: 0 },
    { tara: 0, wet: 0, dry: 0 },
  ];
  const updateFinalCap = (i: number, patch: Partial<import("@/features/triaxial-cid/types").MoistureCapsule>) => {
    const next = finalCaps.map((c, ci) => (ci === i ? { ...c, ...patch } : c));
    const valid = next.map(wCap).filter((v) => isFinite(v));
    const avg = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : undefined;
    onCp({ finalCapsules: next, ...(avg != null ? { wFinalPct: Number(avg.toFixed(3)) } : {}) });
  };
  const wFinalFromCaps = (() => {
    const vs = finalCaps.map(wCap).filter((v) => isFinite(v));
    return vs.length > 0 ? vs.reduce((a, b) => a + b, 0) / vs.length : NaN;
  })();
  const wFinalEff = isFinite(wFinalFromCaps) ? wFinalFromCaps : (cp.wFinalPct ?? NaN);
  const mFinal = cp.mFinal ?? 0;
  const dryMassFinal = mFinal > 0 && isFinite(wFinalEff) ? mFinal / (1 + wFinalEff / 100) : NaN;
  // Aproximação: e_f ≈ e_após_adensamento (variação de vazios no cisalhamento omitida aqui)
  const eFinalApprox = res.eAfterCons;
  const SrFinal = isFinite(wFinalEff) && eFinalApprox > 0 && sample.Gs > 0
    ? Math.min(100, (wFinalEff / 100) * sample.Gs / eFinalApprox * 100)
    : NaN;
  const gammaNatFinal = res.Vc > 0 && mFinal > 0 ? (mFinal / res.Vc) * 9.81 : NaN;
  const gammaDryFinal = res.Vc > 0 && isFinite(dryMassFinal) && dryMassFinal > 0 ? (dryMassFinal / res.Vc) * 9.81 : NaN;
  const deltaW = isFinite(wFinalEff) ? wFinalEff - res.w0Pct : NaN;
  const deltaM = mFinal > 0 ? mFinal - res.wetMass : NaN;

  return (
    <div className="space-y-3">
      {/* CONTAINER RECOLHÍVEL: DETERMINAÇÃO DA UMIDADE (INICIAL E FINAL) */}
      <Card className="border-primary/30 shadow-sm overflow-hidden">
        <CardHeader
          className="cursor-pointer select-none pb-2 pt-3 px-4 hover:bg-muted/40 transition-colors border-b border-border/40"
          onClick={onToggleCaps}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {capsOpen ? (
                <ChevronDown className="h-4 w-4 text-primary" />
              ) : (
                <ChevronRight className="h-4 w-4 text-primary" />
              )}
              <div>
                <CardTitle className="text-sm font-bold text-primary flex items-center gap-2">
                  <Beaker className="h-4 w-4" /> Determinação da Umidade da Amostra — Cápsulas (Inicial e Final) — {cp.displayId ?? cp.id}
                </CardTitle>
                <CardDescription className="text-[11px]">
                  3 determinações com pesagens para cada etapa do ensaio (clique para recolher/expandir)
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-semibold bg-background border-primary/30 text-primary">
                w₀ Inicial = {fmt(res.w0Pct, 2)}%
              </Badge>
              <Badge variant="outline" className="text-xs font-semibold bg-background border-primary/30 text-primary">
                w_f Final = {isFinite(wFinalEff) ? fmt(wFinalEff, 2) : "—"}%
              </Badge>
            </div>
          </div>
        </CardHeader>

        {capsOpen && (
          <CardContent className="p-4 grid gap-4 md:grid-cols-2 bg-background">
            {/* Cápsulas Iniciais (Moldagem) */}
            <div className="border border-border/70 rounded-md p-3 bg-muted/10">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/50">
                <div className="font-bold text-xs text-primary">Umidade Inicial (Moldagem)</div>
                <Badge variant="secondary" className="text-[11px] font-bold">
                  Média w₀ = {fmt(res.w0Pct, 2)}%
                </Badge>
              </div>

              <table className="w-full border-collapse text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="border border-border p-1.5 text-left">Determinação</th>
                    <th className="border border-border p-1.5 text-center w-24">Cápsula 1</th>
                    <th className="border border-border p-1.5 text-center w-24">Cápsula 2</th>
                    <th className="border border-border p-1.5 text-center w-24">Cápsula 3</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-border p-1.5 font-medium">Tipo</td>
                    {caps.slice(0, 3).map((c, i) => (
                      <td key={i} className="border border-border p-1">
                        <Input
                          className="h-7 text-xs text-center"
                          value={c.tipo ?? ""}
                          onChange={(e) => updateCap(i, { tipo: e.target.value })}
                          placeholder="M"
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-border p-1.5 font-medium">Nº Cápsula</td>
                    {caps.slice(0, 3).map((c, i) => (
                      <td key={i} className="border border-border p-1">
                        <Input
                          className="h-7 text-xs text-center"
                          value={c.numero ?? ""}
                          onChange={(e) => updateCap(i, { numero: e.target.value })}
                          placeholder={`#${i + 1}`}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-border p-1.5 font-medium">Tara (g)</td>
                    {caps.slice(0, 3).map((c, i) => (
                      <td key={i} className="border border-border p-1">
                        <PtNumInput
                          value={c.tara}
                          onChange={(v) => updateCap(i, { tara: v })}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-border p-1.5 font-medium">Solo Úmido + Tara (g)</td>
                    {caps.slice(0, 3).map((c, i) => (
                      <td key={i} className="border border-border p-1">
                        <PtNumInput
                          value={c.wet}
                          onChange={(v) => updateCap(i, { wet: v })}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-border p-1.5 font-medium">Solo Seco + Tara (g)</td>
                    {caps.slice(0, 3).map((c, i) => (
                      <td key={i} className="border border-border p-1">
                        <PtNumInput
                          value={c.dry}
                          onChange={(v) => updateCap(i, { dry: v })}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-muted/30">
                    <td className="border border-border p-1.5 font-medium">Umidade (%)</td>
                    {caps.slice(0, 3).map((c, i) => {
                      const w = wCap(c);
                      return (
                        <td key={i} className="border border-border p-1.5 text-right font-semibold">
                          {isFinite(w) ? `${w.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>

              <div className="mt-3 pt-2 border-t border-border/40 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Massa inicial CP (g)</Label>
                  <PtNumInput
                    value={cp.wetMass}
                    onChange={(v) => onCp({ wetMass: v })}
                    className="h-8 text-xs text-right font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Cápsulas Finais (Pós-Ensaio) */}
            <div className="border border-border/70 rounded-md p-3 bg-muted/10">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/50">
                <div className="font-bold text-xs text-primary">Umidade Final (Pós-Ensaio)</div>
                <Badge variant="secondary" className="text-[11px] font-bold">
                  Média w_f = {isFinite(wFinalEff) ? fmt(wFinalEff, 2) : "—"}%
                </Badge>
              </div>

              <table className="w-full border-collapse text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="border border-border p-1.5 text-left">Determinação</th>
                    <th className="border border-border p-1.5 text-center w-24">Cápsula 1</th>
                    <th className="border border-border p-1.5 text-center w-24">Cápsula 2</th>
                    <th className="border border-border p-1.5 text-center w-24">Cápsula 3</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-border p-1.5 font-medium">Tipo</td>
                    {finalCaps.slice(0, 3).map((c, i) => (
                      <td key={i} className="border border-border p-1">
                        <Input
                          className="h-7 text-xs text-center"
                          value={c.tipo ?? ""}
                          onChange={(e) => updateFinalCap(i, { tipo: e.target.value })}
                          placeholder="F"
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-border p-1.5 font-medium">Nº Cápsula</td>
                    {finalCaps.slice(0, 3).map((c, i) => (
                      <td key={i} className="border border-border p-1">
                        <Input
                          className="h-7 text-xs text-center"
                          value={c.numero ?? ""}
                          onChange={(e) => updateFinalCap(i, { numero: e.target.value })}
                          placeholder={`#${i + 1}`}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-border p-1.5 font-medium">Tara (g)</td>
                    {finalCaps.slice(0, 3).map((c, i) => (
                      <td key={i} className="border border-border p-1">
                        <PtNumInput
                          value={c.tara}
                          onChange={(v) => updateFinalCap(i, { tara: v })}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-border p-1.5 font-medium">Solo Úmido + Tara (g)</td>
                    {finalCaps.slice(0, 3).map((c, i) => (
                      <td key={i} className="border border-border p-1">
                        <PtNumInput
                          value={c.wet}
                          onChange={(v) => updateFinalCap(i, { wet: v })}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-border p-1.5 font-medium">Solo Seco + Tara (g)</td>
                    {finalCaps.slice(0, 3).map((c, i) => (
                      <td key={i} className="border border-border p-1">
                        <PtNumInput
                          value={c.dry}
                          onChange={(v) => updateFinalCap(i, { dry: v })}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-muted/30">
                    <td className="border border-border p-1.5 font-medium">Umidade (%)</td>
                    {finalCaps.slice(0, 3).map((c, i) => {
                      const w = wCap(c);
                      return (
                        <td key={i} className="border border-border p-1.5 text-right font-semibold">
                          {isFinite(w) ? `${w.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>

              <div className="mt-3 pt-2 border-t border-border/40 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Massa final CP m_f (g)</Label>
                  <PtNumInput
                    value={cp.mFinal ?? 0}
                    onChange={(v) => onCp({ mFinal: v })}
                    className="h-8 text-xs text-right font-mono"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
      
      {/* Geometria + programa — retrátil */}
      <div className="rounded-md border border-border">
        <button
          type="button"
          onClick={onToggleGeom}
          className="flex w-full items-center justify-between border-b border-border/40 bg-muted/40 hover:bg-muted/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors text-primary"
        >
          <span className="flex items-center gap-2">
            {geomOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Geometria e programa — {cp.displayId ?? cp.id}
          </span>
          <span className="text-[10px] font-normal text-muted-foreground">
            D₀={fmt(cp.D0, 2)} mm · H₀={fmt(cp.H0, 2)} mm · σ3'={cp.sigma3Target} kPa
          </span>
        </button>
        {geomOpen && (
          <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-4">
            <div>
              <Label className="text-xs">Diâmetro CP D₀ (mm)</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  step={0.01}
                  value={cp.D0}
                  onChange={(e) => onCp({ D0: parseFloat(e.target.value) || 0 })}
                />
                <AvgMeasureDialog
                  label={`Diâmetro D₀ — ${cp.displayId ?? cp.id}`}
                  unit="mm"
                  values={cp.D0measurements ?? []}
                  onSave={(avg, vals) => onCp({ D0: avg, D0measurements: vals })}
                />
              </div>
              {cp.D0measurements && cp.D0measurements.some((v) => v > 0) && (
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {cp.D0measurements.filter((v) => v > 0).length} medições registradas
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs">Altura CP H₀ (mm)</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  step={0.01}
                  value={cp.H0}
                  onChange={(e) => onCp({ H0: parseFloat(e.target.value) || 0 })}
                />
                <AvgMeasureDialog
                  label={`Altura H₀ — ${cp.displayId ?? cp.id}`}
                  unit="mm"
                  values={cp.H0measurements ?? []}
                  onSave={(avg, vals) => onCp({ H0: avg, H0measurements: vals })}
                />
              </div>
              {cp.H0measurements && cp.H0measurements.some((v) => v > 0) && (
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {cp.H0measurements.filter((v) => v > 0).length} medições registradas
                </div>
              )}
            </div>
            <NumField label="σ3' alvo (kPa)" value={cp.sigma3Target} onChange={(v) => onCp({ sigma3Target: v })} />
            <div>
              <Label className="text-xs">Critério de ruptura</Label>
              <Select value={cp.failureCriterion} onValueChange={(v) => onCp({ failureCriterion: v as TriaxialSpecimen["failureCriterion"] })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="max_q">Máx. q</SelectItem>
                  <SelectItem value="max_ratio">Máx. σ1'/σ3'</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Índices calculados — retrátil */}
      <div className="rounded-md border border-border">
        <button
          type="button"
          onClick={onToggleIndices}
          className="flex w-full items-center justify-between border-b border-border/40 bg-muted/40 hover:bg-muted/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors text-primary"
        >
          <span className="flex items-center gap-2">
            {indicesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Índices físicos calculados — {cp.displayId ?? cp.id}
          </span>
          <span className="text-[10px] font-normal text-muted-foreground">
            e₀={fmt(res.e0, 3)} · Sr₀={fmt(res.Sr0, 1)}%
          </span>
        </button>
        {indicesOpen && (
          <div className="grid grid-cols-2 gap-2 bg-muted/20 p-3 text-[11px] sm:grid-cols-4">
            <Stat label="Volume V₀" value={`${fmt(res.V0, 2)} cm³`} />
            <Stat label="Área A₀" value={`${fmt(res.A0, 2)} cm²`} />
            <Stat label="γ natural" value={`${fmt(res.gammaNat, 2)} kN/m³`} />
            <Stat label="γ seca" value={`${fmt(res.gammaDry, 2)} kN/m³`} />
            <Stat label="Massa seca CP" value={`${fmt(res.dryMass, 2)} g`} />
            <Stat label="Índice de vazios e₀" value={fmt(res.e0, 3)} />
            <Stat label="Sr₀" value={`${fmt(res.Sr0, 1)} %`} />
            <Stat label="Umidade média w₀" value={`${fmt(res.w0Pct, 2)} %`} />
          </div>
        )}
      </div>

      </div>
  );
}

/** Círculos de Mohr + envoltória em (σn, τ). */
function MohrChart({
  specimens,
  results,
  envelope,
  sigmaMax: sigmaMaxProp,
  tauMax: tauMaxProp,
}: {
  specimens: TriaxialSpecimen[];
  results: ReturnType<typeof processSpecimen>[];
  envelope: ReturnType<typeof fitEnvelope>;
  sigmaMax?: number;
  tauMax?: number;
}) {
  const circles = results
    .map((r, i) =>
      r.failure
        ? {
            id: specimens[i].id,
            displayId: specimens[i].displayId ?? specimens[i].id,
            color: specimens[i].color ?? BRAND,
            sigma3Target: specimens[i].sigma3Target ?? 0,
            data: mohrCirclePoints(r.failure.sigma3Prime, r.failure.sigma1Prime),
          }
        : null,
    )
    .filter((x): x is { id: string; displayId: string; color: string; sigma3Target: number; data: { sigma: number; tau: number }[] } => x != null);

  const autoSigma = Math.max(1, ...circles.flatMap((c) => c.data.map((p) => p.sigma))) * 1.1;
  const autoTau = Math.max(1, ...circles.flatMap((c) => c.data.map((p) => p.tau))) * 1.4;
  const maxSigma = sigmaMaxProp && sigmaMaxProp > 0 ? sigmaMaxProp : autoSigma;
  const maxTau = tauMaxProp && tauMaxProp > 0 ? tauMaxProp : autoTau;

  const envLine = envelope
    ? [
        { sigma: 0, tau: envelope.cPrime },
        {
          sigma: maxSigma,
          tau: envelope.cPrime + Math.tan((envelope.phiDeg * Math.PI) / 180) * maxSigma,
        },
      ]
    : null;

  return (
    <div className="h-full min-h-[240px] w-full">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 28, right: 20, bottom: 56, left: 14 }}>
          <CartesianGrid stroke="#eee" strokeDasharray="3 3" />
          <XAxis type="number" dataKey="sigma" domain={[0, maxSigma]} ticks={equalTicks(0, maxSigma)} interval={0}>
            <RLabel value="σ' (kPa)" position="insideBottom" offset={-24} fontSize={11} />
          </XAxis>
          <YAxis type="number" dataKey="tau" domain={[0, maxTau]} ticks={equalTicks(0, maxTau)} interval={0}>
            <RLabel value="τ (kPa)" angle={-90} position="insideLeft" offset={-2} fontSize={11} />
          </YAxis>
          <Tooltip formatter={(v: number) => fmt(v, 1)} />
          <Legend wrapperStyle={{ fontSize: 9 }} verticalAlign="top" />
          {circles.map((c) => (
            <Scatter
              key={c.id}
              data={c.data}
              name={`${c.displayId ?? c.id} · σ'3=${fmt(c.sigma3Target, 0)} kPa`}
              line={{ stroke: c.color, strokeWidth: 2 }}
              shape={() => <g />}
              fill={c.color}
            />
          ))}
          {envLine && (
            <Scatter
              data={envLine}
              name={`Envoltória: φ'=${fmt(envelope!.phiDeg, 1)}°, c'=${fmt(envelope!.cPrime, 1)} kPa`}
              line={{ stroke: ACCENT, strokeWidth: 2, strokeDasharray: "6 4" }}
              shape={() => <g />}
              fill={ACCENT}
            />
          )}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Relatório A4 ---------- */

/** Quadro resumo dos resultados — layout vertical (linhas = características, colunas = CPs). */
function SummaryTablePage({
  sample,
  specimens,
  results,
  envelope,
}: {
  sample: TriaxialSample;
  specimens: TriaxialSpecimen[];
  results: ReturnType<typeof processSpecimen>[];
  envelope: ReturnType<typeof fitEnvelope>;
}) {
  // Derivações por CP
  const rowData = specimens.map((cp, i) => {
    const r = results[i];
    // Diâmetro após adensamento a partir de Ac (cm²) → mm
    const Df_mm = r.Ac > 0 ? Math.sqrt((4 * r.Ac) / Math.PI) * 10 : NaN;
    // εv final (% do V0 após todo o ensaio, adensamento + cisalhamento)
    const evShearLast = r.shearCurve.length > 0 ? r.shearCurve[r.shearCurve.length - 1].evPct : 0;
    const evConsPct = r.V0 > 0 ? (r.dVcons / r.V0) * 100 : 0;
    const evTotalPct = evConsPct + evShearLast;
    // e_f a partir de e0 e εv total: (1+e_f) = (1+e0)·(1 − εv/100)
    const eFinal = (1 + r.e0) * (1 - evTotalPct / 100) - 1;
    // Grau de saturação final (aprox., quando umidade final informada)
    const Sf =
      cp.wFinalPct != null && eFinal > 0 && sample.Gs > 0
        ? (cp.wFinalPct * sample.Gs) / eFinal
        : null;
    // p (total) na ruptura ≈ (σ1+σ3)/2 usando σ3' + backPressure (para CID saturado).
    // Para CID drenado Δu≈0 na ruptura → σ_total ≈ σ' + u_back.
    const uBack = sample.condition === "saturado" ? cp.backPressure : 0;
    const sig1Total = r.failure ? r.failure.sigma1Prime + uBack : NaN;
    const sig3Total = r.failure ? r.failure.sigma3Prime + uBack : NaN;
    const pTotal = r.failure ? (sig1Total + sig3Total) / 2 : NaN;
    const failCritLabel =
      cp.failureCriterion === "max_ratio" ? "Máx. Obliquidade (σ1'/σ3')" : "Máx. t = (σ1−σ3)/2";
    return { cp, r, Df_mm, evConsPct, evTotalPct, eFinal, Sf, pTotal, failCritLabel };
  });

  const rhoSat = (r: ReturnType<typeof processSpecimen>) => r.gammaNat / 9.81; // g/cm³
  const rhoDry = (r: ReturnType<typeof processSpecimen>) => r.gammaDry / 9.81; // g/cm³
  const rhoS = sample.Gs * sample.rhoW;

  const cell = "border border-[#141414]/60 px-1 py-[2px] text-[8.5px] text-center";
  const cellL = "border border-[#141414]/60 px-1 py-[2px] text-[8.5px] text-left";

  const Row = ({
    label,
    values,
    unit,
  }: {
    label: string;
    values: (string | number | null | undefined)[];
    unit?: string;
  }) => (
    <tr>
      <td className={cellL}>
        {label} {unit && <span className="text-[#141414]/70">[{unit}]</span>}
      </td>
      {values.map((v, i) => (
        <td key={i} className={cell}>{v ?? "—"}</td>
      ))}
    </tr>
  );

  return (
    <div className="space-y-1 text-[10px] text-[#141414]">
      <div className="rounded-t border border-[#141414] bg-[#141414]/10 px-2 py-1 text-center text-[11px] font-bold uppercase tracking-wide">
        Quadro Resumo dos Resultados
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${cell} bg-[#141414]/5 text-left`}>Característica da Amostra</th>
            {specimens.map((cp) => (
              <th key={cp.id} className={`${cell} bg-[#141414]/5`} style={{ color: cp.color }}>
                {cp.displayId ?? cp.id} · σ3'={fmt(cp.sigma3Target, 0)} kPa
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <Row label="Altura Inicial, h₀" unit="mm" values={rowData.map((d) => fmt(d.cp.H0, 2))} />
          <Row label="Diâmetro, D₀" unit="mm" values={rowData.map((d) => fmt(d.cp.D0, 2))} />
          <Row label="Área, A₀" unit="cm²" values={rowData.map((d) => fmt(d.r.A0, 2))} />
          <Row label="Volume Inicial, V₀" unit="cm³" values={rowData.map((d) => fmt(d.r.V0, 2))} />
          <Row label="Massa Úmida, m" unit="g" values={rowData.map((d) => fmt(d.cp.wetMass, 2))} />
          <Row label="Umidade inicial, w₀" unit="%" values={rowData.map((d) => fmt(d.r.w0Pct, 2))} />
          <Row label="Massa Esp. Grãos, ρs" unit="g/cm³" values={rowData.map(() => fmt(rhoS, 2))} />
          <Row label="Massa Esp. Aparente Úmido, ρn" unit="g/cm³" values={rowData.map((d) => fmt(rhoSat(d.r), 2))} />
          <Row label="Massa Esp. Aparente Seco, ρd" unit="g/cm³" values={rowData.map((d) => fmt(rhoDry(d.r), 2))} />
          <Row label="Índice de Vazios Inicial, e₀" values={rowData.map((d) => fmt(d.r.e0, 3))} />
          <Row label="Grau de Saturação Inicial, S₀" unit="%" values={rowData.map((d) => fmt(d.r.Sr0, 2))} />
          <Row label="Drenos Laterais" values={rowData.map((d) => d.cp.lateralDrains ?? "—")} />
          <Row label="Tensão Confinante, σ3'" unit="kPa" values={rowData.map((d) => fmt(d.cp.sigma3Target, 0))} />
          <Row label="Variação Volumétrica (adens.)" unit="cm³" values={rowData.map((d) => fmt(d.r.dVcons, 2))} />
          <Row label="Volume Final, Vf" unit="cm³" values={rowData.map((d) => fmt(d.r.Vc, 2))} />
          <Row label="Altura após adensamento, hc" unit="mm" values={rowData.map((d) => fmt(d.r.Hc, 2))} />
          <Row label="Diâmetro após adensamento, Dc" unit="mm" values={rowData.map((d) => fmt(d.Df_mm, 2))} />
          <Row label="Umidade final, wf" unit="%" values={rowData.map((d) => d.cp.wFinalPct != null ? fmt(d.cp.wFinalPct, 2) : "—")} />
          <Row label="Grau de Saturação Final, Sf" unit="%" values={rowData.map((d) => d.Sf != null ? fmt(d.Sf, 2) : "—")} />
          <Row label="Drenagem no Adensamento" values={rowData.map((d) => d.cp.consolidationDrainage ?? "—")} />
          <Row label="Velocidade de Deformação" unit="mm/min" values={rowData.map((d) => d.cp.strainRate != null ? fmt(d.cp.strainRate, 3) : "—")} />
          <Row label="Critério de Ruptura Adotado" values={rowData.map((d) => d.failCritLabel)} />
          <Row label="Tensão Desviadora Corrigida" unit="kPa" values={rowData.map((d) => d.r.failure ? fmt(d.r.failure.q, 2) : "—")} />
          <Row label="Deformação Axial na Ruptura" unit="%" values={rowData.map((d) => d.r.failure ? fmt(d.r.failure.eaPct, 2) : "—")} />
          <Row label="Tensão Efetiva Principal Menor, σ3'" unit="kPa" values={rowData.map((d) => d.r.failure ? fmt(d.r.failure.sigma3Prime, 2) : "—")} />
          <Row label="Tensão Efetiva Principal Maior, σ1'" unit="kPa" values={rowData.map((d) => d.r.failure ? fmt(d.r.failure.sigma1Prime, 2) : "—")} />
          <Row label="Razão de Tensões Principais σ1'/σ3'" values={rowData.map((d) => d.r.failure ? fmt(d.r.failure.ratio, 2) : "—")} />
          <Row label="s' na ruptura" unit="kPa" values={rowData.map((d) => d.r.failure ? fmt(d.r.failure.pPrime, 2) : "—")} />
          <Row label="p na ruptura" unit="kPa" values={rowData.map((d) => isFinite(d.pTotal) ? fmt(d.pTotal, 2) : "—")} />
          <Row label="q na ruptura" unit="kPa" values={rowData.map((d) => d.r.failure ? fmt(d.r.failure.q, 2) : "—")} />
          <Row label="Índice de vazios final, ef" values={rowData.map((d) => isFinite(d.eFinal) ? fmt(d.eFinal, 3) : "—")} />
          <tr>
            <td className={cellL}>Caracterização Tátil-Visual</td>
            <td className={cell} colSpan={specimens.length}>{sample.description || "—"}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-1 grid grid-cols-3 gap-2 text-[9px]">
        <div className="rounded border border-[#141414]/40 px-2 py-1">
          <b>φ' =</b> {envelope ? `${fmt(envelope.phiDeg, 2)}°` : "—"}
        </div>
        <div className="rounded border border-[#141414]/40 px-2 py-1">
          <b>c' =</b> {envelope ? `${fmt(envelope.cPrime, 2)} kPa` : "—"}
        </div>
        <div className="rounded border border-[#141414]/40 px-2 py-1">
          <b>R² =</b> {envelope ? fmt(envelope.r2, 3) : "—"}
        </div>
      </div>
    </div>
  );
}

function TriaxialReport({
  sample,
  specimens,
  results,
  envelope,
  envelopePts,
  photos,
  axisCfg,
}: {
  sample: TriaxialSample & { coordN?: number | string; coordE?: number | string; coordCota?: number | string; coordDatum?: string };
  specimens: TriaxialSpecimen[];
  results: ReturnType<typeof processSpecimen>[];
  envelope: ReturnType<typeof fitEnvelope>;
  envelopePts: { pPrime: number; q: number; cp: string }[];
  photos: import("@/features/lab/types").Photo[];
  axisCfg?: AxisCfg;
}) {
  const perCpPages = specimens.length; // uma página por CP com gráficos + fotos
  const total = 6 + perCpPages + 2; // +2 → Glossário (Formulações e Convenções), 2 páginas
  const cfg: AxisCfg = axisCfg ?? {
    eaMax: 0, qMax: 0, sigmaDMax: 0, evMin: 0, evMax: 0,
    pMax: 0, sigmaMax: 0, tauMax: 0, sqrtTMax: 0, dvMax: 0,
    dvShearMin: 0, dvShearMax: 0, eModMax: 0, ratioMax: 0,
  };
  const REPORT_TITLE = reportTitleFor(sample.condition);
  const page = (n: number, children: React.ReactNode) => (
    <ReportPage sample={sample} page={n} total={total} title={REPORT_TITLE} norms={NORMS}>
      {children}
    </ReportPage>
  );

  return (
    <>
      {/* Página 1 — Capa: parâmetros e condições do ensaio */}
      {page(1, (
        <CoverPage
          sample={sample}
          specimens={specimens}
          results={results}
        />
      ))}

      {/* Página 2 — Quadro Resumo dos Resultados */}
      {page(2, (
        <SummaryTablePage
          sample={sample}
          specimens={specimens}
          results={results}
          envelope={envelope}
        />
      ))}

      {/* Página 3 — q vs εa (topo) + Variação Volumétrica cm³ vs εa (baixo) */}
      {page(3, (
        <div className="flex h-full flex-col gap-2 text-[10px] text-[#141414]">
          <SectionBar>Gráfico de Tensão Desvio versus Deformação Axial Específica</SectionBar>
          <div className="h-[52%]">
            <ResponsiveContainer>
              <ComposedChart margin={{ top: 6, right: 12, bottom: 24, left: 40 }}>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                <XAxis type="number" dataKey="eaPct" domain={axisDomain(0, cfg.eaMax)} tick={{ fontSize: 10 }} ticks={equalTicks(0, cfg.eaMax)} interval={0}>
                  <RLabel value="εa - Deformação Axial Específica [%]" position="insideBottom" offset={-8} fontSize={10} />
                </XAxis>
                <YAxis domain={axisDomain(0, cfg.sigmaDMax)} tick={{ fontSize: 10 }} ticks={equalTicks(0, cfg.sigmaDMax)} interval={0}>
                  <RLabel value="σd = (σ1−σ3) - Tensão Desvio [kPa]" angle={-90} position="insideLeft" offset={-4} fontSize={10} />
                </YAxis>
                <Legend wrapperStyle={{ fontSize: 10 }} verticalAlign="top" />
                {specimens.map((cp, i) => (
                  <Line key={cp.id} data={results[i].shearCurve} dataKey="sigmaD" stroke={cp.color}
                    name={`${cp.displayId ?? cp.id} · σ3'=${cp.sigma3Target} kPa`} type="monotone" dot={false}
                    strokeWidth={1.8} isAnimationActive={false} />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <SectionBar>Variação Volumétrica versus Deformação Axial Específica</SectionBar>
          <div className="h-[42%]">
            <ResponsiveContainer>
              <ComposedChart margin={{ top: 6, right: 12, bottom: 24, left: 40 }}>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                <XAxis type="number" dataKey="eaPct" domain={axisDomain(0, cfg.eaMax)} tick={{ fontSize: 10 }} ticks={equalTicks(0, cfg.eaMax)} interval={0}>
                  <RLabel value="εa - Deformação Axial Específica [%]" position="insideBottom" offset={-8} fontSize={10} />
                </XAxis>
                <YAxis reversed domain={axisDomain(cfg.dvShearMin, cfg.dvShearMax)} tick={{ fontSize: 10 }} ticks={equalTicks(cfg.dvShearMin, cfg.dvShearMax)} interval={0}>
                  <RLabel value="Variação Volumétrica [cm³]" angle={-90} position="insideLeft" offset={-4} fontSize={10} />
                </YAxis>
                <ReferenceLine y={0} stroke="#999" />
                <Legend wrapperStyle={{ fontSize: 10 }} verticalAlign="top" />
                {specimens.map((cp, i) => {
                  const V0 = results[i].V0;
                  const data = results[i].shearCurve.map((p) => ({ eaPct: p.eaPct, dv: (p.evPct / 100) * V0 }));
                  return (
                    <Line key={cp.id} data={data} dataKey="dv" stroke={cp.color} name={cp.displayId ?? cp.id}
                      type="monotone" dot={false} strokeWidth={1.8} isAnimationActive={false} />
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[8.5px] text-[#141414]/70">
            Legenda: (+) Valores Positivos Representam REDUÇÃO DE VOLUME; (−) Valores Negativos representam AUMENTO DE VOLUME.
          </div>
        </div>
      ))}

      {/* Páginas 4 e 5 — Envoltória Mohr-Coulomb e Caminho de Tensões (mesma escala quadrada, em páginas separadas) */}
      {(() => {
        // Escala unificada: mesmo intervalo para X e Y em ambos gráficos → quadrado.
        const autoSigmaTau = Math.max(
          cfg.sigmaMax || 0, cfg.tauMax || 0,
          cfg.pMax || 0, cfg.qMax || 0,
          ...results.flatMap((r) => r.failure ? [r.failure.sigma1Prime * 1.1, r.failure.sigma1Prime * 0.7] : []),
          ...envelopePts.map((p) => Math.max(p.pPrime, p.q) * 1.2),
        );
        const unified = Math.max(1, autoSigmaTau);
        const alphaDeg = envelope ? Math.atan(envelope.M) * 180 / Math.PI : 0;
        const mohrPage = page(4, (
          <div className="flex h-full flex-col gap-2 text-[10px] text-[#141414]">
            <SectionBar>Envoltória de Ruptura — Mohr-Coulomb — Tensões Efetivas</SectionBar>
            <div className="w-full flex-1 min-h-0">
              <MohrChart specimens={specimens} results={results} envelope={envelope} sigmaMax={unified} tauMax={unified} />
            </div>
            <div className="mt-1 flex flex-wrap justify-center gap-2 text-[12px]">
                  <span className="rounded border border-[#141414]/60 bg-[#f3f4f6] px-3 py-1">
                    <b>c'</b> <span className="text-[10px] text-[#141414]/70">(intercepto coesivo efetivo)</span> <b>=</b> {envelope ? `${fmt(envelope.cPrime, 2)} kPa` : "—"}
                  </span>
                  <span className="rounded border border-[#141414]/60 bg-[#f3f4f6] px-3 py-1">
                    <b>φ'</b> <span className="text-[10px] text-[#141414]/70">(ângulo de atrito efetivo)</span> <b>=</b> {envelope ? `${fmt(envelope.phiDeg, 2)}°` : "—"}
                  </span>
                  <span className="rounded border border-[#141414]/60 bg-[#f3f4f6] px-3 py-1">
                    <b>R² =</b> {envelope ? fmt(envelope.r2, 3) : "—"}
                  </span>
            </div>
          </div>
        ));
        const pathPage = page(5, (
          <div className="flex h-full flex-col gap-2 text-[10px] text-[#141414]">
            <SectionBar>Caminho de Tensões (stress path) — Diagrama t–s' (MIT) — Tensões Efetivas</SectionBar>
            <div className="w-full flex-1 min-h-0">
              <ResponsiveContainer>
                <ComposedChart margin={{ top: 24, right: 16, bottom: 56, left: 52 }}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="pPrime" domain={[0, unified]} tick={{ fontSize: 10 }} ticks={equalTicks(0, unified)} interval={0}>
                    <RLabel value="s' [kPa]" position="insideBottom" offset={-24} fontSize={10} />
                  </XAxis>
                  <YAxis type="number" dataKey="q" domain={[0, unified]} tick={{ fontSize: 10 }} ticks={equalTicks(0, unified)} interval={0}>
                    <RLabel value="t [kPa]" angle={-90} position="insideLeft" offset={-6} fontSize={10} />
                  </YAxis>
                  <Legend wrapperStyle={{ fontSize: 10 }} verticalAlign="top" />
                  {specimens.map((cp, i) => (
                    <Line key={cp.id} data={results[i].shearCurve} dataKey="q" stroke={cp.color}
                      name={`${cp.displayId ?? cp.id} · σ3'=${cp.sigma3Target} kPa`} type="monotone"
                      dot={false} strokeWidth={1.8} isAnimationActive={false} />
                  ))}
                  {envelope && (() => {
                    const envLine = [
                      { pPrime: 0, q: envelope.a },
                      { pPrime: unified, q: envelope.a + envelope.M * unified },
                    ];
                    return <Line data={envLine} dataKey="q" type="linear" stroke="#8a6f4c" strokeWidth={2} dot={false} name="Envoltória Efetiva Kf" isAnimationActive={false} />;
                  })()}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 flex flex-wrap justify-center gap-2 text-[12px]">
                  <span className="rounded border border-[#141414]/60 bg-[#f3f4f6] px-3 py-1">
                    <b>a'</b> <span className="text-[10px] text-[#141414]/70">(intercepto Kf)</span> <b>=</b> {envelope ? `${fmt(envelope.a, 2)} kPa` : "—"}
                  </span>
                  <span className="rounded border border-[#141414]/60 bg-[#f3f4f6] px-3 py-1">
                    <b>α'</b> <span className="text-[10px] text-[#141414]/70">(inclinação Kf)</span> <b>=</b> {envelope ? `${fmt(alphaDeg, 2)}°` : "—"}
                  </span>
                  <span className="rounded border border-[#141414]/60 bg-[#f3f4f6] px-3 py-1">
                    <b>R² =</b> {envelope ? fmt(envelope.r2, 3) : "—"}
                  </span>
            </div>
          </div>
        ));
        return <>{mohrPage}{pathPage}</>;
      })()}

      {/* Página 6 — Módulo de Deformabilidade + Razão σ'1/σ'3 */}
      {page(6, (
        <div className="flex h-full flex-col gap-2 text-[10px] text-[#141414]">
          <SectionBar>Módulo de Deformabilidade versus Deformação Axial Específica</SectionBar>
          <div className="h-[48%]">
            <ResponsiveContainer>
              <ComposedChart margin={{ top: 6, right: 12, bottom: 24, left: 40 }}>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                <XAxis type="number" dataKey="eaPct" domain={axisDomain(0, cfg.eaMax)} tick={{ fontSize: 10 }} ticks={equalTicks(0, cfg.eaMax)} interval={0}>
                  <RLabel value="εa - Deformação Axial Específica [%]" position="insideBottom" offset={-8} fontSize={10} />
                </XAxis>
                <YAxis domain={axisDomain(0, cfg.eModMax)} tick={{ fontSize: 10 }} ticks={equalTicks(0, cfg.eModMax)} interval={0}>
                  <RLabel value="Módulo de Deformabilidade [MPa]" angle={-90} position="insideLeft" offset={-4} fontSize={10} />
                </YAxis>
                <Legend wrapperStyle={{ fontSize: 10 }} verticalAlign="top" />
                {specimens.map((cp, i) => {
                  const data = results[i].shearCurve
                    .filter((p) => p.eaPct > 0)
                    .map((p) => ({ eaPct: p.eaPct, E: p.q / (p.eaPct * 10) }));
                  return (
                    <Line key={cp.id} data={data} dataKey="E" stroke={cp.color} name={cp.displayId ?? cp.id}
                      type="monotone" dot={false} strokeWidth={1.8} isAnimationActive={false} />
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <SectionBar>Razão das Tensões Principais (σ'1/σ'3) versus Deformação Axial Específica</SectionBar>
          <div className="h-[46%]">
            <ResponsiveContainer>
              <ComposedChart margin={{ top: 6, right: 12, bottom: 24, left: 40 }}>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                <XAxis type="number" dataKey="eaPct" domain={axisDomain(0, cfg.eaMax)} tick={{ fontSize: 10 }} ticks={equalTicks(0, cfg.eaMax)} interval={0}>
                  <RLabel value="εa - Deformação Axial Específica [%]" position="insideBottom" offset={-8} fontSize={10} />
                </XAxis>
                <YAxis domain={axisDomain(0, cfg.ratioMax)} tick={{ fontSize: 10 }} ticks={equalTicks(0, cfg.ratioMax)} interval={0}>
                  <RLabel value="σ'1 / σ'3" angle={-90} position="insideLeft" offset={-4} fontSize={10} />
                </YAxis>
                <Legend wrapperStyle={{ fontSize: 10 }} verticalAlign="top" />
                {specimens.map((cp, i) => {
                  const data = results[i].shearCurve
                    .filter((p) => p.sigma3Prime > 0)
                    .map((p) => ({ eaPct: p.eaPct, r: p.sigma1Prime / p.sigma3Prime }));
                  return (
                    <Line key={cp.id} data={data} dataKey="r" stroke={cp.color} name={cp.displayId ?? cp.id}
                      type="monotone" dot={false} strokeWidth={1.8} isAnimationActive={false} />
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}

      {/* Páginas por CP — gráficos individuais + fotos moldagem/ruptura */}
      {specimens.map((cp, i) => (
        <ReportPage
          key={`cp-${cp.id}`}
          sample={sample}
          page={7 + i}
          total={total}
          title={REPORT_TITLE}
          norms={NORMS}
        >
          <SpecimenPage cp={cp} r={results[i]} cfg={cfg} photos={photos.filter((p) => p.specimenId === cp.id)} />
        </ReportPage>
      ))}

      {/* Últimas páginas — Glossário: Formulações e Convenções */}
      {page(total - 1, (<GlossaryPage part={1} />))}
      {page(total, (<GlossaryPage part={2} />))}

    </>
  );
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[#141414]/40 p-2">
      <div className="text-[8.5px] uppercase tracking-wide text-[#141414]/60">{label}</div>
      <div className="text-[13px] font-semibold text-[#141414]">{value}</div>
    </div>
  );
}

/**
 * Página de glossário — "Formulações e Convenções".
 * Lista, por etapa do ensaio, todas as fórmulas efetivamente usadas no
 * módulo Triaxial CID (ver src/features/triaxial-cid/domain/calc.ts).
 * Referências: ASTM D7181-20 e ISO 17892-9:2018 (Anexo B para MIT).
 */
function GlossaryPage({ part = 1 }: { part?: 1 | 2 } = {}) {
  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-2">
      <div className="mb-1 rounded bg-[#e5e7eb] px-2 py-[3px] text-[10.5px] font-semibold uppercase tracking-wide text-[#141414]">
        {title}
      </div>
      <table className="w-full border-collapse text-[9.5px] leading-tight text-[#141414]">
        <tbody>{children}</tbody>
      </table>
    </div>
  );
  const Row = ({ sym, name, formula, unit, ref }: { sym: string; name: string; formula: string; unit?: string; ref?: string }) => (
    <tr className="border-b border-[#e5e7eb] align-top">
      <td className="w-[10%] py-[2px] pr-1 font-semibold">{sym}</td>
      <td className="w-[30%] py-[2px] pr-2">{name}</td>
      <td className="w-[42%] py-[2px] pr-2 font-mono text-[9.5px]">{formula}</td>
      <td className="w-[8%] py-[2px] pr-1 text-[#141414]/70">{unit ?? ""}</td>
      <td className="w-[10%] py-[2px] text-[8.5px] text-[#141414]/60">{ref ?? ""}</td>
    </tr>
  );
  return (
    <div className="flex h-full flex-col text-[10px] text-[#141414]">
      <SectionBar>Formulações e Convenções {part === 1 ? "(1/2)" : "(2/2)"}</SectionBar>
      <div className="mt-1 text-[9px] text-[#141414]/70">
        Convenção de unidades: dimensões em mm/cm, massas em g, volumes em cm³, forças em kN,
        tensões e poropressões em kPa, ângulos em graus. Deformações εa e εv em %; nas fórmulas
        entram em fração (dividir por 100). γw = 9,81 kN/m³. Convenção MIT (diagrama t–s')
        conforme ISO 17892-9:2018 Anexo B.
      </div>

      <div className="mt-2 space-y-1">
        {part === 1 ? (
          <>
          <Group title="Moldagem — Índices Físicos Iniciais">
            <Row sym="A₀" name="Área inicial" formula="A₀ = π·D₀²/4" unit="cm²" />
            <Row sym="V₀" name="Volume inicial" formula="V₀ = A₀·H₀" unit="cm³" />
            <Row sym="w₀" name="Umidade inicial (cápsulas)" formula="w = (m_úmida − m_seca)/(m_seca − tara)·100" unit="%" />
            <Row sym="γ" name="Peso específico natural" formula="γ = (m_úmida/V₀)·9,81" unit="kN/m³" />
            <Row sym="γd" name="Peso específico seco" formula="γd = (m_seca/V₀)·9,81" unit="kN/m³" />
            <Row sym="e₀" name="Índice de vazios inicial" formula="e₀ = Gs·γw/γd − 1" unit="—" />
            <Row sym="Sr₀" name="Saturação inicial" formula="Sr = (w·Gs)/e · 100" unit="%" />
          </Group>

          <Group title="Saturação">
            <Row sym="B" name="Parâmetro de Skempton" formula="B = Δu / Δσ₃" unit="—" ref="Skempton (1954)" />
          </Group>

          <Group title="Adensamento (isotrópico)">
            <Row sym="ΔV" name="Variação de volume no adensamento" formula="ΔV = leitura final − inicial" unit="cm³" />
            <Row sym="Hc" name="Altura pós-adensamento" formula="Hc = H₀·(1 − ΔV/V₀)^(1/3)" unit="mm" />
            <Row sym="Ac" name="Área pós-adensamento" formula="Ac = A₀·(1 − ΔV/V₀)^(2/3)" unit="cm²" />
            <Row sym="Vc" name="Volume pós-adensamento" formula="Vc = V₀ − ΔV" unit="cm³" />
            <Row sym="e_c" name="Índice de vazios pós-adens." formula="e_c = Vc/Vs − 1 ;  Vs = V₀/(1+e₀)" unit="—" />
          </Group>

          <Group title="Cisalhamento — Deformações e Área">
            <Row sym="εa" name="Deformação axial específica" formula="εa = Δh / Hc · 100" unit="%" />
            <Row sym="εv" name="Deformação volumétrica" formula="εv = ΔV / Vc · 100" unit="%" />
            <Row sym="A_cor" name="Área corrigida (Bishop & Henkel)" formula="A_cor = Ac·(1 − εv)/(1 − εa)" unit="cm²" ref="ISO §7.2.2 (4)" />
            <Row sym="Dc" name="Diâmetro corrigido" formula="Dc = √(4·A_cor/π)" unit="mm" />
          </Group>
          </>
        ) : (
          <>

          <Group title="Cisalhamento — Correções ISO 17892-9">
            <Row sym="(Δσv)m" name="Correção de membrana (vertical)" formula="4·tm·Em/Dc · (εa + εv/3)" unit="kPa" ref="ISO §7.2.3 (5)" />
            <Row sym="(Δσh)m" name="Correção de membrana (horiz.)" formula="4·tm·Em/Dc · (εv/3)" unit="kPa" ref="ISO §7.2.3 (6)" />
            <Row sym="(Δσv)fp" name="Papel filtro (εsv ≤ 2%)" formula="εa·Kfp·Pfp / (0,005·Dc) ;  Pfp = π·Dc" unit="kPa" ref="ISO §7.2.4 (7)" />
            <Row sym="(Δσv)fp" name="Papel filtro (εsv > 2%)" formula="Kfp·Pfp / (0,25·Dc)" unit="kPa" ref="ISO §7.2.4 (8)" />
          </Group>

          <Group title="Cisalhamento — Tensões (CID drenado, u = uback)">
            <Row sym="P" name="Força axial (célula de carga)" formula="P [N] = leitura [kgf] · 9,80665" unit="N" />
            <Row sym="F_atr" name="Atrito do pistão (desconto em P)" formula="P_ef = P − F_atr[kgf]·9,80665" unit="N" ref="ASTM §11.4" />
            <Row sym="W" name="Peso do conjunto pistão+topcap" formula="W [N] = mSobreCP [g] · 9,80665·10⁻³" unit="N" />
            <Row sym="K" name="Peso efetivo do pistão (com empuxo)" formula="K = W − (A_cor − a)·h·γw ;  γw = 9,80665·10⁻³ N/cm³" unit="N" ref="ISO §7.2.5" />
            <Row sym="σv" name="Tensão vertical total (Fórmula 9)" formula="σv = [P_ef + K + σc·(A_cor−a)]/A_cor − (Δσv)m − (Δσv)fp" unit="kPa" ref="ISO §7.2.5 (9)" />
            <Row sym="σd" name="Tensão desviadora = σv − σc" formula="σd = (P_ef + K)/A_cor·10 − σc·a/A_cor − (Δσv)m + (Δσh)m − (Δσv)fp" unit="kPa" />
            <Row sym="σ₁" name="Tensão principal maior (total)" formula="σ₁ = σ₃ + σd" unit="kPa" />
            <Row sym="σ'ᵢ" name="Tensões efetivas" formula="σ'ᵢ = σᵢ − u ;  no CID u = uback" unit="kPa" />
          </Group>

          <Group title="Cisalhamento — Invariantes MIT (t–s')">
            <Row sym="t" name="Semi-desvio (MIT)" formula="t = (σ₁ − σ₃)/2 = σd/2" unit="kPa" ref="ISO Anexo B" />
            <Row sym="s'" name="Tensão média efetiva (MIT)" formula="s' = (σ'₁ + σ'₃)/2" unit="kPa" ref="ISO Anexo B" />
            <Row sym="σ'₁/σ'₃" name="Razão de tensões" formula="σ'₁ / σ'₃" unit="—" />
            <Row sym="E" name="Módulo de deformabilidade secante" formula="E = q / εa   (εa em fração)" unit="MPa" />
          </Group>

          <Group title="Envoltória — Reta Kf (ISO Anexo B)">
            <Row sym="Kf" name="Ajuste linear em (s',t)" formula="t_f = tan α'·s'_f + k" unit="kPa" />
            <Row sym="φ'" name="Ângulo de atrito efetivo" formula="sen φ' = tan α'" unit="°" ref="ISO B.1" />
            <Row sym="c'" name="Intercepto coesivo efetivo" formula="c' = k / cos φ'" unit="kPa" ref="ISO B.2" />
            <Row sym="R²" name="Coef. de determinação" formula="1 − SS_res/SS_tot" unit="—" />
          </Group>

          <Group title="Etapa Final — Cápsulas e Massa">
            <Row sym="w_f" name="Umidade final (média das cápsulas)" formula="w_f = média[(m_úmida−m_seca)/(m_seca−tara)]·100" unit="%" />
            <Row sym="m_sd,f" name="Massa seca final" formula="m_sd,f = m_f / (1 + w_f)" unit="g" />
            <Row sym="e_f" name="Índice de vazios final" formula="e_f = Vc·(1−εv,f)/Vs − 1" unit="—" />
            <Row sym="Sr,f" name="Saturação final" formula="Sr,f = w_f·Gs / e_f · 100" unit="%" />
          </Group>
          </>
        )}
      </div>

      <div className="mt-auto pt-1 text-[8.5px] text-[#141414]/70">
        Referências normativas: <b>ASTM D7181-20</b> — Consolidated Drained Triaxial Compression Test for Soils;
        <b> ISO 17892-9:2018</b> — Consolidated triaxial compression tests on water saturated soils
        (correções de área, membrana e papel filtro; Anexo B para reta Kf na convenção MIT).
      </div>
    </div>
  );
}

/** Faixa de título estilo Damasco Penna (marrom claro) usada em seções do relatório. */
function SectionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-[#9ca3af] bg-[#d1d5db] px-2 py-1 text-center text-[10.5px] font-bold uppercase tracking-wide text-[#111827]">
      {children}
    </div>
  );
}

/** Capa do relatório — Parâmetros e Condições do Ensaio / Correção / Equipe. */
function CoverPage({
  sample,
  specimens,
  results: _results,
}: {
  sample: TriaxialSample;
  specimens: TriaxialSpecimen[];
  results: ReturnType<typeof processSpecimen>[];
}) {
  const cp0 = specimens[0];
  const bMax = Math.max(
    0,
    ...specimens.flatMap((s) => s.saturation.map((st) => st.bValue ?? 0)),
  );
  const cell = "border border-[#141414]/60 px-2 py-[3px] text-[10px] align-middle";
  const bold = "font-semibold";
  const satMethods = Array.from(
    new Set(specimens.map((s) => (s.saturationMethod === "percolacao" ? "Percolação Ascendente" : "Contra-pressão"))),
  ).join(" + ");
  const condLabel = sample.condition === "saturado"
    ? (sample.saturationConditionText || `Saturação por ${satMethods}`)
    : "Ensaio na umidade natural (sem saturação)";
  return (
    <div className="space-y-2 text-[10px] text-[#141414]">
      <SectionBar>Parâmetros e Condições do Ensaio</SectionBar>
      <table className="w-full border-collapse">
        <tbody>
          {[
            ["Equipamento Utilizado", (sample.equipment && sample.equipment.trim()) || "—"],
            ["Tipo do Ensaio", sample.condition === "saturado"
              ? "Compressão Triaxial Adensado Isotropicamente e Drenado - CIDsat"
              : "Compressão Triaxial Adensado Isotropicamente e Drenado - CIDnat"],
            ["Norma Adotada", "ASTM D7181:2020 / ISO 17892-9:2018"],
            ["Tipo da Amostra", sample.sampleType ?? "—"],
            ["Condição do Ensaio", condLabel],
            ["Parâmetro B de Skempton (mín. alcançado)", sample.condition === "saturado"
              ? (bMax > 0 ? fmt(bMax, 2) : "—")
              : "N/A — ensaio na umidade natural"],
            ["Dimensões Características da Amostra", sample.specDimensions ?? "—"],
            ["Número de Corpos de Prova", String(specimens.length)],
            ["Drenos Laterais", cp0?.lateralDrains ?? "—"],
            ["Drenagem no Adensamento", cp0?.consolidationDrainage ?? "—"],
          ].map(([label, value]) => (
            <tr key={label}>
              <td className={`${cell} ${bold} w-[45%]`}>{label}</td>
              <td className={cell}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pt-2" />
      <SectionBar>Parâmetros de Correção</SectionBar>
      <table className="w-full border-collapse">
        <tbody>
          {[
            ["Espessura da Membrana [cm]", cp0?.espMembrana != null ? fmt(cp0.espMembrana, 3) : "—"],
            ["Módulo de Elasticidade da Membrana [MPa]", fmt(sample.membraneE / 1000, 2)],
            ["Força de Atrito do Pistão [kgf]", cp0?.fAtritoPistao != null ? fmt(cp0.fAtritoPistao, 2) : "—"],
            ["Massa sobre o corpo de prova [g]", cp0?.mSobreCP != null ? fmt(cp0.mSobreCP, 2) : "—"],
            ["Altura do topcap [cm]", cp0?.hTopcap != null ? fmt(cp0.hTopcap, 2) : "—"],
            ["Área do Pistão [cm²]", cp0?.aPistao != null ? fmt(cp0.aPistao, 2) : "—"],
            ["Massa Específica da Água [g/cm³]", fmt(sample.rhoW, 3)],
            ["Resistência do Papel Filtro [kN/m]", sample.filterPaperResistance != null ? fmt(sample.filterPaperResistance, 2) : "0,00"],
          ].map(([label, value]) => (
            <tr key={label}>
              <td className={`${cell} ${bold} w-[45%]`}>{label}</td>
              <td className={cell}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

    </div>
  );
}

/** Página individual por CP — 2 gráficos à esquerda + 2 fotos à direita. */
function SpecimenPage({
  cp,
  r,
  cfg,
  photos,
}: {
  cp: TriaxialSpecimen;
  r: ReturnType<typeof processSpecimen>;
  cfg: AxisCfg;
  photos: import("@/features/lab/types").Photo[];
}) {
  const dvShear = r.shearCurve.map((p) => ({ eaPct: p.eaPct, dv: (p.evPct / 100) * r.V0 }));
  const moldagem = photos.find((p) => p.kind === "moldagem");
  const ruptura = photos.find((p) => p.kind === "ruptura");
  const legend = `${cp.displayId ?? cp.id} · σ3'=${cp.sigma3Target} kPa`;
  const PhotoBox = ({ title, photo }: { title: string; photo?: import("@/features/lab/types").Photo }) => (
    <div className="flex h-full min-h-0 flex-col gap-1 overflow-hidden rounded border border-[#141414]/60">
      <div className="bg-[#d1d5db] px-2 py-[3px] text-center text-[9.5px] font-bold uppercase text-[#111827]">
        {title}
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-white p-1">
        {photo ? (
          <img
            src={photo.dataUrl}
            alt={title}
            crossOrigin="anonymous"
            className="absolute inset-1 h-[calc(100%-0.5rem)] w-[calc(100%-0.5rem)] object-contain"
          />
        ) : (
          <div className="text-[9px] text-[#141414]/50">Sem registro</div>
        )}
      </div>
      <div className="border-t border-[#141414]/30 px-2 py-[2px] text-center text-[9px] font-semibold text-[#141414]">
        {legend}
      </div>
    </div>
  );
  return (
    <div className="flex h-full flex-col gap-2 text-[10px] text-[#141414]">
      <SectionBar>Gráfico de Tensão Desvio versus Deformação Axial Específica — {cp.displayId ?? cp.id}</SectionBar>
      <div className="grid h-[46%] grid-cols-[1fr_38%] gap-2">
        <ResponsiveContainer>
          <ComposedChart margin={{ top: 6, right: 12, bottom: 22, left: 40 }}>
            <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
            <XAxis type="number" dataKey="eaPct" domain={axisDomain(0, cfg.eaMax)} tick={{ fontSize: 9 }} ticks={equalTicks(0, cfg.eaMax)} interval={0}>
              <RLabel value="εa - Deformação Axial Específica [%]" position="insideBottom" offset={-6} fontSize={9} />
            </XAxis>
            <YAxis domain={axisDomain(0, cfg.sigmaDMax)} tick={{ fontSize: 9 }} ticks={equalTicks(0, cfg.sigmaDMax)} interval={0}>
              <RLabel value="σd = (σ1−σ3) - Tensão Desvio [kPa]" angle={-90} position="insideLeft" offset={-2} fontSize={9} />
            </YAxis>
            <Line data={r.shearCurve} dataKey="sigmaD" stroke={cp.color} name={legend} type="monotone"
              dot={false} strokeWidth={1.8} isAnimationActive={false} />
            <Legend wrapperStyle={{ fontSize: 9 }} verticalAlign="top" />
          </ComposedChart>
        </ResponsiveContainer>
        <PhotoBox title="Registro Fotográfico na Moldagem" photo={moldagem} />
      </div>
      <SectionBar>Variação Volumétrica versus Deformação Axial Específica — {cp.displayId ?? cp.id}</SectionBar>
      <div className="grid h-[46%] grid-cols-[1fr_38%] gap-2">
        <ResponsiveContainer>
          <ComposedChart margin={{ top: 6, right: 12, bottom: 22, left: 40 }}>
            <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
            <XAxis type="number" dataKey="eaPct" domain={axisDomain(0, cfg.eaMax)} tick={{ fontSize: 9 }} ticks={equalTicks(0, cfg.eaMax)} interval={0}>
              <RLabel value="εa - Deformação Axial Específica [%]" position="insideBottom" offset={-6} fontSize={9} />
            </XAxis>
            <YAxis reversed domain={axisDomain(cfg.dvShearMin, cfg.dvShearMax)} tick={{ fontSize: 9 }} ticks={equalTicks(cfg.dvShearMin, cfg.dvShearMax)} interval={0}>
              <RLabel value="Variação Volumétrica [cm³]" angle={-90} position="insideLeft" offset={-2} fontSize={9} />
            </YAxis>
            <ReferenceLine y={0} stroke="#999" />
            <Line data={dvShear} dataKey="dv" stroke={cp.color} name={legend} type="monotone"
              dot={false} strokeWidth={1.8} isAnimationActive={false} />
            <Legend wrapperStyle={{ fontSize: 9 }} verticalAlign="top" />
          </ComposedChart>
        </ResponsiveContainer>
        <PhotoBox title="Registro Fotográfico após a Ruptura" photo={ruptura} />
      </div>
      <div className="text-[8.5px] text-[#141414]/70">
        Legenda: (+) Valores Positivos Representam REDUÇÃO DE VOLUME; (−) Valores Negativos representam AUMENTO DE VOLUME.
      </div>
    </div>
  );
}

function AxisGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-2">
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function AxisField({ label, value, onChange, step = "any" }: { label: string; value: number; onChange: (v: number) => void; step?: string }) {
  return (
    <label className="flex flex-col gap-0.5 text-[10.5px]">
      <span className="text-muted-foreground">{label}</span>
      <Input
        className="h-7 text-[11px]"
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </label>
  );
}

function ApprovalCell({
  approval,
  isAdmin,
  isVerificador,
  onRequest,
  onDecide,
}: {
  approval: ApprovalRow | null;
  isAdmin: boolean;
  isVerificador: boolean;
  onRequest: () => void;
  onDecide: (
    stage: "verify" | "approve",
    decision: "verificado" | "rejeitado_verificacao" | "aprovado" | "rejeitado",
  ) => void;
}) {
  if (!approval) {
    return (
      <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={onRequest} title="Enviar para verificação">
        <Send className="h-3 w-3" /> Enviar p/ verificação
      </Button>
    );
  }
  const fmt = (iso?: string | null) =>
    iso
      ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso))
      : "";

  // Status ainda em legado ('pendente') tratado como 'pendente_verificacao'.
  const status = approval.status === "pendente" ? "pendente_verificacao" : approval.status;
  const isFinal = status === "aprovado" || status === "rejeitado" || status === "rejeitado_verificacao";

  const badgeMap: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    pendente_verificacao:  { label: "Aguardando verificação",     cls: "bg-amber-500/15   text-amber-700   dark:text-amber-400",   Icon: Clock },
    pendente_aprovacao:    { label: "Aguardando aprovação",       cls: "bg-sky-500/15     text-sky-700     dark:text-sky-400",     Icon: Clock },
    verificado:            { label: "Verificado",                 cls: "bg-sky-500/15     text-sky-700     dark:text-sky-400",     Icon: ShieldCheck },
    rejeitado_verificacao: { label: "Rejeitado na verificação",   cls: "bg-destructive/15 text-destructive",                       Icon: XCircle },
    aprovado:              { label: "Aprovado",                   cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", Icon: CheckCircle2 },
    rejeitado:             { label: "Rejeitado",                  cls: "bg-destructive/15 text-destructive",                       Icon: XCircle },
  };
  const b = badgeMap[status] ?? badgeMap.pendente_verificacao;

  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${b.cls}`}>
        <b.Icon className="h-3 w-3" /> {b.label}
      </span>

      <div className="text-[9px] text-muted-foreground leading-tight text-center">
        <div>sol. {approval.requested_by_name ?? "—"} · {fmt(approval.requested_at)}</div>
        {approval.verified_by_name && (
          <div>ver. {approval.verified_by_name} · {fmt(approval.verified_at)}</div>
        )}
        {approval.decided_by_name && (
          <div>apr. {approval.decided_by_name} · {fmt(approval.decided_at)}</div>
        )}
      </div>

      {/* Verificador — quando pendente de verificação */}
      {isVerificador && status === "pendente_verificacao" && (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px] text-sky-700 border-sky-500/40 hover:bg-sky-500/10" onClick={() => onDecide("verify", "verificado")}>
            <ShieldCheck className="h-3 w-3" /> Verificar
          </Button>
          <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px] text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => onDecide("verify", "rejeitado_verificacao")}>
            <XCircle className="h-3 w-3" /> Rejeitar
          </Button>
        </div>
      )}

      {/* Responsável Técnico — quando pendente de aprovação */}
      {isAdmin && status === "pendente_aprovacao" && (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px] text-emerald-700 border-emerald-500/40 hover:bg-emerald-500/10" onClick={() => onDecide("approve", "aprovado")}>
            <CheckCircle2 className="h-3 w-3" /> Aprovar
          </Button>
          <Button size="sm" variant="outline" className="h-6 gap-1 text-[10px] text-destructive border-destructive/40 hover:bg-destructive/10" onClick={() => onDecide("approve", "rejeitado")}>
            <XCircle className="h-3 w-3" /> Rejeitar
          </Button>
        </div>
      )}

      {/* Reabrir se estado final */}
      {isFinal && (
        <Button size="sm" variant="ghost" className="h-6 gap-1 text-[10px]" onClick={onRequest} title="Reenviar para verificação">
          <Send className="h-3 w-3" /> Reenviar
        </Button>
      )}

      {approval.verification_comment && (
        <div className="text-[10px] italic text-muted-foreground text-center max-w-[220px] truncate" title={approval.verification_comment}>
          Verif.: "{approval.verification_comment}"
        </div>
      )}
      {approval.comment && (
        <div className="text-[10px] italic text-muted-foreground text-center max-w-[220px] truncate" title={approval.comment}>
          Aprov.: "{approval.comment}"
        </div>
      )}
    </div>
  );
}