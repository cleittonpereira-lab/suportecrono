import { createServerFn } from "@tanstack/react-start";
import { fetchDirectGoogleSheet, invalidateSheetsCache as invalidateReadCache } from "./sheets-read.server.ts";
import { sheetsApiRequest } from "./sheets-client.server.ts";
import { readScheduleStore, writeScheduleStore } from "./schedule-store.server.ts";
import { isGoogleAuthConfigured } from "./google-auth.server.ts";

const SPREADSHEET_ID = "1V7mP2PfC2l877y6jjIOVXmt5ZzjEgLZIYVAe3Y4VD6c";
const SHEET_NAME = "CRONOGRAMA LABORATÓRIO";
const ENTREGUES_SHEET_NAME = "OS ENTREGUES";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";

/* ---------------------------------- Cache --------------------------------- */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 15_000;
let scheduleCache: CacheEntry<{
  title: string;
  sheetName: string;
  headers: string[];
  rows: ScheduleRow[];
}> | null = null;

export function invalidateSheetsCache(): void {
  scheduleCache = null;
  invalidateReadCache();
}

/* --------------------------------- Helpers ---------------------------------- */

export interface ScheduleRow {
  rowIndex: number;
  delta: string;
  dataPostagem: string;
  tomador: string;
  os: string;
  setor: string;
  laboratorio: string;
  dataEntrega: string;
  volumeComp: string;
  volumeCaract: string;
  mctc: string;
  mrs: string;
  escopo: string;
}

export function normalizeSetor(raw: string): string {
  if (!raw) return "";
  const s = raw.trim();
  if (s === "CONV" || s === "Convencionais") return "Convencionais";
  if (s === "ESP" || s === "Especiais") return "Especiais";
  if (s === "DOS" || s === "Dosagem") return "Dosagem";

  if (s.includes("/")) {
    const parts = s.split("/").map((p) => p.trim());
    const norm = parts.map((p) => {
      if (p === "CONV") return "Convencionais";
      if (p === "ESP") return "Especiais";
      if (p === "DOS") return "Dosagem";
      return p;
    });
    return norm.join(" / ");
  }

  return s;
}

/* --------------------------------- Queries ---------------------------------- */

export const fetchSchedule = createServerFn({ method: "GET" }).handler(
  async () => {
    if (scheduleCache && Date.now() - scheduleCache.timestamp < CACHE_TTL_MS) {
      return scheduleCache.data;
    }

    const data = await fetchDirectGoogleSheet(SPREADSHEET_ID, SHEET_NAME);
    const rows = data.values ?? [];
    const dataRows = rows.slice(4);

    const parsed: ScheduleRow[] = dataRows
      .map((row, idx) => ({ row, sheetRow: idx + 5 }))
      .filter(({ row }) => row[2]?.trim())
      .map(({ row, sheetRow }) => ({
        rowIndex: sheetRow,
        delta: row[0] ?? "",
        dataPostagem: row[1] ?? "",
        tomador: row[2] ?? "",
        os: row[3] ?? "",
        setor: normalizeSetor(row[4] ?? ""),
        laboratorio: row[5] ?? "",
        dataEntrega: row[6] ?? "",
        volumeComp: row[7] ?? "",
        volumeCaract: row[8] ?? "",
        mctc: row[9] ?? "",
        mrs: row[10] ?? "",
        escopo: row[15] ?? "",
      }));

    let finalRows = parsed;
    if (!isGoogleAuthConfigured()) {
      const store = readScheduleStore();
      finalRows = parsed
        .filter((r) => {
          const edit = store.edits[String(r.rowIndex)] || store.edits[r.os];
          return !edit?.movedToEntregues;
        })
        .map((r) => {
          const edit = store.edits[String(r.rowIndex)] || store.edits[r.os];
          if (edit) {
            return {
              ...r,
              dataPostagem: edit.dataPostagem !== undefined ? edit.dataPostagem : r.dataPostagem,
              setor: edit.setor !== undefined ? normalizeSetor(edit.setor) : r.setor,
              laboratorio: edit.laboratorio !== undefined ? edit.laboratorio : r.laboratorio,
              dataEntrega: edit.dataEntrega !== undefined ? edit.dataEntrega : r.dataEntrega,
              escopo: edit.escopo !== undefined ? edit.escopo : r.escopo,
            };
          }
          return r;
        });

      // Adiciona linhas novas criadas localmente
      store.newRows.forEach((nr, idx) => {
        if (!nr.movedToEntregues) {
          finalRows.push({
            rowIndex: nr.rowIndex || 999000 + idx,
            delta: "",
            dataPostagem: nr.dataPostagem || "",
            tomador: nr.tomador || "",
            os: nr.os || "",
            setor: normalizeSetor(nr.setor || ""),
            laboratorio: nr.laboratorio || "",
            dataEntrega: nr.dataEntrega || "",
            volumeComp: nr.volumeComp || "",
            volumeCaract: nr.volumeCaract || "",
            mctc: nr.mctc || "",
            mrs: nr.mrs || "",
            escopo: nr.escopo || "",
          });
        }
      });
    }

    const result = {
      title: "GERAL - CRONOGRAMAS (LAB)",
      sheetName: SHEET_NAME,
      headers: [
        "DELTA",
        "DATA POSTAGEM",
        "TOMADOR",
        "OS",
        "SETOR",
        "LABORATÓRIO",
        "DATA ENTREGA",
        "VOL. COMP.",
        "VOL. CARACT.",
        "MCT.C",
        "MR.S",
        "ESCOPO",
      ],
      rows: finalRows,
    };

    scheduleCache = { data: result, timestamp: Date.now() };
    return result;
  },
);

export interface EntregueRow {
  delta: string;
  dataPostagem: string;
  tomador: string;
  os: string;
  setor: string;
  laboratorio: string;
  dataProgramada: string;
  volumeComp: string;
  volumeCaract: string;
  volumeEspec: string;
  capacidade: string;
  escopo: string;
}

export const fetchEntregues = createServerFn({ method: "GET" }).handler(
  async () => {
    const data = await fetchDirectGoogleSheet(SPREADSHEET_ID, ENTREGUES_SHEET_NAME);
    const rows = data.values ?? [];
    const dataRows = rows.slice(2);

    const parsed: EntregueRow[] = dataRows
      .filter((row) => row[2]?.trim())
      .map((row) => ({
        delta: row[0] ?? "",
        dataPostagem: row[1] ?? "",
        tomador: row[2] ?? "",
        os: row[3] ?? "",
        setor: normalizeSetor(row[4] ?? ""),
        laboratorio: row[5] ?? "",
        dataProgramada: row[6] ?? "",
        volumeComp: row[7] ?? "",
        volumeCaract: row[8] ?? "",
        volumeEspec: row[9] ?? "",
        capacidade: row[10] ?? "",
        escopo: row[11] ?? "",
      }));

    // Mescla itens movidos para entregues no armazenamento local
    const store = readScheduleStore();
    store.entreguesRows.forEach((r) => {
      parsed.push({
        delta: r.volumeComp || "",
        dataPostagem: r.dataPostagem || "",
        tomador: r.tomador || "",
        os: r.os || "",
        setor: normalizeSetor(r.setor || ""),
        laboratorio: r.laboratorio || "",
        dataProgramada: r.dataEntrega || "",
        volumeComp: r.volumeComp || "",
        volumeCaract: r.volumeCaract || "",
        volumeEspec: "",
        capacidade: "",
        escopo: r.escopo || "",
      });
    });

    return {
      title: "OS ENTREGUES",
      sheetName: ENTREGUES_SHEET_NAME,
      rows: parsed,
    };
  },
);

/* --------------------------------- Mutations ---------------------------------- */

export const updateScheduleRow = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      rowIndex: number;
      dataPostagem?: string;
      setor?: string;
      laboratorio?: string;
      dataEntrega?: string;
      escopo?: string;
    }) => d,
  )
  .handler(async ({ data }) => {
    if (!data.rowIndex || data.rowIndex < 5) {
      throw new Error("rowIndex inválido");
    }

    const sheet = `'${SHEET_NAME}'`;
    const updates: { range: string; values: string[][] }[] = [];
    const push = (col: string, value: string | undefined) => {
      if (value === undefined) return;
      updates.push({
        range: `${sheet}!${col}${data.rowIndex}`,
        values: [[value]],
      });
    };
    push("B", data.dataPostagem);
    push("E", data.setor);
    push("F", data.laboratorio);
    push("G", data.dataEntrega);
    push("P", data.escopo);

    if (updates.length > 0) {
      const response = await sheetsApiRequest(`/values:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({
          valueInputOption: "USER_ENTERED",
          data: updates,
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        console.error("Erro Google Sheets batchUpdate:", response.status, errText);
        throw new Error(`Erro ao salvar no Google Sheets (${response.status}): ${errText}`);
      }
      invalidateSheetsCache();
      return { updated: updates.length };
    }

    return { updated: 0 };
  });

async function getSheetId(sheetTitle: string): Promise<number> {
  return (await getSheetProperties(sheetTitle)).sheetId;
}

async function getSheetProperties(
  sheetTitle: string,
): Promise<{ sheetId: number; rowCount: number }> {
  const response = await sheetsApiRequest(`?fields=sheets.properties`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets API error: ${response.status} ${text}`);
  }
  const data = (await response.json()) as {
    sheets?: {
      properties?: {
        sheetId?: number;
        title?: string;
        gridProperties?: { rowCount?: number };
      };
    }[];
  };
  const sheet = data.sheets?.find((s) => s.properties?.title === sheetTitle);
  if (!sheet?.properties?.sheetId && sheet?.properties?.sheetId !== 0) {
    throw new Error(`Aba "${sheetTitle}" não encontrada`);
  }
  return {
    sheetId: sheet.properties.sheetId as number,
    rowCount: sheet.properties.gridProperties?.rowCount ?? 0,
  };
}

async function appendOneRow(sheetTitle: string): Promise<void> {
  const { sheetId } = await getSheetProperties(sheetTitle);
  await sheetsApiRequest(`:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          appendDimension: {
            sheetId,
            dimension: "ROWS",
            length: 1,
          },
        },
      ],
    }),
  });
}

export const moveScheduleRowToEntregues = createServerFn({ method: "POST" })
  .inputValidator((d: { rowIndex: number; dataPostagem?: string }) => d)
  .handler(async ({ data }) => {
    if (!data.rowIndex || data.rowIndex < 5) {
      throw new Error("rowIndex inválido");
    }

    const readRange = `'${SHEET_NAME}'!A${data.rowIndex}:P${data.rowIndex}`;
    const readRes = await sheetsApiRequest(`/values/${readRange}`);
    if (!readRes.ok) {
      const err = await readRes.text();
      throw new Error(`Falha ao ler linha para mover (${readRes.status}): ${err}`);
    }

    const readData = (await readRes.json()) as { values?: string[][] };
    const current = readData.values?.[0] ?? [];
    if (!current[2]?.trim()) {
      throw new Error("Linha vazia ou tomador não encontrado");
    }

    const today = (() => {
      const n = new Date();
      return `${String(n.getDate()).padStart(2, "0")}/${String(n.getMonth() + 1).padStart(2, "0")}/${n.getFullYear()}`;
    })();
    const rowToAppend: string[] = [];
    for (let i = 0; i < 11; i++) rowToAppend.push(current[i] ?? "");
    rowToAppend[1] = data.dataPostagem ?? today;
    rowToAppend.push(current[15] ?? "");

    const scanRange = `'${ENTREGUES_SHEET_NAME}'!A1:L20000`;
    const scanRes = await sheetsApiRequest(`/values/${scanRange}`);
    if (!scanRes.ok) {
      const err = await scanRes.text();
      throw new Error(`Falha ao escanear OS Entregues (${scanRes.status}): ${err}`);
    }

    const scanData = (await scanRes.json()) as { values?: string[][] };
    const allRows = scanData.values ?? [];
    let lastFilled = 0;
    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i] ?? [];
      if (row.some((cell) => (cell ?? "").toString().trim() !== "")) lastFilled = i + 1;
    }
    const targetRow = Math.max(lastFilled + 1, 3);
    await appendOneRow(ENTREGUES_SHEET_NAME);
    const writeRange = `'${ENTREGUES_SHEET_NAME}'!A${targetRow}:L${targetRow}`;
    const writeRes = await sheetsApiRequest(`/values/${writeRange}?valueInputOption=USER_ENTERED`, {
      method: "PUT",
      body: JSON.stringify({ range: writeRange, majorDimension: "ROWS", values: [rowToAppend] }),
    });
    if (!writeRes.ok) {
      const err = await writeRes.text();
      throw new Error(`Falha ao gravar em OS Entregues (${writeRes.status}): ${err}`);
    }

    const sheetId = await getSheetId(SHEET_NAME);
    const delRes = await sheetsApiRequest(`:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: data.rowIndex - 1, endIndex: data.rowIndex } } }],
      }),
    });
    if (!delRes.ok) {
      const err = await delRes.text();
      throw new Error(`Falha ao remover linha do Cronograma (${delRes.status}): ${err}`);
    }

    invalidateSheetsCache();
    return { moved: true };
  });

export const createScheduleRow = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      dataPostagem?: string;
      tomador: string;
      os: string;
      setor?: string;
      laboratorio?: string;
      dataEntrega?: string;
      volumeComp?: string;
      volumeCaract?: string;
      mctc?: string;
      mrs?: string;
      escopo?: string;
    }) => d,
  )
  .handler(async ({ data }) => {
    if (!data.tomador?.trim()) {
      throw new Error("Tomador obrigatório");
    }

    const scanRange = `'${SHEET_NAME}'!A1:K20000`;
    const scanRes = await sheetsApiRequest(`/values/${scanRange}`);
    if (!scanRes.ok) {
      const err = await scanRes.text();
      throw new Error(`Falha ao ler linhas da planilha (${scanRes.status}): ${err}`);
    }

    const scanData = (await scanRes.json()) as { values?: string[][] };
    const allRows = scanData.values ?? [];
    let lastFilled = 0;
    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i] ?? [];
      if (row.some((c) => (c ?? "").toString().trim() !== "")) lastFilled = i + 1;
    }
    const targetRow = Math.max(lastFilled + 1, 5);
    await appendOneRow(SHEET_NAME);
    const rowAK: string[] = [
      "", data.dataPostagem ?? "", data.tomador ?? "", data.os ?? "",
      data.setor ?? "", data.laboratorio ?? "", data.dataEntrega ?? "",
      data.volumeComp ?? "", data.volumeCaract ?? "", data.mctc ?? "", data.mrs ?? "",
    ];
    const updates = [
      { range: `'${SHEET_NAME}'!A${targetRow}:K${targetRow}`, values: [rowAK] },
      { range: `'${SHEET_NAME}'!P${targetRow}`, values: [[data.escopo ?? ""]] },
    ];
    const writeRes = await sheetsApiRequest(`/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ valueInputOption: "USER_ENTERED", data: updates }),
    });
    if (!writeRes.ok) {
      const err = await writeRes.text();
      throw new Error(`Falha ao gravar nova OS na planilha (${writeRes.status}): ${err}`);
    }

    invalidateSheetsCache();
    return { created: true, rowIndex: targetRow };
  });

export const deleteScheduleRow = createServerFn({ method: "POST" })
  .inputValidator((d: { rowIndex: number }) => d)
  .handler(async ({ data }) => {
    if (!data.rowIndex || data.rowIndex < 5) {
      throw new Error("rowIndex inválido");
    }

    const sheetId = await getSheetId(SHEET_NAME);
    const res = await sheetsApiRequest(`:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: data.rowIndex - 1, endIndex: data.rowIndex } } }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Falha ao excluir linha da planilha (${res.status}): ${err}`);
    }

    invalidateSheetsCache();
    return { deleted: true };
  });
