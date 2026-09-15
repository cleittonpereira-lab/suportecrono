/**
 * Gera o /sw.js do app instalável (Fase 5) no build do navegador, com a lista
 * dos arquivos daquele build embutida — o service worker guarda todos na
 * instalação e o app abre sem sinal. Como o conteúdo muda a cada build, o
 * navegador instala o service worker novo sozinho a cada publicação.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

const EXTENSOES = /\.(js|mjs|css|woff2?|ttf|png|jpe?g|svg|webp|ico)$/i;

export function serviceWorkerPlugin(): Plugin {
  return {
    name: "suporte-service-worker",
    apply: "build",
    generateBundle(_opcoes, bundle) {
      // Só no build do navegador (o do servidor não serve arquivos ao aparelho).
      const ambiente = (this as unknown as { environment?: { name?: string } }).environment?.name;
      if (ambiente && ambiente !== "client") return;
      const arquivos = Object.keys(bundle)
        .filter((f) => EXTENSOES.test(f) && !f.endsWith(".map"))
        .sort()
        .map((f) => "/" + f.replace(/^\/+/, ""));
      const versao = createHash("sha256").update(arquivos.join("\n")).digest("hex").slice(0, 12);
      const modelo = readFileSync(new URL("./sw-modelo.js", import.meta.url), "utf8");
      // Troca a linha inteira de cada constante: um marcador solto (num
      // comentário, por exemplo) não pode receber o valor no lugar dela.
      const trocas: [string, string][] = [
        ["const VERSAO = __VERSAO__;", `const VERSAO = ${JSON.stringify(versao)};`],
        ["const ARQUIVOS = __ARQUIVOS__;", `const ARQUIVOS = ${JSON.stringify(arquivos)};`],
      ];
      let source = modelo;
      for (const [de, para] of trocas) {
        if (!source.includes(de)) throw new Error(`[sw.plugin] Não achei "${de}" em pwa/sw-modelo.js.`);
        source = source.replace(de, para);
      }
      if (source.includes("__VERSAO__") || source.includes("__ARQUIVOS__")) {
        throw new Error("[sw.plugin] Sobrou marcador sem valor no sw.js gerado.");
      }
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    },
  };
}
