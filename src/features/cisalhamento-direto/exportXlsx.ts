import ExcelJS from "exceljs";
import type { CDSample, CDSpecimen, CDSpecimenResults, CDEnvelopeResult } from "./types";
import { averageMoisturePct } from "./domain/calc";
import type { Photo } from "@/features/lab/types";
import {
  generateMohrEnvelopeCanvas,
  generateStressStrainCanvas,
  generateVolumeChangeCanvas,
} from "./chartCanvas";

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

// Cores corporativas Suporte INFRA
const BRAND_DARK = "FF141414"; // #141414
const BRAND_ACCENT = "FFE5A832"; // #E5A832
const BRAND_NAVY = "FF1E293B"; // #1E293B
const BG_LIGHT_GRAY = "FFF1F5F9"; // #F1F5F9
const BG_ZEBRA = "FFF8FAFC"; // #F8FAFC
const BG_HIGHLIGHT = "FFFEF3C7"; // #FEF3C7
const BORDER_COLOR = "FFCBD5E1"; // #CBD5E1

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: BORDER_COLOR } },
  left: { style: "thin", color: { argb: BORDER_COLOR } },
  bottom: { style: "thin", color: { argb: BORDER_COLOR } },
  right: { style: "thin", color: { argb: BORDER_COLOR } },
};

async function getLogoBase64(): Promise<string | null> {
  try {
    const res = await fetch("/suporte-infra-logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const b64 = (reader.result as string).split(",")[1];
        resolve(b64);
      };
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Exporta o laudo técnico executivo completo em formato Excel (.xlsx)
 * com layout fiel ao PDF, gráficos embutidos em alta resolução, abas individuais por CP e dados lado a lado.
 */
export async function exportCDRawDataXlsx({
  sample,
  specimens,
  results,
  envelope,
  photos = [],
  approvals = [],
  versions = [],
  filename,
}: ExportCDParams) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Suporte INFRA";
  wb.lastModifiedBy = sample.operator || "Suporte INFRA";
  wb.created = new Date();
  wb.modified = new Date();

  // 1. Carrega o logotipo
  const logoBase64 = await getLogoBase64();
  let logoImageId: number | null = null;
  if (logoBase64) {
    logoImageId = wb.addImage({
      base64: logoBase64,
      extension: "png",
    });
  }

  // 2. Renderiza os gráficos em Canvas
  const mohrChartB64 = generateMohrEnvelopeCanvas(results, specimens, envelope, 900, 520);
  const stressStrainB64 = generateStressStrainCanvas(results, specimens, 900, 480);
  const volChangeB64 = generateVolumeChangeCanvas(results, specimens, 900, 480);

  let mohrChartId: number | null = null;
  let stressStrainId: number | null = null;
  let volChangeId: number | null = null;

  if (mohrChartB64) {
    mohrChartId = wb.addImage({ base64: mohrChartB64, extension: "png" });
  }
  if (stressStrainB64) {
    stressStrainId = wb.addImage({ base64: stressStrainB64, extension: "png" });
  }
  if (volChangeB64) {
    volChangeId = wb.addImage({ base64: volChangeB64, extension: "png" });
  }

  // =========================================================================
  // ABA 1: LAUDO EXECUTIVO (Espelho Fiel do PDF com Gráfico da Envoltória)
  // =========================================================================
  const ws1 = wb.addWorksheet("Laudo Executivo", { views: [{ showGridLines: true }] });
  ws1.columns = [
    { width: 34 }, { width: 14 }, { width: 12 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 },
  ];

  // Inserção do Logo no topo
  if (logoImageId !== null) {
    ws1.addImage(logoImageId, {
      tl: { col: 0.15, row: 0.2 },
      ext: { width: 160, height: 42 },
    });
  }

  // Cabeçalho Corporativo
  ws1.mergeCells("C1:G1");
  const h1 = ws1.getCell("C1");
  h1.value = "SUPORTE CONSULTORIA E ENGENHARIA LTDA.";
  h1.font = { name: "Calibri", size: 13, bold: true, color: { argb: BRAND_DARK } };
  h1.alignment = { horizontal: "right", vertical: "middle" };

  ws1.mergeCells("C2:G2");
  const h2 = ws1.getCell("C2");
  h2.value = "LABORATÓRIO DE GEOTECNIA E MECÂNICA DOS SOLOS";
  h2.font = { name: "Calibri", size: 10, bold: true, color: { argb: BRAND_ACCENT } };
  h2.alignment = { horizontal: "right", vertical: "middle" };

  ws1.mergeCells("A4:G4");
  const titleCell = ws1.getCell("A4");
  titleCell.value = sample.testCondition === "inundado"
    ? "LAUDO DE ENSAIO DE CISALHAMENTO DIRETO INUNDADO (CDinun) — ASTM D3080:2023"
    : "LAUDO DE ENSAIO DE CISALHAMENTO DIRETO NA UMIDADE NATURAL (CDnat) — ASTM D3080:2023";
  titleCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws1.getRow(4).height = 25;

  let r = 6;

  const addSectionHeader = (text: string) => {
    ws1.mergeCells(`A${r}:G${r}`);
    const cell = ws1.getCell(`A${r}`);
    cell.value = text;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_NAVY } };
    cell.alignment = { horizontal: "left", vertical: "middle", indent: 1 };
    ws1.getRow(r).height = 20;
    r++;
  };

  const addGridRow = (l1: string, v1: any, l2: string, v2: any, l3: string, v3: any) => {
    const row = ws1.getRow(r);
    row.height = 18;

    ws1.getCell(`A${r}`).value = l1;
    ws1.getCell(`A${r}`).font = { name: "Calibri", size: 9, bold: true, color: { argb: "FF475569" } };
    ws1.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_LIGHT_GRAY } };
    ws1.getCell(`A${r}`).border = thinBorder;

    ws1.getCell(`B${r}`).value = v1;
    ws1.getCell(`B${r}`).font = { name: "Calibri", size: 9, bold: true };
    ws1.getCell(`B${r}`).border = thinBorder;

    ws1.getCell(`C${r}`).value = l2;
    ws1.getCell(`C${r}`).font = { name: "Calibri", size: 9, bold: true, color: { argb: "FF475569" } };
    ws1.getCell(`C${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_LIGHT_GRAY } };
    ws1.getCell(`C${r}`).border = thinBorder;

    ws1.mergeCells(`D${r}:E${r}`);
    ws1.getCell(`D${r}`).value = v2;
    ws1.getCell(`D${r}`).font = { name: "Calibri", size: 9 };
    ws1.getCell(`D${r}`).border = thinBorder;
    ws1.getCell(`E${r}`).border = thinBorder;

    ws1.getCell(`F${r}`).value = l3;
    ws1.getCell(`F${r}`).font = { name: "Calibri", size: 9, bold: true, color: { argb: "FF475569" } };
    ws1.getCell(`F${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_LIGHT_GRAY } };
    ws1.getCell(`F${r}`).border = thinBorder;

    ws1.getCell(`G${r}`).value = v3;
    ws1.getCell(`G${r}`).font = { name: "Calibri", size: 9 };
    ws1.getCell(`G${r}`).border = thinBorder;

    r++;
  };

  // 1. Identificação
  addSectionHeader("1. IDENTIFICAÇÃO DA ORDEM DE SERVIÇO E DA AMOSTRA");
  addGridRow("Cliente:", sample.client || "—", "Furo / Sondagem:", sample.borehole || "—", "Data do Ensaio:", sample.date || new Date().toISOString().split("T")[0]);
  addGridRow("Obra / Projeto:", sample.workNumber || "—", "Profundidade (m):", sample.depth || "—", "Revisão:", `Rev ${String(sample.revision || "00").padStart(2, "0")}`);
  addGridRow("Ordem de Serviço (O.S.):", sample.os || "—", "Código da Amostra:", sample.code || "—", "Identificação Amostra:", sample.reportNumber || "—");
  addGridRow("Local / Município:", sample.local || "—", "Cota do Furo (m):", sample.coordCota || "—", "Coordenadas N/E:", `${sample.coordN || "—"} / ${sample.coordE || "—"}`);

  ws1.getRow(r).height = 18;
  ws1.getCell(`A${r}`).value = "Descrição Tátil-Visual:";
  ws1.getCell(`A${r}`).font = { name: "Calibri", size: 9, bold: true, color: { argb: "FF475569" } };
  ws1.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_LIGHT_GRAY } };
  ws1.getCell(`A${r}`).border = thinBorder;
  ws1.mergeCells(`B${r}:G${r}`);
  ws1.getCell(`B${r}`).value = sample.description || "—";
  ws1.getCell(`B${r}`).font = { name: "Calibri", size: 9, italic: true };
  for (let c = 2; c <= 7; c++) ws1.getRow(r).getCell(c).border = thinBorder;
  r++;

  ws1.getRow(r).height = 18;
  ws1.getCell(`A${r}`).value = "Descrição Granulométrica:";
  ws1.getCell(`A${r}`).font = { name: "Calibri", size: 9, bold: true, color: { argb: "FF475569" } };
  ws1.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_LIGHT_GRAY } };
  ws1.getCell(`A${r}`).border = thinBorder;
  ws1.mergeCells(`B${r}:G${r}`);
  ws1.getCell(`B${r}`).value = sample.granulometricDescription || "—";
  ws1.getCell(`B${r}`).font = { name: "Calibri", size: 9, italic: true };
  for (let c = 2; c <= 7; c++) ws1.getRow(r).getCell(c).border = thinBorder;
  r += 2;

  // 2. Responsabilidade Técnica
  addSectionHeader("2. RESPONSABILIDADE TÉCNICA E EQUIPE DE EXECUÇÃO");
  addGridRow("Responsável Técnico:", sample.technicalResp || "Engº Responsável · CREA-SP 000000", "Operador (Laboratorista):", sample.operator || "—", "Laboratório:", "Suporte INFRA");
  addGridRow("Digitado por:", sample.typedBy || "—", "Verificado por:", sample.verifiedBy || "Engenharia Geotécnica", "Unidade:", "Laboratório Central / SP");
  r++;

  // 3. Condições do Ensaio
  addSectionHeader("3. PARÂMETROS E CONDIÇÕES METODOLÓGICAS DO ENSAIO");
  addGridRow("Norma Técnica:", "ASTM D3080 / D3080M-2023", "Equipamento Utilizado:", sample.equipment || "Cisalhamento Direto", "Nº Corpos de Prova:", specimens.length);
  addGridRow("Condição do Ensaio:", sample.testCondition === "inundado" ? "Inundado (CDinun)" : "Umidade Natural (CDnat)", "Correção de Área:", sample.applyAreaCorrection !== false ? "Sim (ASTM D3080 - Acor)" : "Não (Área Inicial A₀)", "Densidade Grãos (Gs):", sample.Gs || 2.70);
  addGridRow("Geometria da Caixa:", sample.geometry === "circular" ? `Circular (Ø = ${sample.dimensionMm || 60} mm)` : `Quadrada (${sample.dimensionMm || 60}x${sample.dimensionMm || 60} mm)`, "Estado da Amostra:", sample.sampleState === "indeformada" ? `Indeformada (${sample.sampleType || "Bloco"})` : sample.sampleState === "compactada" ? `Compactada (${sample.compactionEnergy || "PN"})` : "Recompactada", "Massa Espec. Água:", `${sample.rhoW || 1.0} g/cm³`);
  r++;

  // 4. Parâmetros de Resistência com Cards e Gráfico
  addSectionHeader("4. PARÂMETROS DE RESISTÊNCIA AO CISALHAMENTO (CRITÉRIO DE MOHR-COULOMB)");

  // 3 Quadros de Destaque
  ws1.mergeCells(`A${r}:B${r}`);
  ws1.getCell(`A${r}`).value = "COESÃO EFETIVA (c')";
  ws1.getCell(`A${r}`).font = { name: "Calibri", size: 9, bold: true, color: { argb: "FF475569" } };
  ws1.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_LIGHT_GRAY } };
  ws1.getCell(`A${r}`).alignment = { horizontal: "center", vertical: "middle" };
  ws1.getCell(`A${r}`).border = thinBorder;
  ws1.getCell(`B${r}`).border = thinBorder;

  ws1.mergeCells(`C${r}:E${r}`);
  ws1.getCell(`C${r}`).value = "ÂNGULO DE ATRITO EFETIVO (φ')";
  ws1.getCell(`C${r}`).font = { name: "Calibri", size: 9, bold: true, color: { argb: "FF475569" } };
  ws1.getCell(`C${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_LIGHT_GRAY } };
  ws1.getCell(`C${r}`).alignment = { horizontal: "center", vertical: "middle" };
  ws1.getCell(`C${r}`).border = thinBorder;
  ws1.getCell(`D${r}`).border = thinBorder;
  ws1.getCell(`E${r}`).border = thinBorder;

  ws1.mergeCells(`F${r}:G${r}`);
  ws1.getCell(`F${r}`).value = "COEF. DETERMINAÇÃO (R²)";
  ws1.getCell(`F${r}`).font = { name: "Calibri", size: 9, bold: true, color: { argb: "FF475569" } };
  ws1.getCell(`F${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_LIGHT_GRAY } };
  ws1.getCell(`F${r}`).alignment = { horizontal: "center", vertical: "middle" };
  ws1.getCell(`F${r}`).border = thinBorder;
  ws1.getCell(`G${r}`).border = thinBorder;
  r++;

  ws1.getRow(r).height = 24;
  ws1.mergeCells(`A${r}:B${r}`);
  ws1.getCell(`A${r}`).value = envelope ? `c' = ${fmt(envelope.c, 2)} kPa` : "—";
  ws1.getCell(`A${r}`).font = { name: "Calibri", size: 12, bold: true, color: { argb: BRAND_DARK } };
  ws1.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_HIGHLIGHT } };
  ws1.getCell(`A${r}`).alignment = { horizontal: "center", vertical: "middle" };
  ws1.getCell(`A${r}`).border = thinBorder;
  ws1.getCell(`B${r}`).border = thinBorder;

  ws1.mergeCells(`C${r}:E${r}`);
  ws1.getCell(`C${r}`).value = envelope ? `φ' = ${fmt(envelope.phiDeg, 2)}°` : "—";
  ws1.getCell(`C${r}`).font = { name: "Calibri", size: 12, bold: true, color: { argb: BRAND_DARK } };
  ws1.getCell(`C${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_HIGHLIGHT } };
  ws1.getCell(`C${r}`).alignment = { horizontal: "center", vertical: "middle" };
  ws1.getCell(`C${r}`).border = thinBorder;
  ws1.getCell(`D${r}`).border = thinBorder;
  ws1.getCell(`E${r}`).border = thinBorder;

  ws1.mergeCells(`F${r}:G${r}`);
  ws1.getCell(`F${r}`).value = envelope ? `R² = ${fmt(envelope.r2, 3)}` : "—";
  ws1.getCell(`F${r}`).font = { name: "Calibri", size: 12, bold: true, color: { argb: BRAND_DARK } };
  ws1.getCell(`F${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_HIGHLIGHT } };
  ws1.getCell(`F${r}`).alignment = { horizontal: "center", vertical: "middle" };
  ws1.getCell(`F${r}`).border = thinBorder;
  ws1.getCell(`G${r}`).border = thinBorder;
  r++;

  ws1.mergeCells(`A${r}:G${r}`);
  ws1.getCell(`A${r}`).value = envelope ? `Equação Linear da Envoltória de Ruptura:  τ = ${fmt(envelope.c, 2)} + σ'n · tan(${fmt(envelope.phiDeg, 2)}°)` : "—";
  ws1.getCell(`A${r}`).font = { name: "Calibri", size: 9, bold: true, color: { argb: "FF334155" } };
  ws1.getCell(`A${r}`).alignment = { horizontal: "center", vertical: "middle" };
  for (let c = 1; c <= 7; c++) ws1.getRow(r).getCell(c).border = thinBorder;
  r += 2;

  // --- EMBUTIR O GRÁFICO DA ENVOLTÓRIA DE MOHR-COULOMB NO LAUDO EXECUTIVO ---
  if (mohrChartId !== null) {
    const chartStartRow = r;
    // Espaço reservado para o gráfico
    for (let i = 0; i < 20; i++) {
      ws1.getRow(r).height = 16;
      r++;
    }
    ws1.addImage(mohrChartId, {
      tl: { col: 0.1, row: chartStartRow - 0.9 },
      ext: { width: 680, height: 320 },
    });
    r += 2;
  }

  // 5. Tabela Comparativa de Resultados
  addSectionHeader("5. QUADRO COMPARATIVO DE ÍNDICES FÍSICOS E RESULTADOS POR CORPO DE PROVA (CP)");

  const tableHeaderRow = ws1.getRow(r);
  tableHeaderRow.height = 22;
  const th1 = ws1.getCell(`A${r}`);
  th1.value = "Parâmetro / Propriedade Física";
  th1.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
  th1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
  th1.border = thinBorder;

  const th2 = ws1.getCell(`B${r}`);
  th2.value = "Símbolo";
  th2.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
  th2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
  th2.alignment = { horizontal: "center", vertical: "middle" };
  th2.border = thinBorder;

  const th3 = ws1.getCell(`C${r}`);
  th3.value = "Unidade";
  th3.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
  th3.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
  th3.alignment = { horizontal: "center", vertical: "middle" };
  th3.border = thinBorder;

  specimens.forEach((cp, i) => {
    const colLetter = String.fromCharCode(68 + i);
    const cell = ws1.getCell(`${colLetter}${r}`);
    cell.value = `${cp.displayId ?? cp.id} (σn = ${fmt(cp.normalStressTarget, 0)} kPa)`;
    cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  });
  r++;

  const rowsData = [
    ["Tensão Normal Efetiva Aplicada", "σ'n", "kPa", (res: CDSpecimenResults) => fmt(res.sigmaN, 0)],
    ["Diâmetro / Dimensão Inicial", "D₀", "mm", (res: CDSpecimenResults) => fmt(res.D0, 2)],
    ["Altura Inicial", "H₀", "mm", (res: CDSpecimenResults) => fmt(res.H0, 2)],
    ["Área da Seção Transversal Inicial", "A₀", "cm²", (res: CDSpecimenResults) => fmt(res.area0, 2)],
    ["Volume Inicial", "V₀", "cm³", (res: CDSpecimenResults) => fmt(res.volume0, 2)],
    ["Massa Úmida Inicial", "M_um", "g", (res: CDSpecimenResults) => fmt(res.wetMass, 2)],
    ["Massa Seca Calculada", "M_s", "g", (res: CDSpecimenResults) => fmt(res.dryMass, 2)],
    ["Massa Específica Natural", "ρn", "g/cm³", (res: CDSpecimenResults) => fmt(res.wetDensity, 3)],
    ["Massa Específica Seca", "ρd", "g/cm³", (res: CDSpecimenResults) => fmt(res.dryDensity, 3)],
    ["Peso Específico Natural", "γn", "kN/m³", (res: CDSpecimenResults) => fmt(res.gammaNat, 2)],
    ["Peso Específico Seco", "γd", "kN/m³", (res: CDSpecimenResults) => fmt(res.gammaDry, 2)],
    ["Teor de Umidade Inicial", "w₀", "%", (res: CDSpecimenResults) => fmt(res.moisture0Pct, 2)],
    ["Índice de Vazios Inicial", "e₀", "—", (res: CDSpecimenResults) => fmt(res.voidRatio0, 3)],
    ["Grau de Saturação Inicial", "Sr₀", "%", (res: CDSpecimenResults) => fmt(res.saturation0Pct, 1)],
    ["Recalque Vertical de Adensamento", "Δh", "mm", (res: CDSpecimenResults) => fmt(res.H0 - res.heightAfterCons, 3)],
    ["Altura Pós-Adensamento", "Hc", "mm", (res: CDSpecimenResults) => fmt(res.heightAfterCons, 2)],
    ["Índice de Vazios Pós-Adensamento", "ec", "—", (res: CDSpecimenResults) => fmt(res.voidRatioAfterCons, 3)],
    ["Tensão Cisalhante de Pico", "τ_pico", "kPa", (res: CDSpecimenResults) => fmt(res.tauPeak, 2)],
    ["Tensão Cisalhante Residual", "τ_res", "kPa", (res: CDSpecimenResults) => fmt(res.tauResidual, 2)],
    ["Deformação Horizontal na Ruptura", "εh_rup", "%", (res: CDSpecimenResults) => fmt(res.horizStrainAtFailurePct, 2)],
    ["Deslocamento Vertical na Ruptura", "δv_rup", "mm", (res: CDSpecimenResults) => fmt(res.vertDispAtFailureMm, 3)],
    ["Teor de Umidade Final", "wf", "%", (res: CDSpecimenResults) => fmt(res.moistureFinalPct, 2)],
    ["Grau de Saturação Final", "Srf", "%", (res: CDSpecimenResults) => fmt(res.saturationFinalPct, 1)],
  ];

  rowsData.forEach(([label, sym, unit, fn], idx) => {
    const row = ws1.getRow(r);
    row.height = 17;
    const isZebra = idx % 2 === 1;
    const bgRow = isZebra ? BG_ZEBRA : "FFFFFFFF";

    ws1.getCell(`A${r}`).value = label;
    ws1.getCell(`A${r}`).font = { name: "Calibri", size: 9 };
    ws1.getCell(`A${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgRow } };
    ws1.getCell(`A${r}`).border = thinBorder;

    ws1.getCell(`B${r}`).value = sym;
    ws1.getCell(`B${r}`).font = { name: "Calibri", size: 9, bold: true, color: { argb: "FF475569" } };
    ws1.getCell(`B${r}`).alignment = { horizontal: "center", vertical: "middle" };
    ws1.getCell(`B${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgRow } };
    ws1.getCell(`B${r}`).border = thinBorder;

    ws1.getCell(`C${r}`).value = unit;
    ws1.getCell(`C${r}`).font = { name: "Calibri", size: 9, color: { argb: "FF64748B" } };
    ws1.getCell(`C${r}`).alignment = { horizontal: "center", vertical: "middle" };
    ws1.getCell(`C${r}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgRow } };
    ws1.getCell(`C${r}`).border = thinBorder;

    specimens.forEach((_, i) => {
      const colLetter = String.fromCharCode(68 + i);
      const res = results[i];
      const val = res ? fn(res) : "—";
      const cCell = ws1.getCell(`${colLetter}${r}`);
      cCell.value = val;
      cCell.font = { name: "Calibri", size: 9, bold: label.includes("Tensão") || label.includes("Pico") };
      cCell.alignment = { horizontal: "right", vertical: "middle" };
      cCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgRow } };
      cCell.border = thinBorder;
    });

    r++;
  });
  r++;

  // 6. Controle de Revisões
  addSectionHeader("6. CONTROLE DE REVISÕES E HISTÓRICO DE EMISSÃO");
  const revHeader = ws1.getRow(r);
  revHeader.height = 18;
  ["Revisão", "Data", "Descrição das Alterações", "Elaborado por", "Verificado por", "Status da Aprovação"].forEach((h, i) => {
    const col = i === 0 ? "A" : i === 1 ? "B" : i === 2 ? "C" : i === 3 ? "D" : i === 4 ? "E" : "F";
    const cell = ws1.getCell(`${col}${r}`);
    cell.value = h;
    cell.font = { name: "Calibri", size: 8.5, bold: true, color: { argb: "FF475569" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_LIGHT_GRAY } };
    cell.border = thinBorder;
  });
  r++;

  ws1.getRow(r).height = 18;
  ws1.getCell(`A${r}`).value = `Rev ${String(sample.revision || "00").padStart(2, "0")}`;
  ws1.getCell(`B${r}`).value = sample.date || new Date().toISOString().split("T")[0];
  ws1.getCell(`C${r}`).value = "Emissão inicial do relatório executivo de ensaio.";
  ws1.getCell(`D${r}`).value = sample.typedBy || sample.operator || "Técnico de Laboratório";
  ws1.getCell(`E${r}`).value = sample.technicalResp || "Responsável Técnico";
  ws1.getCell(`F${r}`).value = "Aprovado";
  for (let c = 1; c <= 7; c++) {
    ws1.getRow(r).getCell(c).font = { name: "Calibri", size: 8.5 };
    ws1.getRow(r).getCell(c).border = thinBorder;
  }
  r += 2;

  // 7. Notas Técnicas
  addSectionHeader("7. NOTAS TÉCNICAS E REFERÊNCIAS NORMATIVAS UTILIZADAS");
  const notes = [
    "• ASTM D3080 / D3080M-2023 — Standard Test Method for Direct Shear Test of Soils Under Consolidated Drained Conditions.",
    "• HEAD, K. H. & EPPS, R. J. (2011) — Manual of Soil Laboratory Testing: Volume II - Shear Strength and Compressibility Test.",
    "• GERMAINE, J. T. & GERMAINE, A. V. (2009) — Geotechnical Laboratory Measurements for Engineers, John Wiley & Sons.",
    "• Os resultados apresentados referem-se exclusivamente à amostra ensaiada nas condições especificadas neste documento técnico.",
  ];
  notes.forEach((note) => {
    ws1.mergeCells(`A${r}:G${r}`);
    const nCell = ws1.getCell(`A${r}`);
    nCell.value = note;
    nCell.font = { name: "Calibri", size: 8.5, italic: true, color: { argb: "FF475569" } };
    for (let c = 1; c <= 7; c++) ws1.getRow(r).getCell(c).border = thinBorder;
    r++;
  });
  r++;

  // Rodapé Corporativo
  ws1.mergeCells(`A${r}:G${r}`);
  const foot = ws1.getCell(`A${r}`);
  foot.value = "SUPORTE CONSULTORIA E ENGENHARIA LTDA. — SISTEMA SUPORTE INFRA (Documento Gerado Eletronicamente)";
  foot.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
  foot.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
  foot.alignment = { horizontal: "center", vertical: "middle" };
  ws1.getRow(r).height = 20;

  // =========================================================================
  // ABA 2: CURVAS & GRÁFICOS DO ENSAIO (Painel de Alta Resolução)
  // =========================================================================
  const wsCharts = wb.addWorksheet("Curvas & Gráficos", { views: [{ showGridLines: true }] });
  wsCharts.columns = [{ width: 35 }, { width: 35 }, { width: 35 }, { width: 35 }];

  wsCharts.mergeCells("A1:D1");
  const cTitle = wsCharts.getCell("A1");
  cTitle.value = "PAINEL GRÁFICO COMPLETO DO ENSAIO DE CISALHAMENTO DIRETO";
  cTitle.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  cTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
  cTitle.alignment = { horizontal: "center", vertical: "middle" };
  wsCharts.getRow(1).height = 25;

  let gRow = 3;
  if (stressStrainId !== null) {
    wsCharts.mergeCells(`A${gRow}:D${gRow}`);
    const c1H = wsCharts.getCell(`A${gRow}`);
    c1H.value = "1. CURVA TENSÃO CISALHANTE (τ) VS. DEFORMAÇÃO HORIZONTAL (εh)";
    c1H.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    c1H.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_NAVY } };
    gRow++;

    const imgRow = gRow;
    for (let i = 0; i < 18; i++) { wsCharts.getRow(gRow).height = 16; gRow++; }
    wsCharts.addImage(stressStrainId, {
      tl: { col: 0.1, row: imgRow - 0.9 },
      ext: { width: 750, height: 300 },
    });
    gRow += 2;
  }

  if (volChangeId !== null) {
    wsCharts.mergeCells(`A${gRow}:D${gRow}`);
    const c2H = wsCharts.getCell(`A${gRow}`);
    c2H.value = "2. VARIAÇÃO VOLUMÉTRICA — DESLOCAMENTO VERTICAL (δv) VS. DEFORMAÇÃO HORIZONTAL (εh)";
    c2H.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    c2H.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_NAVY } };
    gRow++;

    const imgRow = gRow;
    for (let i = 0; i < 18; i++) { wsCharts.getRow(gRow).height = 16; gRow++; }
    wsCharts.addImage(volChangeId, {
      tl: { col: 0.1, row: imgRow - 0.9 },
      ext: { width: 750, height: 300 },
    });
    gRow += 2;
  }

  if (mohrChartId !== null) {
    wsCharts.mergeCells(`A${gRow}:D${gRow}`);
    const c3H = wsCharts.getCell(`A${gRow}`);
    c3H.value = "3. ENVOLTÓRIA DE RESISTÊNCIA DE MOHR-COULOMB (τ VS. σ'n)";
    c3H.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    c3H.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_NAVY } };
    gRow++;

    const imgRow = gRow;
    for (let i = 0; i < 18; i++) { wsCharts.getRow(gRow).height = 16; gRow++; }
    wsCharts.addImage(mohrChartId, {
      tl: { col: 0.1, row: imgRow - 0.9 },
      ext: { width: 750, height: 300 },
    });
  }

  // =========================================================================
  // ABA 3: CISALHAMENTO (CPS LADO A LADO)
  // =========================================================================
  const wsSideBySide = wb.addWorksheet("Cisalhamento (Lado a Lado)", { views: [{ showGridLines: true }] });
  
  // Larguras de colunas por CP (6 colunas por CP)
  wsSideBySide.columns = specimens.flatMap(() => [
    { width: 14 }, // Disp H (mm)
    { width: 14 }, // Def H (%)
    { width: 14 }, // Carga (kgf)
    { width: 14 }, // Recalque V (mm)
    { width: 15 }, // Area Corrigida (cm2)
    { width: 16 }, // Tensão Cisalhante (kPa)
    { width: 3 },  // Espaço separador
  ]);

  const totalCols = specimens.length * 7;
  wsSideBySide.mergeCells(1, 1, 1, totalCols - 1);
  const sTitle = wsSideBySide.getCell(1, 1);
  sTitle.value = "LEITURAS DE CISALHAMENTO DIRETO COMPARATIVO — CORPOS DE PROVA LADO A LADO";
  sTitle.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  sTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
  sTitle.alignment = { horizontal: "center", vertical: "middle" };
  wsSideBySide.getRow(1).height = 24;

  let sCol = 1;
  specimens.forEach((cp, idx) => {
    wsSideBySide.mergeCells(3, sCol, 3, sCol + 5);
    const cpHead = wsSideBySide.getCell(3, sCol);
    cpHead.value = `${cp.displayId ?? cp.id} (Tensão Normal σn = ${cp.normalStressTarget} kPa)`;
    cpHead.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cpHead.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_NAVY } };
    cpHead.alignment = { horizontal: "center", vertical: "middle" };

    const headers = [
      "Disp. H (mm)", "Def. H (%)", "Carga (kgf)", "Recalque V (mm)", "Área Corrig. (cm²)", "τ (kPa)",
    ];
    headers.forEach((h, hI) => {
      const c = wsSideBySide.getCell(4, sCol + hI);
      c.value = h;
      c.font = { name: "Calibri", size: 8.5, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.border = thinBorder;
    });

    const res = results[idx];
    (cp.shearData || []).forEach((reading, pIdx) => {
      const rowNum = 5 + pIdx;
      const calcPt = res?.curve?.[pIdx];
      const forceN = reading.loadKgf != null ? reading.loadKgf * 9.80665 : reading.shearForce;
      const loadKgf = reading.loadKgf != null ? reading.loadKgf : forceN / 9.80665;
      const isZebra = pIdx % 2 === 1;

      const vals = [
        fmt(reading.horizDispMm, 2),
        fmt(calcPt?.horizStrainPct, 2),
        fmt(loadKgf, 2),
        fmt(reading.vertDispMm, 3),
        fmt(calcPt?.areaCorr, 3),
        fmt(calcPt?.shearStress, 2),
      ];

      vals.forEach((v, vI) => {
        const cell = wsSideBySide.getCell(rowNum, sCol + vI);
        cell.value = v;
        cell.font = { name: "Calibri", size: 9 };
        cell.border = thinBorder;
        cell.alignment = { horizontal: "right", vertical: "middle" };
        if (isZebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_ZEBRA } };
      });
    });

    sCol += 7;
  });

  // =========================================================================
  // ABAS INDIVIDUAIS PARA CADA CORPO DE PROVA (CP-01, CP-02, CP-03...)
  // =========================================================================
  specimens.forEach((cp, idx) => {
    const cpName = cp.displayId ?? `CP-0${idx + 1}`;
    const res = results[idx];
    const wsCP = wb.addWorksheet(`${cpName} (${cp.normalStressTarget}kPa)`, {
      views: [{ showGridLines: true }],
    });

    wsCP.columns = [
      { width: 22 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 18 },
    ];

    // Título da aba do CP
    wsCP.mergeCells("A1:G1");
    const cpTitle = wsCP.getCell("A1");
    cpTitle.value = `MEMORIAL TÉCNICO INDIVIDUAL — ${cpName} (Tensão Normal σn = ${cp.normalStressTarget} kPa)`;
    cpTitle.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cpTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
    cpTitle.alignment = { horizontal: "center", vertical: "middle" };
    wsCP.getRow(1).height = 24;

    let cpR = 3;

    // 1. Dados de Moldagem
    wsCP.mergeCells(`A${cpR}:G${cpR}`);
    const mHead = wsCP.getCell(`A${cpR}`);
    mHead.value = "1. DADOS DE MOLDAGEM E DIMENSÕES DO CORPO DE PROVA";
    mHead.font = { name: "Calibri", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
    mHead.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_NAVY } };
    cpR++;

    const moldGrid = [
      ["Identificação do Anel:", cp.ringId || `ANEL-0${idx + 1}`, "Massa do Anel (g):", fmt(cp.ringMass, 2)],
      ["Massa CP + Anel (g):", fmt(cp.wetMassCPAnel, 2), "Massa Úmida do Solo (g):", fmt(res?.wetMass ?? cp.wetMass, 2)],
      ["Altura Inicial H₀ (mm):", fmt(cp.height0Mm, 2), "Diâmetro / Lado D₀ (mm):", fmt(cp.diameterMm || sample.dimensionMm, 2)],
      ["Área Inicial A₀ (cm²):", fmt(res?.area0, 2), "Volume Inicial V₀ (cm³):", fmt(res?.volume0, 2)],
      ["Massa Específica Natural ρn (g/cm³):", fmt(res?.wetDensity, 3), "Massa Específica Seca ρd (g/cm³):", fmt(res?.dryDensity, 3)],
      ["Índice de Vazios Inicial e₀:", fmt(res?.voidRatio0, 3), "Grau de Saturação Inicial Sr₀ (%):", fmt(res?.saturation0Pct, 1)],
    ];

    moldGrid.forEach(([l1, v1, l2, v2]) => {
      const row = wsCP.getRow(cpR);
      row.height = 17;
      wsCP.getCell(`A${cpR}`).value = l1;
      wsCP.getCell(`A${cpR}`).font = { name: "Calibri", size: 9, bold: true };
      wsCP.getCell(`A${cpR}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_LIGHT_GRAY } };
      wsCP.getCell(`A${cpR}`).border = thinBorder;

      wsCP.mergeCells(`B${cpR}:C${cpR}`);
      wsCP.getCell(`B${cpR}`).value = v1;
      wsCP.getCell(`B${cpR}`).font = { name: "Calibri", size: 9 };
      wsCP.getCell(`B${cpR}`).border = thinBorder;
      wsCP.getCell(`C${cpR}`).border = thinBorder;

      wsCP.mergeCells(`D${cpR}:E${cpR}`);
      wsCP.getCell(`D${cpR}`).value = l2;
      wsCP.getCell(`D${cpR}`).font = { name: "Calibri", size: 9, bold: true };
      wsCP.getCell(`D${cpR}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_LIGHT_GRAY } };
      wsCP.getCell(`D${cpR}`).border = thinBorder;
      wsCP.getCell(`E${cpR}`).border = thinBorder;

      wsCP.mergeCells(`F${cpR}:G${cpR}`);
      wsCP.getCell(`F${cpR}`).value = v2;
      wsCP.getCell(`F${cpR}`).font = { name: "Calibri", size: 9 };
      wsCP.getCell(`F${cpR}`).border = thinBorder;
      wsCP.getCell(`G${cpR}`).border = thinBorder;

      cpR++;
    });
    cpR++;

    // 2. Cápsulas de Umidade Inicial
    wsCP.mergeCells(`A${cpR}:G${cpR}`);
    const uHead = wsCP.getCell(`A${cpR}`);
    uHead.value = "2. CÁPSULAS DE UMIDADE INICIAL (w₀)";
    uHead.font = { name: "Calibri", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
    uHead.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_NAVY } };
    cpR++;

    const cHeaders = ["Cápsula Nº", "Tara (g)", "Solo Úmido + Tara (g)", "Solo Seco + Tara (g)", "Massa Água (g)", "Massa Solo Seco (g)", "Teor de Umidade (%)"];
    cHeaders.forEach((h, hI) => {
      const c = wsCP.getCell(cpR, hI + 1);
      c.value = h;
      c.font = { name: "Calibri", size: 8.5, bold: true };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_LIGHT_GRAY } };
      c.border = thinBorder;
    });
    cpR++;

    (cp.capsules || []).forEach((c, cIdx) => {
      const mw = (c.wet || 0) - (c.dry || 0);
      const ms = (c.dry || 0) - (c.tara || 0);
      const w = ms > 0 ? (mw / ms) * 100 : 0;
      const row = [c.numero || `Cáp-${cIdx + 1}`, fmt(c.tara, 2), fmt(c.wet, 2), fmt(c.dry, 2), fmt(mw, 2), fmt(ms, 2), fmt(w, 2)];
      row.forEach((v, i) => {
        const cell = wsCP.getCell(cpR, i + 1);
        cell.value = v;
        cell.font = { name: "Calibri", size: 9 };
        cell.border = thinBorder;
        if (i > 0) cell.alignment = { horizontal: "right" };
      });
      cpR++;
    });

    wsCP.mergeCells(`A${cpR}:F${cpR}`);
    wsCP.getCell(`A${cpR}`).value = "Umidade Inicial Média w₀ (%):";
    wsCP.getCell(`A${cpR}`).font = { name: "Calibri", size: 9, bold: true };
    wsCP.getCell(`A${cpR}`).alignment = { horizontal: "right" };
    wsCP.getCell(`G${cpR}`).value = fmt(res?.moisture0Pct ?? averageMoisturePct(cp.capsules), 2);
    wsCP.getCell(`G${cpR}`).font = { name: "Calibri", size: 9, bold: true };
    wsCP.getCell(`G${cpR}`).alignment = { horizontal: "right" };
    wsCP.getCell(`G${cpR}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_HIGHLIGHT } };
    cpR += 2;

    // 3. Leituras de Cisalhamento Passo a Passo
    wsCP.mergeCells(`A${cpR}:G${cpR}`);
    const sStepHead = wsCP.getCell(`A${cpR}`);
    sStepHead.value = "3. LEITURAS DE CISALHAMENTO PASSO A PASSO (DADOS BRUTOS)";
    sStepHead.font = { name: "Calibri", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
    sStepHead.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_NAVY } };
    cpR++;

    const stepHeaders = ["Ponto Nº", "Disp. Horiz. (mm)", "Deformação Horiz. (%)", "Carga (kgf)", "Recalque Vert. (mm)", "Área Corrigida (cm²)", "Tensão Cisalhante τ (kPa)"];
    stepHeaders.forEach((h, hI) => {
      const c = wsCP.getCell(cpR, hI + 1);
      c.value = h;
      c.font = { name: "Calibri", size: 8.5, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
      c.border = thinBorder;
      c.alignment = { horizontal: "center", vertical: "middle" };
    });
    cpR++;

    (cp.shearData || []).forEach((reading, pIdx) => {
      const calcPt = res?.curve?.[pIdx];
      const forceN = reading.loadKgf != null ? reading.loadKgf * 9.80665 : reading.shearForce;
      const loadKgf = reading.loadKgf != null ? reading.loadKgf : forceN / 9.80665;
      const isZebra = pIdx % 2 === 1;

      const row = [
        pIdx + 1,
        fmt(reading.horizDispMm, 2),
        fmt(calcPt?.horizStrainPct, 2),
        fmt(loadKgf, 2),
        fmt(reading.vertDispMm, 3),
        fmt(calcPt?.areaCorr, 3),
        fmt(calcPt?.shearStress, 2),
      ];

      row.forEach((v, i) => {
        const cell = wsCP.getCell(cpR, i + 1);
        cell.value = v;
        cell.font = { name: "Calibri", size: 9 };
        cell.border = thinBorder;
        if (i === 0) cell.alignment = { horizontal: "center" };
        else cell.alignment = { horizontal: "right" };
        if (isZebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_ZEBRA } };
      });
      cpR++;
    });
  });

  // =========================================================================
  // ABA FINAL: REGISTRO FOTOGRÁFICO
  // =========================================================================
  const wsPhotos = wb.addWorksheet("Registro Fotográfico", { views: [{ showGridLines: true }] });
  wsPhotos.columns = [{ width: 8 }, { width: 22 }, { width: 24 }, { width: 45 }, { width: 18 }, { width: 20 }];

  wsPhotos.mergeCells("A1:F1");
  const w6Title = wsPhotos.getCell("A1");
  w6Title.value = "REGISTRO FOTOGRÁFICO DO ENSAIO — CATÁLOGO DE EVIDÊNCIAS";
  w6Title.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  w6Title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
  w6Title.alignment = { horizontal: "center", vertical: "middle" };
  wsPhotos.getRow(1).height = 24;

  const photoHeaders = ["Nº", "Corpo de Prova (CP)", "Etapa / Fase", "Legenda / Descrição da Evidência", "Data de Registro", "Identificador Interno"];
  photoHeaders.forEach((h, i) => {
    const cell = wsPhotos.getRow(3).getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_NAVY } };
    cell.border = thinBorder;
  });

  if (photos.length === 0) {
    wsPhotos.mergeCells("A4:F4");
    wsPhotos.getCell("A4").value = "Nenhuma fotografia anexada a este ensaio.";
    wsPhotos.getCell("A4").font = { name: "Calibri", size: 9, italic: true };
    wsPhotos.getCell("A4").alignment = { horizontal: "center" };
  } else {
    photos.forEach((p, pIdx) => {
      const row = [
        pIdx + 1,
        p.specimenId || "Geral",
        p.kind === "moldagem" ? "Moldagem do CP" : p.kind === "ruptura" ? "Ruptura / Pós-Ensaio" : "Geral / Amostra",
        p.caption || `Fotografia ${p.kind} — ${p.specimenId || "Amostra"}`,
        p.createdAt ? new Date(p.createdAt).toLocaleDateString("pt-BR") : "—",
        p.id,
      ];
      row.forEach((v, i) => {
        const cell = wsPhotos.getRow(4 + pIdx).getCell(i + 1);
        cell.value = v;
        cell.font = { name: "Calibri", size: 9 };
        cell.border = thinBorder;
      });
    });
  }

  // Download do arquivo XLSX
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const baseName = (sample.workNumber || sample.os || sample.reportNumber || "relatorio")
    .toString()
    .replace(/[^\w-]+/g, "_");
  a.download = filename || `Cisalhamento-Direto_${baseName}_LaudoExecutivo.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
