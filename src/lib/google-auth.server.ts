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

  // Built-in fallback: JSON completo em Base64 — gerado com scratch/gen-b64-key.cjs
  // Imune a corrupção de escapes pois é Base64 puro
  const BUILTIN_SA_B64 = "eyJ0eXBlIjoic2VydmljZV9hY2NvdW50IiwicHJvamVjdF9pZCI6InN1cG9ydGUtbGFib3JhdG9yaW8iLCJwcml2YXRlX2tleV9pZCI6IjgwMjJjMjgyN2NjNmZkZGE4NjYxM2ZjNTZhOTUzYjc5ZGNhYTY4NDIiLCJwcml2YXRlX2tleSI6Ii0tLS0tQkVHSU4gUFJJVkFURSBLRVktLS0tLVxuTUlJRXZRSUJBREFOQmdrcWhraUc5dzBCQVFFRkFBU0NCS2N3Z2dTakFnRUFBb0lCQVFDK0dhMXZsQ0V6blorVlxuWWxWREowRmtEaHRwdGxzbnkrd2UyYUhHT1RrT1NFOHA2NXVNZ0JBa2dCSE9VVDg4QlhyNTlFNmlhVFZ3OUtRa1xubkFRZWNYSXdoTGNhb2pVUmZFZlFnUUJaTTV4bFc0aVlOdDRFeDBKUHNrRUh2YmhPMG9RbHN5SlcxaXBab2ZjbFxuQXhkVWkvaXdVd0JKVlo0ZHNCVWsrK1B6aUkyRmlBZzhucmVOazBmTUpzYmw3TXVMUVhWMlJVRTlQTGR2cmlnNlxueWhRL3EvaVRndEI4RUNwNjNTbXlQMVBlZEFXdHVxQTJTem9LZFBEUXlZak40RWpnQXN1WjBBa0U2MWxnSm9vS1xuaGEyL0Z2OHdFTzhUb3ltbHpXRVVibTA4SWsxZW0yTnNwMzF2akRzK1lzbTdCcEU5TWFYcldjZTdxT0VOQTVicFxubHExa2krSkhBZ01CQUFFQ2dnRUFBR2Y3azZyYzAreHY0OExLcnVpMHFFZ2FqMVFiczNEcFVwYnRaRmdSSk94ekVcblJwVkRoaWtWREFpL1pwbFJybUdKZVpqaEQvQ1hNRVVrRlNXSW9xa2MxbW12cUdLNkl4UDl0aE9OK3FUR0pFNHFcbkZiYWJFY2cxMXpRbkZHbnJSRXdoYWc1ZkNjVHJzYW9tWTlkU1gydHNyS0FORC9vM1R4UC9NRG1KNkltcDRMS0hcbkpvZFY1SklJVUZPR3lQeGtBOEpxa243SUtRc3BETktUNGkrMkQ0ZzVqejFPeDUxMms2a2laWDQyb2RJWFdJbWJcbjRGT1NZdUdlcnREcFE3ODk2NFFaM0JYWHVJdlFQVHdnMGhTYWV5Y0RlZDQ3SWltWnZDNzgzOXF3V1RnOVhiclRcbko2UGZKN1EweUR4R3ZZNGZ0ejVjS1JLeURlSWZzTEJLV291ZVluY01RS0JnUURmMTBkMmZQejNIZm5SdHJBZVxuQTlvQUJBWDFQRnJORVhvcU9pZU5VMVNVVzhWcTIrMHRqVlFOcW5RKzNLTko2Qzc1RXFsYnAxUDhsclM3UTN5RVxuQzUxS0h3V3dhVXV4SDdpbHR0RmM3U3o0ejllaXZoNmhvMXd3V2NwZWNqZWZZRERnUFhzaHkvbC9oTE9NV2xmclxuZGtvN01MdzlTUmMwdDNyTFZzeGZvdUM4elFLQmdRRFphWEM0M29zWHAzNzIvMy95MHMyMlVlNFlwZ0lGR3ZpNlxuWlU5SUMybDRkUVFDWFRyNkowMW9LcjFQWktFNW5IK3piSXZMenBjY2pGdzJsWVAvOEF3QU1GdS9ibFV4dStCK1xuU1dGWXhKNEdIMFozZEw4MDh0TXlCTjJHWFZwTGp6eEUxNUJCZkVreFpwWk5tNEFkRjZ3cUVaTTNldWFwbFY2L1xuNmYxUzlwNWJZd0tCZ0hBaGFiMGpjNTFmT013alZpcFRCNXZHYUMyblpGMGlDaTZwSHpNZXNWbjRkdmJHNFJOV1xubnVxUm50WDJ0UjNLMyswSnVpa2RzMmJ2SCs1SEtsTURkbkd4QktxUXRNZ3YrZEdadVZ0eHZIdVBzcGZsNFhaYlxuWFUwalRjcnVNSXI0SnNQT1NLWnZoYmFwaFVBajZiTWNlS2NhRE5JdWtSOXBZbXdHT1M4WGFybHBBb0dCQUtCZFxuc3lUYUduVC9PcHJNaWI4K0dUanpwQkdRV2dzVUF3WFNkckZvb1lxVm5iaDB0bTBRa250VWswRTlzK0svK2o0Slxud2ZBNldhSllNaWlkRHJtNWdkQ2QydjhRVGswYURSUjU0aEZOTGxiTHVQbWlKdXZTZFUvKzRMd2NuZDhBTDIrRVxuSmNiMyt6RXlQNG5OT3FtNjdXWTJnb1c0NU8yUDNVem9OdEI4VXdDTEFvR0FVWGNVRFVqeFhURjViK2d6VEM4QVxuWGVkWjZsWnN6MTFGWUM3MDN2b2ovRGhMT01xQ3I1S2wwRUNFYlFZZ1AzRzBVQ25HWkU5QjJwOGp2UnR5bXpmdlxuTW9DekJlOCtscit3L3RBUlNQYWdiR1Bidm1OcFB6dkF5M0EvQmp0WGlUeWNVcUVBYWZaM2IrUFZMUWcxS0FnV1xuYXNOQXlmRmlPeXZ0bUtjM1dOcENiOWs9XG4tLS0tLUVORCBQUklWQVRFIEtFWS0tLS0tXG4iLCJjbGllbnRfZW1haWwiOiJzdXBvcnRlLWJvdEBzdXBvcnRlLWxhYm9yYXRvcmlvLmlhbS5nc2VydmljZWFjY291bnQuY29tIiwiY2xpZW50X2lkIjoiMTEyMDE3NjkyMTc0MTU2NjcyNTc3IiwiYXV0aF91cmkiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20vby9vYXV0aDIvYXV0aCIsInRva2VuX3VyaSI6Imh0dHBzOi8vb2F1dGgyLmdvb2dsZWFwaXMuY29tL3Rva2VuIiwiYXV0aF9wcm92aWRlcl94NTA5X2NlcnRfdXJsIjoiaHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vb2F1dGgyL3YxL2NlcnRzIiwiY2xpZW50X3g1MDlfY2VydF91cmwiOiJodHRwczovL3d3dy5nb29nbGVhcGlzLmNvbS9yb2JvdC92MS9tZXRhZGF0YS94NTA5L3N1cG9ydGUtYm90JTQwc3Vwb3J0ZS1sYWJvcmF0b3Jpby5pYW0uZ3NlcnZpY2VhY2NvdW50LmNvbSIsInVuaXZlcnNlX2RvbWFpbiI6Imdvb2dsZWFwaXMuY29tIn0=";
  const fromBuiltin = tryParseServiceAccount(BUILTIN_SA_B64);
  if (fromBuiltin) return { ...fromBuiltin, private_key: cleanPem(fromBuiltin.private_key) };

  throw new Error("Service Account não configurada. Defina a variável de ambiente GOOGLE_SERVICE_ACCOUNT_JSON.");
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
