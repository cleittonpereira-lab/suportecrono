import { useDraftActivity } from "@/hooks/use-draft-activity";
import { EditingPresenceBanner } from "@/components/DraftActivityInfo";
import { buildScopeId } from "@/lib/scope";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { useCadastroByOs } from "@/hooks/use-cadastro-by-os";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "@/components/ui/dialog";
import {
  Download,
  FileText,
  Gauge,
  Settings2,
  Eye,
  Send,
  ShieldCheck,
  RotateCcw,
  Calculator,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import {
  listVersions,
  saveVersion,
  nextRev,
  type ReportVersion,
} from "@/features/modulo-resiliencia/report-versions";
import { syncRevision, fetchDriveStatus } from "@/features/modulo-resiliencia/driveSync";
import {
  listApprovals,
  requestApproval,
  verifyApproval,
  decideApproval,
  type ApprovalRow,
} from "@/lib/approvals.functions";
import { getWorkflowStatuses } from "@/lib/driveSync.functions";
import { Textarea } from "@/components/ui/textarea";
import { PhotoUploader } from "@/features/lab/components/PhotoUploader";
import { useOptionalLabEnsaio } from "@/features/lab/context";
import { labStore } from "@/features/lab/store";
import { EnsaioListByType } from "@/features/lab/components/EnsaioListByType";
import { ReportPage, type ReportSample } from "@/components/report/ReportShell";
import { EnsaioBadgesRow, EnsaioTitleBlock, AmostraSummaryCard, ResponsaveisBar } from "@/components/report/EnsaioReportHeader";
import type { ModuloResilienciaSample, StressState } from "@/features/modulo-resiliencia/types";
import { seedModuloResilienciaSample, seedStressStates } from "@/features/modulo-resiliencia/types";
import { thetaOf, tauOctOf, mrOf, fitCompositeModel, predictMR } from "@/features/modulo-resiliencia/calc";
import { loadDraft, saveDraft, fetchRemoteDraft } from "@/features/modulo-resiliencia/draftStore";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export const Route = createFileRoute("/_app/relatorio/modulo-resiliencia")({
  component: () => {
    const ctx = useOptionalLabEnsaio();
    return ctx?.ensaio ? <MRPage /> : <EnsaioListByType tipo="modulo-resiliencia" />;
  },
  head: () => ({
    meta: [
      { title: "Módulo de Resiliência — Suporte INFRA" },
      {
        name: "description",
        content: "Processamento e relatório de ensaio de Módulo de Resiliência de solos (DNIT 134/2018-ME).",
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
  value: number | null | undefined;
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
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === "" ? 0 : parseFloat(e.target.value))}
        className="h-8 text-xs"
      />
    </div>
  );
}

function TxtField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs" />
    </div>
  );
}

/** Página 1 do laudo: identificação (via ReportHeader), corpo de prova/compactação e modelo ajustado. */
function MRReportPage1({ sample }: { sample: ModuloResilienciaSample }) {
  const fit = sample.modelFit;
  return (
    <ReportPage
      sample={sample as unknown as ReportSample}
      page={1}
      total={2}
      title="MÓDULO DE RESILIÊNCIA DE SOLOS"
      norms={[
        { text: "DNIT 134/2018-ME — AASHTO T307-99" },
        { text: "Ensaio triaxial cíclico de carga repetida", italic: true },
      ]}
    >
      <div className="space-y-2 text-[10px] text-[#141414]">
        <div className="border border-[#141414]">
          <div className="bg-[#141414] px-2 py-1 text-[9.5px] font-bold uppercase text-white">
            Corpo de Prova — Moldagem / Compactação
          </div>
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <td className="border-t border-[#141414] px-2 py-1 w-1/4"><b>Diâmetro:</b> {fmt(sample.geometry.diameterMm, 1)} mm</td>
                <td className="border-t border-[#141414] px-2 py-1 w-1/4"><b>Altura:</b> {fmt(sample.geometry.heightMm, 1)} mm</td>
                <td className="border-t border-[#141414] px-2 py-1 w-1/4"><b>Energia:</b> {sample.compaction.energy}</td>
                <td className="border-t border-[#141414] px-2 py-1 w-1/4"><b>Equipamento:</b> {sample.equipment || "—"}</td>
              </tr>
              <tr>
                <td className="border-t border-[#141414] px-2 py-1"><b>Umidade Moldagem:</b> {fmt(sample.compaction.moistureContentPct, 1)} %</td>
                <td className="border-t border-[#141414] px-2 py-1"><b>Umidade Ótima:</b> {fmt(sample.compaction.optimumMoisturePct, 1)} %</td>
                <td className="border-t border-[#141414] px-2 py-1"><b>ρd Moldado:</b> {fmt(sample.compaction.dryDensity, 3)} g/cm³</td>
                <td className="border-t border-[#141414] px-2 py-1"><b>ρd Máx. (Proctor):</b> {fmt(sample.compaction.maxDryDensity, 3)} g/cm³</td>
              </tr>
              <tr>
                <td className="border-t border-[#141414] px-2 py-1"><b>Grau de Compactação:</b> {fmt(sample.compaction.degreeOfCompactionPct, 1)} %</td>
                <td className="border-t border-[#141414] px-2 py-1" colSpan={3}><b>Pressão Atmosférica de Referência (Pa):</b> {fmt(sample.atmPressureKpa, 1)} kPa</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="border border-[#141414]">
          <div className="bg-[#141414] px-2 py-1 text-[9.5px] font-bold uppercase text-white">
            Modelo de Previsão Composto (Universal)
          </div>
          <div className="px-2 py-1.5 space-y-1">
            <div className="italic">MR = k1 · Pa · (θ/Pa)^k2 · (τoct/Pa + 1)^k3</div>
            <div className="text-[9px] text-[#141414]/70">
              θ = 3σ3 + σd (tensão-soma) · τoct = (√2/3)·σd (tensão cisalhante octaédrica)
            </div>
            {fit ? (
              <table className="w-full border-collapse mt-1">
                <tbody>
                  <tr>
                    <td className="border border-[#141414] px-2 py-1 text-center w-1/4"><b>k1</b><br />{fmt(fit.k1, 4)}</td>
                    <td className="border border-[#141414] px-2 py-1 text-center w-1/4"><b>k2</b><br />{fmt(fit.k2, 4)}</td>
                    <td className="border border-[#141414] px-2 py-1 text-center w-1/4"><b>k3</b><br />{fmt(fit.k3, 4)}</td>
                    <td className="border border-[#141414] px-2 py-1 text-center w-1/4"><b>R²</b><br />{fmt(fit.r2, 4)}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <div className="text-[9.5px] text-[#141414]/70">Ajuste do modelo ainda não calculado.</div>
            )}
          </div>
        </div>

        <div className="text-[8.5px] text-[#141414]/70 leading-tight">
          O Módulo de Resiliência (MR) é determinado pela razão entre a tensão-desvio cíclica aplicada e a
          deformação axial recuperável específica, para cada um dos pares de tensão confinante (σ3) e
          tensão-desvio (σd) da sequência de carregamento prescrita (ver Folha 2/2 — Sequência de Tensões).
        </div>
      </div>
    </ReportPage>
  );
}

/** Página 2 do laudo: sequência de tensões / resultados por estado. */
function MRReportPage2({ sample }: { sample: ModuloResilienciaSample }) {
  const h0 = sample.geometry.heightMm;
  const pa = sample.atmPressureKpa || 101.3;
  const fit = sample.modelFit;
  return (
    <ReportPage
      sample={sample as unknown as ReportSample}
      page={2}
      total={2}
      title="MÓDULO DE RESILIÊNCIA DE SOLOS"
      norms={[{ text: "DNIT 134/2018-ME — AASHTO T307-99" }]}
    >
      <div className="space-y-1 text-[9px] text-[#141414]">
        <div className="bg-[#141414] px-2 py-1 text-[9.5px] font-bold uppercase text-white">
          Sequência de Tensões e Resultados
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#f1f1f1] text-[8.5px] font-semibold">
              <td className="border border-[#141414] px-1 py-0.5 text-center">Nº</td>
              <td className="border border-[#141414] px-1 py-0.5 text-center">σ3 (kPa)</td>
              <td className="border border-[#141414] px-1 py-0.5 text-center">σd (kPa)</td>
              <td className="border border-[#141414] px-1 py-0.5 text-center">θ (kPa)</td>
              <td className="border border-[#141414] px-1 py-0.5 text-center">τoct (kPa)</td>
              <td className="border border-[#141414] px-1 py-0.5 text-center">εr recup. (mm)</td>
              <td className="border border-[#141414] px-1 py-0.5 text-center">MR medido (MPa)</td>
              <td className="border border-[#141414] px-1 py-0.5 text-center">MR modelo (MPa)</td>
            </tr>
          </thead>
          <tbody>
            {sample.states.map((st) => {
              const mr = mrOf(st, h0);
              const predicted = fit ? predictMR(fit, st.sigma3, st.sigmaD, pa) : null;
              return (
                <tr key={st.id}>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{st.ordem}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(st.sigma3, 1)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(st.sigmaD, 1)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(thetaOf(st.sigma3, st.sigmaD), 1)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(tauOctOf(st.sigmaD), 1)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{st.recoverableStrainMm == null ? "—" : fmt(st.recoverableStrainMm, 3)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center font-medium">{fmt(mr, 1)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(predicted, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ReportPage>
  );
}

export function MRPage() {
  const ctx = useOptionalLabEnsaio();
  const { lookup } = useCadastroByOs();
  const cad = ctx?.os?.numero ? lookup(ctx.os.numero) : undefined;
  const { displayName, user } = useAuth();
  const currentUserName = displayName || user?.email?.split("@")[0] || "Cleitton Pereira";

  const scopeId =
    ctx && ctx.os && ctx.amostra && ctx.ensaio
      ? buildScopeId(ctx.os.id, ctx.amostra.id, ctx.ensaio.id)
      : (ctx?.ensaio?.id ?? "local");
  const draftActivity = useDraftActivity(scopeId);

  const draftRef = useRef<ReturnType<typeof loadDraft>>(null);
  if (draftRef.current === null) draftRef.current = loadDraft(scopeId);

  const payloadDraft = ctx?.ensaio?.payload as any;
  const draft = payloadDraft ?? draftRef.current ?? undefined;

  const initialSample: ModuloResilienciaSample = useMemo(() => {
    const base = seedModuloResilienciaSample();
    if (!ctx) return { ...base, typedBy: currentUserName, operator: currentUserName };
    return {
      ...base,
      client: ctx.os.client || cad?.tomador || "",
      workNumber: ctx.os.workNumber || cad?.obra || "",
      os: ctx.os.numero || "",
      local: ctx.os.local || cad?.local || "",
      operator: ctx.ensaio.operator || ctx.os.operator || currentUserName,
      technicalResp: ctx.os.technicalResp || "Engº Maurício Malanconi - CREA: 5063078630",
      revision: ctx.os.revision || "0",
      reportNumber: ctx.amostra.reportNumber || "",
      borehole: ctx.amostra.borehole || "",
      depth: ctx.amostra.depth || "",
      description: ctx.amostra.description || "",
      code: ctx.amostra.code || "",
      granulometricDescription: ctx.amostra.granulometricDescription || "",
      date: new Date().toISOString().split("T")[0],
      typedBy: ctx.ensaio.operator || currentUserName,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.os?.id, ctx?.amostra?.id]);

  const [sample, setSample] = useState<ModuloResilienciaSample>(() =>
    draft?.sample ? { ...initialSample, ...draft.sample } : initialSample,
  );

  useEffect(() => {
    if (!sample.typedBy && currentUserName) {
      setSample((prev) => ({ ...prev, typedBy: currentUserName }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserName]);

  // Grau de compactação derivado automaticamente quando os dois valores existem.
  useEffect(() => {
    const { dryDensity, maxDryDensity } = sample.compaction;
    if (dryDensity && maxDryDensity) {
      const gc = Math.round((dryDensity / maxDryDensity) * 1000) / 10;
      if (sample.compaction.degreeOfCompactionPct !== gc) {
        setSample((prev) => ({ ...prev, compaction: { ...prev.compaction, degreeOfCompactionPct: gc } }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sample.compaction.dryDensity, sample.compaction.maxDryDensity]);

  const [geomOpen, setGeomOpen] = useState(true);
  const [statesOpen, setStatesOpen] = useState(true);
  const [photoOpen, setPhotoOpen] = useState(true);

  const [saveBusy, setSaveBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [versions, setVersions] = useState<ReportVersion[]>([]);
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null);
  const [wfStatus, setWfStatus] = useState(() => (ctx?.ensaio as any)?.status || "digitacao");
  const [remoteLoaded, setRemoteLoaded] = useState(false);

  const [decideOpen, setDecideOpen] = useState<null | {
    rev: number;
    stage: "verify" | "approve";
    decision: "verificado" | "rejeitado_verificacao" | "aprovado" | "rejeitado";
  }>(null);
  const [decideComment, setDecideComment] = useState("");
  const [decideBusy, setDecideBusy] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);

  const refreshVersions = async () => {
    const v = await listVersions(scopeId);
    setVersions(v);
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
    refreshApprovals();
    fetchDriveStatus(scopeId).catch(() => {});
    fetchRemoteDraft(scopeId, {
      osNum: ctx?.os?.numero,
      amCode: ctx?.amostra?.reportNumber || ctx?.amostra?.code,
      ensaioTipo: "modulo-resiliencia",
    })
      .then((remote) => {
        if (remote?.sample) setSample((s) => ({ ...s, ...remote.sample }));
        setRemoteLoaded(true);
      })
      .catch(() => setRemoteLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId]);

  useEffect(() => {
    if (!remoteLoaded) return;
    const draftPhotos = ctx?.photos ?? (draft as any)?.photos ?? [];
    const draftData = { sample, photos: draftPhotos };
    saveDraft(scopeId, draftData, { id: user?.id, name: displayName });
    if (ctx?.ensaio) ctx.onPayloadChange(draftData);
    // Depende só de `sample`/`ctx?.photos` (valores de conteúdo), NUNCA do
    // objeto `ctx` inteiro — o LabEnsaioProvider recria esse objeto a cada
    // render, e como `ctx.onPayloadChange` sempre regrava `ensaio.payload`
    // (nova referência), depender de `ctx` aqui formava um laço infinito:
    // grava → ensaio muda de referência → ctx muda → efeito recorre → grava de novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteLoaded, scopeId, sample, ctx?.photos]);

  const updateSample = <K extends keyof ModuloResilienciaSample>(k: K, v: ModuloResilienciaSample[K]) =>
    setSample((s) => ({ ...s, [k]: v }));
  const updateCompaction = <K extends keyof ModuloResilienciaSample["compaction"]>(
    k: K,
    v: ModuloResilienciaSample["compaction"][K],
  ) => setSample((s) => ({ ...s, compaction: { ...s.compaction, [k]: v } }));
  const updateGeometry = <K extends keyof ModuloResilienciaSample["geometry"]>(
    k: K,
    v: ModuloResilienciaSample["geometry"][K],
  ) => setSample((s) => ({ ...s, geometry: { ...s.geometry, [k]: v } }));
  const updateState = (id: string, patch: Partial<StressState>) =>
    setSample((s) => ({ ...s, states: s.states.map((st) => (st.id === id ? { ...st, ...patch } : st)) }));

  const validCount = useMemo(
    () => sample.states.filter((st) => st.recoverableStrainMm != null && st.recoverableStrainMm > 0).length,
    [sample.states],
  );

  const handleCalcularAjuste = () => {
    const fit = fitCompositeModel(sample);
    if (!fit) {
      toast.error("Não foi possível ajustar o modelo — preencha ao menos 4 estados com deformação recuperável válida.");
      return;
    }
    setSample((s) => ({ ...s, modelFit: fit }));
    toast.success(`Modelo ajustado: k1=${fmt(fit.k1, 3)}, k2=${fmt(fit.k2, 3)}, k3=${fmt(fit.k3, 3)}, R²=${fmt(fit.r2, 3)}`);
  };

  const buildReportPdfBlob = async (): Promise<Blob> => {
    const el = reportRef.current;
    if (!el) throw new Error("Container do relatório não encontrado.");

    const prevStyle = {
      position: el.style.position,
      top: el.style.top,
      left: el.style.left,
      width: el.style.width,
      zIndex: el.style.zIndex,
      opacity: el.style.opacity,
      visibility: el.style.visibility,
    };

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
      Object.assign(el.style, prevStyle);
    }
  };

  const handleGeneratePdf = async () => {
    const toastId = toast.loading("Gerando PDF do relatório…");
    try {
      const blob = await buildReportPdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base = (sample.workNumber || sample.os || "relatorio").toString().replace(/[^\w-]+/g, "_");
      a.download = `Modulo-Resiliencia_${base}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF gerado e baixado com sucesso!", { id: toastId });
    } catch (err) {
      toast.error("Erro ao gerar PDF: " + (err instanceof Error ? err.message : String(err)), { id: toastId });
    }
  };

  const handleSaveVersion = async (opts?: { skipVerification?: boolean }) => {
    const skipVerification = opts?.skipVerification === true;
    setSample((prev) => ({ ...prev, typedBy: currentUserName }));
    setWfStatus(skipVerification ? "aguardando_aprovacao" : "aguardando_verificacao");
    setSaveBusy(true);
    const tid = toast.loading("Gerando e salvando versão PDF…");
    try {
      const blob = await buildReportPdfBlob();
      const rev = await nextRev(scopeId);
      const base = (sample.workNumber || sample.os || "relatorio").toString().replace(/[^\w-]+/g, "_");
      const filename = `Modulo-Resiliencia_${base}_Rev-${String(rev).padStart(2, "0")}.pdf`;
      const saved = await saveVersion({ scopeId, rev, filename, size: blob.size, pdfBlob: blob });
      await refreshVersions();

      try {
        const fotos = (ctx?.photos ?? [])
          .map((p) => {
            const m = /^data:(.*?);base64,(.*)$/.exec(p.dataUrl);
            const mimeType = m?.[1] || "image/jpeg";
            const b64 = m?.[2] || "";
            const ext = mimeType.split("/")[1] || "jpg";
            return { cpId: "geral", filename: `${p.kind}_${p.id}.${ext}`, mimeType, base64: b64 };
          })
          .filter((f) => f.base64.length > 0);

        const resDrive = await syncRevision({
          scopeId,
          rev: saved.rev,
          pdfBlob: blob,
          pdfFilename: filename,
          sample,
          photos: ctx?.photos || [],
          ctxOs: ctx?.os,
          ctxAmostra: ctx?.amostra,
          ctxEnsaio: { tipo: "modulo-resiliencia", nome: sample.reportNumber },
          fotos,
        });
        if (resDrive?.folderUrl) setDriveFolderUrl(resDrive.folderUrl);
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
            ensaio_tipo: "modulo-resiliencia",
            ensaio_nome: "Módulo de Resiliência",
          },
        },
      });
      const currentDraft = { sample, photos: ctx?.photos || [] };
      saveDraft(scopeId, currentDraft, { id: user?.id, name: displayName });
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

  const rawSt = wfStatus || approvals[0]?.status || (ctx?.ensaio as any)?.status || "digitacao";
  const isAguardandoVerif = rawSt === "aguardando_verificacao" || rawSt === "pendente_verificacao" || rawSt === "digitado" || rawSt === "verificacao";
  const isAguardandoAprov = rawSt === "aguardando_aprovacao" || rawSt === "pendente_aprovacao" || rawSt === "verificado";
  const isAprovado = rawSt === "aprovado" || rawSt === "concluido";
  const rev = approvals[0]?.rev ?? 0;

  return (
    <>
      {/* Confirmação: restaurar sequência padrão */}
      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Restaurar sequência padrão de tensões?</DialogTitle>
            <DialogDescription>
              Isso substitui os 18 pares (σ3, σd) atuais pela sequência padrão AASHTO T307/DNIT 134 e apaga as
              deformações já digitadas nesta tela.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setResetConfirmOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => {
                setSample((s) => ({ ...s, states: seedStressStates(), modelFit: null }));
                setResetConfirmOpen(false);
                toast.success("Sequência padrão restaurada.");
              }}
            >
              Restaurar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <DialogDescription>Revisão {decideOpen ? String(decideOpen.rev).padStart(2, "0") : ""}</DialogDescription>
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
            <Button variant="ghost" onClick={() => setDecideOpen(null)} disabled={decideBusy}>Cancelar</Button>
            <Button
              variant={decideOpen?.decision === "rejeitado" || decideOpen?.decision === "rejeitado_verificacao" ? "destructive" : "default"}
              disabled={decideBusy}
              onClick={async () => {
                if (!decideOpen) return;
                setDecideBusy(true);
                try {
                  if (decideOpen.stage === "verify") {
                    await verifyApproval({ data: { scopeId, rev: decideOpen.rev, decision: decideOpen.decision as any, comment: decideComment } });
                  } else {
                    await decideApproval({ data: { scopeId, rev: decideOpen.rev, decision: decideOpen.decision as any, comment: decideComment } });
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

      {/* Pré-visualização do relatório */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-[96vw] w-[96vw] h-[95vh] flex flex-col p-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 border-b bg-card">
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Módulo de Resiliência — Pré-visualização (2 páginas)
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">A4 · 210 × 297 mm</DialogDescription>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto bg-[#525659] p-8 flex justify-center">
            <div className="flex flex-col items-center gap-8 shrink-0 pb-12">
              <div className="w-[210mm] h-[297mm] shadow-2xl bg-white shrink-0 overflow-hidden">
                <MRReportPage1 sample={sample} />
              </div>
              <div className="w-[210mm] h-[297mm] shadow-2xl bg-white shrink-0 overflow-hidden">
                <MRReportPage2 sample={sample} />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex h-full flex-col bg-background p-4 lg:p-6 pb-20">
        {/* Cabeçalho */}
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Gauge className="h-6 w-6" />
            </div>
            <div>
              <EnsaioBadgesRow
                norms={["DNIT 134/2018-ME"]}
                status={rawSt}
                lastSavedAt={draftActivity.lastSavedAt}
                history={draftActivity.history}
              />
              <EnsaioTitleBlock
                title="Módulo de Resiliência de Solos"
                description="Ensaio triaxial cíclico de carga repetida — modelo composto (universal) k1·k2·k3."
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end">
            {isAguardandoVerif && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-violet-500/50 bg-violet-500/10 text-violet-800 dark:text-violet-300 font-semibold px-3 py-1.5 text-xs">
                  ✓ Aguardando Verificação
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
                  <ShieldCheck className="h-4 w-4" /> Verificar Laudo
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleSaveVersion()} disabled={saveBusy} className="text-xs">
                  Atualizar / Gerar Nova Prévia
                </Button>
              </div>
            )}

            {isAguardandoAprov && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-indigo-500/50 bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 font-semibold px-3 py-1.5 text-xs">
                  ✓ Aguardando Aprovação RT
                </Badge>
                <Button
                  size="sm"
                  onClick={() => setDecideOpen({ rev, stage: "approve", decision: "aprovado" })}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
                >
                  <CheckCircle2 className="h-4 w-4" /> Aprovar Laudo Oficial
                </Button>
              </div>
            )}

            {isAprovado && (
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-600 text-white font-semibold px-3 py-1.5 text-xs">✓ Laudo Oficial Aprovado</Badge>
                <Button variant="outline" size="sm" onClick={() => handleSaveVersion({ skipVerification: true })} disabled={saveBusy} className="text-xs gap-1.5">
                  <Send className="h-3.5 w-3.5" /> Gerar Nova Revisão
                </Button>
              </div>
            )}

            {!isAguardandoVerif && !isAguardandoAprov && !isAprovado && (
              <Button size="sm" onClick={() => handleSaveVersion()} disabled={saveBusy} className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold">
                <Send className="h-4 w-4" />
                {saveBusy ? "Enviando…" : "Terminei a digitação — Enviar para verificação"}
              </Button>
            )}

            <Button variant="outline" size="sm" onClick={() => setReportOpen(true)}>
              <Eye className="mr-1.5 h-4 w-4" /> Visualizar Relatório
            </Button>
            <Button variant="outline" size="sm" onClick={handleGeneratePdf}>
              <Download className="mr-1.5 h-4 w-4" /> Baixar PDF
            </Button>
          </div>
        </div>

        <ResponsaveisBar
          operador={sample.operator || ctx?.ensaio?.operator || "—"}
          digitadoPor={sample.typedBy || currentUserName}
          respTecnico={sample.technicalResp}
        />

        <EditingPresenceBanner
          lastSavedAt={draftActivity.lastSavedAt}
          lastSavedByName={draftActivity.lastSavedByName}
          lastSavedById={draftActivity.lastSavedById}
          currentUserId={user?.id}
        />

        {/* Identificação */}
        <div className="mt-3">
          <AmostraSummaryCard
            reportNumber={sample.reportNumber}
            osNumero={sample.os}
            subtitle={`${sample.client || "—"} · Furo ${sample.borehole || "—"} · Prof. ${sample.depth || "—"}`}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <TxtField label="Cliente" value={sample.client} onChange={(v) => updateSample("client", v)} />
              <TxtField label="Obra" value={sample.workNumber} onChange={(v) => updateSample("workNumber", v)} />
              <TxtField label="O.S." value={sample.os} onChange={(v) => updateSample("os", v)} />
              <TxtField label="Amostra" value={sample.reportNumber} onChange={(v) => updateSample("reportNumber", v)} />
              <TxtField label="Furo" value={sample.borehole} onChange={(v) => updateSample("borehole", v)} />
              <TxtField label="Profundidade" value={sample.depth} onChange={(v) => updateSample("depth", v)} />
              <TxtField label="Local" value={sample.local} onChange={(v) => updateSample("local", v)} />
              <TxtField label="Código" value={sample.code} onChange={(v) => updateSample("code", v)} />
              <div className="col-span-2 md:col-span-2">
                <TxtField label="Descrição Tátil-Visual" value={sample.description} onChange={(v) => updateSample("description", v)} />
              </div>
              <div className="col-span-2 md:col-span-2">
                <TxtField label="Descrição Granulométrica" value={sample.granulometricDescription} onChange={(v) => updateSample("granulometricDescription", v)} />
              </div>
            </div>
          </AmostraSummaryCard>
        </div>

        {/* Compactação / Geometria */}
        <Card className="mb-4">
          <CardHeader className="pb-2 cursor-pointer" onClick={() => setGeomOpen((v) => !v)}>
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Settings2 className="h-4 w-4 text-muted-foreground" /> Corpo de Prova — Moldagem / Compactação</span>
              <span className="text-xs text-muted-foreground font-normal">{geomOpen ? "Ocultar" : "Mostrar"}</span>
            </CardTitle>
          </CardHeader>
          {geomOpen && (
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <NumField label="Diâmetro (mm)" value={sample.geometry.diameterMm} step={0.1} onChange={(v) => updateGeometry("diameterMm", v)} />
              <NumField label="Altura (mm)" value={sample.geometry.heightMm} step={0.1} onChange={(v) => updateGeometry("heightMm", v)} />
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Energia</Label>
                <Select value={sample.compaction.energy} onValueChange={(v) => updateCompaction("energy", v as any)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PN">Proctor Normal (PN)</SelectItem>
                    <SelectItem value="PI">Proctor Intermediário (PI)</SelectItem>
                    <SelectItem value="PM">Proctor Modificado (PM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <TxtField label="Equipamento" value={sample.equipment || ""} onChange={(v) => updateSample("equipment", v)} />
              <NumField label="Umidade Moldagem (%)" value={sample.compaction.moistureContentPct} step={0.1} onChange={(v) => updateCompaction("moistureContentPct", v)} />
              <NumField label="Umidade Ótima (%)" value={sample.compaction.optimumMoisturePct} step={0.1} onChange={(v) => updateCompaction("optimumMoisturePct", v)} />
              <NumField label="ρd Moldado (g/cm³)" value={sample.compaction.dryDensity} step={0.001} onChange={(v) => updateCompaction("dryDensity", v)} />
              <NumField label="ρd Máx. Proctor (g/cm³)" value={sample.compaction.maxDryDensity} step={0.001} onChange={(v) => updateCompaction("maxDryDensity", v)} />
              <NumField label="Grau de Compactação (%)" value={sample.compaction.degreeOfCompactionPct} step={0.1} disabled onChange={() => {}} />
              <NumField label="Pressão Atm. Referência Pa (kPa)" value={sample.atmPressureKpa} step={0.1} onChange={(v) => updateSample("atmPressureKpa", v)} />
            </CardContent>
          )}
        </Card>

        {/* Sequência de tensões */}
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-2">
              <span className="flex items-center gap-1.5 cursor-pointer" onClick={() => setStatesOpen((v) => !v)}>
                <Gauge className="h-4 w-4 text-muted-foreground" /> Sequência de Tensões (σ3 / σd) — {validCount}/{sample.states.length} estados preenchidos
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => setResetConfirmOpen(true)}>
                  <RotateCcw className="h-3.5 w-3.5" /> Restaurar Padrão
                </Button>
                <Button size="sm" className="h-7 text-xs gap-1.5" onClick={handleCalcularAjuste}>
                  <Calculator className="h-3.5 w-3.5" /> Calcular Ajuste do Modelo
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          {statesOpen && (
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-12 text-center">Nº</TableHead>
                      <TableHead className="w-24">σ3 (kPa)</TableHead>
                      <TableHead className="w-24">σd (kPa)</TableHead>
                      <TableHead className="w-24 text-center">θ (kPa)</TableHead>
                      <TableHead className="w-24 text-center">τoct (kPa)</TableHead>
                      <TableHead className="w-32">εr recuperável (mm)</TableHead>
                      <TableHead className="w-24">Ciclos</TableHead>
                      <TableHead className="w-28 text-center">MR medido (MPa)</TableHead>
                      <TableHead className="w-28 text-center">MR modelo (MPa)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sample.states.map((st) => {
                      const mr = mrOf(st, sample.geometry.heightMm);
                      const predicted = sample.modelFit
                        ? predictMR(sample.modelFit, st.sigma3, st.sigmaD, sample.atmPressureKpa)
                        : null;
                      return (
                        <TableRow key={st.id}>
                          <TableCell className="text-center text-xs font-medium">{st.ordem}</TableCell>
                          <TableCell>
                            <Input
                              type="number" step={0.1} value={st.sigma3}
                              onChange={(e) => updateState(st.id, { sigma3: parseFloat(e.target.value) || 0 })}
                              className="h-7 text-xs"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number" step={0.1} value={st.sigmaD}
                              onChange={(e) => updateState(st.id, { sigmaD: parseFloat(e.target.value) || 0 })}
                              className="h-7 text-xs"
                            />
                          </TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">{fmt(thetaOf(st.sigma3, st.sigmaD), 1)}</TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">{fmt(tauOctOf(st.sigmaD), 1)}</TableCell>
                          <TableCell>
                            <Input
                              type="number" step={0.001} value={st.recoverableStrainMm ?? ""}
                              placeholder="—"
                              onChange={(e) => updateState(st.id, { recoverableStrainMm: e.target.value === "" ? null : parseFloat(e.target.value) })}
                              className="h-7 text-xs"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number" step={1} value={st.cycles ?? ""}
                              placeholder="—"
                              onChange={(e) => updateState(st.id, { cycles: e.target.value === "" ? null : parseFloat(e.target.value) })}
                              className="h-7 text-xs"
                            />
                          </TableCell>
                          <TableCell className="text-center text-xs font-semibold">{fmt(mr, 1)}</TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">{fmt(predicted, 1)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {sample.modelFit && (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-md border bg-muted/30 p-3">
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">k1</div>
                    <div className="text-sm font-bold text-foreground">{fmt(sample.modelFit.k1, 4)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">k2</div>
                    <div className="text-sm font-bold text-foreground">{fmt(sample.modelFit.k2, 4)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">k3</div>
                    <div className="text-sm font-bold text-foreground">{fmt(sample.modelFit.k3, 4)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground">R²</div>
                    <div className="text-sm font-bold text-foreground">{fmt(sample.modelFit.r2, 4)}</div>
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Fotos */}
        <Card className="mb-4">
          <CardHeader className="pb-2 cursor-pointer" onClick={() => setPhotoOpen((v) => !v)}>
            <CardTitle className="text-sm flex items-center justify-between">
              Registro Fotográfico
              <span className="text-xs text-muted-foreground font-normal">{photoOpen ? "Ocultar" : "Mostrar"}</span>
            </CardTitle>
          </CardHeader>
          {photoOpen && ctx && (
            <CardContent>
              <PhotoUploader
                title="Moldagem / Corpo de Prova"
                kind="moldagem"
                photos={ctx.photos}
                onAdd={ctx.addPhoto}
                onRemove={ctx.removePhoto}
                onUpdate={ctx.updatePhoto}
              />
            </CardContent>
          )}
        </Card>

        {/* RELATÓRIO — cópia sempre montada para rasterização offscreen */}
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
          <MRReportPage1 sample={sample} />
          <MRReportPage2 sample={sample} />
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
      </div>
    </>
  );
}
