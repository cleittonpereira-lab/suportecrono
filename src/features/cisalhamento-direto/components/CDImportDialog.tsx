import React, { useState } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import type { CDReading } from "../types";

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

  const handleParse = () => {
    const lines = rawText.trim().split(/\r?\n/);
    if (!lines.length || !rawText.trim()) {
      toast.error("Cole ou digite os dados antes de importar.");
      return;
    }

    try {
      if (kind === "shear") {
        const parsed: CDReading[] = [];
        for (const line of lines) {
          const parts = line.trim().split(/[\t;, ]+/).map((p) => p.replace(",", "."));
          if (parts.length >= 2) {
            const horizDisp = parseFloat(parts[0]);
            const loadOrForce = parseFloat(parts[1]);
            const vertDisp = parts[2] ? parseFloat(parts[2]) : 0;
            if (!isNaN(horizDisp) && !isNaN(loadOrForce)) {
              parsed.push({
                horizDispMm: horizDisp,
                loadKgf: loadOrForce,
                shearForce: loadOrForce * 9.80665,
                vertDispMm: isNaN(vertDisp) ? 0 : vertDisp,
              });
            }
          }
        }
        if (!parsed.length) {
          toast.error("Nenhuma linha válida identificada no formato: [Disp. H] [Carga kgf] [Recalque V]");
          return;
        }
        onImportShear(parsed);
        toast.success(`${parsed.length} pontos de cisalhamento importados para ${cpLabel}!`);
      } else {
        const parsed: { timeMin: number; settlementMm: number }[] = [];
        for (const line of lines) {
          const parts = line.trim().split(/[\t;, ]+/).map((p) => p.replace(",", "."));
          if (parts.length >= 2) {
            const timeMin = parseFloat(parts[0]);
            const settlementMm = parseFloat(parts[1]);
            if (!isNaN(timeMin) && !isNaN(settlementMm)) {
              parsed.push({ timeMin, settlementMm });
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar Leituras — {cpLabel}</DialogTitle>
          <DialogDescription>
            Cole abaixo as leituras diretamente do Excel, Bloco de Notas ou arquivo CSV.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-4 text-xs font-medium">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="importKind"
                checked={kind === "shear"}
                onChange={() => setKind("shear")}
              />
              Cisalhamento / Ruptura (Disp. H | Carga kgf | Recalque V)
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="importKind"
                checked={kind === "consolidation"}
                onChange={() => setKind("consolidation")}
              />
              Adensamento (Tempo min | Recalque mm)
            </label>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {kind === "shear"
                ? "Formato esperado: [Deformação H (mm)] [Carga (kgf)] [Recalque Vertical (mm)]"
                : "Formato esperado: [Tempo (min)] [Recalque Vertical (mm)]"}
            </Label>
            <Textarea
              placeholder={
                kind === "shear"
                  ? "0.00\t0.0\t0.000\n0.20\t5.4\t0.012\n0.40\t12.8\t0.025\n0.60\t21.5\t0.038"
                  : "0.1\t0.010\n0.25\t0.025\n0.5\t0.040\n1.0\t0.065\n2.0\t0.090"
              }
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="h-44 font-mono text-xs"
            />
          </div>
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
