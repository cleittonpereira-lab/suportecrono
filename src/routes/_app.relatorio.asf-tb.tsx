/**
 * ASF.TB — teor de betume (DNER-ME 053/94) e granulometria do agregado
 * extraído (DNIT 412/2025-ME): editor do escritório, laudo A4 e fluxo de
 * verificação/aprovação. Mesmo esqueleto do ASF.DAP (_app.relatorio.asf-dap.tsx).
 */
import { useDraftActivity } from "@/hooks/use-draft-activity";
import { EditingPresenceBanner } from "@/components/DraftActivityInfo";
import { buildScopeId } from "@/lib/scope";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect, type ReactElement } from "react";
import { useCadastroByOs } from "@/hooks/use-cadastro-by-os";
import { useAuth } from "@/hooks/use-auth";
import { podeAprovar, podeVerificar } from "@/lib/papeis";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Send, ShieldCheck, CheckCircle2, Beaker, History, FileText, Filter, Layers } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import {
  CartesianGrid, ComposedChart, Line, ResponsiveContainer, XAxis, YAxis, Label as RLabel,
} from "recharts";
import {
  listVersions,
  saveVersion,
  nextRev,
  deleteVersion,
  downloadVersion,
  type ReportVersion,
} from "@/features/asf-tb/report-versions";
import { sincronizarVersoesComDrive, useVersoesAoVivo } from "@/lib/revisoes-do-drive";
import { syncRevision, fetchDriveStatus } from "@/features/asf-tb/driveSync";
import { ReportVersionsPanel } from "@/components/report/ReportVersionsPanel";
import { marcarAssinaturasNoPdf } from "@/lib/assinaturas-pdf";
import {
  listApprovals,
  requestApproval,
  verifyApproval,
  decideApproval,
  type ApprovalRow,
} from "@/lib/approvals-com-pdf";
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
import { EnsaioBadgesRow, EnsaioTitleBlock, AmostraSummaryCard, ResponsaveisBar } from "@/components/report/EnsaioReportHeader";
import { SampleEditDialog } from "@/components/SampleEditDialog";
import type { Photo } from "@/features/lab/types";
import {
  ASF_TB_NOME,
  SOLVENTES_SUGERIDOS,
  normalizarMedidas,
  seedAsfTbSample,
  type AsfTbFaixa,
  type AsfTbFieldPayload,
  type AsfTbPeneira,
  type AsfTbSample,
} from "@/features/asf-tb/types";
import {
  calcularGranulometria,
  casasDoPassante,
  formatarAbertura,
  massaBetume,
  massaInicialDoPeneiramento,
  teorBetume,
  TOLERANCIA_SOMA_PCT,
  type LinhaGranulometria,
} from "@/features/asf-tb/calc";
import {
  FAIXAS_DISPONIVEIS,
  FAIXAS_DNIT_031,
  foraDaFaixa,
  limiteNaPeneira,
  type FaixaGranulometrica,
} from "@/features/asf-tb/faixas";
import { loadDraft, saveDraft, fetchRemoteDraft, flushDraft } from "@/features/asf-tb/draftStore";
import { listPendenciasDigitacao } from "@/lib/lab-pendencias.functions";
import { findMatchingPendencia } from "@/lib/pendencia-match";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Porcentagem como sai no laudo (§9d da DNIT 412: inteiro, salvo a exceção da 0,075 mm). */
const pct = (v: number, casas = 0) => fmt(v, casas);

/** Rascunho antigo ou vindo de outra versão da tela: completa as medidas (série de peneiras etc.). */
function comMedidasCompletas(s: AsfTbSample): AsfTbSample {
  return { ...s, ...normalizarMedidas(s) };
}

const NORMAS = [
  { text: "DNER-ME 053/94 - Misturas betuminosas - Percentagem de betume" },
  { text: "DNIT 412/2025-ME - Agregados - Análise granulométrica de agregados graúdos e miúdos por peneiramento" },
];

export const Route = createFileRoute("/_app/relatorio/asf-tb")({
  component: () => {
    const ctx = useOptionalLabEnsaio();
    return ctx?.ensaio ? <AsfTbPage /> : <EnsaioListByType tipo="asf-tb" />;
  },
  head: () => ({
    meta: [
      { title: "Teor de Betume e Granulometria (ASF.TB) — Suporte INFRA" },
      {
        name: "description",
        content:
          "Teor de betume por extrator centrífugo (DNER-ME 053/94) e granulometria do agregado extraído (DNIT 412/2025-ME).",
      },
    ],
  }),
});

function NumInput({
  value, onChange, className = "w-24", placeholder, disabled, ariaLabel,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      value={value ?? ""}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === "" ? null : Number(raw.replace(",", ".")));
      }}
      className={`h-7 text-xs ${className}`}
    />
  );
}

function NumField({ label, value, onChange, placeholder }: { label: string; value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  return (
    <div>
      <Label className="text-[9px] text-muted-foreground block">{label}</Label>
      <NumInput value={value} onChange={onChange} placeholder={placeholder} className="w-36" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Laudo
// ---------------------------------------------------------------------------

const TICKS_ABERTURA = [0.075, 0.15, 0.3, 0.6, 1.18, 2.36, 4.8, 9.5, 19, 37.5, 75];

/** Curva granulométrica (% passante × abertura, escala log — Anexo C da DNIT 412), com a faixa opcional. */
function CurvaGranulometrica({ linhas, faixa }: { linhas: LinhaGranulometria[]; faixa: FaixaGranulometrica | null }) {
  const curva = linhas.map((l) => ({ x: l.aberturaMm, y: Number(l.pctPassante.toFixed(1)) }));
  const minimo = faixa?.limites.map((f) => ({ x: f.aberturaMm, y: f.min })) ?? [];
  const maximo = faixa?.limites.map((f) => ({ x: f.aberturaMm, y: f.max })) ?? [];
  const maiorAbertura = Math.max(1, ...curva.map((c) => c.x), ...(faixa?.limites.map((f) => f.aberturaMm) ?? []));
  const xMax = maiorAbertura <= 37.5 ? 50 : 100;
  return (
    <ResponsiveContainer width="100%" height={235}>
      <ComposedChart margin={{ top: 6, right: 16, bottom: 18, left: 4 }}>
        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
        <XAxis
          dataKey="x"
          type="number"
          scale="log"
          domain={[0.05, xMax]}
          ticks={TICKS_ABERTURA.filter((t) => t <= xMax)}
          tickFormatter={(v: number) => formatarAbertura(v)}
          tick={{ fontSize: 8 }}
          allowDataOverflow
        >
          <RLabel value="Abertura da malha das peneiras (mm)" position="insideBottom" offset={-10} style={{ fontSize: 8 }} />
        </XAxis>
        <YAxis type="number" domain={[0, 100]} ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]} tick={{ fontSize: 8 }} width={30}>
          <RLabel value="% passante" angle={-90} position="insideLeft" style={{ fontSize: 8 }} />
        </YAxis>
        {faixa && (
          <Line data={minimo} dataKey="y" stroke="#9ca3af" strokeDasharray="4 3" strokeWidth={1} dot={false} isAnimationActive={false} />
        )}
        {faixa && (
          <Line data={maximo} dataKey="y" stroke="#9ca3af" strokeDasharray="4 3" strokeWidth={1} dot={false} isAnimationActive={false} />
        )}
        <Line data={curva} dataKey="y" stroke="#1d4ed8" strokeWidth={1.6} dot={{ r: 2, fill: "#1d4ed8" }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const th = "border border-[#141414] px-1 py-0.5 text-center";
const td = "border border-[#141414] px-1 py-[1px] text-center";

function Bloco({ titulo, direita, children }: { titulo: string; direita?: string; children: React.ReactNode }) {
  return (
    <div className="border border-[#141414]">
      <div className="rounded-t border-b border-[#141414] bg-[#141414]/10 px-2 py-1 text-[9.5px] font-bold uppercase text-[#141414] flex items-center justify-between">
        <span>{titulo}</span>
        {direita ? <span className="normal-case font-semibold">{direita}</span> : null}
      </div>
      {children}
    </div>
  );
}

/**
 * Páginas do laudo: 1 com teor de betume + tabela de granulometria; 2 com a
 * curva granulométrica + notas; 3 com o registro fotográfico, se houver
 * fotos. Antes a página 1 acumulava tudo (tabela, gráfico e notas) — com uma
 * faixa DNIT selecionada (colunas extra) o miolo da folha ficava perto do
 * limite e as notas saíam espremidas contra o rodapé. Separar em duas
 * páginas garante espaço mesmo com a faixa ligada, em vez de torcer pra
 * caber.
 */
function paginasDoLaudo(sample: AsfTbSample, photos: Photo[]): ReactElement[] {
  const betume = massaBetume(sample.massaAmostra, sample.massaAgregado);
  const teor = teorBetume(sample.massaAmostra, sample.massaAgregado);
  const g = calcularGranulometria(sample);
  const faixa = sample.mostrarFaixa ? FAIXAS_DNIT_031[sample.faixa] : null;
  const temFotos = photos.length > 0;
  const total = temFotos ? 3 : 2;
  const titulo = "TEOR DE BETUME E GRANULOMETRIA DO AGREGADO EXTRAÍDO";
  const algumForaDaFaixa = !!(faixa && g?.linhas.some((l) => foraDaFaixa(sample.faixa, l.aberturaMm, l.pctPassante)));

  const paginas: ReactElement[] = [
    <ReportPage key="p1" sample={sample as unknown as ReportSample} page={1} total={total} title={titulo} norms={NORMAS}>
      <div className="space-y-2 text-[10px] text-[#141414]">
        <Bloco titulo="Teor de betume — DNER-ME 053/94 (extrator centrífugo)" direita={sample.solvente ? `Solvente: ${sample.solvente}` : undefined}>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#141414]/5 text-[8.5px] font-semibold">
                <td className={th}>Massa da amostra total (g)</td>
                <td className={th}>Massa do agregado recuperado (g)</td>
                <td className={th}>Massa de betume extraído (g)</td>
                <td className={th}>Teor de betume (%)</td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={td}>{fmt(sample.massaAmostra, 1)}</td>
                <td className={td}>{fmt(sample.massaAgregado, 1)}</td>
                <td className={td}>{fmt(betume, 1)}</td>
                <td className={`${td} text-[11px] font-bold`}>{fmt(teor, 2)}</td>
              </tr>
            </tbody>
          </table>
        </Bloco>

        <Bloco
          titulo="Granulometria do agregado extraído — DNIT 412/2025-ME"
          direita={faixa ? `Faixa ${faixa.nome} — DNIT 031/2024-ES` : undefined}
        >
          {g ? (
            <>
              <div className="grid grid-cols-4 border-b border-[#141414] text-[8.5px]">
                <div className="border-r border-[#141414] px-2 py-0.5"><b>Massa seca inicial:</b> {fmt(g.massaInicial, 1)} g</div>
                <div className="border-r border-[#141414] px-2 py-0.5">
                  <b>Após lavagem (0,075 mm):</b> {sample.massaAposLavagem != null && g.perdaLavagem != null ? `${fmt(sample.massaAposLavagem, 1)} g` : "sem lavagem"}
                </div>
                <div className="border-r border-[#141414] px-2 py-0.5"><b>Soma das massas:</b> {fmt(g.somaMassas, 1)} g</div>
                <div className="px-2 py-0.5">
                  <b>Diferença:</b> {fmt(g.diferencaPct, 2)}% {g.dentroDaTolerancia ? `(≤ ${fmt(TOLERANCIA_SOMA_PCT, 1)}%)` : `(acima de ${fmt(TOLERANCIA_SOMA_PCT, 1)}%)`}
                </div>
              </div>
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#141414]/5 text-[8.5px] font-semibold">
                    <td className={th}>Peneira</td>
                    <td className={th}>Abertura (mm)</td>
                    <td className={th}>Massa retida (g)</td>
                    <td className={th}>% retida</td>
                    <td className={th}>% retida acumulada</td>
                    <td className={th}>% passante</td>
                    {faixa && <td className={th}>Faixa mín. (%)</td>}
                    {faixa && <td className={th}>Faixa máx. (%)</td>}
                  </tr>
                </thead>
                <tbody>
                  {g.linhas.map((l) => {
                    const lim = faixa ? limiteNaPeneira(sample.faixa, l.aberturaMm) : null;
                    const fora = faixa ? foraDaFaixa(sample.faixa, l.aberturaMm, l.pctPassante) === true : false;
                    return (
                      <tr key={l.aberturaMm}>
                        <td className={td}>{l.nome}</td>
                        <td className={td}>{formatarAbertura(l.aberturaMm)}</td>
                        <td className={td}>{fmt(l.retida ?? 0, 1)}</td>
                        <td className={td}>{pct(l.pctRetida)}</td>
                        <td className={td}>{pct(l.pctRetidaAcumulada)}</td>
                        <td className={`${td} ${fora ? "font-bold" : "font-medium"}`}>
                          {pct(l.pctPassante, casasDoPassante(l.aberturaMm, l.pctPassante))}
                          {fora ? "*" : ""}
                        </td>
                        {faixa && <td className={td}>{lim ? lim.min : "—"}</td>}
                        {faixa && <td className={td}>{lim ? lim.max : "—"}</td>}
                      </tr>
                    );
                  })}
                  <tr>
                    <td className={td} colSpan={2}>Fundo{g.perdaLavagem != null ? " (+ lavagem)" : ""}</td>
                    <td className={td}>{fmt(g.fundo.massa, 1)}</td>
                    <td className={td}>{pct(g.fundo.pctRetida)}</td>
                    <td className={td}>—</td>
                    <td className={td}>—</td>
                    {faixa && <td className={td} colSpan={2} />}
                  </tr>
                </tbody>
              </table>
              <div className="border-t border-[#141414] px-2 py-0.5 text-[8.5px] flex gap-6">
                <span><b>Dimensão máxima característica:</b> {g.dimensaoMaximaCaracteristica != null ? `${formatarAbertura(g.dimensaoMaximaCaracteristica)} mm` : "—"}</span>
                <span><b>Tamanho nominal máximo (TNM):</b> {g.tamanhoNominalMaximo != null ? `${formatarAbertura(g.tamanhoNominalMaximo)} mm` : "—"}</span>
              </div>
            </>
          ) : (
            <div className="px-2 py-3 text-center text-[9px] text-[#141414]/60">Sem massa seca inicial — granulometria não calculada.</div>
          )}
        </Bloco>

      </div>
    </ReportPage>,
    <ReportPage key="p2" sample={sample as unknown as ReportSample} page={2} total={total} title={titulo} norms={NORMAS}>
      <div className="space-y-2 text-[10px] text-[#141414]">
        {g && g.linhas.length > 0 && (
          <Bloco titulo="Curva granulométrica">
            <div className="px-1 pt-1">
              <CurvaGranulometrica linhas={g.linhas} faixa={faixa} />
            </div>
            <div className="flex justify-center gap-5 pb-1 text-[8px]">
              <span className="flex items-center gap-1">
                <span className="inline-block h-[2px] w-5 bg-[#1d4ed8]" /> Amostra ensaiada
              </span>
              {faixa && (
                <span className="flex items-center gap-1">
                  <span className="inline-block w-5 border-t border-dashed border-[#9ca3af]" /> Limites da faixa {faixa.nome}
                </span>
              )}
            </div>
          </Bloco>
        )}

        <Bloco titulo="Notas">
          <div className="space-y-0.5 p-2 text-[8.5px] leading-tight">
            <div>
              <b>Teor de betume</b> = (massa da amostra total − massa do agregado recuperado) / massa da amostra total × 100 (DNER-ME 053/94, item 6).
            </div>
            <div>
              Porcentagens da granulometria calculadas sobre a massa seca inicial do agregado extraído, antes da lavagem (DNIT 412/2025-ME, item 8);
              apresentadas no número inteiro mais próximo e, na peneira de 0,075 mm com passante abaixo de 10 %, com 0,1 % (item 9).
            </div>
            {faixa && (
              <div>
                Faixa {faixa.nome}: DNIT 031/2024-ES, Tabela 1. {algumForaDaFaixa ? "* % passante fora dos limites da faixa." : "Todas as peneiras com limite dentro da faixa."}
              </div>
            )}
          </div>
        </Bloco>
      </div>
    </ReportPage>,
  ];

  if (temFotos) {
    paginas.push(
      <ReportPage key="p3" sample={sample as unknown as ReportSample} page={3} total={total} title={titulo} norms={NORMAS}>
        <Bloco titulo="Registro fotográfico">
          <div className="grid grid-cols-3 gap-1 p-1">
            {photos.map((p) => (
              <div key={p.id} className="aspect-[4/3] overflow-hidden rounded border border-[#141414]/40 bg-white">
                <img src={p.url || p.dataUrl} alt="Registro fotográfico" crossOrigin="anonymous" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        </Bloco>
      </ReportPage>,
    );
  }
  return paginas;
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export function AsfTbPage() {
  const ctx = useOptionalLabEnsaio();
  const { lookup } = useCadastroByOs();
  const cad = ctx?.os?.numero ? lookup(ctx.os.numero) : undefined;
  const { displayName, user, role, profile } = useAuth();
  const currentUserName = displayName || user?.email?.split("@")[0] || "Cleitton Pereira";
  // Mesma regra do servidor (lib/papeis.ts).
  const isVerificador = podeVerificar({ role, labRole: profile?.labRole });
  const isAprovador = podeAprovar({ role, labRole: profile?.labRole });

  const scopeId =
    ctx && ctx.os && ctx.amostra && ctx.ensaio
      ? buildScopeId(ctx.os.id, ctx.amostra.id, ctx.ensaio.id)
      : (ctx?.ensaio?.id ?? "local");
  const draftActivity = useDraftActivity(scopeId);

  const draftRef = useRef<ReturnType<typeof loadDraft>>(null);
  if (draftRef.current === null) draftRef.current = loadDraft(scopeId);

  const payloadDraft = ctx?.ensaio?.payload as any;
  const draft = payloadDraft ?? draftRef.current ?? undefined;

  const initialSample: AsfTbSample = useMemo(() => {
    const base = seedAsfTbSample();
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

  const [sample, setSample] = useState<AsfTbSample>(() =>
    comMedidasCompletas(draft?.sample ? { ...initialSample, ...draft.sample } : initialSample),
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
  const [tab, setTab] = useState("ensaio");

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
    // Revisões salvas em outro computador — ou cujo PDF recebeu as assinaturas depois — vêm do Drive.
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
        return { cpId: "geral", filename: `${p.kind}_${p.id}.${ext}`, mimeType, base64: b64 };
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
        scopeId,
        rev: last.rev,
        pdfBlob: last.pdfBlob,
        pdfFilename: last.filename,
        sample,
        photos: ctx?.photos || [],
        ctxOs: ctx?.os,
        ctxAmostra: ctx?.amostra,
        ctxEnsaio: { tipo: "asf-tb", nome: sample.reportNumber },
        fotos: fotosParaDrive(),
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
      ensaioTipo: "asf-tb",
    })
      .then((remote) => {
        if (remote?.sample) setSample((s) => comMedidasCompletas({ ...s, ...remote.sample }));
        setRemoteLoaded(true);
      })
      .catch(() => setRemoteLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId]);

  // Pré-preenchimento pela digitação da bancada (celular) — só na primeira
  // carga e só se ainda não houver medidas, pra não sobrescrever edição feita no escritório.
  useEffect(() => {
    if (!remoteLoaded || prefillCheckedRef.current || !ctx) return;
    prefillCheckedRef.current = true;
    const jaTemDados =
      sample.massaAmostra != null || sample.massaAgregado != null || sample.peneiras.some((p) => p.retida != null);
    const jaTemFotos = (ctx.photos ?? []).length > 0;
    if (jaTemDados && jaTemFotos) return;
    let cancelled = false;
    (async () => {
      try {
        const pendencias = await listPendenciasDigitacao();
        const pend = findMatchingPendencia(pendencias, {
          os: ctx.os.numero,
          amostra: ctx.amostra.reportNumber || ctx.amostra.code,
          tipo: "asf-tb",
        });
        const fp = pend?.payload as unknown as Partial<AsfTbFieldPayload> | undefined;
        if (cancelled || !fp) return;
        let preencheu = false;
        if (!jaTemDados && fp.medidas) {
          setSample((prev) => ({ ...prev, ...normalizarMedidas(fp.medidas) }));
          preencheu = true;
        }
        // Fotos tiradas na bancada (celular) ficam só no payload da pendência —
        // sem isto, nunca chegavam ao relatório do escritório.
        if (!jaTemFotos && Array.isArray(fp.fotos) && fp.fotos.length > 0) {
          for (const foto of fp.fotos) {
            ctx.addPhoto({ dataUrl: foto.dataUrl, kind: "outro", caption: foto.caption });
          }
          preencheu = true;
        }
        if (preencheu) toast.success("Dados pré-preenchidos da digitação na bancada — confira antes de continuar.");
      } catch (err) {
        console.warn("[ASF.TB prefill] Falha:", err);
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
    // Depende só de `sample`/`ctx?.photos`, NUNCA do objeto `ctx` inteiro — o
    // LabEnsaioProvider recria `ctx` a cada render e este efeito regrava
    // `ensaio.payload`: depender de `ctx` formaria um laço infinito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteLoaded, scopeId, sample, ctx?.photos]);

  const updateSample = <K extends keyof AsfTbSample>(k: K, v: AsfTbSample[K]) =>
    setSample((s) => ({ ...s, [k]: v }));
  const updatePeneira = (idx: number, patch: Partial<AsfTbPeneira>) =>
    setSample((s) => ({ ...s, peneiras: s.peneiras.map((p, i) => (i === idx ? { ...p, ...patch } : p)) }));

  const betume = massaBetume(sample.massaAmostra, sample.massaAgregado);
  const teor = teorBetume(sample.massaAmostra, sample.massaAgregado);
  const granulo = useMemo(() => calcularGranulometria(sample), [sample]);
  const linhaPorAbertura = useMemo(
    () => new Map((granulo?.linhas ?? []).map((l) => [l.aberturaMm, l])),
    [granulo],
  );
  const massaInicialPadrao = massaInicialDoPeneiramento({ massaInicialGranulometria: null, massaAgregado: sample.massaAgregado });
  const paginas = useMemo(() => paginasDoLaudo(sample, ctx?.photos ?? []), [sample, ctx?.photos]);

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
        const dataUrl = await toPng(pages[i], {
          pixelRatio: 2.5,
          cacheBust: false,
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

      marcarAssinaturasNoPdf(pdf, pages);
      return pdf.output("blob");
    } finally {
      Object.assign(el.style, prevStyle);
    }
  };

  const nomeBase = () => (sample.workNumber || sample.os || "relatorio").toString().replace(/[^\w-]+/g, "_");

  const handleGeneratePdf = async () => {
    const toastId = toast.loading("Gerando PDF do relatório…");
    try {
      const blob = await buildReportPdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ASF-TB_${nomeBase()}.pdf`;
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
      const filename = `ASF-TB_${nomeBase()}_Rev-${String(rev).padStart(2, "0")}.pdf`;
      const saved = await saveVersion({ scopeId, rev, filename, size: blob.size, pdfBlob: blob });
      await refreshVersions();

      try {
        const resDrive = await syncRevision({
          scopeId,
          rev: saved.rev,
          pdfBlob: blob,
          pdfFilename: filename,
          sample,
          photos: ctx?.photos || [],
          ctxOs: ctx?.os,
          ctxAmostra: ctx?.amostra,
          ctxEnsaio: { tipo: "asf-tb", nome: sample.reportNumber },
          fotos: fotosParaDrive(),
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
            ensaio_tipo: "asf-tb",
            ensaio_nome: ASF_TB_NOME,
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
                Teor de Betume e Granulometria (ASF.TB) — Pré-visualização
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">A4 · 210 × 297 mm</DialogDescription>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto bg-[#525659] p-8 flex justify-center">
            <div className="flex flex-col items-center gap-8 shrink-0 pb-12">
              {paginas.map((p, i) => (
                <div key={i} className="w-[210mm] h-[297mm] shadow-2xl bg-white shrink-0 overflow-hidden">{p}</div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex h-full flex-col bg-background p-4 lg:p-6 pb-20">
        {/* Cabeçalho */}
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <EnsaioBadgesRow
                norms={["DNER-ME 053/94", "DNIT 412/2025-ME"]}
                status={rawSt}
                lastSavedAt={draftActivity.lastSavedAt}
                history={draftActivity.history}
                onFlushDraft={() => flushDraft(scopeId, { id: user?.id, name: displayName })}
              />
              <EnsaioTitleBlock
                title="Teor de Betume e Granulometria (ASF.TB)"
                description="Teor de betume por extrator centrífugo e granulometria do agregado extraído."
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
                {isAprovador && (
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
              <TabsTrigger value="ensaio"><Beaker className="mr-1.5 h-3.5 w-3.5" />Ensaio</TabsTrigger>
              <TabsTrigger value="versoes"><History className="mr-1.5 h-3.5 w-3.5" />Versões</TabsTrigger>
            </TabsList>
            <Button type="button" onClick={() => setReportOpen(true)} className="gap-2 shrink-0">
              <FileText className="h-4 w-4" /> Pré-visualizar Dados Atuais
            </Button>
          </div>

          <div className="flex-1 overflow-auto mt-4 pr-1">
            <TabsContent value="ensaio" className="m-0 space-y-4">
              {/* Teor de betume */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1.5">
                    <Beaker className="h-4 w-4 text-muted-foreground" /> Teor de betume — DNER-ME 053/94
                  </CardTitle>
                  <CardDescription className="text-xs">Extrator centrífugo; agregado seco em estufa até constância de peso.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-end gap-4">
                    <NumField label="Massa da amostra total [g]" value={sample.massaAmostra} onChange={(v) => updateSample("massaAmostra", v)} />
                    <NumField label="Agregado recuperado seco [g]" value={sample.massaAgregado} onChange={(v) => updateSample("massaAgregado", v)} />
                    <div>
                      <Label className="text-[9px] text-muted-foreground block">Solvente</Label>
                      <Input
                        list="asf-tb-solventes-escritorio"
                        value={sample.solvente}
                        onChange={(e) => updateSample("solvente", e.target.value)}
                        className="h-7 text-xs w-56"
                      />
                      <datalist id="asf-tb-solventes-escritorio">
                        {SOLVENTES_SUGERIDOS.map((s) => <option key={s} value={s} />)}
                      </datalist>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4">
                    <span>Betume extraído: <strong className="text-foreground">{fmt(betume, 1)} g</strong></span>
                    <span>Teor de betume: <strong className="text-foreground">{fmt(teor, 2)}%</strong></span>
                    {teor == null && sample.massaAmostra != null && sample.massaAgregado != null && (
                      <span className="text-destructive">O agregado recuperado não pode passar da massa da amostra.</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Granulometria */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-1.5 flex-wrap">
                    <Filter className="h-4 w-4 text-muted-foreground" /> Granulometria do agregado extraído — DNIT 412/2025-ME
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Série da Tabela A1. Desmarque as peneiras que não foram usadas; em branco conta como zero.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-end gap-4">
                    <NumField
                      label="Massa seca inicial [g]"
                      value={sample.massaInicialGranulometria}
                      placeholder={massaInicialPadrao != null ? `${fmt(massaInicialPadrao, 1)} (agregado)` : undefined}
                      onChange={(v) => updateSample("massaInicialGranulometria", v)}
                    />
                    <NumField
                      label="Após lavagem na 0,075 mm [g] (se lavou)"
                      value={sample.massaAposLavagem}
                      onChange={(v) => updateSample("massaAposLavagem", v)}
                    />
                  </div>

                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                          <th className="px-2 py-1 text-left font-medium">Usar</th>
                          <th className="px-2 py-1 text-left font-medium">Peneira</th>
                          <th className="px-2 py-1 text-right font-medium">Abertura (mm)</th>
                          <th className="px-2 py-1 text-left font-medium">Massa retida (g)</th>
                          <th className="px-2 py-1 text-right font-medium">% retida</th>
                          <th className="px-2 py-1 text-right font-medium">% acumulada</th>
                          <th className="px-2 py-1 text-right font-medium">% passante</th>
                          {sample.mostrarFaixa && <th className="px-2 py-1 text-right font-medium">Faixa {FAIXAS_DNIT_031[sample.faixa].nome}</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {sample.peneiras.map((p, i) => {
                          const l = p.ativa ? linhaPorAbertura.get(p.aberturaMm) : undefined;
                          const lim = sample.mostrarFaixa ? limiteNaPeneira(sample.faixa, p.aberturaMm) : null;
                          const fora = l && sample.mostrarFaixa ? foraDaFaixa(sample.faixa, p.aberturaMm, l.pctPassante) === true : false;
                          return (
                            <tr key={p.aberturaMm} className={p.ativa ? "" : "opacity-50"}>
                              <td className="px-2 py-1">
                                <Checkbox
                                  checked={p.ativa}
                                  onCheckedChange={(v) => updatePeneira(i, { ativa: v === true })}
                                  aria-label={`Usar a peneira ${p.nome}`}
                                />
                              </td>
                              <td className="px-2 py-1 font-medium">{p.nome}</td>
                              <td className="px-2 py-1 text-right">{formatarAbertura(p.aberturaMm)}</td>
                              <td className="px-2 py-1">
                                <NumInput
                                  value={p.retida}
                                  disabled={!p.ativa}
                                  ariaLabel={`Massa retida na peneira ${p.nome}`}
                                  onChange={(v) => updatePeneira(i, { retida: v })}
                                />
                              </td>
                              <td className="px-2 py-1 text-right">{l ? fmt(l.pctRetida, 1) : ""}</td>
                              <td className="px-2 py-1 text-right">{l ? fmt(l.pctRetidaAcumulada, 1) : ""}</td>
                              <td className={`px-2 py-1 text-right ${fora ? "text-destructive font-semibold" : ""}`}>
                                {l ? fmt(l.pctPassante, 1) : ""}
                              </td>
                              {sample.mostrarFaixa && (
                                <td className="px-2 py-1 text-right text-muted-foreground">{lim ? `${lim.min}–${lim.max}` : "—"}</td>
                              )}
                            </tr>
                          );
                        })}
                        <tr>
                          <td className="px-2 py-1" />
                          <td className="px-2 py-1 font-medium" colSpan={2}>Fundo</td>
                          <td className="px-2 py-1">
                            <NumInput value={sample.fundo} ariaLabel="Massa no fundo" onChange={(v) => updateSample("fundo", v)} />
                          </td>
                          <td className="px-2 py-1 text-right">{granulo ? fmt(granulo.fundo.pctRetida, 1) : ""}</td>
                          <td colSpan={sample.mostrarFaixa ? 3 : 2} />
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {granulo && (
                    <div className="text-xs flex flex-wrap gap-x-4 gap-y-1">
                      <Badge variant={granulo.dentroDaTolerancia ? "secondary" : "destructive"} className="text-[10px]">
                        Soma {fmt(granulo.somaMassas, 1)} g de {fmt(granulo.massaInicial, 1)} g · diferença {fmt(granulo.diferencaPct, 2)}%
                        {granulo.dentroDaTolerancia ? ` (≤ ${fmt(TOLERANCIA_SOMA_PCT, 1)}%)` : ` — acima de ${fmt(TOLERANCIA_SOMA_PCT, 1)}%`}
                      </Badge>
                      <span className="text-muted-foreground">
                        Dimensão máx. característica: <strong className="text-foreground">{granulo.dimensaoMaximaCaracteristica != null ? `${formatarAbertura(granulo.dimensaoMaximaCaracteristica)} mm` : "—"}</strong>
                      </span>
                      <span className="text-muted-foreground">
                        TNM: <strong className="text-foreground">{granulo.tamanhoNominalMaximo != null ? `${formatarAbertura(granulo.tamanhoNominalMaximo)} mm` : "—"}</strong>
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 border-t pt-3">
                    <label className="flex items-center gap-2 text-xs">
                      <Checkbox checked={sample.mostrarFaixa} onCheckedChange={(v) => updateSample("mostrarFaixa", v === true)} />
                      Mostrar a faixa granulométrica no laudo (DNIT 031/2024-ES)
                    </label>
                    <Select value={sample.faixa} onValueChange={(v) => updateSample("faixa", v as AsfTbFaixa)} disabled={!sample.mostrarFaixa}>
                      <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FAIXAS_DISPONIVEIS.map((f) => (
                          <SelectItem key={f} value={f}>Faixa {FAIXAS_DNIT_031[f].nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Fotos */}
              {ctx && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Registro Fotográfico</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PhotoUploader
                      title="Ensaio"
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
          {paginas}
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
