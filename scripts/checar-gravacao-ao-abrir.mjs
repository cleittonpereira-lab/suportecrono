// Abre cada laudo num Chrome limpo, espera 20s sem tocar em nada e lista as
// chamadas de servidor de GRAVAÇÃO (POST) — abrir um laudo não deve gravar.
// Uso: node scripts/checar-gravacao-ao-abrir.mjs [baseUrl]
import fs from "node:fs";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "http://localhost:8090";
const alvos = [
  ["PERM.V A-MIN", "/relatorio/os/os_testeaudit/amostra/am_amin/ensaio/en_amin"],
  ["ADENSAMENTO", "/relatorio/os/os_testeaudit/amostra/am_adens/ensaio/en_adens"],
];
const log = (m) => fs.writeSync(1, `[${new Date().toISOString().slice(11, 19)}] ${m}\n`);
let etapa = "início";
setTimeout(() => {
  log(`CÃO DE GUARDA: parado em "${etapa}" após 150s`);
  process.exit(2);
}, 150_000).unref();

etapa = "abrindo o Chrome";
log(etapa);
const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--no-first-run", "--no-default-browser-check"],
});
let falhas = 0;
try {
  for (const [nome, url] of alvos) {
    etapa = `${nome}: nova aba`;
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => sessionStorage.setItem("labflow:guest", "1"));
    const posts = [];
    page.on("request", (r) => {
      if (r.method() !== "POST" || !r.url().includes("_serverFn")) return;
      const id = decodeURIComponent(r.url().split("_serverFn/")[1] || "").split("?")[0];
      let legivel = id;
      try {
        legivel = Buffer.from(id, "base64").toString("utf8");
      } catch {}
      posts.push(legivel.replace(/.*src\//, "").slice(0, 90));
    });
    page.on("dialog", (d) => void d.accept());
    etapa = `${nome}: navegando`;
    log(etapa);
    await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    etapa = `${nome}: observando 20s`;
    await new Promise((r) => setTimeout(r, 20_000));
    const cont = {};
    for (const p of posts) cont[p] = (cont[p] || 0) + 1;
    const gravacoes = Object.keys(cont).filter((k) => /upsert|save|patch|salvar|gravar/i.test(k));
    if (gravacoes.length) falhas++;
    log(`${gravacoes.length ? "FALHA" : "ok   "}  ${nome}: ${posts.length} POST em 20s`);
    for (const [k, v] of Object.entries(cont)) log(`        ${v}x ${k}`);
    etapa = `${nome}: fechando aba`;
    await page.close({ runBeforeUnload: false });
  }
} finally {
  etapa = "fechando o Chrome";
  await browser.close();
}
log(falhas ? `${falhas} laudo(s) gravando só por abrir` : "nenhum laudo grava só por abrir");
process.exitCode = falhas ? 1 : 0;
