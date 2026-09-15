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

// Trabalho para depois da resposta (avisos do fluxo de aprovação, Fase 5):
// quem aprovou ou reprovou não espera o envio das notificações.
const tarefasDepoisMiddleware = createMiddleware().server(async ({ next, request }) => {
  const { comTarefasDepois } = await import("./lib/depois-da-resposta");
  return comTarefasDepois(request, async () => next());
});

// Saúde do servidor (Fase 6): anota exceções e requisições acima de 8 s; a
// checagem de 15 em 15 minutos avisa os administradores (src/server/saude.plugin.ts).
// Fica por dentro de `tarefasDepoisMiddleware`: a anotação sai depois da resposta.
const saudeMiddleware = createMiddleware().server(async ({ next, request }) => {
  const inicio = Date.now();
  const rota = new URL(request.url).pathname;
  try {
    const resultado = await next();
    const ms = Date.now() - inicio;
    const { LIMITE_LENTA_MS } = await import("./lib/saude-logica");
    if (ms >= LIMITE_LENTA_MS) {
      const { anotarOcorrencia } = await import("./lib/saude.server");
      await anotarOcorrencia({ tipo: "lenta", rota, ms });
    }
    return resultado;
  } catch (err) {
    const { anotarOcorrencia } = await import("./lib/saude.server");
    await anotarOcorrencia({
      tipo: "erro",
      rota,
      ms: Date.now() - inicio,
      mensagem: err instanceof Error ? err.message : String(err),
    }).catch(() => {});
    throw err;
  }
});

// Sem middleware de cliente: havia um que, antes de TODA chamada ao servidor,
// pedia a sessão ao Supabase Auth (fora do ar desde 25/08) — com uma sessão
// antiga guardada no navegador, tentava renová-la na rede antes de liberar a
// chamada. O servidor já não usava nada disso: a identidade vem do cookie.
export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, errorMiddleware, tempoRealMiddleware, tarefasDepoisMiddleware, saudeMiddleware],
}));
