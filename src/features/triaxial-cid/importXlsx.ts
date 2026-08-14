/**
 * Importador de planilha OWNTEC (.xlsx) para um CP triaxial CID.
 *
 * A planilha da OWNTEC costuma vir em uma tabela única com a coluna "Etapa"
 * separando "Adens. Inc." e "Ruptura Dren.". Algumas exportações podem vir
 * com blocos separados; por isso o parser tenta primeiro o layout OWNTEC
 * tabular e, se não achar, cai no modo por seções.
 *
 * O parser é tolerante: varre todas as abas e identifica os cabeçalhos por
 * palavra-chave; a partir daí percorre linhas numéricas até encontrar uma
 * linha em branco ou nova seção. O número do ensaio é extraído do nome do
 * arquivo (sem extensão).
 */
import * as XLSX from "xlsx";
import type { ConsolidationReading, ShearReading } from "./types";

export interface ImportedRawData {
  /** Código extraído do nome do arquivo (sem extensão). */
  code: string;
  /** Nome original do arquivo importado. */
  filename: string;
  /** Número do ensaio (coluna "NT") identificado na planilha. */
  nt: string;
  consolidation: ConsolidationReading[];
  shear: ShearReading[];
}

/** Etapa detectada dentro de um NT. */
export interface OwnTecEtapa {
  /** Rótulo bruto (ex.: "Adens. Inc.", "Ruptura Dren.", "Ruptura N/Dren."). */
  name: string;
  /** Nº de linhas encontradas para a etapa. */
  count: number;
  /** Tensão confinante corrigida média [kPa], se disponível. */
  sigmaAvg: number | null;
  /** true se a etapa é de ruptura drenada (CID). */
  isDrained: boolean;
  /** true se a etapa é de ruptura NÃO drenada (CIU/UU). */
  isUndrained: boolean;
}

/** Ensaio (agrupado por NT) encontrado na planilha OWNTEC. */
export interface OwnTecTestSummary {
  /** Nº do ensaio (coluna NT). */
  nt: string;
  /** Código/ID quando presente. */
  code: string;
  etapas: OwnTecEtapa[];
  hasDrained: boolean;
  hasUndrained: boolean;
  /** Tensão confinante média da ruptura (para exibição). */
  sigmaRupture: number | null;
  /** Tensão confinante média do adensamento (fallback para exibição). */
  sigmaAdens: number | null;
  /** Aba onde foi encontrado. */
  sheet: string;
}

export class MultipleOwnTecTestsError extends Error {
  constructor(public readonly tests: OwnTecTestSummary[]) {
    super("Múltiplos ensaios (NT) encontrados no arquivo.");
    this.name = "MultipleOwnTecTestsError";
  }
}

type Grid = (string | number | null)[][];

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

function findOwnTecHeader(grid: Grid): { row: number; cols: Record<string, number> } | null {
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const row = grid[r];
    if (!row) continue;
    const cols: Record<string, number> = {};
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cellHas(cell, "etapa")) cols.etapa = c;
      if (cellHas(cell, "tempo", "min")) cols.tempo = c;
      if (cellHas(cell, "tc", "corrigid")) cols.tcCorr = c;
      if (cellHas(cell, "poropressao") && !cellHas(cell, "abs")) cols.poropressao = c;
      if (cellHas(cell, "def", "axial")) cols.defAxial = c;
      if (cellHas(cell, "var", "volume", "acum") && cellHas(cell, "cm3")) cols.volumeAcum = c;
      if (cellHas(cell, "var", "volume") && cellHas(cell, "cm3") && !cellHas(cell, "acum")) cols.varVolume = c;
      if (cellHas(cell, "cv", "kg") && !cellHas(cell, "abs")) cols.carga = c;
      if (cellHas(cell, "dv", "acum")) cols.dvAcum = c;
      if (norm(cell) === "id") cols.id = c;
      if (norm(cell) === "nt") cols.nt = c;
    }
    if (cols.etapa != null && (cols.defAxial != null || cols.varVolume != null || cols.tempo != null)) {
      return { row: r, cols };
    }
  }
  return null;
}

function parseOwnTecTable(grid: Grid, selectedNT?: string) {
  const hdr = findOwnTecHeader(grid);
  if (!hdr)
    return {
      consolidation: [] as ConsolidationReading[],
      shear: [] as ShearReading[],
      code: "",
      hasHeader: false,
      etapas: new Set<string>(),
      hasDrained: false,
      hasUndrained: false,
      tests: [] as OwnTecTestSummary[],
    };

  const { cols } = hdr;
  const consolidation: ConsolidationReading[] = [];
  const shear: ShearReading[] = [];
  let firstAdensDvAbs: number | null = null;
  let code = "";
  const etapas = new Set<string>();
  let hasDrained = false;
  let hasUndrained = false;

  // Agrupamento por NT para o resumo (sem depender de selectedNT).
  type Agg = {
    nt: string;
    code: string;
    etapas: Map<string, { count: number; tcSum: number; tcN: number; isDrained: boolean; isUndrained: boolean }>;
  };
  const byNt = new Map<string, Agg>();

  for (let r = hdr.row + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    const etapaRaw = norm(row[cols.etapa]);
    const etapa = etapaRaw.replace(/[\/\-_.]/g, " ").replace(/\s+/g, " ");
    if (!etapa) continue;
    const isUndrained = /\bn(ao)?\s+dren/.test(etapa);
    const isDrained = etapa.includes("dren") && !isUndrained;

    // NT desta linha (fallback: ID).
    const ntRaw =
      (cols.nt != null && row[cols.nt] != null ? String(row[cols.nt]).trim() : "") ||
      (cols.id != null && row[cols.id] != null ? String(row[cols.id]).trim() : "");
    const nt = ntRaw || "(sem NT)";

    // Nome de etapa "bonito" usando o rótulo original (não normalizado).
    const etapaOriginal = String(row[cols.etapa] ?? "").trim() || etapa;
    const tcVal = cols.tcCorr != null ? asNum(row[cols.tcCorr]) : null;
    let agg = byNt.get(nt);
    if (!agg) {
      agg = { nt, code: ntRaw, etapas: new Map() };
      byNt.set(nt, agg);
    }
    let eagg = agg.etapas.get(etapaOriginal);
    if (!eagg) {
      eagg = { count: 0, tcSum: 0, tcN: 0, isDrained, isUndrained };
      agg.etapas.set(etapaOriginal, eagg);
    }
    eagg.count++;
    if (tcVal != null) {
      eagg.tcSum += tcVal;
      eagg.tcN++;
    }

    // Filtro por NT: se um NT foi selecionado, só extrai dados dele.
    if (selectedNT != null && ntRaw !== selectedNT) continue;

    etapas.add(etapa);
    if (etapa.includes("ruptura")) {
      if (isDrained) hasDrained = true;
      else hasUndrained = true;
    }
    if (!code && ntRaw) code = ntRaw;

    if (etapa.includes("adens")) {
      const t = cols.tempo != null ? asNum(row[cols.tempo]) : null;
      let dv: number | null = null;
      const acumCol = cols.volumeAcum ?? cols.dvAcum;
      if (acumCol != null) {
        const dvAbs = asNum(row[acumCol]);
        if (dvAbs != null) {
          if (firstAdensDvAbs == null) firstAdensDvAbs = dvAbs;
          dv = dvAbs - firstAdensDvAbs;
        }
      }
      if (dv == null && cols.varVolume != null) dv = asNum(row[cols.varVolume]);
      if (t != null && dv != null) consolidation.push({ t, dv });
      continue;
    }

    // Para CID importamos apenas a etapa "Ruptura Dren." (drenada)
    if (etapa.includes("ruptura") && isDrained) {
      const eaPct = cols.defAxial != null ? asNum(row[cols.defAxial]) : null;
      if (eaPct == null) continue;
      shear.push({
        eaPct,
        F: 0,
        dvPct: 0,
        dVcm3: cols.varVolume != null ? asNum(row[cols.varVolume]) ?? undefined : undefined,
        sigma3Corr: cols.tcCorr != null ? asNum(row[cols.tcCorr]) ?? undefined : undefined,
        uPore: cols.poropressao != null ? asNum(row[cols.poropressao]) ?? undefined : undefined,
        loadKgf: cols.carga != null ? asNum(row[cols.carga]) ?? undefined : undefined,
      });
    }
  }

  // Monta o resumo por NT.
  const tests: OwnTecTestSummary[] = [];
  for (const agg of byNt.values()) {
    const etapasList: OwnTecEtapa[] = [];
    let hasDr = false;
    let hasUn = false;
    let sigmaRupture: number | null = null;
    let sigmaAdens: number | null = null;
    for (const [name, e] of agg.etapas) {
      const sigmaAvg = e.tcN ? e.tcSum / e.tcN : null;
      etapasList.push({ name, count: e.count, sigmaAvg, isDrained: e.isDrained, isUndrained: e.isUndrained });
      const low = norm(name);
      if (low.includes("ruptura")) {
        if (e.isDrained) hasDr = true;
        else hasUn = true;
        if (sigmaAvg != null && sigmaRupture == null) sigmaRupture = sigmaAvg;
      } else if (low.includes("adens") && sigmaAvg != null) {
        sigmaAdens = sigmaAvg;
      }
    }
    tests.push({
      nt: agg.nt,
      code: agg.code,
      etapas: etapasList,
      hasDrained: hasDr,
      hasUndrained: hasUn,
      sigmaRupture,
      sigmaAdens,
      sheet: "",
    });
  }

  return { consolidation, shear, code, hasHeader: true, etapas, hasDrained, hasUndrained, tests };
}

function findHeaderRow(
  grid: Grid,
  fromRow: number,
  keywords: string[],
): { row: number; cols: Record<string, number> } | null {
  for (let r = fromRow; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    const cols: Record<string, number> = {};
    for (let c = 0; c < row.length; c++) {
      const cell = norm(row[c]);
      for (const kw of keywords) {
        if (cell.includes(kw) && cols[kw] == null) cols[kw] = c;
      }
    }
    // considera cabeçalho se pelo menos 2 das palavras-chave foram encontradas
    if (Object.keys(cols).length >= 2) return { row: r, cols };
  }
  return null;
}

function readNumericRows(
  grid: Grid,
  startRow: number,
  keyCol: number,
  maxRows = 5000,
): number[] {
  const rows: number[] = [];
  for (let r = startRow; r < grid.length && rows.length < maxRows; r++) {
    const row = grid[r];
    if (!row) break;
    const v = asNum(row[keyCol]);
    if (v == null) {
      // permite até 1 linha vazia (cabeçalho secundário) sem interromper
      if (rows.length === 0) continue;
      break;
    }
    rows.push(r);
  }
  return rows;
}

function findSection(grid: Grid, marker: string): number {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      if (norm(row[c]).includes(marker)) return r;
    }
  }
  return -1;
}

/**
 * Escaneia a planilha OWNTEC e retorna a lista de ensaios (agrupados por NT)
 * encontrados, junto com as etapas de cada um. Não extrai dados numéricos —
 * apenas o inventário para o usuário escolher qual NT importar.
 */
export function listOwnTecTests(buffer: ArrayBuffer): OwnTecTestSummary[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const all: OwnTecTestSummary[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
      header: 1,
      defval: null,
      raw: true,
    }) as Grid;
    const table = parseOwnTecTable(grid);
    for (const t of table.tests) all.push({ ...t, sheet: sheetName });
  }
  // Deduplica por NT (mantém o primeiro encontrado).
  const seen = new Set<string>();
  return all.filter((t) => {
    if (seen.has(t.nt)) return false;
    seen.add(t.nt);
    return true;
  });
}

export function parseOwnTecXlsx(
  buffer: ArrayBuffer,
  filename: string,
  opts: { selectedNT?: string } = {},
): ImportedRawData {
  const wb = XLSX.read(buffer, { type: "array" });
  const consolidation: ConsolidationReading[] = [];
  const shear: ShearReading[] = [];
  let detectedCode = "";
  let sawHeader = false;
  let sawDrained = false;
  let sawUndrained = false;
  let sectionUndrained = false;
  let sectionDrained = false;

  // Inventário para decidir se precisa perguntar ao usuário.
  const inventory = listOwnTecTests(buffer);
  if (inventory.length > 1 && !opts.selectedNT) {
    throw new MultipleOwnTecTestsError(inventory);
  }
  const selectedNT = opts.selectedNT ?? (inventory[0]?.nt ?? undefined);

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
      header: 1,
      defval: null,
      raw: true,
    }) as Grid;

    const table = parseOwnTecTable(grid, selectedNT);
    if (table.hasHeader) sawHeader = true;
    if (table.hasDrained) sawDrained = true;
    if (table.hasUndrained) sawUndrained = true;
    if (!detectedCode && table.code) detectedCode = table.code;
    if (!consolidation.length && table.consolidation.length) consolidation.push(...table.consolidation);
    if (!shear.length && table.shear.length) shear.push(...table.shear);

    // ==== Adensamento ====
    if (!consolidation.length) {
      const adRow = findSection(grid, "adensamento");
      if (adRow >= 0) {
        const hdr = findHeaderRow(grid, adRow, ["tempo", "min", "vol", "volume", "dv"]);
        if (hdr) {
          const tCol =
            hdr.cols["tempo"] ?? hdr.cols["min"] ?? Object.values(hdr.cols)[0];
          const dvCol =
            hdr.cols["vol"] ?? hdr.cols["volume"] ?? hdr.cols["dv"] ?? tCol + 1;
          const rows = readNumericRows(grid, hdr.row + 1, tCol);
          for (const r of rows) {
            const t = asNum(grid[r][tCol]);
            const dv = asNum(grid[r][dvCol]);
            if (t != null && dv != null) consolidation.push({ t, dv });
          }
        }
      }
    }

    // ==== Ruptura ====
    if (!shear.length) {
      // Varre todas as linhas para identificar rótulos de ruptura (dren/não dren)
      for (let r = 0; r < grid.length; r++) {
        const row = grid[r];
        if (!row) continue;
        for (const cell of row) {
          const t = norm(cell).replace(/[\/\-_.]/g, " ").replace(/\s+/g, " ");
          if (!t.includes("ruptura")) continue;
          // "n/dren", "n dren", "nao dren", "não dren", "não drenada"
          if (/\bn(ao)?\s+dren/.test(t)) {
            sectionUndrained = true;
          } else if (t.includes("dren")) {
            sectionDrained = true;
          } else {
            // "Ruptura" sem qualificador — pode ser CIU/UU; marca como suspeito
            sectionUndrained = true;
          }
        }
      }
      const rpRow = findSection(grid, "ruptura dren");
      if (rpRow >= 0) {
        sectionDrained = true;
        const hdr = findHeaderRow(grid, rpRow, [
          "def",
          "axial",
          "poropress",
          "carga",
          "cv",
          "var",
          "volume",
          "tc",
          "corrigid",
        ]);
        if (hdr) {
          const eaCol = hdr.cols["def"] ?? hdr.cols["axial"];
          const dvCol = hdr.cols["var"] ?? hdr.cols["volume"];
          const tcCol = hdr.cols["tc"] ?? hdr.cols["corrigid"];
          const uCol = hdr.cols["poropress"];
          const cvCol = hdr.cols["cv"] ?? hdr.cols["carga"];
          if (eaCol != null) {
            const rows = readNumericRows(grid, hdr.row + 1, eaCol);
            for (const r of rows) {
              const eaPct = asNum(grid[r][eaCol]);
              if (eaPct == null) continue;
              const dVcm3 = dvCol != null ? asNum(grid[r][dvCol]) ?? undefined : undefined;
              const sigma3Corr = tcCol != null ? asNum(grid[r][tcCol]) ?? undefined : undefined;
              const uPore = uCol != null ? asNum(grid[r][uCol]) ?? undefined : undefined;
              const loadKgf = cvCol != null ? asNum(grid[r][cvCol]) ?? undefined : undefined;
              shear.push({
                eaPct,
                F: 0,
                dvPct: 0, // recalculado abaixo a partir de dVcm3/V0 no motor de cálculo
                dVcm3,
                sigma3Corr,
                uPore,
                loadKgf,
              });
            }
          }
        }
      }
    }
  }

  // Gatilho de segurança: rejeitar ensaios que não sejam CID.
  // Rejeita se:
  //  (a) cabeçalho OWNTEC identificado mas sem "Ruptura Dren.", ou
  //  (b) modo por seções encontrou apenas "Ruptura" (sem "Dren.") ou
  //      explicitamente "Ruptura NÃO Dren." (CIU/UU).
  const anyDrained = sawDrained || sectionDrained;
  const anyUndrainedOnly = (sawUndrained || sectionUndrained) && !anyDrained;
  if ((sawHeader && !sawDrained) || anyUndrainedOnly) {
    throw new Error(
      (sawUndrained || sectionUndrained)
        ? "Arquivo rejeitado: contém apenas etapa de ruptura NÃO DRENADA (CIU/UU). Este módulo aceita apenas ensaios CID (Ruptura Dren.)."
        : "Arquivo rejeitado: nenhuma etapa 'Ruptura Dren.' encontrada. Este módulo aceita apenas ensaios CID.",
    );
  }

  const code = detectedCode || filename.replace(/\.[^./\\]+$/, "").replace(/[\\/]/g, "_").trim();
  return { code, filename, nt: detectedCode, consolidation, shear };
}
