import React from 'react';
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Line, Label as RLabel, Legend } from 'recharts';
import { equalTicks } from "../domain/utils";
import { SectionBar } from './SectionBar';
import type { CDSpecimenResults } from "../types";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function CDConsolidationPage({
  results
}: {
  results: CDSpecimenResults[];
}) {
  return (
    <div className="flex flex-col gap-2 w-full h-full justify-center">
      <div className="w-full h-full border border-[#141414] bg-white relative flex flex-col">
        <SectionBar>Gráfico de Adensamento (Recalque vs Tempo)</SectionBar>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 20, right: 20, bottom: 30, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              type="number" 
              dataKey="timeMin" 
              domain={[0, 'auto']}
              ticks={equalTicks(0, results[0]?.consolidationCurve?.length ? Math.max(...results.flatMap(r => r.consolidationCurve.map(c => c.timeMin))) : 100)}
              tick={{ fontSize: 10 }}
            >
              <RLabel value="Tempo (min)" offset={-25} position="insideBottom" style={{ fontSize: 11, fontWeight: 600 }} />
            </XAxis>
            <YAxis 
              type="number" 
              domain={['auto', 'auto']}
              ticks={equalTicks(results[0]?.consolidationCurve?.length ? Math.min(...results.flatMap(r => r.consolidationCurve.map(c => c.settlementMm))) : 0, results[0]?.consolidationCurve?.length ? Math.max(...results.flatMap(r => r.consolidationCurve.map(c => c.settlementMm))) : 2)}
              tick={{ fontSize: 10 }}
              reversed
            >
              <RLabel value="Recalque (mm)" angle={-90} position="insideLeft" offset={10} style={{ fontSize: 11, fontWeight: 600 }} />
            </YAxis>
            
            {results.map((r, i) => (
              <Line 
                key={i}
                data={r.consolidationCurve}
                type="monotone"
                dataKey="settlementMm"
                stroke={["#ef4444", "#3b82f6", "#10b981", "#f59e0b"][i % 4]}
                strokeWidth={1.5}
                dot={false}
                name={`σn = ${fmt(r.sigmaN, 0)} kPa`}
              />
            ))}
            
            <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: 10, paddingBottom: 10 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
