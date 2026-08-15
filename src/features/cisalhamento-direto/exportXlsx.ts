import * as XLSX from "xlsx";
import type { CDSample, CDSpecimen, CDSpecimenResults, CDEnvelopeResult } from "./types";
import { averageMoisturePct } from "./domain/calc";
import type { Photo } from "@/features/lab/types";

const fmt = (n: number | null | undefined, d = 2) =>
  n == null || !isFinite(n) ? "—" : Number(n.toFixed(d));

export interface ExportCDParams {
  sample: CDSample;
  specimens: CDSpecimen[];
  results: CDSpecimenResults[];
  envelope: CDEnvelopeResult | null;
  photos?: Photo[];
  approvals?: any[];
  versions?: any[];
  filename?: string;
}

/**
 * Exporta o laudo executivo e memorial completo de ensaio de Cisalhamento Direto em formato Excel (.xlsx)
 * estruturado para entrega ao cliente final com a identidade visual e padrão técnico da Suporte INFRA.
 */
export function exportCDRawDataXlsx({
  sample,
  specimens,
  results,
  envelope,
  photos = [],
  approvals = [],
  versions = [],
  filename,
}: ExportCDParams) {
  const wb = XLSX.utils.book_new();

  // =========================================================================
  // ABA 1: LAUDO TÉCNICO EXECUTIVO (Espelho Completo do Relatório / PDF)
  // =========================================================================
  const titleReport = sample.testCondition === "inundado"
    ? "ENSAIO DE CISALHAMENTO DIRETO INUNDADO (CDinun) — ASTM D3080:2023"
    : "ENSAIO DE CISALHAMENTO DIRETO NA UMIDADE NATURAL (CDnat) — ASTM D3080:2023";

  const r1: (string | number)[][] = [
    ["SUPORTE CONSULTORIA E ENGENHARIA LTDA."],
    ["LABORATÓRIO DE GEOTECNIA E MECÂNICA DOS SOLOS"],
    [titleReport],
    ["LAUDO TÉCNICO EXECUTIVO DE ENSAIO ESPECIAL"],
    [],
    // --- 1. IDENTIFICAÇÃO CADASTRAL ---
    ["1. IDENTIFICAÇÃO DA ORDEM DE SERVIÇO E DA AMOSTRA"],
    ["Cliente:", sample.client || "—", "", "Furo / Sondagem:", sample.borehole || "—", "", "Data do Ensaio:", sample.date || new Date().toISOString().split("T")[0]],
    ["Obra / Projeto:", sample.workNumber || "—", "", "Profundidade (m):", sample.depth || "—", "", "Revisão:", sample.revision || "00"],
    ["Ordem de Serviço (O.S.):", sample.os || "—", "", "Código da Amostra:", sample.code || "—", "", "Identificação Amostra:", sample.reportNumber || "—"],
    ["Local / Município:", sample.local || "—", "", "Cota (m):", sample.coordCota || "—", "", "Coordenadas N/E:", `${sample.coordN || "—"} / ${sample.coordE || "—"}`],
    ["Descrição Tátil-Visual:", sample.description || "—"],
    ["Descrição Granulométrica:", sample.granulometricDescription || "—"],
    [],
    // --- 2. RESPONSABILIDADE TÉCNICA E EQUIPE ---
    ["2. RESPONSABILIDADE TÉCNICA E EXECUÇÃO"],
    ["Responsável Técnico:", sample.technicalResp || "Engº Responsável · CREA-SP 000000", "", "Operador (Laboratorista):", sample.operator || "—"],
    ["Digitado por:", sample.typedBy || "—", "", "Laboratório:", "Suporte INFRA — Unidade Central"],
    [],
    // --- 3. CONDIÇÕES E PARÂMETROS METODOLÓGICOS ---
    ["3. PARÂMETROS E CONDIÇÕES METODOLÓGICAS DO ENSAIO"],
    ["Norma Técnica Adotada:", "ASTM D3080 / D3080M-2023", "", "Equipamento Utilizado:", sample.equipment || "Cisalhamento Direto"],
    ["Condição do Ensaio:", sample.testCondition === "inundado" ? "Inundado (Saturação por Imersão)" : "Umidade Natural", "", "Correção de Área (ASTM D3080):", sample.applyAreaCorrection !== false ? "Sim (Área Corrigida Acor)" : "Não (Área Inicial Constante A₀)"],
    ["Geometria da Caixa / Anel:", sample.geometry === "circular" ? `Circular — Diâmetro = ${sample.dimensionMm || 60} mm` : `Quadrada — Lado = ${sample.dimensionMm || 60} mm`, "", "Densidade Real dos Grãos (Gs):", sample.Gs || 2.70],
    ["Estado / Tipo de Amostragem:", sample.sampleState === "indeformada" ? `Indeformada (${sample.sampleType || "Bloco"})` : sample.sampleState === "compactada" ? `Compactada (${sample.compactionEnergy || "PN"}${sample.compactionDegreePct ? ` · GC ${sample.compactionDegreePct}%` : ""})` : "Recompactada", "", "Número de Corpos de Prova:", specimens.length],
    [],
    // --- 4. PARÂMETROS DE RESISTÊNCIA AO CISALHAMENTO (MOHR-COULOMB) ---
    ["4. PARÂMETROS DE RESISTÊNCIA AO CISALHAMENTO (CRITÉRIO DE MOHR-COULOMB)"],
    ["Coesão Efetiva (c'):", envelope ? fmt(envelope.c, 2) : "—", "kPa", "Ângulo de Atrito Efetivo (φ'):", envelope ? fmt(envelope.phiDeg, 2) : "—", "graus (°)"],
    ["Coeficiente de Determinação (R²):", envelope ? fmt(envelope.r2, 4) : "—", "", "Equação da Envoltória:", envelope ? `τ = ${fmt(envelope.c, 2)} + σ'n · tan(${fmt(envelope.phiDeg, 2)}°)` : "—"],
    [],
    // --- 5. TABELA COMPARATIVA DE RESULTADOS ---
    ["5. QUADRO COMPARATIVO DE ÍNDICES FÍSICOS E RESULTADOS POR CORPO DE PROVA (CP)"],
    [
      "Parâmetro / Propriedade",
      "Símbolo",
      "Unidade",
      ...specimens.map((cp) => cp.displayId ?? cp.id),
    ],
    ["Tensão Normal Aplicada", "σn", "kPa", ...results.map((r) => fmt(r.sigmaN, 0))],
    ["Diâmetro / Dimensão Inicial", "D₀", "mm", ...results.map((r) => fmt(r.D0, 2))],
    ["Altura Inicial", "H₀", "mm", ...results.map((r) => fmt(r.H0, 2))],
    ["Área da Seção Transversal Inicial", "A₀", "cm²", ...results.map((r) => fmt(r.area0, 2))],
    ["Volume Inicial", "V₀", "cm³", ...results.map((r) => fmt(r.volume0, 2))],
    ["Massa Úmida Inicial", "M_um", "g", ...results.map((r) => fmt(r.wetMass, 2))],
    ["Massa Seca Calculada", "M_s", "g", ...results.map((r) => fmt(r.dryMass, 2))],
    ["Massa Específica Natural", "ρn", "g/cm³", ...results.map((r) => fmt(r.wetDensity, 3))],
    ["Massa Específica Seca", "ρd", "g/cm³", ...results.map((r) => fmt(r.dryDensity, 3))],
    ["Peso Específico Natural", "γn", "kN/m³", ...results.map((r) => fmt(r.gammaNat, 2))],
    ["Peso Específico Seco", "γd", "kN/m³", ...results.map((r) => fmt(r.gammaDry, 2))],
    ["Teor de Umidade Inicial", "w₀", "%", ...results.map((r) => fmt(r.moisture0Pct, 2))],
    ["Índice de Vazios Inicial", "e₀", "—", ...results.map((r) => fmt(r.voidRatio0, 3))],
    ["Grau de Saturação Inicial", "Sr₀", "%", ...results.map((r) => fmt(r.saturation0Pct, 1))],
    ["Recalque Vertical de Adensamento", "Δh", "mm", ...results.map((r) => fmt(r.H0 - r.heightAfterCons, 3))],
    ["Altura Pós-Adensamento", "Hc", "mm", ...results.map((r) => fmt(r.heightAfterCons, 2))],
    ["Índice de Vazios Pós-Adensamento", "ec", "—", ...results.map((r) => fmt(r.voidRatioAfterCons, 3))],
    ["Tensão Cisalhante de Pico", "τ_pico", "kPa", ...results.map((r) => fmt(r.tauPeak, 2))],
    ["Tensão Cisalhante Residual", "τ_res", "kPa", ...results.map((r) => fmt(r.tauResidual, 2))],
    ["Deformação Horizontal na Ruptura", "εh_rup", "%", ...results.map((r) => fmt(r.horizStrainAtFailurePct, 2))],
    ["Deslocamento Vertical na Ruptura", "δv_rup", "mm", ...results.map((r) => fmt(r.vertDispAtFailureMm, 3))],
    ["Teor de Umidade Final", "wf", "%", ...results.map((r) => fmt(r.moistureFinalPct, 2))],
    ["Grau de Saturação Final", "Srf", "%", ...results.map((r) => fmt(r.saturationFinalPct, 1))],
    [],
    // --- 6. CONTROLE DE REVISÕES ---
    ["6. CONTROLE DE REVISÕES E HISTÓRICO DE EMISSÃO"],
    ["Revisão", "Data de Emissão", "Descrição das Alterações / Motivo", "Elaborado por", "Verificado por", "Status da Aprovação"],
    [
      `Rev ${String(sample.revision || "00").padStart(2, "0")}`,
      sample.date || new Date().toISOString().split("T")[0],
      "Emissão inicial do relatório executivo de ensaio.",
      sample.typedBy || sample.operator || "Técnico de Laboratório",
      sample.technicalResp || "Responsável Técnico",
      "Aprovado",
    ],
    [],
    // --- 7. NOTAS TÉCNICAS E BIBLIOGRAFIA ---
    ["7. NOTAS TÉCNICAS E REFERÊNCIAS NORMATIVAS UTILIZADAS"],
    ["• ASTM D3080 / D3080M-2023 — Standard Test Method for Direct Shear Test of Soils Under Consolidated Drained Conditions."],
    ["• HEAD, K. H. & EPPS, R. J. (2011) — Manual of Soil Laboratory Testing: Volume II - Shear Strength and Compressibility Test."],
    ["• GERMAINE, J. T. & GERMAINE, A. V. (2009) — Geotechnical Laboratory Measurements for Engineers, John Wiley & Sons."],
    ["• Os resultados apresentados referem-se exclusivamente à amostra ensaiada nas condições descritas neste laudo."],
    [],
    // --- RODAPÉ ---
    ["SUPORTE CONSULTORIA E ENGENHARIA LTDA. — SISTEMA SUPORTE INFRA"],
    ["Documento emitido eletronicamente. Todos os direitos reservados."],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(r1);

  // Larguras de colunas da Aba 1
  wsSummary["!cols"] = [
    { wch: 38 }, // A
    { wch: 28 }, // B
    { wch: 14 }, // C
    { wch: 28 }, // D
    { wch: 24 }, // E
    { wch: 20 }, // F
    { wch: 24 }, // G
    { wch: 20 }, // H
  ];

  // Mesclagens do cabeçalho da Aba 1
  wsSummary["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, // SUPORTE CONSULTORIA
    { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }, // LABORATÓRIO DE GEOTECNIA
    { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } }, // TÍTULO DO ENSAIO
    { s: { r: 3, c: 0 }, e: { r: 3, c: 6 } }, // SUBTÍTULO
    { s: { r: 5, c: 0 }, e: { r: 5, c: 6 } }, // SEÇÃO 1
    { s: { r: 10, c: 1 }, e: { r: 10, c: 6 } }, // Descrição Tátil
    { s: { r: 11, c: 1 }, e: { r: 11, c: 6 } }, // Descrição Granulo
    { s: { r: 13, c: 0 }, e: { r: 13, c: 6 } }, // SEÇÃO 2
    { s: { r: 17, c: 0 }, e: { r: 17, c: 6 } }, // SEÇÃO 3
    { s: { r: 23, c: 0 }, e: { r: 23, c: 6 } }, // SEÇÃO 4
    { s: { r: 28, c: 0 }, e: { r: 28, c: 6 } }, // SEÇÃO 5
  ];

  XLSX.utils.book_append_sheet(wb, wsSummary, "Laudo Executivo");

  // =========================================================================
  // ABA 2: DADOS DE MOLDAGEM E UMIDADE DOS CPS
  // =========================================================================
  const r2: (string | number)[][] = [
    ["REGISTRO DE MOLDAGEM, DIMENSÕES E CÁPSULAS DE UMIDADE"],
    ["SUPORTE INFRA — LABORATÓRIO DE ENSAIOS ESPECIAIS"],
    [],
  ];

  specimens.forEach((cp, idx) => {
    const res = results[idx];
    r2.push([`CORPO DE PROVA: ${cp.displayId ?? cp.id} (Tensão Normal σn = ${cp.normalStressTarget} kPa)`]);
    r2.push(["Identificação do Anel:", cp.ringId || `ANEL-0${idx + 1}`, "", "Massa do Anel (g):", fmt(cp.ringMass, 2)]);
    r2.push(["Massa CP + Anel (g):", fmt(cp.wetMassCPAnel, 2), "", "Massa Úmida do Solo (g):", fmt(res?.wetMass ?? cp.wetMass, 2)]);
    r2.push(["Altura Inicial H₀ (mm):", fmt(cp.height0Mm, 2), "", "Diâmetro / Lado D₀ (mm):", fmt(cp.diameterMm || sample.dimensionMm, 2)]);
    r2.push([]);
    
    r2.push(["Cápsulas de Umidade Inicial (w₀)"]);
    r2.push(["Cápsula Nº", "Tara (g)", "Solo Úmido + Tara (g)", "Solo Seco + Tara (g)", "Massa de Água (g)", "Massa Solo Seco (g)", "Teor de Umidade (%)"]);
    (cp.capsules || []).forEach((c, cIdx) => {
      const mw = (c.wet || 0) - (c.dry || 0);
      const ms = (c.dry || 0) - (c.tara || 0);
      const w = ms > 0 ? (mw / ms) * 100 : 0;
      r2.push([c.numero || `Cáp-${cIdx + 1}`, fmt(c.tara, 2), fmt(c.wet, 2), fmt(c.dry, 2), fmt(mw, 2), fmt(ms, 2), fmt(w, 2)]);
    });
    r2.push(["Umidade Inicial Média w₀ (%):", fmt(res?.moisture0Pct ?? averageMoisturePct(cp.capsules), 2)]);
    r2.push([]);

    r2.push(["Cápsulas de Umidade Final (wf)"]);
    r2.push(["Cápsula Nº", "Tara (g)", "Solo Úmido + Tara (g)", "Solo Seco + Tara (g)", "Massa de Água (g)", "Massa Solo Seco (g)", "Teor de Umidade (%)"]);
    (cp.finalCapsules || []).forEach((c, cIdx) => {
      const mw = (c.wet || 0) - (c.dry || 0);
      const ms = (c.dry || 0) - (c.tara || 0);
      const w = ms > 0 ? (mw / ms) * 100 : 0;
      r2.push([c.numero || `Cáp-F${cIdx + 1}`, fmt(c.tara, 2), fmt(c.wet, 2), fmt(c.dry, 2), fmt(mw, 2), fmt(ms, 2), fmt(w, 2)]);
    });
    r2.push(["Umidade Final Média wf (%):", fmt(res?.moistureFinalPct ?? averageMoisturePct(cp.finalCapsules), 2)]);
    r2.push([]);
    r2.push([]);
  });

  const wsMold = XLSX.utils.aoa_to_sheet(r2);
  wsMold["!cols"] = [
    { wch: 22 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMold, "Moldagem & Umidades");

  // =========================================================================
  // ABA 3: ADENSAMENTO (Leituras por CP)
  // =========================================================================
  const maxConsPoints = Math.max(
    0,
    ...specimens.map((cp) => cp.consolidationData?.length || 0),
  );

  const r3: (string | number)[][] = [
    ["LEITURAS DA ETAPA DE ADENSAMENTO VERTICAL (CURVAS DE ADENSAMENTO TEMPO-DEFORMAÇÃO)"],
    ["SUPORTE INFRA — LABORATÓRIO DE ENSAIOS ESPECIAIS"],
    [],
  ];

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
  wsCons["!cols"] = specimens.flatMap(() => [
    { wch: 14 }, { wch: 14 }, { wch: 18 },
  ]);
  XLSX.utils.book_append_sheet(wb, wsCons, "Adensamento");

  // =========================================================================
  // ABA 4: CISALHAMENTO (Dados Brutos Completos Leitura a Leitura)
  // =========================================================================
  const r4: (string | number)[][] = [
    ["LEITURAS E RESULTADOS DA ETAPA DE CISALHAMENTO DIRETO (MEMORIAL PASSO A PASSO)"],
    ["SUPORTE INFRA — LABORATÓRIO DE ENSAIOS ESPECIAIS"],
    [],
    [
      "Corpo de Prova (CP)",
      "Ponto Nº",
      "Deslocamento Horiz. (mm)",
      "Deformação Horiz. (%)",
      "Carga de Cisalhamento (kgf)",
      "Força Cisalhante (N)",
      "Deslocamento Vertical (mm)",
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
  wsShear["!cols"] = [
    { wch: 18 }, { wch: 10 }, { wch: 24 }, { wch: 22 }, { wch: 26 },
    { wch: 20 }, { wch: 24 }, { wch: 20 }, { wch: 22 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsShear, "Cisalhamento (Dados Brutos)");

  // =========================================================================
  // ABA 5: ENVOLTÓRIA DE MOHR-COULOMB
  // =========================================================================
  const r5: (string | number)[][] = [
    ["ENVOLTÓRIA DE RESISTÊNCIA DE MOHR-COULOMB — MEMORIAL DE CÁLCULO E REGRESSÃO"],
    ["SUPORTE INFRA — LABORATÓRIO DE ENSAIOS ESPECIAIS"],
    [],
    ["PARÂMETROS GEOTÉCNICOS OBTIDOS"],
    ["Coesão Efetiva (c'):", envelope ? fmt(envelope.c, 2) : "—", "kPa"],
    ["Ângulo de Atrito Efetivo (φ'):", envelope ? fmt(envelope.phiDeg, 2) : "—", "graus (°)"],
    ["Coeficiente de Determinação (R²):", envelope ? fmt(envelope.r2, 4) : "—"],
    ["Equação Linear da Envoltória:", envelope ? `τ_pico = ${fmt(envelope.c, 2)} + σ'n · tan(${fmt(envelope.phiDeg, 2)}°)` : "—"],
    [],
    ["PONTOS EXPERIMENTAIS DE RUPTURA POR CORPO DE PROVA"],
    ["Corpo de Prova", "Tensão Normal σ'n (kPa)", "Tensão Cisalhante de Pico τ_pico (kPa)", "Tensão Cisalhante Residual τ_res (kPa)", "Deformação na Ruptura (%)"],
  ];

  results.forEach((r, i) => {
    r5.push([
      specimens[i]?.displayId ?? `CP-${i + 1}`,
      fmt(r.sigmaN, 0),
      fmt(r.tauPeak, 2),
      fmt(r.tauResidual, 2),
      fmt(r.horizStrainAtFailurePct, 2),
    ]);
  });

  const wsEnv = XLSX.utils.aoa_to_sheet(r5);
  wsEnv["!cols"] = [
    { wch: 28 }, { wch: 24 }, { wch: 34 }, { wch: 34 }, { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, wsEnv, "Envoltória Mohr-Coulomb");

  // =========================================================================
  // ABA 6: REGISTRO FOTOGRÁFICO DO ENSAIO
  // =========================================================================
  const r6: (string | number)[][] = [
    ["REGISTRO FOTOGRÁFICO DO ENSAIO — CATÁLOGO DE IMAGENS E EVIDÊNCIAS"],
    ["SUPORTE INFRA — LABORATÓRIO DE ENSAIOS ESPECIAIS"],
    [],
    ["Nº", "Corpo de Prova (CP)", "Etapa / Fase", "Legenda / Descrição da Evidência", "Data de Registro", "Identificador Interno"],
  ];

  if (photos.length === 0) {
    r6.push(["—", "Geral", "—", "Nenhuma fotografia anexada a este ensaio.", "—", "—"]);
  } else {
    photos.forEach((p, pIdx) => {
      r6.push([
        pIdx + 1,
        p.specimenId || "Geral",
        p.kind === "moldagem" ? "Moldagem do CP" : p.kind === "ruptura" ? "Ruptura / Pós-Ensaio" : "Geral / Amostra",
        p.caption || `Fotografia ${p.kind} — ${p.specimenId || "Amostra"}`,
        p.createdAt ? new Date(p.createdAt).toLocaleDateString("pt-BR") : "—",
        p.id,
      ]);
    });
  }

  const wsPhotos = XLSX.utils.aoa_to_sheet(r6);
  wsPhotos["!cols"] = [
    { wch: 8 }, { wch: 20 }, { wch: 24 }, { wch: 45 }, { wch: 18 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsPhotos, "Registro Fotográfico");

  // Nome padrão do arquivo executivo
  const baseName = (sample.workNumber || sample.os || sample.reportNumber || "relatorio")
    .toString()
    .replace(/[^\w-]+/g, "_");
  const actualFilename = filename || `Cisalhamento-Direto_${baseName}_LaudoExecutivo.xlsx`;

  XLSX.writeFile(wb, actualFilename);
}

