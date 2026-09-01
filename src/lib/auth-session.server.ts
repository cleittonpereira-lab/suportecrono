/**
 * Sessão de login própria (substitui a sessão do Supabase Auth) — cookie
 * assinado com HMAC-SHA256 via `node:crypto` (mesmo módulo já usado com
 * sucesso neste deploy Cloudflare em `google-auth.server.ts`).
 *
 * `getCookie`/`setCookie`/`deleteCookie` (de `@tanstack/react-start/server`)
 * só podem aparecer em código que o compilador do TanStack Start reconhece
 * como servidor-only — por isso cada função que os usa é envolvida em
 * `createServerOnlyFn(...)`, e não um `import` estático simples (este
 * arquivo é importado, mesmo que indiretamente, por `use-auth.tsx`, que é
 * client-side; sem isso o build falha com "Import denied in client
 * environment").
 *
 * É um middleware NOVO e separado de `requireSupabaseAuth`
 * (`src/integrations/supabase/auth-middleware.ts`) — este último continua
 * intacto e em uso pelos server functions que só precisam saber "quem fez
 * a ação" (gravam isso em JSON no Drive) sem depender de banco nenhum.
 */
import crypto from "node:crypto";
import { createMiddleware, createServerOnlyFn } from "@tanstack/react-start";
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";
import { getUserById, type UserRecord } from "@/lib/user-store.server";

const COOKIE_NAME = "si_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 dias

function isProdRequest(): boolean {
  return process.env.NODE_ENV !== "development";
}

function getSessionSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SESSION_SECRET não configurado. Defina essa variável de ambiente (Runtime, no Cloudflare — não Build).",
    );
  }
  return secret;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

export const issueSession = createServerOnlyFn((userId: string): void => {
  const exp = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = `${userId}.${exp}`;
  const payloadB64 = Buffer.from(payload, "utf8").toString("base64url");
  const token = `${payloadB64}.${sign(payload)}`;
  setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProdRequest(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
});

export const clearSession = createServerOnlyFn((): void => {
  deleteCookie(COOKIE_NAME, { path: "/" });
});

function verifySessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  let expectedSig: string;
  try {
    expectedSig = sign(payload);
  } catch {
    return null; // AUTH_SESSION_SECRET não configurado
  }
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  const sepIdx = payload.indexOf(".");
  if (sepIdx < 0) return null;
  const userId = payload.slice(0, sepIdx);
  const exp = parseInt(payload.slice(sepIdx + 1), 10);
  if (!userId || !Number.isFinite(exp) || Date.now() > exp) return null;
  return userId;
}

export const getSessionUserId = createServerOnlyFn((): string | null => {
  return verifySessionToken(getCookie(COOKIE_NAME));
});

export const getSessionUserRecord = createServerOnlyFn(async (): Promise<UserRecord | null> => {
  const userId = getSessionUserId();
  if (!userId) return null;
  return getUserById(userId);
});

/** Exige login (Drive). Usar em vez de `requireSupabaseAuth` nos server functions de usuários/perfil. */
export const requireAppAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const user = await getSessionUserRecord();
  if (!user) throw new Error("Não autenticado.");
  if (user.status === "bloqueado") throw new Error("Conta bloqueada pelo administrador.");
  return next({ context: { user } });
});

/** Exige login + papel admin. */
export const requireAppAdmin = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const user = await getSessionUserRecord();
  if (!user) throw new Error("Não autenticado.");
  if (user.role !== "admin") throw new Error("Acesso restrito ao administrador.");
  return next({ context: { user } });
});
