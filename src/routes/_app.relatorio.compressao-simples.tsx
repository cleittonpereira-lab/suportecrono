import { useDraftActivity } from "@/hooks/use-draft-activity";
import { EditingPresenceBanner } from "@/components/DraftActivityInfo";
import { buildScopeId } from "@/lib/scope";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import {
  CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Label as RLabel, ReferenceDot,
} from "recharts";
import { useCadastroByOs } from "@/hooks/use-cadastro-by-os";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Download, Gauge, Send, ShieldCheck, CheckCircle2,
  Beaker, History, FileText, Upload, Plus, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import {
  listVersions, saveVersion, nextRev, deleteVersion, downloadVersion, type ReportVersion,
} from "@/features/compressao-simples/report-versions";
import { syncRevision, fetchDriveStatus } from "@/features/compressao-simples/driveSync";
import { ReportVersionsPanel } from "@/components/report/ReportVersionsPanel";
import {
  listApprovals, requestApproval, verifyApproval, decideApproval, type ApprovalRow,
} from "@/lib/approvals.functions";
import { getWorkflowStatuses } from "@/lib/driveSync.functions";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PhotoUploader } from "@/features/lab/components/PhotoUploader";
import { useOptionalLabEnsaio } from "@/features/lab/context";
import { labStore } from "@/features/lab/store";
import { EnsaioListByType } from "@/features/lab/components/EnsaioListByType";
import { ReportPage, type ReportSample, type ReportNorm } from "@/components/report/ReportShell";
import { EnsaioBadgesRow, EnsaioTitleBlock, ResponsaveisBar } from "@/components/report/EnsaioReportHeader";
import { SampleEditDialog } from "@/components/SampleEditDialog";
import type {
  CompressaoSimplesSample, CsAmostraTipo, CsCapsula, CsCorpoDeProva, CsResultadoModo,
} from "@/features/compressao-simples/types";
import { seedCompressaoSimplesSample, newCsCorpoDeProva } from "@/features/compressao-simples/types";
import {
  capsulaUmidadePct, teorUmidadeMedio, calcCorpoDeProva, mediaCps,
} from "@/features/compressao-simples/calc";
import { CsCurveImportDialog } from "@/features/compressao-simples/components/CsCurveImportDialog";
import { loadDraft, saveDraft, fetchRemoteDraft, flushDraft } from "@/features/compressao-simples/draftStore";
import { listPendenciasDigitacao } from "@/lib/lab-pendencias.functions";
import { findMatchingPendencia } from "@/lib/pendencia-match";
import type { CsFieldPayload } from "@/features/compressao-simples/ui";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

const AMOSTRA_TIPO_LABEL: Record<CsAmostraTipo, string> = { solo: "Solo", rocha: "Rocha", dosagem: "Dosagem (solo-cimento)" };

function normsFor(tipo: CsAmostraTipo): ReportNorm[] {
  if (tipo === "rocha") {
    return [
      { text: "ABNT NBR 15845-5 - Rochas para revestimento — Métodos de ensaios — Parte 5: Determinação da resistência à compressão uniaxial e do módulo de deformabilidade" },
      { text: "cf. ASTM D7012 (Método C) e diretrizes da ISRM (International Society for Rock Mechanics)", italic: true },
    ];
  }
  if (tipo === "dosagem") {
    return [{ text: "ABNT NBR 12025 - Solo-cimento — Ensaio de compressão simples de corpos de prova cilíndricos" }];
  }
  return [{ text: "ABNT NBR 12770 - Solo coesivo — Determinação da resistência à compressão não confinada" }];
}

export const Route = createFileRoute("/_app/relatorio/compressao-simples")({
  component: () => {
    const ctx = useOptionalLabEnsaio();
    return ctx?.ensaio ? <CompressaoSimplesPage /> : <EnsaioListByType tipo="compressao-simples" />;
  },
  head: () => ({
    meta: [
      { title: "Compressão Simples — Suporte INFRA" },
      {
        name: "description",
        content: "Resistência à compressão simples em solo (NBR 12770), rocha (NBR 15845-5) ou dosagem/solo-cimento (NBR 12025).",
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

/** Calcula o resultado de todos os CPs + a média entre eles (se houver mais de um). */
function useCsResults(sample: CompressaoSimplesSample) {
  return useMemo(() => {
    const comIndices = sample.amostraTipo !== "rocha";
    const isCompleto = comIndices && sample.resultadoModo === "completo";
    const results = sample.corposDeProva.map((cp) =>
      calcCorpoDeProva(cp, { comIndices, gs: sample.massaEspecificaGraos, isCompleto }),
    );
    const media = results.length > 1 ? mediaCps(results) : null;
    return { comIndices, isCompleto, results, media };
  }, [sample]);
}

/** Página única do laudo: identificação + CP(s) + índices físicos (se aplicável) + resultado. */
function CompressaoSimplesReportPage({
  sample,
  photos = [],
}: {
  sample: CompressaoSimplesSample;
  photos?: import("@/features/lab/types").Photo[];
}) {
  const { comIndices, isCompleto, results, media } = useCsResults(sample);
  const fotosAntes = photos.filter((p) => p.kind === "moldagem");
  const fotosDepois = photos.filter((p) => p.kind === "ruptura");

  return (
    <ReportPage
      sample={sample as unknown as ReportSample}
      page={1}
      total={1}
      title={`COMPRESSÃO SIMPLES — ${AMOSTRA_TIPO_LABEL[sample.amostraTipo].toUpperCase()}`}
      norms={normsFor(sample.amostraTipo)}
    >
      <div className="space-y-2 text-[10px] text-[#141414]">
        <div className="border border-[#141414]">
          <div className="rounded-t border-b border-[#141414] bg-[#141414]/10 px-2 py-1 text-center text-[9.5px] font-bold uppercase text-[#141414]">
            Corpo(s) de Prova
            {sample.amostraTipo === "dosagem" && sample.idadeCuraDias != null ? ` — Idade de cura: ${sample.idadeCuraDias} dias` : ""}
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#141414]/5 text-[8.5px] font-semibold">
                <td className="border border-[#141414] px-1 py-0.5 text-center">CP</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">D médio (cm)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">H médio (cm)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Área (cm²)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Volume (cm³)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Massa (g)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">γnat (g/cm³)</td>
                {comIndices && <td className="border border-[#141414] px-1 py-0.5 text-center">γd (g/cm³)</td>}
                {comIndices && <td className="border border-[#141414] px-1 py-0.5 text-center">w (%)</td>}
                <td className="border border-[#141414] px-1 py-0.5 text-center">qu (kPa)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">qu (MPa)</td>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={r.id}>
                  <td className="border border-[#141414] px-1 py-0.5 text-center font-semibold">{r.label}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(r.diametroMedia, 2)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(r.alturaMedia, 2)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(r.area, 2)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(r.volume, 2)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(sample.corposDeProva[i]?.massaInicial, 1)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center font-medium">{fmt(r.gamaNat, 3)}</td>
                  {comIndices && <td className="border border-[#141414] px-1 py-0.5 text-center font-medium">{fmt(r.gamaD, 3)}</td>}
                  {comIndices && <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(r.w, 2)}</td>}
                  <td className="border border-[#141414] px-1 py-0.5 text-center font-semibold">{fmt(r.quKPa, 0)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center font-semibold">{fmt(r.quMPa, 3)}</td>
                </tr>
              ))}
              {media && (
                <tr className="bg-[#141414]/10">
                  <td className="border border-[#141414] px-1 py-0.5 text-center font-bold" colSpan={comIndices ? 8 : 6}>
                    Média ({results.length} CPs)
                  </td>
                  {comIndices && <td className="border border-[#141414] px-1 py-0.5 text-center font-bold">{fmt(media.w, 2)}</td>}
                  <td className="border border-[#141414] px-1 py-0.5 text-center font-bold">{fmt(media.quKPa, 0)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center font-bold">{fmt(media.quMPa, 3)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {comIndices && (
          <div className="border border-[#141414]">
            <div className="rounded-t border-b border-[#141414] bg-[#141414]/10 px-2 py-1 text-center text-[9.5px] font-bold uppercase text-[#141414]">
              Índices Físicos
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#141414]/5 text-[8.5px] font-semibold">
                  <td className="border border-[#141414] px-1 py-0.5 text-center">CP</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">Gs (g/cm³)</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">e</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">n (%)</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">SR (%)</td>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id}>
                    <td className="border border-[#141414] px-1 py-0.5 text-center font-semibold">{r.label}</td>
                    <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(sample.massaEspecificaGraos, 2)}</td>
                    <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(r.ei, 3)}</td>
                    <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(r.n, 1)}</td>
                    <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(r.sr, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border border-[#141414] px-2 py-1.5 flex items-center justify-between">
          <span className="text-[9.5px] font-semibold uppercase">
            Resistência à Compressão Simples — qu {media ? "(média)" : ""}
          </span>
          <span className="text-[13px] font-bold">
            {fmt(media ? media.quKPa : results[0]?.quKPa, 0)} kPa &nbsp;·&nbsp; {fmt(media ? media.quMPa : results[0]?.quMPa, 3)} MPa
          </span>
        </div>

        {isCompleto && (
          <div className="border border-[#141414]">
            <div className="rounded-t border-b border-[#141414] bg-[#141414]/10 px-2 py-1 text-center text-[9px] font-bold uppercase text-[#141414]">
              Curva Tensão × Deformação Axial
            </div>
            <div className={`grid ${results.length > 1 ? "grid-cols-2" : "grid-cols-1"} gap-1 p-1`}>
              {results.map((r) => (
                <div key={r.id} className="h-[130px]">
                  <div className="text-center text-[8px] font-semibold text-[#141414]/70">{r.label}</div>
                  <ResponsiveContainer width="100%" height="90%">
                    <ComposedChart data={r.curvaPontos} margin={{ top: 4, right: 12, bottom: 16, left: 8 }}>
                      <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                      <XAxis dataKey="deformacaoPct" type="number" tick={{ fontSize: 8 }}>
                        <RLabel value="Deformação (%)" position="insideBottom" offset={-8} fontSize={8} />
                      </XAxis>
                      <YAxis dataKey="tensaoKPa" tick={{ fontSize: 8 }} width={45}>
                        <RLabel value="Tensão (kPa)" angle={-90} position="insideLeft" offset={-4} fontSize={8} />
                      </YAxis>
                      <Tooltip formatter={(v: number) => `${fmt(v, 1)} kPa`} labelFormatter={(v) => `ε = ${fmt(v as number, 2)}%`} />
                      <Line dataKey="tensaoKPa" stroke="#2563eb" type="monotone" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                      {r.picoPct != null && r.quKPa != null && (
                        <ReferenceDot x={r.picoPct} y={r.quKPa} r={3.5} fill="#dc2626" stroke="none" />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
          </div>
        )}

        {(fotosAntes.length > 0 || fotosDepois.length > 0) && (
          <div className="border border-[#141414]">
            <div className="rounded-t border-b border-[#141414] bg-[#141414]/10 px-2 py-1 text-center text-[9.5px] font-bold uppercase text-[#141414]">
              Registro Fotográfico
            </div>
            <div className="grid grid-cols-2 gap-2 p-1.5">
              <div>
                <div className="mb-0.5 text-center text-[8px] font-semibold uppercase text-[#141414]/70">Antes do ensaio</div>
                <div className="grid grid-cols-2 gap-1">
                  {fotosAntes.map((p) => (
                    <div key={p.id} className="aspect-square overflow-hidden rounded border border-[#141414]/40 bg-white">
                      <img src={p.url || p.dataUrl} alt="Antes do ensaio" crossOrigin="anonymous" className="h-full w-full object-cover" />
                    </div>
                  ))}
                  {fotosAntes.length === 0 && <div className="col-span-2 py-2 text-center text-[8px] text-[#141414]/50">—</div>}
                </div>
              </div>
              <div>
                <div className="mb-0.5 text-center text-[8px] font-semibold uppercase text-[#141414]/70">Após a ruptura</div>
                <div className="grid grid-cols-2 gap-1">
                  {fotosDepois.map((p) => (
                    <div key={p.id} className="aspect-square overflow-hidden rounded border border-[#141414]/40 bg-white">
                      <img src={p.url || p.dataUrl} alt="Após a ruptura" crossOrigin="anonymous" className="h-full w-full object-cover" />
                    </div>
                  ))}
                  {fotosDepois.length === 0 && <div className="col-span-2 py-2 text-center text-[8px] text-[#141414]/50">—</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="border border-[#141414]">
          <div className="rounded-t border-b border-[#141414] bg-[#141414]/10 px-2 py-1 text-center text-[9.5px] font-bold uppercase text-[#141414]">
            Legenda
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 p-2 text-[8.5px] leading-tight">
            <div><b>qu</b> — resistência à compressão simples (carga de pico / área inicial)</div>
            <div><b>γnat, γd</b> — massa específica aparente natural e seca (g/cm³)</div>
            {comIndices && <div><b>w</b> — teor de umidade (%)</div>}
            {comIndices && <div><b>Gs, e, n, SR</b> — massa específica dos grãos, índice de vazios, porosidade e grau de saturação</div>}
          </div>
          <div className="border-t border-[#141414]/40 px-2 py-1 text-[8px] text-[#141414]/70 leading-tight">
            qu = Pico de carga / Área inicial do corpo de prova, sem correção de área.
            {sample.amostraTipo === "solo" && " Conforme ABNT NBR 12770."}
            {sample.amostraTipo === "rocha" && " Conforme ABNT NBR 15845-5, cf. ASTM D7012 (Método C) / ISRM."}
            {sample.amostraTipo === "dosagem" && " Conforme ABNT NBR 12025."}
            {results.length > 1 && " Resultado final = média dos CPs rompidos."}
          </div>
        </div>
      </div>
    </ReportPage>
  );
}

export function CompressaoSimplesPage() {
  const ctx = useOptionalLabEnsaio();
  const { lookup } = useCadastroByOs();
  const cad = ctx?.os?.numero ? lookup(ctx.os.numero) : undefined;
  const { displayName, user, role } = useAuth();
  const currentUserName = displayName || user?.email?.split("@")[0] || "Cleitton Pereira";
  const isAdmin = role === "admin" || user?.email?.includes("cleitton") || user?.id === "cleitton-admin-local";
  const isVerificador = role === "verificador" || role === "gestor" || isAdmin;

  const scopeId =
    ctx && ctx.os && ctx.amostra && ctx.ensaio
      ? buildScopeId(ctx.os.id, ctx.amostra.id, ctx.ensaio.id)
      : (ctx?.ensaio?.id ?? "local");
  const draftActivity = useDraftActivity(scopeId);

  const draftRef = useRef<ReturnType<typeof loadDraft>>(null);
  if (draftRef.current === null) draftRef.current = loadDraft(scopeId);

  const payloadDraft = ctx?.ensaio?.payload as any;
  const draft = payloadDraft ?? draftRef.current ?? undefined;

  const initialSample: CompressaoSimplesSample = useMemo(() => {
    const base = seedCompressaoSimplesSample();
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

  const [sample, setSample] = useState<CompressaoSimplesSample>(() =>
    draft?.sample ? { ...initialSample, ...draft.sample } : initialSample,
  );

  useEffect(() => {
    if (!sample.typedBy && currentUserName) setSample((prev) => ({ ...prev, typedBy: currentUserName }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserName]);

  const [saveBusy, setSaveBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [tab, setTab] = useState("amostra");
  const [sampleEditOpen, setSampleEditOpen] = useState(false);
  const [activeCp, setActiveCp] = useState(0);
  const [curveDialogOpen, setCurveDialogOpen] = useState(false);

  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [versions, setVersions] = useState<ReportVersion[]>([]);
  const [driveFolderUrl, setDriveFolderUrl] = useState<string | null>(null);
  const [driveStatus, setDriveStatus] = useState<Awaited<ReturnType<typeof fetchDriveStatus>> | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [wfStatus, setWfStatus] = useState(() => (ctx?.ensaio as any)?.status || "digitacao");
  const [remoteLoaded, setRemoteLoaded] = useState(false);

  const [decideOpen, setDecideOpen] = useState<null | {
    rev: number; stage: "verify" | "approve"; decision: "verificado" | "rejeitado_verificacao" | "aprovado" | "rejeitado";
  }>(null);
  const [decideComment, setDecideComment] = useState("");
  const [decideBusy, setDecideBusy] = useState(false);

  const reportRef = useRef<HTMLDivElement>(null);
  const prefillCheckedRef = useRef(false);

  const refreshVersions = async () => setVersions(await listVersions(scopeId));

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
    } catch (err) { console.warn(err); }
  };

  const refreshDriveStatus = async () => {
    try {
      const s = await fetchDriveStatus(scopeId);
      setDriveStatus(s);
      const okPdf = s.entries.find((e) => e.kind === "pdf" && e.status === "ok" && e.folder_id);
      if (okPdf?.folder_id) setDriveFolderUrl(`https://drive.google.com/drive/folders/${okPdf.folder_id.replace(/\/relatorios$/, "")}`);
    } catch (err) { console.warn("drive status", err); }
  };

  const fotosParaDrive = () =>
    (ctx?.photos ?? [])
      .map((p) => {
        const m = /^data:(.*?);base64,(.*)$/.exec(p.dataUrl);
        const mimeType = m?.[1] || "image/jpeg";
        const b64 = m?.[2] || "";
        const ext = mimeType.split("/")[1] || "jpg";
        return { cpId: "geral", filename: `${p.kind}_${p.id}.${ext}`, mimeType, base64: b64 };
      })
      .filter((f) => f.base64.length > 0);

  const handleSyncAll = async () => {
    if (versions.length === 0) { toast.info("Salve pelo menos uma versão para sincronizar."); return; }
    setDriveBusy(true);
    const tid = toast.loading("Reenviando última revisão ao Drive…");
    try {
      const last = versions[0];
      const result = await syncRevision({
        scopeId, rev: last.rev, pdfBlob: last.pdfBlob, pdfFilename: last.filename, sample,
        photos: ctx?.photos || [], ctxOs: ctx?.os, ctxAmostra: ctx?.amostra,
        ctxEnsaio: { tipo: "compressao-simples", nome: sample.reportNumber }, fotos: fotosParaDrive(),
      });
      if (result?.folderUrl) setDriveFolderUrl(result.folderUrl);
      await refreshDriveStatus();
      toast.success("Reenvio concluído ✓", { id: tid });
    } catch (err) {
      toast.error("Falha no reenvio: " + (err instanceof Error ? err.message : String(err)), { id: tid });
    } finally { setDriveBusy(false); }
  };

  const handleDeleteVersion = async (id: string) => {
    if (!confirm("Excluir esta revisão? Esta ação não pode ser desfeita.")) return;
    try { await deleteVersion(id); await refreshVersions(); toast.success("Revisão excluída"); }
    catch (err) { toast.error("Falha ao excluir: " + (err instanceof Error ? err.message : String(err))); }
  };

  useEffect(() => {
    refreshVersions();
    refreshApprovals();
    refreshDriveStatus();
    fetchRemoteDraft(scopeId, {
      osNum: ctx?.os?.numero,
      amCode: ctx?.amostra?.reportNumber || ctx?.amostra?.code,
      ensaioTipo: "compressao-simples",
    })
      .then((remote) => { if (remote?.sample) setSample((s) => ({ ...s, ...remote.sample })); setRemoteLoaded(true); })
      .catch(() => setRemoteLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId]);

  // Pré-preenchimento a partir da digitalização de campo — só na primeira
  // carga e só se ainda não houver CPs preenchidos, pra não sobrescrever
  // edição manual já feita no escritório.
  useEffect(() => {
    if (!remoteLoaded || prefillCheckedRef.current || !ctx) return;
    prefillCheckedRef.current = true;
    const jaTemDados = sample.corposDeProva.some((cp) => cp.alturas.some((v) => v > 0) || cp.diametros.some((v) => v > 0));
    if (jaTemDados) return;
    let cancelled = false;
    (async () => {
      try {
        const pendencias = await listPendenciasDigitacao();
        const pend = findMatchingPendencia(pendencias, {
          os: ctx.os.numero,
          amostra: ctx.amostra.reportNumber || ctx.amostra.code,
          tipo: "compressao-simples",
        });
        const fp = pend?.payload as unknown as CsFieldPayload | undefined;
        if (cancelled || !fp) return;
        setSample((prev) => ({
          ...prev,
          amostraTipo: fp.amostraTipo || prev.amostraTipo,
          resultadoModo: fp.resultadoModo || prev.resultadoModo,
          idadeCuraDias: fp.idadeCuraDias ?? prev.idadeCuraDias,
          massaEspecificaGraos: fp.massaEspecificaGraos ?? prev.massaEspecificaGraos,
          corposDeProva: Array.isArray(fp.corposDeProva) && fp.corposDeProva.length
            ? fp.corposDeProva.map((cp) => ({ ...cp }))
            : prev.corposDeProva,
        }));
        toast.success("Dados pré-preenchidos da digitalização de campo — confira antes de continuar.");
      } catch (err) {
        console.warn("[Compressão Simples prefill] Falha:", err);
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

  useEffect(() => {
    if (activeCp >= sample.corposDeProva.length) setActiveCp(Math.max(0, sample.corposDeProva.length - 1));
  }, [sample.corposDeProva.length, activeCp]);

  const updateSample = <K extends keyof CompressaoSimplesSample>(k: K, v: CompressaoSimplesSample[K]) =>
    setSample((s) => ({ ...s, [k]: v }));
  const cp = sample.corposDeProva[activeCp] ?? sample.corposDeProva[0];
  const updateCp = (patch: Partial<CsCorpoDeProva>) =>
    setSample((s) => ({ ...s, corposDeProva: s.corposDeProva.map((c, i) => (i === activeCp ? { ...c, ...patch } : c)) }));
  const updateCapsula = (idx: number, patch: Partial<CsCapsula>) =>
    setSample((s) => ({
      ...s,
      corposDeProva: s.corposDeProva.map((c, i) => {
        if (i !== activeCp) return c;
        return { ...c, capsulas: c.capsulas.map((cap, j) => (j === idx ? { ...cap, ...patch } : cap)) };
      }),
    }));
  const updateAltura = (idx: number, v: number) => { const alturas = cp.alturas.slice(); alturas[idx] = v; updateCp({ alturas }); };
  const updateDiametro = (idx: number, v: number) => { const diametros = cp.diametros.slice(); diametros[idx] = v; updateCp({ diametros }); };
  const addCp = () => {
    setSample((s) => ({ ...s, corposDeProva: [...s.corposDeProva, newCsCorpoDeProva(`CP${String(s.corposDeProva.length + 1).padStart(2, "0")}`)] }));
    setActiveCp(sample.corposDeProva.length);
  };
  const removeCp = (idx: number) => {
    if (sample.corposDeProva.length <= 1) { toast.error("Deve haver ao menos um CP"); return; }
    setSample((s) => ({ ...s, corposDeProva: s.corposDeProva.filter((_, i) => i !== idx) }));
  };

  const { comIndices, isCompleto, results, media } = useCsResults(sample);

  const buildReportPdfBlob = async (): Promise<Blob> => {
    if (import.meta.env.SSR) throw new Error("buildReportPdfBlob só roda no navegador");
    const el = reportRef.current;
    if (!el) throw new Error("Container do relatório não encontrado.");

    const prevStyle = {
      position: el.style.position, top: el.style.top, left: el.style.left,
      width: el.style.width, zIndex: el.style.zIndex, opacity: el.style.opacity, visibility: el.style.visibility,
    };
    Object.assign(el.style, {
      position: "fixed", top: "0", left: "0", width: "210mm", background: "#ffffff",
      pointerEvents: "none", zIndex: "2147483647", opacity: "1", visibility: "visible",
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
          pixelRatio: 2.5, cacheBust: true, backgroundColor: "#ffffff",
          style: {
            transform: "none", margin: "0", padding: "5mm 8mm", width: "210mm", height: "297mm",
            maxWidth: "210mm", maxHeight: "297mm", boxSizing: "border-box", overflow: "hidden",
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
      const aEl = document.createElement("a");
      aEl.href = url;
      const base = (sample.workNumber || sample.os || "relatorio").toString().replace(/[^\w-]+/g, "_");
      aEl.download = `COMP-SIMPLES_${base}.pdf`;
      document.body.appendChild(aEl);
      aEl.click();
      document.body.removeChild(aEl);
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
      const filename = `COMP-SIMPLES_${base}_Rev-${String(rev).padStart(2, "0")}.pdf`;
      const saved = await saveVersion({ scopeId, rev, filename, size: blob.size, pdfBlob: blob });
      await refreshVersions();

      try {
        const resDrive = await syncRevision({
          scopeId, rev: saved.rev, pdfBlob: blob, pdfFilename: filename, sample,
          photos: ctx?.photos || [], ctxOs: ctx?.os, ctxAmostra: ctx?.amostra,
          ctxEnsaio: { tipo: "compressao-simples", nome: sample.reportNumber }, fotos: fotosParaDrive(),
        });
        if (resDrive?.folderUrl) setDriveFolderUrl(resDrive.folderUrl);
      } catch (err) { console.warn("Drive sync standby:", err); }

      await requestApproval({
        data: {
          scopeId, rev: saved.rev, filename, skipVerification,
          index: {
            os_numero: sample.os, os_cliente: sample.client,
            amostra_code: sample.reportNumber || sample.code,
            ensaio_tipo: "compressao-simples", ensaio_nome: `Compressão Simples — ${AMOSTRA_TIPO_LABEL[sample.amostraTipo]}`,
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
    } finally { setSaveBusy(false); }
  };

  const rawSt = wfStatus || approvals[0]?.status || (ctx?.ensaio as any)?.status || "digitacao";
  const isAguardandoVerif = rawSt === "aguardando_verificacao" || rawSt === "pendente_verificacao" || rawSt === "digitado" || rawSt === "verificacao";
  const isAguardandoAprov = rawSt === "aguardando_aprovacao" || rawSt === "pendente_aprovacao" || rawSt === "verificado";
  const isAprovado = rawSt === "aprovado" || rawSt === "concluido";
  const rev = approvals[0]?.rev ?? 0;

  return (
    <>
      <Dialog open={decideOpen !== null} onOpenChange={(o) => !o && setDecideOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decideOpen?.decision === "aprovado" ? "Aprovar Relatório"
                : decideOpen?.decision === "rejeitado" || decideOpen?.decision === "rejeitado_verificacao" ? "Rejeitar Relatório"
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
                } finally { setDecideBusy(false); }
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
              <DialogTitle className="text-base font-bold text-foreground">
                Compressão Simples — {AMOSTRA_TIPO_LABEL[sample.amostraTipo]} — Pré-visualização
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">A4 · 210 × 297 mm</DialogDescription>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto bg-[#525659] p-8 flex justify-center">
            <div className="flex flex-col items-center gap-8 shrink-0 pb-12">
              <div className="w-[210mm] h-[297mm] shadow-2xl bg-white shrink-0 overflow-hidden">
                <CompressaoSimplesReportPage sample={sample} photos={ctx?.photos ?? []} />
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
                norms={normsFor(sample.amostraTipo).map((n) => n.text.split(" - ")[0])}
                status={rawSt}
                lastSavedAt={draftActivity.lastSavedAt}
                history={draftActivity.history}
                onFlushDraft={() => flushDraft(scopeId, { id: user?.id, name: displayName })}
              />
              <EnsaioTitleBlock
                title={`Compressão Simples — ${AMOSTRA_TIPO_LABEL[sample.amostraTipo]}`}
                description="Resistência à compressão não confinada — solo, rocha ou dosagem/solo-cimento, conforme o tipo de amostra."
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
                      } finally { setSaveBusy(false); }
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

        <Card className="mb-4 border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Amostra {sample.reportNumber || "—"} · OS {sample.os}</CardTitle>
                <CardDescription className="text-xs">
                  {sample.client || "—"} · Furo {sample.borehole || "—"} · Prof. {sample.depth || "—"}
                </CardDescription>
              </div>
              <button type="button" onClick={() => setSampleEditOpen(true)} className="text-xs text-primary hover:underline font-semibold cursor-pointer shrink-0">
                editar amostra →
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="text-muted-foreground">Condição da amostra</div>
                <div className="font-medium">
                  {sample.sampleState === "compactada"
                    ? `Compactada${sample.compactionEnergy ? ` · ${sample.compactionEnergy}` : ""}${typeof sample.compactionDegreePct === "number" ? ` · GC ${sample.compactionDegreePct}%` : ""}`
                    : sample.sampleState === "recompactada" ? "Recompactada"
                      : sample.sampleState === "deformada" ? "Deformada"
                        : sample.sampleState === "indeformada" ? `Indeformada${sample.sampleType ? ` · ${sample.sampleType}` : ""}`
                          : "—"}
                </div>
              </div>
              <div><div className="text-muted-foreground">Equipamento</div><div className="font-medium">{sample.equipment || "—"}</div></div>
              <div>
                <div className="text-muted-foreground">qu {media ? "(média)" : ""}</div>
                <div className="font-medium">{fmt(media ? media.quKPa : results[0]?.quKPa, 0)} kPa · {fmt(media ? media.quMPa : results[0]?.quMPa, 3)} MPa</div>
              </div>
              <div><div className="text-muted-foreground">Corpos de prova</div><div className="font-medium">{sample.corposDeProva.length}</div></div>
            </div>
          </CardContent>
        </Card>

        <SampleEditDialog
          open={sampleEditOpen}
          onOpenChange={setSampleEditOpen}
          data={{
            osId: ctx?.os?.id, amostraId: ctx?.amostra?.id, osNumero: sample.os,
            client: sample.client, workNumber: sample.workNumber, local: sample.local,
            technicalResp: sample.technicalResp, revision: String(sample.revision ?? "0"),
            reportNumber: sample.reportNumber, code: sample.code, borehole: sample.borehole, depth: sample.depth,
            sampleType: sample.sampleType, sampleState: sample.sampleState,
            description: sample.description, granulometricDescription: sample.granulometricDescription,
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
              sampleType: updated.sampleType || prev.sampleType,
              sampleState: (updated.sampleState as CompressaoSimplesSample["sampleState"]) || prev.sampleState,
              equipment: updated.equipment || prev.equipment,
            }));
          }}
        />

        <div className="mb-3" />

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
              <Card className="mb-4">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Tipo de ensaio</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="text-[10px] uppercase text-muted-foreground">Compressão simples em</Label>
                    <Select value={sample.amostraTipo} onValueChange={(v) => updateSample("amostraTipo", v as CsAmostraTipo)}>
                      <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="solo">Solo</SelectItem>
                        <SelectItem value="rocha">Rocha</SelectItem>
                        <SelectItem value="dosagem">Dosagem (solo-cimento)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {comIndices && (
                    <div>
                      <Label className="text-[10px] uppercase text-muted-foreground">Resultado</Label>
                      <Select value={sample.resultadoModo} onValueChange={(v) => updateSample("resultadoModo", v as CsResultadoModo)}>
                        <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="simplificado">Simplificado (só o pico)</SelectItem>
                          <SelectItem value="completo">Completo (curva tensão x deformação)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {sample.amostraTipo === "dosagem" && (
                    <NumField label="Idade de cura (dias)" value={sample.idadeCuraDias} onChange={(v) => updateSample("idadeCuraDias", v)} />
                  )}
                  {comIndices && (
                    <NumField label="Massa específica dos grãos — Gs (g/cm³)" value={sample.massaEspecificaGraos} onChange={(v) => updateSample("massaEspecificaGraos", v)} />
                  )}
                  {sample.sampleState === "compactada" && (
                    <div className="col-span-full grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Energia de Compactação</Label>
                        <Select value={sample.compactionEnergy ?? ""} onValueChange={(v) => updateSample("compactionEnergy", v as CompressaoSimplesSample["compactionEnergy"])}>
                          <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Selecione a energia…" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PN">Proctor Normal (PN)</SelectItem>
                            <SelectItem value="PI">Proctor Intermediário (PI)</SelectItem>
                            <SelectItem value="PM">Proctor Modificado (PM)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Grau de Compactação Alvo (GC %)</Label>
                        <Input type="number" step={0.1} value={sample.compactionDegreePct ?? ""}
                          onChange={(e) => updateSample("compactionDegreePct", e.target.value ? parseFloat(e.target.value) : undefined)}
                          placeholder="Ex.: 95 %" className="h-8 text-xs mt-1" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex items-center gap-2 mb-4">
                <Tabs value={String(activeCp)} onValueChange={(v) => setActiveCp(Number(v))} className="flex-1">
                  <TabsList className="flex-wrap h-auto">
                    {sample.corposDeProva.map((c, i) => (
                      <TabsTrigger key={c.id} value={String(i)} className="text-xs">{c.label}</TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <Button size="sm" variant="outline" onClick={addCp}><Plus className="h-3.5 w-3.5 mr-1" /> CP</Button>
                {sample.corposDeProva.length > 1 && (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeCp(activeCp)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <Card className="mb-4">
                <CardHeader className="pb-2"><CardTitle className="text-sm">{cp.label} — dimensões e massa</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-4 gap-2">
                    {cp.alturas.map((v, i) => (
                      <NumField key={i} label={`Altura ${i + 1} (cm)`} value={v || null} onChange={(nv) => updateAltura(i, nv ?? 0)} />
                    ))}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {cp.diametros.map((v, i) => (
                      <NumField key={i} label={`Diâmetro ${i + 1} (cm)`} value={v || null} onChange={(nv) => updateDiametro(i, nv ?? 0)} />
                    ))}
                  </div>
                  <NumField label="Massa do corpo de prova (g)" value={cp.massaInicial} onChange={(v) => updateCp({ massaInicial: v })} />
                </CardContent>
              </Card>

              {comIndices && (
                <Card className="mb-4">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">{cp.label} — cápsulas de umidade</CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-xs">
                        <thead className="bg-muted/40 text-muted-foreground">
                          <tr>
                            <td className="border p-1.5 text-left">Determinação</td>
                            {cp.capsulas.map((_, i) => <td key={i} className="border p-1.5 text-center w-24">Cápsula {i + 1}</td>)}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="border p-1.5 font-medium">Nº Cápsula</td>
                            {cp.capsulas.map((c, i) => (
                              <td key={i} className="border p-1"><Input className="h-7 text-xs text-center" value={c.numero ?? ""} onChange={(e) => updateCapsula(i, { numero: e.target.value })} placeholder={`#${i + 1}`} /></td>
                            ))}
                          </tr>
                          <tr>
                            <td className="border p-1.5 font-medium">Tara (g)</td>
                            {cp.capsulas.map((c, i) => (
                              <td key={i} className="border p-1"><Input type="number" className="h-7 text-xs text-center" value={c.tara} onChange={(e) => updateCapsula(i, { tara: Number(e.target.value.replace(",", ".")) || 0 })} /></td>
                            ))}
                          </tr>
                          <tr>
                            <td className="border p-1.5 font-medium">Solo Úmido + Tara (g)</td>
                            {cp.capsulas.map((c, i) => (
                              <td key={i} className="border p-1"><Input type="number" className="h-7 text-xs text-center" value={c.wet} onChange={(e) => updateCapsula(i, { wet: Number(e.target.value.replace(",", ".")) || 0 })} /></td>
                            ))}
                          </tr>
                          <tr>
                            <td className="border p-1.5 font-medium">Solo Seco + Tara (g)</td>
                            {cp.capsulas.map((c, i) => (
                              <td key={i} className="border p-1"><Input type="number" className="h-7 text-xs text-center" value={c.dry} onChange={(e) => updateCapsula(i, { dry: Number(e.target.value.replace(",", ".")) || 0 })} /></td>
                            ))}
                          </tr>
                          <tr className="bg-muted/30">
                            <td className="border p-1.5 font-medium">Umidade (%)</td>
                            {cp.capsulas.map((c, i) => { const w = capsulaUmidadePct(c); return <td key={i} className="border p-1.5 text-center font-semibold">{w != null ? w.toFixed(2) : "—"}</td>; })}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Teor de umidade médio: <strong className="text-foreground">{fmt(teorUmidadeMedio(cp.capsulas), 2)}%</strong>
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card className="mb-4">
                <CardHeader className="pb-2"><CardTitle className="text-sm">{cp.label} — ruptura, resultado</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {!isCompleto ? (
                    <div className="grid grid-cols-2 gap-3">
                      <NumField label="Pico de carga na ruptura" value={cp.picoCarga} onChange={(v) => updateCp({ picoCarga: v })} />
                      <div>
                        <Label className="text-xs">Unidade</Label>
                        <Select value={cp.picoCargaUnidade} onValueChange={(v) => updateCp({ picoCargaUnidade: v as CompressaoSimplesSample["corposDeProva"][number]["picoCargaUnidade"] })}>
                          <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="N">Newtons (N)</SelectItem>
                            <SelectItem value="kgf">Quilograma-força (kgf)</SelectItem>
                            <SelectItem value="kN">Quilonewtons (kN)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Button size="sm" variant="outline" onClick={() => setCurveDialogOpen(true)}>
                        <Upload className="h-3.5 w-3.5 mr-1" /> {cp.curva.length > 0 ? "Reimportar curva" : "Importar curva"}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        {cp.curva.length > 0 ? `${cp.curva.length} pontos importados.` : "Nenhuma curva importada ainda."}
                      </p>
                      <CsCurveImportDialog
                        open={curveDialogOpen}
                        onOpenChange={setCurveDialogOpen}
                        onImport={(pontos) => updateCp({ curva: pontos })}
                      />
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Resultado ({cp.label}): <strong className="text-foreground">
                      {fmt(results.find((r) => r.id === cp.id)?.quKPa, 0)} kPa · {fmt(results.find((r) => r.id === cp.id)?.quMPa, 3)} MPa
                    </strong>
                  </p>
                  {media && (
                    <p className="text-xs text-muted-foreground">
                      Média de {results.length} CPs: <strong className="text-foreground">{fmt(media.quKPa, 0)} kPa · {fmt(media.quMPa, 3)} MPa</strong>
                    </p>
                  )}
                </CardContent>
              </Card>

              {ctx && (
                <Card className="mb-4">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Registro Fotográfico</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <PhotoUploader title="Antes do ensaio" kind="moldagem" photos={ctx.photos} onAdd={ctx.addPhoto} onRemove={ctx.removePhoto} onUpdate={ctx.updatePhoto} />
                    <PhotoUploader title="Após a ruptura" kind="ruptura" photos={ctx.photos} onAdd={ctx.addPhoto} onRemove={ctx.removePhoto} onUpdate={ctx.updatePhoto} />
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="versoes" className="m-0 space-y-4">
              <div className="mb-4">
                <ReportVersionsPanel
                  scopeId={scopeId} versions={versions} approvals={approvals}
                  onRefreshApprovals={refreshApprovals} isAdmin={isAdmin} isVerificador={isVerificador}
                  driveFolderUrl={driveFolderUrl} driveStatus={driveStatus} driveBusy={driveBusy}
                  onSyncAll={handleSyncAll} onOpenReport={() => setReportOpen(true)}
                  onDownloadVersion={downloadVersion} onDeleteVersion={handleDeleteVersion}
                />
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <div
          ref={reportRef}
          style={{ position: "fixed", top: 0, left: 0, width: "210mm", background: "#ffffff", pointerEvents: "none", zIndex: -9999, opacity: 0 }}
          className="print-only-report mx-auto flex flex-col items-center gap-4"
        >
          <CompressaoSimplesReportPage sample={sample} photos={ctx?.photos ?? []} />
        </div>
      </div>
    </>
  );
}
