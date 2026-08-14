import * as XLSX from "xlsx";
import type { CDSpecimen, CDReading } from "./types";
import { toast } from "sonner";

/**
 * Utilitário para importar dados brutos de planilhas de aquisição.
 * Tenta inferir colunas de Tempo, Deslocamento e Força.
 */
export async function importXlsxToSpecimen(file: File): Promise<Partial<CDSpecimen>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<any>(firstSheet, { header: 1 }) as any[][];

        if (rows.length === 0) {
          throw new Error("Planilha vazia");
        }

        // Tenta encontrar colunas
        const header = rows[0].map(c => String(c || "").toLowerCase());
        const findCol = (...keywords: string[]) => 
          header.findIndex(h => keywords.some(k => h.includes(k)));

        const colDisp = findCol("deslocamento", "horiz", "dx", "displacement");
        const colForce = findCol("força", "force", "kgf", "load");
        const colVert = findCol("vertical", "dy", "dz", "settlement");
        const colTime = findCol("tempo", "time");

        const shearData: CDReading[] = [];
        const consolidationData: { timeMin: number; settlementMm: number }[] = [];

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const disp = colDisp >= 0 ? Number(row[colDisp]) : null;
          const force = colForce >= 0 ? Number(row[colForce]) : null;
          const vert = colVert >= 0 ? Number(row[colVert]) : null;
          const time = colTime >= 0 ? Number(row[colTime]) : null;

          if (disp !== null && !isNaN(disp) && force !== null && !isNaN(force)) {
            shearData.push({
              horizDispMm: disp,
              shearForce: force, // Assume N por padrão no motor se loadKgf for null
              vertDispMm: vert || 0,
              loadKgf: (header[colForce]?.includes("kgf") || header[colForce]?.includes("carga")) ? force : undefined
            });
          }

          if (time !== null && !isNaN(time) && vert !== null && !isNaN(vert)) {
            consolidationData.push({ timeMin: time, settlementMm: vert });
          }
        }

        if (shearData.length === 0 && consolidationData.length === 0) {
          throw new Error("Nenhum dado numérico reconhecido nas colunas esperadas.");
        }

        resolve({
          shearData,
          consolidationData,
          rawImport: {
            filename: file.name,
            nt: file.name.split(".")[0],
            importedAt: new Date().toISOString(),
            consolidationCount: consolidationData.length,
            shearCount: shearData.length
          }
        });
        toast.success("Dados importados com sucesso");
      } catch (err: any) {
        toast.error(`Erro ao processar XLSX: ${err.message}`);
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}
