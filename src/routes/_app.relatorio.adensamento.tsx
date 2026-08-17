import React, { useMemo, useRef, useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { flushSync } from "react-dom";
import {
  CartesianGrid,
  ComposedChart,
  Label as RLabel,
  Legend,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  BarChart3,
  Camera,
  Beaker,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Cloud,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  History,
  LineChart as LineIcon,
  Maximize2,
  Monitor,
  Plus,
  Ruler,
  Save,
  Send,
  Settings2,
  ShieldCheck,
  Trash2,
  ZoomIn,
  ZoomOut,
  CircleDot,
} from "lucide-react";
import { SuporteLogo } from "@/components/suporte-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { SampleEditDialog } from "@/components/SampleEditDialog";
import { AneisManagerDialog } from "@/components/AneisManagerDialog";
import { getAneisCatalog } from "@/lib/aneis-catalog";
const logoAsset = { url: "/suporte-infra-logo.png" };
import {
  casagrandeSigmaP,
  ccCr,
  cvCasagrande,
  cvTaylor,
  pachecoSilvaSigmaP,
  physicalIndices,
  seedSample,
  seedStages,
  voidRatio,
  type SampleProps,
  type Stage,
} from "@/lib/oedometer";
import { toast } from "sonner";
import {
  BRAND,
  BRAND2,
  ACCENT,
  RED,
  GREEN,
  PURPLE,
  SLATE,
  SLATE_SOFT,
  GAMMA_W,
} from "@/features/oedometer/constants";
import {
  fmt,
  exp2,
  exp2Str,
  fmtTime,
  sigmaLabel,
  subscriptify,
} from "@/features/oedometer/utils/format";
import {
  type AxisCfg,
  type CasResult,
  type CgrTimeResult,
  type CvLineAdjust,
  type PreconsolidationAdjust,
  type PsResult,
  type TaylorResult,
  type ValidationState,
  validationKey,
} from "@/features/oedometer/types";
import {
  applyCasAdjustment,
  applyCgrAdjustment,
  applyPsAdjustment,
  applyTaylorAdjustment,
} from "@/features/oedometer/domain/adjustments";
import {
  decimalsFor,
  fmtLogTick,
  fmtLogTickEndOnly,
  fmtLogTickSci,
  fmtNiceTick,
  isDecade,
  logMinorTicks,
  logTicks,
  niceTicks,
} from "@/features/oedometer/charts/shared/axisTicks";
import assinaturaMauricio from "@/assets/assinatura-mauricio.png";
import { OedImportDialog } from "@/features/oedometer/components/OedImportDialog";
import { exportOedometerXlsx } from "@/features/oedometer/exportXlsx";
import { syncOedometerRevisionToDrive } from "@/features/oedometer/driveSync";
import { saveOedReportVersion, listOedReportVersions } from "@/features/oedometer/report-versions";
import { saveOedDraft, loadOedDraft } from "@/features/oedometer/draftStore";
import { requestApproval, verifyApproval, decideApproval, listApprovals } from "@/lib/approvals.functions";
import { WorkflowFarol } from "@/features/lab/components/WorkflowFarol";
import { PickerWithCreate } from "@/features/cisalhamento-direto/PickerWithCreate";
import { EnsaioListByType } from "@/features/lab/components/EnsaioListByType";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Photo } from "@/features/lab/types";
import { useOptionalLabEnsaio } from "@/features/lab/context";
import { PhotoUploader } from "@/features/lab/components/PhotoUploader";

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


function AdensamentoListRoute() {
  return <EnsaioListByType tipo="adensamento" />;
}



function PtNumInput({
  value,
  onChange,
  className = "h-7 text-xs text-right font-mono",
  placeholder,
  disabled,
}: {
  value: number | null | undefined;
  onChange: (val: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [localVal, setLocalVal] = useState(() =>
    value == null || isNaN(value) ? "" : String(value).replace(".", ",")
  );

  useEffect(() => {
    const formatted = value == null || isNaN(value) ? "" : String(value).replace(".", ",");
    setLocalVal(formatted);
  }, [value]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={localVal}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
      onChange={(e) => {
        const text = e.target.value;
        setLocalVal(text);
        const parsed = parseFloat(text.replace(",", "."));
        if (!isNaN(parsed)) {
          onChange(parsed);
        } else if (text.trim() === "") {
          onChange(0);
        }
      }}
      onBlur={() => {
        const parsed = parseFloat(localVal.replace(",", "."));
        if (!isNaN(parsed)) {
          setLocalVal(String(parsed).replace(".", ","));
          onChange(parsed);
        }
      }}
    />
  );
}

import { useCadastroByOs } from "@/hooks/use-cadastro-by-os";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listRows } from "@/lib/programacao.functions";
import { labStore } from "@/features/lab/store";

export function AdensamentoPage() {
  const ctx = useOptionalLabEnsaio();
  const { lookup } = useCadastroByOs();
  const cad = ctx?.os?.numero ? lookup(ctx.os.numero) : undefined;
  const { displayName, user, profile } = useAuth();
  const currentUserName = displayName || profile?.nome || user?.email?.split("@")[0] || "Maurício Malanconi";

  const rows0Fn = useServerFn(listRows);
  const { data: amostrasProg = [] } = useQuery({
    queryKey: ["oed-gantt-amostras"],
    queryFn: async () => rows0Fn({ data: { sheet: "Amostras" } }),
    staleTime: 60_000,
  });
  const { data: progsGantt = [] } = useQuery({
    queryKey: ["oed-gantt-progs"],
    queryFn: async () => rows0Fn({ data: { sheet: "Programações" } }),
    staleTime: 60_000,
  });
  const { data: equipsGantt = [] } = useQuery({
    queryKey: ["oed-gantt-equips"],
    queryFn: async () => rows0Fn({ data: { sheet: "Equipamentos" } }),
    staleTime: 60_000,
  });

  const [sample, setSample] = useState<SampleProps>(() => {
    if (!ctx) return { ...seedSample, operator: currentUserName, typedBy: currentUserName };
    return {
      ...seedSample,
      client: ctx.os.client || cad?.tomador || "",
      workNumber: ctx.os.workNumber || cad?.obra || "",
      local: ctx.os.local || cad?.local || "",
      technicalResp: ctx.os.technicalResp || "Engº Maurício Malanconi - CREA: 5063078630",
      revision: ctx.os.revision || "0",
      os: ctx.os.numero || "",
      operator: ctx.ensaio.operator || ctx.os.operator || currentUserName,
      typedBy: (ctx.ensaio.payload as any)?.sample?.typedBy || ctx.ensaio.operator || currentUserName,
      equipment: (ctx.ensaio.payload as any)?.sample?.equipment || "Adensamento Edométrico",
      reportNumber: ctx.amostra.reportNumber || "",
      borehole: ctx.amostra.borehole || "",
      depth: ctx.amostra.depth || "",
      description: ctx.amostra.description || "",
      code: ctx.amostra.code || "",
      granulometricDescription: ctx.amostra.granulometricDescription || "",
    };
  });

  useEffect(() => {
    if (!(sample as any).typedBy && currentUserName) {
      setSample((prev: any) => ({ ...prev, typedBy: currentUserName }));
    }
  }, [currentUserName]);

  // Resolução automática e instantânea de Furo, Profundidade e Metadados do Gantt
  useEffect(() => {
    if (amostrasProg.length === 0) return;
    const osNum = (sample.os || ctx?.os?.numero || "").trim();
    const amKey = (sample.reportNumber || sample.code || ctx?.amostra?.reportNumber || ctx?.amostra?.code || "").trim();
    if (!amKey && !osNum) return;

    const found =
      amostrasProg.find((a: any) => {
        const aOs = (a.os_numero || "").trim();
        if (osNum && aOs && aOs !== osNum) return false;
        return (
          (a.codigo_amostra && String(a.codigo_amostra).trim() === amKey) ||
          (a.identificacao && String(a.identificacao).trim() === amKey) ||
          (a.id && String(a.id).trim() === amKey) ||
          (a.numero_amostra && String(a.numero_amostra).trim() === amKey)
        );
      }) ||
      amostrasProg.find((a: any) => {
        return (
          (a.codigo_amostra && String(a.codigo_amostra).trim() === amKey) ||
          (a.identificacao && String(a.identificacao).trim() === amKey) ||
          (a.id && String(a.id).trim() === amKey)
        );
      });

    if (found) {
      const furoFound = found.identificacao || found.furo || "";
      const depthFound = found.topo_m && found.base_m ? `${found.topo_m} – ${found.base_m} m` : found.profundidade || "";
      const codeFound = found.codigo_amostra || found.id || "";
      const typeFound = found.tipo || "";

      // Busca equipamento alocado
      let equipFound = "";
      if (progsGantt.length > 0 && equipsGantt.length > 0) {
        const eqMap = new Map(equipsGantt.map((eq: any) => [eq.id, eq.nome]));
        const pr = progsGantt.find((p: any) => p.ensaio_id && p.equipamento_id);
        if (pr?.equipamento_id) equipFound = String(eqMap.get(pr.equipamento_id) || "");
      }

      setSample((prev: any) => {
        let changed = false;
        const next = { ...prev };
        if (!next.borehole && furoFound) { next.borehole = furoFound; changed = true; }
        if (!next.depth && depthFound) { next.depth = depthFound; changed = true; }
        if (!next.code && codeFound) { next.code = codeFound; changed = true; }
        if (typeFound && !next.sampleType) {
          next.sampleType = typeFound;
          changed = true;
        }
        if ((!next.equipment || next.equipment === "Adensamento Edométrico") && equipFound) {
          next.equipment = equipFound;
          changed = true;
        }
        if (cad?.tomador && (!next.client || next.client.startsWith("OS "))) { next.client = cad.tomador; changed = true; }
        if (cad?.obra && !next.workNumber) { next.workNumber = cad.obra; changed = true; }
        if (cad?.local && !next.local) { next.local = cad.local; changed = true; }
        if (!next.technicalResp || next.technicalResp.includes("Maurício Silva")) {
          next.technicalResp = "Engº Maurício Malanconi - CREA: 5063078630";
          changed = true;
        }
        return changed ? next : prev;
      });

      if (ctx && ctx.os && ctx.amostra) {
        if (!ctx.amostra.borehole && furoFound) {
          labStore.patchAmostra(ctx.os.id, ctx.amostra.id, {
            borehole: furoFound,
            depth: depthFound || ctx.amostra.depth,
            code: codeFound || ctx.amostra.code,
          });
        }
      }
    }
  }, [amostrasProg, progsGantt, equipsGantt, cad, ctx]);
  const phys = useMemo(() => physicalIndices(sample), [sample]);
  const [stages, setStages] = useState<Stage[]>(() => (!ctx ? seedStages(phys.e0, sample.ringHeight) : []));
  const [selectedStage, setSelectedStage] = useState(5);
  const [activeTab, setActiveTab] = useState<string>("ficha");
  const [capsOpen, setCapsOpen] = useState(true);
  const [methodCas, setMethodCas] = useState(true);
  const [methodPS, setMethodPS] = useState(true);
  const [showResults, setShowResults] = useState(true);
  const [validation, setValidation] = useState<ValidationState>({});
  const [preAdjust, setPreAdjust] = useState<PreconsolidationAdjust>({});
  const [cvAdjust, setCvAdjust] = useState<Record<number, CvLineAdjust>>({});
  const scopeId = ctx?.ensaio?.id || `os/${sample.os || "OS"}/amostra/${sample.code || "AMOSTRA"}/ensaio/adensamento`;
  const [importOpen, setImportOpen] = useState(false);
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);
  const [savingVersion, setSavingVersion] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [sampleEditOpen, setSampleEditOpen] = useState(false);
  const [aneisCatalogOpen, setAneisCatalogOpen] = useState(false);
  const aneisList = useMemo(() => getAneisCatalog(), [aneisCatalogOpen]);

  // Carrega rascunho salvo
  useEffect(() => {
    const draft = loadOedDraft(scopeId);
    if (draft?.sample) setSample((prev) => ({ ...prev, ...draft.sample }));
    if (draft?.stages) setStages(draft.stages);
  }, [scopeId]);

  // Salva rascunho automaticamente
  useEffect(() => {
    saveOedDraft(scopeId, { sample, stages });
  }, [scopeId, sample, stages]);

  const loadVersions = async () => {
    try {
      const vList = await listOedReportVersions(scopeId);
      setVersions(vList);
    } catch {}
    try {
      const res = await listApprovals({ data: { scopeId } });
      if (Array.isArray(res)) setApprovals(res);
    } catch {}
  };

  useEffect(() => {
    loadVersions();
  }, [scopeId]);

  // Exportacao XLSX
  const handleExportXlsx = async () => {
    const tid = toast.loading("Gerando planilha Excel executiva (.xlsx)…");
    try {
      const stagesCalc = stages.map((st, i) => {
        const row = cvTable[i];
        return {
          sigma: st.sigma,
          dial: st.finalDial,
          deltaH: st.finalDial,
          Hfinal: sample.ringHeight - st.finalDial,
          e: row.e,
          t50: row.t50 ?? undefined,
          t90: row.t90 ?? undefined,
          cv_Cas: row.cvCas ?? undefined,
          cv_Taylor: row.cvTaylor ?? undefined,
          k: row.kvCas ?? row.kvTaylor ?? undefined,
          av: row.av ?? undefined,
          mv: row.mv ?? undefined,
          isSeatingStage: (st as any).isSeatingStage || false,
        };
      });

      const photos = ctx?.photos || [];

      await exportOedometerXlsx({
        sample,
        stages: stages as any,
        phys,
        stagesCalc: stagesCalc as any,
        params: {
          Cc: ccr.Cc,
          Cs: ccr.Cr,
          Cr: ccr.Cr,
          sigmaP_Cas: cas?.sigmaP ?? 0,
          sigmaP_PS: ps?.sigmaP ?? 0,
          sigmaP_Adopted: (cas?.sigmaP ?? 0) > 0 ? cas?.sigmaP ?? 0 : ps?.sigmaP ?? 0,
          OCR: (cas?.sigmaP ?? 0) > 0 ? (cas?.sigmaP ?? 0) / (sample.dryMass || 50) : null,
          virginLine: cas?.virgin || { m: 0, b: 0 },
          recompressionLine: { m: 0, b: 0 },
        },
        photos,
      });
      toast.success("Planilha Excel exportada com sucesso!", { id: tid });
    } catch (e: any) {
      toast.error(`Erro ao exportar Excel: ${e?.message || e}`, { id: tid });
    }
  };

  // Salvar Versao e Google Drive
  const handleSaveVersion = async (opts?: { skipVerification?: boolean }) => {
    setSavingVersion(true);
    const tid = toast.loading("Gerando laudo e sincronizando com Google Drive…");
    try {
      const revNumber = versions.length > 0 ? Math.max(...versions.map((v) => v.rev)) + 1 : 0;
      const pdfBlob = new Blob(["%PDF-1.4 ... Relatório Oficial Suporte INFRA"], { type: "application/pdf" });
      const filename = `ADENSAMENTO_${sample.os || "OS"}_${sample.code || "AMOSTRA"}_Rev${String(revNumber).padStart(2, "0")}.pdf`;

      const newVer = {
        id: "ver_" + Date.now(),
        scopeId,
        rev: revNumber,
        filename,
        createdAt: new Date().toISOString(),
        pdfBlob,
        sizeBytes: pdfBlob.size,
      };
      await saveOedReportVersion(newVer as any);

      const stagesCalc = stages.map((st, i) => {
        const row = cvTable[i];
        return {
          sigma: st.sigma,
          dial: st.finalDial,
          deltaH: st.finalDial,
          Hfinal: sample.ringHeight - st.finalDial,
          e: row.e,
          t50: row.t50 ?? undefined,
          t90: row.t90 ?? undefined,
          cv_Cas: row.cvCas ?? undefined,
          cv_Taylor: row.cvTaylor ?? undefined,
          k: row.kvCas ?? row.kvTaylor ?? undefined,
          av: row.av ?? undefined,
          mv: row.mv ?? undefined,
          isSeatingStage: (st as any).isSeatingStage || false,
        };
      });

      const syncRes = await syncOedometerRevisionToDrive({
        sample,
        stages: stages as any,
        phys,
        stagesCalc: stagesCalc as any,
        params: {
          Cc: ccr.Cc,
          Cs: ccr.Cr,
          Cr: ccr.Cr,
          sigmaP_Cas: cas?.sigmaP ?? 0,
          sigmaP_PS: ps?.sigmaP ?? 0,
          sigmaP_Adopted: (cas?.sigmaP ?? 0) > 0 ? cas?.sigmaP ?? 0 : ps?.sigmaP ?? 0,
          OCR: null,
          virginLine: cas?.virgin || { m: 0, b: 0 },
          recompressionLine: { m: 0, b: 0 },
        },
        photos: ctx?.photos || [],
        pdfBlob,
        revNumber,
      });

      try {
        await requestApproval({
          data: {
            scopeId,
            rev: revNumber,
            filename,
            skipVerification: opts?.skipVerification || false,
          },
        });
      } catch {}

      await loadVersions();
      if (syncRes.ok) {
        toast.success("Versão salva e sincronizada com sucesso no Google Drive!", { id: tid });
      } else {
        toast.warning(`Versão salva localmente (${syncRes.error || "Drive pendente"})`, { id: tid });
      }
    } catch (e: any) {
      toast.error(`Erro ao salvar versão: ${e?.message || e}`, { id: tid });
    } finally {
      setSavingVersion(false);
    }
  };


  // ===== Ajuste de Eixos dos gráficos (usado tanto na Análise quanto no Relatório) =====
  type AxisCfg = {
    eMin: number; eMax: number;
    sigmaMin: number; sigmaMax: number;        // log, kPa
    sigmaArithMax: number;                      // arith, kPa
    cvMin: number; cvMax: number;              // log, cm²/s
    caMax: number;                              // arith
    eedoMax: number;                            // MPa
    kvMin: number; kvMax: number;              // log, cm/s
    eNormMin: number; eNormMax: number;        // e/e₀ (adimensional)
  };
  const [axisCfg, setAxisCfg] = useState<AxisCfg>({
    eMin: 0.40, eMax: 1.60,
    sigmaMin: 1, sigmaMax: 10000,
    sigmaArithMax: 1000,
    cvMin: 1e-5, cvMax: 1e-1,
    caMax: 0.05,
    eedoMax: 30,
    kvMin: 1e-8, kvMax: 1e-3,
    eNormMin: 0.25, eNormMax: 1.25,
  });
  const updateAxis = <K extends keyof AxisCfg>(k: K, v: number) =>
    setAxisCfg((s) => ({ ...s, [k]: v }));

  const eCurve = useMemo(() => {
    return stages.map((st, i) => {
      const e = voidRatio(phys.e0, sample.ringHeight, st.finalDial);
      return {
        sigma: st.sigma,
        e,
        phase: i > 0 && st.sigma < stages[i - 1].sigma ? "unload" : "load",
        isSeatingStage: (st as any).isSeatingStage || false,
      } as const;
    });
  }, [stages, phys.e0, sample.ringHeight]);

  const loadingCurve = useMemo(() => {
    const res: { sigma: number; e: number }[] = [];
    let max = 0;
    for (const p of eCurve) {
      if (p.isSeatingStage) continue; // Exclui estágio de assentamento dos cálculos de pré-adensamento e reta virgem
      if (p.sigma >= max) {
        res.push({ sigma: p.sigma, e: p.e });
        max = p.sigma;
      } else break;
    }
    return res;
  }, [eCurve]);

  const casBase = useMemo(() => casagrandeSigmaP(loadingCurve), [loadingCurve]);
  const psBase = useMemo(() => pachecoSilvaSigmaP(loadingCurve, phys.e0), [loadingCurve, phys.e0]);
  const cas = useMemo(() => applyCasAdjustment(casBase, preAdjust.cas), [casBase, preAdjust.cas]);
  const ps = useMemo(() => applyPsAdjustment(psBase, loadingCurve, preAdjust.ps), [psBase, loadingCurve, preAdjust.ps]);
  const ccr = useMemo(() => ccCr(loadingCurve), [loadingCurve]);

  // Domínios compartilhados — vêm do "Ajuste de Eixos" e são propagados a todos os gráficos.
  const eDomainShared: [number, number] = [axisCfg.eMin, axisCfg.eMax];
  const sigmaLogDomainShared: [number, number] = [axisCfg.sigmaMin, axisCfg.sigmaMax];
  const sigmaArithMaxShared = axisCfg.sigmaArithMax;
  const cvLogDomainShared: [number, number] = [axisCfg.cvMin, axisCfg.cvMax];
  const kvLogDomainShared: [number, number] = [axisCfg.kvMin, axisCfg.kvMax];

  const cvTable = useMemo(() => {
    return stages.map((st, i) => {
      const prevDial = i === 0 ? 0 : stages[i - 1].finalDial;
      const Havg_mm = sample.ringHeight - (prevDial + st.finalDial) / 2;
      const Hdrain_mm = Havg_mm / 2;
      const phase = i > 0 && st.sigma < stages[i - 1].sigma ? "unload" : "load";
      const baseT = phase === "load" ? cvTaylor(st, Hdrain_mm) : null;
      const baseC = phase === "load" ? cvCasagrande(st, Hdrain_mm) : null;
      const t = phase === "load" ? applyTaylorAdjustment(st, Hdrain_mm, baseT, cvAdjust[i]) : null;
      const c = phase === "load" ? applyCgrAdjustment(st, Hdrain_mm, baseC, cvAdjust[i]) : null;
      const e = voidRatio(phys.e0, sample.ringHeight, st.finalDial);
      const ePrev = voidRatio(phys.e0, sample.ringHeight, prevDial);
      const dSigma = i === 0 ? st.sigma : st.sigma - stages[i - 1].sigma;
      const mv = dSigma === 0 ? null : Math.abs((ePrev - e) / (1 + ePrev) / dSigma);
      const av = dSigma === 0 ? null : Math.abs((ePrev - e) / dSigma);
      const Ed_kPa = phase === "load" && mv ? 1 / mv : null;
      const kvTaylor = t && mv ? t.cv * mv * GAMMA_W : null;
      const kvCas = c && mv ? c.cv * mv * GAMMA_W : null;
      return {
        phase,
        sigma: st.sigma,
        finalDial: st.finalDial,
        Hfinal: sample.ringHeight - st.finalDial,
        e,
        cvTaylor: t?.cv ?? null,
        cvCas: c?.cv ?? null,
        t90: t?.t90 ?? null,
        t50: c?.t50 ?? null,
        kvTaylor,
        kvCas,
        mv,
        av,
        ca: phase === "load" ? Math.max(0, Math.abs((st.readings[st.readings.length - 1]?.d ?? st.finalDial) - (st.readings[st.readings.length - 3]?.d ?? st.finalDial)) / sample.ringHeight) : null,
        Ed: Ed_kPa,
        Ed_MPa: Ed_kPa ? Ed_kPa / 1000 : null,
        Hdrain: Hdrain_mm,
        stageIndex: i,
        validatedTaylor: !!validation[validationKey(i, "taylor")],
        validatedCasagrande: !!validation[validationKey(i, "casagrande")],
        validatedSummary: !!validation[validationKey(i, "resumo")],
      };
    });
  }, [stages, sample.ringHeight, phys.e0, cvAdjust, validation]);

  // Sugestão automática de eixos calculada a partir dos dados reais do ensaio.
  const suggestedAxisCfg = useMemo(() => {
    const isPos = (v: unknown): v is number => typeof v === "number" && isFinite(v) && v > 0;
    const es = [...eCurve.map((p) => p.e), phys.e0].filter((v): v is number => typeof v === "number" && isFinite(v));
    const sigs = eCurve.map((p) => p.sigma).filter(isPos);
    const cvs = cvTable.flatMap((r) => [r.cvTaylor, r.cvCas]).filter(isPos);
    const cas = cvTable.map((r) => r.ca).filter(isPos);
    const eedos = cvTable.map((r) => r.Ed_MPa).filter(isPos);
    const kvs = cvTable.map((r) => r.kvTaylor).filter(isPos);

    const eMin = es.length ? Math.floor(Math.min(...es) * 20) / 20 - 0.05 : 0.4;
    const eMax = es.length ? Math.ceil(Math.max(...es) * 20) / 20 + 0.05 : 1.6;
    const sigmaMin = 1;
    const sigmaMax = sigs.length ? Math.pow(10, Math.ceil(Math.log10(Math.max(...sigs)))) : 10000;
    const sigmaArithMax = sigs.length ? Math.max(100, Math.ceil(Math.max(...sigs) / 100) * 100) : 1000;
    const cvMin = cvs.length ? Math.pow(10, Math.floor(Math.log10(Math.min(...cvs)))) : 1e-5;
    const cvMax = cvs.length ? Math.pow(10, Math.ceil(Math.log10(Math.max(...cvs)))) : 1e-1;
    const caRaw = cas.length ? Math.max(...cas) : 0.05;
    const caMag = Math.pow(10, Math.floor(Math.log10(Math.max(caRaw, 1e-6))));
    const caMax = Math.max(caMag, Math.ceil((caRaw * 1.15) / caMag) * caMag);
    const eedoMax = eedos.length ? Math.max(5, Math.ceil(Math.max(...eedos) / 5) * 5) : 30;
    const kvMin = kvs.length ? Math.pow(10, Math.floor(Math.log10(Math.min(...kvs)))) : 1e-8;
    const kvMax = kvs.length ? Math.pow(10, Math.ceil(Math.log10(Math.max(...kvs)))) : 1e-3;

    const normVals = es.length ? es.map((e) => e / phys.e0) : [];
    const eNormMin = normVals.length ? Math.floor(Math.min(...normVals) * 20) / 20 - 0.05 : 0.25;
    const eNormMax = normVals.length ? Math.ceil(Math.max(...normVals) * 20) / 20 + 0.05 : 1.25;

    return { eMin, eMax, sigmaMin, sigmaMax, sigmaArithMax, cvMin, cvMax, caMax, eedoMax, kvMin, kvMax, eNormMin, eNormMax };
  }, [eCurve, cvTable, phys.e0]);

  const loadingStageOptions = useMemo(
    () => stages.map((s, i) => ({ s, i })).filter(({ s, i }) => i === 0 || s.sigma >= stages[i - 1].sigma),
    [stages]
  );

  const stageData = stages[selectedStage];
  const stagePrevDial = selectedStage === 0 ? 0 : stages[selectedStage - 1].finalDial;
  const stageHdrain = useMemo(
    () => (sample.ringHeight - (stagePrevDial + stageData.finalDial) / 2) / 2,
    [sample.ringHeight, stagePrevDial, stageData.finalDial],
  );
  const selectedIsLoading = selectedStage === 0 || stageData.sigma >= stages[selectedStage - 1].sigma;
  const tay = useMemo(() => {
    if (!selectedIsLoading) return null;
    const base = cvTaylor(stageData, stageHdrain);
    return applyTaylorAdjustment(stageData, stageHdrain, base, cvAdjust[selectedStage]);
  }, [selectedIsLoading, stageData, stageHdrain, cvAdjust, selectedStage]);
  const cgr = useMemo(() => {
    if (!selectedIsLoading) return null;
    const base = cvCasagrande(stageData, stageHdrain);
    return applyCgrAdjustment(stageData, stageHdrain, base, cvAdjust[selectedStage]);
  }, [selectedIsLoading, stageData, stageHdrain, cvAdjust, selectedStage]);

  const sqrtData = useMemo(
    () => stageData.readings.map((r) => ({ x: +Math.sqrt(r.t).toFixed(4), d: r.d, t: r.t })),
    [stageData.readings],
  );
  const logData = useMemo(
    () =>
      stageData.readings
        .filter((r) => r.t > 0)
        .map((r) => ({ x: +Math.log10(r.t).toFixed(4), d: r.d, t: r.t })),
    [stageData.readings],
  );

  const updateSample = (k: keyof SampleProps, v: any) =>
    setSample((s) => ({ ...s, [k]: typeof s[k] === "number" && typeof v === "string" ? Number(v) : v }));
  const updateReading = (si: number, ri: number, val: number) => {
    setStages((sts) => {
      const copy = sts.map((s) => ({ ...s, readings: s.readings.map((r) => ({ ...r })) }));
      copy[si].readings[ri].d = val;
      copy[si].finalDial = copy[si].readings[copy[si].readings.length - 1].d;
      return copy;
    });
  };
  const updateStageSigma = (si: number, v: number) =>
    setStages((sts) => sts.map((s, i) => (i === si ? { ...s, sigma: v } : s)));

  const toggleValidation = (key: string) => setValidation((v) => ({ ...v, [key]: !v[key] }));
  const updatePreAdjust = (method: "cas" | "ps", key: string, value: number) => {
    setPreAdjust((cur) => ({ ...cur, [method]: { ...(cur[method] ?? {}), [key]: value } }));
  };
  const updateCvAdjust = (stageIndex: number, key: keyof CvLineAdjust, value: number) => {
    setCvAdjust((cur) => {
      const prev = cur[stageIndex] ?? {};
      const next: CvLineAdjust = { ...prev, [key]: value };
      // Coerência Taylor: U90 tem inclinação m/1,15 (ver cvTaylor)
      if (key === "taylorSlope" && isFinite(value)) {
        next.taylorSlope90 = value / 1.15;
      } else if (key === "taylorSlope90" && isFinite(value)) {
        next.taylorSlope = value * 1.15;
      }
      return { ...cur, [stageIndex]: next };
    });
  };
  const resetCvAdjust = (stageIndex: number) => {
    setCvAdjust((cur) => {
      const copy = { ...cur };
      delete copy[stageIndex];
      return copy;
    });
  };

  const printRef = useRef<HTMLDivElement>(null);
  const [pdfMount, setPdfMount] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [reportZoom, setReportZoom] = useState(0.85);

  const waitForReportPages = async (container: HTMLElement) => {
    const expectedPages = 10;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 6000) {
      const pages = Array.from(container.querySelectorAll<HTMLElement>("[data-pdf-page]"));
      const charts = container.querySelectorAll(".recharts-surface");
      const pagesReady = pages.length >= expectedPages && pages.every((page) => page.offsetWidth > 0 && page.offsetHeight > 0);
      if (pagesReady && charts.length > 0) return pages;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    const pages = Array.from(container.querySelectorAll<HTMLElement>("[data-pdf-page]"));
    if (!pages.length) throw new Error("Nenhuma página do relatório foi renderizada");
    return pages;
  };

  const handleExportPDF = async () => {
    if (isExportingPDF) return;
    setIsExportingPDF(true);
    toast.loading("Gerando relatório PDF...", { id: "pdf" });
    let originalPrintStyle: Partial<CSSStyleDeclaration> | null = null;
    // Força tema claro durante a captura para garantir relatório com fundo branco.
    const htmlEl = document.documentElement;
    const wasDark = htmlEl.classList.contains("dark");
    if (wasDark) htmlEl.classList.remove("dark");
    htmlEl.classList.add("force-light");
    try {
      const [{ toCanvas }, { default: jsPDF }] = await Promise.all([
        import("html-to-image"),
        import("jspdf"),
      ]);
      // Make container measurable BEFORE mounting so Recharts ResponsiveContainer
      // gets a non-zero width and actually paints the charts.
      const elPre = printRef.current;
      if (!elPre) throw new Error("Container do relatório não encontrado");
      originalPrintStyle = {
        position: elPre.style.position,
        top: elPre.style.top,
        left: elPre.style.left,
        width: elPre.style.width,
        background: elPre.style.background,
        pointerEvents: elPre.style.pointerEvents,
        zIndex: elPre.style.zIndex,
        opacity: elPre.style.opacity,
        visibility: elPre.style.visibility,
      };
      Object.assign(elPre.style, {
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
      flushSync(() => setPdfMount(true));
      // Allow Recharts ResponsiveContainer + ResizeObserver to settle and paint.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
      await new Promise((r) => setTimeout(r, 150));
      const el = printRef.current;
      if (!el) throw new Error("Container do relatório não encontrado");
      const pages = await waitForReportPages(el);
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
      const W = 210, H = 297;
      // Capture all pages in parallel for speed; high pixelRatio for sharpness.
      const images = await Promise.all(
        pages.map(async (page) => {
          const rect = page.getBoundingClientRect();
          const canvas = await toCanvas(page, {
            backgroundColor: "#ffffff",
            pixelRatio: 3,
            width: Math.ceil(rect.width),
            height: Math.ceil(rect.height),
            cacheBust: true,
            skipAutoScale: true,
            style: {
              background: "#ffffff",
              color: "#0f172a",
              transform: "none",
            },
          });
          return canvas.toDataURL("image/png");
        }),
      );
      for (let i = 0; i < images.length; i++) {
        if (i > 0) pdf.addPage();
        pdf.addImage(images[i], "PNG", 0, 0, W, H, undefined, "FAST");
      }
      const filename = `Adensamento_${sample.borehole}_${sample.revision}.pdf`;
      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success("Relatório gerado com sucesso!", { id: "pdf" });
    } catch (e) {
      console.error(e);
      toast.error(`Erro ao gerar PDF: ${(e as Error)?.message ?? "desconhecido"}`, { id: "pdf" });
    } finally {
      const elPost = printRef.current;
      if (elPost && originalPrintStyle) Object.assign(elPost.style, originalPrintStyle);
      flushSync(() => setPdfMount(false));
      htmlEl.classList.remove("force-light");
      if (wasDark) htmlEl.classList.add("dark");
      setIsExportingPDF(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background p-4 lg:p-6 pb-20">
      {/* Top Header com Farol e Ações (Padrão Cisalhamento Direto) */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FlaskConical className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">ABNT NBR 16853 / ASTM D2435</Badge>
              <WorkflowFarol status={approvals[0]?.status || "em_digitacao"} />
            </div>
            <h1 className="mt-1 text-xl font-bold tracking-tight">
              ENSAIO DE ADENSAMENTO UNIDIMENSIONAL (EDOMÉTRICO)
            </h1>
            <p className="text-xs text-muted-foreground">
              Determinação dos parâmetros de compressibilidade e adensamento: Cc, Cs, Cr, σ'vm, Cv e k.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-end">
          {/* Botão Contextual de Fluxo */}
          <Button
            size="sm"
            onClick={() => handleSaveVersion()}
            disabled={savingVersion}
            className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
          >
            <Send className="h-4 w-4" />
            {savingVersion ? "Enviando…" : "Terminei a digitação — Enviar para verificação"}
          </Button>

          {/* Ajustes de Eixos */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveTab("relatorio")}
            className="gap-1.5 text-xs"
          >
            <Settings2 className="h-4 w-4" />
            Ajustes
          </Button>

          {/* Exportar Dados Brutos (XLSX) */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportXlsx}
            className="border-emerald-600/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 gap-1.5 text-xs font-semibold"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Exportar Dados Brutos (XLSX)
          </Button>

          {/* Visualizar Relatório */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReportPreviewOpen(true)}
            className="gap-1.5 text-xs font-semibold"
          >
            <Eye className="h-4 w-4" /> Visualizar Relatório
          </Button>

          <ThemeToggle />
        </div>
      </div>

      {/* Barra Superior de Operador e Digitador (Padrão Cisalhamento Direto) */}
      <div className="mb-4 grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">
            Operador do ensaio (Laboratorista)
          </Label>
          <div className="flex-1">
            <PickerWithCreate
              kind="operators"
              value={sample.operator ?? ""}
              onChange={(v) => setSample((s) => ({ ...s, operator: v }))}
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
              value={(sample as any).typedBy ?? sample.operator ?? ""}
              onChange={(v) => setSample((s: any) => ({ ...s, typedBy: v }))}
              placeholder="Selecione quem digitou…"
              createLabel="Novo digitador"
            />
          </div>
        </div>
      </div>

      {/* Identificação da amostra (comum a todos os estágios) */}
      <Card className="mb-4 border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold">
                Amostra {sample.reportNumber || sample.code || "—"} · OS {sample.os || "—"}
              </CardTitle>
              <CardDescription className="text-xs">
                {sample.client || "—"} · Furo {sample.borehole || "—"} · Prof. {sample.depth || "—"}
              </CardDescription>
            </div>
            <button
              type="button"
              onClick={() => setSampleEditOpen(true)}
              className="text-xs text-primary hover:underline font-semibold cursor-pointer flex items-center gap-1"
            >
              editar amostra →
            </button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-muted-foreground text-[11px]">Condição do ensaio</div>
              <div className="font-semibold text-foreground">
                Adensamento Unidimensional (1D) — Inundado
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-[11px]">Condição da amostra</div>
              <div className="font-semibold text-foreground">
                Indeformada · {sample.description?.substring(0, 30) || "Argila siltosa"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-[11px]">Equipamento</div>
              <div className="font-semibold text-foreground">
                Célula Edométrica de Anel Fixo
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-[11px]">Geometria</div>
              <div className="font-semibold text-foreground">
                Circular (Ø {sample.ringDiameter} mm × {sample.ringHeight} mm)
              </div>
            </div>
          </div>

          {/* Estágios de Tensão Pills */}
          <div className="mt-3 pt-3 border-t border-primary/15">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase mb-1.5 flex items-center justify-between">
              <span>Estágios de Tensão ({stages.length})</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setImportOpen(true)}
                className="h-6 text-[11px] px-2 gap-1 text-primary hover:bg-primary/10"
              >
                <ClipboardPaste className="h-3 w-3" /> Configurar / Colar
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {stages.map((st, i) => {
                const isSelected = selectedStage === i;
                const isSeating = (st as any).isSeatingStage;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setSelectedStage(i);
                      setActiveTab("dados");
                    }}
                    className={`px-2.5 py-1 rounded text-xs font-semibold transition-all border ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : isSeating
                          ? "bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700"
                          : "bg-background text-foreground hover:bg-muted border-border"
                    }`}
                  >
                    Estágio {i + 1} — σ' = {st.sigma} kPa {isSeating ? "(Assentamento)" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <main className="w-full">

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-muted/60">
            <TabsTrigger value="ficha" className="gap-2">
              <FlaskConical className="h-4 w-4" /> Ficha de Preparo
            </TabsTrigger>
            <TabsTrigger value="dados" className="gap-2">
              <FileText className="h-4 w-4" /> Dados Brutos
            </TabsTrigger>
            <TabsTrigger value="analise" className="gap-2">
              <LineIcon className="h-4 w-4" /> Análise Gráfica
            </TabsTrigger>
            <TabsTrigger value="relatorio" className="gap-2">
              <Monitor className="h-4 w-4" /> Relatório
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: FICHA DE PREPARO */}
          <TabsContent value="ficha" className="mt-4 space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              {/* Equipamento e Descrição */}
              <Card className="lg:col-span-1">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold text-primary">Operação & Equipamento</CardTitle>
                  <CardDescription className="text-xs">Dados técnicos do ensaio de consolidação 1D</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Equipamento Utilizado</Label>
                    <Input
                      placeholder="Ex.: Célula Edométrica de Anel Fixo - Prensa P-01"
                      value={sample.equipment ?? "Célula Edométrica de Anel Fixo"}
                      onChange={(e) => updateSample("equipment", e.target.value)}
                      className="h-8 text-xs mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Data do Ensaio</Label>
                    <Input
                      type="text"
                      value={sample.date ?? ""}
                      onChange={(e) => updateSample("date", e.target.value)}
                      className="h-8 text-xs mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Caracterização Tátil-Visual</Label>
                    <Input
                      value={sample.description ?? ""}
                      onChange={(e) => updateSample("description", e.target.value)}
                      className="h-8 text-xs mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Caracterização Granulométrica</Label>
                    <Input
                      value={sample.granulometricDescription ?? ""}
                      onChange={(e) => updateSample("granulometricDescription", e.target.value)}
                      className="h-8 text-xs mt-0.5"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Geometria do Anel e Massas com Anel */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold text-primary">Geometria do Anel & Massas do Ensaio</CardTitle>
                  <CardDescription className="text-xs">
                    Dimensões do anel e pesagens diretas com tara do anel
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Seletor de Anel de Adensamento */}
                  <div className="rounded border bg-muted/20 p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5 font-semibold text-xs text-primary">
                        <CircleDot className="h-4 w-4" /> Anel de Adensamento:
                      </div>
                      <Select
                        value={sample.ringNumber || ""}
                        onValueChange={(anelNum) => {
                          const anel = aneisList.find((a) => a.numero === anelNum);
                          if (anel) {
                            const dim = anel.secao === "circular" ? (anel.diametro_mm || 70) : (anel.lado_mm || 70);
                            updateSample("ringNumber", anel.numero);
                            updateSample("ringDiameter", dim);
                            updateSample("ringHeight", anel.altura_mm);
                            updateSample("ringMass", anel.massa_g);
                            toast.success(`Anel ${anel.numero} aplicado (${anel.secao === "circular" ? `Ø${dim}mm` : `${dim}x${dim}mm`}, H=${anel.altura_mm}mm, Tara=${anel.massa_g}g)`);
                          }
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs w-64 font-mono font-medium">
                          <SelectValue placeholder="Escolha um anel cadastrado…" />
                        </SelectTrigger>
                        <SelectContent>
                          {aneisList.filter(a => a.ensaio === "adensamento" || a.ensaio === "ambos").map((a) => (
                            <SelectItem key={a.id} value={a.numero} className="text-xs">
                              {a.numero} — {a.secao === "circular" ? `Ø ${a.diametro_mm}mm` : `${a.lado_mm}x${a.lado_mm}mm`} (H={a.altura_mm}mm · {a.massa_g}g)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-2">
                      {sample.ringMass ? (
                        <Badge variant="outline" className="text-[11px] font-mono bg-background text-emerald-700 dark:text-emerald-400">
                          Tara: {sample.ringMass.toFixed(2)} g
                        </Badge>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => setAneisCatalogOpen(true)}
                      >
                        <Plus className="h-3 w-3" /> Gerenciar Anéis
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Nº do Anel</Label>
                      <Input
                        placeholder="Ex.: ANEL-01"
                        value={sample.ringNumber ?? "ANEL-01"}
                        onChange={(e) => updateSample("ringNumber", e.target.value)}
                        className="h-8 text-xs mt-0.5"
                      />
                    </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Diâmetro D₀ (mm)</Label>
                    <PtNumInput
                      value={sample.ringDiameter}
                      onChange={(v) => updateSample("ringDiameter", v)}
                      className="h-8 text-xs mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Altura H₀ (mm)</Label>
                    <PtNumInput
                      value={sample.ringHeight}
                      onChange={(v) => updateSample("ringHeight", v)}
                      className="h-8 text-xs mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Densidade Grãos Gs</Label>
                    <PtNumInput
                      value={sample.Gs}
                      onChange={(v) => updateSample("Gs", v)}
                      className="h-8 text-xs mt-0.5"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-muted-foreground">Massa do Anel (g)</Label>
                    <PtNumInput
                      value={sample.ringMass ?? 110.45}
                      onChange={(v) => updateSample("ringMass", v)}
                      placeholder="Ex.: 110,45"
                      className="h-8 text-xs mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Anel + CP Inicial (g)</Label>
                    <PtNumInput
                      value={sample.wetMassInitialWithRing ?? (sample.ringMass ? sample.ringMass + sample.wetMassInitial : sample.wetMassInitial + 110.45)}
                      onChange={(v) => updateSample("wetMassInitialWithRing", v)}
                      placeholder="Ex.: 256,80"
                      className="h-8 text-xs mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Anel + CP Final (g)</Label>
                    <PtNumInput
                      value={sample.wetMassFinalWithRing ?? (sample.ringMass ? sample.ringMass + sample.wetMassFinal : sample.wetMassFinal + 110.45)}
                      onChange={(v) => updateSample("wetMassFinalWithRing", v)}
                      placeholder="Ex.: 254,10"
                      className="h-8 text-xs mt-0.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Massa Esp. Água (g/cm³)</Label>
                    <PtNumInput
                      value={sample.rhoW || 1.0}
                      onChange={(v) => updateSample("rhoW", v)}
                      className="h-8 text-xs mt-0.5"
                    />
                  </div>

                  <div className="col-span-2 sm:col-span-4 rounded-md border border-border/60 bg-muted/20 p-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground text-[11px]">Massa Úmida Inicial:</span>
                      <div className="font-bold text-foreground">{fmt(phys.wetMassInitial, 2)} g</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px]">Massa Úmida Final:</span>
                      <div className="font-bold text-foreground">{fmt(phys.wetMassFinal, 2)} g</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px]">Massa Seca Ms:</span>
                      <div className="font-bold text-foreground">{fmt(phys.dryMass, 2)} g</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-[11px]">Volume Inicial V₀:</span>
                      <div className="font-bold text-foreground">{fmt(phys.V0, 2)} cm³</div>
                    </div>
                  </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* CONTAINER RECOLHÍVEL: DETERMINAÇÃO DA UMIDADE (INICIAL E FINAL) */}
            <Card className="border-primary/30 shadow-sm overflow-hidden">
              <CardHeader
                className="cursor-pointer select-none pb-2 pt-3 px-4 hover:bg-muted/40 transition-colors border-b border-border/40"
                onClick={() => setCapsOpen((v) => !v)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {capsOpen ? (
                      <ChevronDown className="h-4 w-4 text-primary" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-primary" />
                    )}
                    <div>
                      <CardTitle className="text-sm font-bold text-primary flex items-center gap-2">
                        <Beaker className="h-4 w-4" /> Determinação da Umidade da Amostra — Cápsulas (Inicial e Final)
                      </CardTitle>
                      <CardDescription className="text-[11px]">
                        3 determinações com pesagens para cada etapa do ensaio (clique para recolher/expandir)
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-semibold bg-background border-primary/30 text-primary">
                      w₀ Inicial = {fmt(phys.wi, 2)}%
                    </Badge>
                    <Badge variant="outline" className="text-xs font-semibold bg-background border-primary/30 text-primary">
                      w_f Final = {fmt(phys.wf, 2)}%
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              {capsOpen && (
                <CardContent className="p-4 grid gap-4 md:grid-cols-2 bg-background">
                  {/* Cápsulas Iniciais (Moldagem) */}
                  <div className="border border-border/70 rounded-md p-3 bg-muted/10">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/50">
                      <div className="font-bold text-xs text-primary">Umidade Inicial (Moldagem)</div>
                      <Badge variant="secondary" className="text-[11px] font-bold">
                        Média w₀ = {fmt(phys.wi, 2)}%
                      </Badge>
                    </div>

                    <table className="w-full border-collapse text-xs">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="border border-border p-1.5 text-left">Determinação</th>
                          <th className="border border-border p-1.5 text-center w-24">Cápsula 1</th>
                          <th className="border border-border p-1.5 text-center w-24">Cápsula 2</th>
                          <th className="border border-border p-1.5 text-center w-24">Cápsula 3</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-border p-1.5 font-medium">Nº Cápsula</td>
                          {[0, 1, 2].map((i) => {
                            const cap = sample.capsules?.[i] ?? { numero: `C-${i + 1}`, tara: 15.2, wet: 45.3, dry: 35.2 };
                            return (
                              <td key={i} className="border border-border p-1">
                                <Input
                                  value={cap.numero ?? `C-${i + 1}`}
                                  onChange={(e) => {
                                    const caps = [...(sample.capsules ?? [
                                      { numero: "C-01", tara: 15.2, wet: 45.3, dry: 35.2 },
                                      { numero: "C-02", tara: 14.8, wet: 44.9, dry: 34.8 },
                                      { numero: "C-03", tara: 15.5, wet: 46.1, dry: 35.8 },
                                    ])];
                                    caps[i] = { ...caps[i], numero: e.target.value };
                                    updateSample("capsules", caps);
                                  }}
                                  className="h-7 text-xs text-center"
                                />
                              </td>
                            );
                          })}
                        </tr>
                        <tr>
                          <td className="border border-border p-1.5 font-medium">Tara (g)</td>
                          {[0, 1, 2].map((i) => {
                            const cap = sample.capsules?.[i] ?? { numero: `C-${i + 1}`, tara: 15.2 + i * 0.3, wet: 45.3, dry: 35.2 };
                            return (
                              <td key={i} className="border border-border p-1">
                                <PtNumInput
                                  value={cap.tara}
                                  onChange={(v) => {
                                    const caps = [...(sample.capsules ?? [
                                      { numero: "C-01", tara: 15.2, wet: 45.3, dry: 35.2 },
                                      { numero: "C-02", tara: 14.8, wet: 44.9, dry: 34.8 },
                                      { numero: "C-03", tara: 15.5, wet: 46.1, dry: 35.8 },
                                    ])];
                                    caps[i] = { ...caps[i], tara: v };
                                    updateSample("capsules", caps);
                                  }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                        <tr>
                          <td className="border border-border p-1.5 font-medium">Solo Úmido + Tara (g)</td>
                          {[0, 1, 2].map((i) => {
                            const cap = sample.capsules?.[i] ?? { numero: `C-${i + 1}`, tara: 15.2, wet: 45.3 + i * 0.4, dry: 35.2 };
                            return (
                              <td key={i} className="border border-border p-1">
                                <PtNumInput
                                  value={cap.wet}
                                  onChange={(v) => {
                                    const caps = [...(sample.capsules ?? [
                                      { numero: "C-01", tara: 15.2, wet: 45.3, dry: 35.2 },
                                      { numero: "C-02", tara: 14.8, wet: 44.9, dry: 34.8 },
                                      { numero: "C-03", tara: 15.5, wet: 46.1, dry: 35.8 },
                                    ])];
                                    caps[i] = { ...caps[i], wet: v };
                                    updateSample("capsules", caps);
                                  }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                        <tr>
                          <td className="border border-border p-1.5 font-medium">Solo Seco + Tara (g)</td>
                          {[0, 1, 2].map((i) => {
                            const cap = sample.capsules?.[i] ?? { numero: `C-${i + 1}`, tara: 15.2, wet: 45.3, dry: 35.2 + i * 0.3 };
                            return (
                              <td key={i} className="border border-border p-1">
                                <PtNumInput
                                  value={cap.dry}
                                  onChange={(v) => {
                                    const caps = [...(sample.capsules ?? [
                                      { numero: "C-01", tara: 15.2, wet: 45.3, dry: 35.2 },
                                      { numero: "C-02", tara: 14.8, wet: 44.9, dry: 34.8 },
                                      { numero: "C-03", tara: 15.5, wet: 46.1, dry: 35.8 },
                                    ])];
                                    caps[i] = { ...caps[i], dry: v };
                                    updateSample("capsules", caps);
                                  }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                        <tr className="bg-muted/30">
                          <td className="border border-border p-1.5 font-medium">Umidade (%)</td>
                          {[0, 1, 2].map((i) => {
                            const cap = sample.capsules?.[i] ?? { tara: 15.2, wet: 45.3, dry: 35.2 };
                            const ms = cap.dry - cap.tara;
                            const w = ms > 0 && cap.wet >= cap.dry ? ((cap.wet - cap.dry) / ms) * 100 : NaN;
                            return (
                              <td key={i} className="border border-border p-1.5 text-right font-semibold">
                                {isFinite(w) ? `${w.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Cápsulas Finais (Pós-Ensaio) */}
                  <div className="border border-border/70 rounded-md p-3 bg-muted/10">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/50">
                      <div className="font-bold text-xs text-primary">Umidade Final (Pós-Ensaio)</div>
                      <Badge variant="secondary" className="text-[11px] font-bold">
                        Média w_f = {fmt(phys.wf, 2)}%
                      </Badge>
                    </div>

                    <table className="w-full border-collapse text-xs">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="border border-border p-1.5 text-left">Determinação</th>
                          <th className="border border-border p-1.5 text-center w-24">Cápsula 1</th>
                          <th className="border border-border p-1.5 text-center w-24">Cápsula 2</th>
                          <th className="border border-border p-1.5 text-center w-24">Cápsula 3</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="border border-border p-1.5 font-medium">Nº Cápsula</td>
                          {[0, 1, 2].map((i) => {
                            const cap = sample.finalCapsules?.[i] ?? { numero: `CF-${i + 1}`, tara: 14.9, wet: 43.8, dry: 34.6 };
                            return (
                              <td key={i} className="border border-border p-1">
                                <Input
                                  value={cap.numero ?? `CF-${i + 1}`}
                                  onChange={(e) => {
                                    const caps = [...(sample.finalCapsules ?? [
                                      { numero: "CF-01", tara: 14.9, wet: 43.8, dry: 34.6 },
                                      { numero: "CF-02", tara: 15.1, wet: 44.2, dry: 34.9 },
                                      { numero: "CF-03", tara: 15.3, wet: 44.5, dry: 35.1 },
                                    ])];
                                    caps[i] = { ...caps[i], numero: e.target.value };
                                    updateSample("finalCapsules", caps);
                                  }}
                                  className="h-7 text-xs text-center"
                                />
                              </td>
                            );
                          })}
                        </tr>
                        <tr>
                          <td className="border border-border p-1.5 font-medium">Tara (g)</td>
                          {[0, 1, 2].map((i) => {
                            const cap = sample.finalCapsules?.[i] ?? { numero: `CF-${i + 1}`, tara: 14.9 + i * 0.2, wet: 43.8, dry: 34.6 };
                            return (
                              <td key={i} className="border border-border p-1">
                                <PtNumInput
                                  value={cap.tara}
                                  onChange={(v) => {
                                    const caps = [...(sample.finalCapsules ?? [
                                      { numero: "CF-01", tara: 14.9, wet: 43.8, dry: 34.6 },
                                      { numero: "CF-02", tara: 15.1, wet: 44.2, dry: 34.9 },
                                      { numero: "CF-03", tara: 15.3, wet: 44.5, dry: 35.1 },
                                    ])];
                                    caps[i] = { ...caps[i], tara: v };
                                    updateSample("finalCapsules", caps);
                                  }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                        <tr>
                          <td className="border border-border p-1.5 font-medium">Solo Úmido + Tara (g)</td>
                          {[0, 1, 2].map((i) => {
                            const cap = sample.finalCapsules?.[i] ?? { numero: `CF-${i + 1}`, tara: 14.9, wet: 43.8 + i * 0.4, dry: 34.6 };
                            return (
                              <td key={i} className="border border-border p-1">
                                <PtNumInput
                                  value={cap.wet}
                                  onChange={(v) => {
                                    const caps = [...(sample.finalCapsules ?? [
                                      { numero: "CF-01", tara: 14.9, wet: 43.8, dry: 34.6 },
                                      { numero: "CF-02", tara: 15.1, wet: 44.2, dry: 34.9 },
                                      { numero: "CF-03", tara: 15.3, wet: 44.5, dry: 35.1 },
                                    ])];
                                    caps[i] = { ...caps[i], wet: v };
                                    updateSample("finalCapsules", caps);
                                  }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                        <tr>
                          <td className="border border-border p-1.5 font-medium">Solo Seco + Tara (g)</td>
                          {[0, 1, 2].map((i) => {
                            const cap = sample.finalCapsules?.[i] ?? { numero: `CF-${i + 1}`, tara: 14.9, wet: 43.8, dry: 34.6 + i * 0.3 };
                            return (
                              <td key={i} className="border border-border p-1">
                                <PtNumInput
                                  value={cap.dry}
                                  onChange={(v) => {
                                    const caps = [...(sample.finalCapsules ?? [
                                      { numero: "CF-01", tara: 14.9, wet: 43.8, dry: 34.6 },
                                      { numero: "CF-02", tara: 15.1, wet: 44.2, dry: 34.9 },
                                      { numero: "CF-03", tara: 15.3, wet: 44.5, dry: 35.1 },
                                    ])];
                                    caps[i] = { ...caps[i], dry: v };
                                    updateSample("finalCapsules", caps);
                                  }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                        <tr className="bg-muted/30">
                          <td className="border border-border p-1.5 font-medium">Umidade (%)</td>
                          {[0, 1, 2].map((i) => {
                            const cap = sample.finalCapsules?.[i] ?? { tara: 14.9, wet: 43.8, dry: 34.6 };
                            const ms = cap.dry - cap.tara;
                            const w = ms > 0 && cap.wet >= cap.dry ? ((cap.wet - cap.dry) / ms) * 100 : NaN;
                            return (
                              <td key={i} className="border border-border p-1.5 text-right font-semibold">
                                {isFinite(w) ? `${w.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* ÍNDICES FÍSICOS CALCULADOS */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-primary">Índices Físicos Calculados do Ensaio</CardTitle>
                <CardDescription className="text-xs">Estado inicial e final de compressibilidade do corpo de prova</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Stat label="Área A₀ (cm²)" value={fmt(phys.A, 2)} />
                  <Stat label="Volume V₀ (cm³)" value={fmt(phys.V0, 2)} />
                  <Stat label="V_s (cm³)" value={fmt(phys.Vs, 2)} />
                  <Stat label="ρ úmida (g/cm³)" value={fmt(phys.rho_i, 2)} />
                  <Stat label="ρ seca (g/cm³)" value={fmt(phys.rho_d, 2)} />
                  <Stat label="ρ final (g/cm³)" value={fmt(phys.rho_f, 2)} />

                  <Stat label="w_i (%)" value={`${fmt(phys.wi, 2)}%`} />
                  <Stat label="w_f (%)" value={`${fmt(phys.wf, 2)}%`} />
                  <Stat label="Índice Vazios e₀" value={fmt(phys.e0, 3)} highlight />
                  <Stat label="Índice Vazios e_f" value={fmt(phys.ef, 3)} />
                  <Stat label="Sr₀ (%)" value={`${fmt(phys.Sr0, 1)}%`} />
                  <Stat label="Sr_f (%)" value={`${fmt(phys.Srf, 1)}%`} />
                </div>
              </CardContent>
            </Card>

            {/* REGISTRO FOTOGRÁFICO 3:4 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-primary">Registro Fotográfico do Corpo de Prova</CardTitle>
                <CardDescription className="text-xs">
                  Anexe as fotos de moldagem inicial e aspecto final do ensaio. As fotos são enquadradas no padrão 3:4.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2">
                  <PhotoUploader
                    title="Fotos de Moldagem / Iniciais"
                    kind="moldagem"
                    photos={ctx?.photos ?? []}
                    onAdd={(p) => ctx?.addPhoto?.(p)}
                    onRemove={(id) => ctx?.removePhoto?.(id)}
                    onUpdate={(id, patch) => ctx?.updatePhoto?.(id, patch)}
                  />
                  <PhotoUploader
                    title="Fotos de Ruptura / Finais"
                    kind="ruptura"
                    photos={ctx?.photos ?? []}
                    onAdd={(p) => ctx?.addPhoto?.(p)}
                    onRemove={(id) => ctx?.removePhoto?.(id)}
                    onUpdate={(id, patch) => ctx?.updatePhoto?.(id, patch)}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2 */}
          <TabsContent value="dados" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-primary">Leituras do Defletômetro × Tempo</CardTitle>
                  <CardDescription>Deslocamentos cumulativos (mm). Todas as células são editáveis.</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setImportOpen(true)}
                    className="h-8 text-xs gap-1.5 font-semibold text-primary border-primary/30 hover:bg-primary/5"
                  >
                    <ClipboardPaste className="h-3.5 w-3.5" /> Colar Leituras / Configurar Estágios
                  </Button>
                  <Badge variant="outline">{stages.length} estágios</Badge>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-card font-semibold">σ' (kPa)</TableHead>
                      {stages[0].readings.map((r) => (
                        <TableHead key={r.t} className="text-right">
                          {fmtTime(r.t)}
                        </TableHead>
                      ))}
                      <TableHead className="text-right font-semibold">ΔH final</TableHead>
                      <TableHead className="text-right">e</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stages.map((st, si) => (
                      <TableRow key={si} className={st.sigma < (stages[si - 1]?.sigma ?? 0) ? "bg-muted/40" : ""}>
                        <TableCell className="sticky left-0 bg-card">
                          <Input
                            className="h-7 w-20 text-xs"
                            type="number"
                            value={st.sigma}
                            onChange={(e) => updateStageSigma(si, Number(e.target.value))}
                          />
                        </TableCell>
                        {st.readings.map((r, ri) => (
                          <TableCell key={ri} className="p-1">
                            <Input
                              className="h-7 w-20 text-right text-xs tabular-nums"
                              type="number"
                              step="0.0001"
                              value={r.d}
                              onChange={(e) => updateReading(si, ri, Number(e.target.value))}
                            />
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-mono font-semibold">{fmt(st.finalDial, 4)}</TableCell>
                        <TableCell className="text-right font-mono">
                          {fmt(voidRatio(phys.e0, sample.ringHeight, st.finalDial), 4)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3 */}
          <TabsContent value="analise" className="mt-4 grid gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-primary">Curva e × log σ' — σ'ᵥₘ, Cc e Cr</CardTitle>
                  <CardDescription>
                    Cc = {fmt(ccr.Cc, 3)} · Cr = {fmt(ccr.Cr, 3)} · σ'ᵥₘ Casagrande ={" "}
                    {cas ? `${fmt(cas.sigmaP, 1)} kPa` : "—"} · σ'ᵥₘ Pacheco Silva ={" "}
                    {ps ? `${fmt(ps.sigmaP, 1)} kPa` : "—"}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={methodCas} onCheckedChange={setMethodCas} id="cas" />
                    <Label htmlFor="cas" className="text-xs">Casagrande</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={methodPS} onCheckedChange={setMethodPS} id="ps" />
                    <Label htmlFor="ps" className="text-xs">Pacheco Silva</Label>
                  </div>
                  <div className="flex items-center gap-2 border-l pl-4">
                    <Switch checked={showResults} onCheckedChange={setShowResults} id="show-res" />
                    <Label htmlFor="show-res" className="text-xs">Mostrar resultados nos gráficos</Label>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <EvsSigmaChart
                  curve={eCurve}
                  cas={methodCas ? cas : null}
                  ps={methodPS ? ps : null}
                  e0={phys.e0}
                  height={420}
                  showResults={showResults}
                  eDomain={eDomainShared}
                  sigmaLogDomain={sigmaLogDomainShared}
                />

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <PreconsolidationLineEditor cas={cas} ps={ps} onChange={updatePreAdjust} />
                  <ValidationPanel
                    title="Validação dos resultados de pré-adensamento"
                    items={[
                      { key: "pre:cas", label: `Casagrande σ'ᵥₘ = ${cas ? fmt(cas.sigmaP, 2) + " kPa" : "—"}` },
                      { key: "pre:ps", label: `Pacheco Silva σ'ᵥₘ = ${ps ? fmt(ps.sigmaP, 2) + " kPa" : "—"}` },
                      { key: "pre:cc", label: `Índices Cc/Cr = ${fmt(ccr.Cc, 3)} / ${fmt(ccr.Cr, 3)}` },
                    ]}
                    validation={validation}
                    onToggle={toggleValidation}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-primary">Memorial de cálculo — Casagrande e Pacheco Silva</CardTitle>
                <CardDescription>Coordenadas gráficas e retas usadas na determinação da tensão de pré-adensamento.</CardDescription>
              </CardHeader>
              <CardContent>
                <PreconsolidationCalcTable cas={cas} ps={ps} ccr={ccr} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-primary">Cv por Estágio — Taylor (√t) e Casagrande (log t)</CardTitle>
                  <CardDescription>
                    σ' = {stageData.sigma} kPa · Hd = {fmt(stageHdrain, 3)} mm (dupla drenagem) · Cv Taylor ={" "}
                    {selectedIsLoading ? (tay ? exp2(tay.cv) + " cm²/s" : "—") : "não calculado em descarregamento"} · Cv Casagrande ={" "}
                    {selectedIsLoading ? (cgr ? exp2(cgr.cv) + " cm²/s" : "—") : "não calculado em descarregamento"}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch checked={showResults} onCheckedChange={setShowResults} id="show-res-cv" />
                    <Label htmlFor="show-res-cv" className="text-xs">Mostrar resultados</Label>
                  </div>
                  <Select value={String(selectedStage)} onValueChange={(v) => setSelectedStage(Number(v))}>
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {loadingStageOptions.map(({ s, i }) => (
                        <SelectItem key={i} value={String(i)}>
                          Estágio {i + 1} — {s.sigma} kPa
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <TaylorChart data={sqrtData} taylor={tay} ringHeight={sample.ringHeight} height={320} showResults={showResults} />
                <CasagrandeTimeChart data={logData} cgr={cgr} ringHeight={sample.ringHeight} height={320} showResults={showResults} />

                <div className="md:col-span-2">
                  <CvLineEditor
                    stageIndex={selectedStage}
                    taylor={tay}
                    cgr={cgr}
                    isLoading={selectedIsLoading}
                    validation={validation}
                    onLineChange={updateCvAdjust}
                    onToggleValidation={toggleValidation}
                    onReset={resetCvAdjust}
                    hasAdjustments={Boolean(cvAdjust[selectedStage] && Object.keys(cvAdjust[selectedStage]).length)}
                    ringHeight={sample.ringHeight}
                  />
                </div>
                <div className="md:col-span-2">
                  <CvCalcTable taylor={tay} cgr={cgr} Hdrain={stageHdrain} isLoading={selectedIsLoading} />
                </div>
                <div className="md:col-span-2">
                  <StageValidationMatrix rows={cvTable} validation={validation} onToggle={toggleValidation} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-primary">Cv × σ' e Módulo Edométrico × σ'</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <CvVsSigmaChart rows={cvTable} height={300} sigmaLogDomain={sigmaLogDomainShared} cvLogDomain={cvLogDomainShared} />
                <EedoVsSigmaChart rows={cvTable} height={300} sigmaArithMax={sigmaArithMaxShared} eedoMax={axisCfg.eedoMax} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-primary">Quadro Resumo dos Resultados</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <SummaryTable rows={cvTable} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-primary">Memorial de Cálculo — Passo a Passo dos Gráficos</CardTitle>
                <CardDescription>
                  Para cada estágio de carregamento, mostra fórmula → substituição numérica → resultado dos métodos de Taylor e Casagrande.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CvMemorial stages={stages} ringHeight={sample.ringHeight} cvAdjust={cvAdjust} />
              </CardContent>
            </Card>

          </TabsContent>

          {/* TAB 4 — Relatório (com painel lateral de Ajuste de Eixos) */}
          <TabsContent value="relatorio" className="mt-4 grid gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-primary">Relatório Técnico — Pré-visualização</CardTitle>
                  <CardDescription>Padrão Suporte Infra · A4 · multipáginas com todos os gráficos</CardDescription>
                </div>
                <Button onClick={handleExportPDF} disabled={isExportingPDF} className="gap-2">
                  <Download className="h-4 w-4" /> {isExportingPDF ? "Gerando..." : "Exportar PDF"}
                </Button>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                  {/* PDF preview */}
                  <div className="flex-1 min-w-0 rounded-lg border bg-muted/40 p-4">
                    <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-border bg-card/70 px-3 py-2">
                      <span className="text-xs font-medium text-muted-foreground">Zoom da pré-visualização</span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => setReportZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}
                          aria-label="Diminuir zoom"
                        >
                          <ZoomOut className="h-3.5 w-3.5" />
                        </Button>
                        <span className="min-w-[3.5rem] text-center text-xs font-semibold tabular-nums">
                          {Math.round(reportZoom * 100)}%
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => setReportZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}
                          aria-label="Aumentar zoom"
                        >
                          <ZoomIn className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setReportZoom(1)}
                          aria-label="Tamanho real"
                          title="100%"
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="overflow-auto">
                    <div style={{ zoom: reportZoom, width: "210mm" }}>
                      {activeTab === "relatorio" || pdfMount ? (
                        <PrintableReport
                          sample={sample}
                          phys={phys}
                          cvTable={cvTable}
                          cas={cas}
                          ps={ps}
                          ccr={ccr}
                          eCurve={eCurve}
                          stages={stages}
                          ringHeight={sample.ringHeight}
                          e0={phys.e0}
                          cvAdjust={cvAdjust}
                          axisCfg={axisCfg}
                        />
                      ) : null}
                    </div>
                    </div>
                  </div>

                  {/* Painel lateral — Ajuste de Eixos */}
                  <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:w-[380px]">
                    <div className="flex max-h-[calc(100vh-2rem)] flex-col rounded-lg border border-border bg-card shadow-sm">
                      <div className="border-b border-border p-4">
                        <div className="text-sm font-semibold text-primary">Ajuste de Eixos dos Gráficos</div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Define os limites de cada eixo. Aplicado a todos os gráficos do relatório e da análise.
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="mt-3 w-full"
                          onClick={() => setAxisCfg(suggestedAxisCfg)}
                        >
                          Aplicar valores sugeridos pelos dados
                        </Button>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Calcula automaticamente os limites ideais a partir dos resultados do ensaio.
                        </p>
                      </div>
                      <div className="grid gap-3 overflow-y-auto overscroll-contain p-4">
                        <AxisGroup title="Índice de Vazios (e)">
                          <AxisField label="mínimo" step="0.01" value={axisCfg.eMin} onChange={(v) => updateAxis("eMin", v)} />
                          <AxisField label="máximo" step="0.01" value={axisCfg.eMax} onChange={(v) => updateAxis("eMax", v)} />
                        </AxisGroup>
                        <AxisGroup title="σ'ᵥ log [kPa]">
                          <AxisField label="mínimo" step="1" value={axisCfg.sigmaMin} onChange={(v) => updateAxis("sigmaMin", v)} />
                          <AxisField label="máximo" step="1" value={axisCfg.sigmaMax} onChange={(v) => updateAxis("sigmaMax", v)} />
                        </AxisGroup>
                        <AxisGroup title="σ'ᵥ aritmético [kPa]">
                          <AxisField label="máximo" step="50" value={axisCfg.sigmaArithMax} onChange={(v) => updateAxis("sigmaArithMax", v)} />
                        </AxisGroup>
                        <AxisGroup title="Cv [cm²/s] (log)">
                          <AxisField label="mínimo" step="any" value={axisCfg.cvMin} onChange={(v) => updateAxis("cvMin", v)} />
                          <AxisField label="máximo" step="any" value={axisCfg.cvMax} onChange={(v) => updateAxis("cvMax", v)} />
                        </AxisGroup>
                        <AxisGroup title="Cα">
                          <AxisField label="máximo" step="0.001" value={axisCfg.caMax} onChange={(v) => updateAxis("caMax", v)} />
                        </AxisGroup>
                        <AxisGroup title="E'edo [MPa]">
                          <AxisField label="máximo" step="1" value={axisCfg.eedoMax} onChange={(v) => updateAxis("eedoMax", v)} />
                        </AxisGroup>
                        <AxisGroup title="kv [cm/s] (log)">
                          <AxisField label="mínimo" step="any" value={axisCfg.kvMin} onChange={(v) => updateAxis("kvMin", v)} />
                          <AxisField label="máximo" step="any" value={axisCfg.kvMax} onChange={(v) => updateAxis("kvMax", v)} />
                        </AxisGroup>
                        <AxisGroup title="Índice de Vazios Normalizado (e/e₀)">
                          <AxisField label="mínimo" step="0.01" value={axisCfg.eNormMin} onChange={(v) => updateAxis("eNormMin", v)} />
                          <AxisField label="máximo" step="0.01" value={axisCfg.eNormMax} onChange={(v) => updateAxis("eNormMax", v)} />
                        </AxisGroup>
                      </div>
                    </div>
                  </aside>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <footer className="mt-10 border-t border-border pt-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Suporte Infra Engenharia · Plataforma de Ensaios Geotécnicos
        </footer>
      </main>

      
      {/* Diálogo de Importação de Dados por Colagem Rápida e Sequência de Tensões */}
      <OedImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        stages={stages as any}
        selectedStageIndex={selectedStage}
        onImportStages={(newStages) => {
          setStages(newStages as any);
          setSelectedStage((prev) => Math.min(prev, newStages.length - 1));
          toast.success("Estágios e tensões atualizados com sucesso!");
        }}
        onImportSingleStageReadings={(stIdx, readings) => {
          const updated = [...stages];
          if (updated[stIdx]) {
            updated[stIdx] = {
              ...updated[stIdx],
              readings,
              finalDial: readings[readings.length - 1]?.d ?? updated[stIdx].finalDial,
            };
            setStages(updated);
            toast.success(`${readings.length} leituras importadas para o Estágio ${stIdx + 1} (${stages[stIdx]?.sigma} kPa)!`);
          }
        }}
      />

      {/* Pop-up Modal de Visualização do Relatório PDF */}
      <Dialog
        open={reportPreviewOpen}
        onOpenChange={(open) => {
          setReportPreviewOpen(open);
        }}
      >
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-4 sm:p-6 gap-3">
          <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b">
            <div>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Laudo Oficial de Adensamento Edométrico (ABNT NBR 16853 / ASTM D2435)
              </DialogTitle>
              <DialogDescription className="text-xs">
                {sample.client} · {sample.workNumber} · Amostra: {sample.reportNumber || sample.code} ({sample.borehole} - {sample.depth} m)
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 mr-6">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
                onClick={() => window.print()}
              >
                Imprimir Laudo
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 w-full h-full min-h-0 bg-muted/40 rounded-lg overflow-auto border p-4 flex flex-col items-center gap-6">
            <PrintableReport
              sample={sample}
              phys={phys}
              stages={stages}
              eCurve={eCurve}
              loadingCurve={loadingCurve}
              cas={cas}
              ps={ps}
              ccr={ccr}
              cvTable={cvTable}
              photos={ctx?.photos || []}
              axisCfg={axisCfg}
              ringHeight={sample.ringHeight}
              e0={phys.e0}
            />
          </div>
        </DialogContent>
      </Dialog>

      <div
        ref={printRef}
        style={{
          position: "fixed",
          top: "-100000px",
          left: 0,
          width: "210mm",
          background: "#fff",
          pointerEvents: "none",
          zIndex: -1,
        }}
        aria-hidden
      >
        {pdfMount && (
          <PrintableReport
            sample={sample}
            phys={phys}
            cvTable={cvTable}
            cas={cas}
            ps={ps}
            ccr={ccr}
            eCurve={eCurve}
            stages={stages}
            ringHeight={sample.ringHeight}
            e0={phys.e0}
            cvAdjust={cvAdjust}
            axisCfg={axisCfg}
          />
        )}
      </div>

      {/* Modal de Edição da Amostra */}
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
          revision: sample.revision,
          reportNumber: sample.reportNumber,
          code: sample.code,
          borehole: sample.borehole,
          depth: sample.depth,
          coordN: (sample as any).coordN,
          coordE: (sample as any).coordE,
          coordCota: (sample as any).coordCota,
          sampleType: (sample as any).sampleType || "Bloco indeformado",
          sampleState: (sample as any).sampleState || "indeformada",
          description: sample.description,
          granulometricDescription: sample.granulometricDescription,
          equipment: sample.equipment,
        }}
        onSave={(updated) => {
          setSample((prev) => ({
            ...prev,
            ...updated,
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

      {/* Modal de Gestão e Cadastro de Anéis */}
      <AneisManagerDialog
        open={aneisCatalogOpen}
        onOpenChange={setAneisCatalogOpen}
        ensaioFiltro="adensamento"
        onSelectAnel={(anel) => {
          const dim = anel.secao === "circular" ? (anel.diametro_mm || 70) : (anel.lado_mm || 70);
          updateSample("ringNumber", anel.numero);
          updateSample("ringDiameter", dim);
          updateSample("ringHeight", anel.altura_mm);
          updateSample("ringMass", anel.massa_g);
        }}
      />
    </div>
  );
}


// ===== Small UI bits =====
function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="border-primary/15">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-lg font-bold tabular-nums text-primary">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{subscriptify(label)}</div>
      <div className={`font-mono text-sm font-semibold ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function ValidationPanel({
  title,
  items,
  validation,
  onToggle,
}: {
  title: string;
  items: { key: string; label: string }[];
  validation: ValidationState;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-primary">{title}</div>
        <Badge variant="outline" className="text-[10px]">
          {items.filter((i) => validation[i.key]).length}/{items.length} validados
        </Badge>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onToggle(item.key)}
            className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-xs transition hover:bg-muted/60"
          >
            <span>{item.label}</span>
            <Badge variant={validation[item.key] ? "default" : "outline"} className="ml-3 shrink-0">
              {validation[item.key] ? "Validado" : "Pendente"}
            </Badge>
          </button>
        ))}
      </div>
    </div>
  );
}

function NumericLineInput({ label, value, onChange, step = 0.0001 }: { label: string; value?: number | null; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step={step}
        className="h-8 font-mono text-xs"
        value={value == null || !isFinite(value) ? "" : Number(value.toFixed(6))}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function PreconsolidationLineEditor({
  cas,
  ps,
  onChange,
}: {
  cas: ReturnType<typeof casagrandeSigmaP>;
  ps: ReturnType<typeof pachecoSilvaSigmaP>;
  onChange: (method: "cas" | "ps", key: string, value: number) => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-primary">Ajuste manual das retas gráficas</div>
          <div className="text-xs text-muted-foreground">Edite coeficientes das retas; o gráfico e σ'ᵥₘ recalculam automaticamente.</div>
        </div>
        <Badge variant="outline">log σ'</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border p-2">
          <div className="mb-2 text-xs font-semibold text-primary">Casagrande</div>
          <div className="grid grid-cols-2 gap-2">
            <NumericLineInput label="Tangente m" value={cas?.tangent.m} onChange={(v) => onChange("cas", "tangentM", v)} />
            <NumericLineInput label="Tangente b" value={cas?.tangent.b} onChange={(v) => onChange("cas", "tangentB", v)} />
            <NumericLineInput label="Bissetriz m" value={cas?.bisector.m} onChange={(v) => onChange("cas", "bisectorM", v)} />
            <NumericLineInput label="Bissetriz b" value={cas?.bisector.b} onChange={(v) => onChange("cas", "bisectorB", v)} />
            <NumericLineInput label="Virgem m" value={cas?.virgin.m} onChange={(v) => onChange("cas", "virginM", v)} />
            <NumericLineInput label="Virgem b" value={cas?.virgin.b} onChange={(v) => onChange("cas", "virginB", v)} />
            <NumericLineInput label="Horizontal e(P)" value={cas?.horizontal} onChange={(v) => onChange("cas", "horizontal", v)} />
            <div className="rounded-md bg-muted/60 p-2 text-[11px]">
              <div className="text-muted-foreground">Resultado gráfico</div>
              <div className="font-mono font-bold text-primary">σ'ᵥₘ = {cas ? fmt(cas.sigmaP, 2) : "—"} kPa</div>
            </div>
          </div>
        </div>
        <div className="rounded-md border p-2">
          <div className="mb-2 text-xs font-semibold text-primary">Pacheco Silva</div>
          <div className="grid grid-cols-2 gap-2">
            <NumericLineInput label="Virgem m" value={ps?.virgin.m} onChange={(v) => onChange("ps", "virginM", v)} />
            <NumericLineInput label="Virgem b" value={ps?.virgin.b} onChange={(v) => onChange("ps", "virginB", v)} />
            <NumericLineInput label="Linha e₀" value={ps?.e0Line} onChange={(v) => onChange("ps", "e0Line", v)} />
            <div className="rounded-md bg-muted/60 p-2 text-[11px]">
              <div className="text-muted-foreground">Resultado gráfico</div>
              <div className="font-mono font-bold text-primary">σ'ᵥₘ = {ps ? fmt(ps.sigmaP, 2) : "—"} kPa</div>
            </div>
            <div className="col-span-2 rounded-md border border-dashed p-2 text-[11px] text-muted-foreground">
              A→B é a vertical em σ'A = {ps ? fmt(ps.A.sigma, 2) : "—"} kPa; B→C é a horizontal em e = {ps ? fmt(ps.B.y, 4) : "—"}.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CvLineEditor({
  stageIndex,
  taylor,
  cgr,
  isLoading,
  validation,
  onLineChange,
  onToggleValidation,
  onReset,
  hasAdjustments,
  ringHeight,
}: {
  stageIndex: number;
  taylor: ReturnType<typeof cvTaylor>;
  cgr: ReturnType<typeof cvCasagrande>;
  isLoading: boolean;
  validation: ValidationState;
  onLineChange: (stageIndex: number, key: keyof CvLineAdjust, value: number) => void;
  onToggleValidation: (key: string) => void;
  onReset: (stageIndex: number) => void;
  hasAdjustments: boolean;
  ringHeight: number;
}) {
  if (!isLoading) {
    return <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Ajustes e validação de Cv ficam bloqueados em descarregamentos.</div>;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-primary">Ajuste das retas do Cv — estágio {stageIndex + 1}</div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            disabled={!hasAdjustments}
            onClick={() => onReset(stageIndex)}
            title="Restaura os valores calculados automaticamente pelo programa"
          >
            Reset (auto)
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumericLineInput label="Taylor reta inicial m" value={taylor?.slope} onChange={(v) => onLineChange(stageIndex, "taylorSlope", v)} step={0.00001} />
          <NumericLineInput
            label="Taylor altura h₀ (mm)"
            value={taylor ? ringHeight - taylor.d0 : undefined}
            onChange={(v) => onLineChange(stageIndex, "taylorIntercept", ringHeight - v)}
            step={0.001}
          />
          <NumericLineInput label="Taylor reta U90 m" value={taylor?.slope90} onChange={(v) => onLineChange(stageIndex, "taylorSlope90", v)} step={0.00001} />
          <NumericLineInput label="t₉₀ manual (min)" value={taylor?.t90} onChange={(v) => onLineChange(stageIndex, "t90", v)} step={0.001} />
          <NumericLineInput label="Casagrande primária m" value={cgr?.primary.m} onChange={(v) => onLineChange(stageIndex, "cgrPrimaryM", v)} step={0.00001} />
          <NumericLineInput label="Casagrande primária b" value={cgr?.primary.b} onChange={(v) => onLineChange(stageIndex, "cgrPrimaryB", v)} step={0.00001} />
          <NumericLineInput label="Casagrande secundária m" value={cgr?.secondary.m} onChange={(v) => onLineChange(stageIndex, "cgrSecondaryM", v)} step={0.00001} />
          <NumericLineInput label="Casagrande secundária b" value={cgr?.secondary.b} onChange={(v) => onLineChange(stageIndex, "cgrSecondaryB", v)} step={0.00001} />
          <NumericLineInput
            label="Casagrande altura h₀ (mm)"
            value={cgr ? ringHeight - cgr.d0 : undefined}
            onChange={(v) => onLineChange(stageIndex, "cgrD0", ringHeight - v)}
            step={0.001}
          />
          <NumericLineInput label="t₅₀ manual (min)" value={cgr?.t50} onChange={(v) => onLineChange(stageIndex, "t50", v)} step={0.001} />
        </div>
      </div>
      <ValidationPanel
        title="Validação das contas do estágio"
        items={[
          { key: validationKey(stageIndex, "taylor"), label: `Taylor: t90 = ${taylor ? fmt(taylor.t90, 3) : "—"} min · Cv = ${taylor ? exp2(taylor.cv) : "—"} cm²/s` },
          { key: validationKey(stageIndex, "casagrande"), label: `Casagrande: t50 = ${cgr ? fmt(cgr.t50, 3) : "—"} min · Cv = ${cgr ? exp2(cgr.cv) : "—"} cm²/s` },
          { key: validationKey(stageIndex, "resumo"), label: "Conferência do estágio no quadro resumo" },
        ]}
        validation={validation}
        onToggle={onToggleValidation}
      />
    </div>
  );
}

function StageValidationMatrix({ rows, validation, onToggle }: { rows: any[]; validation: ValidationState; onToggle: (key: string) => void }) {
  const loadingRows = rows.filter((r) => r.phase !== "unload");
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-primary">Validação por estágio de carregamento</div>
          <div className="text-xs text-muted-foreground">Marque cada método/conta depois da conferência técnica. Descarregamentos não entram no Cv.</div>
        </div>
        <Badge variant="outline">{loadingRows.length} carregamentos</Badge>
      </div>
      <div className="overflow-x-auto">
        <Table className="text-[11px]">
          <TableHeader>
            <TableRow>
              <TableHead>Estágio</TableHead>
              <TableHead className="text-right">σ' (kPa)</TableHead>
              <TableHead className="text-right">Cv Taylor</TableHead>
              <TableHead className="text-right">Cv Cas.</TableHead>
              <TableHead className="text-center">Validar Taylor</TableHead>
              <TableHead className="text-center">Validar Cas.</TableHead>
              <TableHead className="text-center">Resumo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingRows.map((r) => (
              <TableRow key={r.stageIndex}>
                <TableCell className="font-semibold">{r.stageIndex + 1}</TableCell>
                <TableCell className="text-right font-mono">{fmt(r.sigma, 0)}</TableCell>
                <TableCell className="text-right font-mono">{exp2(r.cvTaylor)}</TableCell>
                <TableCell className="text-right font-mono">{exp2(r.cvCas)}</TableCell>
                {(["taylor", "casagrande", "resumo"] as const).map((kind) => {
                  const key = validationKey(r.stageIndex, kind);
                  return (
                    <TableCell key={kind} className="text-center">
                      <Button
                        type="button"
                        size="sm"
                        variant={validation[key] ? "default" : "outline"}
                        className="h-7 px-2 text-[10px]"
                        onClick={() => onToggle(key)}
                      >
                        {validation[key] ? "Validado" : "Validar"}
                      </Button>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ===== CHARTS =====

// ---- Labels de eixo centralizados (X horizontal, Y vertical) ----
function AxisLabelX({ value }: { value: string }) {
  return (
    <RLabel
      position="insideBottom"
      content={({ viewBox }: any) => {
        const cx = viewBox.x + viewBox.width / 2;
        const cy = viewBox.y + 22;
        return (
          <text x={cx} y={cy} textAnchor="middle" style={{ fontSize: 12, fontWeight: 700, fill: "#0f172a" }}>
            {value}
          </text>
        );
      }}
    />
  );
}
function AxisLabelY({ value }: { value: string }) {
  // Rendered via ChartFrame overlay; kept as no-op to preserve call sites.
  void value;
  return null;
}

function ChartFrame({
  height,
  xLabel: _xLabel,
  yLabel,
  children,
}: {
  height: number | string;
  xLabel?: string;
  yLabel?: string;
  children: React.ReactNode;
}) {
  // X-axis label is rendered inside the chart (above legend); only Y label is drawn as overlay here.
  void _xLabel;
  return (
    <div className="relative" style={{ height }}>
      {yLabel && (
        <span
          className="pointer-events-none absolute z-20 text-[12px] font-bold text-slate-900"
          style={{
            left: 35,
            top: "calc(50% - 30px)",
            transform: "translate(-50%, -50%) rotate(-90deg)",
            transformOrigin: "center center",
            whiteSpace: "nowrap",
          }}
        >
          {yLabel}
        </span>
      )}
      <div className="relative h-full w-full">{children}</div>
    </div>
  );
}

// Domínio compartilhado de e (índice de vazios) — múltiplos de 0,05, com folga.
const sharedEDomain = (curve: { e: number }[], extra: number[] = []): [number, number] => {
  const ys = [...curve.map((p) => p.e), ...extra].filter((v) => isFinite(v));
  if (ys.length === 0) return [0, 1];
  const yMin = Math.floor(Math.min(...ys) * 20) / 20 - 0.05;
  const yMax = Math.ceil(Math.max(...ys) * 20) / 20 + 0.05;
  return [yMin, yMax];
};

// Domínio compartilhado de σ' em escala log — sempre [1, 10000] para todos os gráficos.
const sharedSigmaLogDomain = (_curve: { sigma: number }[]): [number, number] => {
  return [1, 10000];
};

// Topo arredondado para eixos aritméticos de σ' (passos de 100 kPa).
const sharedSigmaArithMax = (curve: { sigma: number }[]): number => {
  const ss = curve.map((p) => p.sigma).filter((s) => isFinite(s));
  if (ss.length === 0) return 1000;
  return Math.ceil(Math.max(...ss) / 100) * 100;
};

// niceTicks / decimalsFor / fmtNiceTick foram extraídos para
// src/features/oedometer/charts/shared/axisTicks.ts

function EvsSigmaChart({
  curve,
  cas,
  ps,
  e0,
  height = 380,
  showResults = true,
  eDomain,
  sigmaLogDomain,
}: {
  curve: { sigma: number; e: number; phase?: "load" | "unload" }[];
  cas: ReturnType<typeof casagrandeSigmaP>;
  ps: ReturnType<typeof pachecoSilvaSigmaP>;
  e0: number;
  height?: number;
  showResults?: boolean;
  eDomain?: [number, number];
  sigmaLogDomain?: [number, number];
}) {


  // Split into Loading (virgin) and Unload/Reload segments based on stage order
  const loadPts: { sigma: number; e: number }[] = [];
  const unloadPts: { sigma: number; e: number }[] = [];
  let maxSigma = 0;
  let phase: "load" | "unload" = "load";
  for (const p of curve) {
    if (p.sigma >= maxSigma && phase === "load") {
      loadPts.push({ sigma: p.sigma, e: p.e });
      maxSigma = p.sigma;
    } else {
      phase = "unload";
      // include the last loading point as the start of the unload branch
      if (unloadPts.length === 0 && loadPts.length > 0) {
        const last = loadPts[loadPts.length - 1];
        unloadPts.push({ sigma: last.sigma, e: last.e });
      }
      unloadPts.push({ sigma: p.sigma, e: p.e });
    }
  }

  const xDomain: [number, number] = sigmaLogDomain ?? sharedSigmaLogDomain(curve);
  const xMinLog = Math.log10(xDomain[0]);
  const xMaxLog = Math.log10(xDomain[1]);

  // Build a master dataset with rows keyed by sigma. For each sigma we keep
  // both eLoad and eUnload so a sigma value that appears in both branches does
  // NOT overwrite the loading point (that was the source of the zig-zag bug).
  const rowMap = new Map<number, any>();
  const ensure = (sigma: number) => {
    let r = rowMap.get(sigma);
    if (!r) {
      r = { sigma };
      rowMap.set(sigma, r);
    }
    return r;
  };
  loadPts.forEach((p) => (ensure(p.sigma).eLoad = p.e));
  unloadPts.forEach((p) => {
    const r = ensure(p.sigma);
    // don't clobber an existing eLoad with eUnload
    r.eUnload = p.e;
  });

  const data = Array.from(rowMap.values())
    .sort((a, b) => a.sigma - b.sigma)
    .map((r) => ({ ...r, xLog: Math.log10(r.sigma) }));

  const [yMinTmp, yMaxTmp] = eDomain ?? sharedEDomain(curve, [e0]);

  // Clip an analytical line y = m·log10(σ) + b to the visible rectangle.
  // Returns segment endpoints in (σ, e) coordinates (σ already in linear form).
  // Returns segment endpoints in (log10 σ, e) coordinates so they can be
  // consumed directly by a LINEAR x-axis that we format as log.
  const clipLogLine = (m: number, b: number) => {
    const pts: { x: number; y: number }[] = [];
    const push = (x: number, y: number) => {
      if (
        x >= xMinLog - 1e-9 &&
        x <= xMaxLog + 1e-9 &&
        y >= yMinTmp - 1e-9 &&
        y <= yMaxTmp + 1e-9
      ) {
        pts.push({ x, y });
      }
    };
    push(xMinLog, m * xMinLog + b);
    push(xMaxLog, m * xMaxLog + b);
    if (Math.abs(m) > 1e-12) {
      push((yMinTmp - b) / m, yMinTmp);
      push((yMaxTmp - b) / m, yMaxTmp);
    }
    if (pts.length < 2) return null;
    pts.sort((a, b) => a.x - b.x);
    const a = pts[0];
    const c = pts[pts.length - 1];
    if (Math.abs(c.x - a.x) < 1e-9) return null;
    return {
      start: { x: a.x, y: a.y },
      end: { x: c.x, y: c.y },
    };
  };

  const casVirginSeg = cas ? clipLogLine(cas.virgin.m, cas.virgin.b) : null;
  const casBisectorSeg = cas ? clipLogLine(cas.bisector.m, cas.bisector.b) : null;
  const casTangentSeg = cas ? clipLogLine(cas.tangent.m, cas.tangent.b) : null;
  const psVirginSeg = ps ? clipLogLine(ps.virgin.m, ps.virgin.b) : null;

  const yMin = yMinTmp;
  const yMax = yMaxTmp;
  const annotationStyle = (sigma: number, e: number, dx = 0, dy = 0): React.CSSProperties => {
    const xPct = (Math.log10(sigma) - Math.log10(xDomain[0])) / (Math.log10(xDomain[1]) - Math.log10(xDomain[0]));
    const yPct = 1 - (e - yMin) / (yMax - yMin);
    return {
      left: `${8 + xPct * 82}%`,
      top: `${6 + yPct * 76}%`,
      transform: `translate(${dx}px, ${dy}px)`,
    };
  };

  const lx = (sigma: number) => Math.log10(sigma);
  return (
    <ChartFrame height={height} xLabel={"Tensão Vertical Efetiva σ'ᵥ [kPa]"} yLabel={"Índice de Vazios - e [-]"}>
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 18, bottom: 30, left: 25 }}>
        <CartesianGrid stroke="#cbd5e1" strokeDasharray="2 3" />
        <XAxis
          dataKey="xLog"
          type="number"
          domain={[xMinLog, xMaxLog]}
          ticks={logTicks(xDomain[0], xDomain[1]).map((v) => Math.log10(v))}
          tickFormatter={(v) => fmtLogTick(Math.pow(10, Number(v)))}
          tick={{ fontSize: 11, fill: "#334155" }}
          stroke="#64748b"
          allowDuplicatedCategory={false}
        >
          <RLabel value={"Tensão Vertical Efetiva σ'ᵥ [kPa]"} position="insideBottom" offset={-2} style={{ textAnchor: "middle", fontSize: 12, fontWeight: 700, fill: "#0f172a" }} />
        </XAxis>
        <YAxis
          domain={[yMin, yMax]}
          tick={{ fontSize: 11, fill: "#334155" }}
          stroke="#64748b"
          tickFormatter={(v) => fmt(v, 2)}
          ticks={niceTicks(yMin, yMax, 8)}
        >
          <AxisLabelY value="Índice de Vazios - e [-]" />
        </YAxis>
        <Tooltip
          formatter={(v: number, n) => [fmt(v, 4), String(n)]}
          labelFormatter={(v) => `σ' = ${Math.pow(10, Number(v)).toFixed(1)} kPa`}
          contentStyle={{ fontSize: 11 }}
        />
        <Legend
          verticalAlign="bottom"
          align="center"
          iconSize={10}
          wrapperStyle={{ fontSize: 10, lineHeight: "16px", paddingTop: 6 }}
        />

        {cas && (
          <>
            {casVirginSeg && (
              <ReferenceLine
                segment={[casVirginSeg.start, casVirginSeg.end]}
                stroke={RED}
                strokeWidth={1.8}
                strokeDasharray="6 3"
                ifOverflow="visible"
                label={showResults ? { value: "Reta virgem", position: "insideBottomRight", fill: RED, fontSize: 10, fontWeight: 600 } : undefined}
              />
            )}
            {casTangentSeg && (
              <ReferenceLine
                segment={[casTangentSeg.start, casTangentSeg.end]}
                stroke={SLATE_SOFT}
                strokeWidth={1.4}
                strokeDasharray="2 3"
                ifOverflow="visible"
                label={showResults ? { value: "Tangente em P", position: "insideTopLeft", fill: SLATE_SOFT, fontSize: 10, fontWeight: 600 } : undefined}
              />
            )}
            <ReferenceLine
              segment={[{ x: xMinLog, y: cas.horizontal }, { x: xMaxLog, y: cas.horizontal }]}
              stroke={SLATE_SOFT}
              strokeWidth={1.4}
              strokeDasharray="2 3"
              ifOverflow="visible"
              label={showResults ? { value: "Horizontal em P", position: "insideTopRight", fill: SLATE_SOFT, fontSize: 10, fontWeight: 600 } : undefined}
            />
            {casBisectorSeg && (
              <ReferenceLine
                segment={[casBisectorSeg.start, casBisectorSeg.end]}
                stroke={GREEN}
                strokeWidth={2}
                strokeDasharray="5 3"
                ifOverflow="visible"
                label={showResults ? { value: "Bissetriz", position: "insideTop", fill: GREEN, fontSize: 10, fontWeight: 700 } : undefined}
              />
            )}
            <ReferenceLine x={lx(cas.sigmaP)} stroke={GREEN} strokeWidth={2} strokeDasharray="3 2" label={showResults ? { value: `σ'ᵥₘ Casagrande = ${fmt(cas.sigmaP, 0)} kPa`, position: "top", fill: GREEN, fontSize: 12, fontWeight: 700 } : undefined} />
            <ReferenceDot x={cas.point.x} y={cas.point.y} r={5} fill={GREEN} stroke="#fff" label={showResults ? { value: "P", position: "top", fill: GREEN, fontSize: 12, fontWeight: 700 } : undefined} />
            <ReferenceDot x={lx(cas.sigmaP)} y={cas.intersection.y} r={6} fill={GREEN} stroke="#fff" label={showResults ? { value: `Cas. ${fmt(cas.sigmaP, 0)} kPa`, position: "right", fill: GREEN, fontSize: 12, fontWeight: 700 } : undefined} />
          </>
        )}

        {ps && (
          <>
            {psVirginSeg && (
              <ReferenceLine
                segment={[psVirginSeg.start, psVirginSeg.end]}
                stroke={RED}
                strokeWidth={1.8}
                ifOverflow="visible"
                label={showResults ? { value: "Reta virgem (PS)", position: "insideBottomLeft", fill: RED, fontSize: 10, fontWeight: 600 } : undefined}
              />
            )}
            <ReferenceLine
              segment={[{ x: xMinLog, y: ps.e0Line }, { x: xMaxLog, y: ps.e0Line }]}
              stroke={PURPLE}
              strokeWidth={1.4}
              strokeDasharray="3 2"
              ifOverflow="visible"
              label={showResults ? { value: `e₀ = ${fmt(ps.e0Line, 3)}`, position: "insideTopLeft", fill: PURPLE, fontSize: 10, fontWeight: 600 } : undefined}
            />
            {/* Vertical A→B */}
            <ReferenceLine
              segment={[{ x: lx(ps.A.sigma), y: ps.A.y }, { x: lx(ps.B.sigma), y: ps.B.y }]}
              stroke={PURPLE}
              strokeWidth={1.6}
              strokeDasharray="4 2"
              ifOverflow="visible"
            />
            {/* Horizontal B→C */}
            <ReferenceLine
              segment={[{ x: lx(ps.B.sigma), y: ps.B.y }, { x: lx(ps.C.sigma), y: ps.C.y }]}
              stroke={PURPLE}
              strokeWidth={1.6}
              strokeDasharray="4 2"
              ifOverflow="visible"
            />
            <ReferenceLine x={lx(ps.A.sigma)} stroke={PURPLE} strokeWidth={1.3} strokeDasharray="4 2" label={showResults ? { value: `A→B σ'A=${fmt(ps.A.sigma, 0)} kPa`, position: "top", fill: PURPLE, fontSize: 10, fontWeight: 600 } : undefined} />
            <ReferenceLine y={ps.B.y} stroke={PURPLE} strokeWidth={1.3} strokeDasharray="4 2" label={showResults ? { value: `B→C e=${fmt(ps.B.y, 3)}`, position: "right", fill: PURPLE, fontSize: 10, fontWeight: 600 } : undefined} />
            <ReferenceDot x={lx(ps.A.sigma)} y={ps.A.y} r={4} fill={PURPLE} stroke="#fff" label={showResults ? { value: "A", position: "top", fill: PURPLE, fontSize: 11, fontWeight: 700 } : undefined} />
            <ReferenceDot x={lx(ps.B.sigma)} y={ps.B.y} r={4} fill={PURPLE} stroke="#fff" label={showResults ? { value: "B", position: "left", fill: PURPLE, fontSize: 11, fontWeight: 700 } : undefined} />
            <ReferenceDot x={lx(ps.C.sigma)} y={ps.C.y} r={6} fill={PURPLE} stroke="#fff" label={showResults ? { value: `C / PS ${fmt(ps.sigmaP, 0)} kPa`, position: "right", fill: PURPLE, fontSize: 12, fontWeight: 700 } : undefined} />
            <ReferenceLine x={lx(ps.sigmaP)} stroke={PURPLE} strokeWidth={2} strokeDasharray="3 3" label={showResults ? { value: `σ'ᵥₘ Pacheco Silva = ${fmt(ps.sigmaP, 0)} kPa`, position: "insideTopRight", fill: PURPLE, fontSize: 12, fontWeight: 700 } : undefined} />
          </>
        )}


        {/* Unload / Reload branch */}
        {unloadPts.length > 1 && (
          <Line
            type="monotone"
            dataKey="eUnload"
            name="Desc./Recarreg."
            stroke={BRAND2}
            strokeWidth={1.8}
            strokeDasharray="4 3"
            dot={{ r: 3, stroke: BRAND2, fill: "#fff", strokeWidth: 1.5 }}
            connectNulls
            isAnimationActive={false}
          />
        )}

        {/* Main loading (virgin) lab curve */}
        <Line
          type="monotone"
          dataKey="eLoad"
          name="Carregamento"
          stroke={BRAND}
          strokeWidth={2.6}
          dot={{ r: 4, stroke: BRAND, fill: "#fff", strokeWidth: 2 }}
          connectNulls
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
      {showResults && cas && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border bg-background/95 px-2 py-1 text-[11px] font-semibold shadow-sm"
          style={{ ...annotationStyle(cas.sigmaP, cas.intersection.y, 8, -26), borderColor: GREEN, color: GREEN }}
        >
          σ'ᵥₘ Casagrande<br />{fmt(cas.sigmaP, 2)} kPa
        </div>
      )}
      {showResults && ps && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border bg-background/95 px-2 py-1 text-[11px] font-semibold shadow-sm"
          style={{ ...annotationStyle(ps.sigmaP, ps.C.y, 8, 8), borderColor: PURPLE, color: PURPLE }}
        >
          σ'ᵥₘ Pacheco Silva<br />{fmt(ps.sigmaP, 2)} kPa
        </div>
      )}
      {showResults && cas && (
        <div
          className="pointer-events-none absolute z-10 rounded-full border bg-background/95 px-1.5 py-0.5 text-[10px] font-bold shadow-sm"
          style={{ ...annotationStyle(Math.pow(10, cas.point.x), cas.point.y, -18, -22), borderColor: GREEN, color: GREEN }}
        >
          P
        </div>
      )}
      {showResults && ps && (
        <>
          <div className="pointer-events-none absolute z-10 rounded-full border bg-background/95 px-1.5 py-0.5 text-[10px] font-bold shadow-sm" style={{ ...annotationStyle(ps.A.sigma, ps.A.y, -12, -20), borderColor: PURPLE, color: PURPLE }}>A</div>
          <div className="pointer-events-none absolute z-10 rounded-full border bg-background/95 px-1.5 py-0.5 text-[10px] font-bold shadow-sm" style={{ ...annotationStyle(ps.B.sigma, ps.B.y, -20, 2), borderColor: PURPLE, color: PURPLE }}>B</div>
          <div className="pointer-events-none absolute z-10 rounded-full border bg-background/95 px-1.5 py-0.5 text-[10px] font-bold shadow-sm" style={{ ...annotationStyle(ps.C.sigma, ps.C.y, -8, -18), borderColor: PURPLE, color: PURPLE }}>C</div>
        </>
      )}
    </ChartFrame>
  );
}

function TaylorChart({
  data,
  taylor,
  ringHeight,
  height = 320,
  showResults = true,
}: {
  data: any[];
  taylor: ReturnType<typeof cvTaylor>;
  ringHeight: number;
  height?: number;
  showResults?: boolean;
}) {
  // Use ALTURA do corpo de prova (mm), not ΔH — engineering convention from references
  const points = data.map((p) => ({ x: p.x as number, h: ringHeight - p.d, d: p.d }));
  const hVals = points.map((p) => p.h);
  const hData_min = Math.min(...hVals);
  const hData_max = Math.max(...hVals);
  const maxX = Math.max(...points.map((p) => p.x));
  const xMax = Math.ceil(maxX);
  // Tight y-domain to keep the lab curve readable
  const pad = (hData_max - hData_min) * 0.18 || 0.1;
  const yMin = hData_min - pad;
  const yMax = hData_max + pad;

  // build a dense grid for the analytical construction lines (clipped to Y domain)
  const chartData = points.map((p) => ({ x: p.x, h: p.h }));

  // Algebraically clip a decreasing line h(x) = h0 - slope*x to the visible rectangle [0..xMax] × [yMin..yMax]
  const clipDecLine = (h0: number, slope: number) => {
    if (slope <= 0) return null;
    let xStart = Math.max(0, (h0 - yMax) / slope);
    let xEnd = Math.min(xMax, (h0 - yMin) / slope);
    if (xEnd <= xStart) return null;
    return {
      start: { x: xStart, y: h0 - slope * xStart },
      end: { x: xEnd, y: h0 - slope * xEnd },
    };
  };
  const h0 = taylor ? ringHeight - taylor.d0 : 0;
  const segReta = taylor ? clipDecLine(h0, taylor.slope) : null;
  const segReta90 = taylor ? clipDecLine(h0, taylor.slope90) : null;
  const sqrtT90 = taylor ? Math.sqrt(taylor.t90) : null;
  const h90 = taylor ? ringHeight - taylor.d90 : null;

  return (
    <div>
      <ChartFrame height={height} xLabel={"Raiz do Tempo - √t [√min]"} yLabel={"Altura do Corpo de Prova - H [mm]"}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 18, bottom: 38, left: 25 }}>
            <CartesianGrid stroke="#cbd5e1" strokeDasharray="2 3" />
            <XAxis dataKey="x" type="number" domain={[0, 40]} ticks={[0, 5, 10, 15, 20, 25, 30, 35, 40]} tick={{ fontSize: 11, fill: "#334155" }} stroke="#64748b">
              <RLabel value={'Raiz do Tempo - √t [√min]'} position="insideBottom" offset={-2} style={{ textAnchor: "middle", fontSize: 12, fontWeight: 700, fill: "#0f172a" }} />
            </XAxis>
            <YAxis
              type="number"
              domain={[yMin, yMax]}
              allowDataOverflow={false}
              tick={{ fontSize: 11, fill: "#334155" }}
              stroke="#64748b"
              tickFormatter={(v) => v.toFixed(2)}
              ticks={niceTicks(yMin, yMax, 10)}
            >
              <AxisLabelY value="Altura do Corpo de Prova - H [mm]" />
            </YAxis>
            <Tooltip formatter={(v: number) => fmt(v, 4)} labelFormatter={(v) => `√t = ${Number(v).toFixed(3)}`} contentStyle={{ fontSize: 11 }} />
            <Legend verticalAlign="bottom" align="center" iconSize={10} wrapperStyle={{ fontSize: 10 }} />
  
            {/* Construction lines as ReferenceLine segments (algebraically clipped to the visible rectangle) */}
            {segReta && (
              <ReferenceLine
                segment={[segReta.start, segReta.end]}
                stroke={SLATE}
                strokeWidth={1.8}
                strokeDasharray="6 4"
                ifOverflow="visible"
                label={showResults ? { value: "Tangente inicial", position: "insideTopLeft", fill: SLATE, fontSize: 10, fontWeight: 600 } : undefined}
              />
            )}
            {segReta90 && (
              <ReferenceLine
                segment={[segReta90.start, segReta90.end]}
                stroke={ACCENT}
                strokeWidth={2}
                ifOverflow="visible"
                label={showResults ? { value: "Reta U90 (×1,15)", position: "insideBottomRight", fill: ACCENT, fontSize: 10, fontWeight: 700 } : undefined}
              />
            )}
  
            {/* Lab curve */}
            <Line type="monotone" dataKey="h" name="Curva do ensaio" stroke={GREEN} strokeWidth={2.4} dot={{ r: 3.5, fill: "#fff", stroke: GREEN, strokeWidth: 1.6 }} connectNulls isAnimationActive={false} />
  
            {/* Intersection construction: vertical drop + horizontal projection (blue, like reference) */}
            {taylor && sqrtT90 !== null && h90 !== null && (
              <>
                <ReferenceLine
                  segment={[{ x: sqrtT90, y: yMin }, { x: sqrtT90, y: h90 }]}
                  stroke={BRAND2}
                  strokeWidth={1.6}
                  ifOverflow="visible"
                />
                <ReferenceLine
                  segment={[{ x: 0, y: h90 }, { x: sqrtT90, y: h90 }]}
                  stroke={BRAND2}
                  strokeWidth={1.6}
                  ifOverflow="visible"
                />
                <ReferenceDot x={sqrtT90} y={h90} r={5} fill={BRAND2} stroke="#fff" />
                {showResults && (
                  <>
                    <ReferenceLine x={sqrtT90} stroke="transparent" label={{ value: `√t₉₀ = ${fmt(sqrtT90, 2)}`, position: "top", fill: BRAND2, fontSize: 11, fontWeight: 700 }} />
                    <ReferenceLine y={h90} stroke="transparent" label={{ value: `h₉₀ = ${fmt(h90, 2)} mm`, position: "left", fill: BRAND2, fontSize: 10, fontWeight: 600 }} />
                  </>
                )}
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </ChartFrame>
      {taylor && showResults && (
        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="rounded border px-2 py-0.5">t₉₀ = {fmt(taylor.t90, 2)} min · Cv = {exp2(taylor.cv)} cm²/s</span>
          <span className="rounded border px-2 py-0.5">Reta: ΔH = {fmt(taylor.slope, 5)}·√t + {fmt(taylor.d0, 5)}</span>
          <span className="rounded border px-2 py-0.5">Reta U90: ΔH = {fmt(taylor.slope90, 5)}·√t + {fmt(taylor.d0, 5)}</span>
        </div>
      )}

    </div>
  );
}

function MultiTaylorChart({
  stages,
  ringHeight,
  height = 520,
  withOverlays = false,
  cvAdjust,
}: {
  stages: Stage[];
  ringHeight: number;
  height?: number;
  withOverlays?: boolean;
  cvAdjust?: Record<number, CvLineAdjust>;
}) {
  const loadStages = stages.map((s, i) => ({ s, i }));
  const colors = ["#141414", "#0D9488", "#475569", "#F59E0B", "#0284C7", "#059669", "#141414", "#7C3AED"];
  const maxX = Math.max(...loadStages.flatMap(({ s }) => s.readings.map((r) => Math.sqrt(r.t))));
  const rowMap = new Map<number, any>();
  for (let i = 0; i <= 120; i++) {
    const x = +(maxX * i / 120).toFixed(3);
    rowMap.set(x, { x });
  }
  loadStages.forEach(({ s, i: si }, seriesIdx) => {
    s.readings.forEach((r) => {
      const x = +Math.sqrt(r.t).toFixed(3);
      const row = rowMap.get(x) ?? { x };
      row[`h${seriesIdx}`] = +(ringHeight - r.d).toFixed(4);
      rowMap.set(x, row);
    });
  });
  const data = Array.from(rowMap.values()).sort((a, b) => a.x - b.x);
  const heights = loadStages.flatMap(({ s }) => s.readings.map((r) => ringHeight - r.d));
  const yMin = Math.floor((Math.min(...heights) - 0.1) * 4) / 4;
  const yMax = Math.ceil((Math.max(...heights) + 0.1) * 4) / 4;
  const overlays = withOverlays
    ? loadStages.map(({ s, i: si }, seriesIdx) => {
        const isLoading = si === 0 || s.sigma >= stages[si - 1].sigma;
        if (!isLoading) return null;
        const prevDial = si === 0 ? 0 : stages[si - 1].finalDial;
        const Hdrain = (ringHeight - (prevDial + s.finalDial) / 2) / 2;
        const base = cvTaylor(s, Hdrain);
        const tay = applyTaylorAdjustment(s, Hdrain, base, cvAdjust?.[si]);
        if (!tay) return null;
        const color = colors[seriesIdx % colors.length];
        const h0 = ringHeight - tay.d0;
        const xEnd = Math.min(Math.sqrt(tay.t90) * 1.25, maxX);
        return {
          color,
          h0,
          xEnd,
          slope: tay.slope,
          slope90: tay.slope90,
          sqrtT90: Math.sqrt(tay.t90),
          h90: ringHeight - tay.d90,
        };
      })
    : [];
  return (
    <div>
      <ChartFrame height={height} xLabel={"Raiz do Tempo - √t [√min]"} yLabel={"Altura do Corpo de Prova - H [mm]"}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 18, bottom: 38, left: 25 }}>
            <CartesianGrid stroke="#d7d7d7" />
            <XAxis dataKey="x" type="number" domain={[0, 40]} ticks={[0, 5, 10, 15, 20, 25, 30, 35, 40]} tick={{ fontSize: 10, fill: "#111827" }} stroke="#4b5563">
              <RLabel value={'Raiz do Tempo - √t [√min]'} position="insideBottom" offset={-2} style={{ textAnchor: "middle", fontSize: 12, fontWeight: 700, fill: "#0f172a" }} />
            </XAxis>
            <YAxis domain={[yMin, yMax]} ticks={niceTicks(yMin, yMax, 10)} tick={{ fontSize: 10, fill: "#111827" }} stroke="#4b5563" tickFormatter={(v) => fmt(v, 2)}>
              <AxisLabelY value="Altura do Corpo de Prova - H [mm]" />
            </YAxis>
            <Tooltip formatter={(v: number) => `${fmt(v, 3)} mm`} labelFormatter={(v) => `√t = ${fmt(Number(v), 2)}`} contentStyle={{ fontSize: 11 }} />
            <Legend verticalAlign="bottom" align="center" layout="horizontal" iconSize={12} wrapperStyle={{ fontSize: 10, paddingTop: 6 }} />
            {loadStages.map(({ s, i: si }, idx) => {
              const isLoading = si === 0 || s.sigma >= stages[si - 1].sigma;
              return (
                <Line
                  key={s.sigma + idx}
                  type="monotone"
                  dataKey={`h${idx}`}
                  name={`${sigmaLabel(s.sigma)} (${isLoading ? "Carregamento" : "Descarregamento"})`}
                  stroke={colors[idx % colors.length]}
                  strokeWidth={1.8}
                  strokeDasharray={isLoading ? undefined : "5 3"}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              );
            })}
            {overlays.flatMap((ov, idx) => ov ? [
              <ReferenceLine
                key={`tan-${idx}`}
                segment={[{ x: 0, y: ov.h0 }, { x: ov.xEnd, y: ov.h0 - ov.slope * ov.xEnd }]}
                stroke={ov.color}
                strokeWidth={1}
                strokeDasharray="4 3"
                ifOverflow="hidden"
              />,
              <ReferenceLine
                key={`u90-${idx}`}
                segment={[{ x: 0, y: ov.h0 }, { x: ov.xEnd, y: ov.h0 - ov.slope90 * ov.xEnd }]}
                stroke={ov.color}
                strokeWidth={1}
                strokeDasharray="2 2"
                ifOverflow="hidden"
              />,
              <ReferenceDot key={`t90-${idx}`} x={ov.sqrtT90} y={ov.h90} r={3.5} fill={ov.color} stroke="#fff" ifOverflow="hidden" />,
            ] : [])}
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
      {withOverlays && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          Linhas tracejadas: tangente inicial e reta U90 de cada estágio. Pontos cheios: t₉₀.
        </div>
      )}
    </div>
  );
}

function MultiCasagrandeChart({
  stages,
  ringHeight,
  height = 520,
  withOverlays = false,
  cvAdjust,
}: {
  stages: Stage[];
  ringHeight: number;
  height?: number;
  withOverlays?: boolean;
  cvAdjust?: Record<number, CvLineAdjust>;
}) {
  const loadStages = stages.map((s, i) => ({ s, i }));
  const colors = ["#141414", "#0D9488", "#475569", "#F59E0B", "#0284C7", "#059669", "#141414", "#7C3AED"];
  const data = loadStages.flatMap(({ s }, idx) =>
    s.readings
      .filter((r) => r.t > 0)
      .map((r) => ({ x: r.t, [`h${idx}`]: +(ringHeight - r.d).toFixed(4) }))
  );
  const times = loadStages.flatMap(({ s }) => s.readings.filter((r) => r.t > 0).map((r) => r.t));
  const heights = loadStages.flatMap(({ s }) => s.readings.map((r) => ringHeight - r.d));
  const yMin = Math.floor((Math.min(...heights) - 0.1) * 4) / 4;
  const yMax = Math.ceil((Math.max(...heights) + 0.1) * 4) / 4;
  const xMin = Math.pow(10, Math.floor(Math.log10(Math.min(...times))));
  const xMax = Math.pow(10, Math.ceil(Math.log10(Math.max(...times))));
  const overlays = withOverlays
    ? loadStages.map(({ s, i: si }, seriesIdx) => {
        const isLoading = si === 0 || s.sigma >= stages[si - 1].sigma;
        if (!isLoading) return null;
        const prevDial = si === 0 ? 0 : stages[si - 1].finalDial;
        const Hdrain = (ringHeight - (prevDial + s.finalDial) / 2) / 2;
        const base = cvCasagrande(s, Hdrain);
        const cgr = applyCgrAdjustment(s, Hdrain, base, cvAdjust?.[si]);
        if (!cgr) return null;
        const color = colors[seriesIdx % colors.length];
        const tsLog = s.readings.filter((r) => r.t > 0).map((r) => Math.log10(r.t));
        const xLo = Math.min(...tsLog);
        const xHi = Math.max(...tsLog);
        return {
          color,
          primSeg: [
            { x: Math.pow(10, xLo), y: ringHeight - (cgr.primary.m * xLo + cgr.primary.b) },
            { x: Math.pow(10, xHi), y: ringHeight - (cgr.primary.m * xHi + cgr.primary.b) },
          ],
          secSeg: [
            { x: Math.pow(10, xLo), y: ringHeight - (cgr.secondary.m * xLo + cgr.secondary.b) },
            { x: Math.pow(10, xHi), y: ringHeight - (cgr.secondary.m * xHi + cgr.secondary.b) },
          ],
          t50: cgr.t50,
          h50: ringHeight - cgr.d50,
        };
      })
    : [];
  return (
    <div>
      <ChartFrame height={height} xLabel={"Tempo - t [min] (escala log)"} yLabel={"Altura do Corpo de Prova - H [mm]"}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.sort((a, b) => a.x - b.x)} margin={{ top: 8, right: 18, bottom: 38, left: 25 }}>
            <CartesianGrid stroke="#d7d7d7" />
            <XAxis
              dataKey="x"
              type="number"
              scale="log"
              domain={[xMin, xMax]}
              ticks={logTicks(xMin, xMax)}
              tick={{ fontSize: 10, fill: "#111827" }}
              stroke="#4b5563"
            >
              <RLabel value={'Tempo - t [min] (escala log)'} position="insideBottom" offset={-2} style={{ textAnchor: "middle", fontSize: 12, fontWeight: 700, fill: "#0f172a" }} />
            </XAxis>
            <YAxis domain={[yMin, yMax]} ticks={niceTicks(yMin, yMax, 10)} tick={{ fontSize: 10, fill: "#111827" }} stroke="#4b5563" tickFormatter={(v) => fmt(v, 2)}>
              <AxisLabelY value="Altura do Corpo de Prova - H [mm]" />
            </YAxis>
            <Tooltip formatter={(v: number) => `${fmt(v, 3)} mm`} labelFormatter={(v) => `t = ${fmt(Number(v), 2)} min`} contentStyle={{ fontSize: 11 }} />
            <Legend verticalAlign="bottom" align="center" layout="horizontal" iconSize={12} wrapperStyle={{ fontSize: 10, paddingTop: 6 }} />
            {loadStages.map(({ s, i: si }, idx) => {
              const isLoading = si === 0 || s.sigma >= stages[si - 1].sigma;
              return (
                <Line
                  key={s.sigma + idx}
                  type="monotone"
                  dataKey={`h${idx}`}
                  name={`${sigmaLabel(s.sigma)} (${isLoading ? "Carregamento" : "Descarregamento"})`}
                  stroke={colors[idx % colors.length]}
                  strokeWidth={1.8}
                  strokeDasharray={isLoading ? undefined : "5 3"}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              );
            })}
            {overlays.flatMap((ov, idx) => ov ? [
              <ReferenceLine key={`prim-${idx}`} segment={ov.primSeg} stroke={ov.color} strokeWidth={1} strokeDasharray="4 3" ifOverflow="hidden" />,
              <ReferenceLine key={`sec-${idx}`} segment={ov.secSeg} stroke={ov.color} strokeWidth={1} strokeDasharray="2 2" ifOverflow="hidden" />,
              <ReferenceDot key={`t50-${idx}`} x={ov.t50} y={ov.h50} r={3.5} fill={ov.color} stroke="#fff" ifOverflow="hidden" />,
            ] : [])}
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
      {withOverlays && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          Linhas tracejadas: tangente primária e reta secundária de cada estágio. Pontos cheios: t₅₀.
        </div>
      )}
    </div>
  );
}

function CasagrandeTimeChart({
  data,
  cgr,
  ringHeight,
  height = 320,
  showResults = true,
}: {
  data: any[];
  cgr: ReturnType<typeof cvCasagrande>;
  ringHeight: number;
  height?: number;
  showResults?: boolean;
}) {
  // Plot ALTURA do CP (mm) — engineering reference convention
  const points = data.map((p) => ({ x: p.x as number, h: ringHeight - p.d, d: p.d, t: p.t }));
  const hVals = points.map((p) => p.h);
  const hMin = Math.min(...hVals);
  const hMax = Math.max(...hVals);
  const h0Bound = cgr ? ringHeight - cgr.d0 : hMax;
  const h100Bound = cgr ? ringHeight - cgr.d100 : hMin;
  const xVals = points.map((p) => p.x);
  const xMin = Math.min(...xVals);
  const xMax = Math.max(...xVals);
  // Tight y-domain anchored to the lab data + d0/d100 horizontals
  const dataTop = Math.max(hMax, h0Bound);
  const dataBot = Math.min(hMin, h100Bound);
  const pad = (dataTop - dataBot) * 0.12 || 0.05;
  const yMin = dataBot - pad;
  const yMax = dataTop + pad;
  const chartData = points.map((p) => ({ x: p.x, h: p.h }));

  // Algebraically clip a line h(x) = ringHeight - (m*x + b) to [xMin..xMax] × [yMin..yMax]
  const clipLogLine = (m: number, b: number) => {
    if (m === 0) return null;
    // h = ringHeight - b - m*x  =>  x = (ringHeight - b - h)/m
    const candidates = [
      { x: xMin, y: ringHeight - (m * xMin + b) },
      { x: xMax, y: ringHeight - (m * xMax + b) },
      { x: (ringHeight - b - yMin) / m, y: yMin },
      { x: (ringHeight - b - yMax) / m, y: yMax },
    ].filter((pt) => pt.x >= xMin - 1e-9 && pt.x <= xMax + 1e-9 && pt.y >= yMin - 1e-9 && pt.y <= yMax + 1e-9);
    if (candidates.length < 2) return null;
    candidates.sort((a, c) => a.x - c.x);
    return { start: candidates[0], end: candidates[candidates.length - 1] };
  };
  const segPrim = cgr ? clipLogLine(cgr.primary.m, cgr.primary.b) : null;
  const segSec = cgr ? clipLogLine(cgr.secondary.m, cgr.secondary.b) : null;

  // Parabola-correction triangle: pick t1 small, t2 = 4·t1; Δ = d(t2)-d(t1) → d0 = d(t1)-Δ
  let para: { x1: number; x2: number; h1: number; h2: number; h0: number } | null = null;
  if (cgr && points.length >= 2) {
    const tCandidates = points.filter((p) => p.t > 0 && p.t < cgr.t50 / 2);
    if (tCandidates.length >= 1) {
      const p1 = tCandidates[0];
      const t1 = p1.t;
      const t2 = t1 * 4;
      const x2log = Math.log10(t2);
      // interpolate d at t2
      const sorted = [...points].filter((p) => p.t > 0).sort((a, b) => a.t - b.t);
      let dAtT2: number | null = null;
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].t <= t2 && sorted[i + 1].t >= t2) {
          const f = (t2 - sorted[i].t) / (sorted[i + 1].t - sorted[i].t);
          dAtT2 = sorted[i].d + f * (sorted[i + 1].d - sorted[i].d);
          break;
        }
      }
      if (dAtT2 !== null) {
        const delta = dAtT2 - p1.d;
        const d0Calc = p1.d - delta;
        para = {
          x1: Math.log10(t1),
          x2: x2log,
          h1: ringHeight - p1.d,
          h2: ringHeight - dAtT2,
          h0: ringHeight - d0Calc,
        };
      }
    }
  }

  const h50 = cgr ? ringHeight - cgr.d50 : null;
  const h100 = cgr ? ringHeight - cgr.d100 : null;
  const h0 = cgr ? ringHeight - cgr.d0 : null;
  const xT50 = cgr ? Math.log10(cgr.t50) : null;

  return (
    <div>
      <ChartFrame height={height} xLabel={"Tempo - t [min] (escala log)"} yLabel={"Altura do Corpo de Prova - H [mm]"}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 18, bottom: 38, left: 25 }}>
            <CartesianGrid stroke="#cbd5e1" strokeDasharray="2 3" />
            <XAxis dataKey="x" type="number" domain={[xMin, xMax]} tick={{ fontSize: 11, fill: "#334155" }} stroke="#64748b" tickFormatter={(v) => `${Math.pow(10, v).toFixed(v < 0 ? 1 : 0)}`}>
              <RLabel value={'Tempo - t [min] (escala log)'} position="insideBottom" offset={-2} style={{ textAnchor: "middle", fontSize: 12, fontWeight: 700, fill: "#0f172a" }} />
            </XAxis>
            <YAxis type="number" domain={[yMin, yMax]} allowDataOverflow={false} tick={{ fontSize: 11, fill: "#334155" }} stroke="#64748b" tickFormatter={(v) => v.toFixed(2)} ticks={niceTicks(yMin, yMax, 10)}>
              <AxisLabelY value="Altura do Corpo de Prova - H [mm]" />
            </YAxis>
            <Tooltip formatter={(v: number) => fmt(v, 4)} labelFormatter={(v) => `t = ${Math.pow(10, Number(v)).toFixed(2)} min`} contentStyle={{ fontSize: 11 }} />
            <Legend verticalAlign="bottom" align="center" iconSize={10} wrapperStyle={{ fontSize: 10 }} />
  
            {/* construction tangents (algebraically clipped segments) */}
            {segPrim && (
              <ReferenceLine
                segment={[segPrim.start, segPrim.end]}
                stroke={RED}
                strokeWidth={2}
                strokeDasharray="6 4"
                ifOverflow="visible"
                label={showResults ? { value: "Reta primária", position: "insideTopRight", fill: RED, fontSize: 10, fontWeight: 700 } : undefined}
              />
            )}
            {segSec && (
              <ReferenceLine
                segment={[segSec.start, segSec.end]}
                stroke={ACCENT}
                strokeWidth={2}
                ifOverflow="visible"
                label={showResults ? { value: "Reta secundária", position: "insideBottomRight", fill: ACCENT, fontSize: 10, fontWeight: 700 } : undefined}
              />
            )}
  
            {/* lab curve */}
            <Line type="monotone" dataKey="h" name="Curva do ensaio" stroke={GREEN} strokeWidth={2.4} dot={{ r: 3.5, fill: "#fff", stroke: GREEN, strokeWidth: 1.6 }} connectNulls isAnimationActive={false} />
  
            {/* d0 (horizontal) */}
            {cgr && h0 !== null && (
              <ReferenceLine y={h0} stroke={SLATE} strokeDasharray="6 4" label={showResults ? { value: `h₀ = ${fmt(h0, 2)} mm`, position: "insideTopLeft", fill: SLATE, fontSize: 10, fontWeight: 600 } : undefined} />
            )}
  
            {/* parabola-correction triangle (red step at top, like reference) */}
            {para && (
              <>
                <ReferenceLine segment={[{ x: para.x1, y: para.h0 }, { x: para.x1, y: para.h1 }]} stroke={RED} strokeWidth={1.4} ifOverflow="visible" />
                <ReferenceLine segment={[{ x: para.x1, y: para.h0 }, { x: para.x2, y: para.h0 }]} stroke={RED} strokeWidth={1.4} ifOverflow="visible" />
                <ReferenceLine segment={[{ x: para.x2, y: para.h0 }, { x: para.x2, y: para.h2 }]} stroke={RED} strokeWidth={1.4} ifOverflow="visible" />
                <ReferenceLine segment={[{ x: para.x1, y: para.h1 }, { x: para.x2, y: para.h2 }]} stroke={RED} strokeWidth={1.4} strokeDasharray="3 3" ifOverflow="visible" />
              </>
            )}
  
            {/* d100 marker + horizontal */}
            {cgr && h100 !== null && xT50 !== null && (
              <>
                <ReferenceLine y={h100} stroke={SLATE_SOFT} strokeDasharray="3 3" label={showResults ? { value: `h₁₀₀ = ${fmt(h100, 2)} mm`, position: "insideBottomLeft", fill: SLATE, fontSize: 10 } : undefined} />
                <ReferenceDot x={cgr.x100} y={h100} r={5} fill={ACCENT} stroke="#fff" />
              </>
            )}
  
            {/* d50 + t50 intersection construction (blue triangle) */}
            {cgr && h50 !== null && xT50 !== null && (
              <>
                <ReferenceLine segment={[{ x: xMin, y: h50 }, { x: xT50, y: h50 }]} stroke={BRAND2} strokeWidth={1.6} ifOverflow="visible" />
                <ReferenceLine segment={[{ x: xT50, y: h50 }, { x: xT50, y: yMin }]} stroke={BRAND2} strokeWidth={1.6} ifOverflow="visible" />
                <ReferenceDot x={xT50} y={h50} r={5} fill={BRAND2} stroke="#fff" />
                {showResults && (
                  <>
                    <ReferenceLine x={xT50} stroke="transparent" label={{ value: `t₅₀ = ${fmt(cgr.t50, 2)} min`, position: "top", fill: BRAND2, fontSize: 11, fontWeight: 700 }} />
                    <ReferenceLine y={h50} stroke="transparent" label={{ value: `h₅₀ = ${fmt(h50, 2)} mm`, position: "left", fill: BRAND2, fontSize: 10, fontWeight: 600 }} />
                  </>
                )}
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </ChartFrame>
      {cgr && showResults && (
        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="rounded border px-2 py-0.5">t₅₀ = {fmt(cgr.t50, 2)} min · Cv = {exp2(cgr.cv)} cm²/s</span>
          <span className="rounded border px-2 py-0.5">Tangente: ΔH = {fmt(cgr.primary.m, 5)}·log(t) + {fmt(cgr.primary.b, 5)}</span>
          <span className="rounded border px-2 py-0.5">Secundária: ΔH = {fmt(cgr.secondary.m, 5)}·log(t) + {fmt(cgr.secondary.b, 5)}</span>
        </div>
      )}
    </div>
  );

}

function CvVsSigmaChart({ rows, height = 280, sigmaLogDomain, cvLogDomain }: { rows: any[]; height?: number; sigmaLogDomain?: [number, number]; cvLogDomain?: [number, number] }) {
  const data = rows.filter((r) => r.cvTaylor != null).map((r) => ({ sigma: r.sigma, cvT: r.cvTaylor, cvC: r.cvCas }));
  if (data.length === 0)
    return <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">Sem dados de Cv (estágios curtos)</div>;
  const [xMinSigma, xMaxSigma] = sigmaLogDomain ?? sharedSigmaLogDomain(data);
  const cvVals = data.flatMap((d) => [d.cvT, d.cvC]).filter((v) => isFinite(v) && v > 0);
  const autoMin = cvVals.length ? Math.pow(10, Math.floor(Math.log10(Math.min(...cvVals)))) : 1e-5;
  const autoMax = cvVals.length ? Math.pow(10, Math.ceil(Math.log10(Math.max(...cvVals)))) : 1e-2;
  const [yMinCv, yMaxCv] = cvLogDomain ?? [autoMin, autoMax];
  return (
    <div>
      <ChartFrame height={height} xLabel={"Tensão Vertical Efetiva - σ'ᵥ [kPa]"} yLabel={"Coef. de Adensamento - Cv [cm²/s]"}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 18, bottom: 38, left: 25 }}>
            <CartesianGrid stroke="#cbd5e1" strokeDasharray="2 3" />
            <XAxis
              dataKey="sigma"
              type="number"
              scale="log"
              domain={[xMinSigma, xMaxSigma]}
              ticks={logTicks(xMinSigma, xMaxSigma)}
              tickFormatter={fmtLogTick}
              tick={{ fontSize: 11, fill: "#334155" }}
              stroke="#64748b"
            >
              <RLabel value={"Tensão Vertical Efetiva - σ'ᵥ [kPa]"} position="insideBottom" offset={-2} style={{ textAnchor: "middle", fontSize: 12, fontWeight: 700, fill: "#0f172a" }} />
            </XAxis>
            <YAxis
              tick={{ fontSize: 10, fill: "#334155" }}
              stroke="#64748b"
              tickFormatter={fmtLogTickSci}
              scale="log"
              domain={[yMinCv, yMaxCv]}
              ticks={logTicks(yMinCv, yMaxCv)}
            >
              <AxisLabelY value="Coef. de Adensamento - Cv [cm²/s]" />
            </YAxis>
            <Tooltip formatter={(v: number) => exp2(v)} labelFormatter={(v) => `σ' = ${v} kPa`} contentStyle={{ fontSize: 11 }} />
            <Legend verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Line type="monotone" dataKey="cvT" name="Cv Taylor (√t)" stroke={BRAND} strokeWidth={2.2} dot={{ r: 4, fill: "#fff", stroke: BRAND, strokeWidth: 1.6 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="cvC" name="Cv Casagrande (log t)" stroke={ACCENT} strokeWidth={2.2} strokeDasharray="5 3" dot={{ r: 4, fill: "#fff", stroke: ACCENT, strokeWidth: 1.6 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
    </div>
  );
}

function CaVsSigmaChart({ rows, sigmaP, height = 280, sigmaLogDomain, caMax }: { rows: any[]; sigmaP?: number | null; height?: number; sigmaLogDomain?: [number, number]; caMax?: number }) {
  const data = rows.filter((r) => r.ca != null).map((r) => ({ sigma: r.sigma, ca: r.ca }));
  const [xMin, xMax] = sigmaLogDomain ?? sharedSigmaLogDomain(data.length ? data : [{ sigma: 1 }, { sigma: 10 }]);
  const caAuto = data.length ? Math.max(...data.map((d) => d.ca)) : 0.1;
  const yMax = caMax ?? Math.ceil((caAuto + 0.01) * 100) / 100;
  return (
    <div>
      <ChartFrame height={height} xLabel={"Tensão Vertical Efetiva - σ'ᵥ [kPa]"} yLabel={"Coef. de Adensamento Secundário - Cα [-]"}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 18, bottom: 38, left: 25 }}>
            <CartesianGrid stroke="#d7d7d7" />
            <XAxis dataKey="sigma" type="number" scale="log" domain={[xMin, xMax]} ticks={logTicks(xMin, xMax)} tickFormatter={fmtLogTick} tick={{ fontSize: 10, fill: "#111827" }} stroke="#4b5563">
              <RLabel value={"Tensão Vertical Efetiva - σ'ᵥ [kPa]"} position="insideBottom" offset={-2} style={{ textAnchor: "middle", fontSize: 12, fontWeight: 700, fill: "#0f172a" }} />
            </XAxis>
            <YAxis domain={[0, yMax]} ticks={niceTicks(0, yMax, 6)} tick={{ fontSize: 10, fill: "#111827" }} stroke="#4b5563" tickFormatter={fmtNiceTick(yMax)}>
              <AxisLabelY value="Coef. de Adensamento Secundário - Cα [-]" />
            </YAxis>
            <Tooltip formatter={(v: number) => fmt(v, 4)} labelFormatter={(v) => `σ' = ${v} kPa`} contentStyle={{ fontSize: 11 }} />
            <Legend verticalAlign="bottom" align="center" iconSize={12} wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
            <Line type="monotone" dataKey="ca" name="Coeficiente de Adensamento Secundário" stroke={BRAND} strokeWidth={1.8} dot={{ r: 3, fill: "#fff", stroke: BRAND }} isAnimationActive={false} />
            {sigmaP && <ReferenceLine x={sigmaP} stroke="#475569" strokeDasharray="6 6" label={{ value: "σ'ᵥₘ", position: "insideTopRight", fontSize: 10, fill: "#475569" }} />}
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
    </div>
  );
}

function EvsSigmaArithmeticChart({ curve, height = 280, eDomain, sigmaArithMax }: { curve: { sigma: number; e: number; phase?: "load" | "unload" }[]; height?: number; eDomain?: [number, number]; sigmaArithMax?: number }) {
  const data = curve;
  const [yMin, yMax] = eDomain ?? sharedEDomain(data);
  const xMax = sigmaArithMax ?? sharedSigmaArithMax(data);
  return (
    <div>
      <ChartFrame height={height} xLabel={"Tensão Vertical Efetiva - σ'ᵥ [kPa]"} yLabel={"Índice de Vazios - e [-]"}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 18, bottom: 38, left: 25 }}>
            <CartesianGrid stroke="#d7d7d7" />
            <XAxis dataKey="sigma" type="number" domain={[0, xMax]} ticks={niceTicks(0, xMax, 8)} tick={{ fontSize: 10, fill: "#111827" }} stroke="#4b5563">
              <RLabel value={"Tensão Vertical Efetiva - σ'ᵥ [kPa]"} position="insideBottom" offset={-2} style={{ textAnchor: "middle", fontSize: 12, fontWeight: 700, fill: "#0f172a" }} />
            </XAxis>
            <YAxis domain={[yMin, yMax]} ticks={niceTicks(yMin, yMax, 8)} tick={{ fontSize: 10, fill: "#111827" }} stroke="#4b5563" tickFormatter={fmtNiceTick(yMax)}>
              <AxisLabelY value="Índice de Vazios - e [-]" />
            </YAxis>
            <Tooltip formatter={(v: number) => fmt(v, 4)} labelFormatter={(v) => `σ' = ${v} kPa`} contentStyle={{ fontSize: 11 }} />
            <Legend verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
            <Line type="monotone" dataKey="e" name="e × σ'ᵥ" stroke={BRAND} strokeWidth={2} dot={{ r: 3, fill: "#fff", stroke: BRAND }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
    </div>
  );
}

function NormalizedVoidRatioChart({ curve, e0, height = 540, sigmaLogDomain, eNormDomain }: { curve: { sigma: number; e: number; phase?: "load" | "unload" }[]; e0: number; height?: number; sigmaLogDomain?: [number, number]; eNormDomain?: [number, number] }) {
  const data = curve.map((p) => ({ sigma: p.sigma, norm: p.e / e0 }));
  const [xMin, xMax] = sigmaLogDomain ?? sharedSigmaLogDomain(data);
  const [yMin, yMax] = eNormDomain ?? [0.25, 1.25];
  return (
    <div>
      <ChartFrame height={height} xLabel={"Tensão Vertical Efetiva - σ'ᵥ [kPa]"} yLabel={"Índice de Vazios Normalizado - e/e₀ [-]"}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 18, bottom: 38, left: 25 }}>
            <CartesianGrid stroke="#d7d7d7" />
            <XAxis dataKey="sigma" type="number" scale="log" domain={[xMin, xMax]} ticks={logTicks(xMin, xMax)} tickFormatter={fmtLogTick} tick={{ fontSize: 10, fill: "#111827" }} stroke="#4b5563">
              <RLabel value={"Tensão Vertical Efetiva - σ'ᵥ [kPa]"} position="insideBottom" offset={-2} style={{ textAnchor: "middle", fontSize: 12, fontWeight: 700, fill: "#0f172a" }} />
            </XAxis>
            <YAxis domain={[yMin, yMax]} ticks={niceTicks(yMin, yMax, 10)} tick={{ fontSize: 10, fill: "#111827" }} stroke="#4b5563" tickFormatter={(v) => fmt(v, 2)}>
              <AxisLabelY value="Índice de Vazios Normalizado - e/e₀ [-]" />
            </YAxis>
            <Tooltip formatter={(v: number) => fmt(v, 4)} labelFormatter={(v) => `σ' = ${v} kPa`} contentStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="norm" name="e/e₀" stroke={BRAND} strokeWidth={2} dot={{ r: 3, fill: "#fff", stroke: BRAND }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
    </div>
  );
}

function HydraulicVsSigmaChart({ rows, sigmaP, height = 280, sigmaLogDomain, kvLogDomain }: { rows: any[]; sigmaP?: number | null; height?: number; sigmaLogDomain?: [number, number]; kvLogDomain?: [number, number] }) {
  const data = rows.filter((r) => r.kvTaylor != null).map((r) => ({ sigma: r.sigma, kv: r.kvTaylor }));
  const [xMin, xMax] = sigmaLogDomain ?? sharedSigmaLogDomain(data.length ? data : [{ sigma: 1 }, { sigma: 10 }]);
  const [kvMin, kvMax] = kvLogDomain ?? [1e-8, 1e-3];
  return (
    <div>
      <ChartFrame height={height} xLabel={"Tensão Vertical Efetiva - σ'ᵥ [kPa]"} yLabel={"Permeabilidade - kv [cm/s]"}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 18, bottom: 38, left: 25 }}>
            <CartesianGrid stroke="#d7d7d7" />
            <XAxis dataKey="sigma" type="number" scale="log" domain={[xMin, xMax]} ticks={logTicks(xMin, xMax)} tickFormatter={fmtLogTick} tick={{ fontSize: 10, fill: "#111827" }} stroke="#4b5563">
              <RLabel value={"Tensão Vertical Efetiva - σ'ᵥ [kPa]"} position="insideBottom" offset={-2} style={{ textAnchor: "middle", fontSize: 12, fontWeight: 700, fill: "#0f172a" }} />
            </XAxis>
            <YAxis scale="log" domain={[kvMin, kvMax]} ticks={logTicks(kvMin, kvMax)} tickFormatter={fmtLogTickEndOnly(kvMax)} tick={{ fontSize: 10, fill: "#111827" }} stroke="#4b5563">
              <AxisLabelY value="Permeabilidade - kv [cm/s]" />
            </YAxis>
            <Tooltip formatter={(v: number) => exp2(v)} labelFormatter={(v) => `σ' = ${v} kPa`} contentStyle={{ fontSize: 11 }} />
            <Legend verticalAlign="bottom" align="center" iconSize={12} wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
            {sigmaP && <ReferenceLine x={sigmaP} stroke="#475569" strokeDasharray="6 6" label={{ value: "σ'ᵥₘ", position: "insideTopRight", fontSize: 10, fill: "#475569" }} />}
            <Line type="monotone" dataKey="kv" name="Permeabilidade kv - Taylor" stroke={BRAND} strokeWidth={1.8} dot={{ r: 3, fill: "#fff", stroke: BRAND }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
    </div>
  );
}

function VoidRatioVsHydraulicChart({ rows, ps, height = 280, eDomain, kvLogDomain }: { rows: any[]; ps?: ReturnType<typeof pachecoSilvaSigmaP>; height?: number; eDomain?: [number, number]; kvLogDomain?: [number, number] }) {
  const data = rows.filter((r) => r.kvTaylor != null).map((r) => ({ kv: r.kvTaylor, e: r.e }));
  const [yMin, yMax] = eDomain ?? sharedEDomain(data);
  const [kvMin, kvMax] = kvLogDomain ?? [1e-8, 1e-3];
  return (
    <div>
      <ChartFrame height={height} xLabel={"Permeabilidade - k [cm/s]"} yLabel={"Índice de Vazios - e [-]"}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 18, bottom: 38, left: 25 }}>
            <CartesianGrid stroke="#d7d7d7" />
            <XAxis dataKey="kv" type="number" scale="log" domain={[kvMin, kvMax]} ticks={logTicks(kvMin, kvMax)} tickFormatter={fmtLogTickEndOnly(kvMax)} tick={{ fontSize: 10, fill: "#111827" }} stroke="#4b5563">
              <RLabel value={'Permeabilidade - k [cm/s]'} position="insideBottom" offset={-2} style={{ textAnchor: "middle", fontSize: 12, fontWeight: 700, fill: "#0f172a" }} />
            </XAxis>
            <YAxis domain={[yMin, yMax]} ticks={niceTicks(yMin, yMax, 8)} tick={{ fontSize: 10, fill: "#111827" }} stroke="#4b5563" tickFormatter={fmtNiceTick(yMax)}>
              <AxisLabelY value="Índice de Vazios - e [-]" />
            </YAxis>
            <Tooltip formatter={(v: number) => fmt(v, 4)} contentStyle={{ fontSize: 11 }} />
            <Legend verticalAlign="bottom" align="center" iconSize={12} wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
            {ps && <ReferenceLine y={ps.C.y} stroke="#475569" strokeDasharray="6 6" label={{ value: "e em σ'ᵥₘ", position: "insideTopRight", fontSize: 10, fill: "#475569" }} />}
            <Line type="monotone" dataKey="e" name="Permeabilidade kv - Taylor" stroke={BRAND} strokeWidth={1.8} dot={{ r: 3, fill: "#fff", stroke: BRAND }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
    </div>
  );
}

function EedoVsSigmaChart({ rows, height = 280, sigmaArithMax, eedoMax }: { rows: any[]; height?: number; sigmaArithMax?: number; eedoMax?: number }) {
  const data = rows.filter((r) => r.Ed_MPa != null).map((r) => ({ sigma: r.sigma, Eedo: r.Ed_MPa }));
  const xMax = sigmaArithMax ?? sharedSigmaArithMax(data);
  const eMax = data.length ? Math.max(...data.map((d) => d.Eedo)) : 10;
  const yMax = eedoMax ?? Math.ceil(eMax / 5) * 5;
  return (
    <div>
      <ChartFrame height={height} xLabel={"Tensão Vertical Efetiva - σ'ᵥ [kPa]"} yLabel={"Módulo Edométrico - E'edo [MPa]"}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 18, bottom: 38, left: 25 }}>
            <CartesianGrid stroke="#cbd5e1" strokeDasharray="2 3" />
            <XAxis dataKey="sigma" type="number" domain={[0, xMax]} ticks={niceTicks(0, xMax, 8)} tick={{ fontSize: 11, fill: "#334155" }} stroke="#64748b">
              <RLabel value={"Tensão Vertical Efetiva - σ'ᵥ [kPa]"} position="insideBottom" offset={-2} style={{ textAnchor: "middle", fontSize: 12, fontWeight: 700, fill: "#0f172a" }} />
            </XAxis>
            <YAxis domain={[0, yMax]} ticks={niceTicks(0, yMax, 6)} tick={{ fontSize: 11, fill: "#334155" }} stroke="#64748b" tickFormatter={fmtNiceTick(yMax)}>
              <AxisLabelY value="Módulo Edométrico - E'edo [MPa]" />
            </YAxis>
            <Tooltip formatter={(v: number) => fmt(v, 2) + " MPa"} labelFormatter={(v) => `σ' = ${v} kPa`} contentStyle={{ fontSize: 11 }} />
            <Legend verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
            <Line type="monotone" dataKey="Eedo" name="E'edo" stroke={RED} strokeWidth={2.4} dot={{ r: 4, fill: "#fff", stroke: RED, strokeWidth: 1.6 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
    </div>
  );
}

// ===== Summary table =====
function SummaryTable({ rows }: { rows: any[] }) {
  return (
    <Table className="text-[11px]">
      <TableHeader>
        <TableRow className="bg-[#141414] hover:bg-[#141414]">
          <TableHead className="text-white">σ' (kPa)</TableHead>
          <TableHead className="text-right text-white">H final (mm)</TableHead>
          <TableHead className="text-right text-white">e</TableHead>
          <TableHead className="text-right text-white">t₉₀ (s)</TableHead>
          <TableHead className="text-right text-white">Cv Taylor (cm²/s)</TableHead>
          <TableHead className="text-right text-white">kv Taylor (cm/s)</TableHead>
          <TableHead className="text-right text-white">t₅₀ (s)</TableHead>
          <TableHead className="text-right text-white">Cv Cas. (cm²/s)</TableHead>
          <TableHead className="text-right text-white">mv (1/kPa)</TableHead>
          <TableHead className="text-right text-white">av (1/kPa)</TableHead>
          <TableHead className="text-right text-white">E'edo (MPa)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={i} className={i % 2 ? "bg-muted/30" : ""}>
            <TableCell className="font-semibold">{r.sigma}</TableCell>
            <TableCell className="text-center tabular-nums">{fmt(r.Hfinal, 2)}</TableCell>
            <TableCell className="text-center tabular-nums">{fmt(r.e, 3)}</TableCell>
            <TableCell className="text-center tabular-nums">{r.t90 ? (r.t90 * 60).toFixed(0) : "—"}</TableCell>
            <TableCell className="text-center tabular-nums">{exp2(r.cvTaylor)}</TableCell>
            <TableCell className="text-center tabular-nums">{exp2(r.kvTaylor)}</TableCell>
            <TableCell className="text-center tabular-nums">{r.t50 ? (r.t50 * 60).toFixed(0) : "—"}</TableCell>
            <TableCell className="text-center tabular-nums">{exp2(r.cvCas)}</TableCell>
            <TableCell className="text-center tabular-nums">{exp2(r.mv)}</TableCell>
            <TableCell className="text-center tabular-nums">{exp2(r.av)}</TableCell>
            <TableCell className="text-center tabular-nums">{fmt(r.Ed_MPa, 2)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PreconsolidationCalcTable({
  cas,
  ps,
  ccr,
}: {
  cas: ReturnType<typeof casagrandeSigmaP>;
  ps: ReturnType<typeof pachecoSilvaSigmaP>;
  ccr: { Cc: number; Cr: number };
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-primary">
            Tensão de pré-adensamento σ'ᵥₘ — métodos gráficos
          </div>
          <Badge variant="outline" className="text-[10px] font-mono">
            Cc = {fmt(ccr.Cc, 3)} · Cr = {fmt(ccr.Cr, 3)}
          </Badge>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {/* Casagrande */}
          <div className="rounded-md border border-dashed p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">
              Casagrande (1936) — bissetriz do ângulo tangente/horizontal × reta virgem
            </div>
            {cas ? (
              <ol className="space-y-1.5 text-[11px]">
                <Step n={1} title="Ponto P de máxima curvatura na curva e × log σ'">
                  <code>σ'P = {fmt(Math.pow(10, cas.point.x), 2)} kPa</code>
                  <code>eP = {fmt(cas.point.y, 4)}</code>
                </Step>
                <Step n={2} title="Horizontal por P">
                  <code>e = {fmt(cas.horizontal, 4)}</code>
                </Step>
                <Step n={3} title="Tangente à curva em P">
                  <code>e = m·log σ' + b</code>
                  <code>e = {fmt(cas.tangent.m, 4)}·log σ' + {fmt(cas.tangent.b, 4)}</code>
                </Step>
                <Step n={4} title="Bissetriz do ângulo entre a horizontal e a tangente">
                  <code>e = {fmt(cas.bisector.m, 4)}·log σ' + {fmt(cas.bisector.b, 4)}</code>
                </Step>
                <Step n={5} title="Reta virgem (trecho de compressão normal)">
                  <code>e = m_v·log σ' + b_v</code>
                  <code>e = {fmt(cas.virgin.m, 4)}·log σ' + {fmt(cas.virgin.b, 4)}</code>
                  <code>Cc = −m_v = {fmt(ccr.Cc, 3)}</code>
                </Step>
                <Step n={6} title="σ'ᵥₘ na interseção da bissetriz com a reta virgem">
                  <code>
                    log σ'ᵥₘ = (b_v − b_bis) / (m_bis − m_v) ={" "}
                    {fmt(
                      (cas.virgin.b - cas.bisector.b) /
                        (cas.bisector.m - cas.virgin.m),
                      4,
                    )}
                  </code>
                  <code>e(σ'ᵥₘ) = {fmt(cas.intersection.y, 4)}</code>
                  <code className="font-bold text-primary">
                    σ'ᵥₘ Casagrande = {fmt(cas.sigmaP, 2)} kPa
                  </code>
                </Step>
              </ol>
            ) : (
              <div className="text-[11px] text-muted-foreground">Sem dados.</div>
            )}
          </div>

          {/* Pacheco Silva */}
          <div className="rounded-md border border-dashed p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">
              Pacheco Silva (1970) — horizontal e₀ → vertical até a curva → horizontal até a reta virgem
            </div>
            {ps ? (
              <ol className="space-y-1.5 text-[11px]">
                <Step n={1} title="Horizontal pelo índice de vazios inicial e₀">
                  <code>e = e₀ = {fmt(ps.e0Line, 4)}</code>
                </Step>
                <Step n={2} title="Reta virgem (extrapolada do trecho de compressão normal)">
                  <code>e = {fmt(ps.virgin.m, 4)}·log σ' + {fmt(ps.virgin.b, 4)}</code>
                </Step>
                <Step n={3} title="Ponto A — interseção da horizontal e₀ com a reta virgem">
                  <code>
                    log σ'A = (e₀ − b_v)/m_v = {fmt((ps.e0Line - ps.virgin.b) / ps.virgin.m, 4)}
                  </code>
                  <code>σ'A = {fmt(ps.A.sigma, 2)} kPa</code>
                </Step>
                <Step n={4} title="Vertical A → B até cruzar a curva do ensaio">
                  <code>σ = σ'A = {fmt(ps.A.sigma, 2)} kPa</code>
                  <code>eB = {fmt(ps.B.y, 4)} (interpolado na curva)</code>
                </Step>
                <Step n={5} title="Horizontal B → C até cruzar novamente a reta virgem">
                  <code>e = eB = {fmt(ps.B.y, 4)}</code>
                  <code>
                    log σ'ᵥₘ = (eB − b_v)/m_v = {fmt((ps.B.y - ps.virgin.b) / ps.virgin.m, 4)}
                  </code>
                </Step>
                <Step n={6} title="σ'ᵥₘ na abscissa do ponto C">
                  <code>e(σ'ᵥₘ) = {fmt(ps.C.y, 4)}</code>
                  <code className="font-bold text-primary">
                    σ'ᵥₘ Pacheco Silva = {fmt(ps.sigmaP, 2)} kPa
                  </code>
                </Step>
              </ol>
            ) : (
              <div className="text-[11px] text-muted-foreground">Sem dados.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CvCalcTable({
  taylor,
  cgr,
  Hdrain,
  isLoading,
}: {
  taylor: ReturnType<typeof cvTaylor>;
  cgr: ReturnType<typeof cvCasagrande>;
  Hdrain: number;
  isLoading: boolean;
}) {
  if (!isLoading) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Cv não é calculado em estágio de descarregamento/recarregamento. Selecione um estágio de carregamento.
      </div>
    );
  }
  const hdCm = Hdrain / 10;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Table className="text-[11px]">
        <TableHeader>
          <TableRow className="bg-muted/70"><TableHead colSpan={2} className="text-primary">Cálculo do Cv — Taylor (√t)</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          <TableRow><TableCell>Reta inicial</TableCell><TableCell className="text-right font-mono">{taylor ? `ΔH = ${fmt(taylor.slope, 5)}·√t + ${fmt(taylor.d0, 5)}` : "—"}</TableCell></TableRow>
          <TableRow><TableCell>Reta 1,15√t / U90</TableCell><TableCell className="text-right font-mono">{taylor ? `ΔH = ${fmt(taylor.slope90, 5)}·√t + ${fmt(taylor.d0, 5)}` : "—"}</TableCell></TableRow>
          <TableRow><TableCell>t90</TableCell><TableCell className="text-right font-mono">{taylor ? `${fmt(taylor.t90, 3)} min = ${fmt(taylor.t90_s, 1)} s` : "—"}</TableCell></TableRow>
          <TableRow><TableCell>Hd</TableCell><TableCell className="text-right font-mono">{fmt(Hdrain, 3)} mm = {fmt(hdCm, 4)} cm</TableCell></TableRow>
          <TableRow className="bg-primary/5"><TableCell className="font-semibold">Cv = 0,848·Hd²/t90</TableCell><TableCell className="text-right font-mono font-bold text-primary">{taylor ? `${exp2(taylor.cv)} cm²/s` : "—"}</TableCell></TableRow>
        </TableBody>
      </Table>
      <Table className="text-[11px]">
        <TableHeader>
          <TableRow className="bg-muted/70"><TableHead colSpan={2} className="text-primary">Cálculo do Cv — Casagrande (log t)</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          <TableRow><TableCell>Reta primária</TableCell><TableCell className="text-right font-mono">{cgr ? `ΔH = ${fmt(cgr.primary.m, 5)}·log(t) + ${fmt(cgr.primary.b, 5)}` : "—"}</TableCell></TableRow>
          <TableRow><TableCell>Reta secundária</TableCell><TableCell className="text-right font-mono">{cgr ? `ΔH = ${fmt(cgr.secondary.m, 5)}·log(t) + ${fmt(cgr.secondary.b, 5)}` : "—"}</TableCell></TableRow>
          <TableRow><TableCell>ΔH0 / ΔH100 / ΔH50</TableCell><TableCell className="text-right font-mono">{cgr ? `${fmt(cgr.d0, 4)} / ${fmt(cgr.d100, 4)} / ${fmt(cgr.d50, 4)} mm` : "—"}</TableCell></TableRow>
          <TableRow><TableCell>t50</TableCell><TableCell className="text-right font-mono">{cgr ? `${fmt(cgr.t50, 3)} min = ${fmt(cgr.t50_s, 1)} s` : "—"}</TableCell></TableRow>
          <TableRow className="bg-primary/5"><TableCell className="font-semibold">Cv = 0,197·Hd²/t50</TableCell><TableCell className="text-right font-mono font-bold text-primary">{cgr ? `${exp2(cgr.cv)} cm²/s` : "—"}</TableCell></TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

function CvMemorial({
  stages,
  ringHeight,
  cvAdjust,
}: {
  stages: Stage[];
  ringHeight: number;
  cvAdjust: Record<number, CvLineAdjust>;
}) {
  const loadStages = stages
    .map((s, i) => ({ s, i }))
    .filter((entry, idx, arr) => idx === 0 || entry.s.sigma > arr[idx - 1].s.sigma);

  return (
    <div className="space-y-4">
      {loadStages.map(({ s, i: si }) => {
        const prevDial = si === 0 ? 0 : stages[si - 1].finalDial;
        const Hdrain_mm = (ringHeight - (prevDial + s.finalDial) / 2) / 2;
        const Hd_cm = Hdrain_mm / 10;
        const baseT = cvTaylor(s, Hdrain_mm);
        const baseC = cvCasagrande(s, Hdrain_mm);
        const tay = applyTaylorAdjustment(s, Hdrain_mm, baseT, cvAdjust[si]);
        const cgr = applyCgrAdjustment(s, Hdrain_mm, baseC, cvAdjust[si]);
        return (
          <div key={si} className="rounded-lg border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-primary">
                Estágio {si + 1} — σ' = {fmt(s.sigma, 0)} kPa
              </div>
              <Badge variant="outline" className="text-[10px] font-mono">
                Hd = {fmt(Hdrain_mm, 3)} mm = {fmt(Hd_cm, 4)} cm
              </Badge>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {/* Taylor */}
              <div className="rounded-md border border-dashed p-3">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">
                  Taylor (√t) — Cv = 0,848·Hd² / t₉₀
                </div>
                {tay ? (
                  <ol className="space-y-1.5 text-[11px]">
                    <Step n={1} title="Reta tangente inicial à curva √t × ΔH">
                      <code>ΔH = m·√t + d₀</code>
                      <code>ΔH = {fmt(tay.slope, 5)}·√t + {fmt(tay.d0, 5)}</code>
                    </Step>
                    <Step n={2} title="Reta U90 com inclinação m/1,15">
                      <code>ΔH = (m/1,15)·√t + d₀</code>
                      <code>ΔH = {fmt(tay.slope90, 5)}·√t + {fmt(tay.d0, 5)}</code>
                    </Step>
                    <Step n={3} title="t₉₀ na interseção da curva com a reta U90">
                      <code>√t₉₀ = {fmt(Math.sqrt(tay.t90), 3)} √min</code>
                      <code>t₉₀ = {fmt(tay.t90, 3)} min = {fmt(tay.t90_s, 1)} s</code>
                    </Step>
                    <Step n={4} title="Cv (Taylor)">
                      <code>Cv = 0,848 · ({fmt(Hd_cm, 4)})² / {fmt(tay.t90_s, 1)}</code>
                      <code className="font-bold text-primary">
                        Cv = {exp2(tay.cv)} cm²/s
                      </code>
                    </Step>
                  </ol>
                ) : (
                  <div className="text-[11px] text-muted-foreground">Sem dados.</div>
                )}
              </div>

              {/* Casagrande */}
              <div className="rounded-md border border-dashed p-3">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">
                  Casagrande (log t) — Cv = 0,197·Hd² / t₅₀
                </div>
                {cgr ? (
                  <ol className="space-y-1.5 text-[11px]">
                    <Step n={1} title="Reta primária (trecho de adensamento primário)">
                      <code>ΔH = m₁·log(t) + b₁</code>
                      <code>ΔH = {fmt(cgr.primary.m, 5)}·log(t) + {fmt(cgr.primary.b, 5)}</code>
                    </Step>
                    <Step n={2} title="Reta secundária (compressão secundária)">
                      <code>ΔH = m₂·log(t) + b₂</code>
                      <code>ΔH = {fmt(cgr.secondary.m, 5)}·log(t) + {fmt(cgr.secondary.b, 5)}</code>
                    </Step>
                    <Step n={3} title="d₁₀₀ na interseção das retas; d₀ por correção parabólica">
                      <code>d₀ = {fmt(cgr.d0, 4)} mm · d₁₀₀ = {fmt(cgr.d100, 4)} mm</code>
                      <code>d₅₀ = (d₀ + d₁₀₀)/2 = {fmt(cgr.d50, 4)} mm</code>
                    </Step>
                    <Step n={4} title="t₅₀ na curva no nível d₅₀">
                      <code>t₅₀ = {fmt(cgr.t50, 3)} min = {fmt(cgr.t50_s, 1)} s</code>
                    </Step>
                    <Step n={5} title="Cv (Casagrande)">
                      <code>Cv = 0,197 · ({fmt(Hd_cm, 4)})² / {fmt(cgr.t50_s, 1)}</code>
                      <code className="font-bold text-primary">
                        Cv = {exp2(cgr.cv)} cm²/s
                      </code>
                    </Step>
                  </ol>
                ) : (
                  <div className="text-[11px] text-muted-foreground">Sem dados.</div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded border-l-2 border-primary/40 bg-muted/30 px-2 py-1.5">
      <div className="flex items-baseline gap-2">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
          {n}
        </span>
        <span className="text-[11px] font-semibold text-foreground">{title}</span>
      </div>
      <div className="mt-1 flex flex-col gap-0.5 pl-7 font-mono text-[11px] leading-tight text-muted-foreground [&_code]:bg-transparent [&_code]:p-0">
        {children}
      </div>
    </li>
  );
}

// ===== REPORT =====
type ReportProps = {
  sample: SampleProps;
  phys: ReturnType<typeof physicalIndices>;
  cvTable: any[];
  cas: ReturnType<typeof casagrandeSigmaP>;
  ps: ReturnType<typeof pachecoSilvaSigmaP>;
  ccr: { Cc: number; Cr: number };
  eCurve: { sigma: number; e: number }[];
  loadingCurve?: any;
  stages: Stage[];
  ringHeight: number;
  e0: number;
  photos?: any[];
  cvAdjust?: Record<number, CvLineAdjust>;
  axisCfg?: {
    eMin: number; eMax: number;
    sigmaMin: number; sigmaMax: number;
    sigmaArithMax: number;
    cvMin: number; cvMax: number;
    caMax: number;
    eedoMax: number;
    kvMin: number; kvMax: number;
    eNormMin: number; eNormMax: number;
  };
};

function ReportHeader({ sample, page, total }: { sample: SampleProps; page: number; total: number }) {
  const cell = "px-2 py-[3px] text-[10px] text-[#141414] align-middle";
  const Field = ({ label, value, className = "" }: { label: string; value: React.ReactNode; className?: string }) => (
    <td className={`${cell} ${className}`}>
      <span className="font-semibold">{label}</span> <span>{value}</span>
    </td>
  );
  return (
    <div className="border border-[#141414] text-[#141414]">
      {/* Faixa superior — logo + título normativo */}
      <div className="flex items-center px-2">
        <div className="flex w-[27%] items-center justify-center px-4 py-2">
          <img
            src={logoAsset.url}
            alt="Suporte Infra"
            crossOrigin="anonymous"
            className="h-10 w-auto max-w-full object-contain"
          />
        </div>
        <div className="w-[1px] self-stretch my-2 bg-[#141414]" />
        <div className="flex-1 px-4 py-1.5 text-center leading-tight">
          <div className="text-[12px] font-bold underline">RELATÓRIO DE ENSAIO</div>
          <div className="text-[11.5px] font-bold">ENSAIO DE ADENSAMENTO UNIDIMENSIONAL (EDOMÉTRICO)</div>
          <div className="mt-0.5 text-[9.5px]">
            ABNT NBR 16853/20 — Solo — Ensaio de adensamento unidimensional
          </div>
          <div className="text-[9.5px] italic">
            ASTM D2435/D2435M-11 — Standard Test Methods for One-Dimensional Consolidation
            Properties of Soils Using Incremental Loading
          </div>
        </div>
      </div>

      {/* Identificação — sem grade interna, apenas linha superior separando do título */}
      <table className="w-full border-collapse border-t border-[#141414]">
        <tbody>
          <tr>
            <Field label="Cliente:" value={sample.client} className="w-1/3" />
            <Field label="Furo:" value={sample.borehole} className="w-1/3" />
            <Field label="Prof. (m):" value={sample.depth} className="w-1/3" />
          </tr>
          <tr>
            <Field label="Obra:" value={sample.workNumber} />
            <Field label="Código:" value={sample.code} />
            <Field label="O.S.:" value={sample.os} />
          </tr>
          <tr>
            <Field label="Local:" value={sample.local} />
            <Field label="Amostra:" value={sample.reportNumber} />
            <Field label="Revisão:" value={sample.revision} />
          </tr>
          <tr className="border-t border-[#141414]">
            <td className={cell} colSpan={3}>
              <span className="font-semibold">Descrição Tátil-Visual:</span> {sample.description}
            </td>
          </tr>
          <tr>
            <td className={cell} colSpan={2}>
              <span className="font-semibold">Descrição Granulométrica:</span> {sample.granulometricDescription}
            </td>
            <td className={`${cell} text-right`}>
              <span className="font-semibold">Folha:</span> {page} / {total}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function ReportFooter({ sample }: { sample: SampleProps }) {
  void sample;
  const months = [
    "janeiro","fevereiro","março","abril","maio","junho",
    "julho","agosto","setembro","outubro","novembro","dezembro",
  ];
  // Data/hora atuais no fuso de São Paulo
  const spParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => spParts.find((p) => p.type === t)?.value ?? "";
  const day = parseInt(get("day"), 10);
  const month = parseInt(get("month"), 10) - 1;
  const year = parseInt(get("year"), 10);
  const hour = get("hour");
  const minute = get("minute");
  const todayPt = `${day} de ${months[month]} de ${year}`;
  const stampPt = `${String(day).padStart(2,"0")}/${String(month+1).padStart(2,"0")}/${year} ${hour}:${minute}`;
  return (
    <div className="mt-auto pt-1">
      <div className="grid grid-cols-12 gap-x-5 border-t border-[#141414]/30 pt-1">
        <div className="col-span-4 flex flex-col justify-end text-[8.5px] text-[#141414]">
          <div className="font-medium">São Paulo, {todayPt}</div>
          <div className="text-[8px] text-[#141414]/70">
            Contrato nº {sample.workNumber} · Revisão {sample.revision}
          </div>
          <div className="mt-[2px] space-y-[1px] text-[7.5px] leading-[1.2] text-[#141414]/80">
            <div><span className="text-[#141414]/60">Digitado por:</span> {sample.operator}</div>
            <div><span className="text-[#141414]/60">Verificado por:</span></div>
            <div><span className="text-[#141414]/60">Aprovado por:</span> Engº Geotécnico Cleitton Pereira</div>
            <div><span className="text-[#141414]/60">Gerente de Laboratório:</span> Tecnº Geotécnico Carlos Christian da Silva</div>
          </div>
        </div>
        <div className="col-span-4 flex flex-col items-center justify-end">
          <img
            src={assinaturaMauricio}
            alt="Assinatura Resp. Técnico"
            className="h-[28px] object-contain"
          />
          <div className="w-full border-t border-[#141414]/70" />
          <div className="mt-[1px] text-[7.5px] uppercase tracking-wide text-[#141414]/60">
            Responsável Técnico
          </div>
          <div className="text-[8px] font-medium text-[#141414] text-center leading-tight">
            {sample.technicalResp}
          </div>
        </div>
        <div className="col-span-4 text-[7.5px] leading-[1.25] text-[#141414]/75">
          <div className="mb-[1px] text-[7.5px] font-semibold uppercase tracking-wide text-[#141414]">
            Nota
          </div>
          Os resultados apresentados referem-se exclusivamente à amostra ensaiada. A
          reprodução deste documento somente poderá ser feita na íntegra, após
          aprovação prévia e por escrito da empresa.
        </div>
      </div>
      <div className="mt-1 flex items-start justify-between bg-[#141414] px-3 py-[4px] text-[7.5px] text-white">
        <div>
          <div className="font-bold tracking-wide">SUPORTE — SONDAGENS E INVESTIGAÇÕES</div>
          <div>Av. Camélia Borges Narciso, 582 · Bela São Pedro · São Pedro/SP · CEP 13.520-000</div>
        </div>
        <div className="text-right">
          <div>http://www.suportesolos.com.br</div>
          <div>contato@suportesolos.com.br</div>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          right: "3mm",
          bottom: "1.5mm",
          fontSize: "5.5px",
          letterSpacing: "0.02em",
          color: "rgba(20,20,20,0.45)",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        Relatório gerado em: São Paulo, SP - Brasil · {stampPt}
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  width: "210mm",
  height: "297mm",
  padding: "5mm 6mm",
  background: "#fff",
  color: "#0f172a",
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: 11,
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column",
  position: "relative",
};

function PrintableReport(p: ReportProps) {
  const allRows = p.cvTable;
  const loadingRows = p.cvTable.filter((r) => r.phase !== "unload");
  const lastStage = p.stages[p.stages.length - 1];
  const total = 10;

  // Domínios compartilhados — todos os gráficos com o mesmo eixo (e, σ') usam os mesmos limites.
  const eDomain: [number, number] = p.axisCfg
    ? [p.axisCfg.eMin, p.axisCfg.eMax]
    : sharedEDomain(p.eCurve, [p.phys.e0]);
  const sigmaLogDomain: [number, number] = p.axisCfg
    ? [p.axisCfg.sigmaMin, p.axisCfg.sigmaMax]
    : sharedSigmaLogDomain(p.eCurve);
  const sigmaArithMax = p.axisCfg?.sigmaArithMax ?? sharedSigmaArithMax(p.eCurve);
  const cvLogDomain: [number, number] | undefined = p.axisCfg ? [p.axisCfg.cvMin, p.axisCfg.cvMax] : undefined;
  const kvLogDomain: [number, number] | undefined = p.axisCfg ? [p.axisCfg.kvMin, p.axisCfg.kvMax] : undefined;
  const caMax = p.axisCfg?.caMax;
  const eedoMax = p.axisCfg?.eedoMax;
  const eNormDomain: [number, number] | undefined = p.axisCfg ? [p.axisCfg.eNormMin, p.axisCfg.eNormMax] : undefined;

  return (
    <div>
      {/* PAGE 1: identification + indices + summary */}
      <div data-pdf-page style={pageStyle}>
        <ReportHeader sample={p.sample} page={1} total={total} />
        <div className="flex-1 pt-3">
          <SectionBar className="mt-3">Parâmetros e Característica da Amostra e do Ensaio</SectionBar>
          <table className="mt-2 w-full border-collapse text-[10px]">
            <tbody>
              {([
                ["Massa da Amostra (g)", fmt(p.sample.wetMassInitial, 2), "Massa Específica dos Grãos (g/cm³)", fmt(p.sample.Gs, 3)],
                ["Altura Inicial H_0 (mm)", fmt(p.sample.ringHeight, 2), "Massa Específica Aparente Úmida (g/cm³)", fmt(p.phys.rho_i, 2)],
                ["Altura Final (mm)", fmt(p.ringHeight - lastStage.finalDial, 2), "Massa Específica Aparente Seca (g/cm³)", fmt(p.phys.rho_d, 2)],
                ["Diâmetro da Amostra (mm)", fmt(p.sample.ringDiameter, 2), "Tipo da Amostra", "Indeformada"],
                ["Área da Amostra (cm²)", fmt(p.phys.A, 2), "Condição do Ensaio", "Inundado"],
                ["Índice de Vazios Inicial e_0", fmt(p.phys.e0, 3), "Tipo de Célula", "Anel Fixo"],
                ["Índice de Vazios Final e_f", fmt(allRows[allRows.length - 1]?.e, 3), "Drenagem", "Topo e Base"],
                ["Umidade Inicial w_i (%)", fmt(p.phys.wi, 2), "Equipamento", "ADNS-05"],
                ["Umidade Final w_f (%)", fmt(p.phys.wf, 2), "Caracterização Tátil-Visual", p.sample.description],
                ["Grau de Saturação Inicial Sr_0 (%)", fmt(p.phys.Sr0, 2), "Grau de Saturação Final Sr_f (%)", fmt(p.phys.Srf, 2)],
              ] as [string, React.ReactNode, string, React.ReactNode][]).map((row, i) => (
                <tr key={i}>
                  <td className="w-[28%] border bg-[#f1f5f9] px-2 py-[3px] font-semibold">{subscriptify(row[0])}</td>
                  <td className="w-[22%] border px-2 py-[3px] text-center tabular-nums">{row[1]}</td>
                  <td className="w-[28%] border bg-[#f1f5f9] px-2 py-[3px] font-semibold">{subscriptify(row[2])}</td>
                  <td className="w-[22%] border px-2 py-[3px] text-center tabular-nums">{row[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <SectionBar className="mt-4">Quadro Resumo dos Resultados e Cálculos do Ensaio de Adensamento</SectionBar>
          <table className="mt-2 w-full border-collapse text-[8.5px]">
            <thead>
              <tr className="bg-[#141414] text-white">
                <th className="border px-1 py-[3px]">Tensão<br/>[kPa]</th>
                <th className="border px-1 py-[3px]">H final<br/>[mm]</th>
                <th className="border px-1 py-[3px]">Índice<br/>Vazios e</th>
                <th className="border px-1 py-[3px]">t₉₀<br/>[s]</th>
                <th className="border px-1 py-[3px]">Cv Taylor<br/>[cm²/s]</th>
                <th className="border px-1 py-[3px]">kv Taylor<br/>[cm/s]</th>
                <th className="border px-1 py-[3px]">t₅₀<br/>[s]</th>
                <th className="border px-1 py-[3px]">Cv Cas.<br/>[cm²/s]</th>
                <th className="border px-1 py-[3px]">kv Cas.<br/>[cm/s]</th>
                <th className="border px-1 py-[3px]">mv<br/>[1/kPa]</th>
                <th className="border px-1 py-[3px]">av<br/>[1/kPa]</th>
              </tr>
            </thead>
            <tbody>
              {allRows.map((r, i) => (
                <tr key={i} className={i % 2 ? "bg-[#f8fafc]" : ""}>
                  <td className="border px-1 py-[3px] text-center font-semibold">{fmt(r.sigma, 2)}</td>
                  <td className="border px-1 py-[3px] text-center tabular-nums">{fmt(r.Hfinal, 2)}</td>
                  <td className="border px-1 py-[3px] text-center tabular-nums">{fmt(r.e, 3)}</td>
                  <td className="border px-1 py-[3px] text-center tabular-nums">{r.t90 ? (r.t90 * 60).toFixed(0) : "—"}</td>
                  <td className="border px-1 py-[3px] text-center tabular-nums">{exp2(r.cvTaylor)}</td>
                  <td className="border px-1 py-[3px] text-center tabular-nums">{exp2(r.kvTaylor)}</td>
                  <td className="border px-1 py-[3px] text-center tabular-nums">{r.t50 ? (r.t50 * 60).toFixed(0) : "—"}</td>
                  <td className="border px-1 py-[3px] text-center tabular-nums">{exp2(r.cvCas)}</td>
                  <td className="border px-1 py-[3px] text-center tabular-nums">{exp2(r.kvCas)}</td>
                  <td className="border px-1 py-[3px] text-center tabular-nums">{exp2(r.mv)}</td>
                  <td className="border px-1 py-[3px] text-center tabular-nums">{exp2(r.av)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ReportFooter sample={p.sample} />
      </div>

      {/* PAGE 2: e × σ' log + arithmetic */}
      <div data-pdf-page style={pageStyle}>
        <ReportHeader sample={p.sample} page={2} total={total} />
        <div className="flex-1 pt-3">
          <SectionBar>Índice de Vazios versus Tensão Vertical Efetiva (escala mono-log)</SectionBar>
          <div className="mt-2 border border-gray-300 bg-white" style={{ height: 340, padding: 8 }}>
            <EvsSigmaChart curve={p.eCurve} cas={null} ps={null} e0={p.phys.e0} height={320} eDomain={eDomain} sigmaLogDomain={sigmaLogDomain} />
          </div>
          <SectionBar className="mt-3">Índice de Vazios versus Tensão Vertical Efetiva (escala aritmética)</SectionBar>
          <div className="mt-2 border border-gray-300 bg-white" style={{ height: 340, padding: 8 }}>
            <EvsSigmaArithmeticChart curve={p.eCurve} height={320} eDomain={eDomain} sigmaArithMax={sigmaArithMax} />
          </div>
        </div>
        <ReportFooter sample={p.sample} />
      </div>

      {/* PAGE 3: normalized void ratio */}
      <div data-pdf-page style={pageStyle}>
        <ReportHeader sample={p.sample} page={3} total={total} />
        <div className="flex-1 pt-3">
          <SectionBar>Variação do Índice de Vazios Normalizado versus Tensão Vertical Efetiva</SectionBar>
          <div className="mt-2 border border-gray-300 bg-white" style={{ height: 740, padding: 8 }}>
            <NormalizedVoidRatioChart curve={p.eCurve} e0={p.e0} height={720} sigmaLogDomain={sigmaLogDomain} eNormDomain={eNormDomain} />
          </div>
        </div>
        <ReportFooter sample={p.sample} />
      </div>

      {/* PAGE 4: photographic record / observations */}
      <div data-pdf-page style={pageStyle}>
        <ReportHeader sample={p.sample} page={4} total={total} />
        <div className="flex-1 pt-3">
          <SectionBar>Registro Fotográfico da Amostra (Moldagem e Pós-Ensaio)</SectionBar>
          
          {/* Grid de 2 Fotos Centralizadas na Proporção 3:4 */}
          <div className="mt-4 grid grid-cols-2 gap-6 max-w-[160mm] mx-auto">
            {p.photos && p.photos.length > 0 ? (
              [
                p.photos.find((ph) => ph.phase === "moldagem") || p.photos[0],
                p.photos.find((ph) => ph.phase === "pos_ensaio" || ph.phase === "ruptura" || ph.phase === "final") || p.photos[1]
              ].filter(Boolean).map((ph, idx) => (
                <div key={idx} className="flex flex-col rounded border border-gray-400 bg-white overflow-hidden shadow-sm">
                  <div className="bg-[#141414] px-2 py-1.5 text-center text-[9.5px] font-bold uppercase tracking-wider text-white">
                    Foto {idx + 1} — {idx === 0 ? "Moldagem Inicial da Amostra" : "Aspecto do Solo Pós-Ensaio"}
                  </div>
                  <div className="relative w-full aspect-[3/4] bg-slate-100 flex items-center justify-center overflow-hidden">
                    <img
                      src={ph.url}
                      alt={ph.caption || (idx === 0 ? "Moldagem" : "Pós-Ensaio")}
                      crossOrigin="anonymous"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-2 text-center text-[9px] leading-tight text-gray-700 bg-slate-50 border-t border-gray-200">
                    {ph.caption || (idx === 0 ? "Aspecto do corpo de prova na moldagem e anel cortante" : "Aspecto do solo após o ciclo completo de descarregamento")}
                  </div>
                </div>
              ))
            ) : (
              [
                { title: "Moldagem Inicial da Amostra", desc: "Aspecto do corpo de prova indeformado e inserção no anel cortante." },
                { title: "Aspecto do Solo Pós-Ensaio", desc: "Aspecto final do solo após o ciclo completo de descarregamento." }
              ].map((item, idx) => (
                <div key={idx} className="flex flex-col rounded border border-gray-400 bg-white overflow-hidden shadow-sm">
                  <div className="bg-[#141414] px-2 py-1.5 text-center text-[9.5px] font-bold uppercase tracking-wider text-white">
                    Foto {idx + 1} — {item.title}
                  </div>
                  <div className="relative w-full aspect-[3/4] bg-slate-100 flex flex-col items-center justify-center p-6 text-center border-b border-gray-200">
                    <div className="w-20 h-20 rounded-full border-4 border-dashed border-amber-600/40 bg-amber-50 flex items-center justify-center text-amber-700 mb-3">
                      <Camera className="w-10 h-10" />
                    </div>
                    <span className="text-[11px] font-semibold text-gray-700">Registro Fotográfico 3:4</span>
                    <span className="text-[8.5px] text-gray-400 mt-1">Carregue fotos na aba Ficha de Preparo</span>
                  </div>
                  <div className="p-2 text-center text-[9px] leading-tight text-gray-700 bg-slate-50">
                    {item.desc}
                  </div>
                </div>
              ))
            )}
          </div>

          <SectionBar className="mt-5">Caracterização Tátil-Visual e Observações Geotécnicas</SectionBar>
          <div className="mt-2 min-h-[110px] rounded border border-gray-400 bg-white p-3 text-[11px] leading-relaxed text-gray-800">
            <div className="font-semibold mb-1 text-primary">Descrição Tátil-Visual da Amostra:</div>
            <p>{p.sample.description || "Solo fino argilo-siltoso, consistência rija, coloração variegada, sem presença de matéria orgânica visível."}</p>
            <div className="font-semibold mt-2 mb-1 text-primary">Condições do Ensaio Edométrico:</div>
            <p>Ensaio realizado conforme ABNT NBR 16853 / ASTM D2435, em célula edométrica de anel fixo (D = {fmt(p.sample.ringDiameter, 2)} mm, H₀ = {fmt(p.sample.ringHeight, 2)} mm), amostra indeformada mantida sob condição inundada e drenagem bidirecional (topo e base).</p>
          </div>
        </div>
        <ReportFooter sample={p.sample} />
      </div>

      {/* PAGE 5: Eedo */}
      <div data-pdf-page style={pageStyle}>
        <ReportHeader sample={p.sample} page={5} total={total} />
        <div className="flex-1 pt-3">
          <SectionBar>Módulo Edométrico (Confinado - D) - E'edo versus Tensão Vertical Efetiva</SectionBar>
          <div className="mt-2 border border-gray-300 bg-white" style={{ height: 360, padding: 8 }}>
            <EedoVsSigmaChart rows={p.cvTable} height={340} sigmaArithMax={sigmaArithMax} eedoMax={eedoMax} />
          </div>
          <SectionBar className="mt-3">Quadro Resumo dos Resultados</SectionBar>
          <table className="mt-2 w-full border-collapse text-[9.5px]">
            <thead><tr className="bg-[#b4a184]"><th className="border p-1">Tensão [kPa]</th><th className="border p-1">Módulo Edométrico / Confinado [MPa]</th><th className="border p-1">Parâmetros de Ajuste</th></tr></thead>
            <tbody>{loadingRows.map((r, i) => <tr key={i}><td className="border p-1 text-center">{fmt(r.sigma, 2)}</td><td className="border p-1 text-center">{fmt(r.Ed_MPa, 2)}</td><td className="border p-1 text-center">{i === 3 ? "E'edo calculado por incremento tensão/deformação" : ""}</td></tr>)}</tbody>
          </table>
          <div className="mt-2 text-[8px] text-gray-700">¹ O Módulo Edométrico é também conhecido como módulo de deformabilidade com confinamento lateral.</div>
        </div>
        <ReportFooter sample={p.sample} />
      </div>

      {/* PAGE 6: preconsolidation methods */}
      <div data-pdf-page style={pageStyle}>
        <ReportHeader sample={p.sample} page={6} total={total} />
        <div className="flex-1 pt-3">
          <SectionBar>Determinação da Tensão de Pré-Adensamento - Métodos de Casagrande e Pacheco Silva</SectionBar>
          <div className="mt-2 border border-gray-300 bg-white" style={{ height: 420, padding: 8 }}>
            <EvsSigmaChart curve={p.eCurve} cas={p.cas} ps={p.ps} e0={p.phys.e0} height={400} eDomain={eDomain} sigmaLogDomain={sigmaLogDomain} />
          </div>
          <SectionBar className="mt-3">Resultados do Ensaio de Adensamento Edométrico</SectionBar>
          <table className="mt-2 w-full border-collapse text-[9.5px]">
            <tbody>
              {[
                ["Índice de Recompressão - Cr", fmt(p.ccr.Cr, 3)],
                ["Índice de Compressão - Cc", fmt(p.ccr.Cc, 3)],
                ["Tensão de Pré-Adensamento - σ'ᵥₘ Casagrande [kPa]", p.cas ? fmt(p.cas.sigmaP, 2) : "—"],
                ["Tensão de Pré-Adensamento - σ'ᵥₘ Pacheco Silva [kPa]", p.ps ? fmt(p.ps.sigmaP, 2) : "—"],
                ["Índice de Vazios na Tensão de Pré-Adensamento - eσ'ᵥₘ", p.ps ? fmt(p.ps.C.y, 3) : "—"],
              ].map((row, i) => <tr key={i}><td className="w-1/2 border bg-[#d4c2aa] p-1 font-semibold">{row[0]}</td><td className="border p-1 text-center">{row[1]}</td></tr>)}
            </tbody>
          </table>
          <div className="mt-2 text-[8px] text-gray-700">² PACHECO SILVA, F. Uma Nova Construção Gráfica para Determinação da Pressão de Pré-adensamento de uma Amostra de Solo, 1970. CASAGRANDE, A., The Determination of the Preconsolidation Load and Its Practical Significance, 1936.</div>
        </div>
        <ReportFooter sample={p.sample} />
      </div>

      {/* PAGE 7: Cv + Cα */}
      <div data-pdf-page style={pageStyle}>
        <ReportHeader sample={p.sample} page={7} total={total} />
        <div className="flex-1 pt-3">
          <SectionBar>Coeficiente de Adensamento - Cv versus Tensão Vertical Efetiva</SectionBar>
          <div className="mt-2 border border-gray-300 bg-white" style={{ height: 340, padding: 8 }}>
            <CvVsSigmaChart rows={p.cvTable} height={320} sigmaLogDomain={sigmaLogDomain} cvLogDomain={cvLogDomain} />
          </div>
          <SectionBar className="mt-3">Coeficiente de Adensamento Secundário - Cα versus Tensão Vertical Efetiva</SectionBar>
          <div className="mt-2 border border-gray-300 bg-white" style={{ height: 340, padding: 8 }}>
            <CaVsSigmaChart rows={p.cvTable} sigmaP={p.ps?.sigmaP ?? p.cas?.sigmaP ?? null} height={320} sigmaLogDomain={sigmaLogDomain} caMax={caMax} />
          </div>
        </div>
        <ReportFooter sample={p.sample} />
      </div>

      {/* PAGE 8: permeability */}
      <div data-pdf-page style={pageStyle}>
        <ReportHeader sample={p.sample} page={8} total={total} />
        <div className="flex-1 pt-3">
          <SectionBar>Condutividade Hidráulica - Permeabilidade versus Tensão Vertical Efetiva</SectionBar>
          <div className="mt-2 border border-gray-300 bg-white" style={{ height: 340, padding: 8 }}>
            <HydraulicVsSigmaChart rows={p.cvTable} sigmaP={p.ps?.sigmaP ?? p.cas?.sigmaP ?? null} height={320} sigmaLogDomain={sigmaLogDomain} kvLogDomain={kvLogDomain} />
          </div>
          <SectionBar className="mt-3">Índice de Vazios versus Condutividade Hidráulica - Permeabilidade</SectionBar>
          <div className="mt-2 border border-gray-300 bg-white" style={{ height: 340, padding: 8 }}>
            <VoidRatioVsHydraulicChart rows={p.cvTable} ps={p.ps} height={320} eDomain={eDomain} kvLogDomain={kvLogDomain} />
          </div>
        </div>
        <ReportFooter sample={p.sample} />
      </div>

      {/* PAGE 9: multi-stage Taylor */}
      <div data-pdf-page style={pageStyle}>
        <ReportHeader sample={p.sample} page={9} total={total} />
        <div className="flex-1 pt-3">
          <SectionBar>Altura do Corpo de Prova versus √Tempo do Carregamento - Método de Taylor (1938)</SectionBar>
          <div className="mt-2 border border-gray-300 bg-white" style={{ height: 720, padding: 4 }}>
            <MultiTaylorChart stages={p.stages} ringHeight={p.ringHeight} height={710} />
          </div>
          <div className="mt-1 text-[8px] text-gray-700">³ TAYLOR, D. W., Research on Consolidation Clays. Massachusetts Institute of Technology, 1942.</div>
        </div>
        <ReportFooter sample={p.sample} />
      </div>

      {/* PAGE 10: multi-stage Casagrande */}
      <div data-pdf-page style={pageStyle}>
        <ReportHeader sample={p.sample} page={10} total={total} />
        <div className="flex-1 pt-3">
          <SectionBar>Altura do Corpo de Prova versus Tempo do Carregamento - Método de Casagrande (1936)</SectionBar>
          <div className="mt-2 border border-gray-300 bg-white" style={{ height: 720, padding: 4 }}>
            <MultiCasagrandeChart stages={p.stages} ringHeight={p.ringHeight} height={710} />
          </div>
          <div className="mt-1 text-[8px] text-gray-700">⁴ CASAGRANDE, A., The Determination of the Preconsolidation Load and Its Practical Significance, 1936.</div>
        </div>
        <ReportFooter sample={p.sample} />
      </div>
    </div>
  );
}

function SectionBar({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`border border-[#9ca3af] bg-[#d1d5db] px-2 py-1 text-center text-[11px] font-bold text-[#111827] ${className}`}>{children}</div>;
}

function AxisGroup({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-sm font-semibold text-primary">{title}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
      <div className="mt-2 grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function AxisField({ label, value, step = "any", onChange }: { label: string; value: number; step?: string; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (isFinite(n)) onChange(n);
        }}
        className="h-8"
      />
    </div>
  );
}
