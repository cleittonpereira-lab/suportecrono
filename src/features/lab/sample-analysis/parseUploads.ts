/**
 * Parsing client-side dos extratos SOND (amostras coletadas) e MAPS
 * (amostras a coletar) — mesmo padrão de src/components/import-ensaios-dialog.tsx
 * (XLSX.read via FileReader, busca de coluna tolerante a variação de nome).
 */
import type { AmostraColetada, AmostraAColetar, CategoriaAmostra } from "@/lib/sample-collection.functions";

async function readSheetRows(file: File): Promise<Record<string, unknown>[]> {
  if (!import.meta.env.SSR) {
    const XLSX = await import("xlsx");
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        try {
          const data = new Uint8Array(reader.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
          resolve(json);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }
  throw new Error("readSheetRows só roda no navegador");
}

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    for (const key of Object.keys(row)) {
      if (key.trim().toLowerCase() === k.toLowerCase()) {
        const v = String(row[key] ?? "").trim();
        if (v) return v;
      }
    }
  }
  return "";
}

export function classificarTipo(tipoRaw: string): CategoriaAmostra {
  const t = tipoRaw.trim().toUpperCase();
  if (t.startsWith("BL")) return "bloco";
  if (t.startsWith("SH")) return "shelby";
  if (t.startsWith("DN")) return "denison";
  return "outro";
}

export async function parseColetadas(file: File): Promise<AmostraColetada[]> {
  const rows = await readSheetRows(file);
  return rows
    .map((r) => {
      const tipo = pick(r, ["Tipo"]);
      const os = pick(r, ["Ordem de Serviço (OS)", "Ordem de Servico (OS)", "OS"]);
      if (!os) return null;
      return {
        os,
        identificacao: pick(r, ["Identificação", "Identificacao"]),
        tomador: pick(r, ["Tomador"]),
        codigoAmostra: pick(r, ["Código Amostra", "Codigo Amostra"]),
        tipo,
        categoria: classificarTipo(tipo),
        topo: pick(r, ["Topo (m)", "Topo"]),
        base: pick(r, ["Base (m)", "Base"]),
        coletadoPor: pick(r, ["Coletado por"]),
        dataColeta: pick(r, ["Data da Coleta"]),
      } satisfies AmostraColetada;
    })
    .filter((r): r is AmostraColetada => r !== null);
}

export async function parseAColetar(file: File): Promise<AmostraAColetar[]> {
  const rows = await readSheetRows(file);
  return rows
    .map((r) => {
      const tipo = pick(r, ["Tipo"]);
      const os = pick(r, ["Ordem de Serviço (OS)", "Ordem de Servico (OS)", "OS"]);
      if (!os) return null;
      return {
        os,
        identificacao: pick(r, ["Identificação", "Identificacao"]),
        tipo,
        categoria: classificarTipo(tipo),
        latLong: pick(r, ["Latitude/Longitude", "Lat/Long"]),
        status: pick(r, ["Status"]),
        dataFimOs: pick(r, ["Data Fim OS  (dd/mm/aaaa)", "Data Fim OS (dd/mm/aaaa)", "Data Fim OS"]),
        observacao: pick(r, ["Observação de Campo", "Observacao de Campo"]),
      } satisfies AmostraAColetar;
    })
    .filter((r): r is AmostraAColetar => r !== null);
}
