import React from 'react';
import { SectionBar } from './SectionBar';
import type { CDSample, CDSpecimen, CDSpecimenResults, CDDraft } from "../types";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export function CDSetupPage({ 
  sample, 
  specimens,
  adjust
}: { 
  sample: CDSample, 
  specimens: CDSpecimen[],
  adjust?: CDDraft['adjust']
}) {
  return (
    <div className="flex flex-col gap-8 w-full">
      {/* PARÂMETROS E CONDIÇÕES DO ENSAIO */}
      <div>
        <SectionBar>Parâmetros e Condições do Ensaio</SectionBar>
        <div className="border-x border-b border-[#141414] p-4 bg-white">
          <div className="grid grid-cols-2 gap-x-12 gap-y-4">
            <div className="flex justify-between items-center text-[10px] border-b border-[#141414]/10 pb-1">
              <span className="text-[#141414]/70">Equipamento Utilizado:</span>
              <span className="font-medium text-[#141414]">{sample.equipment || "Cisalhamento Direto"}</span>
            </div>
            <div className="flex justify-between items-center text-[10px] border-b border-[#141414]/10 pb-1">
              <span className="text-[#141414]/70">Tipo do Ensaio:</span>
              <span className="font-medium text-[#141414]">Cisalhamento Direto (CD)</span>
            </div>
            
            <div className="flex justify-between items-center text-[10px] border-b border-[#141414]/10 pb-1">
              <span className="text-[#141414]/70">Norma Adotada:</span>
              <span className="font-medium text-[#141414]">ASTM D3080:2023</span>
            </div>
            <div className="flex justify-between items-center text-[10px] border-b border-[#141414]/10 pb-1">
              <span className="text-[#141414]/70">Tipo da Amostra:</span>
              <span className="font-medium text-[#141414]">{sample.sampleState === "indeformada" ? "Indeformada" : sample.sampleState === "compactada" ? "Compactada" : "Recompactada"}</span>
            </div>

            <div className="flex justify-between items-center text-[10px] border-b border-[#141414]/10 pb-1">
              <span className="text-[#141414]/70">Condição do Ensaio:</span>
              <span className="font-medium text-[#141414] uppercase">{sample.testCondition}</span>
            </div>
            <div className="flex justify-between items-center text-[10px] border-b border-[#141414]/10 pb-1">
              <span className="text-[#141414]/70">Geometria da Amostra:</span>
              <span className="font-medium text-[#141414]">{sample.geometry === "circular" ? "Circular" : "Quadrada"} ({sample.dimensionMm} mm)</span>
            </div>

            <div className="flex justify-between items-center text-[10px] border-b border-[#141414]/10 pb-1">
              <span className="text-[#141414]/70">Peso Específico dos Grãos (Gs):</span>
              <span className="font-medium text-[#141414]">{fmt(sample.Gs, 2)} g/cm³</span>
            </div>
            <div className="flex justify-between items-center text-[10px] border-b border-[#141414]/10 pb-1">
              <span className="text-[#141414]/70">Número de Corpos de Prova:</span>
              <span className="font-medium text-[#141414]">{specimens.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* PARÂMETROS DE CORREÇÃO / SETUP */}
      <div>
        <SectionBar>Parâmetros de Correção / Setup</SectionBar>
        <div className="border-x border-b border-[#141414] p-4 bg-white">
          <div className="grid grid-cols-2 gap-x-12 gap-y-4">
            <div className="flex justify-between items-center text-[10px] border-b border-[#141414]/10 pb-1">
              <span className="text-[#141414]/70">Massa sobre o corpo de prova [g]:</span>
              <span className="font-medium text-[#141414]">{fmt(adjust?.mSobreCP ?? 0, 2)}</span>
            </div>
            <div className="flex justify-between items-center text-[10px] border-b border-[#141414]/10 pb-1">
              <span className="text-[#141414]/70">Força de Atrito [kgf]:</span>
              <span className="font-medium text-[#141414]">{fmt(adjust?.fAtritoPistao ?? 0, 2)}</span>
            </div>
            <div className="flex justify-between items-center text-[10px] border-b border-[#141414]/10 pb-1">
              <span className="text-[#141414]/70">Massa Esp. da Água [g/cm³]:</span>
              <span className="font-medium text-[#141414]">{fmt(sample.rhoW || 1.0, 3)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* OBSERVAÇÕES */}
      <div>
        <SectionBar>Observações Adicionais</SectionBar>
        <div className="border-x border-b border-[#141414] p-4 bg-white min-h-[140px] text-[10px] text-[#141414]">
          {sample.observations || "Nenhuma observação adicional registrada para este ensaio."}
        </div>
      </div>
    </div>
  );
}
