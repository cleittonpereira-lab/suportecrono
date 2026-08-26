import ExcelJS from "exceljs";
import type {
  OedSampleProps,
  OedStage,
  OedPhysicalIndices,
  OedStageCalculated,
  OedCompressibilityParams,
} from "./types";
import type { Photo } from "@/features/lab/types";
import { generateOedCompressionCanvas, generateCvPermeabilityCanvas } from "./chartCanvas";
import assinaturaMauricio from "@/assets/assinatura-mauricio.png";

export interface ExportOedParams {
  sample: OedSampleProps;
  stages: OedStage[];
  phys: OedPhysicalIndices;
  stagesCalc: OedStageCalculated[];
  params: OedCompressibilityParams;
  photos?: Photo[];
}

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

export async function buildOedometerXlsxWorkbook({
  sample,
  stages,
  phys,
  stagesCalc,
  params,
  photos = [],
}: ExportOedParams): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Suporte Solo & Rochas — Sistema Integrado de Ensaios";
  wb.lastModifiedBy = sample.operator || "Laboratório Geotécnico";
  wb.created = new Date();
  wb.modified = new Date();

  // Cores institucionais
  const fillDarkHeader: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF141414" },
  };
  const fillSectionBar: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF1F5F9" },
  };
  const fillAccentBar: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE2E8F0" },
  };

  const borderBlack: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FF141414" } },
    left: { style: "thin", color: { argb: "FF141414" } },
    bottom: { style: "thin", color: { argb: "FF141414" } },
    right: { style: "thin", color: { argb: "FF141414" } },
  };

  const applyA4 = (ws: ExcelJS.Worksheet) => {
    ws.pageSetup = {
      paperSize: 9, // A4
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.35, right: 0.35, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    };
    ws.views = [{ showGridLines: true }];
  };

  const defaultColumns = [
    { width: 32 }, // A
    { width: 18 }, // B
    { width: 18 }, // C
    { width: 18 }, // D
    { width: 18 }, // E
    { width: 18 }, // F
    { width: 18 }, // G
  ];

  // Imagens (Logo e Assinatura)
  let logoImageId: number | null = null;
  const logoB64 = await getImageBase64("/suporte-infra-logo.png");
  if (logoB64) {
    logoImageId = wb.addImage({ base64: logoB64, extension: "png" });
  }

  let assinaturaImageId: number | null = null;
  const assB64 = await getImageBase64(assinaturaMauricio);
  if (assB64) {
    assinaturaImageId = wb.addImage({ base64: assB64, extension: "png" });
  }

  // =========================================================================
  // ABA 1: LAUDO EXECUTIVO RESUMO
  // =========================================================================
  const ws1 = wb.addWorksheet("Laudo Executivo");
  ws1.columns = defaultColumns;
  applyA4(ws1);

  // Cabeçalho Oficial
  let r = 1;
  ws1.mergeCells(`A${r}:G${r + 2}`);
  const topCell = ws1.getCell(`A${r}`);
  topCell.value = "SUPORTE ENGENHARIA — ENSAIO DE ADENSAMENTO EDOMÉTRICO (1D)";
  topCell.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FFFFFFFF" } };
  topCell.alignment = { horizontal: "center", vertical: "middle" };
  topCell.fill = fillDarkHeader;
  r += 3;

  // Subcabeçalho com Normas
  ws1.mergeCells(`A${r}:G${r}`);
  const normCell = ws1.getCell(`A${r}`);
  normCell.value = "Normas de Referência: ABNT NBR 12007:1990 | ASTM D2435/D2435M-11 (Reapproved 2020)";
  normCell.font = { name: "Calibri", size: 9, italic: true, color: { argb: "FF475569" } };
  normCell.alignment = { horizontal: "center", vertical: "middle" };
  ws1.getRow(r).height = 18;
  r++;

  // Informações Gerais
  ws1.mergeCells(`A${r}:G${r}`);
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
    ws1.mergeCells(`B${r}:C${r}`);

    ws1.getCell(`D${r}`).value = l2;
    ws1.getCell(`D${r}`).font = { name: "Calibri", size: 9.5, bold: true };
    ws1.getCell(`E${r}`).value = v2;
    ws1.getCell(`E${r}`).font = { name: "Calibri", size: 9.5 };
    ws1.mergeCells(`E${r}:G${r}`);
    ws1.getRow(r).height = 18;
    r++;
  };

  addInfoRow("Cliente:", sample.client, "Ordem de Serviço (OS):", sample.os);
  addInfoRow("Obra / Projeto:", sample.workNumber, "Data do Ensaio:", sample.date || "—");
  addInfoRow("Furo de Sondagem:", sample.borehole, "Profundidade:", `${sample.depth} m`);
  addInfoRow("Amostra:", sample.code, "Descrição Tátil-Visual:", sample.description);

  r++;

  // Índices Físicos
  ws1.mergeCells(`A${r}:G${r}`);
  const sec2 = ws1.getCell(`A${r}`);
  sec2.value = "2. CARACTERÍSTICAS INICIAIS E FINAIS DO CORPO DE PROVA";
  sec2.font = { name: "Calibri", size: 10.5, bold: true };
  sec2.fill = fillSectionBar;
  ws1.getRow(r).height = 20;
  r++;

  addInfoRow("Diâmetro do Anel (D0):", `${fmt(sample.ringDiameter, 2)} mm`, "Umidade Inicial (w0):", `${fmt(phys.wi, 2)} %`);
  addInfoRow("Altura Inicial (H0):", `${fmt(sample.ringHeight, 2)} mm`, "Umidade Final (wf):", `${fmt(phys.wf, 2)} %`);
  addInfoRow("Massa Específica dos Grãos (Gs):", `${fmt(sample.Gs, 3)} g/cm³`, "Massa Específica Seca (ρd):", `${fmt(phys.rho_d, 3)} g/cm³`);
  addInfoRow("Índice de Vazios Inicial (e0):", fmt(phys.e0, 3), "Grau de Saturação Inicial (Sr0):", `${fmt(phys.Sr0, 1)} %`);

  r++;

  // Parâmetros de Compressibilidade
  ws1.mergeCells(`A${r}:G${r}`);
  const sec3 = ws1.getCell(`A${r}`);
  sec3.value = "3. PARÂMETROS DE COMPRESSIBILIDADE E PRÉ-ADENSAMENTO";
  sec3.font = { name: "Calibri", size: 10.5, bold: true };
  sec3.fill = fillSectionBar;
  ws1.getRow(r).height = 20;
  r++;

  addInfoRow("Índice de Compressão (Cc):", fmt(params.Cc, 3), "Tensão Pré-Adensamento (Casagrande):", `${fmt(params.sigmaP_Cas, 1)} kPa`);
  addInfoRow("Índice de Recompressão (Cr / Cs):", fmt(params.Cr, 3), "Tensão Pré-Adensamento (Pacheco Silva):", `${fmt(params.sigmaP_PS, 1)} kPa`);
  addInfoRow("Tensão Adotada (σ'vm):", `${fmt(params.sigmaP_Adopted, 1)} kPa`, "Razão de Sobreconsolidação (OCR):", params.OCR ? fmt(params.OCR, 2) : "—");

  r++;

  // Tabela Resumo dos Estágios
  ws1.mergeCells(`A${r}:G${r}`);
  const sec4 = ws1.getCell(`A${r}`);
  sec4.value = "4. RESUMO DOS ESTÁGIOS DE CARREGAMENTO & DESCARREGAMENTO";
  sec4.font = { name: "Calibri", size: 10.5, bold: true };
  sec4.fill = fillSectionBar;
  ws1.getRow(r).height = 20;
  r++;

  const ths = ["Estágio", "Tensão σ' (kPa)", "Fase", "Recalque ΔH (mm)", "Índice de Vazios (e)", "Cv Taylor (cm²/s)", "Módulo Eoed (MPa)"];
  ths.forEach((th, i) => {
    const colLetter = String.fromCharCode(65 + i);
    const cell = ws1.getCell(`${colLetter}${r}`);
    cell.value = th;
    cell.font = { name: "Calibri", size: 9.5, bold: true };
    cell.fill = fillAccentBar;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = borderBlack;
  });
  ws1.getRow(r).height = 22;
  r++;

  stagesCalc.forEach((st) => {
    const vals = [
      `Estágio ${st.index + 1}${st.isSeatingStage ? " (Assent.)" : ""}`,
      fmt(st.sigma, 0),
      st.phase === "unload" ? "Descarregamento" : st.phase === "reload" ? "Recarregamento" : "Carregamento",
      fmt(st.totalSettlementMm, 4),
      fmt(st.e, 4),
      st.cvTaylor ? st.cvTaylor.toExponential(2) : "—",
      fmt(st.Ed, 1),
    ];
    vals.forEach((v, i) => {
      const colLetter = String.fromCharCode(65 + i);
      const cell = ws1.getCell(`${colLetter}${r}`);
      cell.value = v;
      cell.font = { name: "Calibri", size: 9 };
      cell.alignment = { horizontal: i === 0 || i === 2 ? "left" : "center", vertical: "middle" };
      cell.border = borderBlack;
    });
    ws1.getRow(r).height = 19;
    r++;
  });

  r += 2;

  // Assinatura Técnica
  ws1.mergeCells(`E${r}:G${r}`);
  const respCell = ws1.getCell(`E${r}`);
  respCell.value = sample.technicalResp || "Maurício P. Barbosa — Resp. Técnico";
  respCell.font = { name: "Calibri", size: 10, bold: true };
  respCell.alignment = { horizontal: "center", vertical: "middle" };

  // =========================================================================
  // ABA 2: CURVAS DE COMPRESSIBILIDADE (GRÁFICOS ANCORADOS)
  // =========================================================================
  const ws2 = wb.addWorksheet("Curvas de Compressibilidade");
  ws2.columns = defaultColumns;
  applyA4(ws2);

  let r2 = 1;
  ws2.mergeCells(`A${r2}:G${r2}`);
  const top2 = ws2.getCell(`A${r2}`);
  top2.value = "CURVA DE COMPRESSÃO EDOMÉTRICA (e × log σ') & COEFICIENTES";
  top2.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  top2.fill = fillDarkHeader;
  top2.alignment = { horizontal: "center", vertical: "middle" };
  ws2.getRow(r2).height = 26;
  r2 += 2;
  // Gráfico 1: e x log sigma
  const eCurveData = stagesCalc.map((s) => ({ sigma: s.sigma, e: s.e, phase: s.phase }));
  const casObj = null; // Podem ser passados se disponíveis
  const psObj = null;
  const compCanvas = generateOedCompressionCanvas(eCurveData, casObj, psObj, 1000, 500);
  if (compCanvas) {
    const imgId = wb.addImage({ base64: compCanvas.split(",")[1], extension: "png" });
    ws2.addImage(imgId, {
      tl: { col: 0.2, row: r2 },
      br: { col: 6.8, row: r2 + 20 },
      editAs: "twoCell",
    } as any);
    r2 += 22;
  }

  // Gráfico 2: Cv e k
  const cvCanvas = generateCvPermeabilityCanvas(stagesCalc, 1000, 420);
  if (cvCanvas) {
    const imgId2 = wb.addImage({ base64: cvCanvas.split(",")[1], extension: "png" });
    ws2.addImage(imgId2, {
      tl: { col: 0.2, row: r2 },
      br: { col: 6.8, row: r2 + 18 },
      editAs: "twoCell",
    } as any);
  }

  // =========================================================================
  // ABAS 3..N: ESTÁGIOS INDIVIDUAIS COM LEITURAS PASSO A PASSO
  // =========================================================================
  stages.forEach((st, stIdx) => {
    const calc = stagesCalc[stIdx];
    const wsSt = wb.addWorksheet(`Estágio ${stIdx + 1} (${st.sigma} kPa)`);
    wsSt.columns = [
      { width: 14 }, // A: t [min]
      { width: 14 }, // B: sqrt(t)
      { width: 14 }, // C: log(t)
      { width: 18 }, // D: d [mm]
      { width: 18 }, // E: ΔH [mm]
      { width: 18 }, // F: e
      { width: 18 }, // G: εv [%]
    ];
    applyA4(wsSt);

    let rSt = 1;
    wsSt.mergeCells(`A${rSt}:G${rSt}`);
    const hCell = wsSt.getCell(`A${rSt}`);
    hCell.value = `ESTÁGIO ${stIdx + 1} — TENSÃO VERTICAL σ' = ${st.sigma} kPa${st.isSeatingStage ? " (ASSENTAMENTO)" : ""}`;
    hCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    hCell.fill = fillDarkHeader;
    hCell.alignment = { horizontal: "center", vertical: "middle" };
    wsSt.getRow(rSt).height = 24;
    rSt += 2;

    const rHeaders = ["Tempo t (min)", "√t (min^0.5)", "log10(t)", "Leitura Ext. (mm)", "Recalque ΔH (mm)", "Índice Vazios e", "Deformação εv (%)"];
    rHeaders.forEach((th, i) => {
      const colLetter = String.fromCharCode(65 + i);
      const cell = wsSt.getCell(`${colLetter}${rSt}`);
      cell.value = th;
      cell.font = { name: "Calibri", size: 9.5, bold: true };
      cell.fill = fillAccentBar;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = borderBlack;
    });
    wsSt.getRow(rSt).height = 22;
    rSt++;

    (st.readings || []).forEach((rd) => {
      const prevD = stIdx === 0 ? 0 : stages[stIdx - 1].finalDial;
      const dH_stage = rd.d - prevD;
      const e_inst = phys.e0 - (rd.d / sample.ringHeight) * (1 + phys.e0);
      const eps_inst = (rd.d / sample.ringHeight) * 100;

      const rowVals = [
        fmt(rd.t, 2),
        rd.t > 0 ? fmt(Math.sqrt(rd.t), 3) : "0",
        rd.t > 0 ? fmt(Math.log10(rd.t), 3) : "—",
        fmt(rd.d, 4),
        fmt(dH_stage, 4),
        fmt(e_inst, 4),
        fmt(eps_inst, 2),
      ];

      rowVals.forEach((val, i) => {
        const colLetter = String.fromCharCode(65 + i);
        const cell = wsSt.getCell(`${colLetter}${rSt}`);
        cell.value = val;
        cell.font = { name: "Calibri", size: 9 };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = borderBlack;
      });
      wsSt.getRow(rSt).height = 18;
      rSt++;
    });
  });

  // =========================================================================
  // ABA FINAL: REGISTRO FOTOGRÁFICO (FOTOS EM 3:4 ANCORADAS COM TWOCELL)
  // =========================================================================
  const photoPagesCount = Math.max(1, Math.ceil(photos.length / 3));
  for (let pIdx = 0; pIdx < photoPagesCount; pIdx++) {
    const photosForPage = photos.slice(pIdx * 3, pIdx * 3 + 3);
    const sheetName = photoPagesCount === 1 ? "Registro Fotográfico" : `Registro Fotográfico (${pIdx + 1})`;
    const wsPh = wb.addWorksheet(sheetName);
    wsPh.columns = defaultColumns;
    applyA4(wsPh);

    let rPh = 1;
    wsPh.mergeCells(`A${rPh}:G${rPh}`);
    const hPh = wsPh.getCell(`A${rPh}`);
    hPh.value = "REGISTRO FOTOGRÁFICO DO CORPO DE PROVA";
    hPh.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    hPh.fill = fillDarkHeader;
    hPh.alignment = { horizontal: "center", vertical: "middle" };
    wsPh.getRow(rPh).height = 24;
    rPh += 2;

    const imgRowStart = rPh;
    const imgRowEnd = rPh + 14;
    for (let i = imgRowStart; i <= imgRowEnd; i++) {
      wsPh.getRow(i).height = 20;
    }

    for (let i = 0; i < photosForPage.length; i++) {
      const p = photosForPage[i];
      const colStart = i === 0 ? 0.1 : i === 1 ? 2.4 : 4.9;
      const colEnd = i === 0 ? 1.9 : i === 1 ? 4.6 : 6.9;

      if (p.url || p.dataUrl) {
        const b64 = await getImageBase64(p.url || p.dataUrl);
        if (b64) {
          const imgId = wb.addImage({ base64: b64, extension: "jpeg" });
          wsPh.addImage(imgId, {
            tl: { col: colStart, row: imgRowStart - 1 },
            br: { col: colEnd, row: imgRowEnd },
            editAs: "twoCell",
          } as any);
        }
      }
    }

    rPh = imgRowEnd + 1;
    wsPh.getRow(rPh).height = 24;
    photosForPage.forEach((p, i) => {
      const cellStart = i === 0 ? "A" : i === 1 ? "C" : "F";
      const cellEnd = i === 0 ? "B" : i === 1 ? "E" : "G";
      wsPh.mergeCells(`${cellStart}${rPh}:${cellEnd}${rPh}`);
      const legCell = wsPh.getCell(`${cellStart}${rPh}`);
      legCell.value = p.caption || (p.kind === "moldagem" ? "Aspecto Inicial" : "Aspecto Final");
      legCell.font = { name: "Calibri", size: 10, bold: true };
      legCell.alignment = { horizontal: "center", vertical: "middle" };
      legCell.border = borderBlack;
    });
  }

  return wb;
}

export async function getOedometerXlsxBase64(params: ExportOedParams): Promise<{ filename: string; base64: string }> {
  const wb = await buildOedometerXlsxWorkbook(params);
  const buffer = await wb.xlsx.writeBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  const filename = `ADENSAMENTO_${params.sample.os || "OS"}_${params.sample.code || "AMOSTRA"}_Rev${params.sample.revision || "00"}.xlsx`;
  return { filename, base64 };
}

export async function exportOedometerXlsx(params: ExportOedParams) {
  const wb = await buildOedometerXlsxWorkbook(params);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ADENSAMENTO_${params.sample.os || "OS"}_${params.sample.code || "AMOSTRA"}_Rev${params.sample.revision || "00"}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
