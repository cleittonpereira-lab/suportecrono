import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minuto de cache fresco por padrão
        gcTime: 10 * 60 * 1000, // 10 minutos na memória
        refetchOnWindowFocus: false, // Não re-busca toda vez que clica na janela
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent", // Pré-carrega rotas ao passar o mouse por cima
    defaultPreloadStaleTime: 30_000,
  });

  return router;
};

