import crypto from "crypto";

/**
 * Autenticação direta com Google APIs usando Service Account (JWT).
 * Não necessita de bibliotecas adicionais, utiliza o módulo nativo `crypto` do Node.
 */

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

import fs from "fs";
import path from "path";

function getServiceAccount(): ServiceAccountKey | null {
  const tryParse = (str: string | undefined): ServiceAccountKey | null => {
    if (!str) return null;
    try {
      const parsed = JSON.parse(str);
      if (parsed.client_email && parsed.private_key) {
        return parsed;
      }
    } catch {
      // ignore
    }
    return null;
  };

  // 1. Try env variable
  const fromEnv = tryParse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT);
  if (fromEnv) return fromEnv;

  // 2. Try local file
  const localFile = path.join(process.cwd(), ".data", "service_account.json");
  if (fs.existsSync(localFile)) {
    try {
      const content = fs.readFileSync(localFile, "utf-8");
      const fromFile = tryParse(content);
      if (fromFile) return fromFile;
    } catch {
      // ignore
    }
  }

  return null;
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
]): Promise<string | null> {
  const sa = getServiceAccount();
  if (!sa) return null;

  // Cache do token (com margem de segurança de 2 minutos)
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

  const encodedHeader = base64UrlEncode(header);
  const encodedClaim = base64UrlEncode(claimSet);
  const signInput = `${encodedHeader}.${encodedClaim}`;

  let signature = "";
  try {
    const keyObj = crypto.createPrivateKey({
      key: sa.private_key,
      format: "pem",
    });
    signature = crypto.sign("sha256", Buffer.from(signInput), keyObj).toString("base64url");
  } catch (keyErr) {
    console.error("Erro ao assinar JWT com chave privada:", keyErr);
    return null;
  }

  const jwt = `${signInput}.${signature}`;

  const tokenUrl = sa.token_uri || "https://oauth2.googleapis.com/token";
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Falha ao obter Google Access Token (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return cachedToken.token;
}

export function isGoogleAuthConfigured(): boolean {
  return !!getServiceAccount();
}
