import { createStart, createMiddleware, createCsrfMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// A sessão agora vive num cookie, e as funções de gravação confiam nele. Sem
// esta checagem (Origin / Sec-Fetch-Site), um site de terceiros poderia
// disparar uma função de servidor com o cookie de quem está logado. O cookie
// já é `sameSite: "lax"`, o que barra o POST vindo de outro site na maioria dos
// navegadores; isto fecha o resto, como o próprio TanStack recomenda.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// Tempo real (Fase 3): junta o que a requisição gravou no banco e, depois da
// resposta, avisa a sala — as outras telas atualizam na hora.
const tempoRealMiddleware = createMiddleware().server(async ({ next, request }) => {
  const { comAvisosDeMudanca } = await import("./lib/tempo-real.server");
  return comAvisosDeMudanca(request, async () => next());
});

// Sem middleware de cliente: havia um que, antes de TODA chamada ao servidor,
// pedia a sessão ao Supabase Auth (fora do ar desde 25/08) — com uma sessão
// antiga guardada no navegador, tentava renová-la na rede antes de liberar a
// chamada. O servidor já não usava nada disso: a identidade vem do cookie.
export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, errorMiddleware, tempoRealMiddleware],
}));
