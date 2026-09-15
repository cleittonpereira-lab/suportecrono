import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { serviceWorkerPlugin } from "./pwa/sw.plugin";

export default defineConfig({
  // App instalável (Fase 5): gera o /sw.js no build do navegador, com a lista
  // dos arquivos daquela versão para o app abrir sem sinal.
  plugins: [serviceWorkerPlugin()],
  server: {
    port: 8080,
    host: true,
  },
  optimizeDeps: {
    include: ["exceljs"],
  },
  nitro: {
    preset: "cloudflare-module",
    // Cópia diária do banco no Drive, pelo agendamento `triggers.crons` abaixo.
    // Checagem de saúde de 15 em 15 min (Fase 6), pelo segundo agendamento abaixo.
    // Espelho diário da planilha da Programação, no mesmo horário da cópia.
    plugins: [
      "./src/server/copia-diaria.plugin.ts",
      "./src/server/saude.plugin.ts",
      "./src/server/programacao-espelho.plugin.ts",
    ],
    // nodeCompat: habilita o `node:crypto`/`Buffer` que a autenticação da
    // conta de serviço do Google (assinatura de JWT) e o upload de fotos
    // usam. deployConfig: deixa o nitro gerar a config de deploy do
    // Cloudflare (wrangler) automaticamente no build.
    cloudflare: {
      nodeCompat: true,
      deployConfig: true,
      // Exportações extras do Worker: a sala de tempo real (Fase 3, Durable Object).
      exports: "./exports.cloudflare.ts",
      // Banco dos dados do app (Fase 1). Ter o banco ligado ao Worker não muda
      // nada sozinho: o app só passa a usá-lo com o segredo DADOS_NO_D1=1 (ver
      // documentos-d1.server.ts). Sem `vars` aqui de propósito: a publicação
      // substituiria variáveis definidas no painel do Cloudflare.
      wrangler: {
        // Variáveis criadas no painel do Cloudflare (ex.: DADOS_NO_D1) não podem
        // sumir numa publicação — sem isto, cada versão nova as descartaria e o
        // app voltaria ao Drive em silêncio, com o que foi gravado só no banco.
        keep_vars: true,
        // 09:00 UTC = 06:00 em Brasília: cópia diária do banco no Drive
        // (src/server/copia-diaria.plugin.ts).
        // "*/15 * * * *": checagem de saúde (src/server/saude.plugin.ts).
        triggers: { crons: ["0 9 * * *", "*/15 * * * *"] },
        d1_databases: [
          {
            binding: "DB",
            database_name: "suportecrono-dados",
            database_id: "95f080e7-35cf-42df-9be4-57339c18a39c",
            migrations_dir: "migrations/d1",
          },
        ],
        // Sala de tempo real (Fase 3). A classe nova só é criada por um
        // `wrangler deploy` (uma vez); depois disso, as versões comuns
        // (`versions upload` + promoção no painel) seguem normalmente. O formato
        // `migrations` é de propósito: com `exports` de Durable Object no
        // wrangler, `versions upload` deixa de funcionar.
        durable_objects: {
          bindings: [{ name: "SALA_TEMPO_REAL", class_name: "SalaTempoReal" }],
        },
        migrations: [{ tag: "v1", new_sqlite_classes: ["SalaTempoReal"] }],
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
