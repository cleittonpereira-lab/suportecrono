import React from "react";
import type { CDSample, CDSpecimen, CDSpecimenResults } from "../types";
import { BRAND } from "../constants";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function CDSpecimensSummaryCard({
  sample,
  specimens,
  results,
}: {
  sample: CDSample;
  specimens: CDSpecimen[];
  results: CDSpecimenResults[];
}) {
  return (
    <div className="rounded-md border border-border bg-muted/20 p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Resumo dos corpos de prova (CPs)
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {results.map((r, i) => {
          const s = specimens[i];
          if (!s) return null;
          return (
            <div
              key={s.id}
              className="rounded border bg-background p-2 transition hover:shadow-sm"
              style={{ borderColor: (s.color ?? BRAND) + "80" }}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: s.color ?? BRAND }}>
                  {s.displayId ?? s.id}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  σn = {fmt(s.normalStressTarget, 0)} kPa
                </span>
              </div>
              <div className="space-y-0.5 text-[10.5px] text-muted-foreground">
                <div>D₀ = <b>{fmt(r.D0, 2)}</b> mm</div>
                <div>H₀ = <b>{fmt(r.H0, 2)}</b> mm</div>
                <div>w₀ = <b>{fmt(r.moisture0Pct, 2)}%</b></div>
                <div>e₀ = <b>{fmt(r.voidRatio0, 3)}</b></div>
                <div>Sr₀ = <b>{fmt(r.saturation0Pct, 1)}%</b></div>
                <div>τ_pico = <b className="text-foreground">{fmt(r.tauPeak, 1)} kPa</b></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
