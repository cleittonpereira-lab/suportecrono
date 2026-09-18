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
import {
  Download, Gauge, Send, ShieldCheck, Plus, Trash2, CheckCircle2,
  Beaker, History, FileText,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { rasterizarRelatorioParaPdf, waitForOffscreenEl } from "@/lib/report-pdf";
import {
  listVersions,
  saveVersion,
  updateVersionContent,
  nextRev,
  deleteVersion,
  downloadVersion,
  type ReportVersion,
} from "@/features/asf-dap/report-versions";
import { sincronizarVersoesComDrive, useVersoesAoVivo } from "@/lib/revisoes-do-drive";
import { syncRevision, fetchDriveStatus } from "@/features/asf-dap/driveSync";
import { ReportVersionsPanel } from "@/components/report/ReportVersionsPanel";
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
import { fotosPublicadas } from "@/features/lab/photos";
import { BlockingOverlay } from "@/components/BlockingOverlay";
import { useOptionalLabEnsaio } from "@/features/lab/context";
import { labStore } from "@/features/lab/store";
import { EnsaioListByType } from "@/features/lab/components/EnsaioListByType";
import { ReportPage, type ReportSample } from "@/components/report/ReportShell";
import { EnsaioBadgesRow, EnsaioTitleBlock, AmostraSummaryCard, ResponsaveisBar } from "@/components/report/EnsaioReportHeader";
import { SampleEditDialog } from "@/components/SampleEditDialog";
import type { AsfDapSample, AsfDapCp } from "@/features/asf-dap/types";
import { seedAsfDapSample, newAsfDapCp } from "@/features/asf-dap/types";
import type { AsfDapTipoMistura, AsfDapFieldPayload } from "@/features/asf-dap/ui";
import {
  pctAguaAbsorvida, gmbDensa, meaFromGmb,
  volumeCaliper, meaAberta, gmbFromMea, vvPct,
} from "@/features/asf-dap/calc";
import { loadDraft, saveDraft, fetchRemoteDraft, flushDraft } from "@/features/asf-dap/draftStore";
import { listPendenciasDigitacao } from "@/lib/lab-pendencias.functions";
import { findMatchingPendencia } from "@/lib/pendencia-match";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Resultado calculado de um CP, conforme o ramo da norma aplicável (§7).
 *
 * Decisão do laboratório: mesmo quando a água absorvida ultrapassa 2% (o
 * limite da norma pra exigir o revestimento com filme PVC, §7.2), o Gmb
 * continua calculado pelo método padrão (Eq.6, A/(C−B)) — o laboratório não
 * faz o ensaio de revestimento com filme. `needsFilme` continua calculado
 * e exibido como aviso informativo (a água absorvida real do CP), mas não
 * bloqueia nem troca a fórmula usada.
 */
function calcCp(cp: AsfDapCp, tipoMistura: AsfDapTipoMistura, dpa: number | null) {
  if (tipoMistura === "aberta") {
    const V = volumeCaliper(cp.alturas, cp.diametros);
    const mea = cp.A != null && V != null ? meaAberta(cp.A, V) : null;
    const gmb = mea != null ? gmbFromMea(mea) : null;
    const vv = gmb != null && cp.gmm ? vvPct(gmb, cp.gmm) : null;
    return { pct: null, needsFilme: false, V, mea, gmb, vv };
  }
  const pct = cp.A != null && cp.B != null && cp.C != null ? pctAguaAbsorvida(cp.A, cp.B, cp.C) : null;
  const needsFilme = pct != null && pct > 2;
  const gmb = cp.A != null && cp.B != null && cp.C != null ? gmbDensa(cp.A, cp.B, cp.C) : null;
  const mea = gmb != null ? meaFromGmb(gmb) : null;
  const vv = gmb != null && cp.gmm ? vvPct(gmb, cp.gmm) : null;
  return { pct, needsFilme, V: null, mea, gmb, vv };
}

export const Route = createFileRoute("/_app/relatorio/asf-dap")({
  component: () => {
    const ctx = useOptionalLabEnsaio();
    return ctx?.ensaio ? <ASFPage /> : <EnsaioListByType tipo="asf-dap" />;
  },
  head: () => ({
    meta: [
      { title: "Densidade Aparente (ASF.DAP) — Suporte INFRA" },
      {
        name: "description",
        content: "Densidade relativa aparente e massa específica aparente de misturas asfálticas compactadas (DNIT 428/2022-ME).",
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
        className="h-7 text-xs w-20"
      />
    </div>
  );
}

/** Página única do laudo: identificação (via ReportHeader) + resultados por CP. */
function ASFDapReportPage({
  sample,
  photos: photosRecebidas = [],
}: {
  sample: AsfDapSample;
  photos?: import("@/features/lab/types").Photo[];
}) {
  const photos = fotosPublicadas(photosRecebidas);
  const results = sample.corposDeProva.map((cp) => calcCp(cp, sample.tipoMistura, sample.dpa));
  const avg = (vals: (number | null | undefined)[]) => {
    const nums = vals.filter((v): v is number => v != null && isFinite(v));
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  };
  const avgPct = avg(results.map((r) => r.pct));
  const avgGmb = avg(results.map((r) => r.gmb));
  const avgMea = avg(results.map((r) => r.mea));
  const avgVv = avg(results.map((r) => r.vv));
  const cpAvgH = sample.corposDeProva.map((cp) => avg(cp.alturas));
  const cpAvgD = sample.corposDeProva.map((cp) => avg(cp.diametros));
  const anyNeedsFilme = results.some((r) => r.needsFilme);
  return (
    <ReportPage
      sample={sample as unknown as ReportSample}
      page={1}
      total={1}
      title="DENSIDADE RELATIVA APARENTE E MASSA ESPECÍFICA APARENTE"
      norms={[
        {
          text: "DNIT 428/2022-ME - Pavimentação – Misturas asfálticas – Determinação da densidade relativa aparente e da massa específica aparente de corpos de prova compactados",
        },
      ]}
    >
      <div className="space-y-2 text-[10px] text-[#141414]">
        <div className="border border-[#141414]">
          <div className="rounded-t border-b border-[#141414] bg-[#141414]/10 px-2 py-1 text-[9.5px] font-bold uppercase text-[#141414] flex items-center justify-between">
            <span>Resultados por Corpo de Prova</span>
            <span>Mistura: {sample.tipoMistura === "densa" ? "Densa" : "Aberta (vazios ≥ 10%)"}</span>
          </div>
          <table className="w-full border-collapse">
            <thead>
              {sample.tipoMistura === "densa" ? (
                <tr className="bg-[#141414]/5 text-[8.5px] font-semibold">
                  <td className="border border-[#141414] px-1 py-0.5 text-center">CP</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">A (g)</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">B (g)</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">C (g)</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">Altura méd. (cm)</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">Diâm. méd. (cm)</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">Água abs. (%)</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">Gmb</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">MEa (g/cm³)</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">Vazios (%)</td>
                </tr>
              ) : (
                <tr className="bg-[#141414]/5 text-[8.5px] font-semibold">
                  <td className="border border-[#141414] px-1 py-0.5 text-center">CP</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">A (g)</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">Altura méd. (cm)</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">Diâm. méd. (cm)</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">V (cm³)</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">Gmb</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">MEa (g/cm³)</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center">Vazios (%)</td>
                </tr>
              )}
            </thead>
            <tbody>
              {sample.corposDeProva.map((cp, i) => {
                const r = results[i];
                return sample.tipoMistura === "densa" ? (
                  <tr key={cp.id}>
                    <td className="border border-[#141414] px-1 py-0.5 text-center">{cp.label || `CP${i + 1}`}</td>
                    <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(cp.A, 1)}</td>
                    <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(cp.B, 1)}</td>
                    <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(cp.C, 1)}</td>
                    <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(cpAvgH[i], 2)}</td>
                    <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(cpAvgD[i], 2)}</td>
                    <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(r.pct, 1)}</td>
                    <td className="border border-[#141414] px-1 py-0.5 text-center font-medium">{fmt(r.gmb, 4)}</td>
                    <td className="border border-[#141414] px-1 py-0.5 text-center font-medium">{fmt(r.mea, 4)}</td>
                    <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(r.vv, 1)}</td>
                  </tr>
                ) : (
                  <tr key={cp.id}>
                    <td className="border border-[#141414] px-1 py-0.5 text-center">{cp.label || `CP${i + 1}`}</td>
                    <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(cp.A, 1)}</td>
                    <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(cpAvgH[i], 2)}</td>
                    <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(cpAvgD[i], 2)}</td>
                    <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(r.V, 2)}</td>
                    <td className="border border-[#141414] px-1 py-0.5 text-center font-medium">{fmt(r.gmb, 4)}</td>
                    <td className="border border-[#141414] px-1 py-0.5 text-center font-medium">{fmt(r.mea, 4)}</td>
                    <td className="border border-[#141414] px-1 py-0.5 text-center">{fmt(r.vv, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {sample.mostrarDimensoesDetalhadas && (
          <div className="border border-[#141414]">
            <div className="rounded-t border-b border-[#141414] bg-[#141414]/10 px-2 py-1 text-center text-[9.5px] font-bold uppercase text-[#141414]">
              Dimensões dos Corpos de Prova (leituras individuais, paquímetro)
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#141414]/5 text-[8px] font-semibold">
                  <td className="border border-[#141414] px-1 py-0.5 text-center" rowSpan={2}>CP</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center" colSpan={4}>Altura (cm)</td>
                  <td className="border border-[#141414] px-1 py-0.5 text-center" colSpan={4}>Diâmetro (cm)</td>
                </tr>
                <tr className="bg-[#141414]/5 text-[8px] font-semibold">
                  {[1, 2, 3, 4].map((n) => <td key={`h${n}`} className="border border-[#141414] px-1 py-0.5 text-center">{n}</td>)}
                  {[1, 2, 3, 4].map((n) => <td key={`d${n}`} className="border border-[#141414] px-1 py-0.5 text-center">{n}</td>)}
                </tr>
              </thead>
              <tbody>
                {sample.corposDeProva.map((cp, i) => (
                  <tr key={cp.id}>
                    <td className="border border-[#141414] px-1 py-0.5 text-center font-semibold">{cp.label || `CP${i + 1}`}</td>
                    {cp.alturas.map((v, j) => <td key={`h${j}`} className="border border-[#141414] px-1 py-0.5 text-center">{fmt(v, 2)}</td>)}
                    {cp.diametros.map((v, j) => <td key={`d${j}`} className="border border-[#141414] px-1 py-0.5 text-center">{fmt(v, 2)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-[#141414]/40 px-2 py-1 text-[8px] text-[#141414]/70 leading-tight">
              Leituras individuais mostradas por se tratar de corpo(s) de prova não uniforme(s) — a variação entre leituras fica visível pra auditoria do resultado, além da média já usada no cálculo.
            </div>
          </div>
        )}

        <div className="border border-[#141414]">
          <div className="rounded-t border-b border-[#141414] bg-[#141414]/10 px-2 py-1 text-center text-[9.5px] font-bold uppercase text-[#141414]">
            Memória de Cálculo
          </div>
          <div className="space-y-1.5 p-2 text-[8.5px] leading-tight">
            {sample.corposDeProva.map((cp, i) => {
              const r = results[i];
              return (
                <div key={cp.id} className="border-b border-[#141414]/20 pb-1 last:border-0 last:pb-0">
                  <span className="font-semibold">{cp.label || `CP${i + 1}`}: </span>
                  {sample.tipoMistura === "densa" ? (
                    cp.A != null && cp.B != null && cp.C != null ? (
                      <>
                        Gmb = A/(C−B) = {fmt(cp.A, 2)}/({fmt(cp.C, 2)}−{fmt(cp.B, 2)}) = {fmt(cp.A, 2)}/{fmt((cp.C ?? 0) - (cp.B ?? 0), 2)} = <b>{fmt(r.gmb, 3)}</b>
                        {" · "}
                        %h = 100×(C−A)/(C−B) = 100×({fmt(cp.C, 2)}−{fmt(cp.A, 2)})/({fmt(cp.C, 2)}−{fmt(cp.B, 2)}) = <b>{fmt(r.pct, 1)}%</b>
                      </>
                    ) : (
                      <span className="text-[#141414]/50">dados insuficientes (A, B, C)</span>
                    )
                  ) : cp.A != null && r.V != null ? (
                    <>
                      MEa = A/V = {fmt(cp.A, 2)}/{fmt(r.V, 2)} = <b>{fmt(r.mea, 4)} g/cm³</b>
                      {" · "}Gmb = MEa/0,9971 = <b>{fmt(r.gmb, 3)}</b>
                    </>
                  ) : (
                    <span className="text-[#141414]/50">dados insuficientes (A, dimensões)</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {sample.tipoMistura === "densa" && sample.dpa != null && (
          <div className="border border-[#141414] px-2 py-1.5 flex items-center justify-between">
            <span className="text-[9.5px] font-semibold uppercase">Densidade do filme PVC (Dpa)</span>
            <span className="text-[11px] font-bold">{fmt(sample.dpa, 3)}</span>
          </div>
        )}

        <div className="border border-[#141414]">
          <div className="rounded-t border-b border-[#141414] bg-[#141414]/10 px-2 py-1 text-center text-[9.5px] font-bold uppercase text-[#141414]">
            Médias / Índices Calculados
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#141414]/5 text-[8.5px] font-semibold">
                <td className="border border-[#141414] px-1 py-0.5 text-center">Água abs. média (%)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Gmb médio</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">MEa médio (g/cm³)</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center">Vazios médio (%)</td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-[#141414] px-1 py-0.5 text-center font-medium">{fmt(avgPct, 1)}</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center font-medium">{fmt(avgGmb, 4)}</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center font-medium">{fmt(avgMea, 4)}</td>
                <td className="border border-[#141414] px-1 py-0.5 text-center font-medium">{fmt(avgVv, 1)}</td>
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
                <div key={p.id} className="aspect-[3/4] overflow-hidden rounded border border-[#141414]/40 bg-white">
                  <img
                    src={p.url || p.dataUrl}
                    alt="Registro fotográfico"
                    crossOrigin="anonymous"
                    className="h-full w-full object-cover"
                  />
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
            {sample.tipoMistura === "densa" ? (
              <>
                <div><b>A</b> — massa do corpo de prova seca ao ar (g)</div>
                <div><b>B</b> — massa do corpo de prova imersa em água (g)</div>
                <div><b>C</b> — massa do corpo de prova saturada, superfície seca (g)</div>
                <div><b>Água abs.</b> — % de água absorvida (§6.1.4), calculada pra todos os CPs pelo método padrão (item abaixo)</div>
              </>
            ) : (
              <div><b>A</b> — massa do corpo de prova seca ao ar (g) · <b>V</b> — volume do corpo de prova, obtido por paquímetro (cm³)</div>
            )}
            <div><b>Gmb</b> — densidade relativa aparente (bulk specific gravity), adimensional</div>
            <div><b>MEa</b> — massa específica aparente (g/cm³) = 0,9971 × Gmb</div>
            <div><b>Vazios (Vv)</b> — volume de vazios (%), calculado a partir do Gmm informado (§7.4)</div>
          </div>
          <div className="border-t border-[#141414]/40 px-2 py-1 text-[8px] text-[#141414]/70 leading-tight">
            Gmb = A/(C−B) (mistura densa) ou MEa = A/V (mistura aberta), conforme DNIT 428/2022-ME.
            {anyNeedsFilme && " Gmb calculado pelo método padrão (A/(C−B)) mesmo nos CPs com água absorvida acima de 2% — sem o revestimento com filme PVC do §7.2."}
          </div>
        </div>
      </div>
    </ReportPage>
  );
}

export function ASFPage() {
  const ctx = useOptionalLabEnsaio();
  const { lookup } = useCadastroByOs();
  const cad = ctx?.os?.numero ? lookup(ctx.os.numero) : undefined;
  const { displayName, user, role, profile } = useAuth();
  const currentUserName = displayName || user?.email?.split("@")[0] || "Cleitton Pereira";
  const isAdmin = role === "admin";
  // Mesma regra do servidor (lib/papeis.ts).
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

  const initialSample: AsfDapSample = useMemo(() => {
    const base = seedAsfDapSample();
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

  const [sample, setSample] = useState<AsfDapSample>(() =>
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
        ctxEnsaio: { tipo: "asf-dap", nome: sample.reportNumber },
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
      ensaioTipo: "asf-dap",
    })
      .then((remote) => {
        if (remote?.sample) setSample((s) => ({ ...s, ...remote.sample }));
        setRemoteLoaded(true);
      })
      .catch(() => setRemoteLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeId]);

  // Pré-preenchimento a partir da digitalização de campo (Fase 5) — só na
  // primeira carga e só se ainda não houver corpos de prova preenchidos,
  // pra não sobrescrever edição manual já feita no escritório.
  useEffect(() => {
    if (!remoteLoaded || prefillCheckedRef.current || !ctx) return;
    prefillCheckedRef.current = true;
    const jaTemDados = sample.corposDeProva.some((cp) => cp.A != null || cp.B != null || cp.C != null);
    // "Já importei fotos" é um sinal PERSISTENTE (sample.fotosBancadaImportadas),
    // não "ctx.photos está vazio agora" — apagar TODAS as fotos no escritório
    // zerava ctx.photos, e a próxima abertura achava "nunca trouxe foto
    // nenhuma" e reimportava as mesmas da pendência: a exclusão nunca "pegava"
    // de vez. Também conta como "já importou" já ter QUALQUER foto agora
    // (ensaios de antes desta correção, sem o sinalizador ainda gravado).
    const jaTemFotos = sample.fotosBancadaImportadas === true || (ctx.photos ?? []).length > 0;
    if (jaTemDados && jaTemFotos) return;
    let cancelled = false;
    (async () => {
      try {
        const pendencias = await listPendenciasDigitacao();
        const pend = findMatchingPendencia(pendencias, {
          os: ctx.os.numero,
          amostra: ctx.amostra.reportNumber || ctx.amostra.code,
          tipo: "asf-dap",
        });
        const fp = pend?.payload as unknown as AsfDapFieldPayload | undefined;
        if (cancelled || !fp) return;
        let preencheu = false;
        if (!jaTemDados && fp.corposDeProva?.length) {
          setSample((prev) => ({
            ...prev,
            tipoMistura: fp.tipoMistura || prev.tipoMistura,
            dpa: fp.dpa ?? prev.dpa,
            dpaCalibracao: fp.dpaCalibracao ?? prev.dpaCalibracao,
            corposDeProva: fp.corposDeProva.map((cp) => ({
              id: cp.id,
              label: cp.label,
              A: cp.A, B: cp.B, C: cp.C, E: cp.E, F: cp.F,
              alturas: cp.alturas, diametros: cp.diametros,
              gmm: cp.gmm,
            })),
          }));
          preencheu = true;
        }
        // Fotos tiradas na bancada (celular) ficam só no payload da pendência —
        // sem isto, nunca chegavam ao relatório do escritório. Marca como
        // importada mesmo sem nenhuma foto pra trazer, pra nunca mais tentar.
        if (!jaTemFotos) {
          if (Array.isArray(fp.fotos) && fp.fotos.length > 0) {
            for (const foto of fp.fotos) {
              ctx.addPhoto({ dataUrl: foto.dataUrl, kind: "outro", caption: foto.caption });
            }
            preencheu = true;
          }
          setSample((prev) => ({ ...prev, fotosBancadaImportadas: true }));
        }
        if (preencheu) toast.success("Dados pré-preenchidos da digitalização de campo — confira antes de continuar.");
      } catch (err) {
        console.warn("[ASF.DAP prefill] Falha:", err);
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
    // Depende só de `sample`/`ctx?.photos` (valores de conteúdo), NUNCA do
    // objeto `ctx` inteiro — o LabEnsaioProvider recria `ctx` a cada render,
    // e como esse efeito também regrava `ensaio.payload`, depender de `ctx`
    // formaria um laço infinito (classe de bug já confirmada em outros módulos).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteLoaded, scopeId, sample, ctx?.photos]);

  const updateSample = <K extends keyof AsfDapSample>(k: K, v: AsfDapSample[K]) =>
    setSample((s) => ({ ...s, [k]: v }));
  const updateCp = (idx: number, patch: Partial<AsfDapCp>) =>
    setSample((s) => ({ ...s, corposDeProva: s.corposDeProva.map((c, i) => (i === idx ? { ...c, ...patch } : c)) }));
  const addCp = () =>
    setSample((s) => ({ ...s, corposDeProva: [...s.corposDeProva, newAsfDapCp(`CP${s.corposDeProva.length + 1}`)] }));
  const removeCp = (idx: number) => {
    if (sample.corposDeProva.length <= 1) {
      toast.error("Deve haver ao menos um corpo de prova");
      return;
    }
    setSample((s) => ({ ...s, corposDeProva: s.corposDeProva.filter((_, i) => i !== idx) }));
  };

  const results = useMemo(
    () => sample.corposDeProva.map((cp) => calcCp(cp, sample.tipoMistura, sample.dpa)),
    [sample.corposDeProva, sample.tipoMistura, sample.dpa],
  );

  /**
   * Gera o PDF pelo módulo único de captura (lib/report-pdf.ts), que espera
   * cada foto carregar de verdade antes de capturar (com retentativa e
   * timeout) — a implementação antiga (toPng direto + 200ms fixo) capturava
   * o que estivesse na tela naquele instante; uma foto recém-adicionada ou
   * ainda vindo do Drive saía em branco/desatualizada no PDF, mesmo já
   * visível no editor. Foto que falhar interrompe a geração (é o laudo
   * oficial) em vez de sair silenciosamente sem a imagem.
   */
  const buildReportPdfBlob = async (): Promise<Blob> => {
    const el = await waitForOffscreenEl(() => reportRef.current, "Container do relatório não encontrado.");
    const { blob, folhasCortadas } = await rasterizarRelatorioParaPdf(el, {
      fotosObrigatorias: true,
    });
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
      a.download = `ASF-DAP_${base}.pdf`;
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
      // A Revisão impressa no cabeçalho/rodapé (sample.revision) acompanha o
      // número da revisão do laudo — sem isto, ficava travada no valor
      // digitado manualmente (ex.: "0"), mesmo já sendo a Rev-01, Rev-02...
      // flushSync força o re-render ANTES de capturar o PDF, e `sampleAtualizado`
      // (não a `sample` capturada no fechamento) é o que vai pro rascunho/Drive.
      const rev = await nextRev(scopeId);
      const sampleAtualizado = { ...sample, typedBy: currentUserName, revision: String(rev) };
      flushSync(() => setSample(sampleAtualizado));
      const blob = await buildReportPdfBlob();
      const base = (sampleAtualizado.workNumber || sampleAtualizado.os || "relatorio").toString().replace(/[^\w-]+/g, "_");
      const filename = `ASF-DAP_${base}_Rev-${String(rev).padStart(2, "0")}.pdf`;
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
          sample: sampleAtualizado,
          photos: ctx?.photos || [],
          ctxOs: ctx?.os,
          ctxAmostra: ctx?.amostra,
          ctxEnsaio: { tipo: "asf-dap", nome: sampleAtualizado.reportNumber },
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
            os_numero: sampleAtualizado.os,
            os_cliente: sampleAtualizado.client,
            amostra_code: sampleAtualizado.reportNumber || sampleAtualizado.code,
            ensaio_tipo: "asf-dap",
            ensaio_nome: "Densidade Aparente (ASF.DAP)",
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

  /**
   * Atualiza o PDF da revisão JÁ enviada com os dados atuais da tela — sem
   * abrir uma revisão nova nem mexer no status/fluxo. Para quando o
   * verificador/aprovador corrige um dado (obra, furo, amostra) durante a
   * verificação e quer que a correção entre no PDF oficial, em vez de ficar
   * só visível na tela.
   */
  const handleAtualizarPdfAtual = async () => {
    if (saveBusy) return;
    setSaveBusy(true);
    const tid = toast.loading("Atualizando o PDF desta revisão…");
    try {
      const revAtual = approvals[0]?.rev ?? 0;
      // Mesmo cuidado do handleSaveVersion: garante que a Revisão impressa
      // bate com a revisão real do laudo, mesmo que tenha ficado desatualizada.
      const sampleAtualizado = { ...sample, revision: String(revAtual) };
      flushSync(() => setSample(sampleAtualizado));
      const blob = await buildReportPdfBlob();
      const base = (sampleAtualizado.workNumber || sampleAtualizado.os || "relatorio").toString().replace(/[^\w-]+/g, "_");
      const filename = `ASF-DAP_${base}_Rev-${String(revAtual).padStart(2, "0")}.pdf`;
      const atual = versions.find((v) => v.rev === revAtual);
      if (atual) {
        await updateVersionContent(atual.id, { pdfBlob: blob, size: blob.size, filename });
      } else {
        await saveVersion({ scopeId, rev: revAtual, filename, size: blob.size, pdfBlob: blob });
      }
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

        await syncRevision({
          scopeId,
          rev: revAtual,
          pdfBlob: blob,
          pdfFilename: filename,
          sample: sampleAtualizado,
          photos: ctx?.photos || [],
          ctxOs: ctx?.os,
          ctxAmostra: ctx?.amostra,
          ctxEnsaio: { tipo: "asf-dap", nome: sampleAtualizado.reportNumber },
          fotos,
          // Substitui deliberadamente o PDF da MESMA revisão já emitida.
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
                Densidade Aparente (ASF.DAP) — Pré-visualização
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">A4 · 210 × 297 mm</DialogDescription>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto bg-[#525659] p-8 flex justify-center">
            <div className="flex flex-col items-center gap-8 shrink-0 pb-12">
              <div className="w-[210mm] h-[297mm] shadow-2xl bg-white shrink-0 overflow-hidden">
                <ASFDapReportPage sample={sample} photos={ctx?.photos ?? []} />
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
                norms={["DNIT 428/2022-ME"]}
                status={rawSt}
                lastSavedAt={draftActivity.lastSavedAt}
                history={draftActivity.history}
                onFlushDraft={() => flushDraft(scopeId, { id: user?.id, name: displayName })}
              />
              <EnsaioTitleBlock
                title="Densidade Aparente (ASF.DAP)"
                description="Densidade relativa aparente e massa específica aparente de misturas asfálticas compactadas."
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

        {/* Abas Principais de Edição */}
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
        {/* Tipo de mistura */}
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tipo de mistura</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button
              type="button"
              variant={sample.tipoMistura === "densa" ? "default" : "outline"}
              size="sm"
              onClick={() => updateSample("tipoMistura", "densa")}
            >
              Densa (padrão) — §6.1/6.2
            </Button>
            <Button
              type="button"
              variant={sample.tipoMistura === "aberta" ? "default" : "outline"}
              size="sm"
              onClick={() => updateSample("tipoMistura", "aberta")}
            >
              Aberta (vazios ≥ 10%) — §6.3
            </Button>
          </CardContent>
          <CardContent className="pt-0">
            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={sample.mostrarDimensoesDetalhadas ?? true}
                onCheckedChange={(v) => updateSample("mostrarDimensoesDetalhadas", !!v)}
              />
              <span>
                Mostrar no relatório as 4 leituras de altura e diâmetro de cada CP (não só a média) — útil quando o
                CP não é uniforme
              </span>
            </label>
          </CardContent>
        </Card>

        {/* Corpos de prova */}
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-2">
              <span className="flex items-center gap-1.5">
                <Gauge className="h-4 w-4 text-muted-foreground" /> Corpos de Prova
              </span>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={addCp}>
                <Plus className="h-3.5 w-3.5" /> Adicionar CP
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sample.corposDeProva.map((cp, i) => {
              const r = results[i];
              return (
                <div key={cp.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <TxtField label="Identificação do CP" value={cp.label ?? ""} onChange={(v) => updateCp(i, { label: v })} />
                    <Button variant="ghost" size="icon" className="mt-4 shrink-0" onClick={() => removeCp(i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {sample.tipoMistura === "densa" ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <NumField label="A · massa seca ao ar [g]" value={cp.A} onChange={(v) => updateCp(i, { A: v })} />
                        <NumField label="B · massa imersa [g]" value={cp.B} onChange={(v) => updateCp(i, { B: v })} />
                        <NumField label="C · massa saturada sup. seca [g]" value={cp.C} onChange={(v) => updateCp(i, { C: v })} />
                      </div>
                      {r.pct != null && (
                        <Badge variant={r.needsFilme ? "outline" : "secondary"} className="text-[10px]">
                          Água absorvida: {r.pct.toFixed(1)}% {r.needsFilme ? "— acima de 2% (Gmb calculado pelo método padrão)" : ""}
                        </Badge>
                      )}
                    </>
                  ) : (
                    <NumField label="A · massa seca ao ar [g]" value={cp.A} onChange={(v) => updateCp(i, { A: v })} />
                  )}

                  <div className="pt-1 border-t mt-2">
                    <Label className="text-[10px] text-muted-foreground">Alturas (paquímetro) [cm]</Label>
                    <div className="flex flex-wrap gap-2">
                      {cp.alturas.map((v, idx) => (
                        <NumField key={idx} label={`H${idx + 1}`} value={v} onChange={(nv) => {
                          const alturas = [...cp.alturas] as AsfDapCp["alturas"];
                          alturas[idx] = nv;
                          updateCp(i, { alturas });
                        }} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Diâmetros (paquímetro) [cm]</Label>
                    <div className="flex flex-wrap gap-2">
                      {cp.diametros.map((v, idx) => (
                        <NumField key={idx} label={`D${idx + 1}`} value={v} onChange={(nv) => {
                          const diametros = [...cp.diametros] as AsfDapCp["diametros"];
                          diametros[idx] = nv;
                          updateCp(i, { diametros });
                        }} />
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 pt-1 border-t mt-2">
                    <NumField label="Gmm — cruzamento de vazios (opcional)" value={cp.gmm} onChange={(v) => updateCp(i, { gmm: v })} />
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4">
                      <span>Gmb: <strong className="text-foreground">{fmt(r.gmb, 4)}</strong></span>
                      <span>MEa: <strong className="text-foreground">{fmt(r.mea, 4)} g/cm³</strong></span>
                      {r.vv != null && <span>Vazios: <strong className="text-foreground">{fmt(r.vv, 1)}%</strong></span>}
                    </div>
                  </div>
                </div>
              );
            })}
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
          <ASFDapReportPage sample={sample} photos={ctx?.photos ?? []} />
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
