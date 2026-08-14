/**
 * Editor de M.ESP.A usado dentro da árvore OS → Amostra → Ensaio.
 * Reaproveita FormMEspA. Persistência: payload do ensaio no labStore.
 *
 * Alinhado ao Triaxial CID:
 *  - Botões contextuais de avanço de etapa (Verificação → Aprovação → Aprovado).
 *  - Prévia do PDF em diálogo (iframe).
 *  - Furo / Profundidade editáveis, pré-preenchidos com o QR ou o cadastro da amostra.
 *  - Tomador / Obra vindos da OS (fallback via planilha Cadastro de OS).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useOptionalLabEnsaio } from "@/features/lab/context";
import { FormMEspA, type Identificacao } from "@/features/mesp-natural/ui";
import type { DeterminacaoInput } from "@/features/mesp-natural/calc";
import { atualizarPendenciaDigitacao, criarPendenciaDigitacao } from "@/lib/lab-pendencias.functions";
import { listPendenciasDigitacao } from "@/lib/lab-pendencias.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { labStore } from "@/features/lab/store";
import {
  listVersions,
  nextRev,
  saveVersion,
  type ReportVersion,
} from "@/features/triaxial-cid/report-versions";
import {
  requestApproval,
  verifyApproval,
  decideApproval,
  listApprovals,
  type ApprovalRow,
} from "@/lib/approvals.functions";
import { getRevisionPdfBase64, getWorkflowStatuses } from "@/lib/driveSync.functions";
import { mespIndexMetadata, syncMEspARevision } from "@/features/mesp-natural/drive-sync";
import { MEspAReport, renderMEspAPdfBlob } from "@/features/mesp-natural/report";
import { useCadastroByOs } from "@/hooks/use-cadastro-by-os";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Eye, FileText, History, Loader2, RefreshCw, Send, ShieldCheck, XCircle } from "lucide-react";

function newDet(): DeterminacaoInput {
  return {
    id: `d_${Math.random().toString(36).slice(2, 9)}`,
    capsula: "",
    massaCapsula: null,
    massaCapsulaSoloUmido: null,
    massaCapsulaSoloSeco: null,
    massaCp: null,
    massaCpParafina: null,
    massaCpParafinaSubmerso: null,
  };
}

function pdfBlobFromBase64(base64: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: "application/pdf" });
}

function workflowLabel(s: string): { label: string; tone: "muted" | "info" | "warn" | "ok" | "err" } {
  switch (s) {
    case "aguardando_verificacao": return { label: "Aguardando verificação", tone: "info" };
    case "pendente_verificacao":   return { label: "Aguardando verificação", tone: "info" };
    case "aguardando_aprovacao":   return { label: "Aguardando aprovação",  tone: "warn" };
    case "pendente_aprovacao":     return { label: "Aguardando aprovação",  tone: "warn" };
    case "verificado":             return { label: "Aguardando aprovação",  tone: "warn" };
    case "aprovado":               return { label: "Aprovado",               tone: "ok"   };
    case "rejeitado":              return { label: "Rejeitado",              tone: "err"  };
    case "rejeitado_verificacao":  return { label: "Rejeitado na verificação", tone: "err" };
    default:                       return { label: "Em digitação",           tone: "muted" };
  }
}

export function MEspAEnsaioEditor() {
  const ctx = useOptionalLabEnsaio();
  const criarFn = useServerFn(criarPendenciaDigitacao);
  const atualizarFn = useServerFn(atualizarPendenciaDigitacao);
  const requestApprovalFn = useServerFn(requestApproval);
  const verifyApprovalFn = useServerFn(verifyApproval);
  const decideApprovalFn = useServerFn(decideApproval);
  const listApprovalsFn = useServerFn(listApprovals);
  const getWorkflowStatusesFn = useServerFn(getWorkflowStatuses);
  const getRevisionPdfFn = useServerFn(getRevisionPdfBase64);

  const initial = (ctx?.ensaio.payload as
    | { dets?: DeterminacaoInput[]; obs?: string; ident?: Partial<Identificacao> }
    | undefined) ?? {};

  const { lookup } = useCadastroByOs();
  const cad = ctx?.os.numero ? lookup(ctx.os.numero) : undefined;

  const [ident, setIdent] = useState<Identificacao>(() => ({
    os: ctx?.os.numero ?? "",
    amostraCodigo: ctx?.amostra.reportNumber || ctx?.amostra.code || "",
    amostraDescricao: ctx?.amostra.description ?? "",
    tomador: ctx?.os.client || initial.ident?.tomador || cad?.tomador || "",
    obra: ctx?.os.local || initial.ident?.obra || cad?.obra || "",
    tipoEnsaioNome: "Massa Específica Aparente Natural",
    tipoEnsaioCodigo: "M.ESP.A",
    furo: initial.ident?.furo ?? ctx?.amostra.borehole ?? "",
    profundidade: initial.ident?.profundidade ?? ctx?.amostra.depth ?? "",
  }));

  // Reidrata Tomador/Obra/Furo/Profundidade se dados chegarem depois (cadastro é assíncrono).
  useEffect(() => {
    setIdent((cur) => ({
      ...cur,
      tomador: cur.tomador || ctx?.os.client || cad?.tomador || "",
      obra: cur.obra || ctx?.os.local || cad?.obra || "",
      furo: cur.furo || ctx?.amostra.borehole || "",
      profundidade: cur.profundidade || ctx?.amostra.depth || "",
    }));
  }, [ctx?.os.client, ctx?.os.local, ctx?.amostra.borehole, ctx?.amostra.depth, cad?.tomador, cad?.obra]);

  const [dets, setDets] = useState<DeterminacaoInput[]>(
    initial.dets && initial.dets.length > 0 ? initial.dets : [newDet()],
  );
  const [obs, setObs] = useState<string>(initial.obs ?? "");

  const persist = useCallback(
    (status?: "rascunho" | "processando" | "concluido") => {
      if (!ctx) return;
      labStore.patchEnsaio(ctx.os.id, ctx.amostra.id, ctx.ensaio.id, {
        payload: { dets, obs, ident },
        ...(status ? { status } : {}),
      });
    },
    [ctx, dets, obs, ident],
  );

  const onIdentPatch = useCallback(
    (p: Partial<Identificacao>) => {
      setIdent((cur) => {
        const next = { ...cur, ...p };
        if (ctx && (p.furo !== undefined || p.profundidade !== undefined)) {
          labStore.patchAmostra(ctx.os.id, ctx.amostra.id, {
            borehole: p.furo ?? cur.furo ?? "",
            depth: p.profundidade ?? cur.profundidade ?? "",
          });
        }
        return next;
      });
    },
    [ctx],
  );

  const scopeId = ctx
    ? `os/${ctx.os.id}/amostra/${ctx.amostra.id}/ensaio/${ctx.ensaio.id}`
    : "";

  const [versions, setVersions] = useState<ReportVersion[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [wfStatus, setWfStatus] = useState<string>("digitacao");
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVerificador, setIsVerificador] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewBusyRev, setPreviewBusyRev] = useState<number | "current" | null>(null);
  const [preview, setPreview] = useState<{ url: string; filename: string; rev?: number } | null>(null);
  const [livePreview, setLivePreview] = useState<{ url: string; filename: string; generatedAt: string } | null>(null);
  const [livePreviewError, setLivePreviewError] = useState<string | null>(null);
  const livePreviewRef = useRef<HTMLDivElement | null>(null);
  const livePreviewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user || cancel) return;
      const [{ data: adm }, { data: ver }] = await Promise.all([
        supabase.rpc("has_role", { _user_id: data.user.id, _role: "admin" }),
        supabase.rpc("has_role", { _user_id: data.user.id, _role: "verificador" }),
      ]);
      if (cancel) return;
      setIsAdmin(Boolean(adm));
      setIsVerificador(Boolean(ver));
    })();
    return () => { cancel = true; };
  }, []);

  const refreshFlow = useCallback(async () => {
    if (!scopeId) return;
    try {
      setVersions(await listVersions(scopeId));
    } catch (err) { console.warn("listVersions", err); }
    try {
      setApprovals(await listApprovalsFn({ data: { scopeId } }));
    } catch (err) { console.warn("listApprovals", err); }
    try {
      const res = await getWorkflowStatusesFn({ data: { scopeIds: [scopeId] } });
      setWfStatus(res.statuses[scopeId] ?? "digitacao");
    } catch (err) { console.warn("workflow", err); }
  }, [scopeId, listApprovalsFn, getWorkflowStatusesFn]);

  useEffect(() => { refreshFlow(); }, [refreshFlow]);

  // Rehidrata as determinações a partir da pendência no servidor. Isso
  // faz com que pesagens finais registradas na Central de Cápsulas
  // (possivelmente por outro operador em outro dispositivo) apareçam
  // aqui automaticamente ao abrir o ensaio.
  const listPendFn = useServerFn(listPendenciasDigitacao);
  useEffect(() => {
    if (!ctx) return;
    let cancel = false;
    (async () => {
      try {
        const rows = await listPendFn();
        if (cancel) return;
        const osNum = ctx.os.numero;
        const amostraCod = ctx.amostra.reportNumber || ctx.amostra.code || "";
        const ensaioCodigo = (ctx.ensaio.label || ctx.ensaio.tipo || "").toString();
        // Match forte: OS + amostra + código do ensaio. Fallback por tipo
        // (compatível com pendências antigas que só têm o texto do tipo).
        const match =
          rows.find(
            (r) =>
              r.os === osNum &&
              (r.amostra ?? "") === amostraCod &&
              (r.ensaio ?? "").toLowerCase() === ensaioCodigo.toLowerCase(),
          ) ??
          rows.find(
            (r) =>
              r.os === osNum &&
              (r.amostra ?? "") === amostraCod &&
              (r.tipo_ensaio ?? "").toLowerCase().includes("massa específica"),
          );
        const serverDets = (match?.payload as { dets?: DeterminacaoInput[] } | null)?.dets;
        if (!Array.isArray(serverDets) || serverDets.length === 0) return;
        setDets((cur) => {
          let changed = false;
          const norm = (s: unknown) => (s ?? "").toString().trim().toLowerCase();
          const next = cur.map((local, i) => {
            // Preferir merge por nº da cápsula (robusto a reordenação /
            // pesagens finais salvas na Central sob outro índice).
            const localCap = norm(local.capsula);
            let sv: DeterminacaoInput | undefined;
            if (localCap) sv = serverDets.find((d) => norm(d?.capsula) === localCap);
            if (!sv) sv = serverDets[i];
            if (!sv) return local;
            const merged = { ...local };
            const fields: (keyof DeterminacaoInput)[] = [
              "massaCapsulaSoloSeco",
              "massaCapsula",
              "massaCapsulaSoloUmido",
              "capsula",
            ];
            for (const f of fields) {
              const localVal = local[f];
              const serverVal = sv[f];
              const localEmpty = localVal == null || localVal === "";
              const serverHas = serverVal != null && serverVal !== "";
              if (localEmpty && serverHas) {
                (merged as Record<string, unknown>)[f as string] = serverVal;
                changed = true;
              }
            }
            return merged;
          });
          if (!changed) return cur;
          // Mirror para o labStore local também.
          labStore.patchEnsaio(ctx.os.id, ctx.amostra.id, ctx.ensaio.id, {
            payload: { dets: next, obs, ident },
          });
          return next;
        });
      } catch (err) {
        console.warn("hydrate pendencia", err);
      }
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx?.os.id, ctx?.amostra.id, ctx?.ensaio.id]);

  const openPreview = (v: ReportVersion) => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview({ url: URL.createObjectURL(v.pdfBlob), filename: v.filename, rev: v.rev });
  };

  const buildCurrentPdfBlob = useCallback(async () => {
    const el = livePreviewRef.current;
    if (!el) throw new Error("A prévia do relatório ainda não foi montada.");
    const htmlEl = document.documentElement;
    const wasDark = htmlEl.classList.contains("dark");
    if (wasDark) htmlEl.classList.remove("dark");
    htmlEl.classList.add("force-light");
    const original = {
      position: el.style.position,
      top: el.style.top,
      left: el.style.left,
      width: el.style.width,
      background: el.style.background,
      pointerEvents: el.style.pointerEvents,
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
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      return await renderMEspAPdfBlob(el);
    } finally {
      Object.assign(el.style, original);
      if (wasDark) htmlEl.classList.add("dark");
      htmlEl.classList.remove("force-light");
    }
  }, []);

  const generateLivePreview = useCallback(async () => {
    setPreviewBusyRev("current");
    setLivePreviewError(null);
    try {
      const blob = await buildCurrentPdfBlob();
      const url = URL.createObjectURL(blob);
      if (livePreviewUrlRef.current) URL.revokeObjectURL(livePreviewUrlRef.current);
      livePreviewUrlRef.current = url;
      const base = `${ident.os || "OS"}_${ident.amostraCodigo || "amostra"}`.replace(/[^\w.-]+/g, "-");
      setLivePreview({ url, filename: `M-ESP-A_${base}_PREVIA.pdf`, generatedAt: new Date().toISOString() });
    } catch (err) {
      setLivePreviewError(err instanceof Error ? err.message : "Falha ao montar a prévia do PDF.");
    } finally {
      setPreviewBusyRev(null);
    }
  }, [buildCurrentPdfBlob, ident.amostraCodigo, ident.os]);

  const openPreviewFromServer = async (rev: number, filename?: string | null) => {
    setPreviewBusyRev(rev);
    try {
      const res = await getRevisionPdfFn({ data: { scopeId, rev } });
      const blob = pdfBlobFromBase64(res.base64);
      if (preview) URL.revokeObjectURL(preview.url);
      setPreview({
        url: URL.createObjectURL(blob),
        filename: filename || `M-ESP-A_Rev-${String(rev).padStart(2, "0")}.pdf`,
        rev: typeof res.rev === "number" ? res.rev : rev,
      });
    } catch (err) {
      toast.warning(
        "PDF salvo não encontrado; gerei a prévia com os dados atuais do ensaio. " +
          (err instanceof Error ? err.message : String(err)),
      );
      try {
        const blob = await buildCurrentPdfBlob();
        if (preview) URL.revokeObjectURL(preview.url);
        setPreview({
          url: URL.createObjectURL(blob),
          filename: filename || `M-ESP-A_Rev-${String(rev).padStart(2, "0")}.pdf`,
          rev,
        });
      } catch (fallbackErr) {
        toast.error(fallbackErr instanceof Error ? fallbackErr.message : "Falha ao gerar prévia do PDF.");
      }
    } finally {
      setPreviewBusyRev(null);
    }
  };

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  useEffect(() => {
    return () => {
      if (livePreviewUrlRef.current) URL.revokeObjectURL(livePreviewUrlRef.current);
    };
  }, []);

  const finalizeAndSubmit = async (buildPdfBlob: () => Promise<Blob>, skipVerification = false) => {
    if (!ctx) return;
    persist("concluido");
    setBusy(true);
    const tid = toast.loading(skipVerification ? "Enviando para aprovação…" : "Enviando para verificação…");
    try {
      const pend = await criarFn({
        data: {
          os: ident.os,
          amostra: ident.amostraCodigo || null,
          ensaio: "Massa Específica Aparente Natural",
          tipo_ensaio: "M.ESP.A",
          equipamento: null,
          origem: "gantt",
        },
      });
      const blob = await buildPdfBlob();
      const rev = await nextRev(scopeId);
      const base = `${ident.os || "OS"}_${ident.amostraCodigo || "amostra"}`.replace(/[^\w.-]+/g, "-");
      const filename = `M-ESP-A_${base}_Rev-${String(rev).padStart(2, "0")}.pdf`;
      await saveVersion({ scopeId, rev, filename, size: blob.size, pdfBlob: blob });
      try {
        await syncMEspARevision({ scopeId, rev, filename, pdfBlob: blob, ident, dets, obs });
      } catch (syncError: unknown) {
        toast.warning(
          "Enviado, mas a prévia no Drive pode não abrir agora: " +
            (syncError instanceof Error ? syncError.message : String(syncError)),
        );
      }
      await requestApprovalFn({
        data: { scopeId, rev, filename, index: mespIndexMetadata(ident), skipVerification },
      });
      await atualizarFn({
        data: {
          id: pend.id,
          status: "digitado",
          observacao: obs || null,
          payload: { dets, obs, ident },
        },
      });
      await refreshFlow();
      toast.success(
        skipVerification
          ? `Prévia ${String(rev).padStart(2, "0")} enviada para aprovação`
          : `Prévia ${String(rev).padStart(2, "0")} enviada para verificação`,
        { id: tid },
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar pendência", { id: tid });
    } finally {
      setBusy(false);
    }
  };

  const advanceToApproval = async () => {
    const rev = approvals[0]?.rev;
    if (typeof rev !== "number") return;
    setBusy(true);
    const tid = toast.loading("Enviando para aprovação…");
    try {
      await verifyApprovalFn({ data: { scopeId, rev, decision: "verificado" } });
      await refreshFlow();
      toast.success("Enviado para aprovação ✓", { id: tid });
    } catch (err) {
      toast.error("Falha: " + (err instanceof Error ? err.message : String(err)), { id: tid });
    } finally { setBusy(false); }
  };

  const approveReport = async () => {
    const rev = approvals[0]?.rev;
    if (typeof rev !== "number") return;
    setBusy(true);
    const tid = toast.loading("Aprovando relatório…");
    try {
      await decideApprovalFn({ data: { scopeId, rev, decision: "aprovado" } });
      await refreshFlow();
      toast.success("Relatório aprovado ✓", { id: tid });
    } catch (err) {
      toast.error("Falha: " + (err instanceof Error ? err.message : String(err)), { id: tid });
    } finally { setBusy(false); }
  };

  const rejectCurrent = async () => {
    const rev = approvals[0]?.rev;
    if (typeof rev !== "number") return;
    const reason = window.prompt("Motivo da rejeição (obrigatório):", "");
    if (!reason || !reason.trim()) return;
    setBusy(true);
    const tid = toast.loading("Registrando rejeição…");
    try {
      if ((wfStatus === "aguardando_verificacao" || wfStatus === "pendente_verificacao") && (isVerificador || isAdmin)) {
        await verifyApprovalFn({ data: { scopeId, rev, decision: "rejeitado_verificacao", comment: reason.trim() } });
      } else if ((wfStatus === "aguardando_aprovacao" || wfStatus === "pendente_aprovacao" || wfStatus === "verificado") && isAdmin) {
        await decideApprovalFn({ data: { scopeId, rev, decision: "rejeitado", comment: reason.trim() } });
      }
      await refreshFlow();
      toast.success("Rejeição registrada", { id: tid });
    } catch (err) {
      toast.error("Falha: " + (err instanceof Error ? err.message : String(err)), { id: tid });
    } finally { setBusy(false); }
  };

  const wf = workflowLabel(wfStatus);
  const badgeTone: Record<string, string> = {
    muted: "border-border text-muted-foreground",
    info:  "border-primary/40 text-primary",
    warn:  "border-amber-500/40 text-amber-600 dark:text-amber-400",
    ok:    "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
    err:   "border-destructive/40 text-destructive",
  };
  const latestVersion = versions[0];
  const latestApproval = approvals[0];
  const [tab, setTab] = useState<string>("ensaio");

  useEffect(() => {
    if (tab === "preview" && !livePreview && !previewBusyRev) void generateLivePreview();
  }, [generateLivePreview, livePreview, previewBusyRev, tab]);

  useEffect(() => {
    if (!livePreviewUrlRef.current) return;
    URL.revokeObjectURL(livePreviewUrlRef.current);
    livePreviewUrlRef.current = null;
    setLivePreview(null);
  }, [dets, ident, obs]);

  const revisionRows = [
    ...versions.map((version) => ({
      rev: version.rev,
      createdAt: version.createdAt,
      filename: version.filename,
      size: version.size,
      version,
      approval: approvals.find((a) => a.rev === version.rev) ?? null,
    })),
    ...approvals
      .filter((approval) => !versions.some((version) => version.rev === approval.rev))
      .map((approval) => ({
        rev: approval.rev,
        createdAt: approval.requested_at,
        filename: approval.filename || `M-ESP-A_Rev-${String(approval.rev).padStart(2, "0")}.pdf`,
        size: null as number | null,
        version: null as ReportVersion | null,
        approval,
      })),
  ].sort((a, b) => b.rev - a.rev);

  const verificationStage = wfStatus === "aguardando_verificacao" || wfStatus === "pendente_verificacao" || latestApproval?.status === "pendente_verificacao";
  const approvalStage = wfStatus === "aguardando_aprovacao" || wfStatus === "pendente_aprovacao" || wfStatus === "verificado" || latestApproval?.status === "pendente_aprovacao" || latestApproval?.status === "verificado";

  const downloadVersion = (v: ReportVersion) => {
    const url = URL.createObjectURL(v.pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = v.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const downloadServerRevision = async (rev: number, filename: string) => {
    setPreviewBusyRev(rev);
    try {
      const res = await getRevisionPdfFn({ data: { scopeId, rev } });
      const blob = pdfBlobFromBase64(res.base64);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao baixar PDF da revisão.");
    } finally {
      setPreviewBusyRev(null);
    }
  };

  return (
    <div className="px-4 py-4">
      {ctx && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Fluxo</div>
          <Badge variant="outline" className={badgeTone[wf.tone]}>{wf.label}</Badge>
          {approvals[0] && (
            <span className="text-xs text-muted-foreground">
              · Rev {String(approvals[0].rev).padStart(2, "0")}
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => setTab("preview")}>
              <Eye className="h-4 w-4" /> Prévia PDF
            </Button>
            {latestVersion ? (
              <Button size="sm" variant="outline" className="gap-1" onClick={() => openPreview(latestVersion)}>
                <FileText className="h-4 w-4" /> Última revisão
              </Button>
            ) : latestApproval ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => openPreviewFromServer(latestApproval.rev, latestApproval.filename)}
                disabled={previewBusyRev === latestApproval.rev}
              >
                {previewBusyRev === latestApproval.rev ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Última revisão
              </Button>
            ) : null}
            {verificationStage && (isVerificador || isAdmin) && (
              <>
                <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={rejectCurrent} disabled={busy}>
                  <XCircle className="h-4 w-4" /> Rejeitar
                </Button>
                <Button size="sm" className="gap-1" onClick={advanceToApproval} disabled={busy}>
                  <Send className="h-4 w-4" /> Enviar para aprovação
                </Button>
              </>
            )}
            {approvalStage && isAdmin && (
              <>
                <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={rejectCurrent} disabled={busy}>
                  <XCircle className="h-4 w-4" /> Rejeitar
                </Button>
                <Button size="sm" className="gap-1" onClick={approveReport} disabled={busy}>
                  <ShieldCheck className="h-4 w-4" /> Aprovar relatório
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="ensaio" className="gap-1">
            <FileText className="h-3 w-3" /> Ensaio
          </TabsTrigger>
          <TabsTrigger value="preview" className="gap-1">
            <Eye className="h-3 w-3" /> Prévia PDF
          </TabsTrigger>
          <TabsTrigger value="versoes" className="gap-1">
            <History className="h-3 w-3" /> Versões
            {revisionRows.length > 0 && (
              <span className="ml-1 rounded bg-muted px-1.5 text-[10px] font-semibold">
                {revisionRows.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ensaio" className="mt-4">
          <FormMEspA
            ident={ident}
            onIdentPatch={onIdentPatch}
            dets={dets}
            setDets={setDets}
            obs={obs}
            setObs={setObs}
            variant="editor"
            onBack={() => window.history.back()}
            onSaveDraft={() => {
              persist("rascunho");
              toast.success("Rascunho salvo no ensaio");
            }}
            onFinalize={async (buildPdfBlob) => {
              // Nova prévia gerada pelo próprio Verificador/Aprovador vai direto para aprovação.
              const skipVerification =
                (isVerificador || isAdmin) &&
                (
                  wfStatus === "aguardando_verificacao" ||
                  wfStatus === "pendente_verificacao" ||
                  wfStatus === "aguardando_aprovacao" ||
                  wfStatus === "pendente_aprovacao" ||
                  wfStatus === "verificado" ||
                  wfStatus === "aprovado"
                );
              await finalizeAndSubmit(buildPdfBlob, skipVerification);
            }}
          />
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-sm">Prévia do relatório PDF</CardTitle>
                  <CardDescription>
                    Visualização do relatório M.ESP.A com os dados atuais da tela. Não precisa finalizar para conferir o PDF.
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => generateLivePreview()} disabled={previewBusyRev === "current"}>
                  {previewBusyRev === "current" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Atualizar prévia
                </Button>
              </div>
            </CardHeader>
            <CardContent className="h-[72vh] min-h-[520px] p-0">
              {previewBusyRev === "current" && (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Gerando prévia do PDF…
                </div>
              )}
              {livePreviewError && previewBusyRev !== "current" && (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-destructive">
                  {livePreviewError}
                </div>
              )}
              {livePreview && previewBusyRev !== "current" && !livePreviewError && (
                <iframe src={livePreview.url} title="Prévia PDF M.ESP.A" className="h-full w-full border-0" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="versoes" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Revisões do Relatório</CardTitle>
              <CardDescription>
                Cada envio para verificação/aprovação cria uma nova revisão
                (Rev 00, 01, 02…) com o PDF salvo. Use os botões abaixo para
                visualizar ou baixar qualquer versão.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {revisionRows.length === 0 ? (
                <div className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Nenhuma revisão salva ainda. Preencha o ensaio e clique em
                  <b> Finalizar digitação</b> para gerar a Rev 00. Enquanto isso,
                  use a aba <b>Prévia PDF</b> para conferir o relatório atual.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Revisão</TableHead>
                      <TableHead>Data / Hora</TableHead>
                      <TableHead>Arquivo</TableHead>
                      <TableHead className="text-right">Tamanho</TableHead>
                      <TableHead className="w-40 text-center">Status</TableHead>
                      <TableHead className="w-44 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revisionRows.map((row) => {
                      const v = row.version;
                      const appr = row.approval;
                      const isApproved = appr?.status === "aprovado";
                      const label = isApproved
                        ? `Rev ${String(row.rev).padStart(2, "0")}`
                        : `Prévia ${String(row.rev).padStart(2, "0")}`;
                      const statusLabel = appr ? workflowLabel(appr.status).label : "—";
                      const statusTone = appr ? badgeTone[workflowLabel(appr.status).tone] : badgeTone.muted;
                      return (
                        <TableRow key={`${row.rev}-${row.filename}`}>
                          <TableCell className="font-semibold">{label}</TableCell>
                          <TableCell className="text-xs">
                            {new Intl.DateTimeFormat("pt-BR", {
                              timeZone: "America/Sao_Paulo",
                              dateStyle: "short",
                              timeStyle: "medium",
                            }).format(new Date(row.createdAt))}
                          </TableCell>
                          <TableCell className="text-xs">{row.filename}</TableCell>
                          <TableCell className="text-right text-xs">
                            {typeof row.size === "number" ? `${(row.size / 1024).toFixed(0)} KB` : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={statusTone}>{statusLabel}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1"
                                onClick={() => v ? openPreview(v) : openPreviewFromServer(row.rev, row.filename)}
                                disabled={previewBusyRev === row.rev}
                              >
                                {previewBusyRev === row.rev ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                                Ver
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="gap-1"
                                onClick={() => v ? downloadVersion(v) : downloadServerRevision(row.rev, row.filename)}
                                disabled={previewBusyRev === row.rev}
                              >
                                {previewBusyRev === row.rev ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                                Baixar
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
      </Tabs>

      <Dialog open={!!preview} onOpenChange={(o) => !o && closePreview()}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] p-0 flex flex-col">
          <DialogHeader className="px-4 py-2 border-b">
            <DialogTitle className="text-sm">
              {preview?.rev != null
                ? `Visualização — Rev ${String(preview.rev).padStart(2, "0")} · ${preview.filename}`
                : `Visualização — ${preview?.filename ?? ""}`}
            </DialogTitle>
          </DialogHeader>
          {preview && (
            <iframe src={preview.url} title="Relatório M.ESP.A" className="flex-1 w-full border-0" />
          )}
        </DialogContent>
      </Dialog>

      <div ref={livePreviewRef} className="fixed -left-[10000px] top-0 bg-white" aria-hidden="true">
        <MEspAReport ident={ident} dets={dets} obs={obs} />
      </div>
    </div>
  );
}