/**
 * Avisos do app (Fase 5, parte 2) — a parte pura: quem recebe cada aviso, o
 * texto, e a assinatura VAPID (RFC 8292) que o serviço de push do navegador
 * exige. A gravação e o envio ficam em avisos.server.ts.
 *
 * O push vai sem conteúdo: ao receber, o service worker busca em /api/avisos
 * os avisos da pessoa (com a sessão dela) e mostra a notificação. Assim nada
 * do laudo passa pelo serviço de push do Google/Apple/Mozilla.
 */
import { podeAprovar, podeVerificar, type PapelDoUsuario } from "./papeis";

export type EventoDoFluxo = "aguardando_verificacao" | "aguardando_aprovacao" | "reprovado";

export interface Aviso {
  id: string;
  titulo: string;
  corpo: string;
  url: string;
  criadoEm: string;
  /** Já mostrado num aparelho (o service worker buscou). */
  entregue?: boolean;
}

export interface Pessoa extends PapelDoUsuario {
  id: string;
  status?: string | null;
}

/**
 * Quem recebe: verificação → quem pode verificar; aprovação → quem pode
 * aprovar; reprovado → quem enviou a revisão. Nunca quem fez a ação, e só
 * contas ativas (mesmas regras de lib/papeis.ts).
 */
export function destinatarios(
  evento: EventoDoFluxo,
  pessoas: Pessoa[],
  ator: string,
  solicitante?: string | null,
): string[] {
  const ativas = pessoas.filter((p) => (p.status ?? "ativo") === "ativo" && p.id !== ator);
  if (evento === "aguardando_verificacao") return ativas.filter((p) => podeVerificar(p)).map((p) => p.id);
  if (evento === "aguardando_aprovacao") return ativas.filter((p) => podeAprovar(p)).map((p) => p.id);
  return solicitante && ativas.some((p) => p.id === solicitante) ? [solicitante] : [];
}

const TITULOS: Record<EventoDoFluxo, string> = {
  aguardando_verificacao: "Laudo aguardando verificação",
  aguardando_aprovacao: "Laudo aguardando aprovação",
  reprovado: "Laudo devolvido para correção",
};

/** "Teor de Betume (ASF.TB) · OS 17700-26 · amostra 13314-089"; sem dados, o nome do arquivo. */
export function descreverLaudo(p: {
  ensaio?: string | null;
  os?: string | null;
  amostra?: string | null;
  arquivo?: string | null;
}): string {
  const partes = [p.ensaio?.trim(), p.os?.trim() && `OS ${p.os.trim()}`, p.amostra?.trim() && `amostra ${p.amostra.trim()}`].filter(
    Boolean,
  );
  if (partes.length) return partes.join(" · ");
  return p.arquivo ? p.arquivo.replace(/\.pdf$/i, "") : "Laudo";
}

/** Página do laudo a partir do scopeId "os/…/amostra/…/ensaio/…". */
export function urlDoLaudo(scopeId: string): string {
  return /^os\/[^/]+\/amostra\/[^/]+\/ensaio\/[^/]+$/.test(scopeId) ? `/relatorio/${scopeId}` : "/relatorio/pendentes";
}

export function montarAviso(
  evento: EventoDoFluxo,
  p: { descricao: string; ator: string; comentario?: string | null; scopeId: string },
  agora = new Date(),
): Aviso {
  const corpo =
    evento === "reprovado"
      ? `${p.descricao} — ${p.comentario?.trim() || "sem comentário"} (${p.ator})`
      : `${p.descricao} — enviado por ${p.ator}`;
  return {
    id: `av_${agora.getTime().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    titulo: TITULOS[evento],
    corpo: corpo.slice(0, 240),
    url: urlDoLaudo(p.scopeId),
    criadoEm: agora.toISOString(),
  };
}

/**
 * Só serviços de push conhecidos: sem isto, uma conta logada poderia fazer o
 * servidor mandar requisições para um endereço qualquer.
 */
export function endpointDePushValido(endpoint: string): boolean {
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const h = u.hostname;
  return (
    h === "fcm.googleapis.com" ||
    h === "updates.push.services.mozilla.com" ||
    h === "web.push.apple.com" ||
    h.endsWith(".push.apple.com") ||
    h.endsWith(".notify.windows.com")
  );
}

/** Avisos mais novos que `desde` (ou dos últimos 15 min, se o aparelho nunca buscou), no máximo 5. */
export function avisosNovos(avisos: Aviso[], desde: string | null, agora = Date.now()): Aviso[] {
  const limite = desde && !Number.isNaN(Date.parse(desde)) ? desde : new Date(agora - 15 * 60_000).toISOString();
  return avisos.filter((a) => a.criadoEm > limite).slice(0, 5);
}

// ---------------- VAPID (RFC 8292) ----------------

export interface ChavePrivadaVapid {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  d: string;
}

export function bytesParaB64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlParaBytes(s: string): Uint8Array<ArrayBuffer> {
  const base64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Chave pública (ponto não comprimido, 65 bytes) em base64url, a partir da privada. */
export function chavePublicaDaPrivada(jwk: Pick<ChavePrivadaVapid, "x" | "y">): string {
  const x = b64urlParaBytes(jwk.x);
  const y = b64urlParaBytes(jwk.y);
  const ponto = new Uint8Array(1 + x.length + y.length);
  ponto[0] = 4;
  ponto.set(x, 1);
  ponto.set(y, 1 + x.length);
  return bytesParaB64url(ponto);
}

/**
 * Cabeçalho Authorization do push: JWT ES256 com o dono do serviço de push
 * (`aud`), validade de 12 h e contato, mais a chave pública (`k`).
 */
export async function cabecalhoVapid(
  endpoint: string,
  jwk: ChavePrivadaVapid,
  contato: string,
  agora = Date.now(),
): Promise<string> {
  const texto = new TextEncoder();
  const cabecalho = bytesParaB64url(texto.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const declaracoes = bytesParaB64url(
    texto.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(agora / 1000) + 12 * 3600, sub: contato })),
  );
  const chave = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, chave, texto.encode(`${cabecalho}.${declaracoes}`));
  return `vapid t=${cabecalho}.${declaracoes}.${bytesParaB64url(assinatura)}, k=${chavePublicaDaPrivada(jwk)}`;
}
