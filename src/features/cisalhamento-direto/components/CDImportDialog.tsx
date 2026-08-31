import React, { useState, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Upload,
  ClipboardPaste,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  Info,
  RefreshCw,
  FileSpreadsheet,
  Table as TableIcon,
} from "lucide-react";
import type { CDReading } from "../types";
import {
  detectZeroOrConstantHoriz,
  reconstructShearReadings,
  validateReconstructParams,
  validateMultiSpecimenCounts,
  analyzeTimeColumn,
  type RawShearReading,
  type ReconstructParams,
} from "../domain/reconstruct";

export type ColumnOrderType = "auto" | "h_v_f" | "h_f_v" | "t_h_v_f" | "t_h_f_v";
export type ForceUnitType = "N" | "kgf" | "kN";
export type DispUnitType = "mm" | "cm";

export function CDImportDialog({
  open,
  onOpenChange,
  onImportShear,
  onImportConsolidation,
  cpLabel,
  specimensLabels = ["CP1", "CP2", "CP3"],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportShear: (readings: CDReading[], targetCpId?: string) => void;
  onImportConsolidation: (readings: { timeMin: number; settlementMm: number }[]) => void;
  cpLabel: string;
  specimensLabels?: string[];
}) {
  const [activeTab, setActiveTab] = useState<"paste" | "file">("paste");
  const [kind, setKind] = useState<"shear" | "consolidation">("shear");
  const [rawText, setRawText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Configurações de mapeamento
  const [columnOrder, setColumnOrder] = useState<ColumnOrderType>("auto");
  const [forceUnit, setForceUnit] = useState<ForceUnitType>("N");
  const [dispUnit, setDispUnit] = useState<DispUnitType>("mm");

  // Parâmetros do Diálogo de Correção Linear (ASTM D3080)
  const [deltaIni, setDeltaIni] = useState<number>(0.0);
  const [deltaFin, setDeltaFin] = useState<number>(12.0);
  const [deltaStep, setDeltaStep] = useState<number>(0.5);
  const [speedMmMin, setSpeedMmMin] = useState<number>(0.5); // velocidade de ensaio padrão 0.5 mm/min
  const [useTimeBased, setUseTimeBased] = useState<boolean>(false);
  const [forceCorrectionMode, setForceCorrectionMode] = useState<boolean>(false);

  // Deslocamento final individual por CP se houver divergência > 5%
  const [customDeltaFinByCp, setCustomDeltaFinByCp] = useState<Record<string, number>>({});

  // Leitura e parse de arquivos TXT/CSV/XLSX
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (import.meta.env.SSR) return;
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        const XLSX = await import("xlsx");
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t" });
        setRawText(csv);
        toast.success(`Planilha "${file.name}" carregada com sucesso!`);
      } else {
        const text = await file.text();
        setRawText(text);
        toast.success(`Arquivo "${file.name}" carregado com sucesso!`);
      }
    } catch (err) {
      toast.error("Erro ao ler arquivo: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Parser bruto de linhas para objetos RawShearReading
  const rawParsedData = useMemo<{
    readings: RawShearReading[];
    detectedZeroHoriz: boolean;
    timeAnalysis: ReturnType<typeof analyzeTimeColumn>;
    validation: ReturnType<typeof validateReconstructParams>;
  }>(() => {
    if (!rawText.trim()) {
      return {
        readings: [],
        detectedZeroHoriz: false,
        timeAnalysis: { hasTime: false, isRegular: false, irregularities: [] },
        validation: {
          isValid: true,
          warnings: [],
          errors: [],
          isHorizZeroOrConstant: false,
          hasTimeColumn: false,
          isTimeRegular: false,
          rawPointCount: 0,
          resampledPointCount: 0,
        },
      };
    }

    const lines = rawText.trim().split(/\r?\n/);
    const readings: RawShearReading[] = [];
    const dispMult = dispUnit === "cm" ? 10 : 1;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Ignora cabeçalhos com texto alfabético
      if (/^[A-Za-zÀ-ÿ]/.test(trimmed)) continue;

      const parts = trimmed.split(/[\t;, ]+/).map((p) => p.replace(",", "."));
      if (parts.length < 2) continue;

      let tVal: number | undefined = undefined;
      let hVal = 0;
      let vVal = 0;
      let fRaw = 0;
      let tauVal: number | undefined = undefined;

      // Dedução ou seleção de ordem de colunas
      if (columnOrder === "t_h_v_f" || (columnOrder === "auto" && parts.length >= 4 && !isNaN(parseFloat(parts[0])) && parseFloat(parts[0]) <= 500)) {
        tVal = parseFloat(parts[0]);
        hVal = parseFloat(parts[1]) * dispMult;
        vVal = parseFloat(parts[2]) * dispMult;
        fRaw = parseFloat(parts[3]);
        if (parts[4]) tauVal = parseFloat(parts[4]);
      } else if (columnOrder === "h_f_v") {
        hVal = parseFloat(parts[0]) * dispMult;
        fRaw = parseFloat(parts[1]);
        vVal = parseFloat(parts[2]) * dispMult;
        if (parts[3]) tauVal = parseFloat(parts[3]);
      } else {
        // Padrão: h_v_f (Horizontal, Vertical, Força)
        hVal = parseFloat(parts[0]) * dispMult;
        vVal = parseFloat(parts[1]) * dispMult;
        fRaw = parts[2] ? parseFloat(parts[2]) : 0;
        if (parts[3]) tauVal = parseFloat(parts[3]);
      }

      if (!isNaN(hVal) && !isNaN(fRaw)) {
        let fN = fRaw;
        let fKgf = fRaw / 9.80665;

        if (forceUnit === "kgf") {
          fKgf = fRaw;
          fN = fRaw * 9.80665;
        } else if (forceUnit === "kN") {
          fN = fRaw * 1000;
          fKgf = (fRaw * 1000) / 9.80665;
        }

        readings.push({
          timeMin: tVal && !isNaN(tVal) ? tVal : undefined,
          horizDispMm: hVal,
          vertDispMm: isNaN(vVal) ? 0 : vVal,
          shearForceN: fN,
          loadKgf: fKgf,
          shearStressKPa: tauVal && !isNaN(tauVal) ? tauVal : undefined,
        });
      }
    }

    const detectedZeroHoriz = detectZeroOrConstantHoriz(readings);
    const timeAnalysis = analyzeTimeColumn(readings);
    const validation = validateReconstructParams(readings, {
      deltaIni,
      deltaFin,
      deltaStep,
      speedMmMin,
      useTimeIfAvailable: useTimeBased,
    });

    return { readings, detectedZeroHoriz, timeAnalysis, validation };
  }, [rawText, columnOrder, forceUnit, dispUnit, deltaIni, deltaFin, deltaStep, speedMmMin, useTimeBased]);

  // Se deslocamento horizontal for detectado como zero, ativa automaticamente o modo de correção
  const shouldShowCorrection = rawParsedData.detectedZeroHoriz || forceCorrectionMode;

  // Pontos processados e reamostrados finais
  const finalProcessedPoints = useMemo<CDReading[]>(() => {
    if (!rawParsedData.readings.length) return [];
    if (kind === "shear") {
      if (shouldShowCorrection) {
        return reconstructShearReadings(rawParsedData.readings, {
          deltaIni,
          deltaFin,
          deltaStep,
          speedMmMin,
          useTimeIfAvailable: useTimeBased,
        });
      } else {
        // Fluxo normal sem correção linear
        return rawParsedData.readings.map((r) => ({
          horizDispMm: Number((r.horizDispMm ?? 0).toFixed(3)),
          vertDispMm: Number((r.vertDispMm ?? 0).toFixed(4)),
          shearForce: Number((r.shearForceN ?? 0).toFixed(2)),
          loadKgf: Number((r.loadKgf ?? 0).toFixed(2)),
        }));
      }
    }
    return [];
  }, [rawParsedData, shouldShowCorrection, deltaIni, deltaFin, deltaStep, speedMmMin, useTimeBased, kind]);

  const handleApplyImport = () => {
    if (!rawParsedData.readings.length) {
      toast.error("Cole ou carregue dados de ensaio antes de importar.");
      return;
    }

    if (kind === "shear") {
      if (finalProcessedPoints.length === 0) {
        toast.error("Nenhuma leitura válida gerada.");
        return;
      }
      onImportShear(finalProcessedPoints);
      toast.success(
        `${finalProcessedPoints.length} pontos de cisalhamento ${shouldShowCorrection ? "reconstruídos e " : ""}importados com sucesso para ${cpLabel}! ✓`
      );
    } else {
      // Adensamento
      const lines = rawText.trim().split(/\r?\n/);
      const parsedCons: { timeMin: number; settlementMm: number }[] = [];
      const dispMult = dispUnit === "cm" ? 10 : 1;

      for (const line of lines) {
        if (/^[A-Za-zÀ-ÿ]/.test(line.trim())) continue;
        const parts = line.trim().split(/[\t;, ]+/).map((p) => p.replace(",", "."));
        if (parts.length >= 2) {
          const t = parseFloat(parts[0]);
          const s = parseFloat(parts[1]);
          if (!isNaN(t) && !isNaN(s)) {
            parsedCons.push({ timeMin: t, settlementMm: s * dispMult });
          }
        }
      }
      if (!parsedCons.length) {
        toast.error("Nenhuma leitura de adensamento válida identificada.");
        return;
      }
      onImportConsolidation(parsedCons);
      toast.success(`${parsedCons.length} leituras de adensamento importadas para ${cpLabel}! ✓`);
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ClipboardPaste className="h-5 w-5 text-primary" />
            Importação e Correção de Dados — {cpLabel}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Importe dados via colagem direta ou arquivo. Se a coluna de deslocamento horizontal estiver zerada, o sistema reconstrói linearmente os pontos com interpolação contínua (ASTM D3080).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Tipo de Dados */}
          <div className="flex items-center gap-4 border-b pb-2">
            <label className="flex items-center gap-1.5 cursor-pointer font-medium">
              <input
                type="radio"
                name="cdImportKind"
                checked={kind === "shear"}
                onChange={() => setKind("shear")}
              />
              Cisalhamento / Ruptura (Horizontal, Vertical, Força)
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer font-medium">
              <input
                type="radio"
                name="cdImportKind"
                checked={kind === "consolidation"}
                onChange={() => setKind("consolidation")}
              />
              Adensamento (Tempo, Recalque)
            </label>
          </div>

          {/* Abas: Colar Texto ou Arquivo */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <div className="flex items-center justify-between mb-2">
              <TabsList className="grid grid-cols-2 w-48 h-8">
                <TabsTrigger value="paste" className="text-xs">
                  <ClipboardPaste className="h-3.5 w-3.5 mr-1" /> Colar
                </TabsTrigger>
                <TabsTrigger value="file" className="text-xs">
                  <Upload className="h-3.5 w-3.5 mr-1" /> Arquivo
                </TabsTrigger>
              </TabsList>

              {rawParsedData.readings.length > 0 && (
                <Badge variant="outline" className="text-xs bg-muted/40 font-mono">
                  {rawParsedData.readings.length} leituras brutas detectadas
                </Badge>
              )}
            </div>

            <TabsContent value="paste" className="mt-0 space-y-2">
              <Textarea
                placeholder={
                  kind === "shear"
                    ? "Cole aqui as colunas copiadas do Excel, bloco de notas ou sistema de aquisição:\n\n0.000\t0.013\t2.100\n0.000\t0.048\t17.498\n0.000\t0.072\t38.146\n0.000\t0.120\t85.741\n...\nou com Tempo:\n0.1\t0.000\t0.010\t5.2\n0.2\t0.000\t0.020\t12.8"
                    : "0.1\t0.010\n0.25\t0.025\n0.5\t0.040\n1.0\t0.065"
                }
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                className="h-36 font-mono text-xs"
              />
            </TabsContent>

            <TabsContent value="file" className="mt-0 space-y-2">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border hover:border-primary/60 rounded-lg p-6 text-center cursor-pointer bg-muted/20 transition-colors"
              >
                <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="font-semibold text-xs text-foreground">Clique para selecionar arquivo TXT, CSV ou XLSX</p>
                <p className="text-[11px] text-muted-foreground mt-1">Exportação da prensa de cisalhamento ou planilha</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.csv,.tsv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Configuração de Colunas e Unidades */}
          {kind === "shear" && (
            <div className="grid grid-cols-3 gap-2 bg-muted/20 p-2.5 rounded-lg border border-border/70">
              <div>
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Ordem das Colunas</Label>
                <Select value={columnOrder} onValueChange={(v) => setColumnOrder(v as ColumnOrderType)}>
                  <SelectTrigger className="h-7 text-xs mt-1 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Detecção Automática</SelectItem>
                    <SelectItem value="h_v_f">Horizontal · Vertical · Força</SelectItem>
                    <SelectItem value="h_f_v">Horizontal · Força · Vertical</SelectItem>
                    <SelectItem value="t_h_v_f">Tempo · Horiz · Vert · Força</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Unidade de Força</Label>
                <Select value={forceUnit} onValueChange={(v) => setForceUnit(v as ForceUnitType)}>
                  <SelectTrigger className="h-7 text-xs mt-1 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="N">Newtons (N)</SelectItem>
                    <SelectItem value="kgf">Quilograma-força (kgf)</SelectItem>
                    <SelectItem value="kN">Quilonewtons (kN)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Unidade de Deslocamento</Label>
                <Select value={dispUnit} onValueChange={(v) => setDispUnit(v as DispUnitType)}>
                  <SelectTrigger className="h-7 text-xs mt-1 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mm">Milímetros (mm)</SelectItem>
                    <SelectItem value="cm">Centímetros (cm)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* DIÁLOGO AUTOMÁTICO DE CORREÇÃO & RECONSTRUÇÃO LINEAR */}
          {kind === "shear" && shouldShowCorrection && (
            <div className="rounded-lg border-2 border-amber-500/60 bg-amber-500/10 p-3.5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <div>
                    <h4 className="font-bold text-xs text-amber-900 dark:text-amber-200">
                      Detecção Automática: Deslocamento Horizontal Ausente / Zerado
                    </h4>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300">
                      O sistema identificou que a prensa não registrou o deslocamento horizontal. Configure os parâmetros abaixo para reconstruir e reamostrar linearmente:
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-700 bg-amber-100 dark:bg-amber-950/50">
                  Reconstrução Ativa
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                <div>
                  <Label className="text-[11px] font-semibold">δ inicial (mm)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={deltaIni}
                    onChange={(e) => setDeltaIni(parseFloat(e.target.value) || 0)}
                    className="h-8 text-xs bg-background mt-1 font-mono font-medium text-right"
                  />
                </div>

                <div>
                  <Label className="text-[11px] font-semibold">δ final (mm)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    value={deltaFin}
                    onChange={(e) => setDeltaFin(parseFloat(e.target.value) || 0)}
                    className="h-8 text-xs bg-background mt-1 font-mono font-medium text-right"
                  />
                </div>

                <div>
                  <Label className="text-[11px] font-semibold">Incremento Δδ (mm)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={deltaStep}
                    onChange={(e) => setDeltaStep(parseFloat(e.target.value) || 0.5)}
                    className="h-8 text-xs bg-background mt-1 font-mono font-medium text-right"
                  />
                </div>

                {rawParsedData.timeAnalysis.hasTime ? (
                  <div>
                    <Label className="text-[11px] font-semibold">Velocidade v (mm/min)</Label>
                    <Input
                      type="number"
                      step="0.05"
                      value={speedMmMin}
                      onChange={(e) => setSpeedMmMin(parseFloat(e.target.value) || 0.5)}
                      className="h-8 text-xs bg-background mt-1 font-mono font-medium text-right"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col justify-end">
                    <div className="text-[10px] text-muted-foreground font-mono bg-background p-1.5 rounded border text-center">
                      Método: Proporcional ao índice
                    </div>
                  </div>
                )}
              </div>

              {/* Informações da Reamostragem */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-500/30 text-xs">
                <span className="text-muted-foreground">
                  Leituras brutas: <b>{rawParsedData.validation.rawPointCount}</b> ➔ Pontos de saída gerados:{" "}
                  <b className="text-primary font-mono">{rawParsedData.validation.resampledPointCount}</b>
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Fórmula: δ_i = δ_ini + (δ_fin - δ_ini) · (i / (N-1))
                </span>
              </div>
            </div>
          )}

          {/* Alertas e Validações */}
          {rawParsedData.validation.warnings.length > 0 && (
            <Alert className="py-2 border-amber-500/40 bg-amber-500/5">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                Avisos de Consistência
              </AlertTitle>
              <AlertDescription className="text-[11px] text-amber-700 dark:text-amber-400 space-y-0.5 mt-1">
                {rawParsedData.validation.warnings.map((w, i) => (
                  <div key={i}>• {w}</div>
                ))}
              </AlertDescription>
            </Alert>
          )}

          {/* Prévia da Tabela de Pontos Reamostrados */}
          {finalProcessedPoints.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs flex items-center gap-1.5 text-foreground">
                  <TableIcon className="h-3.5 w-3.5 text-primary" />
                  Prévia dos Pontos Processados ({finalProcessedPoints.length} leituras)
                </span>
                <Badge variant="outline" className="text-[10px] font-mono">
                  Primeiro: {finalProcessedPoints[0]?.horizDispMm} mm · Último:{" "}
                  {finalProcessedPoints[finalProcessedPoints.length - 1]?.horizDispMm} mm
                </Badge>
              </div>

              <div className="border rounded-md max-h-36 overflow-y-auto bg-background">
                <table className="w-full text-xs font-mono border-collapse">
                  <thead className="bg-muted text-[10px] text-muted-foreground sticky top-0">
                    <tr>
                      <th className="p-1 text-center border-b">#</th>
                      <th className="p-1 text-right border-b">δ Horiz (mm)</th>
                      <th className="p-1 text-right border-b">δ Vert (mm)</th>
                      <th className="p-1 text-right border-b">Força (N)</th>
                      <th className="p-1 text-right border-b">Força (kgf)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finalProcessedPoints.slice(0, 8).map((p, idx) => (
                      <tr key={idx} className="border-b border-border/40 hover:bg-muted/30">
                        <td className="p-1 text-center text-muted-foreground">{idx + 1}</td>
                        <td className="p-1 text-right font-semibold text-primary">{p.horizDispMm.toFixed(3)}</td>
                        <td className="p-1 text-right">{p.vertDispMm.toFixed(3)}</td>
                        <td className="p-1 text-right">{p.shearForce.toFixed(1)}</td>
                        <td className="p-1 text-right text-muted-foreground">{(p.loadKgf ?? p.shearForce / 9.807).toFixed(2)}</td>
                      </tr>
                    ))}
                    {finalProcessedPoints.length > 8 && (
                      <tr className="bg-muted/20">
                        <td colSpan={5} className="p-1 text-center text-[10px] text-muted-foreground">
                          ... mais {finalProcessedPoints.length - 8} pontos interpolados continuamente ...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 border-t pt-3">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleApplyImport}
            disabled={!finalProcessedPoints.length || !rawParsedData.validation.isValid}
          >
            <CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirmar e Importar {finalProcessedPoints.length} Pontos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
