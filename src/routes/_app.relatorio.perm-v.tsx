import { useDraftActivity } from "@/hooks/use-draft-activity";
import { EditingPresenceBanner } from "@/components/DraftActivityInfo";
import { buildScopeId } from "@/lib/scope";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import {
  CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Label as RLabel,
} from "recharts";
import { useCadastroByOs } from "@/hooks/use-cadastro-by-os";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Download, Droplets, Send, ShieldCheck, Plus, Trash2, CheckCircle2,
  Beaker, History, FileText, Ruler,
} from "lucide-react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import {
  listVersions, saveVersion, nextRev, deleteVersion, downloadVersion, type ReportVersion,
} from "@/features/perm-v/report-versions";
import { syncRevision, fetchDriveStatus } from "@/features/perm-v/driveSync";
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
import { ReportPage, type ReportSample } from "@/components/report/ReportShell";
import { EnsaioBadgesRow, EnsaioTitleBlock, ResponsaveisBar } from "@/components/report/EnsaioReportHeader";
import { SampleEditDialog } from "@/components/SampleEditDialog";
import type { PermVSample, PermVCalibracaoModo, PermVCapsula, PermVBureta } from "@/features/perm-v/types";
import { seedPermVSample, newPermVLeitura, newPermVCapsula } from "@/features/perm-v/types";
import { listBuretas, saveBureta } from "@/features/perm-v/buretaPresets";
import {
  massaSeca, volumeCp, massaEspecificaAparenteSeca, indiceDeVazios, grauDeSaturacao,
  areaBureta, cargaHidraulica, capsulaUmidadePct, teorUmidadeMedio,
  calcDeterminacoes, volumeAcumulado, volumeDeVazios, k20Medio, fmtK,
  classificarPermeabilidade, posicaoNaFaixaPermeabilidade, PERM_FAIXAS,
} from "@/features/perm-v/calc";
import { loadDraft, saveDraft, fetchRemoteDraft, flushDraft } from "@/features/perm-v/draftStore";
import { listPendenciasDigitacao } from "@/lib/lab-pendencias.functions";
import { findMatchingPendencia } from "@/lib/pendencia-match";
import type { PermVFieldPayload } from "@/features/perm-v/ui";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export const Route = createFileRoute("/_app/relatorio/perm-v")({
  component: () => {
    const ctx = useOptionalLabEnsaio();
    return ctx?.ensaio ? <PermVPage /> : <EnsaioListByType tipo="perm-v" />;
  },
  head: () => ({
    meta: [
      { title: "Permeabilidade a Carga Variável (PERM.V) — Suporte INFRA" },
      {
        name: "description",
        content: "Determinação do coeficiente de permeabilidade a carga variável, Método B (ABNT NBR 14545:2021).",
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
        type="number"
        inputMode="decimal"
        value={value ?? ""}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? null : Number(raw.replace(",", ".")));
        }}
        className="h-7 text-xs w-24"
      />
    </div>
  );
}

/** Página única do laudo: identificação + índices físicos + determinações + gráficos. */
function PermVReportPage({
  sample,
  photos = [],
}: {
  sample: PermVSample;
  photos?: import("@/features/lab/types").Photo[];
}) {
  const determinacoes = useMemo(() => calcDeterminacoes(sample), [sample]);
  const volAcum = useMemo(() => volumeAcumulado(determinacoes), [determinacoes]);
  const k20med = k20Medio(determinacoes);

  const teorUmidade = teorUmidadeMedio(sample.capsulas);
  const ms = sample.massaUmida != null && teorUmidade != null
    ? massaSeca(sample.massaUmida, teorUmidade) : null;
  const vcp = sample.diametroInicial != null && sample.alturaInicial != null
    ? volumeCp(sample.diametroInicial, sample.alturaInicial) : null;
  const rhoD = ms != null && vcp != null ? massaEspecificaAparenteSeca(ms, vcp) : null;
  const ei = sample.massaEspecificaGraos != null && rhoD != null
    ? indiceDeVazios(sample.massaEspecificaGraos, rhoD) : null;
  const sr = sample.massaEspecificaGraos != null && teorUmidade != null && ei != null
    ? grauDeSaturacao(sample.massaEspecificaGraos, teorUmidade, ei) : null;
  const vv = vcp != null && ei != null ? volumeDeVazios(vcp, ei) : null;

  const chartData = determinacoes.map((d, i) => ({
    idx: i + 1,
    volAcum: volAcum[i],
    k20: d.k20,
    tFinal: d.leituraFinal.tSegundos != null ? d.leituraFinal.tSegundos / 60 : null,
    h: d.h2,
  }));

  return (
    <ReportPage
      sample={sample as unknown as ReportSample}
      page={1}
      total={1}
      title="PERMEABILIDADE A CARGA VARIÁVEL — MÉTODO B"
      norms={[{ text: "ABNT NBR 14545:2021 - Solo — Determinação do coeficiente de permeabilidade de solos argilosos à carga variável" }]}
    >
      <div className="space-y-2 text-[10px] text-[#141414]">
        <div className="border border-[#141414]">
          <div className="rounded-t border-b border-[#141414] bg-[#141414]/10 px-2 py-1 text-center text-[9.5px] font-bold uppercase text-[#141414]">
            Índices Físicos Iniciais do Corpo de Prova
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#141414]/5 text-[8.5px] font-semibold">
                <td className="border border-[#141414] px-1 py-0.5 text-center">D₀ (cm)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">H₀ (cm)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Ms (g)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">ρd (g/cm³)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">ei</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">SR (%)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Vv (cm³)</td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(sample.diametroInicial, 2)}</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(sample.alturaInicial, 2)}</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(ms, 1)}</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center font-medium">{fmt(rhoD, 3)}</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center font-medium">{fmt(ei, 3)}</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(sr, 1)}</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(vv, 2)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="border border-[#141414]">
          <div className="rounded-t border-b border-[#141414] bg-[#141414]/10 px-2 py-1 text-[9.5px] font-bold uppercase text-[#141414] flex items-center justify-between">
            <span>Determinações do Coeficiente de Permeabilidade</span>
            <span>Água: {sample.naturezaAgua || "—"} · Gradiente: {fmt(sample.gradienteHidraulico, 1)}</span>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#141414]/5 text-[8.5px] font-semibold">
                <td className="border border-[#141414] px-1 py-0.5 text-center">Nº</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Δt (s)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">h1 (cm)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">h2 (cm)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Temp. méd. (°C)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">R_T</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">k (cm/s)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">k20 (cm/s)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">V acum. (cm³)</td>
              </tr>
            </thead>
            <tbody>
              {determinacoes.map((d, i) => (
                <tr key={i}>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{i + 1}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(d.deltaT, 0)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(d.h1, 2)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(d.h2, 2)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(d.temperaturaMedia, 1)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(d.rt, 3)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center font-medium">{fmtK(d.k)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center font-medium">{fmtK(d.k20)}</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(volAcum[i], 2)}</td>
                </tr>
              ))}
              {determinacoes.length === 0 && (
                <tr>
                  <td colSpan={9} className="border border-[#141414] px-1 py-2 text-center text-muted-foreground">
                    Sem leituras suficientes para calcular determinações.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="border border-[#141414] px-2 py-1.5 flex items-center justify-between">
          <span className="text-[9.5px] font-semibold uppercase">Coeficiente de Permeabilidade a 20°C — k20 (média de {determinacoes.length} determinações)</span>
          <span className="text-[12px] font-bold">{fmtK(k20med)} cm/s</span>
        </div>

        {/* Classificação pela faixa de permeabilidade (A. Casagrande e R. E. Fadum) */}
        <div className="border border-[#141414]">
          <div className="rounded-t border-b border-[#141414] bg-[#141414]/10 px-2 py-1 text-center text-[9px] font-bold uppercase text-[#141414]">
            Faixa de Permeabilidade (A. Casagrande e R. E. Fadum) — {classificarPermeabilidade(k20med) ?? "—"}
          </div>
          <div className="p-2">
            <div className="relative h-6 w-full flex overflow-hidden rounded-sm border border-[#141414]/50">
              {[...PERM_FAIXAS].reverse().map((f) => (
                <div
                  key={f.nome}
                  className="h-full border-r border-[#141414]/30 last:border-r-0 flex items-center justify-center text-[6.5px] font-semibold text-[#141414] px-0.5 text-center leading-tight"
                  style={{ width: `${((f.expMax - f.expMin) / 10) * 100}%`, background: "#e5e7eb" }}
                >
                  {f.nome}
                </div>
              ))}
              {posicaoNaFaixaPermeabilidade(k20med) != null && (
                <div
                  className="absolute top-[-3px] h-[calc(100%+6px)] w-[2px] bg-[#dc2626]"
                  style={{ left: `${(posicaoNaFaixaPermeabilidade(k20med) as number) * 100}%` }}
                />
              )}
            </div>
            <div className="mt-1 flex justify-between text-[7px] text-[#141414]/70 font-mono">
              <span>10²</span><span>10⁻²</span><span>10⁻⁴</span><span>10⁻⁶</span><span>10⁻⁸ cm/s</span>
            </div>
          </div>
        </div>

        {/* Gráfico 1 — exigido pela norma (item 9.h): k20 × volume de água percolado acumulado */}
        <div className="border border-[#141414]">
          <div className="rounded-t border-b border-[#141414] bg-[#141414]/10 px-2 py-1 text-center text-[9px] font-bold uppercase text-[#141414]">
            Variação do Coeficiente de Permeabilidade (k20) × Volume de Água Percolado
          </div>
          <div className="h-[130px] p-1">
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top: 4, right: 12, bottom: 16, left: 8 }}>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                <XAxis dataKey="volAcum" type="number" tick={{ fontSize: 8 }}>
                  <RLabel value="Volume percolado acumulado (cm³)" position="insideBottom" offset={-8} fontSize={8} />
                </XAxis>
                <YAxis dataKey="k20" tick={{ fontSize: 8 }} width={55}
                  tickFormatter={(v) => (typeof v === "number" ? v.toExponential(1) : String(v))}>
                  <RLabel value="k20 (cm/s)" angle={-90} position="insideLeft" offset={-4} fontSize={8} />
                </YAxis>
                <Tooltip formatter={(v: number) => fmtK(v)} />
                <Line dataKey="k20" stroke="#2563eb" type="monotone" dot={{ r: 2 }} strokeWidth={1.5} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 2 — carga hidráulica × tempo (curva de decaimento da carga variável) */}
        <div className="border border-[#141414]">
          <div className="rounded-t border-b border-[#141414] bg-[#141414]/10 px-2 py-1 text-center text-[9px] font-bold uppercase text-[#141414]">
            Carga Hidráulica (h) × Tempo
          </div>
          <div className="h-[130px] p-1">
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top: 4, right: 12, bottom: 16, left: 8 }}>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                <XAxis dataKey="tFinal" type="number" tick={{ fontSize: 8 }}>
                  <RLabel value="Tempo (min)" position="insideBottom" offset={-8} fontSize={8} />
                </XAxis>
                <YAxis dataKey="h" tick={{ fontSize: 8 }} width={40}>
                  <RLabel value="h (cm)" angle={-90} position="insideLeft" offset={-4} fontSize={8} />
                </YAxis>
                <Tooltip />
                <Line dataKey="h" stroke="#059669" type="monotone" dot={{ r: 2 }} strokeWidth={1.5} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {photos.length > 0 && (
          <div className="border border-[#141414]">
            <div className="rounded-t border-b border-[#141414] bg-[#141414]/10 px-2 py-1 text-center text-[9.5px] font-bold uppercase text-[#141414]">
              Registro Fotográfico
            </div>
            <div className="grid grid-cols-4 gap-1 p-1">
              {photos.map((p) => (
                <div key={p.id} className="aspect-square overflow-hidden rounded border border-[#141414]/40 bg-white">
                  <img src={p.url || p.dataUrl} alt="Registro fotográfico" crossOrigin="anonymous" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border border-[#141414]">
          <div className="rounded-t border-b border-[#141414] bg-[#141414]/10 px-2 py-1 text-center text-[9.5px] font-bold uppercase text-[#141414]">
            Legenda
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 p-2 text-[8.5px] leading-tight">
            <div><b>h1, h2</b> — carga hidráulica nos instantes t1 e t2 (cm)</div>
            <div><b>Δt</b> — intervalo de tempo entre t1 e t2 (s)</div>
            <div><b>R_T</b> — relação entre a viscosidade da água na temperatura de ensaio e a 20 °C (Tabela 1)</div>
            <div><b>k</b> — coeficiente de permeabilidade à temperatura de ensaio (cm/s)</div>
            <div><b>k20</b> — coeficiente de permeabilidade referido a 20 °C = R_T × k (cm/s)</div>
            <div><b>ei</b> — índice de vazios inicial do corpo de prova</div>
            <div><b>SR</b> — grau de saturação inicial (%)</div>
            <div><b>Vv</b> — volume de vazios do corpo de prova (cm³)</div>
          </div>
          <div className="border-t border-[#141414]/40 px-2 py-1 text-[8px] text-[#141414]/70 leading-tight">
            k = (a·H)/(A·Δt) · ln(h1/h2) · k20 = R_T·k, conforme ABNT NBR 14545:2021, § 8.4.
            Método B: a = área interna da bureta; H e A = altura e área iniciais do corpo de prova.
          </div>
        </div>
      </div>
    </ReportPage>
  );
}

export function PermVPage() {
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

  const initialSample: PermVSample = useMemo(() => {
    const base = seedPermVSample();
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

  const [sample, setSample] = useState<PermVSample>(() =>
    draft?.sample
      ? { ...initialSample, ...draft.sample, calibracao: { ...initialSample.calibracao, ...draft.sample.calibracao } }
      : initialSample,
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
  const [sampleEditOpen, setSampleEditOpen] = useState(false);

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
        ctxEnsaio: { tipo: "perm-v", nome: sample.reportNumber },
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
      ensaioTipo: "perm-v",
    })
      .then((remote) => {
        if (remote?.sample) setSample((s) => ({ ...s, ...remote.sample }));
        setRemoteLoaded(true);
      })
      .catch(() => setRemoteLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId]);

  // Pré-preenchimento a partir da digitalização de campo — só na primeira
  // carga e só se ainda não houver leituras preenchidas, pra não sobrescrever
  // edição manual já feita no escritório.
  useEffect(() => {
    if (!remoteLoaded || prefillCheckedRef.current || !ctx) return;
    prefillCheckedRef.current = true;
    const jaTemDados = sample.leituras.some((l) => l.leituraBruta != null);
    if (jaTemDados) return;
    let cancelled = false;
    (async () => {
      try {
        const pendencias = await listPendenciasDigitacao();
        const pend = findMatchingPendencia(pendencias, {
          os: ctx.os.numero,
          amostra: ctx.amostra.reportNumber || ctx.amostra.code,
          tipo: "perm-v",
        });
        const fp = pend?.payload as unknown as PermVFieldPayload | undefined;
        if (cancelled || !fp?.leituras?.length) return;
        setSample((prev) => ({
          ...prev,
          naturezaAgua: fp.naturezaAgua || prev.naturezaAgua,
          gradienteHidraulico: fp.gradienteHidraulico ?? prev.gradienteHidraulico,
          massaUmida: fp.massaUmida ?? prev.massaUmida,
          capsulas: Array.isArray(fp.capsulas) && fp.capsulas.length ? fp.capsulas.map((c) => ({ ...c })) : prev.capsulas,
          massaEspecificaGraos: fp.massaEspecificaGraos ?? prev.massaEspecificaGraos,
          diametroInicial: fp.diametroInicial ?? prev.diametroInicial,
          alturaInicial: fp.alturaInicial ?? prev.alturaInicial,
          cargaHidraulicaInicial: fp.cargaHidraulicaInicial ?? prev.cargaHidraulicaInicial,
          calibracao: fp.calibracao ? { ...prev.calibracao, ...fp.calibracao } : prev.calibracao,
          leituras: fp.leituras.map((l) => ({ ...l })),
        }));
        toast.success("Dados pré-preenchidos da digitalização de campo — confira antes de continuar.");
      } catch (err) {
        console.warn("[PERM.V prefill] Falha:", err);
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

  const updateSample = <K extends keyof PermVSample>(k: K, v: PermVSample[K]) =>
    setSample((s) => ({ ...s, [k]: v }));
  const updateCalibracao = (patch: Partial<PermVSample["calibracao"]>) =>
    setSample((s) => ({ ...s, calibracao: { ...s.calibracao, ...patch } }));
  const updateCapsula = (idx: number, patch: Partial<PermVCapsula>) =>
    setSample((s) => ({ ...s, capsulas: s.capsulas.map((c, i) => (i === idx ? { ...c, ...patch } : c)) }));
  const updateCurvaPonto = (idx: number, patch: Partial<{ leitura: number; alturaAcumuladaCm: number }>) =>
    setSample((s) => ({
      ...s,
      calibracao: { ...s.calibracao, curva: s.calibracao.curva.map((p, i) => (i === idx ? { ...p, ...patch } : p)) },
    }));
  const addCurvaPonto = () =>
    setSample((s) => ({
      ...s,
      calibracao: { ...s.calibracao, curva: [...s.calibracao.curva, { leitura: s.calibracao.curva.length, alturaAcumuladaCm: 0 }] },
    }));
  const removeCurvaPonto = (idx: number) =>
    setSample((s) => ({ ...s, calibracao: { ...s.calibracao, curva: s.calibracao.curva.filter((_, i) => i !== idx) } }));
  const [buretasSalvas, setBuretasSalvas] = useState<PermVBureta[]>(() => listBuretas());
  const updateLeitura = (idx: number, patch: Partial<PermVSample["leituras"][number]>) =>
    setSample((s) => ({ ...s, leituras: s.leituras.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }));
  const addLeitura = () => setSample((s) => ({ ...s, leituras: [...s.leituras, newPermVLeitura()] }));
  const removeLeitura = (idx: number) => {
    if (sample.leituras.length <= 2) {
      toast.error("Deve haver ao menos duas leituras");
      return;
    }
    setSample((s) => ({ ...s, leituras: s.leituras.filter((_, i) => i !== idx) }));
  };

  const determinacoes = useMemo(() => calcDeterminacoes(sample), [sample]);
  const a = useMemo(() => areaBureta(sample.calibracao), [sample.calibracao]);

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
      aEl.download = `PERM-V_${base}.pdf`;
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
      const filename = `PERM-V_${base}_Rev-${String(rev).padStart(2, "0")}.pdf`;
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
          scopeId, rev: saved.rev, pdfBlob: blob, pdfFilename: filename, sample,
          photos: ctx?.photos || [], ctxOs: ctx?.os, ctxAmostra: ctx?.amostra,
          ctxEnsaio: { tipo: "perm-v", nome: sample.reportNumber }, fotos,
        });
        if (resDrive?.folderUrl) setDriveFolderUrl(resDrive.folderUrl);
      } catch (err) {
        console.warn("Drive sync standby:", err);
      }

      await requestApproval({
        data: {
          scopeId, rev: saved.rev, filename, skipVerification,
          index: {
            os_numero: sample.os, os_cliente: sample.client,
            amostra_code: sample.reportNumber || sample.code,
            ensaio_tipo: "perm-v", ensaio_nome: "Permeabilidade a Carga Variável (PERM.V)",
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

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-[96vw] w-[96vw] h-[95vh] flex flex-col p-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 border-b bg-card">
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Permeabilidade a Carga Variável (PERM.V) — Pré-visualização
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">A4 · 210 × 297 mm</DialogDescription>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto bg-[#525659] p-8 flex justify-center">
            <div className="flex flex-col items-center gap-8 shrink-0 pb-12">
              <div className="w-[210mm] h-[297mm] shadow-2xl bg-white shrink-0 overflow-hidden">
                <PermVReportPage sample={sample} photos={ctx?.photos ?? []} />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex h-full flex-col bg-background p-4 lg:p-6 pb-20">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Droplets className="h-6 w-6" />
            </div>
            <div>
              <EnsaioBadgesRow
                norms={["ABNT NBR 14545:2021"]}
                status={rawSt}
                lastSavedAt={draftActivity.lastSavedAt}
                history={draftActivity.history}
                onFlushDraft={() => flushDraft(scopeId, { id: user?.id, name: displayName })}
              />
              <EnsaioTitleBlock
                title="Permeabilidade a Carga Variável (PERM.V)"
                description="Método B — bureta graduada. Determinação do coeficiente de permeabilidade de solos argilosos a carga variável."
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

        <Card className="mb-4 border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">
                  Amostra {sample.reportNumber || "—"} · OS {sample.os}
                </CardTitle>
                <CardDescription className="text-xs">
                  {sample.client || "—"} · Furo {sample.borehole || "—"} · Prof. {sample.depth || "—"}
                </CardDescription>
              </div>
              <button
                type="button"
                onClick={() => setSampleEditOpen(true)}
                className="text-xs text-primary hover:underline font-semibold cursor-pointer shrink-0"
              >
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
                    ? `Compactada${sample.compactionEnergy ? ` · ${sample.compactionEnergy}` : ""}${
                        typeof sample.compactionDegreePct === "number" ? ` · GC ${sample.compactionDegreePct}%` : ""
                      }`
                    : sample.sampleState === "recompactada"
                      ? "Recompactada"
                      : sample.sampleState === "deformada"
                        ? "Deformada"
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
                <div className="text-muted-foreground">Natureza da água</div>
                <div className="font-medium">{sample.naturezaAgua || "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Gradiente hidráulico</div>
                <div className="font-medium">{sample.gradienteHidraulico ?? "—"}</div>
              </div>
            </div>
          </CardContent>
        </Card>

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
            sampleType: sample.sampleType,
            sampleState: sample.sampleState,
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
              sampleType: updated.sampleType || prev.sampleType,
              sampleState: (updated.sampleState as PermVSample["sampleState"]) || prev.sampleState,
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
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Índices físicos iniciais e ensaio</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <NumField label="Massa úmida do CP — Mu (g)" value={sample.massaUmida} onChange={(v) => updateSample("massaUmida", v)} />
                  <NumField label="Massa específica dos grãos — ρs (g/cm³)" value={sample.massaEspecificaGraos} onChange={(v) => updateSample("massaEspecificaGraos", v)} />
                  <NumField label="Diâmetro inicial do CP — D₀ (cm)" value={sample.diametroInicial} onChange={(v) => updateSample("diametroInicial", v)} />
                  <NumField label="Altura inicial do corpo de prova — H (cm)" value={sample.alturaInicial} onChange={(v) => updateSample("alturaInicial", v)} />
                  <NumField label="Gradiente hidráulico (2 a 15)" value={sample.gradienteHidraulico} onChange={(v) => updateSample("gradienteHidraulico", v)} />
                  <NumField label="Carga hidráulica inicial — H₀ (cm)" value={sample.cargaHidraulicaInicial} onChange={(v) => updateSample("cargaHidraulicaInicial", v)} />
                  <div className="col-span-2">
                    <TxtField label="Natureza da água" value={sample.naturezaAgua} onChange={(v) => updateSample("naturezaAgua", v)} />
                  </div>
                  {sample.sampleState === "compactada" && (
                    <div className="col-span-full grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">Energia de Compactação</Label>
                        <Select
                          value={sample.compactionEnergy ?? ""}
                          onValueChange={(v) => updateSample("compactionEnergy", v as PermVSample["compactionEnergy"])}
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
                          onChange={(e) => updateSample("compactionDegreePct", e.target.value ? parseFloat(e.target.value) : undefined)}
                          placeholder="Ex.: 95 %"
                          className="h-8 text-xs mt-1"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="mb-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Cápsulas de umidade (teor de umidade inicial — w)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <td className="border p-1.5 text-left">Determinação</td>
                          {sample.capsulas.map((_, i) => (
                            <td key={i} className="border p-1.5 text-center w-24">Cápsula {i + 1}</td>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border p-1.5 font-medium">Nº Cápsula</td>
                          {sample.capsulas.map((c, i) => (
                            <td key={i} className="border p-1">
                              <Input className="h-7 text-xs text-center" value={c.numero ?? ""} onChange={(e) => updateCapsula(i, { numero: e.target.value })} placeholder={`#${i + 1}`} />
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td className="border p-1.5 font-medium">Tara (g)</td>
                          {sample.capsulas.map((c, i) => (
                            <td key={i} className="border p-1">
                              <Input type="number" className="h-7 text-xs text-center" value={c.tara} onChange={(e) => updateCapsula(i, { tara: Number(e.target.value.replace(",", ".")) || 0 })} />
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td className="border p-1.5 font-medium">Solo Úmido + Tara (g)</td>
                          {sample.capsulas.map((c, i) => (
                            <td key={i} className="border p-1">
                              <Input type="number" className="h-7 text-xs text-center" value={c.wet} onChange={(e) => updateCapsula(i, { wet: Number(e.target.value.replace(",", ".")) || 0 })} />
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td className="border p-1.5 font-medium">Solo Seco + Tara (g)</td>
                          {sample.capsulas.map((c, i) => (
                            <td key={i} className="border p-1">
                              <Input type="number" className="h-7 text-xs text-center" value={c.dry} onChange={(e) => updateCapsula(i, { dry: Number(e.target.value.replace(",", ".")) || 0 })} />
                            </td>
                          ))}
                        </tr>
                        <tr className="bg-muted/30">
                          <td className="border p-1.5 font-medium">Umidade (%)</td>
                          {sample.capsulas.map((c, i) => {
                            const w = capsulaUmidadePct(c);
                            return <td key={i} className="border p-1.5 text-center font-semibold">{w != null ? w.toFixed(2) : "—"}</td>;
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Teor de umidade médio: <strong className="text-foreground">{teorUmidadeMedio(sample.capsulas)?.toFixed(2) ?? "—"}%</strong>
                  </p>
                </CardContent>
              </Card>

              <Card className="mb-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1.5"><Ruler className="h-4 w-4 text-muted-foreground" /> Calibração da bureta</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs">Bureta graduada em</Label>
                    <Select value={sample.calibracao.modo} onValueChange={(v) => updateCalibracao({ modo: v as PermVCalibracaoModo })}>
                      <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="volume">Volume (mL), seção uniforme — proporção fixa</SelectItem>
                        <SelectItem value="curva">Volume (mL), com curva de calibração cadastrada</SelectItem>
                        <SelectItem value="comprimento">Comprimento (cm) — leitura já é a carga</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {sample.calibracao.modo === "volume" ? (
                    <div className="grid grid-cols-2 gap-3">
                      <NumField label="Cada quantos mL..." value={sample.calibracao.volumeReferenciaMl} onChange={(v) => updateCalibracao({ volumeReferenciaMl: v })} />
                      <NumField label="...correspondem a quantos cm" value={sample.calibracao.alturaReferenciaCm} onChange={(v) => updateCalibracao({ alturaReferenciaCm: v })} />
                    </div>
                  ) : sample.calibracao.modo === "comprimento" ? (
                    <div className="grid grid-cols-2 gap-3">
                      <NumField label="Área interna da bureta — a (cm²)" value={sample.calibracao.areaBuretaCm2} onChange={(v) => updateCalibracao({ areaBuretaCm2: v })} />
                      <NumField label="...ou diâmetro interno (mm)" value={sample.calibracao.diametroInternoBuretaMm} onChange={(v) => updateCalibracao({ diametroInternoBuretaMm: v })} />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Bureta cadastrada</Label>
                          <Select
                            value=""
                            onValueChange={(id) => {
                              const b = buretasSalvas.find((x) => x.id === id);
                              if (b) updateCalibracao({ buretaNome: b.nome, curva: b.curva.map((p) => ({ ...p })) });
                            }}
                          >
                            <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Carregar bureta salva…" /></SelectTrigger>
                            <SelectContent>
                              {buretasSalvas.length === 0 && (
                                <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhuma bureta cadastrada ainda</div>
                              )}
                              {buretasSalvas.map((b) => (
                                <SelectItem key={b.id} value={b.id}>{b.nome} ({b.curva.length} pontos)</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <TxtField label="Nome desta bureta" value={sample.calibracao.buretaNome ?? ""} onChange={(v) => updateCalibracao({ buretaNome: v })} />
                      </div>

                      <div className="overflow-x-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead className="w-24">Leitura (mL)</TableHead>
                              <TableHead className="w-32">Altura acumulada (cm)</TableHead>
                              <TableHead className="w-10" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sample.calibracao.curva.map((p, i) => (
                              <TableRow key={i}>
                                <TableCell>
                                  <Input type="number" className="h-7 text-xs" value={p.leitura}
                                    onChange={(e) => updateCurvaPonto(i, { leitura: Number(e.target.value.replace(",", ".")) || 0 })} />
                                </TableCell>
                                <TableCell>
                                  <Input type="number" className="h-7 text-xs" value={p.alturaAcumuladaCm}
                                    onChange={(e) => updateCurvaPonto(i, { alturaAcumuladaCm: Number(e.target.value.replace(",", ".")) || 0 })} />
                                </TableCell>
                                <TableCell>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeCurvaPonto(i)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Ex.: leitura 0 → 0 cm; leitura 1 → 1,007 cm; leitura 2 → 2,063 cm (10,07mm + 10,56mm)…
                        cada linha é a altura acumulada desde a leitura 0, medida com régua.
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={addCurvaPonto}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> Ponto
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!sample.calibracao.buretaNome || sample.calibracao.curva.length < 2}
                          onClick={() => {
                            const bureta: PermVBureta = {
                              id: `bureta_${Math.random().toString(36).slice(2, 9)}`,
                              nome: sample.calibracao.buretaNome!,
                              curva: sample.calibracao.curva.map((p) => ({ ...p })),
                            };
                            saveBureta(bureta);
                            setBuretasSalvas(listBuretas());
                            toast.success(`Bureta "${bureta.nome}" cadastrada.`);
                          }}
                        >
                          Salvar esta bureta
                        </Button>
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {sample.calibracao.modo === "curva"
                      ? `Curva de calibração: ${sample.calibracao.curva.length} ponto(s) cadastrado(s).`
                      : <>Área calibrada (a): <strong className="text-foreground">{a != null ? a.toFixed(4) : "—"} cm²</strong></>}
                  </p>
                </CardContent>
              </Card>

              <Card className="mb-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>Leituras (carga hidráulica × tempo × temperatura)</span>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={addLeitura}>
                      <Plus className="h-3.5 w-3.5" /> Leitura
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-24">Tempo (s)</TableHead>
                          <TableHead className="w-28">Leitura bureta</TableHead>
                          <TableHead className="w-24">h (cm)</TableHead>
                          <TableHead className="w-24">Temp. (°C)</TableHead>
                          <TableHead className="w-10" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sample.leituras.map((l, i) => {
                          const h = l.leituraBruta != null ? cargaHidraulica(l.leituraBruta, sample.calibracao, sample.cargaHidraulicaInicial) : null;
                          return (
                            <TableRow key={l.id}>
                              <TableCell>
                                <Input type="number" className="h-7 text-xs" value={l.tSegundos ?? ""}
                                  onChange={(e) => updateLeitura(i, { tSegundos: e.target.value === "" ? null : Number(e.target.value) })} />
                              </TableCell>
                              <TableCell>
                                <Input type="number" className="h-7 text-xs" value={l.leituraBruta ?? ""}
                                  onChange={(e) => updateLeitura(i, { leituraBruta: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")) })} />
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{h != null ? h.toFixed(2) : "—"}</TableCell>
                              <TableCell>
                                <Input type="number" className="h-7 text-xs" value={l.temperatura ?? ""}
                                  onChange={(e) => updateLeitura(i, { temperatura: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")) })} />
                              </TableCell>
                              <TableCell>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeLeitura(i)}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {determinacoes.length} determinação(ões) calculada(s) — a norma pede pelo menos 4 relativamente próximas.
                  </p>
                </CardContent>
              </Card>

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

        <div
          ref={reportRef}
          style={{
            position: "fixed", top: 0, left: 0, width: "210mm", background: "#ffffff",
            pointerEvents: "none", zIndex: -9999, opacity: 0,
          }}
          className="print-only-report mx-auto flex flex-col items-center gap-4"
        >
          <PermVReportPage sample={sample} photos={ctx?.photos ?? []} />
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
