import * as XLSX from "xlsx";
import type { CDReading } from "./types";

const norm = (v: unknown): string =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const asNum = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number" && isFinite(v)) return v;
  const raw = String(v).trim();
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  const decimalComma = hasComma && (!hasDot || raw.lastIndexOf(",") > raw.lastIndexOf("."));
  const normalized = decimalComma
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/,/g, "");
  const s = normalized.replace(/[^\d.\-eE]/g, "");
  const n = Number(s);
  return isFinite(n) ? n : null;
};

const cellHas = (v: unknown, ...parts: string[]) => {
  const text = norm(v);
  return parts.every((part) => text.includes(part));
};

export interface CDImportResult {
  readings: CDReading[];
  filename: string;
}

export function parseCDGeneric(buffer: ArrayBuffer, filename: string): CDImportResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const readings: CDReading[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
      header: 1,
      defval: null,
      raw: true,
    }) as (string | number | null)[][];

    // Tenta achar cabeçalho
    let headerRow = -1;
    let cols: { horiz?: number; force?: number; vert?: number } = {};

    for (let r = 0; r < Math.min(grid.length, 50); r++) {
      const row = grid[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (cellHas(cell, "desloc", "horiz") || cellHas(cell, "horiz", "mm")) cols.horiz = c;
        if (cellHas(cell, "forca") || cellHas(cell, "carga") || cellHas(cell, "load")) cols.force = c;
        if (cellHas(cell, "desloc", "vert") || cellHas(cell, "vert", "mm") || cellHas(cell, "assent")) cols.vert = c;
      }
      if (cols.horiz != null && cols.force != null) {
        headerRow = r;
        break;
      }
    }

    if (headerRow !== -1) {
      for (let r = headerRow + 1; r < grid.length; r++) {
        const row = grid[r];
        if (!row) break;
        const h = asNum(row[cols.horiz!]);
        const f = asNum(row[cols.force!]);
        const v = cols.vert != null ? asNum(row[cols.vert]) : 0;
        if (h != null && f != null) {
          readings.push({
            horizDispMm: h,
            shearForce: f,
            vertDispMm: v ?? 0
          });
        } else if (readings.length > 0) {
          break; // Fim dos dados
        }
      }
      if (readings.length > 0) break;
    }
  }

  return { readings, filename };
}
