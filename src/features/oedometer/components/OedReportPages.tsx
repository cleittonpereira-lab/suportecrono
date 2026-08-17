import React from "react";
import { SuporteLogo } from "@/components/suporte-logo";
import assinaturaMauricio from "@/assets/assinatura-mauricio.png";
import type {
  OedSampleProps,
  OedStage,
  OedPhysicalIndices,
  OedStageCalculated,
  OedCompressibilityParams,
  CasResult,
  PsResult,
  OedCalcMemoryStep,
} from "../types";
import type { Photo } from "@/features/lab/types";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const REPORT_PAGE_STYLE: React.CSSProperties = {
  width: "210mm",
  height: "297mm",
  maxHeight: "297mm",
  padding: "10mm",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  boxSizing: "border-box",
  fontFamily: "Calibri, Inter, -apple-system, BlinkMacSystemFont, sans-serif",
  color: "#141414",
  overflow: "hidden",
  pageBreakAfter: "always",
  breakAfter: "page",
};

const fmt = (v: number | null | undefined, dec = 2) =>
  v == null || isNaN(v) ? "—" : v.toFixed(dec);

export function ReportHeader({
  sample,
  page,
  total,
  title = "ENSAIO DE ADENSAMENTO EDOMÉTRICO UNIDIMENSIONAL",
  norms = "ABNT NBR 12007:1990 | ASTM D2435/D2435M-11",
}: {
  sample: OedSampleProps;
  page: number;
  total?: number;
  title?: string;
  norms?: string;
}) {
  return (
    <div className="w-full border-b-2 border-[#141414] pb-1.5 mb-2 shrink-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <SuporteLogo className="h-10 w-auto" />
        </div>
        <div className="text-center flex-1">
          <div className="text-[13px] font-black tracking-wide text-[#141414] uppercase leading-tight">
            {title}
          </div>
          <div className="text-[8px] text-muted-foreground font-medium mt-0.5">
            {norms}
          </div>
        </div>
        <div className="text-right text-[8.5px] text-muted-foreground font-mono">
          <div className="font-bold text-[#141414]">Rev: {sample.revision || "00"}</div>
          <div>Folha: {page} / {total || page}</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-x-2 gap-y-0.5 text-[8.5px] mt-1 pt-1 border-t border-[#141414]/15 bg-neutral-50/70 px-1.5 py-1 rounded">
        <div><span className="font-bold text-[#141414]">OS:</span> {sample.os || "—"}</div>
        <div><span className="font-bold text-[#141414]">Cliente:</span> {sample.client || "—"}</div>
        <div><span className="font-bold text-[#141414]">Obra:</span> {sample.workNumber || "—"}</div>
        <div><span className="font-bold text-[#141414]">Data:</span> {sample.date || "—"}</div>
        <div><span className="font-bold text-[#141414]">Furo:</span> {sample.borehole || "—"}</div>
        <div><span className="font-bold text-[#141414]">Prof.:</span> {sample.depth || "—"} m</div>
        <div><span className="font-bold text-[#141414]">Amostra:</span> {sample.code || "—"}</div>
        <div><span className="font-bold text-[#141414]">Resp. Téc.:</span> {sample.technicalResp || "Maurício P. Barbosa"}</div>
      </div>
    </div>
  );
}

export function ReportFooter({
  sample,
  page,
  total,
}: {
  sample: OedSampleProps;
  page?: number;
  total?: number;
}) {
  return (
    <div className="w-full border-t border-[#141414]/20 pt-1.5 mt-2 shrink-0 flex items-center justify-between text-[8px] text-muted-foreground">
      <div>
        <span className="font-semibold text-[#141414]">Suporte Solo & Rochas</span> — Laboratório Geotécnico Integrado
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <img src={assinaturaMauricio} alt="Assinatura" className="h-6 w-auto object-contain" />
          <div className="text-right text-[7.5px] leading-tight">
            <div className="font-bold text-[#141414]">{sample.technicalResp || "Maurício P. Barbosa"}</div>
            <div className="text-[6.5px]">Responsável Técnico · CREA 5063078630</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SectionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#141414] text-white px-2 py-0.5 rounded text-[9.5px] font-bold tracking-wide uppercase shadow-sm">
      {children}
    </div>
  );
}

/**
 * PÁGINA 1: DADOS GERAIS, CARACTERÍSTICAS DO CORPO DE PROVA E RESUMO DOS ESTÁGIOS
 */
export function OedReportPage1({
  sample,
  phys,
  stagesCalc,
  params,
  totalPages,
}: {
  sample: OedSampleProps;
  phys: OedPhysicalIndices;
  stagesCalc: OedStageCalculated[];
  params: OedCompressibilityParams;
  totalPages?: number;
}) {
  return (
    <div style={REPORT_PAGE_STYLE} className="printable-report flex flex-col justify-between">
      <ReportHeader sample={sample} page={1} total={totalPages} />

      <div className="flex-1 flex flex-col justify-start space-y-2 mt-1">
        {/* Bloco 1: Características do Corpo de Prova */}
        <SectionBar>1. Características Iniciais e Finais do Corpo de Prova</SectionBar>
        <div className="border border-[#141414]/20 rounded p-2 text-[9px] bg-white grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <div className="font-bold text-[9.5px] border-b pb-0.5 text-primary">Geometria do Anel</div>
            <div className="flex justify-between"><span>Diâmetro (D₀):</span><span className="font-bold">{fmt(sample.ringDiameter, 2)} mm</span></div>
            <div className="flex justify-between"><span>Altura Inicial (H₀):</span><span className="font-bold">{fmt(sample.ringHeight, 2)} mm</span></div>
            <div className="flex justify-between"><span>Área da Seção (A):</span><span className="font-bold">{fmt(phys.A, 2)} cm²</span></div>
            <div className="flex justify-between"><span>Volume Inicial (V₀):</span><span className="font-bold">{fmt(phys.V0, 2)} cm³</span></div>
          </div>

          <div className="space-y-1">
            <div className="font-bold text-[9.5px] border-b pb-0.5 text-primary">Massas e Densidades</div>
            <div className="flex justify-between"><span>Massa Úmida Inicial:</span><span className="font-bold">{fmt(sample.wetMassInitial, 2)} g</span></div>
            <div className="flex justify-between"><span>Massa Seca (Ms):</span><span className="font-bold">{fmt(sample.dryMass, 2)} g</span></div>
            <div className="flex justify-between"><span>Massa Úmida Final:</span><span className="font-bold">{fmt(sample.wetMassFinal, 2)} g</span></div>
            <div className="flex justify-between"><span>Densidade dos Grãos (Gs):</span><span className="font-bold">{fmt(sample.Gs, 3)} g/cm³</span></div>
          </div>

          <div className="space-y-1">
            <div className="font-bold text-[9.5px] border-b pb-0.5 text-primary">Índices Físicos</div>
            <div className="flex justify-between"><span>Umidade Inicial (w₀):</span><span className="font-bold">{fmt(phys.wi, 2)} %</span></div>
            <div className="flex justify-between"><span>Umidade Final (wf):</span><span className="font-bold">{fmt(phys.wf, 2)} %</span></div>
            <div className="flex justify-between"><span>Massa Esp. Seca (ρd):</span><span className="font-bold">{fmt(phys.rho_d, 3)} g/cm³</span></div>
            <div className="flex justify-between"><span>Índice de Vazios Inicial (e₀):</span><span className="font-bold">{fmt(phys.e0, 3)}</span></div>
            <div className="flex justify-between"><span>Grau de Saturação (Sr₀):</span><span className="font-bold">{fmt(phys.Sr0, 1)} %</span></div>
          </div>
        </div>

        {/* Bloco 2: Resumo dos Parâmetros de Compressibilidade */}
        <SectionBar>2. Parâmetros de Compressibilidade e Pré-Adensamento</SectionBar>
        <div className="border border-[#141414]/20 rounded p-2 text-[9px] bg-neutral-50/50 grid grid-cols-4 gap-2 text-center">
          <div className="p-1 border rounded bg-white">
            <div className="text-[8px] text-muted-foreground uppercase font-bold">Índice Compressão (Cc)</div>
            <div className="text-[12px] font-black text-[#141414] mt-0.5">{fmt(params.Cc, 3)}</div>
          </div>
          <div className="p-1 border rounded bg-white">
            <div className="text-[8px] text-muted-foreground uppercase font-bold">Índice Recompressão (Cr/Cs)</div>
            <div className="text-[12px] font-black text-[#141414] mt-0.5">{fmt(params.Cr, 3)}</div>
          </div>
          <div className="p-1 border rounded bg-white">
            <div className="text-[8px] text-muted-foreground uppercase font-bold">σ'vm (Casagrande)</div>
            <div className="text-[12px] font-black text-emerald-700 mt-0.5">{fmt(params.sigmaP_Cas, 1)} kPa</div>
          </div>
          <div className="p-1 border rounded bg-white">
            <div className="text-[8px] text-muted-foreground uppercase font-bold">σ'vm (Pacheco Silva)</div>
            <div className="text-[12px] font-black text-blue-700 mt-0.5">{fmt(params.sigmaP_PS, 1)} kPa</div>
          </div>
        </div>

        {/* Bloco 3: Tabela Resumo dos Estágios de Carregamento */}
        <SectionBar>3. Resumo dos Estágios de Carregamento e Descarregamento</SectionBar>
        <div className="border border-[#141414]/30 rounded overflow-hidden">
          <table className="w-full text-[8px] text-center border-collapse">
            <thead className="bg-[#141414]/10 font-bold border-b border-[#141414]/30">
              <tr>
                <th className="p-1 border-r border-[#141414]/20">Estágio</th>
                <th className="p-1 border-r border-[#141414]/20">Tensão σ' (kPa)</th>
                <th className="p-1 border-r border-[#141414]/20">Fase</th>
                <th className="p-1 border-r border-[#141414]/20">Recalque ΔH (mm)</th>
                <th className="p-1 border-r border-[#141414]/20">Recalque Total (mm)</th>
                <th className="p-1 border-r border-[#141414]/20">Deformação εv (%)</th>
                <th className="p-1 border-r border-[#141414]/20">Índice de Vazios (e)</th>
                <th className="p-1 border-r border-[#141414]/20">Cv Taylor (cm²/s)</th>
                <th className="p-1">Módulo Eoed (MPa)</th>
              </tr>
            </thead>
            <tbody>
              {stagesCalc.map((st, idx) => (
                <tr key={idx} className={`border-b border-[#141414]/10 ${idx % 2 === 1 ? "bg-neutral-50" : "bg-white"}`}>
                  <td className="p-1 font-bold border-r border-[#141414]/15">
                    Estágio {st.index + 1} {st.isSeatingStage ? "(Assent.)" : ""}
                  </td>
                  <td className="p-1 font-bold border-r border-[#141414]/15">{fmt(st.sigma, 0)}</td>
                  <td className="p-1 border-r border-[#141414]/15 text-left pl-2">
                    {st.phase === "unload" ? "Descarregamento" : st.phase === "reload" ? "Recarregamento" : "Carregamento"}
                  </td>
                  <td className="p-1 border-r border-[#141414]/15">{fmt(st.settlementMm, 4)}</td>
                  <td className="p-1 font-medium border-r border-[#141414]/15">{fmt(st.totalSettlementMm, 4)}</td>
                  <td className="p-1 border-r border-[#141414]/15">{fmt(st.strainPct, 2)} %</td>
                  <td className="p-1 font-bold border-r border-[#141414]/15">{fmt(st.e, 4)}</td>
                  <td className="p-1 font-mono border-r border-[#141414]/15">
                    {st.cvTaylor ? st.cvTaylor.toExponential(2) : "—"}
                  </td>
                  <td className="p-1 font-bold">{fmt(st.Ed, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {stagesCalc.some((s) => s.isSeatingStage) && (
          <div className="text-[7.5px] italic text-muted-foreground">
            * Estágio inicial marcado como assentamento/contato do extensômetro, mantido para registro físico e desconsiderado no cálculo da envoltória virgem.
          </div>
        )}
      </div>

      <ReportFooter sample={sample} page={1} total={totalPages} />
    </div>
  );
}

/**
 * PÁGINA 2: CURVA DE COMPRESSÃO EDOMÉTRICA (e x log σ') E MEMÓRIA DE CÁLCULO
 */
export function OedReportPage2({
  sample,
  stagesCalc,
  cas,
  ps,
  params,
  calcMemory,
  totalPages,
}: {
  sample: OedSampleProps;
  stagesCalc: OedStageCalculated[];
  cas: CasResult | null;
  ps: PsResult | null;
  params: OedCompressibilityParams;
  calcMemory?: OedCalcMemoryStep[];
  totalPages?: number;
}) {
  const chartData = stagesCalc.map((st) => ({
    sigma: st.sigma,
    e: st.e,
    phase: st.phase,
  }));

  return (
    <div style={REPORT_PAGE_STYLE} className="printable-report flex flex-col justify-between">
      <ReportHeader sample={sample} page={2} total={totalPages} />

      <div className="flex-1 flex flex-col justify-start space-y-2 mt-1">
        <SectionBar>Curva de Compressão Edométrica (e × log σ') & Determinação de σ'vm</SectionBar>

        {/* Gráfico Recharts e x log sigma */}
        <div className="border border-[#141414]/30 rounded p-2 bg-white h-[260px] flex flex-col justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="sigma"
                type="number"
                scale="log"
                domain={[1, 10000]}
                label={{ value: "Tensão Vertical Efetiva — σ' [kPa]", position: "insideBottom", offset: -10, fontSize: 10 }}
                tick={{ fontSize: 9 }}
              />
              <YAxis
                dataKey="e"
                domain={["auto", "auto"]}
                label={{ value: "Índice de Vazios (e)", angle: -90, position: "insideLeft", fontSize: 10 }}
                tick={{ fontSize: 9 }}
              />
              <Tooltip formatter={(value: any) => fmt(Number(value), 4)} />
              <Line type="monotone" dataKey="e" stroke="#1e40af" strokeWidth={2.5} dot={{ r: 4, fill: "#1e40af" }} />
              {cas && (
                <ReferenceDot
                  x={cas.sigmaP}
                  y={cas.intersection.y}
                  r={5}
                  fill="#059669"
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Memória de Cálculo Transparente */}
        <SectionBar>Memória de Cálculo e Relações Geotécnicas Fundamentais</SectionBar>
        <div className="border border-[#141414]/20 rounded p-2.5 bg-white space-y-2 text-[8.5px]">
          {(calcMemory || []).map((step, sIdx) => (
            <div key={sIdx} className="border-b border-neutral-200/60 pb-1.5 last:border-b-0 last:pb-0">
              <div className="font-bold text-[#141414]">{step.title}</div>
              <div className="font-mono text-[8px] text-blue-800 bg-blue-50/50 px-1.5 py-0.5 rounded my-0.5 inline-block">
                Fórmula: {step.formula}
              </div>
              <div className="text-muted-foreground">{step.explanation}</div>
              <div className="font-semibold text-emerald-800 mt-0.5">Resultado: {step.result}</div>
            </div>
          ))}
        </div>
      </div>

      <ReportFooter sample={sample} page={2} total={totalPages} />
    </div>
  );
}

/**
 * PÁGINA FINAL: REGISTRO FOTOGRÁFICO OFICIAL (PROPORÇÃO 3:4, 3 FOTOS POR LINHA)
 */
export function OedReportPhotoPage({
  sample,
  photos = [],
  pageIndex = 0,
  totalPages,
}: {
  sample: OedSampleProps;
  photos?: Photo[];
  pageIndex?: number;
  totalPages?: number;
}) {
  const photosForPage = photos.slice(pageIndex * 3, pageIndex * 3 + 3);

  return (
    <div style={REPORT_PAGE_STYLE} className="printable-report flex flex-col justify-between">
      <ReportHeader sample={sample} page={3 + pageIndex} total={totalPages} />

      <div className="flex-1 flex flex-col justify-start space-y-3 mt-1">
        <SectionBar>
          {pageIndex > 0 ? `Registro Fotográfico do Ensaio — Folha ${pageIndex + 1}` : "Registro Fotográfico do Ensaio"}
        </SectionBar>

        <div className="rounded border border-[#141414]/60 bg-white p-3 flex flex-col shadow-sm">
          <div className="text-[9.5px] font-bold text-[#141414] uppercase mb-2 border-b border-[#141414]/15 pb-1">
            Aspecto do Corpo de Prova — Ensaio de Adensamento
          </div>

          <div className="grid grid-cols-3 gap-3 items-start">
            {photosForPage.map((p, idx) => (
              <div key={p.id || idx} className="flex flex-col items-center">
                <div className="w-full aspect-[3/4] max-h-[240px] bg-neutral-100 border border-[#141414]/25 rounded overflow-hidden flex items-center justify-center shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                  {p.dataUrl ? (
                    <img
                      src={p.dataUrl}
                      alt={p.caption || "Foto"}
                      className="h-full w-full object-cover"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1 text-muted-foreground p-2 text-center">
                      <span className="text-[9.5px] font-medium">Foto do Ensaio</span>
                      <span className="text-[8px] opacity-75">Posição {idx + 1}</span>
                    </div>
                  )}
                </div>
                <span className="text-[8.5px] font-bold text-[#141414] mt-1 text-center truncate max-w-full">
                  {p.caption || (p.kind === "moldagem" ? "Aspecto Inicial" : p.kind === "ruptura" ? "Aspecto Final" : `Foto ${idx + 1}`)}
                </span>
              </div>
            ))}

            {photosForPage.length === 0 && (
              <div className="col-span-3 py-12 text-center text-xs text-muted-foreground italic">
                Nenhum registro fotográfico anexado a este relatório.
              </div>
            )}
          </div>
        </div>
      </div>

      <ReportFooter sample={sample} page={3 + pageIndex} total={totalPages} />
    </div>
  );
}
