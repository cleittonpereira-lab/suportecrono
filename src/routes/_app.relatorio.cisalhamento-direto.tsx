import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { equalTicks } from "@/features/cisalhamento-direto/domain/utils";
import { SectionBar } from "@/features/cisalhamento-direto/components/SectionBar";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  Label as RLabel,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { Download, FileText, Beaker, Activity, BarChart3, FlaskConical, Settings2, Plus, X, Ruler } from "lucide-react";
import {
  Eye,
  Send,
  ChevronDown,
  ChevronRight,
  Trash2,
  History,
  Cloud,
  CloudCheck,
  CloudAlert,
  ShieldCheck,
  Clock,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { ReportPage, type ReportNorm } from "@/components/report/ReportShell";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { 
  listVersions, 
  saveVersion, 
  nextRev, 
  deleteVersion, 
  downloadVersion, 
  viewVersion,
  type ReportVersion 
} from "@/features/cisalhamento-direto/report-versions";
import { syncRevision, fetchDriveStatus } from "@/features/cisalhamento-direto/driveSync";
import { 
  listApprovals, 
  requestApproval, 
  verifyApproval, 
  decideApproval,
  type ApprovalRow 
} from "@/lib/approvals.functions";
import { 
  getWorkflowStatuses,
} from "@/lib/driveSync.functions";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { PhotoUploader } from "@/features/lab/components/PhotoUploader";
import { WorkflowFarol } from "@/features/lab/components/WorkflowFarol";
import { useOptionalLabEnsaio } from "@/features/lab/context";
import { CP_COLORS, BRAND, ACCENT } from "@/features/cisalhamento-direto/constants";
import type { CDSample, CDSpecimen, CDSpecimenResults, CDEnvelopeResult, CDReading } from "@/features/cisalhamento-direto/types";
import { SEED_CD_SAMPLE, makeEmptyCDSpecimen } from "@/features/cisalhamento-direto/seed";
import { loadDraft, saveDraft } from "@/features/cisalhamento-direto/draftStore";
import { processSpecimen, fitEnvelope } from "@/features/cisalhamento-direto/domain/calc";
import { cn } from "@/lib/utils";
import { EnsaioListByType } from "@/features/lab/components/EnsaioListByType";
import { PickerWithCreate } from "@/features/cisalhamento-direto/PickerWithCreate";
import { CDCpSelector } from "@/features/cisalhamento-direto/components/CDCpSelector";
import { CDMoldagemFicha } from "@/features/cisalhamento-direto/components/CDMoldagemFicha";
import { CDSummaryPage } from "@/features/cisalhamento-direto/components/CDSummaryPage";
import { CDSummaryTablePage } from "@/features/cisalhamento-direto/components/CDSummaryTablePage";
import { CDPhotoPage } from "@/features/cisalhamento-direto/components/CDPhotoPage";
import { CDSetupPage } from "@/features/cisalhamento-direto/components/CDSetupPage";
import { CDConsolidationPage } from "@/features/cisalhamento-direto/components/CDConsolidationPage";
import { CDShearChartsPage } from "@/features/cisalhamento-direto/components/CDShearChartsPage";
import { CDEnvelopePage } from "@/features/cisalhamento-direto/components/CDEnvelopePage";
import { Photo } from "@/features/lab/types";

const NORMS: ReportNorm[] = [
  { text: "ASTM D3080 / D3080M — Standard Test Method for Direct Shear Test of Soils Under Consolidated Drained Conditions" },
  { text: "NBR 17144:2023 — Solo - Ensaio de cisalhamento direto - Método de ensaio", italic: true },
];

const reportTitleFor = (condition: "natural" | "inundado") =>
  condition === "inundado"
    ? "ENSAIO DE CISALHAMENTO DIRETO INUNDADO (CD)"
    : "ENSAIO DE CISALHAMENTO DIRETO NATURAL (CD)";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });



const axisDomain = (min: number | "auto", max: number | "auto"): [any, any] => [
  min === "auto" || min === 0 ? "auto" : min,
  max === "auto" || max === 0 ? "auto" : max,
];

export const Route = createFileRoute("/_app/relatorio/cisalhamento-direto")({
  component: () => {
    const ctx = useOptionalLabEnsaio();
    return ctx?.ensaio ? <CDPage /> : <EnsaioListByType tipo="cisalhamento-direto" />;
  },
});

export function CDPage() {
  const ctx = useOptionalLabEnsaio();
  const navigate = useNavigate();
  
  const scopeId = ctx?.os && ctx.amostra && ctx.ensaio
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
        reportNumber: ctx.amostra.reportNumber || SEED_CD_SAMPLE.reportNumber,
        borehole: ctx.amostra.borehole || SEED_CD_SAMPLE.borehole,
        depth: ctx.amostra.depth || SEED_CD_SAMPLE.depth,
        description: ctx.amostra.description || SEED_CD_SAMPLE.description,
        code: ctx.amostra.code || SEED_CD_SAMPLE.code,
      }
    : SEED_CD_SAMPLE;

  const [sample, setSample] = useState<CDSample>(() => (draft?.sample ? { ...initialSample, ...draft.sample } : initialSample));
  const [specimens, setSpecimens] = useState<CDSpecimen[]>(() => (draft?.specimens && draft.specimens.length > 0 ? draft.specimens : [makeEmptyCDSpecimen("CP1", 0)]));
  const [selectedCpId, setSelectedCpId] = useState<string>(() => draft?.selectedCpId ?? specimens[0].id);
  const [tab, setTab] = useState(() => draft?.tab ?? "amostra");
  
  const [adjust, setAdjust] = useState(() => draft?.adjust ?? {
    mSobreCP: 0,
    espMembrana: 0,
    aPistao: 0,
    hTopcap: 0,
    fAtritoPistao: 0,
  });

  const applyAdjustToAll = () => {
    setSpecimens((sp) => sp.map((c) => ({ ...c, ...adjust })));
    setAdjustOpen(false);
    toast.success("Parâmetros aplicados a todos os CPs");
  };

  const [axisCfg, setAxisCfg] = useState(() => draft?.axisCfg ?? {
    eaMax: 0, tauMax: 0, sigmaNMax: 0, vertDispMin: 0, vertDispMax: 0,
  });

  const [idOpen, setIdOpen] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  
  const [capsOpen, setCapsOpen] = useState(true);
  const [geomOpen, setGeomOpen] = useState(true);
  const [finalOpen, setFinalOpen] = useState(true);

  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [versions, setVersions] = useState<ReportVersion[]>([]);
  const [driveStatus, setDriveStatus] = useState<any>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVerificador, setIsVerificador] = useState(false);
  const [wfStatus, setWfStatus] = useState("digitacao");
  const reportRef = useRef<HTMLDivElement>(null);

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
    return () => { cancelled = true; };
  }, []);

  const refreshVersions = async () => {
    const v = await listVersions(scopeId);
    setVersions(v);
  };

  const refreshDriveStatus = async () => {
    try {
      const s = await fetchDriveStatus(scopeId);
      setDriveStatus(s);
    } catch (err) { console.warn(err); }
  };

  const refreshApprovals = async () => {
    try {
      const rows = await listApprovals({ data: { scopeId } });
      setApprovals(rows);
      const res = await getWorkflowStatuses({ data: { scopeIds: [scopeId] } });
      setWfStatus(res.statuses[scopeId] ?? "digitacao");
    } catch (err) { console.warn(err); }
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

  const sortedSpecimens = useMemo(() => [...specimens].sort((a, b) => a.normalStressTarget - b.normalStressTarget), [specimens]);
  const results = useMemo(() => sortedSpecimens.map(cp => processSpecimen(cp, sample)), [sortedSpecimens, sample]);
  
  const selIdx = Math.max(0, sortedSpecimens.findIndex(s => s.id === selectedCpId));
  const cp = sortedSpecimens[selIdx] ?? sortedSpecimens[0];
  const res = results[selIdx] ?? results[0];
  
  const envelope = useMemo(() => {
    const pts = results.map((r, i) => ({ sigma: r.sigmaN, tau: r.tauPeak, cp: sortedSpecimens[i].id }));
    return fitEnvelope(pts);
  }, [results, sortedSpecimens]);

  const updateSample = (k: keyof CDSample, v: any) => setSample(s => ({ ...s, [k]: v }));
  const updateSpecimen = (id: string, patch: Partial<CDSpecimen>) => setSpecimens(sps => sps.map(s => s.id === id ? { ...s, ...patch } : s));

  const addCp = () => {
    const nextIdx = specimens.length;
    const novo = makeEmptyCDSpecimen(`CP${nextIdx + 1}`, nextIdx);
    setSpecimens(s => [...s, novo]);
    setSelectedCpId(novo.id);
  };

  const removeCp = (id: string) => {
    if (specimens.length <= 1) return;
    setSpecimens(s => s.filter(x => x.id !== id));
    if (selectedCpId === id) setSelectedCpId(specimens.find(x => x.id !== id)?.id ?? "");
  };

  const handleSaveVersion = async () => {
    setSaveBusy(true);
    const tid = toast.loading("Gerando e salvando versão...");
    try {
      if (!reportRef.current) throw new Error("Relatório não montado");

      // Verificação de transbordamento (Overflow Check)
      const pages = Array.from(reportRef.current.querySelectorAll<HTMLElement>(".printable-report"));
      let hasOverflow = false;
      const overflowMessages: string[] = [];

      pages.forEach((page, idx) => {
        const contentArea = page.querySelector('.report-content-area');
        if (contentArea) {
          const isOverflowing = contentArea.scrollHeight > contentArea.clientHeight;
          if (isOverflowing) {
            hasOverflow = true;
            overflowMessages.push(`Página ${idx + 1}`);
          }
        }
      });

      if (hasOverflow) {
        toast.dismiss(tid);
        const proceed = window.confirm(
          `ALERTA DE LAYOUT:\n\nDetectamos transbordamento de conteúdo (tabelas, gráficos ou fotos saindo da margem) nas seguintes páginas:\n${overflowMessages.join(", ")}.\n\nIsso pode causar cortes no PDF final. Deseja continuar mesmo assim?`
        );
        if (!proceed) {
          setSaveBusy(false);
          return;
        }
        toast.loading("Gerando e salvando versão (com transbordamento)...", { id: tid });
      }

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      for (let i = 0; i < pages.length; i++) {
        const dataUrl = await toPng(pages[i], { 
          pixelRatio: 3, // Increased quality
          cacheBust: true, 
          backgroundColor: "#fff",
          filter: (node) => !(node instanceof HTMLElement && node.classList.contains('no-print'))
        });
        if (i > 0) pdf.addPage("a4", "portrait");
        pdf.addImage(dataUrl, "PNG", 0, 0, 210, 297, undefined, "SLOW");
      }
      const blob = pdf.output("blob");
      const rev = await nextRev(scopeId);
      const filename = `CD_${sample.os || "OS"}_Rev${String(rev).padStart(2, "0")}.pdf`;
      const saved = await saveVersion({ scopeId, rev, filename, size: blob.size, pdfBlob: blob });
      await refreshVersions();
      
      toast.success("Versão salva localmente", { id: tid });
      
      const syncId = toast.loading("Sincronizando com o Drive...");
      try {
        await syncRevision({
          scopeId, rev: saved.rev, pdfBlob: blob, pdfFilename: filename,
          sample, specimens, ctxOs: ctx?.os, ctxAmostra: ctx?.amostra,
          ctxEnsaio: { tipo: "cisalhamento-direto", nome: sample.reportNumber }
        });
        await refreshDriveStatus();
        toast.success("Sincronizado com Drive", { id: syncId });
      } catch (err) {
        toast.error("Erro no Drive", { id: syncId });
      }

      await requestApproval({ data: { scopeId, rev: saved.rev, filename } });
      await refreshApprovals();
    } catch (err) {
      toast.error("Erro ao salvar", { id: tid });
    } finally {
      setSaveBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background p-4 lg:p-6">
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FlaskConical className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Cisalhamento Direto</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>ASTM D3080 / NBR 17144</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <WorkflowFarol status={wfStatus} />
          <Button variant="outline" size="sm" onClick={() => setReportOpen(true)}>
            <Eye className="mr-2 h-4 w-4" /> Visualizar Relatório
          </Button>
          <Button size="sm" onClick={handleSaveVersion} disabled={saveBusy}>
            <Send className="mr-2 h-4 w-4" /> Finalizar Revisão
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="flex-1 overflow-hidden flex flex-col">
        <TabsList className="grid w-full grid-cols-6 shrink-0">
          <TabsTrigger value="amostra">Amostra</TabsTrigger>
          <TabsTrigger value="adensamento">Adensamento</TabsTrigger>
          <TabsTrigger value="cisalhamento">Cisalhamento</TabsTrigger>
          <TabsTrigger value="envoltoria">Envoltória</TabsTrigger>
          <TabsTrigger value="fotos">Fotos (CPs)</TabsTrigger>
          <TabsTrigger value="versoes">Versões</TabsTrigger>
        </TabsList>
        
        <div className="flex-1 overflow-auto mt-4 pr-1">
          <TabsContent value="amostra" className="m-0 space-y-4">
            {ctx ? (
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">
                        Amostra {ctx.amostra.reportNumber || "—"} · OS {ctx.os.numero}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {ctx.os.client || "—"} · Furo {ctx.amostra.borehole || "—"} · Prof. {ctx.amostra.depth || "—"}
                      </CardDescription>
                    </div>
                    <a href={`/os/${ctx.os.id}/amostra/${ctx.amostra.id}`} className="text-xs text-primary hover:underline">
                      editar amostra →
                    </a>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <div className="text-muted-foreground">Geometria</div>
                      <div className="font-medium uppercase">{sample.geometry}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Equipamento</div>
                      <div className="font-medium">{sample.equipment || "—"}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="cursor-pointer py-4" onClick={() => setIdOpen(!idOpen)}>
                  <div className="flex items-center gap-2">
                    {idOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <CardTitle className="text-sm font-medium">Dados da Amostra e do Ensaio</CardTitle>
                  </div>
                </CardHeader>
                {idOpen && (
                  <CardContent className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4 pb-6">
                    <div className="space-y-1">
                      <Label className="text-[11px] uppercase text-muted-foreground">Código Amostra</Label>
                      <Input value={sample.code} onChange={e => updateSample("code", e.target.value)} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] uppercase text-muted-foreground">O.S.</Label>
                      <Input value={sample.os} onChange={e => updateSample("os", e.target.value)} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] uppercase text-muted-foreground">Geometria</Label>
                      <Select value={sample.geometry} onValueChange={v => updateSample("geometry", v)}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="circular">Circular</SelectItem>
                          <SelectItem value="quadrada">Quadrada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] uppercase text-muted-foreground">Gs</Label>
                      <Input type="number" step="0.01" value={sample.Gs} onChange={e => updateSample("Gs", parseFloat(e.target.value) || 0)} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] uppercase text-muted-foreground">Condição do Ensaio</Label>
                      <Select value={sample.testCondition} onValueChange={v => updateSample("testCondition", v)}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="natural">Natural</SelectItem>
                          <SelectItem value="inundado">Inundado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 col-span-2">
                      <Label className="text-[11px] uppercase text-muted-foreground">Observações (aparecem no relatório)</Label>
                      <Input value={sample.observations || ""} onChange={e => updateSample("observations", e.target.value)} className="h-8" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] uppercase text-muted-foreground">Estado da Amostra</Label>
                      <Select value={sample.sampleState} onValueChange={v => updateSample("sampleState", v)}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="indeformada">Indeformada</SelectItem>
                          <SelectItem value="compactada">Compactada</SelectItem>
                          <SelectItem value="recompactada">Recompactada</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                )}
              </Card>
            )}

            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-4">
                <CardTitle className="text-sm font-medium">Corpos de Prova</CardTitle>
                <Button size="sm" variant="outline" onClick={addCp}><Plus className="mr-2 h-4 w-4" /> Adicionar CP</Button>
              </CardHeader>
              <CardContent>
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
                  onCp={patch => updateSpecimen(cp.id, patch)}
                  capsOpen={capsOpen}
                  onToggleCaps={() => setCapsOpen(!capsOpen)}
                  geomOpen={geomOpen}
                  onToggleGeom={() => setGeomOpen(!geomOpen)}
                  finalOpen={finalOpen}
                  onToggleFinal={() => setFinalOpen(!finalOpen)}
                />
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="saturacao" className="m-0">
             <Card><CardContent className="p-8 text-center text-muted-foreground">O ensaio de Cisalhamento Direto (CD) geralmente não requer etapa de saturação por contra-pressão como o Triaxial. Caso necessário, documente aqui.</CardContent></Card>
          </TabsContent>

          <TabsContent value="adensamento" className="m-0 space-y-4">
            <CDCpSelector specimens={sortedSpecimens} selectedId={selectedCpId} onSelect={setSelectedCpId} />
            <Card>
              <CardHeader><CardTitle className="text-sm">Leituras de Adensamento — {cp.displayId ?? cp.id}</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tempo (min)</TableHead>
                      <TableHead>Recalque (mm)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(cp.consolidationData || []).map((r, i) => (
                      <TableRow key={i}>
                        <TableCell><Input type="number" step="0.1" value={r.timeMin} onChange={e => {
                          const next = [...cp.consolidationData];
                          next[i].timeMin = parseFloat(e.target.value) || 0;
                          updateSpecimen(cp.id, { consolidationData: next });
                        }} className="h-7 w-24" /></TableCell>
                        <TableCell><Input type="number" step="0.001" value={r.settlementMm} onChange={e => {
                          const next = [...cp.consolidationData];
                          next[i].settlementMm = parseFloat(e.target.value) || 0;
                          updateSpecimen(cp.id, { consolidationData: next });
                        }} className="h-7 w-24" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-2 flex gap-2">
                   <Button size="sm" variant="outline" onClick={() => updateSpecimen(cp.id, { consolidationData: [...(cp.consolidationData || []), { timeMin: 0, settlementMm: 0 }] })}>+ Linha</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cisalhamento" className="m-0 space-y-4">
            <CDCpSelector specimens={sortedSpecimens} selectedId={selectedCpId} onSelect={setSelectedCpId} />
            <Card>
              <CardHeader><CardTitle className="text-sm">Fase de Ruptura — {cp.displayId ?? cp.id}</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Disp. H (mm)</TableHead>
                      <TableHead>Força (kgf ou N)</TableHead>
                      <TableHead>Recalque V (mm)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cp.shearData.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell><Input type="number" step="0.01" value={r.horizDispMm} onChange={e => {
                          const next = [...cp.shearData];
                          next[i].horizDispMm = parseFloat(e.target.value) || 0;
                          updateSpecimen(cp.id, { shearData: next });
                        }} className="h-7 w-24" /></TableCell>
                        <TableCell><Input type="number" step="0.1" value={r.loadKgf ?? (r.shearForce/9.80665)} onChange={e => {
                          const next = [...cp.shearData];
                          const v = parseFloat(e.target.value) || 0;
                          next[i].loadKgf = v;
                          next[i].shearForce = v * 9.80665;
                          updateSpecimen(cp.id, { shearData: next });
                        }} className="h-7 w-24" /></TableCell>
                        <TableCell><Input type="number" step="0.001" value={r.vertDispMm} onChange={e => {
                          const next = [...cp.shearData];
                          next[i].vertDispMm = parseFloat(e.target.value) || 0;
                          updateSpecimen(cp.id, { shearData: next });
                        }} className="h-7 w-24" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-2 flex gap-2">
                   <Button size="sm" variant="outline" onClick={() => updateSpecimen(cp.id, { shearData: [...cp.shearData, { horizDispMm: 0, shearForce: 0, vertDispMm: 0 }] })}>+ Linha</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="envoltoria" className="m-0 space-y-4">
            <CDSummaryPage sample={sample} specimens={sortedSpecimens} results={results} envelope={envelope} />
          </TabsContent>

          <TabsContent value="fotos" className="m-0 space-y-6">
            <div className="grid gap-6">
              {sortedSpecimens.map((cp) => (
                <Card key={cp.id} className="overflow-hidden border-primary/20 shadow-sm">
                  <CardHeader className="bg-primary/5 py-3">
                    <CardTitle className="text-sm">
                      Fotos do CP: {cp.displayId ?? cp.id}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Corpo-de-prova com tensão normal de {fmt(cp.normalStressTarget, 0)} kPa
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 space-y-6">
                    <PhotoUploader
                      title="Moldagem / Aspecto Inicial"
                      kind="moldagem"
                      photos={ctx?.photos?.filter(p => p.specimenId === cp.id) || []}
                      onAdd={(p) => ctx?.addPhoto({ ...p, specimenId: cp.id, kind: "moldagem" })}
                      onRemove={(pid) => ctx?.removePhoto(pid)}
                      onUpdate={(pid, patch) => ctx?.updatePhoto(pid, patch)}
                    />

                    <PhotoUploader
                      title="Após Ruptura / Aspecto Final"
                      kind="ruptura"
                      photos={ctx?.photos?.filter(p => p.specimenId === cp.id) || []}
                      onAdd={(p) => ctx?.addPhoto({ ...p, specimenId: cp.id, kind: "ruptura" })}
                      onRemove={(pid) => ctx?.removePhoto(pid)}
                      onUpdate={(pid, patch) => ctx?.updatePhoto(pid, patch)}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="versoes" className="m-0 space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm">Histórico de Versões</CardTitle>
                <Button variant="outline" size="sm" onClick={refreshVersions} disabled={driveBusy}>
                  <RefreshCw className={cn("h-4 w-4 mr-2", driveBusy && "animate-spin")} /> Atualizar
                </Button>
              </CardHeader>
              <CardContent>
                {versions.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground border-2 border-dashed rounded-lg">
                    Nenhuma revisão finalizada. Finalize o ensaio para gerar um PDF.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Revisão</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Arquivo</TableHead>
                        <TableHead>Status Drive</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {versions.map(v => (
                        <TableRow key={v.id}>
                          <TableCell className="font-bold">Rev {String(v.rev).padStart(2, "0")}</TableCell>
                          <TableCell className="text-xs">{new Date(v.createdAt).toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="text-xs">{v.filename}</TableCell>
                          <TableCell>
                            {(() => {
                              const entry = driveStatus?.entries.find((e: any) => e.rev === v.rev && e.kind === "pdf");
                              if (!entry) return <Badge variant="secondary">Pendente</Badge>;
                              return entry.status === "ok" ? <Badge className="bg-emerald-500">Sincronizado</Badge> : <Badge variant="destructive">Erro</Badge>;
                            })()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => viewVersion(v)} title="Visualizar"><Eye className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => downloadVersion(v)} title="Baixar"><Download className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { if(confirm("Excluir?")) deleteVersion(v.id).then(refreshVersions); }} title="Excluir"><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>

      <div className="hidden">
        <div ref={reportRef}>
          <ReportPage sample={sample} page={1} total={6} title={reportTitleFor(sample.testCondition)} norms={NORMS}>
            <div className="p-3 h-full flex flex-col min-h-0">
              <CDSetupPage sample={sample} specimens={sortedSpecimens} adjust={adjust} />
            </div>
          </ReportPage>
          <ReportPage sample={sample} page={2} total={6} title={reportTitleFor(sample.testCondition)} norms={NORMS}>
            <div className="p-3 h-full flex flex-col overflow-hidden min-h-0">
              <CDSummaryTablePage sample={sample} specimens={sortedSpecimens} results={results} envelope={envelope} />
            </div>
          </ReportPage>
          <ReportPage sample={sample} page={3} total={6} title={reportTitleFor(sample.testCondition)} norms={NORMS}>
            <div className="p-3 h-full flex flex-col min-h-0">
              <CDPhotoPage 
                sample={sample} 
                page={3} 
                total={6} 
                title={reportTitleFor(sample.testCondition)} 
                norms={NORMS}
                photos={ctx?.photos || []}
                specimens={sortedSpecimens}
              />
            </div>
          </ReportPage>
          <ReportPage sample={sample} page={4} total={6} title={reportTitleFor(sample.testCondition)} norms={NORMS}>
            <div className="p-3 h-full flex flex-col overflow-hidden min-h-0">
              <CDConsolidationPage results={results} />
            </div>
          </ReportPage>
          <ReportPage sample={sample} page={5} total={6} title={reportTitleFor(sample.testCondition)} norms={NORMS}>
            <div className="p-3 h-full flex flex-col overflow-hidden min-h-0">
              <CDShearChartsPage results={results} />
            </div>
          </ReportPage>
          <ReportPage sample={sample} page={6} total={6} title={reportTitleFor(sample.testCondition)} norms={NORMS}>
            <div className="p-3 h-full flex flex-col overflow-hidden min-h-0">
              <CDEnvelopePage results={results} envelope={envelope} />
            </div>
          </ReportPage>
        </div>
      </div>
      
      {/* Dialog do Relatório */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>Relatório Técnico - Pré-visualização</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-[#525659] p-8">
            <div className="mx-auto max-w-fit flex flex-row flex-wrap justify-center gap-8">
              {/* Page 1 */}
              <div className="w-[210mm] shadow-2xl bg-white origin-top shrink-0">
                 <ReportPage sample={sample} page={1} total={6} title={reportTitleFor(sample.testCondition)} norms={NORMS}>
                    <div className="p-3 h-full flex flex-col min-h-0">
                      <CDSetupPage sample={sample} specimens={sortedSpecimens} adjust={adjust} />
                    </div>
                 </ReportPage>
              </div>

              {/* Page 2 */}
              <div className="w-[210mm] shadow-2xl bg-white origin-top shrink-0">
                 <ReportPage sample={sample} page={2} total={6} title={reportTitleFor(sample.testCondition)} norms={NORMS}>
                    <div className="p-3 h-full flex flex-col overflow-hidden min-h-0">
                      <CDSummaryTablePage sample={sample} specimens={sortedSpecimens} results={results} envelope={envelope} />
                    </div>
                 </ReportPage>
              </div>

              {/* Page 3 */}
              <div className="w-[210mm] shadow-2xl bg-white origin-top shrink-0">
                 <ReportPage sample={sample} page={3} total={6} title={reportTitleFor(sample.testCondition)} norms={NORMS}>
                    <div className="p-3 h-full flex flex-col min-h-0">
                       <CDPhotoPage 
                          sample={sample} 
                          page={3} 
                          total={6} 
                          title={reportTitleFor(sample.testCondition)} 
                          norms={NORMS}
                          photos={ctx?.photos || []}
                          specimens={sortedSpecimens}
                        />
                    </div>
                 </ReportPage>
              </div>

              {/* Page 4 */}
              <div className="w-[210mm] shadow-2xl bg-white origin-top shrink-0">
                 <ReportPage sample={sample} page={4} total={6} title={reportTitleFor(sample.testCondition)} norms={NORMS}>
                    <div className="p-3 h-full flex flex-col overflow-hidden min-h-0">
                      <CDConsolidationPage results={results} />
                    </div>
                 </ReportPage>
              </div>

              {/* Page 5 */}
              <div className="w-[210mm] shadow-2xl bg-white origin-top shrink-0">
                 <ReportPage sample={sample} page={5} total={6} title={reportTitleFor(sample.testCondition)} norms={NORMS}>
                    <div className="p-3 h-full flex flex-col overflow-hidden min-h-0">
                      <CDShearChartsPage results={results} />
                    </div>
                 </ReportPage>
              </div>

              {/* Page 6 */}
              <div className="w-[210mm] shadow-2xl bg-white origin-top shrink-0">
                 <ReportPage sample={sample} page={6} total={6} title={reportTitleFor(sample.testCondition)} norms={NORMS}>
                    <div className="p-3 h-full flex flex-col overflow-hidden min-h-0">
                      <CDEnvelopePage results={results} envelope={envelope} />
                    </div>
                 </ReportPage>
              </div>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-background">
             <Button variant="outline" onClick={() => setReportOpen(false)}>Fechar</Button>
             <Button onClick={handleSaveVersion} disabled={saveBusy}><Download className="mr-2 h-4 w-4" /> Salvar Versão / PDF</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
