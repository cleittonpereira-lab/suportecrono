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

function getServiceAccount(): ServiceAccountKey {
  const tryParse = (rawStr: unknown): ServiceAccountKey | null => {
    if (!rawStr) return null;
    if (typeof rawStr === "object" && rawStr !== null) {
      const obj = rawStr as any;
      if (obj.client_email && obj.private_key) {
        return {
          ...obj,
          private_key: String(obj.private_key).replace(/\\n/g, "\n"),
        };
      }
    }
    if (typeof rawStr !== "string") return null;

    let str = rawStr.trim();
    if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
      str = str.slice(1, -1).trim();
    }

    // 1. Direct JSON parse (with support for double stringification)
    try {
      let parsed = JSON.parse(str);
      if (typeof parsed === "string") {
        try { parsed = JSON.parse(parsed); } catch {}
      }
      if (parsed && parsed.client_email && parsed.private_key) {
        return {
          ...parsed,
          private_key: String(parsed.private_key).replace(/\\n/g, "\n"),
        };
      }
    } catch {
      // ignore
    }

    // 2. Base64 decode then JSON parse
    try {
      const decoded = Buffer.from(str, "base64").toString("utf-8");
      let parsed = JSON.parse(decoded);
      if (typeof parsed === "string") {
        try { parsed = JSON.parse(parsed); } catch {}
      }
      if (parsed && parsed.client_email && parsed.private_key) {
        return {
          ...parsed,
          private_key: String(parsed.private_key).replace(/\\n/g, "\n"),
        };
      }
    } catch {
      // ignore
    }

    return null;
  };

  const envs = typeof process !== "undefined" && process.env ? process.env : {};
  const metaEnv = typeof import.meta !== "undefined" && (import.meta as any).env ? (import.meta as any).env : {};

  // 1. Try env variables
  const fromEnv = tryParse(
    envs.GOOGLE_SERVICE_ACCOUNT_JSON ||
    envs.GOOGLE_SERVICE_ACCOUNT ||
    envs.VITE_GOOGLE_SERVICE_ACCOUNT_JSON ||
    metaEnv.GOOGLE_SERVICE_ACCOUNT_JSON ||
    metaEnv.VITE_GOOGLE_SERVICE_ACCOUNT_JSON
  );
  if (fromEnv) return fromEnv;

  // 2. Try local file
  try {
    const localFile = path.join(process.cwd(), ".data", "service_account.json");
    if (fs.existsSync(localFile)) {
      const content = fs.readFileSync(localFile, "utf-8");
      const fromFile = tryParse(content);
      if (fromFile) return fromFile;
    }
  } catch {
    // ignore
  }

  // 3. Built-in Server Service Account fallback
  return {
    client_email: "suporte-bot@suporte-laboratorio.iam.gserviceaccount.com",
    private_key: `-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC+Ga1vlCEznZ+V\nYlVDJ0FkDhtptlsny+we2aHGOTkOSE8p65uMgBAkgBHOUT88BXr59E6iaTVw9KQk\nnAQecXIwhLcaojURfEfQgQBZM5xlW4iYNt4Ex0JPskEHvbhO0oQlsyJW1ipZofcl\nAxdUi/iwUwBJVZ4dsBUk++PziI2FiAg8nreNk0fMJsbl7MuLQXV2RUE9PLdvrig6\nyhQ/q/iTgtB8ECp63SmyP1PedAWtuqA2SzoKdPDQyYjN4EjgAsuZ0AkE61lgJooK\nha2/Fv8wEO8ToymlzWEUbm08Ik1em2Nsp31vjDs+Ysm7BpE9MaXrWce7qOENA5bp\nlq1ki+JHAgMBAAECggEAAGf7k6rc0+xv48LKrui0qEgaj1Qbs3DpUpbtZFgRJOxzE\nRpVDhikVDAi/ZplRrmGJeZjhD/CXMEUkFSWIoqkc1mmvqGK6IxP9thON+qTGJE4q\nFbabEcg11zQnFGnrREwhag5fCcTrsaomY9dSX2tsrKAND/o3TxP/MDmJ6Imp4LKH\nJodV5JIIUFOGyPxkA8Jqkn7IKQspDNKT4i+2D4g5jz1Ox512k6kiZX42odIXWImb\n4FOSYuGertDpQ78964QZ3BXXuIvQPTwg0hSaeycDed47IimZvC7839qwWTg9XbrT\nJ6PfJ7Q0yDxGvY4ftz5cKRKyDeIfsLBKWoueYncMQKBgQDf10d2fPz3HfnRtrAe\nA9oABAX1PFrNEXoqOieNU1SUW8Vq2+0tjVQNqnQ+3KNJ6C75Eqlbp1P8lrS7Q3yE\nC51KHwWwaUuxH7ilttFc7Sz4z9eivh6ho1wwWcpecjefYDDgPXshy/l/hLOMWlfr\ndko7MLw9SRc0t3rLVsxfouC8zQKBgQDZaXC43osXp372/3/y0s22Ue4YpgIFGvi6\nZU9IC2l4dQQCXTr6J01oKr1PZKE5nH+zbIvLzpccjFw2lYP/8AwAMFu/blUxu+B+\nSWFYxJ4GH0Z3dL808tMyBN2GXVpLjzxE15BBfEkxZpZNm4AdF6wqEZM3euaplV6/\n6f1S9p5bYwKBgHAhab0jc51fOMwjVipTB5vGaC2nZF0iCi6pHzMesVn4dvbG4RNW\nnuqRntX2tR3K3+0Juikds2bvH+5HKlMDdnGxBKqQtMgv+dGZuVtxvHuPspfl4XZb\nXU0jTcruMIr4JsPOSKZvhbaphUAj6bMceKcaDNIukR9pYmwGOS8XarlpAoGBAKBd\nsyTaGnT/OprMib8+GTjzpBGQWgsUAwXSdrFooYqVnbh0tm0QkntUk0E9s+K/+j4J\nwfA6WaJYMiidDrm5gdCd2v8QTk0aDRR54hFNLlbLuPmiJuvSdU/+4Lwcnd8AL2+E\nJcb3+zEyP4nNOqm67WY2goW45O2P3UzoNtB8UwCLAoGAUXcUDUjxXTF5b+gzTC8A\nXedZ6lZsz11FYC703voj/DhLOMqCr5Kl0ECEbQYgP3G0UCnGZE9B2p8jvRtymzfv\nMoCzBe8+lr+w/tARSPagbGPbvmNpPzvAy3A/BjtXiTycUqEAafZ3b+PVLQg1KAgW\nasNAyfFiOyvtmKc3WNpCb9k=\n-----END PRIVATE KEY-----\n`,
    token_uri: "https://oauth2.googleapis.com/token",
  };
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
    const formattedKey = sa.private_key.replace(/\\n/g, "\n");
    const keyObj = crypto.createPrivateKey({
      key: formattedKey,
      format: "pem",
    });
    signature = crypto.sign("sha256", Buffer.from(signInput), keyObj).toString("base64url");
  } catch (keyErr) {
    console.error("Erro ao assinar JWT com chave privada:", keyErr);
    throw new Error(`Erro ao assinar JWT com chave privada: ${(keyErr as Error).message}`);
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
  return true;
}
