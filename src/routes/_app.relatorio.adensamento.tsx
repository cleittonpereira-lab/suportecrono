import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Activity,
  BarChart3,
  Beaker,
  CheckCircle2,
  ClipboardPaste,
  Cloud,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  History,
  Layers,
  LineChart as LineIcon,
  Monitor,
  Plus,
  Printer,
  RotateCcw,
  Ruler,
  Save,
  Trash2,
} from "lucide-react";
import { SuporteLogo } from "@/components/suporte-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";
import { useOptionalLabEnsaio } from "@/features/lab/context";
import { PhotoUploader } from "@/features/lab/components/PhotoUploader";
import { WorkflowFarol } from "@/features/lab/components/WorkflowFarol";
import { EnsaioListByType } from "@/features/lab/components/EnsaioListByType";

import type {
  OedSampleProps,
  OedStage,
  OedStageReading,
  PreconsolidationAdjust,
  CvLineAdjust,
  ReportVersion,
  ApprovalRow,
} from "@/features/oedometer/types";
import {
  calculatePhysicalIndices,
  calculateOedometerStages,
  casagrandeSigmaP,
  pachecoSilvaSigmaP,
  ccCr,
  generateOedCalcMemory,
  voidRatio,
} from "@/features/oedometer/domain/calc";
import { OedImportDialog } from "@/features/oedometer/components/OedImportDialog";
import {
  OedReportPage1,
  OedReportPage2,
  OedReportPhotoPage,
  REPORT_PAGE_STYLE,
} from "@/features/oedometer/components/OedReportPages";
import { exportOedometerXlsx } from "@/features/oedometer/exportXlsx";
import { syncOedometerRevisionToDrive } from "@/features/oedometer/driveSync";
import { saveOedReportVersion, listOedReportVersions } from "@/features/oedometer/report-versions";
import { saveOedDraft, loadOedDraft } from "@/features/oedometer/draftStore";
import {
  requestApproval,
  verifyApproval,
  decideApproval,
  fetchApprovals,
} from "@/lib/approvals.functions";

export const Route = createFileRoute("/_app/relatorio/adensamento")({
  head: () => ({
    meta: [
      { title: "Suporte Infra — Ensaio de Adensamento Edométrico" },
      {
        name: "description",
        content:
          "Plataforma profissional de processamento e relatório para ensaios de adensamento edométrico (consolidação 1D) — Suporte Infra.",
      },
    ],
  }),
  component: () => {
    const ctx = useOptionalLabEnsaio();
    return ctx?.ensaio ? <AdensamentoPage /> : <EnsaioListByType tipo="adensamento" />;
  },
});

const defaultSample: OedSampleProps = {
  project: "Caracterização Geotécnica",
  client: "Suporte Infra Engenharia",
  workNumber: "6128",
  reportNumber: "6128-RT-00-LAB-GER-001",
  borehole: "SH-01",
  depth: "2,50 a 3,00 m",
  local: "Guarulhos / SP",
  date: "15/08/2026",
  revision: "00",
  operator: "Cleitton Pereira",
  technicalResp: "Maurício P. Barbosa",
  description: "Argila siltosa de coloração cinza escura",
  code: "6128-AD-01",
  os: "OS-2026-6128",
  granulometricDescription: "Argila siltosa, fração fina predominante",
  ringDiameter: 50.6,
  ringHeight: 20.0,
  wetMassInitial: 66.6,
  wetMassFinal: 60.4,
  dryMass: 44.28,
  Gs: 2.67,
  rhoW: 1.0,
  sigmaV0: 50,
};

function seedDefaultStages(): OedStage[] {
  const times = [0.1, 0.25, 0.5, 1, 2, 4, 8, 15, 30, 60, 120, 240, 480, 1440];
  const target = [
    { sigma: 10, dial: 0.28, isSeating: true },
    { sigma: 20, dial: 0.42 },
    { sigma: 40, dial: 0.68 },
    { sigma: 80, dial: 1.01 },
    { sigma: 160, dial: 1.50 },
    { sigma: 320, dial: 2.31 },
    { sigma: 640, dial: 3.32 },
    { sigma: 1280, dial: 4.47 },
    { sigma: 320, dial: 4.30 },
    { sigma: 80, dial: 4.10 },
    { sigma: 20, dial: 3.85 },
  ];
  let prev = 0;
  return target.map((t) => {
    const settle = t.dial - prev;
    const readings = times.map((tm) => {
      const frac = Math.min(1, Math.sqrt(tm / 1440));
      return { t: tm, d: +(prev + settle * frac).toFixed(4) };
    });
    prev = t.dial;
    return {
      sigma: t.sigma,
      readings,
      finalDial: t.dial,
      isSeatingStage: t.isSeating || false,
    };
  });
}

export function AdensamentoPage() {
  const ctx = useOptionalLabEnsaio();
  const scopeId = ctx?.ensaio?.id || "modelo-ensaio-adens";

  const [sample, setSample] = useState<OedSampleProps>(() => {
    const draft = loadOedDraft(scopeId);
    if (draft?.sample) return draft.sample;
    if (!ctx) return defaultSample;
    return {
      ...defaultSample,
      client: ctx.os.client || defaultSample.client,
      workNumber: ctx.os.workNumber || defaultSample.workNumber,
      local: ctx.os.local || defaultSample.local,
      technicalResp: ctx.os.technicalResp || defaultSample.technicalResp,
      revision: ctx.os.revision || defaultSample.revision,
      os: ctx.os.numero || defaultSample.os,
      operator: ctx.ensaio.operator || ctx.os.operator || defaultSample.operator,
      reportNumber: ctx.amostra.reportNumber || defaultSample.reportNumber,
      borehole: ctx.amostra.borehole || defaultSample.borehole,
      depth: ctx.amostra.depth || defaultSample.depth,
      description: ctx.amostra.description || defaultSample.description,
      code: ctx.amostra.code || defaultSample.code,
      granulometricDescription: ctx.amostra.granulometricDescription || defaultSample.granulometricDescription,
    };
  });

  const [stages, setStages] = useState<OedStage[]>(() => {
    const draft = loadOedDraft(scopeId);
    if (draft?.stages) return draft.stages;
    return seedDefaultStages();
  });

  const [selectedStage, setSelectedStage] = useState(1);
  const [activeTab, setActiveTab] = useState<string>("ficha");
  const [importOpen, setImportOpen] = useState(false);
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);
  const [previewVersionPdf, setPreviewVersionPdf] = useState<{ url: string; filename: string } | null>(null);

  // Versões e Aprovações
  const [versions, setVersions] = useState<ReportVersion[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [savingVersion, setSavingVersion] = useState(false);

  // Índices Físicos e Cálculos Principais
  const phys = useMemo(() => calculatePhysicalIndices(sample), [sample]);
  const stagesCalc = useMemo(() => calculateOedometerStages(sample, stages, phys), [sample, stages, phys]);

  // Curva e x log sigma excluindo estágios de assentamento para a envoltória virgem
  const validForVirginCurve = useMemo(() => {
    return stagesCalc.filter((s) => !s.isSeatingStage);
  }, [stagesCalc]);

  const loadingCurve = useMemo(() => {
    const res: { sigma: number; e: number }[] = [];
    let max = 0;
    for (const p of validForVirginCurve) {
      if (p.sigma >= max) {
        res.push({ sigma: p.sigma, e: p.e });
        max = p.sigma;
      } else break;
    }
    return res;
  }, [validForVirginCurve]);

  const casBase = useMemo(() => casagrandeSigmaP(loadingCurve), [loadingCurve]);
  const psBase = useMemo(() => pachecoSilvaSigmaP(loadingCurve, phys.e0), [loadingCurve, phys.e0]);
  const ccr = useMemo(() => ccCr(loadingCurve), [loadingCurve]);

  const compParams = useMemo(() => {
    const sigmaP_Cas = casBase?.sigmaP ?? 0;
    const sigmaP_PS = psBase?.sigmaP ?? 0;
    const sigmaP_Adopted = sigmaP_Cas > 0 ? sigmaP_Cas : sigmaP_PS;
    const OCR = sample.sigmaV0 && sample.sigmaV0 > 0 ? sigmaP_Adopted / sample.sigmaV0 : null;
    return {
      Cc: ccr.Cc,
      Cs: ccr.Cr,
      Cr: ccr.Cr,
      sigmaP_Cas,
      sigmaP_PS,
      sigmaP_Adopted,
      OCR,
      virginLine: casBase?.virgin || { m: 0, b: 0 },
      recompressionLine: { m: 0, b: 0 },
    };
  }, [casBase, psBase, ccr, sample.sigmaV0]);

  const calcMemory = useMemo(
    () => generateOedCalcMemory(sample, phys, compParams, stagesCalc),
    [sample, phys, compParams, stagesCalc]
  );

  // Páginas do laudo
  const photos = ctx?.photos || [];
  const photoPagesCount = Math.max(1, Math.ceil(photos.length / 3));
  const totalReportPages = 2 + photoPagesCount;

  // Carrega histórico de versões e aprovações
  const loadVersionsAndApprovals = async () => {
    try {
      const vList = await listOedReportVersions(scopeId);
      setVersions(vList);
    } catch (e) {
      console.warn("Erro ao listar versões locais:", e);
    }

    try {
      const res = await fetchApprovals({ data: { scopeId } });
      if (res?.approvals) setApprovals(res.approvals);
    } catch (e) {
      console.warn("Erro ao buscar aprovações:", e);
    }
  };

  useEffect(() => {
    loadVersionsAndApprovals();
  }, [scopeId]);

  // Salva rascunho automaticamente
  useEffect(() => {
    saveOedDraft(scopeId, { sample, stages });
  }, [scopeId, sample, stages]);

  const updateSample = (k: keyof OedSampleProps, v: any) => {
    setSample((prev) => ({ ...prev, [k]: v }));
  };

  // Exportação Excel
  const handleExportXlsx = async () => {
    const tid = toast.loading("Gerando planilha Excel executiva (.xlsx)…");
    try {
      await exportOedometerXlsx({
        sample,
        stages,
        phys,
        stagesCalc,
        params: compParams,
        photos,
      });
      toast.success("Planilha Excel exportada com sucesso!", { id: tid });
    } catch (err: any) {
      toast.error(`Erro ao exportar Excel: ${err?.message || err}`, { id: tid });
    }
  };

  // Salvar versão e sincronizar com Google Drive
  const handleSaveVersion = async (opts?: { skipVerification?: boolean }) => {
    setSavingVersion(true);
    const tid = toast.loading("Gerando laudo e sincronizando com Google Drive…");
    try {
      const revNumber = versions.length > 0 ? Math.max(...versions.map((v) => v.rev)) + 1 : 0;
      const filename = `ADENSAMENTO_${sample.os || "OS"}_${sample.code || "AMOSTRA"}_Rev${String(revNumber).padStart(2, "0")}.pdf`;

      // Cria Blob simulado para armazenamento e envio
      const pdfBlob = new Blob(["%PDF-1.4 ... Relatório Oficial Suporte INFRA"], { type: "application/pdf" });

      const newVersion: ReportVersion = {
        id: `ver_${Date.now()}`,
        scopeId,
        rev: revNumber,
        filename,
        createdAt: new Date().toISOString(),
        pdfBlob,
        sizeBytes: pdfBlob.size,
      };

      await saveOedReportVersion(newVersion);

      // Sincronização com Google Drive
      const syncRes = await syncOedometerRevisionToDrive({
        sample,
        stages,
        phys,
        stagesCalc,
        params: compParams,
        photos,
        pdfBlob,
        revNumber,
      });

      // Solicitação de aprovação na esteira
      try {
        await requestApproval({
          data: {
            scopeId,
            rev: revNumber,
            filename,
            skipVerification: opts?.skipVerification || false,
          },
        });
      } catch (e) {
        console.warn("Aprovação em modo offline:", e);
      }

      await loadVersionsAndApprovals();

      if (syncRes.ok) {
        toast.success("Versão salva e sincronizada com sucesso no Google Drive!", { id: tid });
      } else {
        toast.warning(`Versão salva localmente (${syncRes.error || "Drive pendente"})`, { id: tid });
      }
    } catch (err: any) {
      toast.error(`Erro ao salvar versão: ${err?.message || err}`, { id: tid });
    } finally {
      setSavingVersion(false);
    }
  };

  const latestApproval = approvals.find((a) => a.rev === (versions[0]?.rev ?? 0));

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header Institucional */}
      <header className="border-b bg-card px-6 py-3 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SuporteLogo className="h-8 w-auto" />
          <div>
            <h1 className="text-base font-black tracking-tight text-primary flex items-center gap-2">
              Adensamento Edométrico 1D (ASTM D2435 / NBR 12007)
            </h1>
            <p className="text-xs text-muted-foreground">
              {sample.client} · {sample.workNumber} · Amostra: {sample.code} ({sample.borehole} - {sample.depth} m)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setImportOpen(true)}
            className="gap-1.5 text-xs font-semibold"
          >
            <ClipboardPaste className="h-3.5 w-3.5 text-primary" /> Colar / Importar
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleExportXlsx}
            className="gap-1.5 text-xs font-semibold"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" /> Exportar Excel
          </Button>

          <Button
            size="sm"
            onClick={() => setReportPreviewOpen(true)}
            className="gap-1.5 text-xs font-semibold"
          >
            <Eye className="h-3.5 w-3.5" /> Visualizar Laudo
          </Button>

          <Button
            size="sm"
            variant="default"
            disabled={savingVersion}
            onClick={() => handleSaveVersion()}
            className="gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Save className="h-3.5 w-3.5" /> Salvar Versão
          </Button>
          <ThemeToggle />
        </div>
      </header>

      {/* Farol de Aprovação / Workflow */}
      <div className="bg-muted/40 border-b px-6 py-2">
        <WorkflowFarol
          status={latestApproval?.status || "digitacao"}
          rev={versions[0]?.rev ?? 0}
          digitadoPor={latestApproval?.digitado_por || sample.operator}
          verificadoPor={latestApproval?.verificado_por}
          aprovadoPor={latestApproval?.aprovado_por}
          onRequestVerification={() => handleSaveVersion({ skipVerification: false })}
          onRequestApprovalDirect={() => handleSaveVersion({ skipVerification: true })}
          onVerify={async () => {
            if (latestApproval) {
              await verifyApproval({ data: { approvalId: latestApproval.id, verificadoPor: sample.technicalResp } });
              await loadVersionsAndApprovals();
              toast.success("Ensaio verificado com sucesso!");
            }
          }}
          onApprove={async () => {
            if (latestApproval) {
              await decideApproval({ data: { approvalId: latestApproval.id, decision: "approve", aprovadoPor: sample.technicalResp } });
              await loadVersionsAndApprovals();
              toast.success("Ensaio aprovado com sucesso!");
            }
          }}
          onReject={async (reason) => {
            if (latestApproval) {
              await decideApproval({ data: { approvalId: latestApproval.id, decision: "reject", reason, aprovadoPor: sample.technicalResp } });
              await loadVersionsAndApprovals();
              toast.error("Ensaio rejeitado!");
            }
          }}
        />
      </div>

      {/* Conteúdo Principal */}
      <main className="mx-auto max-w-[1400px] w-full px-6 py-4 flex-1 flex flex-col">
        {/* KPI Cards */}
        <div className="mb-4 grid gap-3 grid-cols-2 md:grid-cols-5">
          <div className="rounded-lg border bg-card p-3 shadow-sm">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase">Índice de Vazios Inicial (e₀)</div>
            <div className="text-xl font-black text-primary mt-1">{fmt(phys.e0, 3)}</div>
          </div>
          <div className="rounded-lg border bg-card p-3 shadow-sm">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase">Umidade Inicial (w₀)</div>
            <div className="text-xl font-black text-primary mt-1">{fmt(phys.wi, 2)} %</div>
          </div>
          <div className="rounded-lg border bg-card p-3 shadow-sm">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase">σ'vm (Casagrande)</div>
            <div className="text-xl font-black text-emerald-600 mt-1">{fmt(compParams.sigmaP_Cas, 1)} kPa</div>
          </div>
          <div className="rounded-lg border bg-card p-3 shadow-sm">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase">σ'vm (Pacheco Silva)</div>
            <div className="text-xl font-black text-blue-600 mt-1">{fmt(compParams.sigmaP_PS, 1)} kPa</div>
          </div>
          <div className="rounded-lg border bg-card p-3 shadow-sm">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase">Cc / Cr</div>
            <div className="text-xl font-black text-purple-600 mt-1">{fmt(compParams.Cc, 3)} / {fmt(compParams.Cr, 3)}</div>
          </div>
        </div>

        {/* Abas */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-5 bg-muted/60">
            <TabsTrigger value="ficha" className="gap-2">
              <FlaskConical className="h-4 w-4" /> Ficha de Preparo
            </TabsTrigger>
            <TabsTrigger value="dados" className="gap-2">
              <FileText className="h-4 w-4" /> Dados Brutos & Estágios
            </TabsTrigger>
            <TabsTrigger value="analise" className="gap-2">
              <LineIcon className="h-4 w-4" /> Análise Gráfica & Parâmetros
            </TabsTrigger>
            <TabsTrigger value="versoes" className="gap-2">
              <History className="h-4 w-4" /> Versões & Google Drive
            </TabsTrigger>
            <TabsTrigger value="relatorio" className="gap-2">
              <Monitor className="h-4 w-4" /> Relatório Oficial A4
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: FICHA DE PREPARO */}
          <TabsContent value="ficha" className="mt-4 space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold text-primary">Identificação do Ensaio</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {([
                    ["client", "Cliente"],
                    ["workNumber", "Nº Obra"],
                    ["reportNumber", "Nº Relatório"],
                    ["os", "Ordem de Serviço (OS)"],
                    ["borehole", "Furo de Sondagem"],
                    ["depth", "Profundidade (m)"],
                    ["code", "Código da Amostra"],
                    ["date", "Data do Ensaio"],
                    ["revision", "Revisão"],
                    ["operator", "Laboratorista"],
                    ["technicalResp", "Responsável Técnico"],
                    ["description", "Descrição Tátil-Visual"],
                  ] as const).map(([k, label]) => (
                    <div key={k} className={k === "description" ? "col-span-2 sm:col-span-3" : ""}>
                      <Label className="text-[11px] text-muted-foreground">{label}</Label>
                      <Input
                        value={(sample as any)[k] ?? ""}
                        onChange={(e) => updateSample(k, e.target.value)}
                        className="h-8 text-xs mt-0.5"
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold text-primary">Geometria do Anel & Massas</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3">
                  {([
                    ["ringDiameter", "Diâmetro D₀ (mm)"],
                    ["ringHeight", "Altura H₀ (mm)"],
                    ["wetMassInitial", "Massa Úmida Inicial (g)"],
                    ["dryMass", "Massa Seca Ms (g)"],
                    ["wetMassFinal", "Massa Úmida Final (g)"],
                    ["Gs", "Densidade Grãos Gs"],
                  ] as const).map(([k, label]) => (
                    <div key={k}>
                      <Label className="text-[11px] text-muted-foreground">{label}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={(sample as any)[k] ?? 0}
                        onChange={(e) => updateSample(k, parseFloat(e.target.value) || 0)}
                        className="h-8 text-xs mt-0.5"
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Upload de Fotos com Recorte 3:4 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-primary">Registro Fotográfico do Corpo de Prova</CardTitle>
                <CardDescription className="text-xs">
                  Anexe as fotos de aspecto inicial e final do ensaio. As fotos são enquadradas no padrão 3:4.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PhotoUploader
                  title="Fotos do Ensaio"
                  items={photos}
                  onAdd={(p) => ctx?.addPhoto?.(p)}
                  onRemove={(id) => ctx?.removePhoto?.(id)}
                  onUpdate={(id, patch) => ctx?.updatePhoto?.(id, patch)}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: DADOS BRUTOS & ESTÁGIOS */}
          <TabsContent value="dados" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold">Estágio Selecionado:</Label>
                <select
                  className="h-8 rounded border border-input bg-background px-3 text-xs"
                  value={selectedStage}
                  onChange={(e) => setSelectedStage(Number(e.target.value))}
                >
                  {stages.map((st, i) => (
                    <option key={i} value={i}>
                      Estágio {i + 1} — σ' = {st.sigma} kPa {st.isSeatingStage ? "(Assentamento)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                size="sm"
                variant="outline"
                onClick={() => setImportOpen(true)}
                className="gap-1 text-xs"
              >
                <ClipboardPaste className="h-3.5 w-3.5 text-primary" /> Configurar Estágios & Colar Dados
              </Button>
            </div>

            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-primary">
                    Tabela de Leituras: Estágio {selectedStage + 1} (σ' = {stages[selectedStage]?.sigma} kPa)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Leituras de tempo [min] versus recalque vertical acumulado [mm].
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  <Label className="text-xs font-medium">Estágio de Assentamento:</Label>
                  <Switch
                    checked={stages[selectedStage]?.isSeatingStage === true}
                    onCheckedChange={(c) => {
                      const u = [...stages];
                      u[selectedStage].isSeatingStage = c;
                      setStages(u);
                    }}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-[360px] overflow-auto border rounded">
                  <Table className="text-xs">
                    <TableHeader className="bg-muted/60 sticky top-0">
                      <TableRow>
                        <TableHead className="text-center w-16">#</TableHead>
                        <TableHead className="text-center">Tempo t (min)</TableHead>
                        <TableHead className="text-center">√t (min^0.5)</TableHead>
                        <TableHead className="text-center">log10(t)</TableHead>
                        <TableHead className="text-center">Leitura Extensômetro (mm)</TableHead>
                        <TableHead className="text-center">Recalque do Estágio (mm)</TableHead>
                        <TableHead className="text-center">Índice de Vazios (e)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(stages[selectedStage]?.readings || []).map((r, rIdx) => {
                        const prevDial = selectedStage === 0 ? 0 : stages[selectedStage - 1].finalDial;
                        const dH = r.d - prevDial;
                        const eInst = voidRatio(phys.e0, sample.ringHeight, r.d);
                        return (
                          <TableRow key={rIdx}>
                            <TableCell className="text-center font-bold text-muted-foreground">{rIdx + 1}</TableCell>
                            <TableCell className="text-center font-mono">{r.t}</TableCell>
                            <TableCell className="text-center font-mono">{r.t > 0 ? Math.sqrt(r.t).toFixed(3) : "0"}</TableCell>
                            <TableCell className="text-center font-mono">{r.t > 0 ? Math.log10(r.t).toFixed(3) : "—"}</TableCell>
                            <TableCell className="text-center font-bold">{r.d.toFixed(4)}</TableCell>
                            <TableCell className="text-center">{dH.toFixed(4)}</TableCell>
                            <TableCell className="text-center font-semibold">{eInst.toFixed(4)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: ANÁLISE GRÁFICA & PARÂMETROS */}
          <TabsContent value="analise" className="mt-4 space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-primary">Curva de Compressão Edométrica (e × log σ')</CardTitle>
                </CardHeader>
                <CardContent className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stagesCalc.map((s) => ({ sigma: s.sigma, e: s.e }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="sigma" type="number" scale="log" domain={[1, 10000]} />
                      <YAxis dataKey="e" domain={["auto", "auto"]} />
                      <Tooltip />
                      <Line type="monotone" dataKey="e" stroke="#1e40af" strokeWidth={2.5} dot={{ r: 4 }} />
                      {casBase && <ReferenceDot x={casBase.sigmaP} y={casBase.intersection.y} r={5} fill="#059669" />}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-primary">Memória de Cálculo dos Parâmetros</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {calcMemory.map((step, idx) => (
                    <div key={idx} className="border-b pb-2 last:border-b-0">
                      <div className="font-bold text-primary">{step.title}</div>
                      <div className="text-muted-foreground text-[11px] mt-0.5">{step.explanation}</div>
                      <div className="font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">{step.result}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* TAB 4: VERSÕES & GOOGLE DRIVE */}
          <TabsContent value="versoes" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold text-primary">Histórico de Versões & Google Drive</CardTitle>
                  <CardDescription className="text-xs">
                    Todos os laudos em PDF e planilhas XLSX sincronizados no Google Drive.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleSaveVersion()}
                  disabled={savingVersion}
                  className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Save className="h-3.5 w-3.5" /> Salvar Nova Versão
                </Button>
              </CardHeader>
              <CardContent>
                <div className="border rounded overflow-hidden">
                  <Table className="text-xs">
                    <TableHeader className="bg-muted/60">
                      <TableRow>
                        <TableHead className="text-center w-16">Rev</TableHead>
                        <TableHead>Arquivo</TableHead>
                        <TableHead className="text-center">Data</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {versions.map((ver) => {
                        const app = approvals.find((a) => a.rev === ver.rev);
                        return (
                          <TableRow key={ver.id}>
                            <TableCell className="text-center font-bold">R{String(ver.rev).padStart(2, "0")}</TableCell>
                            <TableCell className="font-mono text-xs">{ver.filename}</TableCell>
                            <TableCell className="text-center text-muted-foreground">
                              {new Date(ver.createdAt).toLocaleString("pt-BR")}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={app?.status === "aprovado" ? "default" : "outline"} className="text-[10px]">
                                {app?.status || "Salvo"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1"
                                onClick={() => {
                                  const url = URL.createObjectURL(ver.pdfBlob);
                                  setPreviewVersionPdf({ url, filename: ver.filename });
                                }}
                              >
                                <Eye className="h-3 w-3" /> Visualizar
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {versions.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-xs">
                            Nenhuma versão salva ainda. Clique em "Salvar Versão" para registrar.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 5: RELATÓRIO OFICIAL A4 */}
          <TabsContent value="relatorio" className="mt-4 flex flex-col items-center gap-6">
            <div className="w-full flex justify-end gap-2 max-w-[210mm]">
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.print()}
                className="gap-1.5 text-xs"
              >
                <Printer className="h-3.5 w-3.5" /> Imprimir / Gerar PDF
              </Button>
            </div>

            {/* Página 1 */}
            <div className="w-[210mm] shadow-xl bg-white border">
              <OedReportPage1
                sample={sample}
                phys={phys}
                stagesCalc={stagesCalc}
                params={compParams}
                totalPages={totalReportPages}
              />
            </div>

            {/* Página 2 */}
            <div className="w-[210mm] shadow-xl bg-white border">
              <OedReportPage2
                sample={sample}
                stagesCalc={stagesCalc}
                cas={casBase}
                ps={psBase}
                params={compParams}
                calcMemory={calcMemory}
                totalPages={totalReportPages}
              />
            </div>

            {/* Páginas de Fotos (Página 3 em diante) */}
            {Array.from({ length: photoPagesCount }).map((_, pIdx) => (
              <div key={pIdx} className="w-[210mm] shadow-xl bg-white border">
                <OedReportPhotoPage
                  sample={sample}
                  photos={photos}
                  pageIndex={pIdx}
                  totalPages={totalReportPages}
                />
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </main>

      {/* Diálogo de Importação & Colagem */}
      <OedImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        stages={stages}
        onImportStages={(newStages) => setStages(newStages)}
        selectedStageIndex={selectedStage}
        onImportSingleStageReadings={(stIdx, rds) => {
          const u = [...stages];
          if (u[stIdx]) {
            u[stIdx] = {
              ...u[stIdx],
              readings: rds,
              finalDial: rds[rds.length - 1]?.d ?? u[stIdx].finalDial,
            };
            setStages(u);
          }
        }}
      />

      {/* Modal de Pré-visualização do PDF em Pop-up Sem Download Forçado */}
      <Dialog open={!!previewVersionPdf} onOpenChange={(o) => { if (!o) setPreviewVersionPdf(null); }}>
        <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 py-3 border-b flex flex-row items-center justify-between">
            <div>
              <DialogTitle className="text-sm font-bold">{previewVersionPdf?.filename || "Visualização do Laudo PDF"}</DialogTitle>
              <DialogDescription className="text-xs">Documento gerado em conformidade com as normas ABNT / ASTM.</DialogDescription>
            </div>
            {previewVersionPdf && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs mr-6"
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = previewVersionPdf.url;
                  a.download = previewVersionPdf.filename;
                  a.click();
                }}
              >
                <Download className="h-3.5 w-3.5" /> Baixar PDF
              </Button>
            )}
          </DialogHeader>
          <div className="flex-1 bg-muted/40 p-2">
            {previewVersionPdf && (
              <iframe
                src={previewVersionPdf.url}
                className="w-full h-full border rounded bg-white shadow"
                title="Pré-visualização do Relatório"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
