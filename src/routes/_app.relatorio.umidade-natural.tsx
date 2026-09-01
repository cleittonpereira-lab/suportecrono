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
  Droplets,
  Send,
  ShieldCheck,
  Plus,
  Trash2,
  CheckCircle2,
  Beaker,
  History,
  FileText,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import {
  listVersions,
  saveVersion,
  nextRev,
  deleteVersion,
  downloadVersion,
  type ReportVersion,
} from "@/features/umidade-natural/report-versions";
import { syncRevision, fetchDriveStatus } from "@/features/umidade-natural/driveSync";
import { ReportVersionsPanel } from "@/components/report/ReportVersionsPanel";
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
import type { UmidadeNaturalSample, MoistureCapsule } from "@/features/umidade-natural/types";
import { seedUmidadeNaturalSample } from "@/features/umidade-natural/types";
import { capsuleMoisturePct, averageMoisturePct, moistureDeviations } from "@/features/umidade-natural/calc";
import { loadDraft, saveDraft, fetchRemoteDraft, flushDraft } from "@/features/umidade-natural/draftStore";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export const Route = createFileRoute("/_app/relatorio/umidade-natural")({
  component: () => {
    const ctx = useOptionalLabEnsaio();
    return ctx?.ensaio ? <UNPage /> : <EnsaioListByType tipo="umidade-natural" />;
  },
  head: () => ({
    meta: [
      { title: "Umidade Natural — Suporte INFRA" },
      {
        name: "description",
        content: "Determinação do teor de umidade natural de solos (NBR 6457).",
      },
    ],
  }),
});

function TxtField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs" />
    </div>
  );
}

/** Página única do laudo: identificação (via ReportHeader) + cápsulas + resultado. */
function UNReportPage({ sample }: { sample: UmidadeNaturalSample }) {
  const avg = averageMoisturePct(sample.capsules);
  const deviations = moistureDeviations(sample.capsules);
  return (
    <ReportPage
      sample={sample as unknown as ReportSample}
      page={1}
      total={1}
      title="TEOR DE UMIDADE NATURAL"
      norms={[{ text: "NBR 6457 — Preparação para ensaios de compactação e caracterização" }]}
    >
      <div className="space-y-2 text-[10px] text-[#141414]">
        <div className="border border-[#141414]">
          <div className="bg-[#141414] px-2 py-1 text-[9.5px] font-bold uppercase text-white">
            Determinação da Umidade — Cápsulas
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#f1f1f1] text-[9px] font-semibold">
                <td className="border border-[#141414] px-1 py-0.5 text-center">Cápsula</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Tara (g)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Cáps.+Úmido (g)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Cáps.+Seco (g)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">w (%)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Desvio (%)</td>
              </tr>
            </thead>
            <tbody>
              {sample.capsules.map((c, i) => (
                <tr key={i}>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{c.numero || `#${i + 1}`}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(c.tara, 2)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(c.wet, 2)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(c.dry, 2)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center font-medium">{fmt(capsuleMoisturePct(c), 2)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(deviations[i], 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border border-[#141414] px-2 py-2 flex items-center justify-between">
          <span className="text-[10.5px] font-semibold uppercase">Umidade Natural Média (w)</span>
          <span className="text-[14px] font-bold">{fmt(avg, 2)} %</span>
        </div>

        <div className="text-[8.5px] text-[#141414]/70 leading-tight">
          w [%] = (massa úmida − massa seca) / (massa seca − tara) × 100, calculado individualmente para cada
          cápsula e apresentado como média aritmética das determinações válidas, conforme NBR 6457.
        </div>
      </div>
    </ReportPage>
  );
}

export function UNPage() {
  const ctx = useOptionalLabEnsaio();
  const { lookup } = useCadastroByOs();
  const cad = ctx?.os?.numero ? lookup(ctx.os.numero) : undefined;
  const { displayName, user, role } = useAuth();
  const isAdmin = role === "admin" || user?.email?.includes("cleitton") || user?.id === "cleitton-admin-local";
  const isVerificador = role === "verificador" || role === "gestor" || isAdmin;
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

  const initialSample: UmidadeNaturalSample = useMemo(() => {
    const base = seedUmidadeNaturalSample();
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

  const [sample, setSample] = useState<UmidadeNaturalSample>(() =>
    draft?.sample ? { ...initialSample, ...draft.sample } : initialSample,
  );

  useEffect(() => {
    if (!sample.typedBy && currentUserName) {
      setSample((prev) => ({ ...prev, typedBy: currentUserName }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserName]);

  const [saveBusy, setSaveBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [tab, setTab] = useState("amostra");

  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [versions, setVersions] = useState<ReportVersion[]>([]);
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null);
  const [driveStatus, setDriveStatus] = useState<Awaited<ReturnType<typeof fetchDriveStatus>> | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);
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

  const handleSyncAll = async () => {
    if (versions.length === 0) {
      toast.info("Salve pelo menos uma versão para sincronizar.");
      return;
    }
    setDriveBusy(true);
    const tid = toast.loading("Reenviando última revisão ao Drive…");
    try {
      const last = versions[0];
      const fotos = (ctx?.photos ?? [])
        .map((p) => {
          const m = /^data:(.*?);base64,(.*)$/.exec(p.dataUrl);
          const mimeType = m?.[1] || "image/jpeg";
          const b64 = m?.[2] || "";
          const ext = mimeType.split("/")[1] || "jpg";
          return { cpId: "geral", filename: `${p.kind}_${p.id}.${ext}`, mimeType, base64: b64 };
        })
        .filter((f) => f.base64.length > 0);
      const result = await syncRevision({
        scopeId,
        rev: last.rev,
        pdfBlob: last.pdfBlob,
        pdfFilename: last.filename,
        sample,
        photos: ctx?.photos || [],
        ctxOs: ctx?.os,
        ctxAmostra: ctx?.amostra,
        ctxEnsaio: { tipo: "umidade-natural", nome: sample.reportNumber },
        fotos,
      });
      if (result?.folderUrl) setDriveFolderUrl(result.folderUrl);
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
      toast.error("Falha ao excluir: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  useEffect(() => {
    refreshVersions();
    refreshApprovals();
    refreshDriveStatus();
    fetchRemoteDraft(scopeId, {
      osNum: ctx?.os?.numero,
      amCode: ctx?.amostra?.reportNumber || ctx?.amostra?.code,
      ensaioTipo: "umidade-natural",
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
    // objeto `ctx` inteiro — ver nota no editor de Módulo de Resiliência:
    // o LabEnsaioProvider recria `ctx` a cada render, e como esse efeito
    // também regrava `ensaio.payload`, depender de `ctx` forma um laço infinito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteLoaded, scopeId, sample, ctx?.photos]);

  const updateSample = <K extends keyof UmidadeNaturalSample>(k: K, v: UmidadeNaturalSample[K]) =>
    setSample((s) => ({ ...s, [k]: v }));
  const updateCapsule = (idx: number, patch: Partial<MoistureCapsule>) =>
    setSample((s) => ({ ...s, capsules: s.capsules.map((c, i) => (i === idx ? { ...c, ...patch } : c)) }));
  const addCapsule = () =>
    setSample((s) => ({ ...s, capsules: [...s.capsules, { numero: "", tara: 0, wet: 0, dry: 0 }] }));
  const removeCapsule = (idx: number) => {
    if (sample.capsules.length <= 1) {
      toast.error("Deve haver ao menos uma cápsula");
      return;
    }
    setSample((s) => ({ ...s, capsules: s.capsules.filter((_, i) => i !== idx) }));
  };

  const avgMoisture = useMemo(() => averageMoisturePct(sample.capsules), [sample.capsules]);
  const deviations = useMemo(() => moistureDeviations(sample.capsules), [sample.capsules]);

  const buildReportPdfBlob = async (): Promise<Blob> => {
    if (import.meta.env.SSR) throw new Error("buildReportPdfBlob só roda no navegador");
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

      const { jsPDF } = await import("jspdf");
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
      a.download = `Umidade-Natural_${base}.pdf`;
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
      const filename = `Umidade-Natural_${base}_Rev-${String(rev).padStart(2, "0")}.pdf`;
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
          ctxEnsaio: { tipo: "umidade-natural", nome: sample.reportNumber },
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
            ensaio_tipo: "umidade-natural",
            ensaio_nome: "Umidade Natural",
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
                Umidade Natural — Pré-visualização
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">A4 · 210 × 297 mm</DialogDescription>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto bg-[#525659] p-8 flex justify-center">
            <div className="flex flex-col items-center gap-8 shrink-0 pb-12">
              <div className="w-[210mm] h-[297mm] shadow-2xl bg-white shrink-0 overflow-hidden">
                <UNReportPage sample={sample} />
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
              <Droplets className="h-6 w-6" />
            </div>
            <div>
              <EnsaioBadgesRow
                norms={["NBR 6457"]}
                status={rawSt}
                lastSavedAt={draftActivity.lastSavedAt}
                history={draftActivity.history}
                onFlushDraft={() => flushDraft(scopeId, { id: user?.id, name: displayName })}
              />
              <EnsaioTitleBlock
                title="Umidade Natural"
                description="Teor de umidade natural por secagem em estufa."
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end">
            {isAguardandoVerif && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-violet-500/50 bg-violet-500/10 text-violet-800 dark:text-violet-300 font-semibold px-3 py-1.5 text-xs">
                  ✓ Aguardando Verificação
                </Badge>
                {isVerificador && (
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
                )}
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
                {isAdmin && (
                  <Button
                    size="sm"
                    onClick={() => setDecideOpen({ rev, stage: "approve", decision: "aprovado" })}
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Aprovar Laudo Oficial
                  </Button>
                )}
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

        {/* Abas Principais de Edição */}
        <Tabs value={tab} onValueChange={setTab} className="flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center gap-2">
            <TabsList className="grid flex-1 grid-cols-2">
              <TabsTrigger value="amostra"><Beaker className="mr-1.5 h-3.5 w-3.5" />Amostra</TabsTrigger>
              <TabsTrigger value="versoes"><History className="mr-1.5 h-3.5 w-3.5" />Versões</TabsTrigger>
            </TabsList>
            <Button type="button" onClick={() => setReportOpen(true)} className="gap-2 shrink-0">
              <FileText className="h-4 w-4" /> Gerar Relatório
            </Button>
          </div>

          <div className="flex-1 overflow-auto mt-4 pr-1">
        <TabsContent value="amostra" className="m-0 space-y-4">
        {/* Cápsulas */}
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-2">
              <span className="flex items-center gap-1.5">
                <Droplets className="h-4 w-4 text-muted-foreground" /> Cápsulas de Umidade
              </span>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={addCapsule}>
                <Plus className="h-3.5 w-3.5" /> Adicionar Cápsula
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-24">Nº Cápsula</TableHead>
                    <TableHead className="w-28">Tara (g)</TableHead>
                    <TableHead className="w-32">Cáps. + Úmido (g)</TableHead>
                    <TableHead className="w-32">Cáps. + Seco (g)</TableHead>
                    <TableHead className="w-24 text-center">w (%)</TableHead>
                    <TableHead className="w-24 text-center">Desvio (%)</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sample.capsules.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Input value={c.numero ?? ""} onChange={(e) => updateCapsule(i, { numero: e.target.value })} className="h-7 text-xs" placeholder={`#${i + 1}`} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step={0.01} value={c.tara} onChange={(e) => updateCapsule(i, { tara: parseFloat(e.target.value) || 0 })} className="h-7 text-xs" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step={0.01} value={c.wet} onChange={(e) => updateCapsule(i, { wet: parseFloat(e.target.value) || 0 })} className="h-7 text-xs" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step={0.01} value={c.dry} onChange={(e) => updateCapsule(i, { dry: parseFloat(e.target.value) || 0 })} className="h-7 text-xs" />
                      </TableCell>
                      <TableCell className="text-center text-xs font-semibold">{fmt(capsuleMoisturePct(c), 2)}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">{fmt(deviations[i], 2)}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeCapsule(i)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-md border bg-muted/30 p-3">
              <span className="text-xs uppercase font-semibold text-muted-foreground">Umidade Natural Média</span>
              <span className="text-lg font-bold text-foreground">{fmt(avgMoisture, 2)} %</span>
            </div>
          </CardContent>
        </Card>

        {/* Fotos */}
        {ctx && (
          <Card className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Registro Fotográfico</CardTitle>
            </CardHeader>
            <CardContent>
              <PhotoUploader
                title="Amostra"
                kind="outro"
                photos={ctx.photos}
                onAdd={ctx.addPhoto}
                onRemove={ctx.removePhoto}
                onUpdate={ctx.updatePhoto}
              />
            </CardContent>
          </Card>
        )}
        </TabsContent>

        <TabsContent value="versoes" className="m-0 space-y-4">
        <div className="mb-4">
          <ReportVersionsPanel
            scopeId={scopeId}
            versions={versions}
            approvals={approvals}
            onRefreshApprovals={refreshApprovals}
            isAdmin={isAdmin}
            isVerificador={isVerificador}
            driveFolderUrl={driveFolderUrl}
            driveStatus={driveStatus}
            driveBusy={driveBusy}
            onSyncAll={handleSyncAll}
            onOpenReport={() => setReportOpen(true)}
            onDownloadVersion={downloadVersion}
            onDeleteVersion={handleDeleteVersion}
          />
        </div>
        </TabsContent>
          </div>
        </Tabs>

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
          <UNReportPage sample={sample} />
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
