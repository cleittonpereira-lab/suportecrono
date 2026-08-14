import React from "react";
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Line, Label as RLabel, Legend } from "recharts";
import { SectionBar } from './SectionBar';
import type { CDSpecimenResults } from "../types";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function CDShearChartsPage({
  results
}: {
  results: CDSpecimenResults[];
}) {
  return (
    <div className="flex flex-col gap-2 w-full h-full justify-center">
      {/* Tensão vs Deformação */}
      <div className="w-full flex-1 border border-[#141414] bg-white relative min-h-0">
        <SectionBar>Tensão de Cisalhamento vs. Deformação</SectionBar>
        <ResponsiveContainer width="100%" height="100%">
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

      {/* Variação Volumétrica (Vertical vs Horizontal) */}
      <div className="w-full flex-1 border border-[#141414] bg-white relative min-h-0">
        <SectionBar>Variação de Altura vs. Deformação</SectionBar>
        <ResponsiveContainer width="100%" height="100%">
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
  );
}
