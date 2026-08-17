import React, { useState, useMemo } from "react";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { CDReading } from "../types";

export type ColumnOrderType = "h_v_f" | "h_f_v";
export type ForceUnitType = "N" | "kgf" | "kN";
export type DispUnitType = "mm" | "cm";

export function CDImportDialog({
  open,
  onOpenChange,
  onImportShear,
  onImportConsolidation,
  cpLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportShear: (readings: CDReading[]) => void;
  onImportConsolidation: (readings: { timeMin: number; settlementMm: number }[]) => void;
  cpLabel: string;
}) {
  const [kind, setKind] = useState<"shear" | "consolidation">("shear");
  const [rawText, setRawText] = useState("");
  
  // Opções de importação conforme solicitado pelo usuário
  const [columnOrder, setColumnOrder] = useState<ColumnOrderType>("h_v_f");
  const [forceUnit, setForceUnit] = useState<ForceUnitType>("N");
  const [dispUnit, setDispUnit] = useState<DispUnitType>("mm");

  // Parser em tempo real
  const parsedPreview = useMemo(() => {
    if (!rawText.trim()) return { count: 0, sampleRows: [] };
    const lines = rawText.trim().split(/\r?\n/);
    const validRows: { h: number; v: number; fN: number; fKgf: number; tau?: number }[] = [];

    const dispMult = dispUnit === "cm" ? 10 : 1;

    for (const line of lines) {
      // Ignorar cabeçalho se houver texto
      if (/^[A-Za-zÀ-ÿ]/.test(line.trim())) continue;

      const parts = line
        .trim()
        .split(/[\t;, ]+/)
        .map((p) => p.replace(",", "."));

      if (kind === "shear") {
        if (parts.length >= 2) {
          let hRaw = 0;
          let vRaw = 0;
          let fRaw = 0;
          let tauRaw: number | undefined = undefined;

          if (columnOrder === "h_v_f") {
            // HORIZONTAL | VERTICAL | FORÇA | TENSÃO (opcional)
            hRaw = parseFloat(parts[0]);
            vRaw = parseFloat(parts[1]);
            fRaw = parts[2] ? parseFloat(parts[2]) : 0;
            if (parts[3]) tauRaw = parseFloat(parts[3]);
          } else {
            // HORIZONTAL | FORÇA | VERTICAL
            hRaw = parseFloat(parts[0]);
            fRaw = parseFloat(parts[1]);
            vRaw = parts[2] ? parseFloat(parts[2]) : 0;
            if (parts[3]) tauRaw = parseFloat(parts[3]);
          }

          if (!isNaN(hRaw) && !isNaN(fRaw)) {
            let forceInNewtons = fRaw;
            let forceInKgf = fRaw / 9.80665;

            if (forceUnit === "kgf") {
              forceInKgf = fRaw;
              forceInNewtons = fRaw * 9.80665;
            } else if (forceUnit === "kN") {
              forceInNewtons = fRaw * 1000;
              forceInKgf = (fRaw * 1000) / 9.80665;
            } else {
              // N (padrão)
              forceInNewtons = fRaw;
              forceInKgf = fRaw / 9.80665;
            }

            validRows.push({
              h: hRaw * dispMult,
              v: (isNaN(vRaw) ? 0 : vRaw) * dispMult,
              fN: forceInNewtons,
              fKgf: forceInKgf,
              tau: tauRaw && !isNaN(tauRaw) ? tauRaw : undefined,
            });
          }
        }
      }
    }

    return {
      count: validRows.length,
      sampleRows: validRows.slice(0, 3),
    };
  }, [rawText, kind, columnOrder, forceUnit, dispUnit]);

  const handleParse = () => {
    const lines = rawText.trim().split(/\r?\n/);
    if (!lines.length || !rawText.trim()) {
      toast.error("Cole ou digite os dados antes de importar.");
      return;
    }

    const dispMult = dispUnit === "cm" ? 10 : 1;

    try {
      if (kind === "shear") {
        const parsed: CDReading[] = [];
        for (const line of lines) {
          if (/^[A-Za-zÀ-ÿ]/.test(line.trim())) continue; // Pular linha de cabeçalho

          const parts = line.trim().split(/[\t;, ]+/).map((p) => p.replace(",", "."));
          if (parts.length >= 2) {
            let hRaw = 0;
            let vRaw = 0;
            let fRaw = 0;

            if (columnOrder === "h_v_f") {
              // HORIZONTAL | VERTICAL | FORÇA
              hRaw = parseFloat(parts[0]);
              vRaw = parseFloat(parts[1]);
              fRaw = parts[2] ? parseFloat(parts[2]) : 0;
            } else {
              // HORIZONTAL | FORÇA | VERTICAL
              hRaw = parseFloat(parts[0]);
              fRaw = parseFloat(parts[1]);
              vRaw = parts[2] ? parseFloat(parts[2]) : 0;
            }

            if (!isNaN(hRaw) && !isNaN(fRaw)) {
              let forceInNewtons = fRaw;
              let forceInKgf = fRaw / 9.80665;

              if (forceUnit === "kgf") {
                forceInKgf = fRaw;
                forceInNewtons = fRaw * 9.80665;
              } else if (forceUnit === "kN") {
                forceInNewtons = fRaw * 1000;
                forceInKgf = (fRaw * 1000) / 9.80665;
              } else {
                // N
                forceInNewtons = fRaw;
                forceInKgf = fRaw / 9.80665;
              }

              parsed.push({
                horizDispMm: hRaw * dispMult,
                vertDispMm: (isNaN(vRaw) ? 0 : vRaw) * dispMult,
                loadKgf: forceInKgf,
                shearForce: forceInNewtons,
              });
            }
          }
        }
        if (!parsed.length) {
          toast.error("Nenhuma linha válida identificada no formato configurado.");
          return;
        }
        onImportShear(parsed);
        toast.success(`${parsed.length} pontos de cisalhamento importados para ${cpLabel}!`);
      } else {
        const parsed: { timeMin: number; settlementMm: number }[] = [];
        for (const line of lines) {
          if (/^[A-Za-zÀ-ÿ]/.test(line.trim())) continue;
          const parts = line.trim().split(/[\t;, ]+/).map((p) => p.replace(",", "."));
          if (parts.length >= 2) {
            const timeMin = parseFloat(parts[0]);
            const settlementMm = parseFloat(parts[1]);
            if (!isNaN(timeMin) && !isNaN(settlementMm)) {
              parsed.push({ timeMin, settlementMm: settlementMm * dispMult });
            }
          }
        }
        if (!parsed.length) {
          toast.error("Nenhuma linha válida identificada no formato: [Tempo min] [Recalque mm]");
          return;
        }
        onImportConsolidation(parsed);
        toast.success(`${parsed.length} leituras de adensamento importadas para ${cpLabel}!`);
      }

      setRawText("");
      onOpenChange(false);
    } catch (e) {
      toast.error("Erro ao interpretar os dados: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar e Colar Leituras — {cpLabel}</DialogTitle>
          <DialogDescription>
            Configure a ordem das colunas e as unidades de entrada para importar diretamente da sua planilha.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Tipo de Ensaio */}
          <div className="flex items-center gap-4 text-xs font-medium border-b pb-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="importKind"
                checked={kind === "shear"}
                onChange={() => setKind("shear")}
              />
              Cisalhamento / Ruptura (Horizontal, Vertical, Força)
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="importKind"
                checked={kind === "consolidation"}
                onChange={() => setKind("consolidation")}
              />
              Adensamento (Tempo, Recalque)
            </label>
          </div>

          {/* Configuração de Colunas e Unidades (Para Cisalhamento) */}
          {kind === "shear" && (
            <div className="grid grid-cols-3 gap-3 bg-muted/30 p-3 rounded-lg border">
              <div>
                <Label className="text-[11px] font-semibold text-foreground">Ordem das Colunas</Label>
                <Select value={columnOrder} onValueChange={(v) => setColumnOrder(v as ColumnOrderType)}>
                  <SelectTrigger className="h-8 text-xs mt-1 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="h_v_f">HORIZONTAL · VERTICAL · FORÇA</SelectItem>
                    <SelectItem value="h_f_v">HORIZONTAL · FORÇA · VERTICAL</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-foreground">Unidade de Força</Label>
                <Select value={forceUnit} onValueChange={(v) => setForceUnit(v as ForceUnitType)}>
                  <SelectTrigger className="h-8 text-xs mt-1 bg-background">
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
                <Label className="text-[11px] font-semibold text-foreground">Unidade de Deslocamento</Label>
                <Select value={dispUnit} onValueChange={(v) => setDispUnit(v as DispUnitType)}>
                  <SelectTrigger className="h-8 text-xs mt-1 bg-background">
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

          {/* Área de Colagem */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                {kind === "shear"
                  ? columnOrder === "h_v_f"
                    ? `Cole no formato: [HORIZONTAL (${dispUnit})] [VERTICAL (${dispUnit})] [FORÇA (${forceUnit})] [TENSÃO opcional]`
                    : `Cole no formato: [HORIZONTAL (${dispUnit})] [FORÇA (${forceUnit})] [VERTICAL (${dispUnit})] [TENSÃO opcional]`
                  : `Cole no formato: [Tempo (min)] [Recalque (${dispUnit})]`}
              </Label>
              {parsedPreview.count > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {parsedPreview.count} linhas válidas detectadas
                </Badge>
              )}
            </div>

            <Textarea
              placeholder={
                kind === "shear"
                  ? "HORIZONTAL\tVERTICAL\tFORÇA(N)\tTENSÃO C(kPa)\n0.000\t0.013\t2.100\t0.583\n0.500\t0.048\t17.498\t4.876\n1.000\t0.072\t38.146\t10.698\n1.500\t0.120\t85.741\t24.255"
                  : "TEMPO\tRECALQUE\n0.1\t0.010\n0.25\t0.025\n0.5\t0.040\n1.0\t0.065"
              }
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="h-44 font-mono text-xs"
            />
          </div>

          {/* Preview das primeiras linhas detectadas */}
          {kind === "shear" && parsedPreview.sampleRows.length > 0 && (
            <div className="rounded border bg-background p-2 text-[11px] space-y-1">
              <span className="font-semibold text-muted-foreground block text-[10px] uppercase">
                Prévia da conversão das 3 primeiras linhas:
              </span>
              {parsedPreview.sampleRows.map((r, idx) => (
                <div key={idx} className="font-mono text-xs flex items-center gap-3 text-foreground">
                  <span><b>H:</b> {r.h.toFixed(3)} mm</span>
                  <span><b>V:</b> {r.v.toFixed(3)} mm</span>
                  <span><b>Força:</b> {r.fN.toFixed(2)} N ({r.fKgf.toFixed(2)} kgf)</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleParse}>Importar Dados</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
