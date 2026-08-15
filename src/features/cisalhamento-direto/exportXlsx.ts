import * as XLSX from "xlsx";
import type { CDSample, CDSpecimen, CDSpecimenResults, CDEnvelopeResult } from "./types";
import { averageMoisturePct } from "./domain/calc";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : Number(n.toFixed(d));

export interface ExportCDParams {
  sample: CDSample;
  specimens: CDSpecimen[];
  results: CDSpecimenResults[];
  envelope: CDEnvelopeResult | null;
  filename?: string;
}

/**
 * Exporta os dados brutos e memorial completo de ensaio de Cisalhamento Direto em formato Excel (.xlsx)
 * com abas estruturadas: Resumo do Laudo, Amostra & CPs, Adensamento, Cisalhamento e Envoltória.
 */
export function exportCDRawDataXlsx({
  sample,
  specimens,
  results,
  envelope,
  filename,
}: ExportCDParams) {
  const wb = XLSX.utils.book_new();

  // ==========================================
  // ABA 1: RESUMO DO LAUDO (Relatório Geral)
  // ==========================================
  const r1: (string | number)[][] = [
    ["SUPORTE INFRA — LABORATÓRIO DE ENSAIOS ESPECIAIS"],
    ["ENSAIO DE CISALHAMENTO DIRETO (ASTM D3080:2023) — MEMORIAL DE DADOS BRUTOS"],
    [],
    ["DADOS DA ORDEM DE SERVIÇO E DA AMOSTRA"],
    ["Cliente", sample.client || "—", "Furo", sample.borehole || "—"],
    ["Obra", sample.workNumber || "—", "Profundidade (m)", sample.depth || "—"],
    ["O.S.", sample.os || "—", "Código Amostra", sample.code || "—"],
    ["Local", sample.local || "—", "Amostra", sample.reportNumber || "—"],
    ["Descrição Tátil-Visual", sample.description || "—"],
    ["Descrição Granulométrica", sample.granulometricDescription || "—"],
    ["Data do Ensaio", sample.date || new Date().toISOString().split("T")[0], "Revisão", sample.revision || "00"],
    [],
    ["PARÂMETROS E CONDIÇÕES DO ENSAIO"],
    ["Equipamento Utilizado", sample.equipment || "Cisalhamento Direto"],
    ["Tipo de Condição do Ensaio", sample.testCondition === "inundado" ? "Inundado (CDinun)" : "Umidade Natural (CDnat)"],
    ["Geometria do Anel", sample.geometry === "circular" ? `Circular (Ø = ${sample.dimensionMm} mm)` : `Quadrada (${sample.dimensionMm}x${sample.dimensionMm} mm)`],
    ["Densidade dos Grãos (Gs)", sample.Gs || 2.7],
    ["Correção de Área da Seção", sample.applyAreaCorrection !== false ? "Sim (ASTM D3080)" : "Não (Área Inicial Constante)"],
    ["Condição da Amostra", sample.sampleState === "compactada" ? `Compactada (${sample.compactionEnergy || "PN"})` : sample.sampleState === "indeformada" ? "Indeformada" : "Recompactada"],
    [],
    ["PARÂMETROS DE RESISTÊNCIA AO CISALHAMENTO (MOHR-COULOMB)"],
    ["Coesão Efetiva (c')", envelope ? fmt(envelope.c, 2) : "—", "kPa"],
    ["Ângulo de Atrito Efetivo (φ')", envelope ? fmt(envelope.phiDeg, 2) : "—", "graus (°)"],
    ["Coeficiente de Determinação (R²)", envelope ? fmt(envelope.r2, 4) : "—"],
    ["Equação da Envoltória", envelope ? `τ = ${fmt(envelope.c, 2)} + σ'n · tan(${fmt(envelope.phiDeg, 2)}°)` : "—"],
    [],
    ["TABELA RESUMO DOS RESULTADOS POR CORPO DE PROVA (CP)"],
    [
      "Parâmetro / Característica",
      "Unidade",
      ...specimens.map((cp) => cp.displayId ?? cp.id),
    ],
    ["Tensão Normal (σn)", "kPa", ...results.map((r) => fmt(r.sigmaN, 0))],
    ["Diâmetro / Dimensão Inicial (D₀)", "mm", ...results.map((r) => fmt(r.D0, 2))],
    ["Altura Inicial (H₀)", "mm", ...results.map((r) => fmt(r.H0, 2))],
    ["Área Inicial (A₀)", "cm²", ...results.map((r) => fmt(r.area0, 2))],
    ["Volume Inicial (V₀)", "cm³", ...results.map((r) => fmt(r.volume0, 2))],
    ["Massa Úmida Inicial", "g", ...results.map((r) => fmt(r.wetMass, 2))],
    ["Massa Seca", "g", ...results.map((r) => fmt(r.dryMass, 2))],
    ["Massa Específica Natural (ρn)", "g/cm³", ...results.map((r) => fmt(r.wetDensity, 2))],
    ["Massa Específica Seca (ρd)", "g/cm³", ...results.map((r) => fmt(r.dryDensity, 2))],
    ["Teor de Umidade Inicial (w₀)", "%", ...results.map((r) => fmt(r.moisture0Pct, 2))],
    ["Índice de Vazios Inicial (e₀)", "—", ...results.map((r) => fmt(r.voidRatio0, 3))],
    ["Grau de Saturação Inicial (Sr₀)", "%", ...results.map((r) => fmt(r.saturation0Pct, 1))],
    ["Recalque de Adensamento (Δh)", "mm", ...results.map((r) => fmt(r.H0 - r.heightAfterCons, 3))],
    ["Altura Pós-Adensamento (Hc)", "mm", ...results.map((r) => fmt(r.heightAfterCons, 2))],
    ["Índice de Vazios Pós-Adensamento (ec)", "—", ...results.map((r) => fmt(r.voidRatioAfterCons, 3))],
    ["Tensão Cisalhante de Pico (τ_pico)", "kPa", ...results.map((r) => fmt(r.tauPeak, 2))],
    ["Tensão Cisalhante Residual (τ_res)", "kPa", ...results.map((r) => fmt(r.tauResidual, 2))],
    ["Deformação Horizontal na Ruptura (εh_rup)", "%", ...results.map((r) => fmt(r.horizStrainAtFailurePct, 2))],
    ["Deslocamento Vertical na Ruptura (δv_rup)", "mm", ...results.map((r) => fmt(r.vertDispAtFailureMm, 3))],
    ["Teor de Umidade Final (wf)", "%", ...results.map((r) => fmt(r.moistureFinalPct, 2))],
    ["Grau de Saturação Final (Srf)", "%", ...results.map((r) => fmt(r.saturationFinalPct, 1))],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(r1);
  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo do Relatório");

  // ==========================================
  // ABA 2: DADOS DE MOLDAGEM E UMIDADE DOS CPS
  // ==========================================
  const r2: (string | number)[][] = [
    ["REGISTRO DE MOLDAGEM, DIMENSÕES E CÁPSULAS DE UMIDADE"],
    [],
  ];

  specimens.forEach((cp, idx) => {
    const res = results[idx];
    r2.push([`=== CORPO DE PROVA: ${cp.displayId ?? cp.id} (σn = ${cp.normalStressTarget} kPa) ===`]);
    r2.push(["Identificação do Anel", cp.ringId || `ANEL-0${idx + 1}`]);
    r2.push(["Massa do Anel (g)", fmt(cp.ringMass, 2)]);
    r2.push(["Massa CP + Anel (g)", fmt(cp.wetMassCPAnel, 2)]);
    r2.push(["Massa Úmida do Solo (g)", fmt(res?.wetMass ?? cp.wetMass, 2)]);
    r2.push(["Altura Inicial H₀ (mm)", fmt(cp.height0Mm, 2)]);
    r2.push(["Diâmetro / Lado D₀ (mm)", fmt(cp.diameterMm || sample.dimensionMm, 2)]);
    r2.push([]);
    
    r2.push(["Cápsulas de Umidade Inicial (w₀)"]);
    r2.push(["Cápsula", "Tara (g)", "Solo Úmido + Tara (g)", "Solo Seco + Tara (g)", "Água (g)", "Solo Seco (g)", "Umidade (%)"]);
    (cp.capsules || []).forEach((c, cIdx) => {
      const mw = (c.wet || 0) - (c.dry || 0);
      const ms = (c.dry || 0) - (c.tara || 0);
      const w = ms > 0 ? (mw / ms) * 100 : 0;
      r2.push([c.numero || `Cáp-${cIdx + 1}`, fmt(c.tara, 2), fmt(c.wet, 2), fmt(c.dry, 2), fmt(mw, 2), fmt(ms, 2), fmt(w, 2)]);
    });
    r2.push(["Umidade Inicial Média (%)", fmt(res?.moisture0Pct ?? averageMoisturePct(cp.capsules), 2)]);
    r2.push([]);

    r2.push(["Cápsulas de Umidade Final (wf)"]);
    r2.push(["Cápsula", "Tara (g)", "Solo Úmido + Tara (g)", "Solo Seco + Tara (g)", "Água (g)", "Solo Seco (g)", "Umidade (%)"]);
    (cp.finalCapsules || []).forEach((c, cIdx) => {
      const mw = (c.wet || 0) - (c.dry || 0);
      const ms = (c.dry || 0) - (c.tara || 0);
      const w = ms > 0 ? (mw / ms) * 100 : 0;
      r2.push([c.numero || `Cáp-F${cIdx + 1}`, fmt(c.tara, 2), fmt(c.wet, 2), fmt(c.dry, 2), fmt(mw, 2), fmt(ms, 2), fmt(w, 2)]);
    });
    r2.push(["Umidade Final Média (%)", fmt(res?.moistureFinalPct ?? averageMoisturePct(cp.finalCapsules), 2)]);
    r2.push([]);
    r2.push([]);
  });

  const wsMold = XLSX.utils.aoa_to_sheet(r2);
  XLSX.utils.book_append_sheet(wb, wsMold, "Moldagem & Umidades");

  // ==========================================
  // ABA 3: ADENSAMENTO (Leituras por CP)
  // ==========================================
  const maxConsPoints = Math.max(
    0,
    ...specimens.map((cp) => cp.consolidationData?.length || 0),
  );

  const r3: (string | number)[][] = [
    ["LEITURAS DA ETAPA DE ADENSAMENTO VERTICAL"],
    [],
  ];

  // Cabeçalho unificado lado a lado
  const consHeader1: (string | number)[] = [];
  const consHeader2: (string | number)[] = [];
  specimens.forEach((cp) => {
    consHeader1.push(`${cp.displayId ?? cp.id} (σn = ${cp.normalStressTarget} kPa)`, "", "");
    consHeader2.push("Tempo (min)", "√t (min½)", "Recalque Δh (mm)");
  });
  r3.push(consHeader1);
  r3.push(consHeader2);

  for (let rowIdx = 0; rowIdx < maxConsPoints; rowIdx++) {
    const row: (string | number)[] = [];
    specimens.forEach((cp) => {
      const p = cp.consolidationData?.[rowIdx];
      if (p) {
        row.push(fmt(p.timeMin, 1), fmt(Math.sqrt(Math.max(0, p.timeMin)), 2), fmt(p.settlementMm, 4));
      } else {
        row.push("", "", "");
      }
    });
    r3.push(row);
  }

  const wsCons = XLSX.utils.aoa_to_sheet(r3);
  XLSX.utils.book_append_sheet(wb, wsCons, "Adensamento");

  // ==========================================
  // ABA 4: CISALHAMENTO (Dados Brutos Completos)
  // ==========================================
  const r4: (string | number)[][] = [
    ["LEITURAS E RESULTADOS DA ETAPA DE CISALHAMENTO DIRETO"],
    [
      "CP",
      "Ponto",
      "Disp. Horiz. (mm)",
      "Deformação Horiz. (%)",
      "Carga (kgf)",
      "Força Cisalhante (N)",
      "Recalque Vert. (mm)",
      "Área Corrigida (cm²)",
      "Tensão Cisalhante τ (kPa)",
      "Tensão Normal σn (kPa)",
    ],
  ];

  specimens.forEach((cp, cpIdx) => {
    const res = results[cpIdx];
    (cp.shearData || []).forEach((reading, pIdx) => {
      const calcPt = res?.curve?.[pIdx];
      const forceN = reading.loadKgf != null ? reading.loadKgf * 9.80665 : reading.shearForce;
      const loadKgf = reading.loadKgf != null ? reading.loadKgf : forceN / 9.80665;
      r4.push([
        cp.displayId ?? cp.id,
        pIdx + 1,
        fmt(reading.horizDispMm, 3),
        fmt(calcPt?.horizStrainPct, 2),
        fmt(loadKgf, 2),
        fmt(forceN, 2),
        fmt(reading.vertDispMm, 3),
        fmt(calcPt?.areaCorr, 3),
        fmt(calcPt?.shearStress, 2),
        fmt(cp.normalStressTarget, 0),
      ]);
    });
  });

  const wsShear = XLSX.utils.aoa_to_sheet(r4);
  XLSX.utils.book_append_sheet(wb, wsShear, "Cisalhamento (Dados Brutos)");

  // ==========================================
  // ABA 5: ENVOLTÓRIA DE MOHR-COULOMB
  // ==========================================
  const r5: (string | number)[][] = [
    ["ENVOLTÓRIA DE RESISTÊNCIA DE MOHR-COULOMB — RESULTADOS FINAIS"],
    [],
    ["PARÂMETROS GEOTÉCNICOS"],
    ["Coesão Efetiva c'", envelope ? fmt(envelope.c, 2) : "—", "kPa"],
    ["Ângulo de Atrito Efetivo φ'", envelope ? fmt(envelope.phiDeg, 2) : "—", "graus (°)"],
    ["Coeficiente de Determinação R²", envelope ? fmt(envelope.r2, 4) : "—"],
    ["Equação Linear de Ruptura", envelope ? `τ_pico = ${fmt(envelope.c, 2)} + σ'n · tan(${fmt(envelope.phiDeg, 2)}°)` : "—"],
    [],
    ["PONTOS EXPERIMENTAIS DE RUPTURA"],
    ["Corpo de Prova", "Tensão Normal σ'n (kPa)", "Tensão Cisalhante de Pico τ_pico (kPa)", "Tensão Cisalhante Residual τ_res (kPa)"],
  ];

  results.forEach((r, i) => {
    r5.push([
      specimens[i]?.displayId ?? `CP-${i + 1}`,
      fmt(r.sigmaN, 0),
      fmt(r.tauPeak, 2),
      fmt(r.tauResidual, 2),
    ]);
  });

  const wsEnv = XLSX.utils.aoa_to_sheet(r5);
  XLSX.utils.book_append_sheet(wb, wsEnv, "Envoltória Mohr-Coulomb");

  // Nome padrão do arquivo
  const baseName = (sample.workNumber || sample.os || sample.reportNumber || "relatorio")
    .toString()
    .replace(/[^\w-]+/g, "_");
  const actualFilename = filename || `Cisalhamento-Direto_${baseName}_DadosBrutos.xlsx`;

  XLSX.writeFile(wb, actualFilename);
}
