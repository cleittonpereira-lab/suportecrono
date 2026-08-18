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

// Cores corporativas Suporte INFRA (Padrão Oficial Executivo)
const COLOR_BLACK = "FF141414";
const COLOR_SECTION_BG = "FFD1D5DB"; // #d1d5db (SectionBar)
const COLOR_SECTION_TEXT = "FF111827";
const COLOR_ZEBRA = "FFF8FAFC"; // #f8fafc (Sutil e elegante)
const COLOR_BORDER = "FF141414";

const borderBlack: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: COLOR_BORDER } },
  left: { style: "thin", color: { argb: COLOR_BORDER } },
  bottom: { style: "thin", color: { argb: COLOR_BORDER } },
  right: { style: "thin", color: { argb: COLOR_BORDER } },
};

async function getImageBase64(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) {
    return url.split(",")[1] || null;
  }
  try {
    const res = await fetch(url);
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
 * Adiciona o Cabeçalho Oficial Idêntico ao PDF com Alturas e Posicionamentos Precisos
 */
function addOfficialReportHeader(
  ws: ExcelJS.Worksheet,
  sample: CDSample,
  title: string,
  page: number,
  total: number,
  logoImageId: number | null,
  startRow = 1
): number {
  let r = startRow;

  // Quadro reservado para o Logo Suporte (A1:B3)
  ws.mergeCells(`A${r}:B${r + 2}`);

  // Inserção do Logo com proporção perfeita (185px x 48px)
  if (logoImageId !== null) {
    ws.addImage(logoImageId, {
      tl: { col: 0.15, row: r - 0.85 },
      ext: { width: 185, height: 48 },
      editAs: "oneCell",
    });
  }

  // Título Central do Laudo (C1:G3)
  ws.mergeCells(`C${r}:G${r}`);
  const t1 = ws.getCell(`C${r}`);
  t1.value = "RELATÓRIO DE ENSAIO";
  t1.font = { name: "Calibri", size: 12.5, bold: true, underline: true, color: { argb: COLOR_BLACK } };
  t1.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(r).height = 24;
  r++;

  ws.mergeCells(`C${r}:G${r}`);
  const t2 = ws.getCell(`C${r}`);
  t2.value = title;
  t2.font = { name: "Calibri", size: 11.5, bold: true, color: { argb: COLOR_BLACK } };
  t2.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(r).height = 24;
  r++;

  ws.mergeCells(`C${r}:G${r}`);
  const t3 = ws.getCell(`C${r}`);
  t3.value = "ASTM D3080:2023 — Standard Test Method for Direct Shear Test of Soils Under Consolidated Drained Conditions";
  t3.font = { name: "Calibri", size: 9.5, italic: true, color: { argb: "FF475569" } };
  t3.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(r).height = 20;
  r++;

  // Bordas do quadro superior
  for (let rowI = startRow; rowI < r; rowI++) {
    for (let colI = 1; colI <= 7; colI++) {
      const c = ws.getRow(rowI).getCell(colI);
      c.border = {
        top: rowI === startRow ? { style: "medium", color: { argb: COLOR_BORDER } } : undefined,
        bottom: rowI === r - 1 ? { style: "thin", color: { argb: COLOR_BORDER } } : undefined,
        left: colI === 1 ? { style: "medium", color: { argb: COLOR_BORDER } } : colI === 3 ? { style: "thin", color: { argb: COLOR_BORDER } } : undefined,
        right: colI === 7 ? { style: "medium", color: { argb: COLOR_BORDER } } : colI === 2 ? { style: "thin", color: { argb: COLOR_BORDER } } : undefined,
      };
    }
  }

  // Tabela Cadastral Idêntica ao PDF (Altura 24pt)
  const addHeaderField = (
    l1: string, v1: any,
    l2: string, v2: any,
    l3: string, v3: any
  ) => {
    const row = ws.getRow(r);
    row.height = 24;

    // Coluna 1
    ws.getCell(`A${r}`).value = l1;
    ws.getCell(`A${r}`).font = { name: "Calibri", size: 10.5, bold: true, color: { argb: COLOR_BLACK } };
    ws.getCell(`A${r}`).alignment = { vertical: "middle" };
    ws.getCell(`A${r}`).border = borderBlack;
    ws.getCell(`B${r}`).value = v1 ?? "—";
    ws.getCell(`B${r}`).font = { name: "Calibri", size: 10.5 };
    ws.getCell(`B${r}`).alignment = { vertical: "middle" };
    ws.getCell(`B${r}`).border = borderBlack;

    // Coluna 2
    ws.getCell(`C${r}`).value = l2;
    ws.getCell(`C${r}`).font = { name: "Calibri", size: 10.5, bold: true, color: { argb: COLOR_BLACK } };
    ws.getCell(`C${r}`).alignment = { vertical: "middle" };
    ws.getCell(`C${r}`).border = borderBlack;
    ws.mergeCells(`D${r}:E${r}`);
    ws.getCell(`D${r}`).value = v2 ?? "—";
    ws.getCell(`D${r}`).font = { name: "Calibri", size: 10.5 };
    ws.getCell(`D${r}`).alignment = { vertical: "middle" };
    ws.getCell(`D${r}`).border = borderBlack;
    ws.getCell(`E${r}`).border = borderBlack;

    // Coluna 3
    ws.getCell(`F${r}`).value = l3;
    ws.getCell(`F${r}`).font = { name: "Calibri", size: 10.5, bold: true, color: { argb: COLOR_BLACK } };
    ws.getCell(`F${r}`).alignment = { vertical: "middle" };
    ws.getCell(`F${r}`).border = borderBlack;
    ws.getCell(`G${r}`).value = v3 ?? "—";
    ws.getCell(`G${r}`).font = { name: "Calibri", size: 10.5 };
    ws.getCell(`G${r}`).alignment = { vertical: "middle" };
    ws.getCell(`G${r}`).border = borderBlack;

    r++;
  };

  addHeaderField("Cliente:", sample.client, "Furo:", sample.borehole, "Prof. (m):", sample.depth);
  addHeaderField("Obra:", sample.workNumber, "Código:", sample.code, "O.S.:", sample.os);
  addHeaderField("Local:", sample.local, "Amostra:", sample.reportNumber, "Revisão:", sample.revision ?? "00");

  if (sample.coordN != null || sample.coordE != null || sample.coordCota != null) {
    addHeaderField("N (m):", sample.coordN, "E (m):", sample.coordE, "Cota (m):", sample.coordCota);
  }

  // Descrição Tátil-Visual
  ws.getRow(r).height = 25;
  ws.getCell(`A${r}`).value = "Descrição Tátil-Visual:";
  ws.getCell(`A${r}`).font = { name: "Calibri", size: 10.5, bold: true };
  ws.getCell(`A${r}`).alignment = { vertical: "middle" };
  ws.getCell(`A${r}`).border = borderBlack;
  ws.mergeCells(`B${r}:G${r}`);
  ws.getCell(`B${r}`).value = sample.description || "—";
  ws.getCell(`B${r}`).font = { name: "Calibri", size: 10.5, italic: true };
  ws.getCell(`B${r}`).alignment = { vertical: "middle" };
  for (let c = 2; c <= 7; c++) ws.getRow(r).getCell(c).border = borderBlack;
  r++;

  // Descrição Granulométrica + Folha
  ws.getRow(r).height = 25;
  ws.getCell(`A${r}`).value = "Descrição Granulométrica:";
  ws.getCell(`A${r}`).font = { name: "Calibri", size: 10.5, bold: true };
  ws.getCell(`A${r}`).alignment = { vertical: "middle" };
  ws.getCell(`A${r}`).border = borderBlack;
  ws.mergeCells(`B${r}:E${r}`);
  ws.getCell(`B${r}`).value = sample.granulometricDescription || "—";
  ws.getCell(`B${r}`).font = { name: "Calibri", size: 10.5, italic: true };
  ws.getCell(`B${r}`).alignment = { vertical: "middle" };
  for (let c = 2; c <= 5; c++) ws.getRow(r).getCell(c).border = borderBlack;

  ws.getCell(`F${r}`).value = "Folha:";
  ws.getCell(`F${r}`).font = { name: "Calibri", size: 10.5, bold: true };
  ws.getCell(`F${r}`).alignment = { vertical: "middle" };
  ws.getCell(`F${r}`).border = borderBlack;
  ws.getCell(`G${r}`).value = `${page} / ${total}`;
  ws.getCell(`G${r}`).font = { name: "Calibri", size: 10.5, bold: true };
  ws.getCell(`G${r}`).alignment = { horizontal: "center", vertical: "middle" };
  ws.getCell(`G${r}`).border = borderBlack;
  r++;

  return r;
}

/**
 * Adiciona a Barra de Seção Padrão Suporte INFRA (SectionBar - Altura 26pt)
 */
function addSectionBar(ws: ExcelJS.Worksheet, r: number, text: string): number {
  ws.mergeCells(`A${r}:G${r}`);
  const cell = ws.getCell(`A${r}`);
  cell.value = text;
  cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: COLOR_SECTION_TEXT } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_SECTION_BG } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = borderBlack;
  ws.getRow(r).height = 26;
  return r + 1;
}

/**
 * Adiciona o Rodapé Oficial com Assinatura Totalmente Travada em twoCell
 */
function addOfficialReportFooter(
  ws: ExcelJS.Worksheet,
  sample: CDSample,
  startRow: number,
  assinaturaImageId: number | null
): number {
  let r = startRow + 2;

  const spDate = new Date().toLocaleDateString("pt-BR", { dateStyle: "long" });

  const rTop = r;

  ws.getRow(rTop).height = 36;       // Linha da imagem de assinatura
  ws.getRow(rTop + 1).height = 20;   // Traço de assinatura
  ws.getRow(rTop + 2).height = 20;   // Rótulo Responsável Técnico
  ws.getRow(rTop + 3).height = 22;   // Nome e CREA
  ws.getRow(rTop + 4).height = 22;   // Gerente de Lab

  // Coluna Esquerda: A..C (Equipe Técnica)
  ws.mergeCells(`A${rTop}:C${rTop + 4}`);
  const fLeft = ws.getCell(`A${rTop}`);
  fLeft.value = `São Paulo, ${spDate}\nContrato nº ${sample.os || "—"} · Revisão ${sample.revision || "00"}\nOperador: ${sample.operator || "—"}  |  Digitado por: ${sample.typedBy || "—"}\nVerificado por: ${sample.verifiedBy || "Engº Cleitton Pereira"}\nGerente de Lab: Tecnº Geotécnico Carlos Christian da Silva`;
  fLeft.font = { name: "Calibri", size: 9.5, color: { argb: COLOR_BLACK } };
  fLeft.alignment = { horizontal: "left", vertical: "middle", wrapText: true };

  // Assinatura do Maurício centralizada em D..E com twoCell travado
  if (assinaturaImageId !== null) {
    ws.addImage(assinaturaImageId, {
      tl: { col: 3.3, row: rTop - 1 },
      br: { col: 4.7, row: rTop },
      editAs: "twoCell",
    } as any);
  }

  // Traço de Assinatura
  ws.mergeCells(`D${rTop + 1}:E${rTop + 1}`);
  const lineCell = ws.getCell(`D${rTop + 1}`);
  lineCell.value = "______________________________________";
  lineCell.font = { name: "Calibri", size: 9.5, bold: true, color: { argb: COLOR_BLACK } };
  lineCell.alignment = { horizontal: "center", vertical: "bottom" };

  // Rótulo Responsável Técnico
  ws.mergeCells(`D${rTop + 2}:E${rTop + 2}`);
  const titleResp = ws.getCell(`D${rTop + 2}`);
  titleResp.value = "Responsável Técnico";
  titleResp.font = { name: "Calibri", size: 9, color: { argb: "FF475569" } };
  titleResp.alignment = { horizontal: "center", vertical: "top" };

  // Nome e CREA
  ws.mergeCells(`D${rTop + 3}:E${rTop + 4}`);
  const nameResp = ws.getCell(`D${rTop + 3}`);
  nameResp.value = sample.technicalResp || "Eng. Antônio Sérgio Damasco Penna - CREA 0600459308";
  nameResp.font = { name: "Calibri", size: 9.5, bold: true, color: { argb: COLOR_BLACK } };
  nameResp.alignment = { horizontal: "center", vertical: "top" };

  // Coluna Direita: F..G (Nota)
  ws.mergeCells(`F${rTop}:G${rTop + 4}`);
  const fRight = ws.getCell(`F${rTop}`);
  fRight.value = "NOTA:\nOs resultados apresentados referem-se exclusivamente à amostra ensaiada. A reprodução deste documento somente poderá ser feita na íntegra, após aprovação prévia e por escrito da empresa.";
  fRight.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF475569" } };
  fRight.alignment = { horizontal: "left", vertical: "middle", wrapText: true };

  r = rTop + 5;

  // Barra Institucional Preta Inferior
  ws.mergeCells(`A${r}:G${r}`);
  const fBar = ws.getCell(`A${r}`);
  fBar.value = "SUPORTE INFRA — LABORATÓRIO DE ENSAIOS ESPECIAIS   |   Av. Camélia Borges Narciso, 582 · São Pedro/SP   |   www.suportesolos.com.br";
  fBar.font = { name: "Calibri", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
  fBar.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_BLACK } };
  fBar.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(r).height = 24;
  r++;

  // Carimbo de Data/Hora de Geração
  ws.mergeCells(`A${r}:G${r}`);
  const stampCell = ws.getCell(`A${r}`);
  const now = new Date();
  const stampStr = `Relatório gerado em: São Paulo, SP - Brasil · ${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  stampCell.value = stampStr;
  stampCell.font = { name: "Calibri", size: 8.5, color: { argb: "FF64748B" } };
  stampCell.alignment = { horizontal: "right", vertical: "middle" };
  ws.getRow(r).height = 18;
  r++;

  return r;
}

/**
 * Aplica configuração de página A4 pronta para impressão em qualquer impressora ou PDF
 */
function applyA4PageSetup(ws: ExcelJS.Worksheet) {
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.3,
      right: 0.3,
      top: 0.4,
      bottom: 0.4,
      header: 0.2,
      footer: 0.2,
    },
    showGridLines: true,
  };
}

/**
 * Constrói a planilha Excel completa no formato executivo espelho do laudo em PDF.
 */
export async function buildCDRawDataXlsxWorkbook({
  sample,
  specimens,
  results,
  envelope,
  photos = [],
  approvals = [],
  versions = [],
}: ExportCDParams): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Suporte INFRA";
  wb.lastModifiedBy = sample.operator || "Suporte INFRA";
  wb.created = new Date();
  wb.modified = new Date();

  // Imagens do Logo e da Assinatura
  const logoBase64 = await getImageBase64("/suporte-infra-logo.png");
  const assinaturaBase64 = await getImageBase64("/assinatura-mauricio.png");

  let logoImageId: number | null = null;
  let assinaturaImageId: number | null = null;

  if (logoBase64) logoImageId = wb.addImage({ base64: logoBase64, extension: "png" });
  if (assinaturaBase64) assinaturaImageId = wb.addImage({ base64: assinaturaBase64, extension: "png" });

  // Renderiza os gráficos de largura total
  const mohrChartB64 = generateMohrEnvelopeCanvas(results, specimens, envelope, 1100, 520);
  const stressStrainB64 = generateStressStrainCanvas(results, specimens, 1100, 480);
  const volChangeB64 = generateVolumeChangeCanvas(results, specimens, 1100, 480);

  let mohrChartId: number | null = null;
  let stressStrainId: number | null = null;
  let volChangeId: number | null = null;

  if (mohrChartB64) mohrChartId = wb.addImage({ base64: mohrChartB64, extension: "png" });
  if (stressStrainB64) stressStrainId = wb.addImage({ base64: stressStrainB64, extension: "png" });
  if (volChangeB64) volChangeId = wb.addImage({ base64: volChangeB64, extension: "png" });

  // Carrega imagens das fotos
  const photoImageIds: { [photoId: string]: number } = {};
  for (const p of photos) {
    if (p.dataUrl) {
      const b64 = await getImageBase64(p.dataUrl);
      if (b64) {
        const ext = p.dataUrl.includes("png") ? "png" : "jpeg";
        photoImageIds[p.id] = wb.addImage({ base64: b64, extension: ext });
      }
    }
  }

  const photoPagesCount = Math.max(1, Math.ceil(specimens.length / 3));
  const totalPages = 2 + specimens.length + photoPagesCount;
  const reportTitle = sample.testCondition === "inundado"
    ? "ENSAIO DE CISALHAMENTO DIRETO INUNDADO (CDinun)"
    : "ENSAIO DE CISALHAMENTO DIRETO NATURAL (CDnat)";

  // Colunas amplas para excelente legibilidade e sem quebra de texto
  const defaultColumns = [
    { width: 40 }, // A: Rótulos principais
    { width: 22 }, // B: Valores / Identificadores
    { width: 16 }, // C: Rótulos secundários
    { width: 22 }, // D: Valores secundários
    { width: 22 }, // E: Coluna intermediária
    { width: 18 }, // F: Rótulos laterais
    { width: 22 }, // G: Valores laterais
  ];

  // =========================================================================
  // ABA 1: LAUDO EXECUTIVO (Espelho Fiel do Relatório PDF)
  // =========================================================================
  const ws1 = wb.addWorksheet("Laudo Executivo");
  ws1.columns = defaultColumns;
  applyA4PageSetup(ws1);

  let r1 = addOfficialReportHeader(ws1, sample, reportTitle, 1, totalPages, logoImageId);
  ws1.getRow(r1).height = 14;
  r1++;

  // 1. Parâmetros e Condições do Ensaio
  r1 = addSectionBar(ws1, r1, "Parâmetros e Condições do Ensaio");

  const avgSpeed = specimens.length
    ? specimens.reduce((acc, s) => acc + (s.strainRate ?? 0.2), 0) / specimens.length
    : 0.2;

  const condRows = [
    ["Equipamento Utilizado", sample.equipment || "CISALHA-01"],
    ["Tipo do Ensaio", sample.testCondition === "inundado" ? "Cisalhamento Direto Inundado - CDinun" : "Cisalhamento Direto na Umidade Natural - CDnat"],
    ["Norma Adotada", "ASTM D3080:2023"],
    ["Tipo da Amostra", sample.sampleState === "indeformada" ? sample.sampleType || "Bloco Indeformado" : sample.sampleState === "compactada" ? `Compactada (${sample.compactionEnergy || "PN"})` : "Recompactada"],
    ["Condição do Ensaio", sample.testCondition === "inundado" ? "Inundado (Saturado por Imersão)" : "Umidade Natural"],
    ["Dimensões Características da Amostra", sample.geometry === "circular" ? `Caixa Circular - Diâmetro = ${sample.dimensionMm || 60} mm` : `Caixa Quadrada - Lado = ${sample.dimensionMm || 60} mm`],
    ["Número de Corpos de Prova", specimens.length],
    ["Correção de Área da Seção", sample.applyAreaCorrection !== false ? "Sim (ASTM D3080)" : "Não (Área Inicial Constante)"],
    ["Velocidade do Ensaio [mm/min]", fmt(avgSpeed, 2)],
  ];

  condRows.forEach(([lbl, val], idx) => {
    ws1.getRow(r1).height = 24;
    ws1.mergeCells(`A${r1}:C${r1}`);
    const cA = ws1.getCell(`A${r1}`);
    cA.value = lbl;
    cA.font = { name: "Calibri", size: 10.5, bold: true };
    cA.alignment = { vertical: "middle" };
    cA.border = borderBlack;
    if (idx % 2 === 1) cA.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };

    ws1.mergeCells(`D${r1}:G${r1}`);
    const cD = ws1.getCell(`D${r1}`);
    cD.value = val;
    cD.font = { name: "Calibri", size: 10.5 };
    cD.alignment = { vertical: "middle" };
    cD.border = borderBlack;
    if (idx % 2 === 1) cD.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };

    r1++;
  });

  ws1.getRow(r1).height = 14;
  r1++;

  // 2. Parâmetros de Resistência (Mohr-Coulomb) com Gráfico
  r1 = addSectionBar(ws1, r1, "Envoltória de Resistência (Strength Envelopes) — Mohr-Coulomb");

  ws1.mergeCells(`A${r1}:B${r1}`);
  ws1.getCell(`A${r1}`).value = "COESÃO EFETIVA";
  ws1.getCell(`A${r1}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF475569" } };
  ws1.getCell(`A${r1}`).alignment = { horizontal: "center", vertical: "middle" };
  ws1.getCell(`A${r1}`).border = borderBlack;

  ws1.mergeCells(`C${r1}:E${r1}`);
  ws1.getCell(`C${r1}`).value = "ÂNGULO DE ATRITO";
  ws1.getCell(`C${r1}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF475569" } };
  ws1.getCell(`C${r1}`).alignment = { horizontal: "center", vertical: "middle" };
  ws1.getCell(`C${r1}`).border = borderBlack;

  ws1.mergeCells(`F${r1}:G${r1}`);
  ws1.getCell(`F${r1}`).value = "COEF. DETERMINAÇÃO";
  ws1.getCell(`F${r1}`).font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF475569" } };
  ws1.getCell(`F${r1}`).alignment = { horizontal: "center", vertical: "middle" };
  ws1.getCell(`F${r1}`).border = borderBlack;
  ws1.getRow(r1).height = 22;
  r1++;

  ws1.getRow(r1).height = 28;
  ws1.mergeCells(`A${r1}:B${r1}`);
  ws1.getCell(`A${r1}`).value = envelope ? `c' = ${fmt(envelope.c, 2)} kPa` : "—";
  ws1.getCell(`A${r1}`).font = { name: "Calibri", size: 12.5, bold: true };
  ws1.getCell(`A${r1}`).alignment = { horizontal: "center", vertical: "middle" };
  ws1.getCell(`A${r1}`).border = borderBlack;

  ws1.mergeCells(`C${r1}:E${r1}`);
  ws1.getCell(`C${r1}`).value = envelope ? `φ' = ${fmt(envelope.phiDeg, 2)}°` : "—";
  ws1.getCell(`C${r1}`).font = { name: "Calibri", size: 12.5, bold: true };
  ws1.getCell(`C${r1}`).alignment = { horizontal: "center", vertical: "middle" };
  ws1.getCell(`C${r1}`).border = borderBlack;

  ws1.mergeCells(`F${r1}:G${r1}`);
  ws1.getCell(`F${r1}`).value = envelope ? `R² = ${fmt(envelope.r2, 3)}` : "—";
  ws1.getCell(`F${r1}`).font = { name: "Calibri", size: 12.5, bold: true };
  ws1.getCell(`F${r1}`).alignment = { horizontal: "center", vertical: "middle" };
  ws1.getCell(`F${r1}`).border = borderBlack;
  r1++;

  // Inserção do Gráfico de Mohr-Coulomb com twoCell travado de A a G
  if (mohrChartId !== null) {
    ws1.getRow(r1).height = 10;
    r1++;
    const chartStartRow = r1;
    const chartEndRow = r1 + 17;
    for (let i = chartStartRow; i <= chartEndRow; i++) { ws1.getRow(i).height = 22; }
    ws1.addImage(mohrChartId, {
      tl: { col: 0.05, row: chartStartRow - 1 },
      br: { col: 6.95, row: chartEndRow },
      editAs: "twoCell",
    } as any);
    r1 = chartEndRow + 1;
    ws1.getRow(r1).height = 14;
    r1++;
  }

  // 3. Tabela Resumo dos Resultados por CP
  r1 = addSectionBar(ws1, r1, "Resumo dos Resultados e Índices Físicos dos Corpos de Prova");

  const tableHeaderRow = ws1.getRow(r1);
  tableHeaderRow.height = 26;
  ws1.getCell(`A${r1}`).value = "Propriedade / Índice Físico";
  ws1.getCell(`A${r1}`).font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
  ws1.getCell(`A${r1}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_BLACK } };
  ws1.getCell(`A${r1}`).alignment = { vertical: "middle" };
  ws1.getCell(`A${r1}`).border = borderBlack;

  ws1.getCell(`B${r1}`).value = "Símbolo";
  ws1.getCell(`B${r1}`).font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
  ws1.getCell(`B${r1}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_BLACK } };
  ws1.getCell(`B${r1}`).alignment = { horizontal: "center", vertical: "middle" };
  ws1.getCell(`B${r1}`).border = borderBlack;

  ws1.getCell(`C${r1}`).value = "Unidade";
  ws1.getCell(`C${r1}`).font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
  ws1.getCell(`C${r1}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_BLACK } };
  ws1.getCell(`C${r1}`).alignment = { horizontal: "center", vertical: "middle" };
  ws1.getCell(`C${r1}`).border = borderBlack;

  specimens.forEach((cp, i) => {
    const colLetter = String.fromCharCode(68 + i);
    const cell = ws1.getCell(`${colLetter}${r1}`);
    cell.value = `${cp.displayId ?? cp.id} (σn = ${fmt(cp.normalStressTarget, 0)} kPa)`;
    cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_BLACK } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = borderBlack;
  });
  r1++;

  const rowsData: [string, string, string, (res: CDSpecimenResults) => number | "—"][] = [
    ["Tensão Normal Efetiva Aplicada", "σ'n", "kPa", (res: CDSpecimenResults) => fmt(res.sigmaN, 0)],
    ["Diâmetro / Dimensão Inicial", "D₀", "mm", (res: CDSpecimenResults) => fmt(res.D0, 2)],
    ["Altura Inicial", "H₀", "mm", (res: CDSpecimenResults) => fmt(res.H0, 2)],
    ["Área da Seção Transversal Inicial", "A₀", "cm²", (res: CDSpecimenResults) => fmt(res.area0, 2)],
    ["Volume Inicial", "V₀", "cm³", (res: CDSpecimenResults) => fmt(res.volume0, 2)],
    ["Massa Úmida Inicial", "M_um", "g", (res: CDSpecimenResults) => fmt(res.wetMass, 2)],
    ["Massa Específica Natural", "ρn", "g/cm³", (res: CDSpecimenResults) => fmt(res.wetDensity, 3)],
    ["Massa Específica Seca", "ρd", "g/cm³", (res: CDSpecimenResults) => fmt(res.dryDensity, 3)],
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
    ws1.getRow(r1).height = 24;
    const isZebra = idx % 2 === 1;

    const cA = ws1.getCell(`A${r1}`);
    cA.value = label;
    cA.font = { name: "Calibri", size: 10.5 };
    cA.alignment = { vertical: "middle" };
    cA.border = borderBlack;
    if (isZebra) cA.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };

    const cB = ws1.getCell(`B${r1}`);
    cB.value = sym;
    cB.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: "FF475569" } };
    cB.alignment = { horizontal: "center", vertical: "middle" };
    cB.border = borderBlack;
    if (isZebra) cB.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };

    const cC = ws1.getCell(`C${r1}`);
    cC.value = unit;
    cC.font = { name: "Calibri", size: 10.5, color: { argb: "FF64748B" } };
    cC.alignment = { horizontal: "center", vertical: "middle" };
    cC.border = borderBlack;
    if (isZebra) cC.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };

    specimens.forEach((_, i) => {
      const colLetter = String.fromCharCode(68 + i);
      const res = results[i];
      const val = res ? fn(res) : "—";
      const cCell = ws1.getCell(`${colLetter}${r1}`);
      cCell.value = val;
      cCell.font = { name: "Calibri", size: 10.5, bold: label.includes("Tensão") || label.includes("Pico") };
      cCell.alignment = { horizontal: "right", vertical: "middle" };
      cCell.border = borderBlack;
      if (isZebra) cCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };
    });

    r1++;
  });

  r1 = addOfficialReportFooter(ws1, sample, r1, assinaturaImageId);

  // =========================================================================
  // ABA 2: CURVAS & GRÁFICOS (Com twoCell Travado Sem Sobreposição)
  // =========================================================================
  const wsCharts = wb.addWorksheet("Curvas & Gráficos");
  wsCharts.columns = defaultColumns;
  applyA4PageSetup(wsCharts);

  let rC = addOfficialReportHeader(wsCharts, sample, reportTitle, 2, totalPages, logoImageId);
  wsCharts.getRow(rC).height = 14;
  rC++;

  if (stressStrainId !== null) {
    rC = addSectionBar(wsCharts, rC, "Tensão Cisalhante (τ) vs. Deformação Horizontal (εh)");
    wsCharts.getRow(rC).height = 10;
    rC++;
    const g1Start = rC;
    const g1End = rC + 15;
    for (let i = g1Start; i <= g1End; i++) { wsCharts.getRow(i).height = 22; }
    wsCharts.addImage(stressStrainId, {
      tl: { col: 0.05, row: g1Start - 1 },
      br: { col: 6.95, row: g1End },
      editAs: "twoCell",
    } as any);
    rC = g1End + 1;
    wsCharts.getRow(rC).height = 14;
    rC++;
  }

  if (volChangeId !== null) {
    rC = addSectionBar(wsCharts, rC, "Variação Volumétrica — Deslocamento Vertical (δv) vs. Deformação Horizontal (εh)");
    wsCharts.getRow(rC).height = 10;
    rC++;
    const g2Start = rC;
    const g2End = rC + 15;
    for (let i = g2Start; i <= g2End; i++) { wsCharts.getRow(i).height = 22; }
    wsCharts.addImage(volChangeId, {
      tl: { col: 0.05, row: g2Start - 1 },
      br: { col: 6.95, row: g2End },
      editAs: "twoCell",
    } as any);
    rC = g2End + 1;
    wsCharts.getRow(rC).height = 14;
    rC++;
  }

  rC = addOfficialReportFooter(wsCharts, sample, rC, assinaturaImageId);

  // =========================================================================
  // ABAS INDIVIDUAIS COMPLETAS POR CP
  // =========================================================================
  specimens.forEach((cp, idx) => {
    const cpName = cp.displayId ?? `CP-0${idx + 1}`;
    const res = results[idx];
    const pageNum = 3 + idx;

    const wsCP = wb.addWorksheet(`${cpName} (${cp.normalStressTarget}kPa)`);
    wsCP.columns = defaultColumns;
    applyA4PageSetup(wsCP);

    let rCP = addOfficialReportHeader(wsCP, sample, `${reportTitle} — ${cpName}`, pageNum, totalPages, logoImageId);
    wsCP.getRow(rCP).height = 14;
    rCP++;

    // 1. Dados de Moldagem e Dimensões Iniciais
    rCP = addSectionBar(wsCP, rCP, `1. Moldagem e Dimensões Iniciais — ${cpName} (σn = ${cp.normalStressTarget} kPa)`);

    const moldGrid = [
      ["Identificação do Anel:", cp.ringId || `ANEL-0${idx + 1}`, "Massa do Anel (g):", fmt(cp.ringMass, 2)],
      ["Massa CP + Anel (g):", fmt(cp.wetMassCPAnel, 2), "Massa Úmida do Solo (g):", fmt(res?.wetMass ?? cp.wetMass, 2)],
      ["Altura Inicial H₀ (mm):", fmt(cp.height0Mm, 2), "Diâmetro / Lado D₀ (mm):", fmt(cp.diameterMm || sample.dimensionMm, 2)],
      ["Área Inicial A₀ (cm²):", fmt(res?.area0, 2), "Volume Inicial V₀ (cm³):", fmt(res?.volume0, 2)],
      ["Massa Específica Natural ρn (g/cm³):", fmt(res?.wetDensity, 3), "Massa Específica Seca ρd (g/cm³):", fmt(res?.dryDensity, 3)],
      ["Índice de Vazios Inicial e₀:", fmt(res?.voidRatio0, 3), "Grau de Saturação Inicial Sr₀ (%):", fmt(res?.saturation0Pct, 1)],
    ];

    moldGrid.forEach(([l1, v1, l2, v2], idxM) => {
      wsCP.getRow(rCP).height = 24;
      const isZebra = idxM % 2 === 1;

      const cA = wsCP.getCell(`A${rCP}`);
      cA.value = l1;
      cA.font = { name: "Calibri", size: 10.5, bold: true };
      cA.alignment = { vertical: "middle" };
      cA.border = borderBlack;
      if (isZebra) cA.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };

      wsCP.mergeCells(`B${rCP}:C${rCP}`);
      const cB = wsCP.getCell(`B${rCP}`);
      cB.value = v1;
      cB.font = { name: "Calibri", size: 10.5 };
      cB.alignment = { vertical: "middle" };
      cB.border = borderBlack;
      wsCP.getCell(`C${rCP}`).border = borderBlack;
      if (isZebra) {
        cB.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };
        wsCP.getCell(`C${rCP}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };
      }

      wsCP.mergeCells(`D${rCP}:E${rCP}`);
      const cD = wsCP.getCell(`D${rCP}`);
      cD.value = l2;
      cD.font = { name: "Calibri", size: 10.5, bold: true };
      cD.alignment = { vertical: "middle" };
      cD.border = borderBlack;
      wsCP.getCell(`E${rCP}`).border = borderBlack;
      if (isZebra) {
        cD.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };
        wsCP.getCell(`E${rCP}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };
      }

      wsCP.mergeCells(`F${rCP}:G${rCP}`);
      const cF = wsCP.getCell(`F${rCP}`);
      cF.value = v2;
      cF.font = { name: "Calibri", size: 10.5 };
      cF.alignment = { vertical: "middle" };
      cF.border = borderBlack;
      wsCP.getCell(`G${rCP}`).border = borderBlack;
      if (isZebra) {
        cF.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };
        wsCP.getCell(`G${rCP}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };
      }

      rCP++;
    });

    wsCP.getRow(rCP).height = 14;
    rCP++;

    // 2. Cápsulas de Umidade Inicial (w0)
    rCP = addSectionBar(wsCP, rCP, "2. Cápsulas de Umidade Inicial (w₀)");

    const cHeaders = ["Cápsula Nº", "Tara (g)", "Solo Úmido + Tara (g)", "Solo Seco + Tara (g)", "Massa Água (g)", "Massa Solo Seco (g)", "Teor de Umidade (%)"];
    wsCP.getRow(rCP).height = 26;
    cHeaders.forEach((h, hI) => {
      const c = wsCP.getCell(rCP, hI + 1);
      c.value = h;
      c.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_BLACK } };
      c.border = borderBlack;
      c.alignment = { horizontal: "center", vertical: "middle" };
    });
    rCP++;

    (cp.capsules || []).forEach((c, cIdx) => {
      wsCP.getRow(rCP).height = 24;
      const isZebra = cIdx % 2 === 1;
      const mw = (c.wet || 0) - (c.dry || 0);
      const ms = (c.dry || 0) - (c.tara || 0);
      const w = ms > 0 ? (mw / ms) * 100 : 0;
      const row = [c.numero || `Cáp-${cIdx + 1}`, fmt(c.tara, 2), fmt(c.wet, 2), fmt(c.dry, 2), fmt(mw, 2), fmt(ms, 2), fmt(w, 2)];
      row.forEach((v, i) => {
        const cell = wsCP.getCell(rCP, i + 1);
        cell.value = v;
        cell.font = { name: "Calibri", size: 10.5 };
        cell.border = borderBlack;
        cell.alignment = { horizontal: i === 0 ? "center" : "right", vertical: "middle" };
        if (isZebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };
      });
      rCP++;
    });

    wsCP.getRow(rCP).height = 24;
    wsCP.mergeCells(`A${rCP}:F${rCP}`);
    const lCap = wsCP.getCell(`A${rCP}`);
    lCap.value = "Umidade Inicial Média w₀ (%):";
    lCap.font = { name: "Calibri", size: 10.5, bold: true };
    lCap.alignment = { horizontal: "right", vertical: "middle" };
    lCap.border = borderBlack;
    const vCap = wsCP.getCell(`G${rCP}`);
    vCap.value = fmt(res?.moisture0Pct ?? averageMoisturePct(cp.capsules), 2);
    vCap.font = { name: "Calibri", size: 10.5, bold: true };
    vCap.alignment = { horizontal: "right", vertical: "middle" };
    vCap.border = borderBlack;
    rCP++;

    wsCP.getRow(rCP).height = 14;
    rCP++;

    // 3. Adensamento Vertical
    rCP = addSectionBar(wsCP, rCP, `3. Adensamento Vertical (σn = ${cp.normalStressTarget} kPa)`);

    const consHeaders = ["Leitura Nº", "Tempo (min)", "√t (min½)", "Recalque Vertical Δh (mm)", "Altura Atual H (mm)", "Índice de Vazios e", "Status"];
    wsCP.getRow(rCP).height = 26;
    consHeaders.forEach((h, hI) => {
      const c = wsCP.getCell(rCP, hI + 1);
      c.value = h;
      c.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_BLACK } };
      c.border = borderBlack;
      c.alignment = { horizontal: "center", vertical: "middle" };
    });
    rCP++;

    const consData = cp.consolidationData || [];
    if (consData.length === 0) {
      wsCP.getRow(rCP).height = 24;
      wsCP.mergeCells(`A${rCP}:G${rCP}`);
      const emptyCell = wsCP.getCell(`A${rCP}`);
      emptyCell.value = "Etapa de adensamento realizada de forma contínua.";
      emptyCell.font = { name: "Calibri", size: 10.5, italic: true };
      emptyCell.alignment = { vertical: "middle" };
      emptyCell.border = borderBlack;
      rCP++;
    } else {
      consData.forEach((p, pIdx) => {
        wsCP.getRow(rCP).height = 24;
        const isZebra = pIdx % 2 === 1;
        const curH = (cp.height0Mm || 20) - (p.settlementMm || 0);
        const curE = res ? (curH / res.H0) * (1 + res.voidRatio0) - 1 : 0;
        const row = [pIdx + 1, fmt(p.timeMin, 1), fmt(Math.sqrt(Math.max(0, p.timeMin)), 2), fmt(p.settlementMm, 4), fmt(curH, 3), fmt(curE, 3), "Estabilizado"];
        row.forEach((v, i) => {
          const cell = wsCP.getCell(rCP, i + 1);
          cell.value = v;
          cell.font = { name: "Calibri", size: 10.5 };
          cell.border = borderBlack;
          cell.alignment = { horizontal: i === 0 || i === 6 ? "center" : "right", vertical: "middle" };
          if (isZebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };
        });
        rCP++;
      });
    }

    wsCP.getRow(rCP).height = 24;
    wsCP.mergeCells(`A${rCP}:D${rCP}`);
    const lCons = wsCP.getCell(`A${rCP}`);
    lCons.value = "Recalque Total de Adensamento (Δh):";
    lCons.font = { name: "Calibri", size: 10.5, bold: true };
    lCons.alignment = { horizontal: "right", vertical: "middle" };
    lCons.border = borderBlack;

    const vCons1 = wsCP.getCell(`E${rCP}`);
    vCons1.value = fmt(res ? res.H0 - res.heightAfterCons : 0, 3) + " mm";
    vCons1.font = { name: "Calibri", size: 10.5, bold: true };
    vCons1.alignment = { horizontal: "right", vertical: "middle" };
    vCons1.border = borderBlack;

    const vCons2 = wsCP.getCell(`F${rCP}`);
    vCons2.value = "ec = " + fmt(res?.voidRatioAfterCons, 3);
    vCons2.font = { name: "Calibri", size: 10.5, bold: true };
    vCons2.alignment = { horizontal: "center", vertical: "middle" };
    vCons2.border = borderBlack;
    wsCP.getCell(`G${rCP}`).border = borderBlack;
    rCP++;

    wsCP.getRow(rCP).height = 14;
    rCP++;

    // 4. Leituras de Cisalhamento Passo a Passo
    rCP = addSectionBar(wsCP, rCP, "4. Leituras da Etapa de Cisalhamento Passo a Passo");

    const sStepHeaders = ["Ponto Nº", "Disp. Horiz. (mm)", "Deformação Horiz. (%)", "Carga (kgf)", "Recalque Vert. (mm)", "Área Corrigida (cm²)", "Tensão Cisalhante τ (kPa)"];
    wsCP.getRow(rCP).height = 26;
    sStepHeaders.forEach((h, hI) => {
      const c = wsCP.getCell(rCP, hI + 1);
      c.value = h;
      c.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_BLACK } };
      c.border = borderBlack;
      c.alignment = { horizontal: "center", vertical: "middle" };
    });
    rCP++;

    (cp.shearData || []).forEach((reading, pIdx) => {
      wsCP.getRow(rCP).height = 24;
      const isZebra = pIdx % 2 === 1;
      const calcPt = res?.curve?.[pIdx];
      const forceN = reading.loadKgf != null ? reading.loadKgf * 9.80665 : reading.shearForce;
      const loadKgf = reading.loadKgf != null ? reading.loadKgf : forceN / 9.80665;

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
        const cell = wsCP.getCell(rCP, i + 1);
        cell.value = v;
        cell.font = { name: "Calibri", size: 10.5 };
        cell.border = borderBlack;
        cell.alignment = { horizontal: i === 0 ? "center" : "right", vertical: "middle" };
        if (isZebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };
      });
      rCP++;
    });

    wsCP.getRow(rCP).height = 14;
    rCP++;

    // 5. Cápsulas de Umidade Final (wf)
    rCP = addSectionBar(wsCP, rCP, "5. Cápsulas de Umidade Final (Pós-Ruptura wf)");

    wsCP.getRow(rCP).height = 26;
    cHeaders.forEach((h, hI) => {
      const c = wsCP.getCell(rCP, hI + 1);
      c.value = h;
      c.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_BLACK } };
      c.border = borderBlack;
      c.alignment = { horizontal: "center", vertical: "middle" };
    });
    rCP++;

    (cp.finalCapsules || []).forEach((c, cIdx) => {
      wsCP.getRow(rCP).height = 24;
      const isZebra = cIdx % 2 === 1;
      const mw = (c.wet || 0) - (c.dry || 0);
      const ms = (c.dry || 0) - (c.tara || 0);
      const w = ms > 0 ? (mw / ms) * 100 : 0;
      const row = [c.numero || `Cáp-F${cIdx + 1}`, fmt(c.tara, 2), fmt(c.wet, 2), fmt(c.dry, 2), fmt(mw, 2), fmt(ms, 2), fmt(w, 2)];
      row.forEach((v, i) => {
        const cell = wsCP.getCell(rCP, i + 1);
        cell.value = v;
        cell.font = { name: "Calibri", size: 10.5 };
        cell.border = borderBlack;
        cell.alignment = { horizontal: i === 0 ? "center" : "right", vertical: "middle" };
        if (isZebra) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };
      });
      rCP++;
    });

    wsCP.getRow(rCP).height = 24;
    wsCP.mergeCells(`A${rCP}:F${rCP}`);
    const lCapF = wsCP.getCell(`A${rCP}`);
    lCapF.value = "Umidade Final Média wf (%):";
    lCapF.font = { name: "Calibri", size: 10.5, bold: true };
    lCapF.alignment = { horizontal: "right", vertical: "middle" };
    lCapF.border = borderBlack;
    const vCapF = wsCP.getCell(`G${rCP}`);
    vCapF.value = fmt(res?.moistureFinalPct ?? averageMoisturePct(cp.finalCapsules), 2);
    vCapF.font = { name: "Calibri", size: 10.5, bold: true };
    vCapF.alignment = { horizontal: "right", vertical: "middle" };
    vCapF.border = borderBlack;
    rCP++;

    wsCP.getRow(rCP).height = 14;
    rCP++;

    // 6. Resumo dos Resultados do CP
    rCP = addSectionBar(wsCP, rCP, "6. Resumo dos Parâmetros de Ruptura do Corpo de Prova");

    const sumRows = [
      ["Tensão Normal Aplicada σn:", fmt(res?.sigmaN, 0) + " kPa", "Tensão Cisalhante de Pico τ_pico:", fmt(res?.tauPeak, 2) + " kPa"],
      ["Deformação Horizontal na Ruptura εh_rup:", fmt(res?.horizStrainAtFailurePct, 2) + " %", "Tensão Cisalhante Residual τ_res:", fmt(res?.tauResidual, 2) + " kPa"],
      ["Deslocamento Vertical na Ruptura δv_rup:", fmt(res?.vertDispAtFailureMm, 3) + " mm", "Grau de Saturação Final Srf:", fmt(res?.saturationFinalPct, 1) + " %"],
    ];

    sumRows.forEach(([l1, v1, l2, v2], idxS) => {
      wsCP.getRow(rCP).height = 24;
      const isZebra = idxS % 2 === 1;

      const cA = wsCP.getCell(`A${rCP}`);
      cA.value = l1;
      cA.font = { name: "Calibri", size: 10.5, bold: true };
      cA.alignment = { vertical: "middle" };
      cA.border = borderBlack;
      if (isZebra) cA.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };

      wsCP.mergeCells(`B${rCP}:C${rCP}`);
      const cB = wsCP.getCell(`B${rCP}`);
      cB.value = v1;
      cB.font = { name: "Calibri", size: 10.5 };
      cB.alignment = { vertical: "middle" };
      cB.border = borderBlack;
      wsCP.getCell(`C${rCP}`).border = borderBlack;
      if (isZebra) {
        cB.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };
        wsCP.getCell(`C${rCP}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };
      }

      wsCP.mergeCells(`D${rCP}:E${rCP}`);
      const cD = wsCP.getCell(`D${rCP}`);
      cD.value = l2;
      cD.font = { name: "Calibri", size: 10.5, bold: true };
      cD.alignment = { vertical: "middle" };
      cD.border = borderBlack;
      wsCP.getCell(`E${rCP}`).border = borderBlack;
      if (isZebra) {
        cD.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };
        wsCP.getCell(`E${rCP}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };
      }

      wsCP.mergeCells(`F${rCP}:G${rCP}`);
      const cF = wsCP.getCell(`F${rCP}`);
      cF.value = v2;
      cF.font = { name: "Calibri", size: 10.5 };
      cF.alignment = { vertical: "middle" };
      cF.border = borderBlack;
      wsCP.getCell(`G${rCP}`).border = borderBlack;
      if (isZebra) {
        cF.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };
        wsCP.getCell(`G${rCP}`).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ZEBRA } };
      }

      rCP++;
    });

    rCP = addOfficialReportFooter(wsCP, sample, rCP, assinaturaImageId);
  });

  // =========================================================================
  // ABA(S) FINAL(IS): REGISTRO FOTOGRÁFICO (3 CPs por folha)
  // =========================================================================
  for (let pIdx = 0; pIdx < photoPagesCount; pIdx++) {
    const cpsForPage = specimens.slice(pIdx * 3, pIdx * 3 + 3);
    const sheetName = photoPagesCount === 1 ? "Registro Fotográfico" : `Registro Fotográfico (${pIdx + 1})`;
    const pageNum = 2 + specimens.length + pIdx + 1;

    const wsPhotos = wb.addWorksheet(sheetName);
    wsPhotos.columns = defaultColumns;
    applyA4PageSetup(wsPhotos);

    let rPh = addOfficialReportHeader(wsPhotos, sample, `${reportTitle} — Registro Fotográfico`, pageNum, totalPages, logoImageId);
    wsPhotos.getRow(rPh).height = 14;
    rPh++;

    rPh = addSectionBar(wsPhotos, rPh, photoPagesCount > 1 ? `Registro Fotográfico do Ensaio — Parte ${pIdx + 1}` : "Registro Fotográfico do Ensaio");
    wsPhotos.getRow(rPh).height = 10;
    rPh++;

    // SEÇÃO 1: FOTOS DE MOLDAGEM
    rPh = addSectionBar(wsPhotos, rPh, "Etapa de Moldagem / Aspecto Inicial");
    wsPhotos.getRow(rPh).height = 10;
    rPh++;

    const mImgStart = rPh;
    const mImgEnd = rPh + 11;
    for (let i = mImgStart; i <= mImgEnd; i++) { wsPhotos.getRow(i).height = 22; }

    cpsForPage.forEach((cp, i) => {
      const p = photos.find((x) => (x.specimenId === cp.id || x.specimenId === cp.displayId) && x.kind === "moldagem");
      const colStart = i === 0 ? 0.1 : i === 1 ? 2.4 : 4.9;
      const colEnd = i === 0 ? 1.9 : i === 1 ? 4.6 : 6.9;

      if (p && photoImageIds[p.id]) {
        wsPhotos.addImage(photoImageIds[p.id], {
          tl: { col: colStart, row: mImgStart - 1 },
          br: { col: colEnd, row: mImgEnd },
          editAs: "twoCell",
        } as any);
      }
    });

    rPh = mImgEnd + 1;
    wsPhotos.getRow(rPh).height = 26;
    cpsForPage.forEach((cp, i) => {
      const cellStart = i === 0 ? "A" : i === 1 ? "C" : "F";
      const cellEnd = i === 0 ? "B" : i === 1 ? "E" : "G";
      wsPhotos.mergeCells(`${cellStart}${rPh}:${cellEnd}${rPh}`);
      const legCell = wsPhotos.getCell(`${cellStart}${rPh}`);
      legCell.value = `${cp.displayId ?? cp.id} (σn = ${fmt(cp.normalStressTarget, 0)} kPa)`;
      legCell.font = { name: "Calibri", size: 10.5, bold: true };
      legCell.alignment = { horizontal: "center", vertical: "middle" };
      legCell.border = borderBlack;
    });
    rPh++;

    wsPhotos.getRow(rPh).height = 14;
    rPh++;

    // SEÇÃO 2: FOTOS DE RUPTURA
    rPh = addSectionBar(wsPhotos, rPh, "Após Ruptura / Plano de Cisalhamento");
    wsPhotos.getRow(rPh).height = 10;
    rPh++;

    const rupStart = rPh;
    const rupEnd = rPh + 11;
    for (let i = rupStart; i <= rupEnd; i++) { wsPhotos.getRow(i).height = 22; }

    cpsForPage.forEach((cp, i) => {
      const p = photos.find((x) => (x.specimenId === cp.id || x.specimenId === cp.displayId) && x.kind === "ruptura");
      const colStart = i === 0 ? 0.1 : i === 1 ? 2.4 : 4.9;
      const colEnd = i === 0 ? 1.9 : i === 1 ? 4.6 : 6.9;

      if (p && photoImageIds[p.id]) {
        wsPhotos.addImage(photoImageIds[p.id], {
          tl: { col: colStart, row: rupStart - 1 },
          br: { col: colEnd, row: rupEnd },
          editAs: "twoCell",
        } as any);
      }
    });

    rPh = rupEnd + 1;
    wsPhotos.getRow(rPh).height = 26;
    cpsForPage.forEach((cp, i) => {
      const cellStart = i === 0 ? "A" : i === 1 ? "C" : "F";
      const cellEnd = i === 0 ? "B" : i === 1 ? "E" : "G";
      wsPhotos.mergeCells(`${cellStart}${rPh}:${cellEnd}${rPh}`);
      const legCell = wsPhotos.getCell(`${cellStart}${rPh}`);
      legCell.value = `${cp.displayId ?? cp.id} (σn = ${fmt(cp.normalStressTarget, 0)} kPa)`;
      legCell.font = { name: "Calibri", size: 10.5, bold: true };
      legCell.alignment = { horizontal: "center", vertical: "middle" };
      legCell.border = borderBlack;
    });
    rPh++;

    rPh = addOfficialReportFooter(wsPhotos, sample, rPh, assinaturaImageId);
  }

  return wb;
}

/**
 * Gera o arquivo XLSX e retorna o nome e conteúdo em base64 (para upload no Drive).
 */
export async function getCDRawDataXlsxBase64(params: ExportCDParams): Promise<{ filename: string; base64: string }> {
  const wb = await buildCDRawDataXlsxWorkbook(params);
  const buffer = await wb.xlsx.writeBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  const baseName = (params.sample.workNumber || params.sample.os || params.sample.reportNumber || "relatorio")
    .toString()
    .replace(/[^\w-]+/g, "_");
  const filename = params.filename || `Cisalhamento-Direto_${baseName}_LaudoExecutivo.xlsx`;
  return { filename, base64 };
}

/**
 * Exporta e baixa o arquivo Excel diretamente no navegador.
 */
export async function exportCDRawDataXlsx(params: ExportCDParams) {
  const wb = await buildCDRawDataXlsxWorkbook(params);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const baseName = (params.sample.workNumber || params.sample.os || params.sample.reportNumber || "relatorio")
    .toString()
    .replace(/[^\w-]+/g, "_");
  a.download = params.filename || `Cisalhamento-Direto_${baseName}_LaudoExecutivo.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
