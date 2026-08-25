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
    preset: "vercel",
  },
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    define: {
      __APP_VERSION__: JSON.stringify(
        (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || "dev"
      ),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
  },
} as any);
