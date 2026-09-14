// Teste de ponta a ponta do laudo de ADENSAMENTO em Chrome headless.
//
// Pré-requisitos: servidor local em modo offline e as amostras de
// `seed-teste-permv.mjs` + `seed-teste-adensamento.mjs` gravadas.
// Uso: node scripts/e2e-laudo-adensamento.mjs [baseUrl] [pastaDeSaida]
//
// Percorre o caminho real da tela: aba "Relatório" → "Exportar PDF". Mede cada
// folha (conteúdo além de 297mm some na captura) e confere o PDF baixado:
// cabeçalho %PDF-, tamanho, número de páginas igual ao de folhas.
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "http://localhost:8090";
const SAIDA = process.argv[3] || path.join(process.cwd(), "e2e-saida");
fs.mkdirSync(SAIDA, { recursive: true });
const URL_LAUDO = "/relatorio/os/os_testeaudit/amostra/am_adens/ensaio/en_adens";

const CANDIDATOS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const executablePath = CANDIDATOS.find((p) => fs.existsSync(p));
if (!executablePath) throw new Error("Chrome/Edge não encontrado.");

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-first-run", "--no-default-browser-check", "--window-size=1400,1000"],
  defaultViewport: { width: 1400, height: 1000 },
});
const problemas = [];
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(120_000);
  const erros = [];
  page.on("pageerror", (e) => erros.push(String(e).slice(0, 300)));

  await page.evaluateOnNewDocument(() => {
    // Modo convidado (hooks/use-auth.tsx).
    sessionStorage.setItem("labflow:guest", "1");
    // Captura o download do PDF: a tela cria um <a download href="blob:..."> e
    // clica. Em vez de depender da pasta de downloads do Chrome headless, lê o
    // blob no próprio clique.
    const clicar = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download && this.href.startsWith("blob:")) {
        const nome = this.download;
        window.__downloads = window.__downloads || [];
        fetch(this.href)
          .then((r) => r.arrayBuffer())
          .then((buf) => {
            const bytes = new Uint8Array(buf);
            let s = "";
            for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            window.__downloads.push({ nome, b64: btoa(s), bytes: bytes.length });
          });
        return;
      }
      return clicar.call(this);
    };
  });

  const inicio = Date.now();
  await page.goto(`${BASE}${URL_LAUDO}`, { waitUntil: "domcontentloaded" });
  await page.locator('button[role="tab"]::-p-text(Relatório)').click();
  await page.waitForSelector("[data-pdf-page]");
  await new Promise((r) => setTimeout(r, 3000)); // gráficos (recharts) terminarem de medir

  const folhas = await page.evaluate(() =>
    [...document.querySelectorAll("[data-pdf-page]")].map((f) => ({
      estouroPx: Math.max(0, f.scrollHeight - f.clientHeight),
      graficos: f.querySelectorAll(".recharts-surface").length,
      imagens: f.querySelectorAll("img").length,
    })),
  );
  const cortadas = folhas.map((f, i) => ({ ...f, folha: i + 1 })).filter((f) => f.estouroPx > 1);
  if (cortadas.length) problemas.push(`folhas com corte: ${cortadas.map((c) => `${c.folha} (+${c.estouroPx}px)`).join(", ")}`);

  await page.locator("button::-p-text(Exportar PDF)").click();
  const resultado = await page
    .waitForFunction(
      () => {
        if (window.__downloads?.length) return { ok: true, ...window.__downloads[0] };
        const erro = [...document.querySelectorAll("[data-sonner-toast]")]
          .map((t) => t.textContent || "")
          .find((t) => /erro|falha/i.test(t));
        return erro ? { ok: false, erro } : false;
      },
      { timeout: 240_000, polling: 500 },
    )
    .then((h) => h.jsonValue());

  let paginasPdf = null;
  let arquivo = null;
  if (!resultado.ok) {
    problemas.push(`exportação falhou: ${resultado.erro}`);
  } else {
    const buf = Buffer.from(resultado.b64, "base64");
    arquivo = path.join(SAIDA, "ADENSAMENTO_A-ADENS.pdf");
    fs.writeFileSync(arquivo, buf);
    const texto = buf.toString("latin1");
    paginasPdf = (texto.match(/\/Type\s*\/Page\b(?!s)/g) || []).length;
    if (!texto.startsWith("%PDF-")) problemas.push("o arquivo baixado não é PDF");
    if (buf.length < 5000) problemas.push(`PDF vazio (${buf.length} bytes)`);
    if (paginasPdf !== folhas.length) problemas.push(`PDF com ${paginasPdf} páginas para ${folhas.length} folhas`);
  }
  const semGrafico = folhas.filter((f) => f.graficos === 0).length;

  const linha = {
    variante: "A-ADENS",
    ok: problemas.length === 0,
    folhas: folhas.length,
    pdfPaginas: paginasPdf,
    pdfKB: resultado.ok ? Math.round(resultado.bytes / 1024) : null,
    folhasSemGrafico: semGrafico,
    imagensPorFolha: folhas.map((f) => f.imagens).join("+"),
    segundos: Math.round((Date.now() - inicio) / 100) / 10,
    problemas,
    arquivo,
    errosDePagina: erros.slice(0, 5),
  };
  fs.writeFileSync(path.join(SAIDA, "resultado-adensamento.json"), JSON.stringify(linha, null, 2));
  await page.screenshot({ path: path.join(SAIDA, "adensamento-relatorio.png") });
  console.log(
    `${problemas.length ? "FALHA" : "ok   "}  A-ADENS folhas=${folhas.length} pdf=${paginasPdf ?? "-"}p ` +
      `${linha.pdfKB ?? "-"}KB ${linha.segundos}s ${problemas.join(" | ")}`,
  );
  if (erros.length) console.log("Erros de página:", erros.slice(0, 5));
} finally {
  await browser.close();
}
process.exitCode = problemas.length === 0 ? 0 : 1;
