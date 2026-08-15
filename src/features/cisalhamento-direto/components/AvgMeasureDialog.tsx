import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ruler } from "lucide-react";

export function AvgMeasureDialog({
  label,
  unit,
  values,
  onSave,
  triggerLabel,
}: {
  label: string;
  unit: string;
  values: number[];
  onSave: (avg: number, values: number[]) => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<number[]>(() => {
    const base = [...(values ?? [])];
    while (base.length < 5) base.push(0);
    return base.slice(0, 5);
  });

  const nonZero = vals.filter((v) => v > 0);
  const avg = nonZero.length ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          const base = [...(values ?? [])];
          while (base.length < 5) base.push(0);
          setVals(base.slice(0, 5));
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1 px-2 text-xs">
          <Ruler className="h-3.5 w-3.5" />
          {triggerLabel ?? "Medir"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            Informe até 5 medições ({unit}). A média das medições preenchidas será utilizada.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-5 gap-2 py-2">
          {vals.map((v, i) => (
            <div key={i}>
              <Label className="text-[10px] text-muted-foreground">#{i + 1}</Label>
              <Input
                type="number"
                step={0.01}
                value={v}
                onChange={(e) =>
                  setVals((s) => s.map((x, xi) => (xi === i ? parseFloat(e.target.value) || 0 : x)))
                }
                className="h-8 text-xs"
              />
            </div>
          ))}
        </div>
        <div className="rounded-md border bg-muted/40 p-2 text-sm">
          Média ({nonZero.length} medição{nonZero.length === 1 ? "" : "es"}):{" "}
          <b>
            {avg > 0
              ? avg.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : "—"}
          </b>{" "}
          {unit}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onSave(avg, vals);
              setOpen(false);
            }}
          >
            Salvar média
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
