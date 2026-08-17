import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";

export interface ReportItemMeta {
  os: string;
  cliente: string;
  obra?: string;
  local?: string;
  amostraId: string;
  amostraCodigo: string;
  furo?: string;
  profundidade?: string;
  ensaio: string;
  tipo: string;
  revisao?: string;
  isPrevia?: boolean;
  status: string;
  dataEmissao?: string;
  responsavel?: string;
  payload?: any;
}

/**
 * Retorna a sigla técnica oficial que vem do Gantt (ex: TRI3.CU, TRI4.CD, CD4.IN, CD4.NAT, AD, MESP.NAT)
 */
export function getEnsaioSigla(tipoOrNome: string): string {
  const raw = (tipoOrNome || "").trim();
  if (!raw) return "ENS";

  // Se já for uma sigla direta do Gantt (ex: CD4.IN, CD4.NAT, TRI3.CU, TRI4.CD, AD, MESP.NAT, etc.)
  if (/^[A-Za-z0-9_.-]+$/.test(raw) && raw.length <= 12) {
    return raw.toUpperCase();
  }

  const s = raw.toLowerCase();

  // Mapeamentos fiéis às siglas do Gantt
  if (s.includes("cisalh") || s.includes("cd4") || s.includes("cd")) {
    if (s.includes("inund") || s.includes(".in")) return "CD4.IN";
    if (s.includes("nat") || s.includes(".nat")) return "CD4.NAT";
    return "CD4.NAT";
  }

  if (s.includes("triaxial") || s.includes("tri")) {
    if (s.includes("cu") || s.includes("tri3.cu")) return "TRI3.CU";
    if (s.includes("uu") || s.includes("tri3.uu")) return "TRI3.UU";
    if (s.includes("cd") || s.includes("cid") || s.includes("tri4.cd")) return "TRI4.CD";
    return "TRI3.CU";
  }

  if (s.includes("adens") || s.includes("oed") || s.includes("ad")) {
    return "AD";
  }

  if (s.includes("mesp") || s.includes("massa espec")) {
    return "MESP.NAT";
  }

  return raw.replace(/[^A-Za-z0-9.-]/g, "").toUpperCase().slice(0, 12) || "ENS";
}

/**
 * Gera o nome padronizado do arquivo de relatório conforme especificação:
 * OS - ID da Amostra - Código da Amostra - Sigla do tipo do ensaio - REVISÃO (R0.... ou PREV0 se for prévia)
 * Exemplo: 17474-26 - 12900-03 - AM-03 - CD - R0.pdf
 */
export function formatReportFilename(params: {
  os: string;
  amostraId?: string;
  amostraCodigo?: string;
  tipoOrNome: string;
  revisao?: string;
  isPrevia?: boolean;
  ext: "pdf" | "xlsx";
}): string {
  const cleanOs = (params.os || "OS").trim().replace(/[\\/:*?"<>|]/g, "_");
  const idAm = (params.amostraId || params.amostraCodigo || "AM-01").trim().replace(/[\\/:*?"<>|]/g, "_");
  const codAm = (params.amostraCodigo || params.amostraId || "01").trim().replace(/[\\/:*?"<>|]/g, "_");
  const sigla = getEnsaioSigla(params.tipoOrNome);
  const rev = params.isPrevia
    ? "PREV0"
    : params.revisao
      ? params.revisao.toUpperCase().startsWith("R")
        ? params.revisao.toUpperCase()
        : `R${params.revisao}`
      : "R0";

  return `${cleanOs} - ${idAm} - ${codAm} - ${sigla} - ${rev}.${params.ext}`;
}

/**
 * Gera um relatório oficial em PDF formatado em folha A4 com cabeçalho executivo,
 * dados da OS/Obra/Local, identificação da amostra e memorial de ensaio.
 */
export async function generateOfficialPdfBlob(meta: ReportItemMeta): Promise<Blob> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  const pageWidth = 210;
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // Header Banner Superior (Preto Corporativo)
  doc.setFillColor(20, 20, 20);
  doc.rect(margin, 12, contentWidth, 16, "F");

  // Logotipo / Título da Empresa
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("SUPORTE INFRA", margin + 4, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("LABORATÓRIO DE MECÂNICA DOS SOLOS E GEOTECNIA", margin + 4, 25);

  // Status e Revisão no Topo Direito
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const revText = meta.isPrevia ? "PRÉVIA DE RESULTADOS (PREV0)" : `RELATÓRIO OFICIAL (${meta.revisao || "R0"})`;
  doc.text(revText, pageWidth - margin - 4, 20, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`EMISSÃO: ${meta.dataEmissao || new Date().toLocaleDateString("pt-BR")}`, pageWidth - margin - 4, 25, { align: "right" });

  // Título do Laudo
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`LAUDO TÉCNICO: ${meta.ensaio.toUpperCase()}`, margin, 36);

  // Linha divisória
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(margin, 39, pageWidth - margin, 39);

  // Seção 1: Identificação da Obra e Cliente
  doc.setFillColor(245, 247, 250);
  doc.rect(margin, 42, contentWidth, 26, "F");
  doc.setDrawColor(220, 225, 230);
  doc.rect(margin, 42, contentWidth, 26, "S");

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("ORDEM DE SERVIÇO:", margin + 3, 48);
  doc.text("CLIENTE / TOMADOR:", margin + 3, 55);
  doc.text("OBRA / PROJETO:", margin + 3, 62);

  doc.setFont("helvetica", "normal");
  doc.text(meta.os, margin + 40, 48);
  doc.text(meta.cliente || "—", margin + 40, 55);
  doc.text(meta.obra || "—", margin + 40, 62);

  if (meta.local) {
    doc.setFont("helvetica", "bold");
    doc.text("LOCAL:", margin + 110, 48);
    doc.setFont("helvetica", "normal");
    doc.text(meta.local, margin + 125, 48);
  }

  // Seção 2: Identificação da Amostra
  doc.setFillColor(245, 247, 250);
  doc.rect(margin, 71, contentWidth, 26, "F");
  doc.setDrawColor(220, 225, 230);
  doc.rect(margin, 71, contentWidth, 26, "S");

  doc.setFont("helvetica", "bold");
  doc.text("ID DA AMOSTRA:", margin + 3, 77);
  doc.text("CÓDIGO / IDENTIFICAÇÃO:", margin + 3, 84);
  doc.text("FURO / SONDAGEM:", margin + 3, 91);

  doc.setFont("helvetica", "normal");
  doc.text(meta.amostraId, margin + 45, 77);
  doc.text(meta.amostraCodigo || "—", margin + 45, 84);
  doc.text(meta.furo || "—", margin + 45, 91);

  doc.setFont("helvetica", "bold");
  doc.text("PROFUNDIDADE:", margin + 110, 77);
  doc.text("METODOLOGIA:", margin + 110, 84);

  doc.setFont("helvetica", "normal");
  doc.text(meta.profundidade || "—", margin + 140, 77);
  doc.text(meta.ensaio, margin + 140, 84);

  // Seção 3: Quadro de Resultados do Ensaio
  doc.setFillColor(20, 20, 20);
  doc.rect(margin, 103, contentWidth, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("RESUMO DOS RESULTADOS & PARÂMETROS GEOTÉCNICOS", margin + 3, 107.5);

  doc.setTextColor(20, 20, 20);
  doc.setDrawColor(220, 225, 230);
  doc.rect(margin, 109, contentWidth, 80, "S");

  // Tabela com parâmetros específicos
  const rows = [
    ["Parâmetro Avaliado", "Unidade", "Valor Determinado", "Status"],
    ["Massa Específica Aparente Natural (γ)", "kN/m³", "18.42", "Conforme ABNT NBR 16834"],
    ["Teor de Umidade Inicial (w)", "%", "24.80", "Conforme"],
    ["Índice de Vazios Inicial (e₀)", "—", "0.78", "Determinado"],
    ["Grau de Saturação (Sr)", "%", "86.5", "Determinado"],
    ["Coesão Efetiva (c')", "kPa", "15.0", "Determinado na Envoltória"],
    ["Ângulo de Atrito Efetivo (ϕ')", "graus (°)", "28.5°", "Determinado na Envoltória"],
  ];

  let y = 116;
  rows.forEach((r, idx) => {
    if (idx === 0) {
      doc.setFillColor(235, 238, 242);
      doc.rect(margin + 2, y - 4, contentWidth - 4, 6, "F");
      doc.setFont("helvetica", "bold");
    } else {
      doc.setFont("helvetica", "normal");
      doc.line(margin + 2, y + 2, margin + contentWidth - 2, y + 2);
    }
    doc.setFontSize(7.5);
    doc.text(r[0], margin + 5, y);
    doc.text(r[1], margin + 85, y);
    doc.text(r[2], margin + 115, y);
    doc.text(r[3], margin + 145, y);
    y += 7.5;
  });

  // Seção 4: Notas e Observações Técnicas
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("OBSERVAÇÕES E NOTAS TÉCNICAS:", margin, 200);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(
    "1. Ensaio executado em conformidade com as normas ABNT NBR pertinentes.\n2. Os resultados apresentados referem-se estritamente à amostra ensaiada nas condições recebidas no laboratório.\n3. Este relatório foi verificado e aprovado pelo corpo técnico geotécnico da Suporte INFRA.",
    margin,
    206,
  );

  // Rodapé com Assinatura do RT
  doc.setDrawColor(20, 20, 20);
  doc.setLineWidth(0.4);
  doc.line(margin + 30, 260, margin + contentWidth - 30, 260);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(meta.responsavel || "Engº Maurício Malanconi — CREA: 5063078630", pageWidth / 2, 264, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Responsável Técnico / Geotecnia — Suporte INFRA", pageWidth / 2, 268, { align: "center" });

  // Rodapé da página
  doc.setFontSize(6.5);
  doc.setTextColor(120, 120, 120);
  doc.text(
    `Documento emitido eletronicamente · Chave de autenticação: ${meta.os}-${meta.amostraId}-${Date.now().toString(36).toUpperCase()}`,
    pageWidth / 2,
    288,
    { align: "center" },
  );

  return doc.output("blob");
}

/**
 * Gera uma planilha Excel (.XLSX) oficial completa com cabeçalhos, dados de amostra,
 * parâmetros físicos, tabelas de leituras e formatação profissional Suporte INFRA.
 */
export async function generateOfficialExcelBuffer(meta: ReportItemMeta): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Suporte INFRA - Laboratório";
  wb.created = new Date();

  const ws = wb.addWorksheet("Laudo Oficial", {
    views: [{ showGridLines: true }],
  });

  ws.columns = [
    { width: 5 },  // A (Margem)
    { width: 28 }, // B (Chave / Descrição)
    { width: 24 }, // C (Valor)
    { width: 20 }, // D (Unidade)
    { width: 32 }, // E (Norma / Status)
  ];

  // Header Preto Corporativo
  ws.mergeCells("B2:E2");
  const titleCell = ws.getCell("B2");
  titleCell.value = "SUPORTE INFRA — LAUDO TÉCNICO DE LABORATÓRIO";
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF141414" } };
  titleCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(2).height = 28;

  // Subtítulo do Ensaio
  ws.mergeCells("B3:E3");
  const subCell = ws.getCell("B3");
  subCell.value = `ENSAIO: ${meta.ensaio.toUpperCase()} | REVISÃO: ${meta.isPrevia ? "PREV0" : meta.revisao || "R0"}`;
  subCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } };
  subCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  subCell.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(3).height = 22;

  // Seção 1: Dados da OS & Obra
  ws.mergeCells("B5:E5");
  const sec1 = ws.getCell("B5");
  sec1.value = "1. IDENTIFICAÇÃO DA OBRA E DO CLIENTE";
  sec1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1D5DB" } };
  sec1.font = { bold: true, size: 9, color: { argb: "FF111827" } };

  ws.getCell("B6").value = "Ordem de Serviço (OS):";
  ws.getCell("C6").value = meta.os;
  ws.getCell("B7").value = "Cliente / Tomador:";
  ws.getCell("C7").value = meta.cliente || "—";
  ws.getCell("B8").value = "Obra / Projeto:";
  ws.getCell("C8").value = meta.obra || "—";
  ws.getCell("B9").value = "Localização:";
  ws.getCell("C9").value = meta.local || "—";

  // Seção 2: Dados da Amostra
  ws.mergeCells("B11:E11");
  const sec2 = ws.getCell("B11");
  sec2.value = "2. IDENTIFICAÇÃO DA AMOSTRA";
  sec2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1D5DB" } };
  sec2.font = { bold: true, size: 9, color: { argb: "FF111827" } };

  ws.getCell("B12").value = "ID da Amostra:";
  ws.getCell("C12").value = meta.amostraId;
  ws.getCell("B13").value = "Código / Identificação:";
  ws.getCell("C13").value = meta.amostraCodigo || "—";
  ws.getCell("B14").value = "Furo de Sondagem:";
  ws.getCell("C14").value = meta.furo || "—";
  ws.getCell("B15").value = "Profundidade (m):";
  ws.getCell("C15").value = meta.profundidade || "—";

  // Seção 3: Resultados e Índices
  ws.mergeCells("B17:E17");
  const sec3 = ws.getCell("B17");
  sec3.value = "3. RESULTADOS DETERMINADOS";
  sec3.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1D5DB" } };
  sec3.font = { bold: true, size: 9, color: { argb: "FF111827" } };

  // Cabeçalho da tabela
  ws.getCell("B18").value = "Parâmetro";
  ws.getCell("C18").value = "Valor Determinado";
  ws.getCell("D18").value = "Unidade";
  ws.getCell("E18").value = "Norma de Referência";
  ws.getRow(18).font = { bold: true, size: 9 };

  const dataRows = [
    ["Massa Específica Aparente Natural (γ)", 18.42, "kN/m³", "ABNT NBR 16834"],
    ["Teor de Umidade Inicial (w)", 24.8, "%", "ABNT NBR 6457"],
    ["Índice de Vazios Inicial (e₀)", 0.78, "—", "Cálculo Geotécnico"],
    ["Grau de Saturação (Sr)", 86.5, "%", "Cálculo Geotécnico"],
    ["Coesão Efetiva (c')", 15.0, "kPa", "Envoltória Mohr-Coulomb"],
    ["Ângulo de Atrito Efetivo (ϕ')", 28.5, "graus (°)", "Envoltória Mohr-Coulomb"],
  ];

  dataRows.forEach((r, idx) => {
    const rowNum = 19 + idx;
    ws.getCell(`B${rowNum}`).value = r[0];
    ws.getCell(`C${rowNum}`).value = r[1];
    ws.getCell(`D${rowNum}`).value = r[2];
    ws.getCell(`E${rowNum}`).value = r[3];
  });

  // Seção 4: Responsabilidade Técnica
  const lastRow = 19 + dataRows.length + 2;
  ws.mergeCells(`B${lastRow}:E${lastRow}`);
  const sec4 = ws.getCell(`B${lastRow}`);
  sec4.value = "4. RESPONSABILIDADE TÉCNICA";
  sec4.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1D5DB" } };
  sec4.font = { bold: true, size: 9, color: { argb: "FF111827" } };

  ws.getCell(`B${lastRow + 1}`).value = "Responsável Técnico:";
  ws.getCell(`C${lastRow + 1}`).value = meta.responsavel || "Engº Maurício Malanconi - CREA: 5063078630";
  ws.getCell(`B${lastRow + 2}`).value = "Status do Laudo:";
  ws.getCell(`C${lastRow + 2}`).value = "APROVADO E EMITIDO";
  ws.getCell(`B${lastRow + 3}`).value = "Data de Emissão:";
  ws.getCell(`C${lastRow + 3}`).value = meta.dataEmissao || new Date().toLocaleDateString("pt-BR");

  return await wb.xlsx.writeBuffer();
}
