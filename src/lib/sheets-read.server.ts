import { getGoogleAccessToken } from "./google-auth.server.ts";

// Cache em memória de 5 minutos para performance instantânea
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

export async function fetchDirectGoogleSheet(spreadsheetId: string, sheetName?: string): Promise<{ values?: string[][] }> {
  // Google Sheets API v4 oficial com Service Account (ignora filtros do usuário, dados 100% reais)
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
  headers: Record<string, string> = {},
  opts: { ttlMs?: number } = {},
): Promise<{ values?: string[][] }> {
  const ttl = opts.ttlMs ?? TTL_MS;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttl) return hit.data;

  const pending = inflight.get(url);
  if (pending) return pending;

  const task = (async () => {
    // 1. Tentar autenticação direta via Google Service Account se configurado
    try {
      const googleToken = await getGoogleAccessToken();
      if (googleToken) {
        let targetUrl = url;
        if (targetUrl.includes("connector-gateway.lovable.dev/google_sheets/v4")) {
          targetUrl = targetUrl.replace("https://connector-gateway.lovable.dev/google_sheets/v4", "https://sheets.googleapis.com/v4");
        }
        const res = await fetch(targetUrl, {
          headers: {
            Authorization: `Bearer ${googleToken}`,
            "Content-Type": "application/json",
          },
        });
        if (res.ok) {
          const data = (await res.json()) as { values?: string[][] };
          cache.set(url, { at: Date.now(), data });
          return data;
        }
      }
    } catch (err) {
      console.warn("Google Service Account fetch error:", err);
    }

    // 2. Se houver gateway Lovable com chaves REAIS (não vazias), tentar rapidamente sem retry demorado
    const hasLovableKey = headers["Authorization"] && !headers["Authorization"].includes("undefined") && !headers["Authorization"].endsWith("Bearer ");
    const hasSheetsKey = headers["X-Connection-Api-Key"] && !headers["X-Connection-Api-Key"].includes("undefined") && headers["X-Connection-Api-Key"].length > 5;

    if (hasLovableKey && hasSheetsKey) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s max timeout
        const res = await fetch(url, { headers, signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = (await res.json()) as { values?: string[][] };
          cache.set(url, { at: Date.now(), data });
          return data;
        }
      } catch (err) {
        // gateway falhou ou timeout -> cai no fallback instantâneo
      }
    }

    // 3. Fallback direto da planilha pública (instantâneo)
    try {
      const match = url.match(/spreadsheets\/([^\/]+)\/values\/([^?]+)/);
      if (match) {
        const spreadsheetId = match[1];
        const rawRange = decodeURIComponent(match[2]);
        let sheetName: string | undefined;
        if (rawRange.includes("!")) {
          sheetName = rawRange.split("!")[0].replace(/^'|'$/g, "");
        } else {
          sheetName = rawRange.replace(/^'|'$/g, "");
        }
        const data = await fetchDirectGoogleSheet(spreadsheetId, sheetName);
        cache.set(url, { at: Date.now(), data });
        return data;
      }
    } catch (err) {
      console.warn("Direct Google Sheet fetch fallback failed:", err);
    }

    const stale = cache.get(url);
    if (stale) return stale.data;
    throw new Error(`Google Sheets fetch failed for ${url}`);
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
