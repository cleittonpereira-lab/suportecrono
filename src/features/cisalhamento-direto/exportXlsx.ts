import ExcelJS from "exceljs";
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

// Estilos corporativos Suporte INFRA
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
 * Exporta o laudo técnico executivo completo e dados brutos em formato Excel (.xlsx)
 * com design profissional, cores corporativas da Suporte INFRA, bordas e identidade visual.
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

  // Carrega o logotipo da Suporte INFRA
  const logoBase64 = await getLogoBase64();
  let logoImageId: number | null = null;
  if (logoBase64) {
    logoImageId = wb.addImage({
      base64: logoBase64,
      extension: "png",
    });
  }

  // =========================================================================
  // ABA 1: LAUDO EXECUTIVO (Design Fiel ao Relatório PDF da Suporte INFRA)
  // =========================================================================
  const ws1 = wb.addWorksheet("Laudo Executivo", {
    views: [{ showGridLines: true }],
  });

  // Configuração de largura das colunas (A a G)
  ws1.columns = [
    { width: 34 }, // A
    { width: 14 }, // B
    { width: 12 }, // C
    { width: 22 }, // D
    { width: 22 }, // E
    { width: 22 }, // F
    { width: 22 }, // G
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

  // Função auxiliar para barra de título de seção
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

  // --- SEÇÃO 1: IDENTIFICAÇÃO CADASTRAL ---
  addSectionHeader("1. IDENTIFICAÇÃO DA ORDEM DE SERVIÇO E DA AMOSTRA");

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

  addGridRow("Cliente:", sample.client || "—", "Furo / Sondagem:", sample.borehole || "—", "Data do Ensaio:", sample.date || new Date().toISOString().split("T")[0]);
  addGridRow("Obra / Projeto:", sample.workNumber || "—", "Profundidade (m):", sample.depth || "—", "Revisão:", `Rev ${String(sample.revision || "00").padStart(2, "0")}`);
  addGridRow("Ordem de Serviço (O.S.):", sample.os || "—", "Código da Amostra:", sample.code || "—", "Identificação Amostra:", sample.reportNumber || "—");
  addGridRow("Local / Município:", sample.local || "—", "Cota do Furo (m):", sample.coordCota || "—", "Coordenadas N/E:", `${sample.coordN || "—"} / ${sample.coordE || "—"}`);

  // Descrições
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

  // --- SEÇÃO 2: RESPONSABILIDADE TÉCNICA E EQUIPE ---
  addSectionHeader("2. RESPONSABILIDADE TÉCNICA E EQUIPE DE EXECUÇÃO");
  addGridRow("Responsável Técnico:", sample.technicalResp || "Engº Responsável · CREA-SP 000000", "Operador (Laboratorista):", sample.operator || "—", "Laboratório:", "Suporte INFRA");
  addGridRow("Digitado por:", sample.typedBy || "—", "Verificado por:", sample.verifiedBy || "Engenharia Geotécnica", "Unidade:", "Laboratório Central / SP");
  r++;

  // --- SEÇÃO 3: PARÂMETROS METODOLÓGICOS DO ENSAIO ---
  addSectionHeader("3. PARÂMETROS E CONDIÇÕES METODOLÓGICAS DO ENSAIO");
  addGridRow("Norma Técnica:", "ASTM D3080 / D3080M-2023", "Equipamento Utilizado:", sample.equipment || "Cisalhamento Direto", "Nº Corpos de Prova:", specimens.length);
  addGridRow("Condição do Ensaio:", sample.testCondition === "inundado" ? "Inundado (CDinun)" : "Umidade Natural (CDnat)", "Correção de Área:", sample.applyAreaCorrection !== false ? "Sim (ASTM D3080 - Acor)" : "Não (Área Inicial A₀)", "Densidade Grãos (Gs):", sample.Gs || 2.70);
  addGridRow("Geometria da Caixa:", sample.geometry === "circular" ? `Circular (Ø = ${sample.dimensionMm || 60} mm)` : `Quadrada (${sample.dimensionMm || 60}x${sample.dimensionMm || 60} mm)`, "Estado da Amostra:", sample.sampleState === "indeformada" ? `Indeformada (${sample.sampleType || "Bloco"})` : sample.sampleState === "compactada" ? `Compactada (${sample.compactionEnergy || "PN"})` : "Recompactada", "Massa Espec. Água:", `${sample.rhoW || 1.0} g/cm³`);
  r++;

  // --- SEÇÃO 4: PARÂMETROS DE RESISTÊNCIA (MOHR-COULOMB) COM DESTAQUE ---
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

  // --- SEÇÃO 5: TABELA COMPARATIVA DE RESULTADOS ---
  addSectionHeader("5. QUADRO COMPARATIVO DE ÍNDICES FÍSICOS E RESULTADOS POR CORPO DE PROVA (CP)");

  // Cabeçalho da tabela de CPs
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
    const colLetter = String.fromCharCode(68 + i); // D, E, F...
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

  // --- SEÇÃO 6: CONTROLE DE REVISÕES ---
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

  // --- SEÇÃO 7: NOTAS TÉCNICAS E REFERÊNCIAS ---
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

  // --- RODAPÉ CORPORATIVO ---
  ws1.mergeCells(`A${r}:G${r}`);
  const foot = ws1.getCell(`A${r}`);
  foot.value = "SUPORTE CONSULTORIA E ENGENHARIA LTDA. — SISTEMA SUPORTE INFRA (Documento Gerado Eletronicamente)";
  foot.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
  foot.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
  foot.alignment = { horizontal: "center", vertical: "middle" };
  ws1.getRow(r).height = 20;

  // =========================================================================
  // ABA 2: MOLDAGEM & UMIDADE (Com Formatação Rica)
  // =========================================================================
  const ws2 = wb.addWorksheet("Moldagem & Umidades", { views: [{ showGridLines: true }] });
  ws2.columns = [
    { width: 22 }, { width: 15 }, { width: 22 }, { width: 22 }, { width: 20 }, { width: 20 }, { width: 22 },
  ];

  let r2 = 1;
  ws2.mergeCells(`A${r2}:G${r2}`);
  const w2Title = ws2.getCell(`A${r2}`);
  w2Title.value = "REGISTRO DE MOLDAGEM, DIMENSÕES E CÁPSULAS DE UMIDADE DOS CPS";
  w2Title.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  w2Title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
  w2Title.alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(r2).height = 24;
  r2 += 2;

  specimens.forEach((cp, idx) => {
    const res = results[idx];
    ws2.mergeCells(`A${r2}:G${r2}`);
    const cpHeader = ws2.getCell(`A${r2}`);
    cpHeader.value = `CORPO DE PROVA: ${cp.displayId ?? cp.id} (Tensão Normal σn = ${cp.normalStressTarget} kPa)`;
    cpHeader.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cpHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_NAVY } };
    ws2.getRow(r2).height = 20;
    r2++;

    // Tabela de Cápsulas Iniciais
    ws2.mergeCells(`A${r2}:G${r2}`);
    ws2.getCell(`A${r2}`).value = "Cápsulas de Umidade Inicial (w₀)";
    ws2.getCell(`A${r2}`).font = { name: "Calibri", size: 9, bold: true };
    ws2.getCell(`A${r2}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_LIGHT_GRAY } };
    r2++;

    const capsHead = ["Cápsula Nº", "Tara (g)", "Solo Úmido + Tara (g)", "Solo Seco + Tara (g)", "Massa Água (g)", "Massa Solo Seco (g)", "Umidade (%)"];
    capsHead.forEach((h, i) => {
      const cell = ws2.getRow(r2).getCell(i + 1);
      cell.value = h;
      cell.font = { name: "Calibri", size: 8.5, bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_LIGHT_GRAY } };
      cell.border = thinBorder;
    });
    r2++;

    (cp.capsules || []).forEach((c, cIdx) => {
      const mw = (c.wet || 0) - (c.dry || 0);
      const ms = (c.dry || 0) - (c.tara || 0);
      const w = ms > 0 ? (mw / ms) * 100 : 0;
      const row = [c.numero || `Cáp-${cIdx + 1}`, fmt(c.tara, 2), fmt(c.wet, 2), fmt(c.dry, 2), fmt(mw, 2), fmt(ms, 2), fmt(w, 2)];
      row.forEach((v, i) => {
        const cell = ws2.getRow(r2).getCell(i + 1);
        cell.value = v;
        cell.font = { name: "Calibri", size: 9 };
        cell.border = thinBorder;
        if (i > 0) cell.alignment = { horizontal: "right" };
      });
      r2++;
    });

    // Média Inicial
    ws2.mergeCells(`A${r2}:F${r2}`);
    ws2.getCell(`A${r2}`).value = "Umidade Inicial Média w₀ (%):";
    ws2.getCell(`A${r2}`).font = { name: "Calibri", size: 9, bold: true };
    ws2.getCell(`A${r2}`).alignment = { horizontal: "right" };
    ws2.getCell(`G${r2}`).value = fmt(res?.moisture0Pct ?? averageMoisturePct(cp.capsules), 2);
    ws2.getCell(`G${r2}`).font = { name: "Calibri", size: 9, bold: true };
    ws2.getCell(`G${r2}`).alignment = { horizontal: "right" };
    ws2.getCell(`G${r2}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_HIGHLIGHT } };
    r2 += 2;
  });

  // =========================================================================
  // ABA 3: ADENSAMENTO (Com Formatação de Cabeçalhos e Bordas)
  // =========================================================================
  const ws3 = wb.addWorksheet("Adensamento", { views: [{ showGridLines: true }] });
  ws3.columns = specimens.flatMap(() => [
    { width: 14 }, { width: 14 }, { width: 18 },
  ]);

  ws3.mergeCells(1, 1, 1, Math.max(6, specimens.length * 3));
  const w3Title = ws3.getCell("A1");
  w3Title.value = "LEITURAS DA ETAPA DE ADENSAMENTO VERTICAL (TEMPO VS. RECALQUE)";
  w3Title.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  w3Title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
  w3Title.alignment = { horizontal: "center", vertical: "middle" };
  ws3.getRow(1).height = 24;

  let colIdx = 1;
  specimens.forEach((cp) => {
    ws3.mergeCells(3, colIdx, 3, colIdx + 2);
    const cpHeader = ws3.getCell(3, colIdx);
    cpHeader.value = `${cp.displayId ?? cp.id} (σn = ${cp.normalStressTarget} kPa)`;
    cpHeader.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    cpHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_NAVY } };
    cpHeader.alignment = { horizontal: "center" };

    const hRow = ["Tempo (min)", "√t (min½)", "Recalque Δh (mm)"];
    hRow.forEach((h, hI) => {
      const cell = ws3.getCell(4, colIdx + hI);
      cell.value = h;
      cell.font = { name: "Calibri", size: 8.5, bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_LIGHT_GRAY } };
      cell.border = thinBorder;
    });

    (cp.consolidationData || []).forEach((p, pIdx) => {
      const rowNum = 5 + pIdx;
      const c1 = ws3.getCell(rowNum, colIdx);
      const c2 = ws3.getCell(rowNum, colIdx + 1);
      const c3 = ws3.getCell(rowNum, colIdx + 2);
      c1.value = fmt(p.timeMin, 1);
      c2.value = fmt(Math.sqrt(Math.max(0, p.timeMin)), 2);
      c3.value = fmt(p.settlementMm, 4);
      c1.border = thinBorder;
      c2.border = thinBorder;
      c3.border = thinBorder;
      c1.alignment = { horizontal: "right" };
      c2.alignment = { horizontal: "right" };
      c3.alignment = { horizontal: "right" };
    });

    colIdx += 3;
  });

  // =========================================================================
  // ABA 4: CISALHAMENTO (Dados Brutos Completos com Zebra e Formatação)
  // =========================================================================
  const ws4 = wb.addWorksheet("Cisalhamento (Dados Brutos)", { views: [{ showGridLines: true }] });
  ws4.columns = [
    { width: 18 }, { width: 10 }, { width: 22 }, { width: 22 }, { width: 24 },
    { width: 20 }, { width: 22 }, { width: 20 }, { width: 22 }, { width: 20 },
  ];

  ws4.mergeCells("A1:J1");
  const w4Title = ws4.getCell("A1");
  w4Title.value = "LEITURAS E RESULTADOS DA ETAPA DE CISALHAMENTO DIRETO (MEMORIAL PASSO A PASSO)";
  w4Title.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  w4Title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
  w4Title.alignment = { horizontal: "center", vertical: "middle" };
  ws4.getRow(1).height = 24;

  const sHeaders = [
    "Corpo de Prova", "Ponto Nº", "Disp. Horiz. (mm)", "Deformação Horiz. (%)", "Carga (kgf)",
    "Força Cisalhante (N)", "Recalque Vert. (mm)", "Área Corrigida (cm²)", "Tensão Cisalhante τ (kPa)", "Tensão Normal σn (kPa)",
  ];
  const sRow = ws4.getRow(3);
  sRow.height = 20;
  sHeaders.forEach((h, i) => {
    const cell = sRow.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_NAVY } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  });

  let r4 = 4;
  specimens.forEach((cp, cpIdx) => {
    const res = results[cpIdx];
    (cp.shearData || []).forEach((reading, pIdx) => {
      const calcPt = res?.curve?.[pIdx];
      const forceN = reading.loadKgf != null ? reading.loadKgf * 9.80665 : reading.shearForce;
      const loadKgf = reading.loadKgf != null ? reading.loadKgf : forceN / 9.80665;
      const isZebra = pIdx % 2 === 1;
      const row = [
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
      ];
      row.forEach((v, i) => {
        const cell = ws4.getRow(r4).getCell(i + 1);
        cell.value = v;
        cell.font = { name: "Calibri", size: 9 };
        cell.border = thinBorder;
        if (isZebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_ZEBRA } };
        if (i > 1) cell.alignment = { horizontal: "right" };
      });
      r4++;
    });
  });

  // =========================================================================
  // ABA 5: ENVOLTÓRIA DE MOHR-COULOMB
  // =========================================================================
  const ws5 = wb.addWorksheet("Envoltória Mohr-Coulomb", { views: [{ showGridLines: true }] });
  ws5.columns = [{ width: 28 }, { width: 24 }, { width: 32 }, { width: 32 }, { width: 24 }];

  ws5.mergeCells("A1:E1");
  const w5Title = ws5.getCell("A1");
  w5Title.value = "ENVOLTÓRIA DE RESISTÊNCIA DE MOHR-COULOMB — MEMORIAL DE CÁLCULO E REGRESSÃO";
  w5Title.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  w5Title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
  w5Title.alignment = { horizontal: "center", vertical: "middle" };
  ws5.getRow(1).height = 24;

  const envHeaders = ["Corpo de Prova", "Tensão Normal σ'n (kPa)", "Tensão Cisalhante de Pico τ_pico (kPa)", "Tensão Cisalhante Residual τ_res (kPa)", "Deformação na Ruptura (%)"];
  envHeaders.forEach((h, i) => {
    const cell = ws5.getRow(3).getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_NAVY } };
    cell.border = thinBorder;
  });

  results.forEach((res, i) => {
    const row = [specimens[i]?.displayId ?? `CP-${i + 1}`, fmt(res.sigmaN, 0), fmt(res.tauPeak, 2), fmt(res.tauResidual, 2), fmt(res.horizStrainAtFailurePct, 2)];
    row.forEach((v, colI) => {
      const cell = ws5.getRow(4 + i).getCell(colI + 1);
      cell.value = v;
      cell.font = { name: "Calibri", size: 9 };
      cell.border = thinBorder;
      if (colI > 0) cell.alignment = { horizontal: "right" };
    });
  });

  // =========================================================================
  // ABA 6: REGISTRO FOTOGRÁFICO DO ENSAIO
  // =========================================================================
  const ws6 = wb.addWorksheet("Registro Fotográfico", { views: [{ showGridLines: true }] });
  ws6.columns = [{ width: 8 }, { width: 22 }, { width: 24 }, { width: 45 }, { width: 18 }, { width: 20 }];

  ws6.mergeCells("A1:F1");
  const w6Title = ws6.getCell("A1");
  w6Title.value = "REGISTRO FOTOGRÁFICO DO ENSAIO — CATÁLOGO DE EVIDÊNCIAS";
  w6Title.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  w6Title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_DARK } };
  w6Title.alignment = { horizontal: "center", vertical: "middle" };
  ws6.getRow(1).height = 24;

  const photoHeaders = ["Nº", "Corpo de Prova (CP)", "Etapa / Fase", "Legenda / Descrição da Evidência", "Data de Registro", "Identificador Interno"];
  photoHeaders.forEach((h, i) => {
    const cell = ws6.getRow(3).getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_NAVY } };
    cell.border = thinBorder;
  });

  if (photos.length === 0) {
    ws6.mergeCells("A4:F4");
    ws6.getCell("A4").value = "Nenhuma fotografia anexada a este ensaio.";
    ws6.getCell("A4").font = { name: "Calibri", size: 9, italic: true };
    ws6.getCell("A4").alignment = { horizontal: "center" };
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
        const cell = ws6.getRow(4 + pIdx).getCell(i + 1);
        cell.value = v;
        cell.font = { name: "Calibri", size: 9 };
        cell.border = thinBorder;
      });
    });
  }

  // Gera o arquivo e aciona o download no navegador
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
