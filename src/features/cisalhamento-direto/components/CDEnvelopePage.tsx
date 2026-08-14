import React from "react";
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line, Scatter, Label as RLabel } from "recharts";
import { SectionBar } from './SectionBar';
import type { CDSample, CDSpecimenResults, CDEnvelopeResult } from "../types";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function CDEnvelopePage({ 
  results, 
  envelope 
}: { 
  results: CDSpecimenResults[]; 
  envelope: CDEnvelopeResult | null;
}) {
  const chartData = React.useMemo(() => {
    return results.map((r) => ({
      sigma: r.sigmaN,
      tau: r.tauPeak,
    }));
  }, [results]);

  const maxSigma = React.useMemo(() => {
    const vals = results.map(r => r.sigmaN);
    return vals.length ? Math.max(...vals) : 100;
  }, [results]);

  const envelopeLine = React.useMemo(() => {
    if (!envelope) return [];
    const xEnd = maxSigma * 1.2;
    const yEnd = envelope.c + xEnd * Math.tan(envelope.phiDeg * Math.PI / 180);
    return [
      { sigma: 0, tau: envelope.c },
      { sigma: xEnd, tau: yEnd }
    ];
  }, [envelope, maxSigma]);

  return (
    <div className="flex flex-col gap-2 w-full h-full justify-center">
      <div className="w-full h-full relative border border-[#141414] bg-white">
        <SectionBar>Envoltória de Resistência (Mohr-Coulomb)</SectionBar>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 20, right: 30, bottom: 30, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={true} />
            <XAxis 
              type="number" 
              dataKey="sigma" 
              domain={[0, 'auto']}
              tick={{ fontSize: 10, fill: '#374151' }}
              stroke="#374151"
            >
              <RLabel value="Tensão Normal - σ' (kPa)" offset={-25} position="insideBottom" style={{ fontSize: 11, fontWeight: 600, fill: '#374151' }} />
            </XAxis>
            <YAxis 
              type="number" 
              domain={[0, 'auto']}
              tick={{ fontSize: 10, fill: '#374151' }}
              stroke="#374151"
            >
              <RLabel value="Tensão de Cisalhamento - τ (kPa)" angle={-90} position="insideLeft" offset={10} style={{ fontSize: 11, fontWeight: 600, fill: '#374151' }} />
            </YAxis>
            <Tooltip 
              contentStyle={{ fontSize: 10, border: '1px solid #141414', borderRadius: '4px' }}
              formatter={(v: any) => fmt(v, 1)}
            />
            
            <Scatter 
              name="Ruptura" 
              data={chartData} 
              fill="#ef4444" 
              shape="circle"
              line={false}
            />

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
        
        {envelope && (
          <div className="absolute bottom-16 right-16 flex flex-col gap-1 text-[12px]">
            <span className="rounded border border-[#141414]/60 bg-[#f3f4f6] px-3 py-1">
              <b>c'</b> <span className="text-[10px] text-[#141414]/70">(coesão efetiva)</span> <b>=</b> {fmt(envelope.c, 2)} kPa
            </span>
            <span className="rounded border border-[#141414]/60 bg-[#f3f4f6] px-3 py-1">
              <b>φ'</b> <span className="text-[10px] text-[#141414]/70">(atrito efetivo)</span> <b>=</b> {fmt(envelope.phiDeg, 2)}°
            </span>
            <span className="rounded border border-[#141414]/60 bg-[#f3f4f6] px-3 py-1">
              <b>R² =</b> {fmt(envelope.r2, 3)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
