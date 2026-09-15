/**
 * Planilha da Programação (Google Sheets) — SÓ SERVIDOR. Chamadas cruas à API;
 * quem decide o que ler e gravar é programacao-fonte.server.ts.
 */
import { getGoogleAccessToken, isGoogleAuthConfigured } from "./google-auth.server";
import type { AbaDaPlanilha } from "./programacao-reparo";

const GATEWAY = "https://connector-gateway.lovable.dev";
const GOOGLE_API = "https://sheets.googleapis.com/v4";

function env() {
  const e = process.env as Record<string, string | undefined>;
  return {
    LOVABLE_API_KEY: e.LOVABLE_API_KEY ?? "",
    GOOGLE_SHEETS_API_KEY: e.GOOGLE_SHEETS_API_KEY ?? "",
    PROGRAMACAO_SHEET_ID: e.PROGRAMACAO_SHEET_ID || "1aIvXNugj-NKj38JsPUjcTvho8EOCizxH6FzKTfhGBw4",
  };
}

export function planilhaConfigurada(): boolean {
  const e = env();
  return isGoogleAuthConfigured() || !!(e.LOVABLE_API_KEY && e.GOOGLE_SHEETS_API_KEY);
}

async function api(caminho: string, init?: RequestInit): Promise<any> {
  const e = env();
  const headers = new Headers(init?.headers || {});
  let url: string;
  if (isGoogleAuthConfigured()) {
    url = `${GOOGLE_API}/spreadsheets/${e.PROGRAMACAO_SHEET_ID}${caminho}`;
    headers.set("Authorization", `Bearer ${await getGoogleAccessToken()}`);
  } else if (e.LOVABLE_API_KEY && e.GOOGLE_SHEETS_API_KEY) {
    url = `${GATEWAY}/google_sheets/v4/spreadsheets/${e.PROGRAMACAO_SHEET_ID}${caminho}`;
    headers.set("Authorization", `Bearer ${e.LOVABLE_API_KEY}`);
    headers.set("X-Connection-Api-Key", e.GOOGLE_SHEETS_API_KEY);
  } else {
    throw new Error("A planilha da programação não está configurada (sem credenciais do Google).");
  }
  if (!headers.has("Content-Type") && init?.method && init.method !== "GET") {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const corpo = await res.text();
    throw new Error(`Planilha da programação: HTTP ${res.status} — ${corpo.slice(0, 300)}`);
  }
  return res.json();
}

/** Nome de aba em notação A1 (aspas por causa dos espaços e acentos). */
const intervalo = (aba: string, celula = "") => `'${aba.replace(/'/g, "''")}'${celula ? `!${celula}` : ""}`;

type InfoAba = { titulo: string; sheetId: number };
let abasEmCache: { em: number; abas: InfoAba[] } | null = null;

/** Abas da planilha (nome e id numérico), guardadas por 5 min — mudam raramente. */
export async function infoDasAbas(fresco = false): Promise<InfoAba[]> {
  if (!fresco && abasEmCache && Date.now() - abasEmCache.em < 5 * 60_000) return abasEmCache.abas;
  const j = await api("?fields=sheets(properties(sheetId,title))");
  const abas = (j.sheets ?? []).map((s: any) => ({
    titulo: String(s.properties?.title ?? ""),
    sheetId: Number(s.properties?.sheetId ?? 0),
  }));
  abasEmCache = { em: Date.now(), abas };
  return abas;
}

/**
 * Valores das abas pedidas que existem, numa ida só. Valores como aparecem na
 * planilha (o mesmo que o app sempre leu): data digitada à mão chega como texto.
 */
export async function lerAbasCruas(abas: readonly string[]): Promise<AbaDaPlanilha[]> {
  const existentes = new Set((await infoDasAbas()).map((a) => a.titulo));
  const pedir = abas.filter((a) => existentes.has(a));
  if (pedir.length === 0) return [];
  const qs = pedir.map((a) => `ranges=${encodeURIComponent(intervalo(a))}`).join("&");
  const j = await api(`/values:batchGet?${qs}`);
  return pedir.map((aba, i) => ({
    aba,
    valores: ((j.valueRanges?.[i]?.values ?? []) as unknown[][]).map((linha) => linha.map((c) => (c == null ? "" : String(c)))),
  }));
}

export async function gravarCabecalho(aba: string, cabecalho: string[]): Promise<void> {
  await api(`/values/${encodeURIComponent(intervalo(aba, "A1"))}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [cabecalho] }),
  });
}

/** Acrescenta linhas no fim da aba (já na ordem das colunas do cabeçalho). */
export async function acrescentarLinhas(aba: string, linhas: string[][]): Promise<void> {
  if (linhas.length === 0) return;
  await api(
    `/values/${encodeURIComponent(intervalo(aba, "A1"))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: linhas }) },
  );
}

/** Regrava a linha `pos` (1 = primeira linha da aba) a partir da coluna A. */
export async function gravarLinha(aba: string, pos: number, valores: string[]): Promise<void> {
  await api(`/values/${encodeURIComponent(intervalo(aba, `A${pos}`))}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ values: [valores] }),
  });
}

/** Apaga as linhas `posicoes` (1 = primeira linha da aba), de baixo para cima numa ida só. */
export async function apagarLinhas(aba: string, posicoes: number[]): Promise<void> {
  if (posicoes.length === 0) return;
  const info = (await infoDasAbas()).find((a) => a.titulo === aba);
  if (!info) throw new Error(`A aba "${aba}" não existe na planilha da programação.`);
  const requests = [...new Set(posicoes)]
    .sort((a, b) => b - a)
    .map((pos) => ({
      deleteDimension: { range: { sheetId: info.sheetId, dimension: "ROWS", startIndex: pos - 1, endIndex: pos } },
    }));
  await api(":batchUpdate", { method: "POST", body: JSON.stringify({ requests }) });
}

/** Regrava abas inteiras: limpa e escreve o conteúdo novo (cabeçalho + linhas). */
export async function regravarAbas(abas: AbaDaPlanilha[]): Promise<void> {
  if (abas.length === 0) return;
  await api("/values:batchClear", {
    method: "POST",
    body: JSON.stringify({ ranges: abas.map((a) => intervalo(a.aba)) }),
  });
  await api("/values:batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: abas.map((a) => ({ range: intervalo(a.aba, "A1"), values: a.valores })),
    }),
  });
}
