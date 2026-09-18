import { useDraftActivity } from "@/hooks/use-draft-activity";
import { EditingPresenceBanner } from "@/components/DraftActivityInfo";
import { buildScopeId } from "@/lib/scope";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { flushSync } from "react-dom";
import { useCadastroByOs } from "@/hooks/use-cadastro-by-os";
import { useAuth } from "@/hooks/use-auth";
import { podeVerificar } from "@/lib/papeis";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Download, Gauge, Send, ShieldCheck, Plus, Trash2, CheckCircle2,
  Beaker, History, FileText,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { rasterizarRelatorioParaPdf, waitForOffscreenEl } from "@/lib/report-pdf";
import {
  listVersions, saveVersion, updateVersionContent, nextRev, deleteVersion, downloadVersion,
  type ReportVersion,
} from "@/features/load-test/report-versions";
import { sincronizarVersoesComDrive, useVersoesAoVivo } from "@/lib/revisoes-do-drive";
import { syncRevision, fetchDriveStatus } from "@/features/load-test/driveSync";
import { ReportVersionsPanel } from "@/components/report/ReportVersionsPanel";
import {
  listApprovals, requestApproval, verifyApproval, decideApproval, type ApprovalRow,
} from "@/lib/approvals-com-pdf";
import { getWorkflowStatuses } from "@/lib/driveSync.functions";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PhotoUploader } from "@/features/lab/components/PhotoUploader";
import { fotosPublicadas } from "@/features/lab/photos";
import { BlockingOverlay } from "@/components/BlockingOverlay";
import { useOptionalLabEnsaio } from "@/features/lab/context";
import { labStore } from "@/features/lab/store";
import { EnsaioListByType } from "@/features/lab/components/EnsaioListByType";
import { ReportPage, type ReportSample } from "@/components/report/ReportShell";
import { EnsaioBadgesRow, EnsaioTitleBlock, AmostraSummaryCard, ResponsaveisBar } from "@/components/report/EnsaioReportHeader";
import { SampleEditDialog } from "@/components/SampleEditDialog";
import type { PLTSample, PLTDeterminacao, PLTTipoTeste, PLTOrientacao } from "@/features/load-test/types";
import { seedPLTSample, newPLTDeterminacao } from "@/features/load-test/types";
import type { PLTFieldPayload } from "@/features/load-test/ui";
import { calcularLinha, calcularMedias, TABELA_BIENIAWSKI_K } from "@/features/load-test/calc";
import { loadDraft, saveDraft, fetchRemoteDraft, flushDraft } from "@/features/load-test/draftStore";
import { listPendenciasDigitacao } from "@/lib/lab-pendencias.functions";
import { findMatchingPendencia } from "@/lib/pendencia-match";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

const TIPO_LABEL: Record<PLTTipoTeste, string> = { d: "Diametral", a: "Axial", b: "Bloco", i: "Irregular" };
const ORIENTACAO_ABREV: Record<PLTOrientacao, string> = { "": "", perpendicular: "⟂", paralelo: "//" };

export const Route = createFileRoute("/_app/relatorio/load-test")({
  component: () => {
    const ctx = useOptionalLabEnsaio();
    return ctx?.ensaio ? <PLTPage /> : <EnsaioListByType tipo="load-test" />;
  },
  head: () => ({
    meta: [
      { title: "Point Load Test (LOAD.TEST) — Suporte INFRA" },
      {
        name: "description",
        content: "Índice de Resistência à Carga Pontual de Rocha (ASTM D5731-16 / ISRM 2016).",
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
function NumField({ label, value, onChange, className }: { label: string; value: number | null; onChange: (v: number | null) => void; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-[9px] text-muted-foreground block">{label}</Label>
      <Input
        type="number" inputMode="decimal" value={value ?? ""}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => { const raw = e.target.value; onChange(raw === "" ? null : Number(raw.replace(",", "."))); }}
        className="h-7 text-xs w-24"
      />
    </div>
  );
}

/** Página única do laudo: identificação (via ReportHeader) + resultados por determinação + fotos. */
function PLTReportPage({
  sample,
  photos: photosRecebidas = [],
}: {
  sample: PLTSample;
  photos?: import("@/features/lab/types").Photo[];
}) {
  const photos = fotosPublicadas(photosRecebidas);
  const linhas = sample.determinacoes.map(calcularLinha);
  const medias = calcularMedias(sample.determinacoes);

  return (
    <ReportPage
      sample={sample as unknown as ReportSample}
      page={1}
      total={1}
      title="ÍNDICE DE RESISTÊNCIA À CARGA PONTUAL DE ROCHA — POINT LOAD STRENGTH INDEX"
      norms={[{ text: "ASTM D5731-16 / ISRM - Suggested method for determining point load strength (2016)" }]}
    >
      <div className="space-y-2 text-[10px] text-[#141414]">
        {sample.description && (
          <div className="border border-[#141414] px-2 py-1">
            <span className="font-semibold uppercase">Geologia: </span>{sample.description}
          </div>
        )}

        <div className="border border-[#141414]">
          <div className="rounded-t border-b border-[#141414] bg-[#141414]/10 px-2 py-1 text-[9.5px] font-bold uppercase text-[#141414]">
            Resultado do Ensaio
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#141414]/5 text-[8px] font-semibold">
                <td className="border border-[#141414] px-1 py-0.5 text-center">Nº CP</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Tipo</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Altura w<br />[mm]</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Diâmetro D<br />[mm]</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Carga P<br />[kN]</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">De<br />[mm]</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Is<br />[MPa]</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Fator F</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Fator K</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Is(50)<br />[MPa]</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Res. Compressão<br />[MPa]</td>
              </tr>
            </thead>
            <tbody>
              {linhas.map((r) => (
                <tr key={r.det.id} className={r.det.excluidaDaMedia ? "text-[#141414]/50" : ""}>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{r.det.numero}{r.det.excluidaDaMedia ? "*" : ""}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{r.det.tipo}{ORIENTACAO_ABREV[r.det.orientacao] ? ` ${ORIENTACAO_ABREV[r.det.orientacao]}` : ""}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(r.det.alturaMm, 2)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(r.det.diametroMm, 2)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(r.det.cargaKn, 3)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(r.de, 2)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(r.is, 2)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(r.fatorF, 3)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(r.fatorK, 2)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center font-medium">{fmt(r.is50, 2)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center font-medium">{fmt(r.resistencia, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border border-[#141414]">
          <div className="rounded-t border-b border-[#141414] bg-[#141414]/10 px-2 py-1 text-center text-[9.5px] font-bold uppercase text-[#141414]">
            Médias
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#141414]/5 text-[8.5px] font-semibold">
                <td className="border border-[#141414] px-1 py-0.5 text-center">Is médio [MPa]</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Is(50) médio [MPa]</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Res. Compressão Média [MPa]</td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-[#141414] px-1 py-0.5 text-center font-medium">{fmt(medias.isMedio, 2)}</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center font-medium">{fmt(medias.is50Medio, 2)}</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center font-medium">{fmt(medias.resistenciaMedia, 1)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {photos.length > 0 && (
          <div className="border border-[#141414]">
            <div className="rounded-t border-b border-[#141414] bg-[#141414]/10 px-2 py-1 text-center text-[9.5px] font-bold uppercase text-[#141414]">
              Registro Fotográfico
            </div>
            <div className="grid grid-cols-4 gap-1 p-1">
              {photos.map((p) => (
                <figure key={p.id} className="overflow-hidden rounded border border-[#141414]/40 bg-white">
                  <div className="aspect-[3/4] flex items-center justify-center overflow-hidden">
                    <img src={p.url || p.dataUrl} alt="Registro fotográfico" crossOrigin="anonymous" className="h-full w-full object-cover" />
                  </div>
                  {p.caption && (
                    <figcaption className="border-t border-[#141414]/30 px-1 py-0.5 text-center text-[7.5px] text-[#141414]/80">
                      {p.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </div>
        )}

        <div className="border border-[#141414]">
          <div className="rounded-t border-b border-[#141414] bg-[#141414]/10 px-2 py-1 text-center text-[9.5px] font-bold uppercase text-[#141414]">
            Notas
          </div>
          <div className="space-y-0.5 p-2 text-[8px] leading-tight">
            <div>¹ {sample.equipment ? `Ensaio realizado em ${sample.equipment}.` : "Ensaio realizado em equipamento elétrico."}</div>
            <div>² Fator K = Bieniawski, Z.T. The Point-Load Test in Geotechnical Practice, Engineering Geology (9) 1-11.</div>
            <div>³ Estimativa da Resistência à Compressão Simples (RCU).</div>
            <div>d = diametral; a = axial; b = bloco; i = amostra irregular; ⟂ = perpendicular ao plano de fraqueza; // = paralelo ao plano de fraqueza.</div>
            <div>Is = Índice de Resistência à Carga Pontual Não Corrigido. Fator F = Fator de Correção de Forma. Fator K = Fator de Conversão Genérico de Índice para Resistência.</div>
            {sample.determinacoes.some((d) => d.excluidaDaMedia) && <div>* Amostra não considerada na média — ruptura sem validade.</div>}
            <div className="pt-1 text-[#141414]/70">
              K = 0,1808 × D[mm] + 13,824 — ajuste linear sobre a tabela de Bieniawski:{" "}
              {TABELA_BIENIAWSKI_K.map((t) => `${t.coreSizeMm}mm→${t.k}`).join(" · ")}.
            </div>
          </div>
        </div>
      </div>
    </ReportPage>
  );
}

export function PLTPage() {
  const ctx = useOptionalLabEnsaio();
  const { lookup } = useCadastroByOs();
  const cad = ctx?.os?.numero ? lookup(ctx.os.numero) : undefined;
  const { displayName, user, role, profile } = useAuth();
  const currentUserName = displayName || user?.email?.split("@")[0] || "Cleitton Pereira";
  const isAdmin = role === "admin";
  const isVerificador = podeVerificar({ role, labRole: profile?.labRole });

  const scopeId =
    ctx && ctx.os && ctx.amostra && ctx.ensaio
      ? buildScopeId(ctx.os.id, ctx.amostra.id, ctx.ensaio.id)
      : (ctx?.ensaio?.id ?? "local");
  const draftActivity = useDraftActivity(scopeId);

  const draftRef = useRef<ReturnType<typeof loadDraft>>(null);
  if (draftRef.current === null) draftRef.current = loadDraft(scopeId);

  const payloadDraft = ctx?.ensaio?.payload as any;
  const draft = payloadDraft ?? draftRef.current ?? undefined;

  const initialSample: PLTSample = useMemo(() => {
    const base = seedPLTSample();
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

  const [sample, setSample] = useState<PLTSample>(() =>
    draft?.sample ? { ...initialSample, ...draft.sample } : initialSample,
  );

  useEffect(() => {
    if (!sample.typedBy && currentUserName) {
      setSample((prev) => ({ ...prev, typedBy: currentUserName }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserName]);

  const [saveBusy, setSaveBusy] = useState(false);
  const [sampleEditOpen, setSampleEditOpen] = useState(false);
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
  const prefillCheckedRef = useRef(false);

  const refreshVersions = async () => {
    const v = await listVersions(scopeId);
    setVersions(v);
    if (await sincronizarVersoesComDrive(scopeId, v, { saveVersion, deleteVersion })) {
      setVersions(await listVersions(scopeId));
    }
  };
  useVersoesAoVivo(scopeId, refreshVersions);

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

  const fotosParaDrive = () =>
    (ctx?.photos ?? [])
      .map((p) => {
        const m = /^data:(.*?);base64,(.*)$/.exec(p.dataUrl);
        const mimeType = m?.[1] || "image/jpeg";
        const b64 = m?.[2] || "";
        const ext = mimeType.split("/")[1] || "jpg";
        return { cpId: p.specimenId || "geral", filename: `${p.kind}_${p.id}.${ext}`, mimeType, base64: b64 };
      })
      .filter((f) => f.base64.length > 0);

  const handleSyncAll = async () => {
    if (versions.length === 0) {
      toast.info("Salve pelo menos uma versão para sincronizar.");
      return;
    }
    setDriveBusy(true);
    const tid = toast.loading("Reenviando última revisão ao Drive…");
    try {
      const last = versions[0];
      const result = await syncRevision({
        scopeId, rev: last.rev, pdfBlob: last.pdfBlob, pdfFilename: last.filename, sample,
        photos: ctx?.photos || [], ctxOs: ctx?.os, ctxAmostra: ctx?.amostra,
        ctxEnsaio: { tipo: "load-test", nome: sample.reportNumber }, fotos: fotosParaDrive(),
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
      ensaioTipo: "load-test",
    })
      .then((remote) => {
        if (remote?.sample) setSample((s) => ({ ...s, ...remote.sample }));
        setRemoteLoaded(true);
      })
      .catch(() => setRemoteLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId]);

  // Pré-preenchimento a partir da digitalização de campo — só na primeira
  // carga. Determinações só entram se ainda não houver nada preenchido.
  useEffect(() => {
    if (!remoteLoaded || prefillCheckedRef.current || !ctx) return;
    prefillCheckedRef.current = true;
    const jaTemDados = sample.determinacoes.some((d) => d.alturaMm != null || d.diametroMm != null || d.cargaKn != null);
    const jaTemFotos = sample.fotosBancadaImportadas === true || (ctx.photos ?? []).length > 0;
    if (jaTemDados && jaTemFotos) return;
    let cancelled = false;
    (async () => {
      try {
        const pendencias = await listPendenciasDigitacao();
        const pend = findMatchingPendencia(pendencias, {
          os: ctx.os.numero,
          amostra: ctx.amostra.reportNumber || ctx.amostra.code,
          tipo: "load-test",
        });
        const fp = pend?.payload as unknown as PLTFieldPayload | undefined;
        if (cancelled || !fp) return;
        let preencheu = false;
        if (!jaTemDados && fp.determinacoes?.length) {
          setSample((prev) => ({ ...prev, determinacoes: fp.determinacoes }));
          preencheu = true;
        }
        if (!jaTemFotos) {
          if (Array.isArray(fp.fotos) && fp.fotos.length > 0) {
            for (const foto of fp.fotos) {
              const det = fp.determinacoes.find((d) => d.numero === foto.determinacaoNumero);
              ctx.addPhoto({ dataUrl: foto.dataUrl, kind: "outro", caption: foto.caption, specimenId: det?.id });
            }
            preencheu = true;
          }
          setSample((prev) => ({ ...prev, fotosBancadaImportadas: true }));
        }
        if (preencheu) toast.success("Dados pré-preenchidos da digitalização de campo — confira antes de continuar.");
      } catch (err) {
        console.warn("[LOAD.TEST prefill] Falha:", err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteLoaded]);

  useEffect(() => {
    if (!remoteLoaded) return;
    const draftPhotos = ctx?.photos ?? (draft as any)?.photos ?? [];
    const draftData = { sample, photos: draftPhotos };
    saveDraft(scopeId, draftData, { id: user?.id, name: displayName });
    if (ctx?.ensaio) ctx.onPayloadChange(draftData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteLoaded, scopeId, sample, ctx?.photos]);

  const updateSample = <K extends keyof PLTSample>(k: K, v: PLTSample[K]) =>
    setSample((s) => ({ ...s, [k]: v }));
  const updateDet = (idx: number, patch: Partial<PLTDeterminacao>) =>
    setSample((s) => ({ ...s, determinacoes: s.determinacoes.map((d, i) => (i === idx ? { ...d, ...patch } : d)) }));
  const addDet = () =>
    setSample((s) => ({ ...s, determinacoes: [...s.determinacoes, newPLTDeterminacao(s.determinacoes.length + 1)] }));
  const removeDet = (idx: number) => {
    if (sample.determinacoes.length <= 1) {
      toast.error("Deve haver ao menos uma determinação");
      return;
    }
    setSample((s) => ({ ...s, determinacoes: s.determinacoes.filter((_, i) => i !== idx) }));
  };

  const linhas = useMemo(() => sample.determinacoes.map(calcularLinha), [sample.determinacoes]);
  const medias = useMemo(() => calcularMedias(sample.determinacoes), [sample.determinacoes]);

  const buildReportPdfBlob = async (): Promise<Blob> => {
    const el = await waitForOffscreenEl(() => reportRef.current, "Container do relatório não encontrado.");
    const { blob, folhasCortadas } = await rasterizarRelatorioParaPdf(el, { fotosObrigatorias: true });
    if (folhasCortadas.length > 0) {
      toast.warning(
        `Conteúdo cortado: ${folhasCortadas.map((f) => `folha ${f.folha} (+${f.excessoPx}px)`).join(", ")}. Avise o suporte.`,
      );
    }
    return blob;
  };

  const handleGeneratePdf = async () => {
    const toastId = toast.loading("Gerando PDF do relatório…");
    try {
      const blob = await buildReportPdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const base = (sample.workNumber || sample.os || "relatorio").toString().replace(/[^\w-]+/g, "_");
      a.download = `LOAD-TEST_${base}.pdf`;
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
    setWfStatus(skipVerification ? "aguardando_aprovacao" : "aguardando_verificacao");
    setSaveBusy(true);
    const tid = toast.loading("Gerando e salvando versão PDF…");
    try {
      const rev = await nextRev(scopeId);
      const sampleAtualizado = { ...sample, typedBy: currentUserName, revision: String(rev) };
      flushSync(() => setSample(sampleAtualizado));
      const blob = await buildReportPdfBlob();
      const base = (sampleAtualizado.workNumber || sampleAtualizado.os || "relatorio").toString().replace(/[^\w-]+/g, "_");
      const filename = `LOAD-TEST_${base}_Rev-${String(rev).padStart(2, "0")}.pdf`;
      const saved = await saveVersion({ scopeId, rev, filename, size: blob.size, pdfBlob: blob });
      await refreshVersions();

      try {
        const resDrive = await syncRevision({
          scopeId, rev: saved.rev, pdfBlob: blob, pdfFilename: filename, sample: sampleAtualizado,
          photos: ctx?.photos || [], ctxOs: ctx?.os, ctxAmostra: ctx?.amostra,
          ctxEnsaio: { tipo: "load-test", nome: sampleAtualizado.reportNumber }, fotos: fotosParaDrive(),
        });
        if (resDrive?.folderUrl) setDriveFolderUrl(resDrive.folderUrl);
      } catch (err) {
        console.warn("Drive sync standby:", err);
      }

      await requestApproval({
        data: {
          scopeId, rev: saved.rev, filename, skipVerification,
          index: {
            os_numero: sampleAtualizado.os, os_cliente: sampleAtualizado.client,
            amostra_code: sampleAtualizado.reportNumber || sampleAtualizado.code,
            ensaio_tipo: "load-test", ensaio_nome: "Point Load Test (LOAD.TEST)",
          },
        },
      });
      const currentDraft = { sample: sampleAtualizado, photos: ctx?.photos || [] };
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

  const handleAtualizarPdfAtual = async () => {
    if (saveBusy) return;
    setSaveBusy(true);
    const tid = toast.loading("Atualizando o PDF desta revisão…");
    try {
      const revAtual = approvals[0]?.rev ?? 0;
      const sampleAtualizado = { ...sample, revision: String(revAtual) };
      flushSync(() => setSample(sampleAtualizado));
      const blob = await buildReportPdfBlob();
      const base = (sampleAtualizado.workNumber || sampleAtualizado.os || "relatorio").toString().replace(/[^\w-]+/g, "_");
      const filename = `LOAD-TEST_${base}_Rev-${String(revAtual).padStart(2, "0")}.pdf`;
      const atual = versions.find((v) => v.rev === revAtual);
      if (atual) {
        await updateVersionContent(atual.id, { pdfBlob: blob, size: blob.size, filename });
      } else {
        await saveVersion({ scopeId, rev: revAtual, filename, size: blob.size, pdfBlob: blob });
      }
      await refreshVersions();

      try {
        await syncRevision({
          scopeId, rev: revAtual, pdfBlob: blob, pdfFilename: filename, sample: sampleAtualizado,
          photos: ctx?.photos || [], ctxOs: ctx?.os, ctxAmostra: ctx?.amostra,
          ctxEnsaio: { tipo: "load-test", nome: sampleAtualizado.reportNumber }, fotos: fotosParaDrive(),
          reemissao: true,
        });
      } catch (err) {
        console.warn("Drive sync standby:", err);
      }

      const currentDraft = { sample: sampleAtualizado, photos: ctx?.photos || [] };
      saveDraft(scopeId, currentDraft, { id: user?.id, name: displayName });
      if (ctx && ctx.os && ctx.amostra && ctx.ensaio) {
        labStore.patchEnsaio(ctx.os.id, ctx.amostra.id, ctx.ensaio.id, { payload: currentDraft });
      }
      toast.success(`PDF da Rev ${String(revAtual).padStart(2, "0")} atualizado com os dados atuais.`, { id: tid });
    } catch (err) {
      toast.error("Falha ao atualizar o PDF: " + (err instanceof Error ? err.message : String(err)), { id: tid });
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
      <BlockingOverlay
        open={saveBusy || decideBusy}
        message={decideBusy ? "Registrando a decisão…" : "Salvando o laudo…"}
      />
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
              value={decideComment} onChange={(e) => setDecideComment(e.target.value)} className="h-24 text-xs"
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

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-[96vw] w-[96vw] h-[95vh] flex flex-col p-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 border-b bg-card">
            <div>
              <DialogTitle className="text-base font-bold text-foreground">Point Load Test — Pré-visualização</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">A4 · 210 × 297 mm</DialogDescription>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto bg-[#525659] p-8 flex justify-center">
            <div className="flex flex-col items-center gap-8 shrink-0 pb-12">
              <div className="w-[210mm] h-[297mm] shadow-2xl bg-white shrink-0 overflow-hidden">
                <PLTReportPage sample={sample} photos={ctx?.photos ?? []} />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex h-full flex-col bg-background p-4 lg:p-6 pb-20">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Gauge className="h-6 w-6" />
            </div>
            <div>
              <EnsaioBadgesRow
                norms={["ASTM D5731-16 / ISRM 2016"]}
                status={rawSt}
                lastSavedAt={draftActivity.lastSavedAt}
                history={draftActivity.history}
                onFlushDraft={() => flushDraft(scopeId, { id: user?.id, name: displayName })}
              />
              <EnsaioTitleBlock
                title="Point Load Test (LOAD.TEST)"
                description="Índice de Resistência à Carga Pontual de Rocha."
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
                <Button variant="outline" size="sm" onClick={handleAtualizarPdfAtual} disabled={saveBusy} className="text-xs">
                  Atualizar PDF com os dados atuais
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
                <Button variant="outline" size="sm" onClick={handleAtualizarPdfAtual} disabled={saveBusy} className="text-xs">
                  Atualizar PDF com os dados atuais
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

        <div className="mt-3">
          <AmostraSummaryCard
            reportNumber={sample.reportNumber}
            osNumero={sample.os}
            subtitle={`${sample.client || "—"} · ${sample.local || "—"} · Furo ${sample.borehole || "—"} · Prof. ${sample.depth || "—"}`}
            onEditClick={() => setSampleEditOpen(true)}
          />
        </div>

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
            description: sample.description,
            granulometricDescription: sample.granulometricDescription,
            equipment: sample.equipment,
          }}
          onSave={(updated) => {
            setSample((prev) => ({
              ...prev,
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
              equipment: updated.equipment || prev.equipment,
            }));
          }}
        />

        <Tabs value={tab} onValueChange={setTab} className="flex-1 overflow-hidden flex flex-col">
          <div className="flex items-center gap-2">
            <TabsList className="grid flex-1 grid-cols-2">
              <TabsTrigger value="amostra"><Beaker className="mr-1.5 h-3.5 w-3.5" />Amostra</TabsTrigger>
              <TabsTrigger value="versoes"><History className="mr-1.5 h-3.5 w-3.5" />Versões</TabsTrigger>
            </TabsList>
            <Button type="button" onClick={() => setReportOpen(true)} className="gap-2 shrink-0">
              <FileText className="h-4 w-4" /> Pré-visualizar Dados Atuais
            </Button>
          </div>

          <div className="flex-1 overflow-auto mt-4 pr-1">
            <TabsContent value="amostra" className="m-0 space-y-4">
              <Card className="mb-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-2">
                    <span className="flex items-center gap-1.5">
                      <Gauge className="h-4 w-4 text-muted-foreground" /> Determinações
                    </span>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={addDet}>
                      <Plus className="h-3.5 w-3.5" /> Adicionar CP
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {sample.determinacoes.map((det, i) => {
                    const r = linhas[i];
                    return (
                      <div key={det.id} className="rounded-md border p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold">CP {det.numero}</span>
                          {sample.determinacoes.length > 1 && (
                            <Button variant="ghost" size="icon" onClick={() => removeDet(i)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <div>
                            <Label className="text-[9px] text-muted-foreground block">Tipo do teste</Label>
                            <Select value={det.tipo} onValueChange={(v) => updateDet(i, { tipo: v as PLTTipoTeste })}>
                              <SelectTrigger className="h-7 text-xs w-36"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {(Object.keys(TIPO_LABEL) as PLTTipoTeste[]).map((t) => (
                                  <SelectItem key={t} value={t} className="text-xs">{TIPO_LABEL[t]}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-[9px] text-muted-foreground block">Orientação</Label>
                            <Select value={det.orientacao} onValueChange={(v) => updateDet(i, { orientacao: v as PLTOrientacao })}>
                              <SelectTrigger className="h-7 text-xs w-44"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="" className="text-xs">—</SelectItem>
                                <SelectItem value="perpendicular" className="text-xs">Perpendicular ao plano</SelectItem>
                                <SelectItem value="paralelo" className="text-xs">Paralelo ao plano</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <NumField label="Altura w [mm]" value={det.alturaMm} onChange={(v) => updateDet(i, { alturaMm: v })} />
                          <NumField label="Diâmetro D [mm]" value={det.diametroMm} onChange={(v) => updateDet(i, { diametroMm: v })} />
                          <NumField label="Carga P [kN]" value={det.cargaKn} onChange={(v) => updateDet(i, { cargaKn: v })} />
                        </div>

                        <label className="flex items-center gap-2 text-xs pt-1">
                          <Checkbox checked={det.excluidaDaMedia} onCheckedChange={(v) => updateDet(i, { excluidaDaMedia: !!v })} />
                          Ruptura não válida — excluir das médias
                        </label>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 border-t text-xs text-muted-foreground">
                          <span>De: <strong className="text-foreground">{fmt(r.de, 2)} mm</strong></span>
                          <span>Is: <strong className="text-foreground">{fmt(r.is, 2)} MPa</strong></span>
                          <span>Is(50): <strong className="text-foreground">{fmt(r.is50, 2)} MPa</strong></span>
                          <span>Res. estimada: <strong className="text-foreground">{fmt(r.resistencia, 1)} MPa</strong></span>
                        </div>

                        {ctx && (
                          <div className="pt-2 border-t">
                            <Label className="text-[10px] text-muted-foreground mb-1 block">Fotos deste CP</Label>
                            <PhotoUploader
                              title={`CP ${det.numero}`}
                              kind="outro"
                              photos={(ctx.photos ?? []).filter((p) => p.specimenId === det.id)}
                              onAdd={(p) => ctx.addPhoto({ ...p, specimenId: det.id })}
                              onRemove={ctx.removePhoto}
                              onUpdate={ctx.updatePhoto}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card className="mb-4 border-primary/30 bg-primary/[0.03]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Médias</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span>Is médio: <strong>{fmt(medias.isMedio, 2)} MPa</strong></span>
                  <span>Is(50) médio: <strong>{fmt(medias.is50Medio, 2)} MPa</strong></span>
                  <span>Res. Compressão Média: <strong>{fmt(medias.resistenciaMedia, 1)} MPa</strong></span>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="versoes" className="m-0 space-y-4">
              <div className="mb-4">
                <ReportVersionsPanel
                  scopeId={scopeId}
                  versions={versions}
                  approvals={approvals}
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

        <div
          ref={reportRef}
          style={{
            position: "fixed", top: 0, left: 0, width: "210mm",
            background: "#ffffff", pointerEvents: "none", zIndex: -9999, opacity: 0,
          }}
          className="print-only-report mx-auto flex flex-col items-center gap-4"
        >
          <PLTReportPage sample={sample} photos={ctx?.photos ?? []} />
        </div>
        <style>{`
          @media print {
            .print-only-report {
              position: static !important; left: auto !important; top: auto !important;
              opacity: 1 !important; z-index: 1 !important; pointer-events: auto !important;
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
