import React from "react";
import type { CDSample, CDSpecimen, CDSpecimenResults, CDEnvelopeResult } from "../types";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function CDSummaryTablePage({
  sample,
  specimens,
  results,
  envelope,
}: {
  sample: CDSample;
  specimens: CDSpecimen[];
  results: CDSpecimenResults[];
  envelope: CDEnvelopeResult | null;
}) {
  const cell = "border border-[#141414]/60 px-1 py-[2px] text-[8.5px] text-center";
  const cellL = "border border-[#141414]/60 px-1 py-[2px] text-[8.5px] text-left";

  const Row = ({
    label,
    values,
    unit,
  }: {
    label: string;
    values: (string | number | null | undefined)[];
    unit?: string;
  }) => (
    <tr>
      <td className={cellL}>
        {label} {unit && <span className="text-[#141414]/70">[{unit}]</span>}
      </td>
      {values.map((v, i) => (
        <td key={i} className={cell}>{v ?? "—"}</td>
      ))}
    </tr>
  );

  return (
    <div className="space-y-1 text-[10px] text-[#141414]">
      <div className="border border-[#141414] bg-[#141414]/10 px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wide border-b">
        Quadro Resumo dos Resultados
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={`${cell} bg-[#141414]/5 text-left`}>Característica da Amostra</th>
            {specimens.map((cp) => (
              <th key={cp.id} className={`${cell} bg-[#141414]/5`} style={{ color: cp.color }}>
                {cp.displayId ?? cp.id} · σn={fmt(cp.normalStressTarget, 0)} kPa
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <Row label="Altura Inicial, h₀" unit="mm" values={results.map((r) => fmt(r.H0, 2))} />
          <Row label="Diâmetro/Lado, D₀" unit="mm" values={results.map((r) => fmt(r.D0, 2))} />
          <Row label="Área Inicial, A₀" unit="cm²" values={results.map((r) => fmt(r.area0, 2))} />
          <Row label="Volume Inicial, V₀" unit="cm³" values={results.map((r) => fmt(r.volume0, 2))} />
          <Row label="Massa Úmida CP, m" unit="g" values={results.map((r) => fmt(r.wetMass, 2))} />
          <Row label="Umidade inicial, w₀" unit="%" values={results.map((r) => fmt(r.moisture0Pct, 2))} />
          <Row label="Massa Esp. Aparente Úmido, ρn" unit="g/cm³" values={results.map((r) => fmt(r.wetDensity, 2))} />
          <Row label="Massa Esp. Aparente Seco, ρd" unit="g/cm³" values={results.map((r) => fmt(r.dryDensity, 2))} />
          <Row label="Massa Específica dos Grãos, ρs" unit="g/cm³" values={results.map(() => fmt(sample.Gs, 2))} />
          <Row label="Índice de Vazios Inicial, e₀" values={results.map((r) => fmt(r.voidRatio0, 3))} />
          <Row label="Grau de Saturação Inicial, S₀" unit="%" values={results.map((r) => fmt(r.saturation0Pct, 1))} />
          
          <tr className="bg-[#141414]/5"><td className={cellL} colSpan={specimens.length + 1}>Pós-Adensamento</td></tr>
          <Row label="Recalque, Δh" unit="mm" values={results.map((r) => fmt(r.H0 - r.heightAfterCons, 3))} />
          <Row label="Altura, hc" unit="mm" values={results.map((r) => fmt(r.heightAfterCons, 2))} />
          <Row label="Índice de Vazios, ec" values={results.map((r) => fmt(r.voidRatioAfterCons, 3))} />
          <Row label="Grau de Saturação, Sc" unit="%" values={results.map((r) => fmt(r.saturationAfterConsPct, 1))} />

          <tr className="bg-[#141414]/5"><td className={cellL} colSpan={specimens.length + 1}>Cisalhamento</td></tr>
          <Row label="Tensão Normal, σn" unit="kPa" values={results.map((r) => fmt(r.sigmaN, 0))} />
          <Row label="Tensão de Cisalhamento Pico, τ_peak" unit="kPa" values={results.map((r) => fmt(r.tauPeak, 1))} />
          <Row label="Deformação Axial na Ruptura, ε_fail" unit="%" values={results.map((r) => fmt(r.horizStrainAtFailurePct, 2))} />
          <Row label="Umidade Final, wf" unit="%" values={results.map((r) => fmt(r.moistureFinalPct, 2))} />
          <Row label="Grau de Saturação Final, Sf" unit="%" values={results.map((r) => fmt(r.saturationFinalPct, 1))} />
          
          <tr>
            <td className={cellL}>Condição da Amostra</td>
            <td className={cell} colSpan={specimens.length}>
              {sample.sampleState === "indeformada" ? "Indeformada" : sample.sampleState === "compactada" ? "Compactada" : "Recompactada"}
            </td>
          </tr>
          <tr>
            <td className={cellL}>Condição do Ensaio</td>
            <td className={cell} colSpan={specimens.length}>
              {sample.testCondition === "inundado" ? "Inundado" : "Natural"}
            </td>
          </tr>
          <tr>
            <td className={cellL}>Descrição tátil-visual</td>
            <td className={cell} colSpan={specimens.length}>{sample.description || "—"}</td>
          </tr>
          {/* Foto placeholders removed from here as they moved to dedicated pages */}
        </tbody>
      </table>
      
      {envelope && (
        <div className="mt-1 grid grid-cols-3 gap-2 text-[9px]">
          <div className="rounded border border-[#141414]/40 px-2 py-1">
            <b>φ' =</b> {fmt(envelope.phiDeg, 2)}°
          </div>
          <div className="rounded border border-[#141414]/40 px-2 py-1">
            <b>c' =</b> {fmt(envelope.c, 2)} kPa
          </div>
          <div className="rounded border border-[#141414]/40 px-2 py-1">
            <b>R² =</b> {fmt(envelope.r2, 3)}
          </div>
        </div>
      )}
    </div>
  );
}
