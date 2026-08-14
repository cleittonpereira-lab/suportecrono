import { getGoogleAccessToken } from "./google-auth.server.ts";

const SPREADSHEET_ID = "1V7mP2PfC2l877y6jjIOVXmt5ZzjEgLZIYVAe3Y4VD6c";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";
const GOOGLE_API_URL = "https://sheets.googleapis.com/v4";

export interface GoogleSheetsClient {
  fetchUrl(path: string, init?: RequestInit): Promise<Response>;
}

export async function sheetsApiRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const googleToken = await getGoogleAccessToken();
  if (googleToken) {
    const url = `${GOOGLE_API_URL}/spreadsheets/${SPREADSHEET_ID}${path}`;
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${googleToken}`);
    if (!headers.has("Content-Type") && init.method && init.method !== "GET") {
      headers.set("Content-Type", "application/json");
    }
    return fetch(url, { ...init, headers });
  }

  const lovableKey = process.env.LOVABLE_API_KEY;
  const sheetsKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (lovableKey && sheetsKey) {
    const url = `${GATEWAY_URL}/spreadsheets/${SPREADSHEET_ID}${path}`;
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${lovableKey}`);
    headers.set("X-Connection-Api-Key", sheetsKey);
    if (!headers.has("Content-Type") && init.method && init.method !== "GET") {
      headers.set("Content-Type", "application/json");
    }
    return fetch(url, { ...init, headers });
  }

  throw new Error("Nenhuma credencial configurada (defina GOOGLE_SERVICE_ACCOUNT_JSON ou LOVABLE_API_KEY + GOOGLE_SHEETS_API_KEY)");
}
