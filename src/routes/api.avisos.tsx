/**
 * Avisos da pessoa logada que o aparelho ainda não mostrou — chamado pelo
 * service worker ao receber um push (pwa/sw-modelo.js). `?desde=` é a hora do
 * último aviso que aquele aparelho já mostrou.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/avisos")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { contextoDeLeitura } = await import("@/integrations/supabase/auth-identidade.server");
        let userId: string;
        try {
          userId = (await contextoDeLeitura()).userId;
        } catch {
          return Response.json({ avisos: [] }, { status: 401, headers: { "cache-control": "no-store" } });
        }
        const desde = new URL(request.url).searchParams.get("desde");
        const { avisosDesde } = await import("@/lib/avisos.server");
        return Response.json({ avisos: await avisosDesde(userId, desde) }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
