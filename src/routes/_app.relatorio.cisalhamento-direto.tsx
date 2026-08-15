import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
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
  AlertTriangle,
  Upload,
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
} from "@/features/cisalhamento-direto/types";
import { SEED_CD_SAMPLE, makeEmptyCDSpecimen } from "@/features/cisalhamento-direto/seed";
import { loadDraft, saveDraft } from "@/features/cisalhamento-direto/draftStore";
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
  getReportTitle,
} from "@/features/cisalhamento-direto/components/CDReportPages";
import { CDSpecimensSummaryCard } from "@/features/cisalhamento-direto/components/CDSpecimensSummaryCard";
import { CDImportDialog } from "@/features/cisalhamento-direto/components/CDImportDialog";
import { parseCDXlsx } from "@/features/cisalhamento-direto/importXlsx";

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

export function CDPage() {
  const ctx = useOptionalLabEnsaio();
  const navigate = useNavigate();

  const scopeId =
    ctx?.os && ctx.amostra && ctx.ensaio
      ? `os/${ctx.os.id}/amostra/${ctx.amostra.id}/ensaio/${ctx.ensaio.id}`
      : (ctx?.ensaio?.id ?? "local");

  const draftRef = useRef<ReturnType<typeof loadDraft>>(null);
  if (draftRef.current === null) draftRef.current = loadDraft(scopeId);

  const payloadDraft = (ctx?.ensaio?.payload as any);
  const draft = payloadDraft ?? draftRef.current ?? undefined;

  const initialSample: CDSample = ctx
    ? {
        ...SEED_CD_SAMPLE,
        client: ctx.os.client ?? SEED_CD_SAMPLE.client,
        workNumber: ctx.os.workNumber ?? SEED_CD_SAMPLE.workNumber,
        os: ctx.os.numero || SEED_CD_SAMPLE.os,
        local: ctx.os.local ?? SEED_CD_SAMPLE.local,
        operator: ctx.ensaio.operator || ctx.os.operator || SEED_CD_SAMPLE.operator,
        technicalResp: ctx.os.technicalResp ?? SEED_CD_SAMPLE.technicalResp,
        revision: ctx.os.revision ?? SEED_CD_SAMPLE.revision,
        reportNumber: ctx.amostra.reportNumber || SEED_CD_SAMPLE.reportNumber,
        borehole: ctx.amostra.borehole || SEED_CD_SAMPLE.borehole,
        depth: ctx.amostra.depth || SEED_CD_SAMPLE.depth,
        description: ctx.amostra.description || SEED_CD_SAMPLE.description,
        code: ctx.amostra.code || SEED_CD_SAMPLE.code,
        granulometricDescription: ctx.amostra.granulometricDescription ?? SEED_CD_SAMPLE.granulometricDescription,
      }
    : SEED_CD_SAMPLE;

  const [sample, setSample] = useState<CDSample>(() => (draft?.sample ? { ...initialSample, ...draft.sample } : initialSample));
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

  const [axisCfg, setAxisCfg] = useState(() => draft?.axisCfg ?? {
    eaMax: 0,
    tauMax: 0,
    sigmaNMax: 0,
    vertDispMin: 0,
    vertDispMax: 0,
  });

  const [idOpen, setIdOpen] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVerificador, setIsVerificador] = useState(false);
  const [wfStatus, setWfStatus] = useState("digitacao");
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
    return () => {
      cancelled = true;
    };
  }, []);

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
      setWfStatus(res.statuses[scopeId] ?? "digitacao");
    } catch (err) {
      console.warn(err);
    }
  };

  useEffect(() => {
    refreshVersions();
    refreshDriveStatus();
    refreshApprovals();
  }, [scopeId]);

  useEffect(() => {
    const h = window.setTimeout(() => {
      const draftData = { sample, specimens, selectedCpId, tab, adjust, axisCfg };
      saveDraft(scopeId, draftData);
      if (ctx?.ensaio) ctx.onPayloadChange(draftData);
    }, 300);
    return () => window.clearTimeout(h);
  }, [scopeId, sample, specimens, selectedCpId, tab, adjust, axisCfg, ctx]);

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
    let pages: HTMLElement[] = [];
    
    // Se o modal de pré-visualização estiver aberto, busca primeiro as páginas visíveis nele
    const modalEl = document.querySelector("[role='dialog']");
    if (modalEl) {
      pages = Array.from(modalEl.querySelectorAll<HTMLElement>(".printable-report"));
    }
    if (pages.length === 0 && reportRef.current) {
      pages = Array.from(reportRef.current.querySelectorAll<HTMLElement>(".printable-report"));
    }
    if (pages.length === 0) {
      pages = Array.from(document.querySelectorAll<HTMLElement>(".printable-report"));
    }
    if (pages.length === 0) throw new Error("Nenhuma página do relatório encontrada.");

    // Aguarda frames para que os gráficos SVG renderizem
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
    await new Promise((r) => setTimeout(r, 200));

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const W = 210, H = 297;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const rect = page.getBoundingClientRect();
      const w = Math.ceil(rect.width) || 794;
      const h = Math.ceil(rect.height) || 1123;

      const canvas = await toCanvas(page, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#ffffff",
        width: w,
        height: h,
        skipAutoScale: true,
        style: {
          background: "#ffffff",
          color: "#0f172a",
          transform: "none",
        },
        filter: (node) => !(node instanceof HTMLElement && node.classList.contains("no-print")),
      });

      const dataUrl = canvas.toDataURL("image/png");
      if (!dataUrl || !dataUrl.startsWith("data:image/png;base64,")) {
        const jpegUrl = canvas.toDataURL("image/jpeg", 0.95);
        if (!jpegUrl || !jpegUrl.startsWith("data:image/jpeg;base64,")) {
          throw new Error(`Falha ao capturar imagem da página ${i + 1}`);
        }
        if (i > 0) pdf.addPage("a4", "portrait");
        pdf.addImage(jpegUrl, "JPEG", 0, 0, W, H, undefined, "FAST");
      } else {
        if (i > 0) pdf.addPage("a4", "portrait");
        pdf.addImage(dataUrl, "PNG", 0, 0, W, H, undefined, "FAST");
      }
    }

    return pdf.output("blob");
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

  const handleSaveVersion = async (opts?: { skipVerification?: boolean }) => {
    const skipVerification = opts?.skipVerification === true;
    setSaveBusy(true);
    const tid = toast.loading("Gerando e salvando versão PDF…");
    try {
      const blob = await buildReportPdfBlob();
      const rev = await nextRev(scopeId);
      const base = (sample.workNumber || sample.os || "relatorio").toString().replace(/[^\w-]+/g, "_");
      const filename = `Cisalhamento-Direto_${base}_Rev-${String(rev).padStart(2, "0")}.pdf`;
      const saved = await saveVersion({ scopeId, rev, filename, size: blob.size, pdfBlob: blob });
      await refreshVersions();

      toast.success(`Prévia ${String(saved.rev).padStart(2, "0")} salva localmente`, { id: tid });

      // Sincronização com o Drive (opcional / em segundo plano)
      const syncId = toast.loading("Sincronizando com o Google Drive…");
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
          ctxOs: ctx?.os,
          ctxAmostra: ctx?.amostra,
          ctxEnsaio: { tipo: "cisalhamento-direto", nome: sample.reportNumber },
          fotos,
        });
        if (resDrive?.folderUrl) setDriveFolderUrl(resDrive.folderUrl);
        await refreshDriveStatus();
        toast.success("Sincronizado com o Google Drive ✓", { id: syncId });
      } catch (err) {
        console.warn("Drive sync standby:", err);
        toast.info("Versão salva localmente (Google Drive em standby)", { id: syncId });
      }

      await requestApproval({ data: { scopeId, rev: saved.rev, filename, skipVerification } });
      await refreshApprovals();
      toast.success(
        skipVerification
          ? `Prévia ${String(saved.rev).padStart(2, "0")} enviada para aprovação`
          : `Prévia ${String(saved.rev).padStart(2, "0")} enviada para verificação`,
      );
    } catch (err) {
      toast.error("Erro ao salvar: " + (err instanceof Error ? err.message : String(err)), { id: tid });
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
                <WorkflowFarol status={wfStatus} />
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
              const st = wfStatus;
              const rev = approvals[0]?.rev;
              if (st === "aguardando_verificacao" && (isVerificador || isAdmin)) {
                return (
                  <Button
                    size="sm"
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
              if (st === "aguardando_aprovacao" && isAdmin && typeof rev === "number") {
                return (
                  <Button
                    size="sm"
                    onClick={() => setDecideOpen({ rev, stage: "approve", decision: "aprovado" })}
                    className="gap-2"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Aprovar relatório
                  </Button>
                );
              }
              if (st === "aprovado") {
                const nextNum = (approvals[0]?.rev ?? versions[0]?.rev ?? 0) + 1;
                return (
                  <Button
                    size="sm"
                    onClick={() => handleSaveVersion({ skipVerification: true })}
                    disabled={saveBusy}
                    className="gap-2"
                  >
                    <Send className="h-4 w-4" />
                    {saveBusy ? "Enviando…" : `Gerar Prévia ${String(nextNum).padStart(2, "0")} — Enviar para aprovação`}
                  </Button>
                );
              }
              return (
                <Button size="sm" onClick={() => handleSaveVersion()} disabled={saveBusy} className="gap-2">
                  <Send className="h-4 w-4" />
                  {saveBusy ? "Enviando…" : "Terminei a digitação — Enviar para verificação"}
                </Button>
              );
            })()}

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

            {/* Visualizar Relatório */}
            <Button variant="outline" size="sm" onClick={() => setReportOpen(true)}>
              <Eye className="mr-1.5 h-4 w-4" /> Visualizar Relatório
            </Button>
          </div>
        </div>

        {/* Barra Superior de Operador e Digitador (Igual Triaxial CID) */}
        <div className="mb-4 grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">
              Operador do ensaio (Laboratorista)
            </Label>
            <div className="flex-1">
              <PickerWithCreate
                kind="operators"
                value={sample.operator ?? ""}
                onChange={(v) => updateSample("operator", v)}
                placeholder="Selecione o laboratorista…"
                createLabel="Novo laboratorista"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">
              Digitado por
            </Label>
            <div className="flex-1">
              <PickerWithCreate
                kind="typists"
                value={sample.typedBy ?? ""}
                onChange={(v) => updateSample("typedBy", v)}
                placeholder="Selecione quem digitou…"
                createLabel="Novo digitador"
              />
            </div>
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
                    {ctx.os.client || "—"} · Furo {ctx.amostra.borehole || "—"} · Prof. {ctx.amostra.depth || "—"}
                    {ctx.coords && (
                      <> · N {ctx.coords.N ?? "—"} · E {ctx.coords.E ?? "—"} · Cota {ctx.coords.cota ?? "—"}</>
                    )}
                  </CardDescription>
                </div>
                <a
                  href={`/os/${ctx.os.id}/amostra/${ctx.amostra.id}`}
                  className="text-xs text-primary hover:underline"
                >
                  editar amostra →
                </a>
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
                    <Button size="sm" variant="outline" onClick={handleImportXlsxFile}>
                      <Upload className="mr-1.5 h-3.5 w-3.5" /> Importar Dados Brutos (XLSX)
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
                            <TableHead className="text-xs">Carga (kgf)</TableHead>
                            <TableHead className="text-xs">Recalque V (mm)</TableHead>
                            <TableHead className="text-xs">τ (kPa)</TableHead>
                            <TableHead className="w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cp.shearData.map((r, i) => {
                            const calcPoint = res.curve[i];
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
                                    step="0.1"
                                    value={r.loadKgf ?? r.shearForce / 9.80665}
                                    onChange={(e) => {
                                      const next = [...cp.shearData];
                                      const v = parseFloat(e.target.value) || 0;
                                      next[i].loadKgf = v;
                                      next[i].shearForce = v * 9.80665;
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
                  <div className="flex items-center gap-2">
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
                                    className="gap-1 text-xs"
                                    onClick={() => viewVersion(v)}
                                    title="Visualizar PDF"
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
          <CDReportPage3 sample={sample} specimens={sortedSpecimens} results={results} totalPages={totalPages} />
          <CDReportPage4 sample={sample} specimens={sortedSpecimens} results={results} envelope={envelope} totalPages={totalPages} />
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

        {/* Modal de Pré-visualização do Relatório Completo */}
        <Dialog open={reportOpen} onOpenChange={setReportOpen}>
          <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] flex flex-col p-0">
            <DialogHeader className="px-6 py-4 border-b">
              <DialogTitle>{getReportTitle(sample.testCondition)} — Pré-visualização ({totalPages} Páginas)</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-auto bg-[#525659] p-8">
              <div className="mx-auto max-w-fit flex flex-col items-center gap-8">
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
                  <CDReportPage3 sample={sample} specimens={sortedSpecimens} results={results} totalPages={totalPages} />
                </div>

                {/* Página 4 */}
                <div className="w-[210mm] h-[297mm] shadow-2xl bg-white shrink-0 overflow-hidden">
                  <CDReportPage4 sample={sample} specimens={sortedSpecimens} results={results} envelope={envelope} totalPages={totalPages} />
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
            <DialogFooter className="px-6 py-4 border-t bg-background flex flex-wrap items-center justify-between gap-2">
              <Button variant="outline" onClick={() => setReportOpen(false)}>
                Fechar
              </Button>
              <div className="flex items-center gap-2">
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
      </div>
    </>
  );
}
