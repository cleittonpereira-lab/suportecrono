import React from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Line,
  Scatter,
  Label as RLabel,
  Legend,
} from "recharts";
import type { CDSample, CDSpecimen, CDSpecimenResults, CDEnvelopeResult } from "../types";
import { ReportHeader, ReportFooter, REPORT_PAGE_STYLE } from "@/components/report/ReportShell";
import type { ReportNorm } from "@/components/report/ReportShell";

const NORMS: ReportNorm[] = [
  { text: "ASTM D3080:2023 — Standard Test Method for Direct Shear Test of Soils Under Consolidated Drained Conditions", italic: true },
];

export const getReportTitle = (condition: "natural" | "inundado") =>
  condition === "inundado"
    ? "ENSAIO DE CISALHAMENTO DIRETO INUNDADO (CDinun)"
    : "ENSAIO DE CISALHAMENTO DIRETO NATURAL (CDnat)";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Faixa de título com bordas arredondadas idêntica ao padrão Suporte INFRA / Triaxial CID */
export function SectionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-[#9ca3af] bg-[#d1d5db] px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-[#111827]">
      {children}
    </div>
  );
}

const cellBase = "border border-[#141414]/60 px-2 py-[2.5px] text-[8.5px] align-middle text-[#141414]";
const cellCenter = `${cellBase} text-center`;
const cellLeft = `${cellBase} text-left font-medium`;

/* =========================================================================================
   PÁGINA 1: Parâmetros e Condições do Ensaio + Equipe de Laboratório
   ========================================================================================= */
export function CDReportPage1({
  sample,
  specimens,
  totalPages = 6,
}: {
  sample: CDSample;
  specimens: CDSpecimen[];
  totalPages?: number;
}) {
  const avgSpeed = specimens.length
    ? specimens.reduce((acc, s) => acc + (s.strainRate ?? 0.2), 0) / specimens.length
    : 0.2;

  const title = getReportTitle(sample.testCondition);

  return (
    <div style={REPORT_PAGE_STYLE} className="printable-report">
      <ReportHeader
        sample={sample}
        page={1}
        total={totalPages}
        title={title}
        norms={NORMS}
      />

      <div className="flex-1 flex flex-col justify-start gap-3 mt-2">
        {/* Bloco 1: Parâmetros e Condições do Ensaio */}
        <div className="space-y-1">
          <SectionBar>Parâmetros e Condições do Ensaio</SectionBar>
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <td className={`${cellLeft} w-[45%]`}>Equipamento Utilizado</td>
                <td className={cellBase}>{sample.equipment || "CISALHA-01"}</td>
              </tr>
              <tr>
                <td className={cellLeft}>Tipo do Ensaio</td>
                <td className={cellBase}>
                  {sample.testCondition === "inundado"
                    ? "Cisalhamento Direto Inundado - CDinun"
                    : "Cisalhamento Direto na Umidade Natural - CDnat"}
                </td>
              </tr>
              <tr>
                <td className={cellLeft}>Norma Adotada</td>
                <td className={cellBase}>ASTM D3080:2023</td>
              </tr>
              <tr>
                <td className={cellLeft}>Tipo da Amostra</td>
                <td className={cellBase}>
                  {sample.sampleState === "indeformada"
                    ? sample.sampleType || "Bloco Indeformado"
                    : sample.sampleState === "compactada"
                      ? `Compactada (${sample.compactionEnergy || "PN"}${
                          sample.compactionDegreePct ? ` · GC ${sample.compactionDegreePct}%` : ""
                        })`
                      : "Recompactada"}
                </td>
              </tr>
              <tr>
                <td className={cellLeft}>Condição do Ensaio</td>
                <td className={cellBase}>
                  {sample.testCondition === "inundado" ? "Inundado (Saturado por Imersão)" : "Umidade Natural"}
                </td>
              </tr>
              <tr>
                <td className={cellLeft}>Dimensões Características da Amostra</td>
                <td className={cellBase}>
                  {sample.geometry === "circular"
                    ? `Caixa Circular - Diâmetro = ${sample.dimensionMm || 60} mm`
                    : `Caixa Quadrada - Lado = ${sample.dimensionMm || 60} mm`}
                </td>
              </tr>
              <tr>
                <td className={cellLeft}>Número de Corpos de Prova</td>
                <td className={cellBase}>{specimens.length}</td>
              </tr>
              <tr>
                <td className={cellLeft}>Velocidade do Ensaio [mm/min]</td>
                <td className={cellBase}>{fmt(avgSpeed, 2)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Bloco 2: Equipe de Laboratório */}
        <div className="space-y-1">
          <SectionBar>Equipe de Laboratório</SectionBar>
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <td className={`${cellLeft} w-[45%]`}>Responsável Técnico</td>
                <td className={cellBase}>
                  {sample.technicalResp || "Eng. Antônio Sérgio Damasco Penna - CREA 0600459308"}
                </td>
              </tr>
              <tr>
                <td className={cellLeft}>Gerente do Laboratório</td>
                <td className={cellBase}>
                  {sample.labManager || "Eng. Cleitton Pereira - CREA 5071449839"}
                </td>
              </tr>
              <tr>
                <td className={cellLeft}>Laboratorista Responsável</td>
                <td className={cellBase}>{sample.operator || sample.typedBy || "Kayque"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Bloco de Observações Reais do Ensaio */}
        {sample.observations && sample.observations.trim().length > 0 && (
          <div className="space-y-1">
            <SectionBar>Observações do Ensaio</SectionBar>
            <div className="rounded border border-[#141414]/60 bg-white p-2.5 text-[8.5px] text-[#141414] leading-relaxed">
              {sample.observations}
            </div>
          </div>
        )}
      </div>

      <ReportFooter sample={sample} />
    </div>
  );
}

/* =========================================================================================
   PÁGINA 2: Tabela Resumo dos Resultados do Ensaio
   ========================================================================================= */
export function CDReportPage2({
  sample,
  specimens,
  results,
  totalPages = 6,
}: {
  sample: CDSample;
  specimens: CDSpecimen[];
  results: CDSpecimenResults[];
  totalPages?: number;
}) {
  const title = getReportTitle(sample.testCondition);

  return (
    <div style={REPORT_PAGE_STYLE} className="printable-report">
      <ReportHeader
        sample={sample}
        page={2}
        total={totalPages}
        title={title}
        norms={NORMS}
      />

      <div className="flex-1 flex flex-col justify-start mt-2 space-y-1">
        <SectionBar>Tabela Resumo dos Resultados do Ensaio</SectionBar>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#f3f4f6]">
              <th className={`${cellLeft} w-[40%] font-bold`}>Descrição</th>
              {specimens.map((cp) => (
                <th key={cp.id} className={`${cellCenter} font-bold`}>
                  {cp.displayId ?? cp.id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={cellLeft}>Altura Inicial [cm]</td>
              {results.map((r, i) => (
                <td key={i} className={cellCenter}>{fmt(r.H0 / 10, 2)}</td>
              ))}
            </tr>
            <tr>
              <td className={cellLeft}>Dimensão Característica [mm]</td>
              {results.map((r, i) => (
                <td key={i} className={cellCenter}>{fmt(r.D0, 2)}</td>
              ))}
            </tr>
            <tr>
              <td className={cellLeft}>Tipo do Anel</td>
              {specimens.map((_, i) => (
                <td key={i} className={cellCenter}>{sample.geometry === "circular" ? "Circular" : "Quadrado"}</td>
              ))}
            </tr>
            <tr>
              <td className={cellLeft}>Área Inicial [cm²]</td>
              {results.map((r, i) => (
                <td key={i} className={cellCenter}>{fmt(r.area0, 2)}</td>
              ))}
            </tr>
            <tr>
              <td className={cellLeft}>Condição do Ensaio</td>
              {specimens.map((_, i) => (
                <td key={i} className={cellCenter}>{sample.testCondition === "inundado" ? "Inundado" : "Natural"}</td>
              ))}
            </tr>
            <tr>
              <td className={cellLeft}>Massa Específica Natural [g/cm³]</td>
              {results.map((r, i) => (
                <td key={i} className={cellCenter}>{fmt(r.wetDensity, 2)}</td>
              ))}
            </tr>
            <tr>
              <td className={cellLeft}>Massa Específica dos Grãos [g/cm³]</td>
              {results.map((_, i) => (
                <td key={i} className={cellCenter}>{fmt(sample.Gs, 2)}</td>
              ))}
            </tr>
            <tr>
              <td className={cellLeft}>Índice de Vazios Inicial (e₀)</td>
              {results.map((r, i) => (
                <td key={i} className={cellCenter}>{fmt(r.voidRatio0, 2)}</td>
              ))}
            </tr>
            <tr>
              <td className={cellLeft}>Índice de Vazios Final (ef)</td>
              {results.map((r, i) => (
                <td key={i} className={cellCenter}>{fmt(r.voidRatioAfterCons, 2)}</td>
              ))}
            </tr>
            <tr>
              <td className={cellLeft}>Grau de Saturação Inicial [%]</td>
              {results.map((r, i) => (
                <td key={i} className={cellCenter}>{fmt(r.saturation0Pct, 2)}</td>
              ))}
            </tr>
            <tr>
              <td className={cellLeft}>Grau de Saturação Final [%]</td>
              {results.map((r, i) => (
                <td key={i} className={cellCenter}>{fmt(r.saturationFinalPct, 2)}</td>
              ))}
            </tr>
            <tr>
              <td className={cellLeft}>Teor de Umidade Antes do Ensaio [%]</td>
              {results.map((r, i) => (
                <td key={i} className={cellCenter}>{fmt(r.moisture0Pct, 2)}</td>
              ))}
            </tr>
            <tr>
              <td className={cellLeft}>Teor de Umidade Depois do Ensaio [%]</td>
              {results.map((r, i) => (
                <td key={i} className={cellCenter}>{fmt(r.moistureFinalPct, 2)}</td>
              ))}
            </tr>
            <tr>
              <td className={cellLeft}>Altura Após Adensamento [cm]</td>
              {results.map((r, i) => (
                <td key={i} className={cellCenter}>{fmt(r.heightAfterCons / 10, 2)}</td>
              ))}
            </tr>
            <tr>
              <td className={cellLeft}>Tensão Normal [kPa]</td>
              {results.map((r, i) => (
                <td key={i} className={cellCenter}>{fmt(r.sigmaN, 0)}</td>
              ))}
            </tr>
            <tr>
              <td className={cellLeft}>Velocidade de Cisalhamento [mm/min]</td>
              {specimens.map((cp, i) => (
                <td key={i} className={cellCenter}>{fmt(cp.strainRate ?? 0.2, 2)}</td>
              ))}
            </tr>
            <tr>
              <td className={cellLeft}>Critério de Ruptura</td>
              {specimens.map((_, i) => (
                <td key={i} className={cellCenter}>Máxima Tensão Cisalhante</td>
              ))}
            </tr>
            <tr className="bg-[#f3f4f6] font-semibold">
              <td className={cellLeft}>Tensão Cisalhante na Ruptura [kPa]</td>
              {results.map((r, i) => (
                <td key={i} className={`${cellCenter} font-bold`}>{fmt(r.tauPeak, 2)}</td>
              ))}
            </tr>
            <tr>
              <td className={cellLeft}>Deformação Vertical na Ruptura [mm]</td>
              {results.map((r, i) => (
                <td key={i} className={cellCenter}>{fmt(r.vertDispAtFailureMm, 2)}</td>
              ))}
            </tr>
            <tr>
              <td className={cellLeft}>Deformação Horizontal na Ruptura [%]</td>
              {results.map((r, i) => (
                <td key={i} className={cellCenter}>{fmt(r.horizStrainAtFailurePct, 2)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <ReportFooter sample={sample} />
    </div>
  );
}

/* =========================================================================================
   PÁGINA 3: Gráficos de Deformação e Tensão (Legendas Externas Limpas)
   ========================================================================================= */
export function CDReportPage3({
  sample,
  specimens,
  results,
  totalPages = 6,
}: {
  sample: CDSample;
  specimens: CDSpecimen[];
  results: CDSpecimenResults[];
  totalPages?: number;
}) {
  const lineColors = ["#1e40af", "#b45309", "#15803d", "#7e22ce", "#b91c1c", "#0284c7"];
  const title = getReportTitle(sample.testCondition);

  return (
    <div style={REPORT_PAGE_STYLE} className="printable-report">
      <ReportHeader
        sample={sample}
        page={3}
        total={totalPages}
        title={title}
        norms={NORMS}
      />

      <div className="flex-1 flex flex-col justify-between mt-2 gap-3">
        {/* Gráfico 1: Deformação Horizontal versus Deformação Vertical */}
        <div className="flex flex-col flex-1 min-h-[105mm]">
          <SectionBar>Deformação Horizontal versus Deformação Vertical</SectionBar>
          <div className="flex-1 rounded border border-[#141414]/60 bg-white p-2 mt-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 25, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  type="number"
                  dataKey="horizStrainPct"
                  domain={[0, 20]}
                  ticks={[0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]}
                  tick={{ fontSize: 8 }}
                >
                  <RLabel
                    value="Deformação Horizontal εh [%]"
                    offset={-12}
                    position="insideBottom"
                    style={{ fontSize: 9, fontWeight: 600, fill: "#374151" }}
                  />
                </XAxis>
                <YAxis
                  type="number"
                  domain={[-10, 10]}
                  ticks={[-10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10]}
                  tick={{ fontSize: 8 }}
                  reversed
                >
                  <RLabel
                    value="Deformação Vertical εv [%]"
                    angle={-90}
                    position="insideLeft"
                    offset={5}
                    style={{ fontSize: 9, fontWeight: 600, fill: "#374151" }}
                  />
                </YAxis>
                <Legend
                  verticalAlign="top"
                  align="center"
                  wrapperStyle={{ top: -5, fontSize: 8.5, fontWeight: 500 }}
                />
                {results.map((r, i) => (
                  <Line
                    key={i}
                    data={r.curve}
                    type="monotone"
                    dataKey="vertDispMm"
                    stroke={specimens[i]?.color || lineColors[i % lineColors.length]}
                    strokeWidth={2}
                    dot={false}
                    name={`${specimens[i]?.displayId ?? `CP-${i + 1}`} (σn = ${fmt(r.sigmaN, 0)} kPa)`}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico 2: Tensão Cisalhante versus Deformação Horizontal */}
        <div className="flex flex-col flex-1 min-h-[105mm]">
          <SectionBar>Tensão Cisalhante - τ versus Deformação Horizontal</SectionBar>
          <div className="flex-1 rounded border border-[#141414]/60 bg-white p-2 mt-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 25, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  type="number"
                  dataKey="horizStrainPct"
                  domain={[0, 20]}
                  ticks={[0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]}
                  tick={{ fontSize: 8 }}
                >
                  <RLabel
                    value="Deformação Horizontal εh [%]"
                    offset={-12}
                    position="insideBottom"
                    style={{ fontSize: 9, fontWeight: 600, fill: "#374151" }}
                  />
                </XAxis>
                <YAxis
                  type="number"
                  domain={[0, "auto"]}
                  tick={{ fontSize: 8 }}
                >
                  <RLabel
                    value="Tensão Cisalhante τ [kPa]"
                    angle={-90}
                    position="insideLeft"
                    offset={5}
                    style={{ fontSize: 9, fontWeight: 600, fill: "#374151" }}
                  />
                </YAxis>
                <Legend
                  verticalAlign="top"
                  align="center"
                  wrapperStyle={{ top: -5, fontSize: 8.5, fontWeight: 500 }}
                />
                {results.map((r, i) => (
                  <Line
                    key={i}
                    data={r.curve}
                    type="monotone"
                    dataKey="shearStress"
                    stroke={specimens[i]?.color || lineColors[i % lineColors.length]}
                    strokeWidth={2}
                    dot={false}
                    name={`${specimens[i]?.displayId ?? `CP-${i + 1}`} (σn = ${fmt(r.sigmaN, 0)} kPa)`}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <ReportFooter sample={sample} />
    </div>
  );
}

/* =========================================================================================
   PÁGINA 4: Envoltória de Mohr-Coulomb com Quadro de Parâmetros Limpo e Referências
   ========================================================================================= */
export function CDReportPage4({
  sample,
  specimens,
  results,
  envelope,
  totalPages = 6,
}: {
  sample: CDSample;
  specimens: CDSpecimen[];
  results: CDSpecimenResults[];
  envelope: CDEnvelopeResult | null;
  totalPages?: number;
}) {
  const lineColors = ["#1e40af", "#b45309", "#15803d", "#7e22ce", "#b91c1c", "#0284c7"];
  const title = getReportTitle(sample.testCondition);

  const maxSigma = React.useMemo(() => {
    const vals = results.map((r) => r.sigmaN);
    return vals.length ? Math.max(...vals, 100) : 100;
  }, [results]);

  const envelopeLine = React.useMemo(() => {
    if (!envelope) return [];
    const xEnd = maxSigma * 1.25;
    const yEnd = envelope.c + xEnd * Math.tan((envelope.phiDeg * Math.PI) / 180);
    return [
      { sigma: 0, tau: envelope.c },
      { sigma: xEnd, tau: yEnd },
    ];
  }, [envelope, maxSigma]);

  return (
    <div style={REPORT_PAGE_STYLE} className="printable-report">
      <ReportHeader
        sample={sample}
        page={4}
        total={totalPages}
        title={title}
        norms={NORMS}
      />

      <div className="flex-1 flex flex-col justify-between mt-2 gap-3">
        {/* Gráfico da Envoltória com Quadro Limpo */}
        <div className="flex flex-col flex-1 min-h-[120mm]">
          <SectionBar>Envoltória de Resistência (Strength Envelopes) — Mohr-Coulomb</SectionBar>
          
          {/* Quadro de Parâmetros de Resistência Destacado e Limpo */}
          {envelope && (
            <div className="grid grid-cols-3 gap-2 my-1.5 p-2 rounded border border-[#141414]/60 bg-muted/20 text-center text-[10px]">
              <div>
                <span className="text-muted-foreground uppercase text-[9px] block">Coesão Efetiva</span>
                <b className="text-[11px] text-foreground">c' = {fmt(envelope.c, 2)} kPa</b>
              </div>
              <div>
                <span className="text-muted-foreground uppercase text-[9px] block">Ângulo de Atrito</span>
                <b className="text-[11px] text-foreground">φ' = {fmt(envelope.phiDeg, 2)}°</b>
              </div>
              <div>
                <span className="text-muted-foreground uppercase text-[9px] block">Coef. Determinação</span>
                <b className="text-[11px] text-foreground">R² = {fmt(envelope.r2, 3)}</b>
              </div>
            </div>
          )}

          <div className="flex-1 rounded border border-[#141414]/60 bg-white p-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart margin={{ top: 25, right: 20, bottom: 25, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  type="number"
                  dataKey="sigma"
                  domain={[0, Math.ceil((maxSigma * 1.3) / 50) * 50]}
                  tick={{ fontSize: 8 }}
                >
                  <RLabel
                    value="Tensão Normal σ'n [kPa]"
                    offset={-15}
                    position="insideBottom"
                    style={{ fontSize: 9, fontWeight: 600, fill: "#374151" }}
                  />
                </XAxis>
                <YAxis
                  type="number"
                  domain={[0, "auto"]}
                  tick={{ fontSize: 8 }}
                >
                  <RLabel
                    value="Tensão Cisalhante τ [kPa]"
                    angle={-90}
                    position="insideLeft"
                    offset={5}
                    style={{ fontSize: 9, fontWeight: 600, fill: "#374151" }}
                  />
                </YAxis>

                <Legend
                  verticalAlign="top"
                  align="center"
                  wrapperStyle={{ top: -5, fontSize: 8.5, fontWeight: 500 }}
                />

                {/* Pontos de Ruptura Individuais Coloridos por CP */}
                {results.map((r, i) => (
                  <Scatter
                    key={i}
                    name={`${specimens[i]?.displayId ?? `CP-${i + 1}`} (σn = ${fmt(r.sigmaN, 0)} kPa)`}
                    data={[{ sigma: r.sigmaN, tau: r.tauPeak }]}
                    fill={specimens[i]?.color || lineColors[i % lineColors.length]}
                    shape="diamond"
                  />
                ))}

                {/* Linha da Envoltória Linear */}
                {envelope && (
                  <Line
                    name="Envoltória Linear (τ = c' + σ'·tan φ')"
                    data={envelopeLine}
                    dataKey="tau"
                    stroke="#374151"
                    strokeWidth={2}
                    dot={false}
                    activeDot={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Normas Técnicas e Referências */}
        <div className="space-y-1">
          <SectionBar>Normas Técnicas e Referências Bibliográficas utilizadas</SectionBar>
          <div className="rounded border border-[#141414]/60 bg-white p-3 text-[8px] text-[#141414] space-y-1">
            <div>• <b>ASTM D3080 / D3080M-2023</b> — Standard Test Method for Direct Shear Test of Soils Under Consolidated Drained Conditions.</div>
            <div>• <b>HEAD, K. H. & EPPS, R. J.</b>, Manual of Soil Laboratory Testing: Volume II - Shear Strength and Compressibility Test, 2011.</div>
            <div>• <b>GERMAINE, J. T. & GERMAINE, A. V.</b>, Geotechnical Laboratory Measurements for Engineers, 2009.</div>
          </div>
        </div>
      </div>

      <ReportFooter sample={sample} />
    </div>
  );
}

/* =========================================================================================
   PÁGINA 5: Registro Fotográfico Dinâmico (Suporta de 3 a 6 CPs com Moldagem e Ruptura)
   ========================================================================================= */
export function CDReportPage5({
  sample,
  specimens,
  photos = [],
  pageIndex = 0,
  totalPages = 6,
}: {
  sample: CDSample;
  specimens: CDSpecimen[];
  photos?: { id: string; dataUrl: string; kind: string; specimenId?: string; caption?: string }[];
  pageIndex?: number;
  totalPages?: number;
}) {
  const title = getReportTitle(sample.testCondition);
  const cpsForPage = specimens.slice(pageIndex * 3, pageIndex * 3 + 3);

  return (
    <div style={REPORT_PAGE_STYLE} className="printable-report">
      <ReportHeader
        sample={sample}
        page={5 + pageIndex}
        total={totalPages}
        title={title}
        norms={NORMS}
      />

      <div className="flex-1 flex flex-col justify-start mt-2 space-y-2">
        <SectionBar>Registro Fotográfico do Ensaio</SectionBar>
        <div className="grid grid-rows-2 gap-3 flex-1">
          {/* Linha 1: Etapa de Moldagem */}
          <div className="rounded border border-[#141414]/60 bg-white p-2 flex flex-col justify-between">
            <div className="text-[9px] font-bold text-[#141414] uppercase mb-1">
              Etapa de Moldagem / Aspecto Inicial
            </div>
            <div className="grid grid-cols-3 gap-3 flex-1 items-center">
              {cpsForPage.map((cp) => {
                const p = photos.find((x) => x.specimenId === cp.id && x.kind === "moldagem");
                return (
                  <div key={cp.id} className="flex flex-col items-center justify-center h-full">
                    <div className="w-full h-32 bg-black/5 border border-[#141414]/20 rounded overflow-hidden flex items-center justify-center">
                      {p ? (
                        <img
                          src={p.dataUrl}
                          alt={cp.id}
                          className="h-full w-full object-cover"
                          crossOrigin="anonymous"
                        />
                      ) : (
                        <span className="text-[8px] text-muted-foreground">Foto {cp.displayId ?? cp.id}</span>
                      )}
                    </div>
                    <span className="text-[8px] font-semibold mt-1">
                      {cp.displayId ?? cp.id} (σn = {fmt(cp.normalStressTarget, 0)} kPa)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Linha 2: Após Ruptura */}
          <div className="rounded border border-[#141414]/60 bg-white p-2 flex flex-col justify-between">
            <div className="text-[9px] font-bold text-[#141414] uppercase mb-1">
              Após Ruptura / Plano de Cisalhamento
            </div>
            <div className="grid grid-cols-3 gap-3 flex-1 items-center">
              {cpsForPage.map((cp) => {
                const p = photos.find((x) => x.specimenId === cp.id && x.kind === "ruptura");
                return (
                  <div key={cp.id} className="flex flex-col items-center justify-center h-full">
                    <div className="w-full h-32 bg-black/5 border border-[#141414]/20 rounded overflow-hidden flex items-center justify-center">
                      {p ? (
                        <img
                          src={p.dataUrl}
                          alt={cp.id}
                          className="h-full w-full object-cover"
                          crossOrigin="anonymous"
                        />
                      ) : (
                        <span className="text-[8px] text-muted-foreground">Foto {cp.displayId ?? cp.id}</span>
                      )}
                    </div>
                    <span className="text-[8px] font-semibold mt-1">
                      {cp.displayId ?? cp.id} (σn = {fmt(cp.normalStressTarget, 0)} kPa)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <ReportFooter sample={sample} />
    </div>
  );
}

/* =========================================================================================
   PÁGINA 6: Folha de Fórmulas e Convenções Geotécnicas
   ========================================================================================= */
export function CDReportPage6({
  sample,
  totalPages = 6,
}: {
  sample: CDSample;
  totalPages?: number;
}) {
  const title = getReportTitle(sample.testCondition);

  const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-2">
      <div className="mb-1 rounded bg-[#e5e7eb] px-2 py-[2.5px] text-[9.5px] font-semibold uppercase tracking-wide text-[#141414]">
        {title}
      </div>
      <table className="w-full border-collapse text-[8.5px] leading-tight text-[#141414]">
        <tbody>{children}</tbody>
      </table>
    </div>
  );

  const Row = ({
    sym,
    name,
    formula,
    unit,
    ref,
  }: {
    sym: string;
    name: string;
    formula: string;
    unit?: string;
    ref?: string;
  }) => (
    <tr className="border-b border-[#e5e7eb] align-top">
      <td className="w-[10%] py-[2px] pr-1 font-semibold">{sym}</td>
      <td className="w-[30%] py-[2px] pr-2">{name}</td>
      <td className="w-[42%] py-[2px] pr-2 font-mono text-[8.5px]">{formula}</td>
      <td className="w-[8%] py-[2px] pr-1 text-[#141414]/70">{unit ?? ""}</td>
      <td className="w-[10%] py-[2px] text-[8px] text-[#141414]/60">{ref ?? ""}</td>
    </tr>
  );

  return (
    <div style={REPORT_PAGE_STYLE} className="printable-report">
      <ReportHeader
        sample={sample}
        page={6}
        total={totalPages}
        title={title}
        norms={NORMS}
      />

      <div className="flex-1 flex flex-col justify-start mt-2 text-[9px] text-[#141414] space-y-1">
        <SectionBar>Formulário Geotécnico e Convenções de Cálculo</SectionBar>
        <div className="mt-1 text-[8.5px] text-[#141414]/70 mb-2">
          Convenção de unidades: dimensões em mm/cm, massas em g, volumes em cm³, forças em N/kgf, tensões em kPa,
          ângulos em graus. Massa específica da água γw = 9,807 kN/m³ (ρw = 1,000 g/cm³).
        </div>

        <div className="space-y-1">
          <Group title="Moldagem — Índices Físicos Iniciais">
            <Row sym="A₀" name="Área inicial da seção" formula="A₀ = π·D₀²/4 (circ.) ou L·W (quad.)" unit="cm²" />
            <Row sym="V₀" name="Volume inicial do CP" formula="V₀ = A₀ · H₀" unit="cm³" />
            <Row sym="w₀" name="Umidade inicial média" formula="w = (m_úmida − m_seca)/(m_seca − tara)·100" unit="%" />
            <Row sym="ρn" name="Massa específica natural" formula="ρn = m_úmida / V₀" unit="g/cm³" />
            <Row sym="ρd" name="Massa específica seca" formula="ρd = ρn / (1 + w₀/100)" unit="g/cm³" />
            <Row sym="e₀" name="Índice de vazios inicial" formula="e₀ = (Gs · ρw / ρd) − 1" unit="—" />
            <Row sym="Sr₀" name="Grau de saturação inicial" formula="Sr₀ = (w₀ · Gs) / e₀" unit="%" />
          </Group>

          <Group title="Adensamento Vertical">
            <Row sym="Δh" name="Recalque de adensamento" formula="Δh = leitura final − inicial" unit="mm" />
            <Row sym="Hc" name="Altura pós-adensamento" formula="Hc = H₀ − Δh" unit="mm" />
            <Row sym="Vc" name="Volume pós-adensamento" formula="Vc = V₀ − (Δh/10)·A₀" unit="cm³" />
            <Row sym="ec" name="Índice de vazios pós-adens." formula="ec = Vc / Vs − 1 ; Vs = V₀/(1+e₀)" unit="—" />
            <Row sym="Src" name="Saturação pós-adensamento" formula="Src = (w₀ · Gs) / ec" unit="%" />
          </Group>

          <Group title="Cisalhamento — Deformações e Correção de Área">
            <Row sym="εh" name="Deformação horizontal (%)" formula="εh = (δh / D₀) · 100" unit="%" />
            <Row sym="εv" name="Deformação vertical (%)" formula="εv = (δv / Hc) · 100" unit="%" />
            <Row
              sym="A_cor"
              name="Área corrigida (Circular)"
              formula="A_cor = (D²/2)·[arccos(δ/D) − (δ/D)√(1−(δ/D)²)]"
              unit="cm²"
              ref="ASTM §11"
            />
            <Row sym="A_cor" name="Área corrigida (Quadrada)" formula="A_cor = W · (L − δh)" unit="cm²" />
            <Row sym="τ" name="Tensão de cisalhamento" formula="τ = (F_cis [N] / A_cor) · 10" unit="kPa" />
            <Row sym="σn" name="Tensão normal de ensaio" formula="σn = N / A_cor · 10" unit="kPa" />
          </Group>

          <Group title="Envoltória de Ruptura de Mohr-Coulomb">
            <Row sym="τ_max" name="Critério de ruptura de pico" formula="τ_pico = max(τ)" unit="kPa" />
            <Row sym="Reta" name="Ajuste linear (M-C)" formula="τ = c' + σ'n · tan φ'" unit="kPa" ref="ASTM D3080" />
            <Row sym="c'" name="Coesão efetiva do solo" formula="c' = intercepto linear no eixo τ" unit="kPa" />
            <Row sym="φ'" name="Ângulo de atrito efetivo" formula="φ' = arctan(declividade linear)" unit="°" />
            <Row sym="R²" name="Coeficiente de correlação" formula="R² = 1 − (SS_res / SS_tot)" unit="—" />
          </Group>
        </div>
      </div>

      <ReportFooter sample={sample} />
    </div>
  );
}
