import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, Plus, Trash2, Camera, Beaker } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CDSpecimen, CDSample, CDSpecimenResults, MoistureCapsule } from "../types";
import { AvgMeasureDialog } from "./AvgMeasureDialog";
import { PhotoUploader } from "@/features/lab/components/PhotoUploader";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

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
  const [localVal, setLocalVal] = React.useState(() =>
    value == null || isNaN(value) ? "" : String(value).replace(".", ",")
  );

  React.useEffect(() => {
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

function MiniNum({
  value,
  onChange,
  step = 0.01,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <PtNumInput
      value={value}
      onChange={onChange}
      className="h-7 px-1 text-right text-xs font-mono"
    />
  );
}

function NumField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div>
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <PtNumInput
        value={value}
        onChange={onChange}
        className="h-8 text-xs text-right font-mono"
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-background p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

import { getAneisCatalog, type AnelItem } from "@/lib/aneis-catalog";
import { AneisManagerDialog } from "@/components/AneisManagerDialog";
import { CircleDot } from "lucide-react";

export function CDMoldagemFicha({
  cp,
  res,
  sample,
  onCp,
  capsOpen,
  onToggleCaps,
  geomOpen,
  onToggleGeom,
  indicesOpen = true,
  onToggleIndices,
  finalOpen,
  onToggleFinal,
  photoOpen = true,
  onTogglePhoto,
  ctx,
}: {
  cp: CDSpecimen;
  res: CDSpecimenResults;
  sample: CDSample;
  onCp: (patch: Partial<CDSpecimen>) => void;
  capsOpen: boolean;
  onToggleCaps: () => void;
  geomOpen: boolean;
  onToggleGeom: () => void;
  indicesOpen?: boolean;
  onToggleIndices?: () => void;
  finalOpen: boolean;
  onToggleFinal: () => void;
  photoOpen?: boolean;
  onTogglePhoto?: () => void;
  ctx?: any;
}) {
  const [aneisCatalogOpen, setAneisCatalogOpen] = React.useState(false);
  const aneisList = React.useMemo(() => getAneisCatalog(), [aneisCatalogOpen]);

  const caps = cp.capsules ?? [
    { tara: 0, wet: 0, dry: 0 },
    { tara: 0, wet: 0, dry: 0 },
    { tara: 0, wet: 0, dry: 0 },
  ];

  while (caps.length < 3) caps.push({ tara: 0, wet: 0, dry: 0 });

  const updateCap = (i: number, patch: Partial<MoistureCapsule>) => {
    const next = caps.map((c, ci) => (ci === i ? { ...c, ...patch } : c));
    onCp({ capsules: next });
  };

  const wCap = (c: { tara: number; wet: number; dry: number }) => {
    const ms = c.dry - c.tara;
    return ms > 0 ? ((c.wet - c.dry) / ms) * 100 : NaN;
  };

  // Etapa Final: Cápsulas de umidade + massa final
  const finalCaps = cp.finalCapsules ?? [
    { tara: 0, wet: 0, dry: 0 },
    { tara: 0, wet: 0, dry: 0 },
    { tara: 0, wet: 0, dry: 0 },
  ];

  while (finalCaps.length < 3) finalCaps.push({ tara: 0, wet: 0, dry: 0 });

  const updateFinalCap = (i: number, patch: Partial<MoistureCapsule>) => {
    const next = finalCaps.map((c, ci) => (ci === i ? { ...c, ...patch } : c));
    const valid = next.map(wCap).filter((v) => isFinite(v));
    const avg = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : undefined;
    onCp({ finalCapsules: next, ...(avg != null ? { wFinalPct: Number(avg.toFixed(3)) } : {}) });
  };

  const wFinalFromCaps = (() => {
    const vs = finalCaps.map(wCap).filter((v) => isFinite(v));
    return vs.length > 0 ? vs.reduce((a, b) => a + b, 0) / vs.length : NaN;
  })();

  const wFinalEff = isFinite(wFinalFromCaps) ? wFinalFromCaps : (cp.wFinalPct ?? NaN);
  const mFinal = cp.mFinal ?? 0;
  const dryMassFinal = mFinal > 0 && isFinite(wFinalEff) ? mFinal / (1 + wFinalEff / 100) : NaN;
  const eFinalApprox = res.voidRatioAfterCons;
  const SrFinal =
    isFinite(wFinalEff) && eFinalApprox > 0 && sample.Gs > 0
      ? Math.min(100, ((wFinalEff / 100) * sample.Gs) / eFinalApprox * 100)
      : NaN;
  const gammaNatFinal = res.volume0 > 0 && mFinal > 0 ? (mFinal / res.volume0) * 9.807 : NaN;
  const gammaDryFinal =
    res.volume0 > 0 && isFinite(dryMassFinal) && dryMassFinal > 0 ? (dryMassFinal / res.volume0) * 9.807 : NaN;
  const deltaW = isFinite(wFinalEff) ? wFinalEff - res.moisture0Pct : NaN;
  const deltaM = mFinal > 0 ? mFinal - res.wetMass : NaN;

  return (
    <div className="space-y-4">
      {/* 1. CONTAINER RECOLHÍVEL: DETERMINAÇÃO DA UMIDADE (INICIAL E FINAL) */}
      <Card className="border-primary/30 shadow-sm overflow-hidden">
        <CardHeader
          className="cursor-pointer select-none pb-2 pt-3 px-4 hover:bg-muted/40 transition-colors border-b border-border/40"
          onClick={onToggleCaps}
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
                  <Beaker className="h-4 w-4" /> Determinação da Umidade da Amostra — Cápsulas (Inicial e Final) — {cp.displayId ?? cp.id}
                </CardTitle>
                <CardDescription className="text-[11px]">
                  3 determinações com pesagens para cada etapa do ensaio (clique para recolher/expandir)
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-semibold bg-background border-primary/30 text-primary">
                w₀ Inicial = {fmt(res.moisture0Pct, 2)}%
              </Badge>
              <Badge variant="outline" className="text-xs font-semibold bg-background border-primary/30 text-primary">
                w_f Final = {isFinite(wFinalEff) ? fmt(wFinalEff, 2) : "—"}%
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
                  Média w₀ = {fmt(res.moisture0Pct, 2)}%
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
                    <td className="border border-border p-1.5 font-medium">Tipo</td>
                    {caps.slice(0, 3).map((c, i) => (
                      <td key={i} className="border border-border p-1">
                        <Input
                          className="h-7 text-xs text-center"
                          value={c.tipo ?? ""}
                          onChange={(e) => updateCap(i, { tipo: e.target.value })}
                          placeholder="M"
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-border p-1.5 font-medium">Nº Cápsula</td>
                    {caps.slice(0, 3).map((c, i) => (
                      <td key={i} className="border border-border p-1">
                        <Input
                          className="h-7 text-xs text-center"
                          value={c.numero ?? ""}
                          onChange={(e) => updateCap(i, { numero: e.target.value })}
                          placeholder={`#${i + 1}`}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-border p-1.5 font-medium">Tara (g)</td>
                    {caps.slice(0, 3).map((c, i) => (
                      <td key={i} className="border border-border p-1">
                        <PtNumInput
                          value={c.tara}
                          onChange={(v) => updateCap(i, { tara: v })}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-border p-1.5 font-medium">Solo Úmido + Tara (g)</td>
                    {caps.slice(0, 3).map((c, i) => (
                      <td key={i} className="border border-border p-1">
                        <PtNumInput
                          value={c.wet}
                          onChange={(v) => updateCap(i, { wet: v })}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-border p-1.5 font-medium">Solo Seco + Tara (g)</td>
                    {caps.slice(0, 3).map((c, i) => (
                      <td key={i} className="border border-border p-1">
                        <PtNumInput
                          value={c.dry}
                          onChange={(v) => updateCap(i, { dry: v })}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-muted/30">
                    <td className="border border-border p-1.5 font-medium">Umidade (%)</td>
                    {caps.slice(0, 3).map((c, i) => {
                      const w = wCap(c);
                      return (
                        <td key={i} className="border border-border p-1.5 text-right font-semibold">
                          {isFinite(w) ? `${w.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>

              <div className="mt-3 pt-2 border-t border-border/40 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Massa CP + Anel (g)</Label>
                  <PtNumInput
                    value={cp.wetMassCPAnel ?? (cp.ringMass && cp.wetMass ? cp.wetMass + cp.ringMass : undefined)}
                    onChange={(v) => {
                      const tara = cp.ringMass || 0;
                      const solo = v > tara ? v - tara : v;
                      onCp({ wetMassCPAnel: v, wetMass: solo });
                    }}
                    placeholder="Ex: 166,30"
                    className="h-8 text-xs text-right font-mono font-medium"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Tara do Anel (g)</Label>
                  <PtNumInput
                    value={cp.ringMass}
                    onChange={(v) => {
                      const total = cp.wetMassCPAnel || 0;
                      const solo = total > v ? total - v : cp.wetMass;
                      onCp({ ringMass: v, wetMass: solo });
                    }}
                    placeholder="Ex: 113,10"
                    className="h-8 text-xs text-right font-mono font-medium"
                  />
                </div>
              </div>
            </div>

            {/* Cápsulas Finais (Pós-Ensaio) */}
            <div className="border border-border/70 rounded-md p-3 bg-muted/10">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/50">
                <div className="font-bold text-xs text-primary">Umidade Final (Pós-Ensaio)</div>
                <Badge variant="secondary" className="text-[11px] font-bold">
                  Média w_f = {isFinite(wFinalEff) ? fmt(wFinalEff, 2) : "—"}%
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
                    <td className="border border-border p-1.5 font-medium">Tipo</td>
                    {finalCaps.slice(0, 3).map((c, i) => (
                      <td key={i} className="border border-border p-1">
                        <Input
                          className="h-7 text-xs text-center"
                          value={c.tipo ?? ""}
                          onChange={(e) => updateFinalCap(i, { tipo: e.target.value })}
                          placeholder="F"
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-border p-1.5 font-medium">Nº Cápsula</td>
                    {finalCaps.slice(0, 3).map((c, i) => (
                      <td key={i} className="border border-border p-1">
                        <Input
                          className="h-7 text-xs text-center"
                          value={c.numero ?? ""}
                          onChange={(e) => updateFinalCap(i, { numero: e.target.value })}
                          placeholder={`#${i + 1}`}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-border p-1.5 font-medium">Tara (g)</td>
                    {finalCaps.slice(0, 3).map((c, i) => (
                      <td key={i} className="border border-border p-1">
                        <PtNumInput
                          value={c.tara}
                          onChange={(v) => updateFinalCap(i, { tara: v })}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-border p-1.5 font-medium">Solo Úmido + Tara (g)</td>
                    {finalCaps.slice(0, 3).map((c, i) => (
                      <td key={i} className="border border-border p-1">
                        <PtNumInput
                          value={c.wet}
                          onChange={(v) => updateFinalCap(i, { wet: v })}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="border border-border p-1.5 font-medium">Solo Seco + Tara (g)</td>
                    {finalCaps.slice(0, 3).map((c, i) => (
                      <td key={i} className="border border-border p-1">
                        <PtNumInput
                          value={c.dry}
                          onChange={(v) => updateFinalCap(i, { dry: v })}
                        />
                      </td>
                    ))}
                  </tr>
                  <tr className="bg-muted/30">
                    <td className="border border-border p-1.5 font-medium">Umidade (%)</td>
                    {finalCaps.slice(0, 3).map((c, i) => {
                      const w = wCap(c);
                      return (
                        <td key={i} className="border border-border p-1.5 text-right font-semibold">
                          {isFinite(w) ? `${w.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : "—"}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
              <div className="mt-3 pt-2 border-t border-border/40 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Massa final CP m_f (g)</Label>
                  <PtNumInput
                    value={cp.mFinal ?? 0}
                    onChange={(v) => onCp({ mFinal: v })}
                    className="h-8 text-xs text-right font-mono"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* 2. GEOMETRIA E PROGRAMA DE TENSÕES */}
      <div className="rounded-md border border-border bg-card">
        <button
          type="button"
          onClick={onToggleGeom}
          className="flex w-full items-center justify-between border-b border-border/40 bg-muted/40 hover:bg-muted/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors text-primary"
        >
          <span className="flex items-center gap-2">
            {geomOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            GEOMETRIA E PROGRAMA — {cp.displayId ?? cp.id}
          </span>
          <span className="text-[11px] font-normal text-muted-foreground">
            D₀={fmt(res.D0, 2)} mm · H₀={fmt(res.H0, 2)} mm · σn={fmt(cp.normalStressTarget, 0)} kPa
          </span>
        </button>
        {geomOpen && (
          <div className="p-3 space-y-3">
            {/* Seletor de Anel Cadastrado */}
            <div className="rounded border bg-muted/20 p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 font-semibold text-xs text-primary">
                  <CircleDot className="h-4 w-4" /> Anel de Moldagem:
                </div>
                <Select
                  value={cp.ringNumber || ""}
                  onValueChange={(anelNum) => {
                    const anel = aneisList.find((a) => a.numero === anelNum);
                    if (anel) {
                      const dim = anel.secao === "circular" ? (anel.diametro_mm || 60) : (anel.lado_mm || 60);
                      onCp({
                        ringNumber: anel.numero,
                        ringMass: anel.massa_g,
                        diameterMm: dim,
                        D0measurements: [dim, dim, dim],
                        height0Mm: anel.altura_mm,
                        H0measurements: [anel.altura_mm, anel.altura_mm, anel.altura_mm],
                      });
                    }
                  }}
                >
                  <SelectTrigger className="h-7 text-xs w-64 font-mono font-medium">
                    <SelectValue placeholder="Escolha um anel cadastrado…" />
                  </SelectTrigger>
                  <SelectContent>
                    {aneisList.map((a) => (
                      <SelectItem key={a.id} value={a.numero} className="text-xs">
                        {a.numero} — {a.secao === "circular" ? `Ø ${a.diametro_mm}mm` : `${a.lado_mm}x${a.lado_mm}mm`} (H={a.altura_mm}mm · {a.massa_g}g)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                {cp.ringMass ? (
                  <Badge variant="outline" className="text-[11px] font-mono bg-background text-emerald-700 dark:text-emerald-400">
                    Tara: {cp.ringMass.toFixed(2)} g
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

            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <div className="flex items-end gap-1">
              <div className="flex-1">
                <NumField
                  label="Diâmetro D₀ (mm)"
                  value={res.D0}
                  step={0.01}
                  onChange={(v) => onCp({ diameterMm: v, D0measurements: [v, v, v] })}
                />
              </div>
              <AvgMeasureDialog
                label="Diâmetro do CP"
                unit="mm"
                values={cp.D0measurements ?? [res.D0, res.D0, res.D0]}
                onSave={(avg, ms) => onCp({ D0measurements: ms, diameterMm: avg })}
              />
            </div>
            <div className="flex items-end gap-1">
              <div className="flex-1">
                <NumField
                  label="Altura H₀ (mm)"
                  value={res.H0}
                  step={0.01}
                  onChange={(v) => onCp({ height0Mm: v, H0measurements: [v, v, v] })}
                />
              </div>
              <AvgMeasureDialog
                label="Altura do CP"
                unit="mm"
                values={cp.H0measurements ?? [res.H0, res.H0, res.H0]}
                onSave={(avg, ms) => onCp({ H0measurements: ms, height0Mm: avg })}
              />
            </div>
            <NumField
              label="σn alvo (kPa)"
              value={cp.normalStressTarget}
              onChange={(v) => onCp({ normalStressTarget: v })}
            />
            <div>
              <Label className="text-xs">Critério de ruptura</Label>
              <Select
                value={cp.failureCriterion || "max_tau"}
                onValueChange={(v: any) => onCp({ failureCriterion: v })}
              >
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="max_tau">Máxima Tensão Cisalhante (τ_max)</SelectItem>
                  <SelectItem value="residual">Tensão Residual (Final)</SelectItem>
                  <SelectItem value="delta_h_10pct">Deslocamento Horizontal de 10%</SelectItem>
                  <SelectItem value="delta_h_15pct">Deslocamento Horizontal de 15%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          </div>
        )}
      </div>

      {/* 3. ÍNDICES FÍSICOS CALCULADOS */}
      <div className="rounded-md border border-border bg-card">
        <button
          type="button"
          onClick={onToggleIndices}
          className="flex w-full items-center justify-between border-b border-border/40 bg-muted/40 hover:bg-muted/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors text-primary"
        >
          <span className="flex items-center gap-2">
            {indicesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            ÍNDICES FÍSICOS CALCULADOS — {cp.displayId ?? cp.id}
          </span>
          <span className="text-[11px] font-normal text-muted-foreground">
            e₀={fmt(res.voidRatio0, 3)} · Sr₀={fmt(res.saturation0Pct, 1)}% · γd={fmt(res.gammaDry, 2)} kN/m³
          </span>
        </button>
        {indicesOpen && (
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 lg:grid-cols-8">
            <Stat label="Massa Úmida (g)" value={fmt(res.wetMass, 2)} />
            <Stat label="Massa Seca (g)" value={fmt(res.dryMass, 2)} />
            <Stat label="Volume (cm³)" value={fmt(res.volume0, 2)} />
            <Stat label="Área (cm²)" value={fmt(res.area0, 3)} />
            <Stat label="γnat (kN/m³)" value={fmt(res.gammaNat, 2)} />
            <Stat label="γd (kN/m³)" value={fmt(res.gammaDry, 2)} />
            <Stat label="Índice Vazios e₀" value={fmt(res.voidRatio0, 3)} />
            <Stat label="Saturação Sr₀ (%)" value={`${fmt(res.saturation0Pct, 1)}%`} />
          </div>
        )}
      </div>

      {/* 4. REGISTRO FOTOGRÁFICO */}
      <div className="rounded-md border border-border bg-card">
        <button
          type="button"
          onClick={onTogglePhoto}
          className="flex w-full items-center justify-between border-b border-border/40 bg-muted/40 hover:bg-muted/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors text-primary"
        >
          <span className="flex items-center gap-2">
            {photoOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            REGISTRO FOTOGRÁFICO — {cp.displayId ?? cp.id}
          </span>
          <span className="text-[11px] font-normal text-muted-foreground">
            {((ctx?.photos || []).filter((p: any) => p.specimenId === cp.id)).length} FOTO(S)
          </span>
        </button>
        {photoOpen && (
          <div className="grid grid-cols-1 gap-4 p-3 md:grid-cols-2">
            <PhotoUploader
              title="Foto da Moldagem"
              kind="moldagem"
              photos={(ctx?.photos || []).filter((p: any) => p.specimenId === cp.id)}
              onAdd={(p: any) => ctx?.addPhoto?.({ ...p, specimenId: cp.id })}
              onRemove={(id: string) => ctx?.removePhoto?.(id)}
              onUpdate={(id: string, patch: any) => ctx?.updatePhoto?.(id, patch)}
            />
            <PhotoUploader
              title="Foto da Ruptura"
              kind="ruptura"
              photos={(ctx?.photos || []).filter((p: any) => p.specimenId === cp.id)}
              onAdd={(p: any) => ctx?.addPhoto?.({ ...p, specimenId: cp.id })}
              onRemove={(id: string) => ctx?.removePhoto?.(id)}
              onUpdate={(id: string, patch: any) => ctx?.updatePhoto?.(id, patch)}
            />
          </div>
        )}
      </div>

      {/* Modal de Gestão e Cadastro de Anéis */}
      <AneisManagerDialog
        open={aneisCatalogOpen}
        onOpenChange={setAneisCatalogOpen}
        ensaioFiltro="cisalhamento"
        onSelectAnel={(anel) => {
          const dim = anel.secao === "circular" ? (anel.diametro_mm || 60) : (anel.lado_mm || 60);
          onCp({
            ringNumber: anel.numero,
            ringMass: anel.massa_g,
            diameterMm: dim,
            D0measurements: [dim, dim, dim],
            height0Mm: anel.altura_mm,
            H0measurements: [anel.altura_mm, anel.altura_mm, anel.altura_mm],
          });
        }}
      />
    </div>
  );
}
