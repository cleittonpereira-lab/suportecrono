/**
 * Planilha da Programação (Google Sheets) — SÓ SERVIDOR.
 *
 * O app lê e grava a programação só no próprio banco (programacao_db.json).
 * A planilha virou espelho gerado pelo app: aqui ficam a leitura crua das abas
 * (para o reparo, que recupera o que só chegou a ela) e a regravação das abas
 * inteiras, cada valor na coluna do cabeçalho.
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

export async function abasExistentes(): Promise<string[]> {
  const j = await api("?fields=sheets(properties(title))");
  return (j.sheets ?? []).map((s: any) => String(s.properties?.title ?? ""));
}

/** Valores crus (sem interpretar cabeçalho) das abas pedidas que existem, numa ida só. */
export async function lerAbasCruas(abas: readonly string[]): Promise<AbaDaPlanilha[]> {
  const existentes = new Set(await abasExistentes());
  const pedir = abas.filter((a) => existentes.has(a));
  if (pedir.length === 0) return [];
  const qs = pedir.map((a) => `ranges=${encodeURIComponent(intervalo(a))}`).join("&");
  const j = await api(`/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE`);
  return pedir.map((aba, i) => ({
    aba,
    valores: ((j.valueRanges?.[i]?.values ?? []) as unknown[][]).map((linha) => linha.map((c) => (c == null ? "" : String(c)))),
  }));
}

/** Regrava as abas inteiras (cria a que faltar): limpa e escreve cabeçalho + linhas. */
export async function regravarAbas(abas: AbaDaPlanilha[]): Promise<void> {
  if (abas.length === 0) return;
  const existentes = new Set(await abasExistentes());
  const faltam = abas.filter((a) => !existentes.has(a.aba));
  if (faltam.length) {
    await api(":batchUpdate", {
      method: "POST",
      body: JSON.stringify({ requests: faltam.map((a) => ({ addSheet: { properties: { title: a.aba } } })) }),
    });
  }
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
