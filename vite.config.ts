import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  server: {
    port: 8080,
    host: true,
  },
  optimizeDeps: {
    include: ["exceljs"],
  },
  nitro: {
    preset: "cloudflare-module",
    // nodeCompat: habilita o `node:crypto`/`Buffer` que a autenticação da
    // conta de serviço do Google (assinatura de JWT) e o upload de fotos
    // usam. deployConfig: deixa o nitro gerar a config de deploy do
    // Cloudflare (wrangler) automaticamente no build.
    cloudflare: {
      nodeCompat: true,
      deployConfig: true,
      // Banco dos dados do app (Fase 1). Ter o banco ligado ao Worker não muda
      // nada sozinho: o app só passa a usá-lo com o segredo DADOS_NO_D1=1 (ver
      // documentos-d1.server.ts). Sem `vars` aqui de propósito: a publicação
      // substituiria variáveis definidas no painel do Cloudflare.
      wrangler: {
        // Variáveis criadas no painel do Cloudflare (ex.: DADOS_NO_D1) não podem
        // sumir numa publicação — sem isto, cada versão nova as descartaria e o
        // app voltaria ao Drive em silêncio, com o que foi gravado só no banco.
        keep_vars: true,
        d1_databases: [
          {
            binding: "DB",
            database_name: "suportecrono-dados",
            database_id: "95f080e7-35cf-42df-9be4-57339c18a39c",
            migrations_dir: "migrations/d1",
          },
        ],
      },
    },
  },
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    define: {
      __APP_VERSION__: JSON.stringify(
        (process.env.CF_PAGES_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || "dev"
      ),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
  },
} as any);
