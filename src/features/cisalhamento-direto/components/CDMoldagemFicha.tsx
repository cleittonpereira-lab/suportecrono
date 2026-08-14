import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CDSpecimen, CDSample, CDSpecimenResults, MoistureCapsule } from "../types";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

function MiniNum({ value, onChange, step = 0.01 }: { value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <Input
      type="number"
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="h-7 px-1 text-center text-[11px]"
    />
  );
}

function NumField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="h-8 text-xs"
      />
    </div>
  );
}

export function CDMoldagemFicha({
  cp,
  res,
  sample,
  onCp,
  capsOpen,
  onToggleCaps,
  geomOpen,
  onToggleGeom,
  finalOpen,
  onToggleFinal,
}: {
  cp: CDSpecimen;
  res: CDSpecimenResults;
  sample: CDSample;
  onCp: (patch: Partial<CDSpecimen>) => void;
  capsOpen: boolean;
  onToggleCaps: () => void;
  geomOpen: boolean;
  onToggleGeom: () => void;
  finalOpen: boolean;
  onToggleFinal: () => void;
}) {
  const wCap = (c: MoistureCapsule) => {
    const ms = c.dry - c.tara;
    return ms > 0 ? ((c.wet - c.dry) / ms) * 100 : NaN;
  };

  const updateCap = (i: number, patch: Partial<MoistureCapsule>, kind: "initial" | "final") => {
    const caps = kind === "initial" ? [...cp.capsules] : [...cp.finalCapsules];
    caps[i] = { ...caps[i], ...patch };
    if (kind === "initial") onCp({ capsules: caps });
    else onCp({ finalCapsules: caps });
  };

  const addCap = (kind: "initial" | "final") => {
    const caps = kind === "initial" ? [...cp.capsules] : [...cp.finalCapsules];
    caps.push({ tipo: "M", numero: "", tara: 0, wet: 0, dry: 0 });
    if (kind === "initial") onCp({ capsules: caps });
    else onCp({ finalCapsules: caps });
  };

  const removeCap = (i: number, kind: "initial" | "final") => {
    const caps = kind === "initial" ? [...cp.capsules] : [...cp.finalCapsules];
    if (caps.length <= 1) return;
    caps.splice(i, 1);
    if (kind === "initial") onCp({ capsules: caps });
    else onCp({ finalCapsules: caps });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border">
        <div
          className="flex w-full items-center justify-between border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide"
        >
          <button
            type="button"
            onClick={onToggleCaps}
            className="flex items-center gap-2 hover:opacity-70"
          >
            {capsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Moldagem — Umidade Inicial ({cp.displayId ?? cp.id})
          </button>
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-normal text-muted-foreground lowercase">Média w₀ = {fmt(res.moisture0Pct, 2)}%</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => addCap("initial")}
              title="Adicionar cápsula"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
        {capsOpen && (
          <div className="p-3">
            <Table>
              <TableHeader>
                <TableRow className="h-8 bg-muted/30">
                  <TableHead className="text-[10px] w-20">Cápsula</TableHead>
                  <TableHead className="text-[10px]">Tara (g)</TableHead>
                  <TableHead className="text-[10px]">Úmida+T (g)</TableHead>
                  <TableHead className="text-[10px]">Seca+T (g)</TableHead>
                  <TableHead className="text-[10px] text-right">w (%)</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cp.capsules.map((c, i) => (
                  <TableRow key={i} className="h-10">
                    <TableCell className="p-1">
                      <Input 
                        className="h-7 text-[11px]" 
                        value={c.numero ?? ""} 
                        onChange={e => updateCap(i, { numero: e.target.value }, "initial")} 
                        placeholder="#" 
                      />
                    </TableCell>
                    <TableCell className="p-1"><MiniNum value={c.tara} onChange={v => updateCap(i, { tara: v }, "initial")} /></TableCell>
                    <TableCell className="p-1"><MiniNum value={c.wet} onChange={v => updateCap(i, { wet: v }, "initial")} /></TableCell>
                    <TableCell className="p-1"><MiniNum value={c.dry} onChange={v => updateCap(i, { dry: v }, "initial")} /></TableCell>
                    <TableCell className="text-right text-[11px] text-muted-foreground">{fmt(wCap(c), 2)}</TableCell>
                    <TableCell className="p-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => removeCap(i, "initial")}
                        disabled={cp.capsules.length <= 1}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="rounded-md border border-border">
        <button
          type="button"
          onClick={onToggleGeom}
          className="flex w-full items-center justify-between border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide"
        >
          <span className="flex items-center gap-2">
            {geomOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Geometria e Massas — {cp.displayId ?? cp.id}
          </span>
        </button>
        {geomOpen && (
          <div className="grid grid-cols-2 gap-4 p-3 sm:grid-cols-4">
            {sample.geometry === "circular" ? (
               <NumField label="Diâmetro (mm)" value={cp.diameterMm || sample.dimensionMm} onChange={v => onCp({ diameterMm: v })} step={0.01} />
            ) : (
               <>
                 <NumField label="Largura (mm)" value={cp.widthMm || sample.dimensionMm} onChange={v => onCp({ widthMm: v })} step={0.01} />
                 <NumField label="Comprimento (mm)" value={cp.lengthMm || sample.dimensionMm} onChange={v => onCp({ lengthMm: v })} step={0.01} />
               </>
            )}
            <NumField label="Altura H₀ (mm)" value={cp.height0Mm} onChange={v => onCp({ height0Mm: v })} step={0.01} />
            <NumField label="Massa CP + Anel (g)" value={cp.wetMassCPAnel} onChange={v => onCp({ wetMassCPAnel: v })} step={0.01} />
            <NumField label="Massa Anel (g)" value={cp.ringMass} onChange={v => onCp({ ringMass: v })} step={0.01} />
            <NumField label="σn Alvo (kPa)" value={cp.normalStressTarget} onChange={v => onCp({ normalStressTarget: v })} />
          </div>
        )}
      </div>

      <div className="rounded-md border border-border">
        <div
          className="flex w-full items-center justify-between border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide"
        >
          <button
            type="button"
            onClick={onToggleFinal}
            className="flex items-center gap-2 hover:opacity-70"
          >
            {finalOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Finalização — Umidade Final ({cp.displayId ?? cp.id})
          </button>
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-normal text-muted-foreground lowercase">Média w_f = {fmt(res.moistureFinalPct, 2)}%</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => addCap("final")}
              title="Adicionar cápsula"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
        {finalOpen && (
          <div className="p-3">
             <Table>
              <TableHeader>
                <TableRow className="h-8 bg-muted/30">
                  <TableHead className="text-[10px] w-20">Cápsula</TableHead>
                  <TableHead className="text-[10px]">Tara (g)</TableHead>
                  <TableHead className="text-[10px]">Úmida+T (g)</TableHead>
                  <TableHead className="text-[10px]">Seca+T (g)</TableHead>
                  <TableHead className="text-[10px] text-right">w (%)</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cp.finalCapsules.map((c, i) => (
                  <TableRow key={i} className="h-10">
                    <TableCell className="p-1">
                      <Input 
                        className="h-7 text-[11px]" 
                        value={c.numero ?? ""} 
                        onChange={e => updateCap(i, { numero: e.target.value }, "final")} 
                        placeholder="#" 
                      />
                    </TableCell>
                    <TableCell className="p-1"><MiniNum value={c.tara} onChange={v => updateCap(i, { tara: v }, "final")} /></TableCell>
                    <TableCell className="p-1"><MiniNum value={c.wet} onChange={v => updateCap(i, { wet: v }, "final")} /></TableCell>
                    <TableCell className="p-1"><MiniNum value={c.dry} onChange={v => updateCap(i, { dry: v }, "final")} /></TableCell>
                    <TableCell className="text-right text-[11px] text-muted-foreground">{fmt(wCap(c), 2)}</TableCell>
                    <TableCell className="p-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => removeCap(i, "final")}
                        disabled={cp.finalCapsules.length <= 1}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}