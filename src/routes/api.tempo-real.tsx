/**
 * Conexão de tempo real (Fase 3): repassa o WebSocket da aba para a sala
 * (Durable Object), com a identidade conferida aqui pelo cookie de sessão.
 * Só conta ativa conecta (Fase 4): sem login não há modo convidado.
 */
import { createFileRoute } from "@tanstack/react-router";

function nomeDe(claims: { email?: string; user_metadata?: { full_name?: string; name?: string } } | undefined): string {
  return (
    claims?.user_metadata?.full_name ||
    claims?.user_metadata?.name ||
    (claims?.email ? claims.email.split("@")[0] : "") ||
    "Usuário"
  );
}

export const Route = createFileRoute("/api/tempo-real")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
          return new Response("Esperado WebSocket.", { status: 426 });
        }
        // Só a própria página abre a conexão: outro site não fica ouvindo quem está com qual laudo aberto.
        const origem = request.headers.get("origin");
        if (origem && new URL(origem).host !== new URL(request.url).host) {
          return new Response("Origem recusada.", { status: 403 });
        }
        const { salaTempoReal } = await import("@/lib/tempo-real.server");
        const sala = salaTempoReal();
        if (!sala) return new Response("Tempo real indisponível neste servidor.", { status: 503 });

        const { contextoDeLeitura } = await import("@/integrations/supabase/auth-identidade.server");
        let quem: Awaited<ReturnType<typeof contextoDeLeitura>>;
        try {
          quem = await contextoDeLeitura();
        } catch {
          return new Response("Entre no sistema para receber avisos ao vivo.", { status: 401 });
        }
        const destino = new URL(request.url);
        destino.pathname = "/ws";
        destino.search = new URLSearchParams({ uid: quem.userId, nome: nomeDe(quem.claims) }).toString();
        return sala.fetch(new Request(destino.toString(), request));
      },
    },
  },
});
