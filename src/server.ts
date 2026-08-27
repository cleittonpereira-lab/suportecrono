import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

/**
 * O HTML da página referencia o CSS/JS pelo nome com hash do build (ex.:
 * `styles-ABC123.css`) — esse hash muda a cada deploy, e o deploy anterior
 * não fica mais disponível. Sem um `Cache-Control` explícito aqui, o HTML
 * fica à mercê do cache padrão do navegador (ou de um proxy da operadora de
 * celular) — se alguém abrir o site, a gente publicar uma atualização, e
 * depois essa pessoa voltar com o HTML antigo ainda em cache, o link do CSS
 * aponta pra um arquivo que não existe mais no deploy atual: página carrega
 * sem estilo nenhum. Isso não afeta os arquivos com hash em si (esses already
 * são cacheáveis pra sempre, já que o nome muda quando o conteúdo muda) — só
 * garante que o HTML em si nunca fica preso numa versão velha.
 */
function withNoCacheForHtml(response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withNoCacheForHtml(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, no-cache, must-revalidate" },
      });
    }
  },
};
