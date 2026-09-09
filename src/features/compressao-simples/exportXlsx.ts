import type ExcelJS from "exceljs";
import type { CompressaoSimplesSample, CsAmostraTipo } from "./types";
import type { CsCpResult } from "./calc";
import type { Photo } from "@/features/lab/types";
import { generateStressStrainCanvas } from "./chartCanvas";
import assinaturaMauricio from "@/assets/assinatura-mauricio.png";

export interface ExportCsParams {
  sample: CompressaoSimplesSample;
  results: CsCpResult[];
  media: { quKPa: number | null; quMPa: number | null; gamaD: number | null; w: number | null } | null;
  comIndices: boolean;
  isCompleto: boolean;
  photos?: Photo[];
}

const AMOSTRA_TIPO_LABEL: Record<CsAmostraTipo, string> = { solo: "Solo", rocha: "Rocha", dosagem: "Dosagem (solo-cimento)" };
const NORMA_LABEL: Record<CsAmostraTipo, string> = {
  solo: "ABNT NBR 12770 — Solo coesivo — Determinação da resistência à compressão não confinada",
  rocha: "ABNT NBR 15845-5 — Rochas para revestimento — Métodos de ensaios — Parte 5, cf. ASTM D7012 (Método C) / ISRM",
  dosagem: "ABNT NBR 12025 — Solo-cimento — Ensaio de compressão simples de corpos de prova cilíndricos",
};

const fmt = (v: number | null | undefined, dec = 2) =>
  v == null || isNaN(v) ? "—" : v.toFixed(dec);

async function getImageBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(",")[1];
        resolve(base64 || null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function buildCompressaoSimplesXlsxWorkbook({
  sample,
  results,
  media,
  comIndices,
  isCompleto,
  photos = [],
}: ExportCsParams): Promise<ExcelJS.Workbook> {
  if (import.meta.env.SSR) throw new Error("buildCompressaoSimplesXlsxWorkbook só roda no navegador");
  const ExcelJSRuntime = (await import("exceljs")).default;
  const wb = new ExcelJSRuntime.Workbook();
  wb.creator = "Suporte Infra — Sistema Integrado de Ensaios";
  wb.lastModifiedBy = sample.operator || "Laboratório Geotécnico";
  wb.created = new Date();
  wb.modified = new Date();

  const fillDarkHeader: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF141414" } };
  const fillSectionBar: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
  const fillAccentBar: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  const fillMediaRow: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE68A" } };
  const borderBlack: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FF141414" } },
    left: { style: "thin", color: { argb: "FF141414" } },
    bottom: { style: "thin", color: { argb: "FF141414" } },
    right: { style: "thin", color: { argb: "FF141414" } },
  };

  const applyA4 = (ws: ExcelJS.Worksheet) => {
    ws.pageSetup = {
      paperSize: 9,
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.35, right: 0.35, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    };
    ws.views = [{ showGridLines: true }];
  };

  const defaultColumns = [{ width: 30 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];

  const logoB64 = await getImageBase64("/suporte-infra-logo.png");
  const assB64 = await getImageBase64(assinaturaMauricio);
  void logoB64; void assB64; // reservados p/ uso futuro (marca d'água/assinatura em célula)

  // =========================================================================
  // ABA 1: LAUDO EXECUTIVO
  // =========================================================================
  const ws1 = wb.addWorksheet("Laudo Executivo");
  ws1.columns = defaultColumns;
  applyA4(ws1);

  let r = 1;
  ws1.mergeCells(`A${r}:J${r + 2}`);
  const topCell = ws1.getCell(`A${r}`);
  topCell.value = `SUPORTE INFRA — COMPRESSÃO SIMPLES — ${AMOSTRA_TIPO_LABEL[sample.amostraTipo].toUpperCase()}`;
  topCell.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
  topCell.alignment = { horizontal: "center", vertical: "middle" };
  topCell.fill = fillDarkHeader;
  r += 3;

  ws1.mergeCells(`A${r}:J${r}`);
  const normCell = ws1.getCell(`A${r}`);
  normCell.value = `Norma de Referência: ${NORMA_LABEL[sample.amostraTipo]}`;
  normCell.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF475569" } };
  normCell.alignment = { horizontal: "center", vertical: "middle" };
  ws1.getRow(r).height = 18;
  r++;

  ws1.mergeCells(`A${r}:J${r}`);
  const sec1 = ws1.getCell(`A${r}`);
  sec1.value = "1. IDENTIFICAÇÃO E DADOS GERAIS DO PROJETO";
  sec1.font = { name: "Calibri", size: 10.5, bold: true };
  sec1.fill = fillSectionBar;
  ws1.getRow(r).height = 20;
  r++;

  const addInfoRow = (l1: string, v1: string, l2: string, v2: string) => {
    ws1.getCell(`A${r}`).value = l1;
    ws1.getCell(`A${r}`).font = { name: "Calibri", size: 9.5, bold: true };
    ws1.getCell(`B${r}`).value = v1;
    ws1.getCell(`B${r}`).font = { name: "Calibri", size: 9.5 };
    ws1.mergeCells(`B${r}:E${r}`);

    ws1.getCell(`F${r}`).value = l2;
    ws1.getCell(`F${r}`).font = { name: "Calibri", size: 9.5, bold: true };
    ws1.getCell(`G${r}`).value = v2;
    ws1.getCell(`G${r}`).font = { name: "Calibri", size: 9.5 };
    ws1.mergeCells(`G${r}:J${r}`);
    ws1.getRow(r).height = 18;
    r++;
  };

  addInfoRow("Cliente:", sample.client, "Ordem de Serviço (OS):", sample.os);
  addInfoRow("Obra / Projeto:", sample.workNumber, "Data do Ensaio:", sample.date || "—");
  addInfoRow("Furo de Sondagem:", sample.borehole || "—", "Profundidade:", sample.depth || "—");
  addInfoRow("Amostra:", sample.code || sample.reportNumber, "Descrição Tátil-Visual:", sample.description || "—");
  if (sample.amostraTipo === "dosagem" && sample.idadeCuraDias != null) {
    addInfoRow("Idade de Cura:", `${sample.idadeCuraDias} dias`, "Nº de Corpos de Prova:", String(results.length));
  } else {
    addInfoRow("Nº de Corpos de Prova:", String(results.length), "Resultado:", isCompleto ? "Completo (curva)" : "Simplificado");
  }

  r++;

  ws1.mergeCells(`A${r}:J${r}`);
  const sec2 = ws1.getCell(`A${r}`);
  sec2.value = "2. CORPO(S) DE PROVA — DIMENSÕES, MASSA E RESULTADO";
  sec2.font = { name: "Calibri", size: 10.5, bold: true };
  sec2.fill = fillSectionBar;
  ws1.getRow(r).height = 20;
  r++;

  const cpHeaders = comIndices
    ? ["CP", "D médio (cm)", "H médio (cm)", "Área (cm²)", "Volume (cm³)", "Massa (g)", "γnat (g/cm³)", "γd (g/cm³)", "w (%)", "qu (kPa) / (MPa)"]
    : ["CP", "D médio (cm)", "H médio (cm)", "Área (cm²)", "Volume (cm³)", "Massa (g)", "γnat (g/cm³)", "", "", "qu (kPa) / (MPa)"];
  cpHeaders.forEach((th, i) => {
    const colLetter = String.fromCharCode(65 + i);
    const cell = ws1.getCell(`${colLetter}${r}`);
    cell.value = th;
    cell.font = { name: "Calibri", size: 9, bold: true };
    cell.fill = fillAccentBar;
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = borderBlack;
  });
  ws1.getRow(r).height = 26;
  r++;

  results.forEach((res, i) => {
    const cp = sample.corposDeProva[i];
    const vals = [
      res.label,
      fmt(res.diametroMedia, 2),
      fmt(res.alturaMedia, 2),
      fmt(res.area, 2),
      fmt(res.volume, 2),
      fmt(cp?.massaInicial, 1),
      fmt(res.gamaNat, 3),
      comIndices ? fmt(res.gamaD, 3) : "",
      comIndices ? fmt(res.w, 2) : "",
      `${fmt(res.quKPa, 0)} / ${fmt(res.quMPa, 3)}`,
    ];
    vals.forEach((v, ci) => {
      const colLetter = String.fromCharCode(65 + ci);
      const cell = ws1.getCell(`${colLetter}${r}`);
      cell.value = v;
      cell.font = { name: "Calibri", size: 9 };
      cell.alignment = { horizontal: ci === 0 ? "left" : "center", vertical: "middle" };
      cell.border = borderBlack;
    });
    ws1.getRow(r).height = 19;
    r++;
  });

  if (media) {
    const vals = [
      `Média (${results.length} CPs)`, "", "", "", "", "",
      "", comIndices ? fmt(media.gamaD, 3) : "", comIndices ? fmt(media.w, 2) : "",
      `${fmt(media.quKPa, 0)} / ${fmt(media.quMPa, 3)}`,
    ];
    vals.forEach((v, ci) => {
      const colLetter = String.fromCharCode(65 + ci);
      const cell = ws1.getCell(`${colLetter}${r}`);
      cell.value = v;
      cell.font = { name: "Calibri", size: 9.5, bold: true };
      cell.fill = fillMediaRow;
      cell.alignment = { horizontal: ci === 0 ? "left" : "center", vertical: "middle" };
      cell.border = borderBlack;
    });
    ws1.getRow(r).height = 19;
    r++;
  }

  if (comIndices) {
    r++;
    ws1.mergeCells(`A${r}:J${r}`);
    const sec3 = ws1.getCell(`A${r}`);
    sec3.value = "3. ÍNDICES FÍSICOS";
    sec3.font = { name: "Calibri", size: 10.5, bold: true };
    sec3.fill = fillSectionBar;
    ws1.getRow(r).height = 20;
    r++;

    const idxHeaders = ["CP", "Gs (g/cm³)", "e", "n (%)", "SR (%)"];
    idxHeaders.forEach((th, i) => {
      const colLetter = String.fromCharCode(65 + i);
      const cell = ws1.getCell(`${colLetter}${r}`);
      cell.value = th;
      cell.font = { name: "Calibri", size: 9, bold: true };
      cell.fill = fillAccentBar;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = borderBlack;
    });
    ws1.getRow(r).height = 20;
    r++;

    results.forEach((res) => {
      const vals = [res.label, fmt(sample.massaEspecificaGraos, 2), fmt(res.ei, 3), fmt(res.n, 1), fmt(res.sr, 1)];
      vals.forEach((v, ci) => {
        const colLetter = String.fromCharCode(65 + ci);
        const cell = ws1.getCell(`${colLetter}${r}`);
        cell.value = v;
        cell.font = { name: "Calibri", size: 9 };
        cell.alignment = { horizontal: ci === 0 ? "left" : "center", vertical: "middle" };
        cell.border = borderBlack;
      });
      ws1.getRow(r).height = 18;
      r++;
    });
  }

  r += 2;
  ws1.mergeCells(`A${r}:J${r}`);
  const resultBox = ws1.getCell(`A${r}`);
  const quFinal = media ?? results[0];
  resultBox.value = `RESULTADO FINAL — RESISTÊNCIA À COMPRESSÃO SIMPLES (qu): ${fmt((quFinal as any)?.quKPa, 0)} kPa  /  ${fmt((quFinal as any)?.quMPa, 3)} MPa${media ? " (média)" : ""}`;
  resultBox.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  resultBox.fill = fillDarkHeader;
  resultBox.alignment = { horizontal: "center", vertical: "middle" };
  ws1.getRow(r).height = 26;
  r += 2;

  ws1.mergeCells(`F${r}:J${r}`);
  const respCell = ws1.getCell(`F${r}`);
  respCell.value = sample.technicalResp || "Engº Maurício Malanconi — Resp. Técnico";
  respCell.font = { name: "Calibri", size: 10, bold: true };
  respCell.alignment = { horizontal: "center", vertical: "middle" };

  // =========================================================================
  // ABA 2: CURVA TENSÃO × DEFORMAÇÃO (só resultado completo)
  // =========================================================================
  if (isCompleto) {
    const ws2 = wb.addWorksheet("Curva Tensão-Deformação");
    ws2.columns = defaultColumns;
    applyA4(ws2);

    let r2 = 1;
    ws2.mergeCells(`A${r2}:J${r2}`);
    const top2 = ws2.getCell(`A${r2}`);
    top2.value = "CURVA(S) TENSÃO × DEFORMAÇÃO AXIAL";
    top2.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    top2.fill = fillDarkHeader;
    top2.alignment = { horizontal: "center", vertical: "middle" };
    ws2.getRow(r2).height = 26;
    r2 += 2;

    for (const res of results) {
      if (res.curvaPontos.length < 2) continue;
      ws2.mergeCells(`A${r2}:J${r2}`);
      const cpTitle = ws2.getCell(`A${r2}`);
      cpTitle.value = `${res.label} — qu = ${fmt(res.quKPa, 0)} kPa (${fmt(res.quMPa, 3)} MPa)`;
      cpTitle.font = { name: "Calibri", size: 10.5, bold: true };
      cpTitle.fill = fillSectionBar;
      ws2.getRow(r2).height = 20;
      r2++;

      const canvas = generateStressStrainCanvas(res.curvaPontos, res.picoPct, res.quKPa);
      if (canvas) {
        const imgId = wb.addImage({ base64: canvas.split(",")[1], extension: "png" });
        ws2.addImage(imgId, { tl: { col: 0.2, row: r2 }, br: { col: 9.5, row: r2 + 18 }, editAs: "twoCell" } as any);
        r2 += 20;
      }
    }
  }

  // =========================================================================
  // ABA FINAL: REGISTRO FOTOGRÁFICO
  // =========================================================================
  if (photos.length > 0) {
    const photoPagesCount = Math.max(1, Math.ceil(photos.length / 3));
    for (let pIdx = 0; pIdx < photoPagesCount; pIdx++) {
      const photosForPage = photos.slice(pIdx * 3, pIdx * 3 + 3);
      const sheetName = photoPagesCount === 1 ? "Registro Fotográfico" : `Registro Fotográfico (${pIdx + 1})`;
      const wsPh = wb.addWorksheet(sheetName);
      wsPh.columns = defaultColumns;
      applyA4(wsPh);

      let rPh = 1;
      wsPh.mergeCells(`A${rPh}:J${rPh}`);
      const hPh = wsPh.getCell(`A${rPh}`);
      hPh.value = "REGISTRO FOTOGRÁFICO";
      hPh.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
      hPh.fill = fillDarkHeader;
      hPh.alignment = { horizontal: "center", vertical: "middle" };
      wsPh.getRow(rPh).height = 24;
      rPh += 2;

      const imgRowStart = rPh;
      const imgRowEnd = rPh + 14;
      for (let i = imgRowStart; i <= imgRowEnd; i++) wsPh.getRow(i).height = 20;

      for (let i = 0; i < photosForPage.length; i++) {
        const p = photosForPage[i];
        const colStart = i === 0 ? 0.1 : i === 1 ? 3.5 : 6.9;
        const colEnd = i === 0 ? 3.3 : i === 1 ? 6.7 : 9.9;
        if (p.url || p.dataUrl) {
          const b64 = await getImageBase64(p.url || p.dataUrl);
          if (b64) {
            const imgId = wb.addImage({ base64: b64, extension: "jpeg" });
            wsPh.addImage(imgId, { tl: { col: colStart, row: imgRowStart - 1 }, br: { col: colEnd, row: imgRowEnd }, editAs: "twoCell" } as any);
          }
        }
      }

      rPh = imgRowEnd + 1;
      wsPh.getRow(rPh).height = 24;
      photosForPage.forEach((p, i) => {
        const cellStart = i === 0 ? "A" : i === 1 ? "D" : "G";
        const cellEnd = i === 0 ? "C" : i === 1 ? "F" : "J";
        wsPh.mergeCells(`${cellStart}${rPh}:${cellEnd}${rPh}`);
        const legCell = wsPh.getCell(`${cellStart}${rPh}`);
        legCell.value = p.caption || (p.kind === "moldagem" ? "Antes do Ensaio" : "Após a Ruptura");
        legCell.font = { name: "Calibri", size: 10, bold: true };
        legCell.alignment = { horizontal: "center", vertical: "middle" };
        legCell.border = borderBlack;
      });
    }
  }

  return wb;
}

function buildFilename(sample: CompressaoSimplesSample): string {
  const base = (sample.os || "OS").toString().replace(/[^\w-]+/g, "_");
  const cod = (sample.code || sample.reportNumber || "AMOSTRA").toString().replace(/[^\w-]+/g, "_");
  return `COMP-SIMPLES_${base}_${cod}_Rev${sample.revision || "00"}.xlsx`;
}

export async function getCompressaoSimplesXlsxBase64(params: ExportCsParams): Promise<{ filename: string; base64: string }> {
  const wb = await buildCompressaoSimplesXlsxWorkbook(params);
  const buffer = await wb.xlsx.writeBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return { filename: buildFilename(params.sample), base64 };
}

export async function exportCompressaoSimplesXlsx(params: ExportCsParams) {
  const wb = await buildCompressaoSimplesXlsxWorkbook(params);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = buildFilename(params.sample);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
