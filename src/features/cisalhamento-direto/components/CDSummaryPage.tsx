import React, { useMemo } from 'react';
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line, Scatter, Label as RLabel } from 'recharts';
import { equalTicks } from "../domain/utils";
import { SectionBar } from './SectionBar';
import type { CDSample, CDSpecimen, CDSpecimenResults, CDEnvelopeResult } from "../types";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function CDSummaryPage({ 
  sample, 
  results, 
  envelope 
}: { 
  sample: CDSample, 
  specimens: CDSpecimen[], 
  results: CDSpecimenResults[], 
  envelope: CDEnvelopeResult | null 
}) {
  const chartData = useMemo(() => {
    return results.map((r) => ({
      sigma: r.sigmaN,
      tau: r.tauPeak,
      color: "#3b82f6" // fallback
    }));
  }, [results]);

  const maxSigma = useMemo(() => {
    const vals = results.map(r => r.sigmaN);
    return vals.length ? Math.max(...vals) : 100;
  }, [results]);

  const maxTau = useMemo(() => {
    const vals = results.map(r => r.tauPeak);
    return vals.length ? Math.max(...vals) : 100;
  }, [results]);

  const envelopeLine = useMemo(() => {
    if (!envelope) return [];
    const xEnd = maxSigma * 1.2;
    const yEnd = envelope.c + xEnd * Math.tan(envelope.phiDeg * Math.PI / 180);
    return [
      { sigma: 0, tau: envelope.c },
      { sigma: xEnd, tau: yEnd }
    ];
  }, [envelope, maxSigma]);

  return (
    <div className="flex flex-col gap-8 w-full">
      {/* Gráfico Tensão de Cisalhamento vs. Tensão Normal */}
      <div className="w-full h-[450px] relative border border-[#141414] bg-white">
        <SectionBar>Envoltória de Resistência (Mohr-Coulomb)</SectionBar>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 40, right: 40, bottom: 40, left: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={true} />
            <XAxis 
              type="number" 
              dataKey="sigma" 
              domain={[0, 'auto']}
              ticks={equalTicks(0, maxSigma * 1.2)}
              tick={{ fontSize: 10, fill: '#374151' }}
              stroke="#374151"
            >
              <RLabel value="Tensão Normal - σ' (kPa)" offset={-25} position="insideBottom" style={{ fontSize: 11, fontWeight: 600, fill: '#374151' }} />
            </XAxis>
            <YAxis 
              type="number" 
              domain={[0, 'auto']}
              ticks={equalTicks(0, maxTau * 1.2)}
              tick={{ fontSize: 10, fill: '#374151' }}
              stroke="#374151"
            >
              <RLabel value="Tensão de Cisalhamento - τ (kPa)" angle={-90} position="insideLeft" offset={10} style={{ fontSize: 11, fontWeight: 600, fill: '#374151' }} />
            </YAxis>
            <Tooltip 
              contentStyle={{ fontSize: 10, border: '1px solid #141414', borderRadius: '4px' }}
              formatter={(v: any) => fmt(v, 1)}
            />
            
            {/* Pontos de Ruptura */}
            <Scatter 
              name="Ruptura" 
              data={chartData} 
              fill="#ef4444" 
              shape="circle"
              line={false}
            />

            {/* Linha da Envoltória */}
            {envelope && (
              <Line 
                name="Envoltória"
                data={envelopeLine}
                dataKey="tau"
                stroke="#000"
                strokeWidth={2}
                dot={false}
                activeDot={false}
                legendType="line"
              />
            )}
            
            <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 10, paddingBottom: 10 }} />
          </ComposedChart>
        </ResponsiveContainer>
        
        {/* Parâmetros da Envoltória sobre o gráfico */}
        {envelope && (
          <div className="absolute bottom-16 right-16 flex flex-col gap-1 text-[11px]">
            <span className="rounded border border-[#141414]/60 bg-[#f3f4f6] px-3 py-1">
              <b>c'</b> <span className="text-[9px] text-[#141414]/70">(intercepto coesivo)</span> <b>=</b> {fmt(envelope.c, 2)} kPa
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
