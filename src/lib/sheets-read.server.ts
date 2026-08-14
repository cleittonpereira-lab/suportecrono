import { getGoogleAccessToken } from "./google-auth.server.ts";

const SPREADSHEET_ID = "1V7mP2PfC2l877y6jjIOVXmt5ZzjEgLZIYVAe3Y4VD6c";

// Cache em memória
const TTL_MS = 5 * 60_000;
type Entry = { at: number; data: { values?: string[][] } };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<{ values?: string[][] }>>();

export function parseCsv(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentVal += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentVal += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentVal);
        currentVal = "";
      } else if (char === '\r') {
        // ignore \r
      } else if (char === '\n') {
        currentRow.push(currentVal);
        rows.push(currentRow);
        currentRow = [];
        currentVal = "";
      } else {
        currentVal += char;
      }
    }
  }
  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal);
    rows.push(currentRow);
  }
  return rows;
}

/**
 * Busca dados da planilha Google usando APENAS a API v4 oficial com Service Account.
 * A API v4 ignora filtros aplicados pelos usuários na planilha — dados sempre completos.
 * Não há fallback para GViz para evitar que filtros afetem os dados.
 */
export async function fetchDirectGoogleSheet(
  spreadsheetId: string,
  sheetName?: string,
): Promise<{ values?: string[][] }> {
  const token = await getGoogleAccessToken();
  const cleanRange = sheetName ? sheetName.replace(/^'|'$/g, "") : "Sheet1";
  const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(cleanRange)}`;

  const res = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (res.ok) {
    const data = (await res.json()) as { values?: string[][] };
    return { values: data.values || [] };
  }

  const errText = await res.text();
  throw new Error(`Google Sheets API v4 error (${res.status}): ${errText.slice(0, 300)}`);
}

export async function sheetsGetValues(
  url: string,
  _headers: Record<string, string> = {},
  opts: { ttlMs?: number } = {},
): Promise<{ values?: string[][] }> {
  const ttl = opts.ttlMs ?? TTL_MS;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttl) return hit.data;

  const pending = inflight.get(url);
  if (pending) return pending;

  const task = (async () => {
    // Extrair spreadsheetId e sheetName da URL
    const match = url.match(/spreadsheets\/([^\/]+)\/values\/([^?]+)/);
    if (!match) throw new Error(`URL inválida para sheetsGetValues: ${url}`);

    const spreadsheetId = match[1];
    const rawRange = decodeURIComponent(match[2]);
    const sheetName = rawRange.includes("!")
      ? rawRange.split("!")[0].replace(/^'|'$/g, "")
      : rawRange.replace(/^'|'$/g, "");

    const data = await fetchDirectGoogleSheet(spreadsheetId, sheetName);
    cache.set(url, { at: Date.now(), data });
    return data;
  })();

  inflight.set(url, task);
  try {
    return await task;
  } finally {
    inflight.delete(url);
  }
}

/** Invalida o cache após escritas. */
export function invalidateSheetsCache() {
  cache.clear();
}
