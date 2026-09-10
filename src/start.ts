import { createStart, createMiddleware, createCsrfMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

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

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [csrfMiddleware, errorMiddleware],
}));
