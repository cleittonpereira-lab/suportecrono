import { createServerFn } from "@tanstack/react-start";
import { fetchDirectGoogleSheet } from "./sheets-read.server";
import { getGoogleAccessToken } from "./google-auth.server";
import { readStore, writeStore, type ProgramacaoData } from "./programacao-store.server";

/**
 * CRUD para o módulo "Programação de Ensaios" com dupla persistência:
 * - Google Sheets API (quando credenciais/abas existirem)
 * - Armazenamento local persistente em arquivo JSON (para funcionamento offline/local instantâneo)
 */

const GATEWAY = "https://connector-gateway.lovable.dev";
const GOOGLE_API = "https://sheets.googleapis.com/v4";

type Env = { LOVABLE_API_KEY: string; GOOGLE_SHEETS_API_KEY: string; PROGRAMACAO_SHEET_ID: string };

function env(): Env {
  const e = process.env as Record<string, string | undefined>;
  return {
    LOVABLE_API_KEY: e.LOVABLE_API_KEY ?? "",
    GOOGLE_SHEETS_API_KEY: e.GOOGLE_SHEETS_API_KEY ?? "",
    PROGRAMACAO_SHEET_ID: e.PROGRAMACAO_SHEET_ID || "1aIvXNugj-NKj38JsPUjcTvho8EOCizxH6FzKTfhGBw4",
  };
}

async function api(path: string, init?: RequestInit) {
  const e = env();
  const googleToken = await getGoogleAccessToken();

  if (googleToken) {
    const url = `${GOOGLE_API}/spreadsheets/${e.PROGRAMACAO_SHEET_ID}${path}`;
    const headers = new Headers(init?.headers || {});
    headers.set("Authorization", `Bearer ${googleToken}`);
    if (!headers.has("Content-Type") && init?.method && init.method !== "GET") {
      headers.set("Content-Type", "application/json");
    }
    const res = await fetch(url, { ...init, headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Sheets API ${res.status}: ${body.slice(0, 300)}`);
    }
    return res.json();
  }

  if (e.LOVABLE_API_KEY && e.GOOGLE_SHEETS_API_KEY) {
    const url = `${GATEWAY}/google_sheets/v4/spreadsheets/${e.PROGRAMACAO_SHEET_ID}${path}`;
    const headers = new Headers(init?.headers || {});
    headers.set("Authorization", `Bearer ${e.LOVABLE_API_KEY}`);
    headers.set("X-Connection-Api-Key", e.GOOGLE_SHEETS_API_KEY);
    if (!headers.has("Content-Type") && init?.method && init.method !== "GET") {
      headers.set("Content-Type", "application/json");
    }
    const res = await fetch(url, { ...init, headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Lovable Sheets API ${res.status}: ${body.slice(0, 300)}`);
    }
    return res.json();
  }

  throw new Error("Sem credenciais do Google API");
}

/* --------------------------------- Helpers ---------------------------------- */

function rowsToObjects(values: string[][]): Record<string, string>[] {
  if (!values || values.length === 0) return [];
  const [header, ...rows] = values;
  return rows.map((row) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => (obj[h] = row[i] ?? ""));
    return obj;
  });
}

function objectToRow(header: string[], obj: Record<string, unknown>): string[] {
  return header.map((h) => {
    const v = obj[h];
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    return String(v);
  });
}

const encodeRange = (r: string) => encodeURIComponent(r);

import { isGoogleAuthConfigured } from "./google-auth.server";

async function getAllValues(sheet: string): Promise<Record<string, string>[]> {
  const e = env();
  // 1. Tentar ler da API do Google se houver credenciais
  if (isGoogleAuthConfigured() || (e.LOVABLE_API_KEY && e.GOOGLE_SHEETS_API_KEY)) {
    try {
      const j = await api(`/values/${encodeRange(sheet)}`);
      const values = (j.values ?? []) as string[][];
      if (values.length > 0 && values[0].includes("id")) {
        return rowsToObjects(values);
      }
    } catch {
      // 2. Tentar leitura direta via CSV público da planilha de Programação
      try {
        const res = await fetchDirectGoogleSheet(e.PROGRAMACAO_SHEET_ID, sheet);
        if (res.values && res.values.length > 0 && res.values[0].includes("id")) {
          return rowsToObjects(res.values);
        }
      } catch {
        // Fallback
      }
    }
  }

  // 3. Usar o armazenamento local persistente (JSON) - instantâneo
  const store = readStore();
  const key = sheet as keyof ProgramacaoData;
  return store[key] || [];
}

/* --------------------------------- CRUD ---------------------------------- */

export const listRows = createServerFn({ method: "GET" })
  .inputValidator((d: { sheet: string }) => d)
  .handler(async ({ data }) => {
    return getAllValues(data.sheet);
  });

export const insertRow = createServerFn({ method: "POST" })
  .inputValidator((d: { sheet: string; row: Record<string, unknown> }) => d)
  .handler(async ({ data }) => {
    const id = (data.row.id as string) || crypto.randomUUID();
    const now = new Date().toISOString();
    const enriched = { ...data.row, id, created_at: now, updated_at: now } as Record<string, string>;

    // 1. Gravar no armazenamento local persistente imediatamente
    const store = readStore();
    const key = data.sheet as keyof ProgramacaoData;
    if (!store[key]) store[key] = [];
    store[key].push(enriched);
    writeStore(store);

    // 2. Sincronizar na API remota do Google — aguardado e com erro propagado
    // (não mascarado como sucesso), para que quem chamou perceba a falha e
    // tente novamente, em vez de a mudança nunca chegar à planilha que os
    // outros computadores leem.
    const e = env();
    if (isGoogleAuthConfigured() || (e.LOVABLE_API_KEY && e.GOOGLE_SHEETS_API_KEY)) {
      const header = Object.keys(enriched);
      const values = [objectToRow(header, enriched)];
      await api(
        `/values/${encodeRange(data.sheet)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: "POST", body: JSON.stringify({ values }) },
      );
    }

    return { id };
  });

export const updateRow = createServerFn({ method: "POST" })
  .inputValidator((d: { sheet: string; id: string; patch: Record<string, unknown> }) => d)
  .handler(async ({ data }) => {
    // 1. Gravar no armazenamento local imediatamente
    const store = readStore();
    const key = data.sheet as keyof ProgramacaoData;
    if (store[key]) {
      const idx = store[key].findIndex((r) => r.id === data.id);
      if (idx !== -1) {
        store[key][idx] = { ...store[key][idx], ...data.patch, updated_at: new Date().toISOString() } as Record<string, string>;
        writeStore(store);
      }
    }

    // 2. Atualizar via Google API — aguardado e com erro propagado (ver
    // comentário equivalente em insertRow).
    const e = env();
    if (isGoogleAuthConfigured() || (e.LOVABLE_API_KEY && e.GOOGLE_SHEETS_API_KEY)) {
      const all = await getAllValues(data.sheet);
      if (all.length > 0) {
        const header = Object.keys(all[0]);
        const idCol = header.indexOf("id");
        if (idCol !== -1) {
          const rowIdx = all.findIndex((r) => r.id === data.id);
          if (rowIdx !== -1) {
            const merged = { ...all[rowIdx], ...data.patch, updated_at: new Date().toISOString() };
            const rowValues = objectToRow(header, merged);
            await api(
              `/values/${encodeRange(`${data.sheet}!A${rowIdx + 2}`)}?valueInputOption=RAW`,
              { method: "PUT", body: JSON.stringify({ values: [rowValues] }) },
            );
          }
        }
      }
    }

    return { ok: true };
  });

export const deleteRow = createServerFn({ method: "POST" })
  .inputValidator((d: { sheet: string; id: string }) => d)
  .handler(async ({ data }) => {
    // 1. Deletar no armazenamento local imediatamente
    const store = readStore();
    const key = data.sheet as keyof ProgramacaoData;
    if (store[key]) {
      store[key] = store[key].filter((r) => r.id !== data.id);
      writeStore(store);
    }

    // 2. Deletar na API remota do Google — aguardado e com erro propagado
    // (ver comentário equivalente em insertRow).
    const e = env();
    if (isGoogleAuthConfigured() || (e.LOVABLE_API_KEY && e.GOOGLE_SHEETS_API_KEY)) {
      const j = await api(`?fields=sheets(properties(sheetId,title))`);
      const found = (j.sheets ?? []).find((s: any) => s.properties?.title === data.sheet);
      if (found) {
        const gid = found.properties.sheetId as number;
        const all = await getAllValues(data.sheet);
        const rowIdx = all.findIndex((r) => r.id === data.id);
        if (rowIdx !== -1) {
          await api(":batchUpdate", {
            method: "POST",
            body: JSON.stringify({
              requests: [
                {
                  deleteDimension: {
                    range: {
                      sheetId: gid,
                      dimension: "ROWS",
                      startIndex: rowIdx + 1,
                      endIndex: rowIdx + 2,
                    },
                  },
                },
              ],
            }),
          });
        }
      }
    }

    return { ok: true };
  });

export const ensureColumns = createServerFn({ method: "POST" })
  .inputValidator((d: { sheet: string; columns: string[] }) => d)
  .handler(async ({ data }) => {
    return { header: data.columns };
  });

export const listEquipamentos = createServerFn({ method: "GET" })
  .handler(async () => {
    return getAllValues("Equipamentos");
  });
