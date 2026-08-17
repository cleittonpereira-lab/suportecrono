import React, { useMemo } from 'react';
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line, Scatter, Label as RLabel } from 'recharts';
import { equalTicks } from "../domain/utils";
import { SectionBar } from './SectionBar';
import type { CDSample, CDSpecimen, CDSpecimenResults, CDEnvelopeResult } from "../types";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function CDSummaryPage({ 
  sample, 
  specimens = [],
  results, 
  envelope 
}: { 
  sample: CDSample, 
  specimens?: CDSpecimen[], 
  results: CDSpecimenResults[], 
  envelope: CDEnvelopeResult | null 
}) {
  const lineColors = ["#1e40af", "#b45309", "#15803d", "#7e22ce", "#b91c1c", "#0284c7"];

  const xMax = useMemo(() => {
    const sigmaVals = results.map(r => r.sigmaN);
    const maxVal = sigmaVals.length ? Math.max(...sigmaVals, 100) : 100;
    return Math.max(100, Math.ceil((maxVal * 1.25) / 50) * 50);
  }, [results]);

  const xTicks = useMemo(() => {
    const list: number[] = [];
    const step = xMax <= 100 ? 25 : xMax <= 250 ? 50 : 100;
    for (let t = 0; t <= xMax; t += step) list.push(t);
    return list;
  }, [xMax]);

  const envelopeLine = useMemo(() => {
    if (!envelope) return [];
    const yEnd = envelope.c + xMax * Math.tan(envelope.phiDeg * Math.PI / 180);
    return [
      { sigma: 0, tau: envelope.c },
      { sigma: xMax, tau: yEnd }
    ];
  }, [envelope, xMax]);

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Gráfico Tensão de Cisalhamento vs. Tensão Normal */}
      <div className="w-full relative border border-[#141414] bg-white p-4 rounded-md flex flex-col items-center">
        <div className="w-full">
          <SectionBar>Envoltória de Resistência (Mohr-Coulomb)</SectionBar>
        </div>
        <div className="w-full h-[380px] my-3">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={true} />
              <XAxis 
                type="number" 
                dataKey="sigma" 
                domain={[0, xMax]}
                ticks={xTicks}
                tick={{ fontSize: 10, fill: '#374151' }}
                stroke="#374151"
              >
                <RLabel value="Tensão Normal - σ'n (kPa)" offset={-20} position="insideBottom" style={{ fontSize: 11, fontWeight: 600, fill: '#374151' }} />
              </XAxis>
              <YAxis 
                type="number" 
                dataKey="tau"
                domain={[0, "auto"]}
                tick={{ fontSize: 10, fill: '#374151' }}
                stroke="#374151"
              >
                <RLabel value="Tensão de Cisalhamento - τ (kPa)" angle={-90} position="insideLeft" offset={0} style={{ fontSize: 11, fontWeight: 600, fill: '#374151' }} />
              </YAxis>
              <Tooltip 
                contentStyle={{ fontSize: 10, border: '1px solid #141414', borderRadius: '4px' }}
                formatter={(v: any) => fmt(v, 1)}
              />
              
              {/* Linha da Envoltória */}
              {envelope && (
                <Line 
                  name={`Envoltória (c' = ${fmt(envelope.c, 2)} kPa, φ' = ${fmt(envelope.phiDeg, 2)}°)`}
                  data={envelopeLine}
                  dataKey="tau"
                  stroke="#0f172a"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={false}
                  legendType="line"
                />
              )}

              {/* Pontos de Ruptura Individuais Sólidos e Discretos */}
              {results.map((r, i) => {
                const color = specimens[i]?.color || lineColors[i % lineColors.length];
                const name = `${specimens[i]?.displayId ?? `CP${i + 1}`} (σn = ${fmt(r.sigmaN, 0)} kPa)`;
                return (
                  <Scatter 
                    key={i}
                    name={name}
                    data={[{ sigma: r.sigmaN, tau: r.tauPeak, x: r.sigmaN, y: r.tauPeak }]}
                    dataKey="tau"
                    fill={color}
                    shape={(props: any) => {
                      const { cx, cy } = props;
                      if (cx == null || cy == null || isNaN(cx) || isNaN(cy)) return <g />;
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={5.5}
                          fill={color}
                          stroke="#0f172a"
                          strokeWidth={1.5}
                        />
                      );
                    }}
                  />
                );
              })}
              
              <Legend verticalAlign="top" align="center" wrapperStyle={{ fontSize: 9, paddingBottom: 8 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        
        {/* Parâmetros da Envoltória sobre o gráfico */}
        {envelope && (
          <div className="flex flex-wrap justify-center gap-3 text-[11px] mt-2">
            <span className="rounded border border-[#141414]/60 bg-[#f3f4f6] px-3 py-1">
              <b>c'</b> <span className="text-[9px] text-[#141414]/70">(coesão efetiva)</span> <b>=</b> {fmt(envelope.c, 2)} kPa
            </span>
            <span className="rounded border border-[#141414]/60 bg-[#f3f4f6] px-3 py-1">
              <b>φ'</b> <span className="text-[9px] text-[#141414]/70">(ângulo de atrito)</span> <b>=</b> {fmt(envelope.phiDeg, 2)}°
            </span>
            <span className="rounded border border-[#141414]/60 bg-[#f3f4f6] px-3 py-1">
              <b>R² =</b> {fmt(envelope.r2, 3)}
            </span>
          </div>
        )}
      </div>

      {/* Gráficos de Cisalhamento: Tensão vs Deformação e Variação Volumétrica */}
      {/* Gráficos de Cisalhamento em Página Inteira ou Grid Lado a Lado no Resumo */}
      <div className="grid grid-cols-2 gap-4 w-full h-[380px]">
        {/* Tensão vs Deformação */}
        <div className="border border-[#141414] rounded-sm bg-white relative">
          <SectionBar>Tensão de Cisalhamento vs. Deformação</SectionBar>
          <ResponsiveContainer width="100%" height="88%">
            <ComposedChart margin={{ top: 20, right: 10, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                type="number" 
                dataKey="horizStrainPct" 
                domain={[0, 'auto']}
                tick={{ fontSize: 9 }}
              >
                <RLabel value="Deformação Horizontal (%)" offset={-15} position="insideBottom" style={{ fontSize: 9, fill: '#6b7280' }} />
              </XAxis>
              <YAxis 
                type="number" 
                domain={[0, 'auto']}
                tick={{ fontSize: 9 }}
              >
                <RLabel value="τ (kPa)" angle={-90} position="insideLeft" style={{ fontSize: 9, fill: '#6b7280' }} />
              </YAxis>
              {results.map((r, i) => (
                <Line 
                  key={i}
                  data={r.curve}
                  type="monotone"
                  dataKey="shearStress"
                  stroke={["#ef4444", "#3b82f6", "#10b981", "#f59e0b"][i % 4]}
                  strokeWidth={1.5}
                  dot={false}
                  name={`σn = ${fmt(r.sigmaN, 0)} kPa`}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: 8 }} verticalAlign="bottom" height={36}/>
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Variação de Altura vs Deformação */}
        <div className="border border-[#141414] rounded-sm bg-white relative">
          <SectionBar>Variação de Altura vs. Deformação</SectionBar>
          <ResponsiveContainer width="100%" height="88%">
            <ComposedChart margin={{ top: 20, right: 10, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis 
                type="number" 
                dataKey="horizStrainPct" 
                domain={[0, 'auto']}
                tick={{ fontSize: 9 }}
              >
                <RLabel value="Deformação Horizontal (%)" offset={-15} position="insideBottom" style={{ fontSize: 9, fill: '#6b7280' }} />
              </XAxis>
              <YAxis 
                type="number" 
                domain={['auto', 'auto']}
                tick={{ fontSize: 9 }}
                reversed
              >
                <RLabel value="Δh (mm)" angle={-90} position="insideLeft" style={{ fontSize: 9, fill: '#6b7280' }} />
              </YAxis>
              {results.map((r, i) => (
                <Line 
                  key={i}
                  data={r.curve}
                  type="monotone"
                  dataKey="vertDispMm"
                  stroke={["#ef4444", "#3b82f6", "#10b981", "#f59e0b"][i % 4]}
                  strokeWidth={1.5}
                  dot={false}
                  name={`σn = ${fmt(r.sigmaN, 0)} kPa`}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: 8 }} verticalAlign="bottom" height={36}/>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
