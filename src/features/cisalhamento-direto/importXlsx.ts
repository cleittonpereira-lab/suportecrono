import * as XLSX from "xlsx";
import type { CDReading } from "./types";

export interface ParsedCDXlsx {
  specimenName?: string;
  normalStressKpa?: number;
  initialMoistureCapsules?: { tipo?: string; numero?: string; tara: number; wet: number; dry: number }[];
  finalMoistureCapsules?: { tipo?: string; numero?: string; tara: number; wet: number; dry: number }[];
  height0Mm?: number;
  diameterMm?: number;
  wetMass?: number;
  finalMass?: number;
  consolidation: { timeMin: number; settlementMm: number }[];
  shear: CDReading[];
}

export function parseCDXlsx(buffer: ArrayBuffer, filename: string): ParsedCDXlsx {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  const result: ParsedCDXlsx = {
    specimenName: filename.replace(/\.[^/.]+$/, ""),
    consolidation: [],
    shear: [],
  };

  if (!rows || rows.length === 0) return result;

  // Busca inteligente de colunas e dados
  let shearHeaderIdx = -1;
  let horizCol = 0;
  let forceCol = 1;
  let vertCol = 2;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    
    // Procura cabeçalho de cisalhamento
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || "").toLowerCase();
      if (val.includes("desloc") || val.includes("deform") || val.includes("disp") || val.includes("horiz")) {
        shearHeaderIdx = r;
        horizCol = c;
      }
      if (val.includes("carga") || val.includes("forca") || val.includes("force") || val.includes("kgf") || val.includes("load")) {
        forceCol = c;
      }
      if (val.includes("vert") || val.includes("recalque") || val.includes("settle")) {
        vertCol = c;
      }
    }
    if (shearHeaderIdx !== -1) break;
  }

  const startRow = shearHeaderIdx !== -1 ? shearHeaderIdx + 1 : 0;

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const horiz = parseFloat(String(row[horizCol] || "").replace(",", "."));
    const force = parseFloat(String(row[forceCol] || "").replace(",", "."));
    const vert = parseFloat(String(row[vertCol] || "0").replace(",", "."));

    if (!isNaN(horiz) && !isNaN(force) && horiz >= 0) {
      result.shear.push({
        horizDispMm: horiz,
        loadKgf: force,
        shearForce: force * 9.80665,
        vertDispMm: isNaN(vert) ? 0 : vert,
      });
    }
  }

  return result;
}
