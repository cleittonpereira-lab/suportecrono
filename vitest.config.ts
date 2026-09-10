import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Config só dos testes. A build usa `@lovable.dev/vite-tanstack-config`, que
// monta o app inteiro (TanStack Start, nitro, Cloudflare); para testar funções
// isoladas basta o mesmo alias `@/*` do tsconfig.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
    // A primeira transformação dos módulos grandes (server functions) passa de
    // 5s quando vários arquivos de teste rodam em paralelo.
    testTimeout: 20_000,
  },
});
