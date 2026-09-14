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
      // Só no `npm run dev`: D1 simulado em .wrangler/state/v3. O arquivo tem
      // nome próprio para a publicação não o usar.
      dev: { configPath: "./wrangler.dev.jsonc" },
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
