import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Autenticação direta com Google APIs usando Service Account (JWT).
 * Não necessita de bibliotecas adicionais, utiliza o módulo nativo `node:crypto` do Node.
 */

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function cleanPem(rawKey: string): string {
  const cleaned = rawKey.replace(/\\n/g, "\n").trim();
  const matches = cleaned.match(/-----BEGIN [A-Z ]+KEY-----([\s\S]*?)-----END [A-Z ]+KEY-----/);
  
  let base64Body = "";
  if (matches) {
    base64Body = matches[1].replace(/[\r\n\s]/g, "");
  } else {
    base64Body = cleaned.replace(/[\r\n\s]/g, "");
  }
  
  const chunks = base64Body.match(/.{1,64}/g) || [];
  return `-----BEGIN PRIVATE KEY-----\n${chunks.join("\n")}\n-----END PRIVATE KEY-----`;
}

function tryParseServiceAccount(rawStr: unknown): ServiceAccountKey | null {
  if (!rawStr || typeof rawStr !== "string") return null;

  const tryJson = (str: string) => {
    try {
      let parsed = JSON.parse(str);
      if (typeof parsed === "string") parsed = JSON.parse(parsed);
      if (parsed?.client_email && parsed?.private_key) return parsed;
    } catch { return null; }
    return null;
  };

  // 1. Direct parse
  const direct = tryJson(rawStr.trim());
  if (direct) return direct;

  // 2. Base64 parse
  try {
    const decoded = Buffer.from(rawStr.trim(), "base64").toString("utf-8");
    const base64Parsed = tryJson(decoded);
    if (base64Parsed) return base64Parsed;
  } catch {}

  return null;
}

function getServiceAccount(): ServiceAccountKey {
  const envs = typeof process !== "undefined" && process.env ? process.env : {};
  const metaEnv = typeof import.meta !== "undefined" && (import.meta as any).env ? (import.meta as any).env : {};

  const keysToTry = [
    envs.GOOGLE_SERVICE_ACCOUNT_JSON,
    envs.GOOGLE_SERVICE_ACCOUNT,
    envs.VITE_GOOGLE_SERVICE_ACCOUNT_JSON,
    metaEnv.GOOGLE_SERVICE_ACCOUNT_JSON,
    metaEnv.VITE_GOOGLE_SERVICE_ACCOUNT_JSON
  ];

  for (const key of keysToTry) {
    const parsed = tryParseServiceAccount(key);
    if (parsed) return { ...parsed, private_key: cleanPem(parsed.private_key) };
  }

  try {
    const localFile = path.join(process.cwd(), ".data", "service_account.json");
    if (fs.existsSync(localFile)) {
      const content = fs.readFileSync(localFile, "utf-8");
      const parsed = tryParseServiceAccount(content);
      if (parsed) return { ...parsed, private_key: cleanPem(parsed.private_key) };
    }
  } catch {}

  throw new Error(
    "Service Account não configurada. Defina a variável de ambiente GOOGLE_SERVICE_ACCOUNT_JSON ou coloque o arquivo em .data/service_account.json."
  );
}

function base64UrlEncode(objOrStr: object | string): string {
  const str = typeof objOrStr === "string" ? objOrStr : JSON.stringify(objOrStr);
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export async function getGoogleAccessToken(scopes = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive"
]): Promise<string> {
  const sa = getServiceAccount();

  if (cachedToken && Date.now() < cachedToken.expiresAt - 120_000) {
    return cachedToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: sa.client_email,
    scope: scopes.join(" "),
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const jwt = `${base64UrlEncode(header)}.${base64UrlEncode(claimSet)}`;

  const keyObj = crypto.createPrivateKey({
    key: sa.private_key,
    format: "pem",
  });
  
  const signature = crypto.sign("sha256", Buffer.from(jwt), keyObj).toString("base64url");
  const assertion = `${jwt}.${signature}`;

  const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: assertion,
    }).toString(),
  });

  if (!res.ok) throw new Error(`Falha ao obter token: ${await res.text()}`);

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };

  return cachedToken.token;
}

export function isGoogleAuthConfigured(): boolean {
  try {
    getServiceAccount();
    return true;
  } catch {
    return false;
  }
}
