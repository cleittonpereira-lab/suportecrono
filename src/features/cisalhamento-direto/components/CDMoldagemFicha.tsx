import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, Plus, Trash2, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CDSpecimen, CDSample, CDSpecimenResults, MoistureCapsule } from "../types";
import { AvgMeasureDialog } from "./AvgMeasureDialog";
import { PhotoUploader } from "@/features/lab/components/PhotoUploader";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

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
    <Input
      type="number"
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="h-7 px-1 text-center text-xs"
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-background p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold text-foreground">{value}</div>
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
      {/* 1. ETAPA DE MOLDAGEM — CÁPSULAS DE UMIDADE */}
      <div className="rounded-md border border-border bg-card">
        <button
          type="button"
          onClick={onToggleCaps}
          className="flex w-full items-center justify-between border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide"
        >
          <span className="flex items-center gap-2">
            {capsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            ETAPA DE MOLDAGEM — CÁPSULAS DE UMIDADE ({cp.displayId ?? cp.id})
          </span>
          <span className="text-[11px] font-normal text-muted-foreground">
            MÉDIA W₀ = {fmt(res.moisture0Pct, 2)}%
          </span>
        </button>
        {capsOpen && (
          <div className="overflow-x-auto p-3">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="border border-border px-3 py-1.5 text-left w-1/4">Cápsula</th>
                  <th className="border border-border px-3 py-1.5 text-center w-1/4">1</th>
                  <th className="border border-border px-3 py-1.5 text-center w-1/4">2</th>
                  <th className="border border-border px-3 py-1.5 text-center w-1/4">3</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-border px-3 py-1.5 font-medium">Tipo</td>
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
                  <td className="border border-border px-3 py-1.5 font-medium">Nº Cápsula</td>
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
                  <td className="border border-border px-3 py-1.5 font-medium">Tara (g)</td>
                  {caps.slice(0, 3).map((c, i) => (
                    <td key={i} className="border border-border p-1">
                      <MiniNum value={c.tara} step={0.01} onChange={(v) => updateCap(i, { tara: v })} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="border border-border px-3 py-1.5 font-medium">Amostra Úmida + Tara (g)</td>
                  {caps.slice(0, 3).map((c, i) => (
                    <td key={i} className="border border-border p-1">
                      <MiniNum value={c.wet} step={0.01} onChange={(v) => updateCap(i, { wet: v })} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="border border-border px-3 py-1.5 font-medium">Amostra Seca + Tara (g)</td>
                  {caps.slice(0, 3).map((c, i) => (
                    <td key={i} className="border border-border p-1">
                      <MiniNum value={c.dry} step={0.01} onChange={(v) => updateCap(i, { dry: v })} />
                    </td>
                  ))}
                </tr>
                <tr className="bg-muted/20">
                  <td className="border border-border px-3 py-1.5 font-medium">Umidade (%)</td>
                  {caps.slice(0, 3).map((c, i) => {
                    const w = wCap(c);
                    return (
                      <td key={i} className="border border-border px-3 py-1.5 text-center text-muted-foreground">
                        {isFinite(w) ? fmt(w, 2) : "—"}
                      </td>
                    );
                  })}
                </tr>
                <tr className="bg-muted/40 font-semibold">
                  <td className="border border-border px-3 py-1.5">Média (%)</td>
                  <td className="border border-border px-3 py-1.5 text-center font-bold" colSpan={3}>
                    {fmt(res.moisture0Pct, 2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 2. GEOMETRIA E PROGRAMA */}
      <div className="rounded-md border border-border bg-card">
        <button
          type="button"
          onClick={onToggleGeom}
          className="flex w-full items-center justify-between border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide"
        >
          <span className="flex items-center gap-2">
            {geomOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            GEOMETRIA E PROGRAMA — {cp.displayId ?? cp.id}
          </span>
          <span className="text-[11px] font-normal text-muted-foreground">
            D₀={fmt(cp.diameterMm || sample.dimensionMm, 2)} mm · H₀={fmt(cp.height0Mm, 2)} mm · σn={fmt(cp.normalStressTarget, 0)} kPa
          </span>
        </button>
        {geomOpen && (
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
            <div>
              <Label className="text-xs">Diâmetro / Lado D₀ (mm)</Label>
              <div className="flex items-center gap-1 mt-1">
                <Input
                  type="number"
                  step={0.01}
                  value={cp.diameterMm || sample.dimensionMm}
                  onChange={(e) => onCp({ diameterMm: parseFloat(e.target.value) || 0 })}
                  className="h-8 text-xs"
                />
                <AvgMeasureDialog
                  label={`Diâmetro D₀ — ${cp.displayId ?? cp.id}`}
                  unit="mm"
                  values={cp.D0measurements ?? []}
                  onSave={(avg, vals) => onCp({ diameterMm: avg, D0measurements: vals })}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Altura CP H₀ (mm)</Label>
              <div className="flex items-center gap-1 mt-1">
                <Input
                  type="number"
                  step={0.01}
                  value={cp.height0Mm}
                  onChange={(e) => onCp({ height0Mm: parseFloat(e.target.value) || 0 })}
                  className="h-8 text-xs"
                />
                <AvgMeasureDialog
                  label={`Altura H₀ — ${cp.displayId ?? cp.id}`}
                  unit="mm"
                  values={cp.H0measurements ?? []}
                  onSave={(avg, vals) => onCp({ height0Mm: avg, H0measurements: vals })}
                />
              </div>
            </div>
            <NumField
              label="Massa inicial CP (g)"
              value={cp.wetMass}
              step={0.01}
              onChange={(v) => onCp({ wetMass: v })}
            />
            <NumField
              label="σn alvo (kPa)"
              value={cp.normalStressTarget}
              onChange={(v) => onCp({ normalStressTarget: v })}
            />
            <NumField
              label="Massa final CP (g)"
              value={cp.mFinal ?? 0}
              step={0.01}
              onChange={(v) => onCp({ mFinal: v })}
            />
            <NumField
              label="Umidade final w_f (%)"
              value={cp.wFinalPct ?? 0}
              step={0.01}
              onChange={(v) => onCp({ wFinalPct: v })}
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
                  <SelectItem value="max_tau">Máx. Tensão Cisalhante (τ)</SelectItem>
                  <SelectItem value="residual">Resistência Residual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* 3. ÍNDICES FÍSICOS CALCULADOS */}
      <div className="rounded-md border border-border bg-card">
        <button
          type="button"
          onClick={onToggleIndices}
          className="flex w-full items-center justify-between border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide"
        >
          <span className="flex items-center gap-2">
            {indicesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            ÍNDICES FÍSICOS CALCULADOS — {cp.displayId ?? cp.id}
          </span>
          <span className="text-[11px] font-normal text-muted-foreground">
            e₀={fmt(res.voidRatio0, 3)} · Sr₀={fmt(res.saturation0Pct, 1)}%
          </span>
        </button>
        {indicesOpen && (
          <div className="grid grid-cols-2 gap-2 bg-muted/20 p-3 text-xs sm:grid-cols-4">
            <Stat label="VOLUME V₀" value={`${fmt(res.volume0, 2)} cm³`} />
            <Stat label="ÁREA A₀" value={`${fmt(res.area0, 2)} cm²`} />
            <Stat label="γ NATURAL" value={`${fmt(res.wetDensity * 9.807, 2)} kN/m³`} />
            <Stat label="γ SECA" value={`${fmt(res.dryDensity * 9.807, 2)} kN/m³`} />
            <Stat label="MASSA SECA CP" value={`${fmt(res.dryMass, 2)} g`} />
            <Stat label="ÍNDICE DE VAZIOS E₀" value={fmt(res.voidRatio0, 3)} />
            <Stat label="SR₀" value={`${fmt(res.saturation0Pct, 1)} %`} />
            <Stat label="UMIDADE MÉDIA W₀" value={`${fmt(res.moisture0Pct, 2)} %`} />
          </div>
        )}
      </div>

      {/* 4. ETAPA FINAL — CÁPSULAS DE UMIDADE E MASSA FINAL */}
      <div className="rounded-md border border-border bg-card">
        <button
          type="button"
          onClick={onToggleFinal}
          className="flex w-full items-center justify-between border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide"
        >
          <span className="flex items-center gap-2">
            {finalOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            ETAPA FINAL — CÁPSULAS DE UMIDADE E MASSA FINAL DO CP ({cp.displayId ?? cp.id})
          </span>
          <span className="text-[11px] font-normal text-muted-foreground">
            {isFinite(wFinalEff) && wFinalEff > 0 ? `w_f = ${fmt(wFinalEff, 2)}%` : "SEM DADOS"}
          </span>
        </button>
        {finalOpen && (
          <div className="p-3 space-y-4">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-muted/30 text-muted-foreground">
                <tr>
                  <th className="border border-border px-3 py-1.5 text-left w-1/4">Cápsula (final)</th>
                  <th className="border border-border px-3 py-1.5 text-center w-1/4">1</th>
                  <th className="border border-border px-3 py-1.5 text-center w-1/4">2</th>
                  <th className="border border-border px-3 py-1.5 text-center w-1/4">3</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-border px-3 py-1.5 font-medium">Tipo</td>
                  {finalCaps.slice(0, 3).map((c, i) => (
                    <td key={i} className="border border-border p-1">
                      <Input
                        className="h-7 text-xs text-center"
                        value={c.tipo ?? ""}
                        onChange={(e) => updateFinalCap(i, { tipo: e.target.value })}
                        placeholder="M"
                      />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="border border-border px-3 py-1.5 font-medium">Nº Cápsula</td>
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
                  <td className="border border-border px-3 py-1.5 font-medium">Tara (g)</td>
                  {finalCaps.slice(0, 3).map((c, i) => (
                    <td key={i} className="border border-border p-1">
                      <MiniNum value={c.tara} step={0.01} onChange={(v) => updateFinalCap(i, { tara: v })} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="border border-border px-3 py-1.5 font-medium">Amostra Úmida + Tara (g)</td>
                  {finalCaps.slice(0, 3).map((c, i) => (
                    <td key={i} className="border border-border p-1">
                      <MiniNum value={c.wet} step={0.01} onChange={(v) => updateFinalCap(i, { wet: v })} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="border border-border px-3 py-1.5 font-medium">Amostra Seca + Tara (g)</td>
                  {finalCaps.slice(0, 3).map((c, i) => (
                    <td key={i} className="border border-border p-1">
                      <MiniNum value={c.dry} step={0.01} onChange={(v) => updateFinalCap(i, { dry: v })} />
                    </td>
                  ))}
                </tr>
                <tr className="bg-muted/20">
                  <td className="border border-border px-3 py-1.5 font-medium">Umidade final (%)</td>
                  {finalCaps.slice(0, 3).map((c, i) => {
                    const w = wCap(c);
                    return (
                      <td key={i} className="border border-border px-3 py-1.5 text-center text-muted-foreground">
                        {isFinite(w) ? fmt(w, 2) : "—"}
                      </td>
                    );
                  })}
                </tr>
                <tr className="bg-muted/40 font-semibold">
                  <td className="border border-border px-3 py-1.5">Média w_f (%)</td>
                  <td className="border border-border px-3 py-1.5 text-center font-bold" colSpan={3}>
                    {fmt(wFinalEff, 2)}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="grid grid-cols-2 gap-2 bg-muted/20 p-3 text-xs sm:grid-cols-4">
              <Stat label="W_F MÉDIO" value={`${fmt(wFinalEff, 2)} %`} />
              <Stat label="MASSA SECA FINAL M_SD,F" value={`${fmt(dryMassFinal, 2)} g`} />
              <Stat label="ΔW = W_F − W₀" value={`${fmt(deltaW, 2)} %`} />
              <Stat label="ΔM = M_F − M₀" value={`${fmt(deltaM, 2)} g`} />
              <Stat label="E_F (APÓS ADEN.)" value={fmt(eFinalApprox, 3)} />
              <Stat label="SR_F" value={`${fmt(SrFinal, 1)} %`} />
              <Stat label="γ_NAT,F" value={`${fmt(gammaNatFinal, 2)} kN/m³`} />
              <Stat label="γ_D,F" value={`${fmt(gammaDryFinal, 2)} kN/m³`} />
            </div>

            <div className="text-[10px] text-muted-foreground leading-relaxed">
              Equações: w = (m_água / m_sólidos) · 100; m_sd = m / (1 + w); γ = (m / V) · g; e = (Gs · γw / γd) − 1;
              Sr = (w · Gs) / e.
            </div>
          </div>
        )}
      </div>

      {/* 5. REGISTRO FOTOGRÁFICO EMBUTIDO */}
      {ctx && (
        <div className="rounded-md border border-border bg-card">
          <button
            type="button"
            onClick={onTogglePhoto}
            className="flex w-full items-center justify-between border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide"
          >
            <span className="flex items-center gap-2">
              {photoOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              REGISTRO FOTOGRÁFICO — {cp.displayId ?? cp.id}
            </span>
            <span className="text-[11px] font-normal text-muted-foreground">
              {(ctx.photos ?? []).filter((p: any) => p.specimenId === cp.id).length} FOTO(S)
            </span>
          </button>
          {photoOpen && (
            <div className="space-y-4 p-4">
              <PhotoUploader
                title={`Moldagem — ${cp.displayId ?? cp.id}`}
                kind="moldagem"
                photos={(ctx.photos ?? []).filter((p: any) => p.specimenId === cp.id && p.kind === "moldagem")}
                onAdd={(p) => ctx.addPhoto({ ...p, specimenId: cp.id, kind: "moldagem" })}
                onRemove={(id) => ctx.removePhoto(id)}
                onUpdate={(id, patch) => ctx.updatePhoto(id, patch)}
              />
              <PhotoUploader
                title={`Ruptura — ${cp.displayId ?? cp.id}`}
                kind="ruptura"
                photos={(ctx.photos ?? []).filter((p: any) => p.specimenId === cp.id && p.kind === "ruptura")}
                onAdd={(p) => ctx.addPhoto({ ...p, specimenId: cp.id, kind: "ruptura" })}
                onRemove={(id) => ctx.removePhoto(id)}
                onUpdate={(id, patch) => ctx.updatePhoto(id, patch)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}