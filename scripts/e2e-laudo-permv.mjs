// Teste de ponta a ponta do laudo de PERM.V em Chrome headless.
//
// Pré-requisitos: servidor local rodando em modo offline (ver .env.local) na
// porta indicada e as amostras de `scripts/seed-teste-permv.mjs` gravadas.
// Uso: node scripts/e2e-laudo-permv.mjs [baseUrl] [pastaDeSaida]
//
// Para cada amostra: abre o laudo, mede o miolo de cada folha (estouro = corte
// silencioso), gera o PDF em modo de REVISÃO OFICIAL (foto faltando e folha
// cortada são erro) e grava o PDF em disco para inspeção.
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] || "http://localhost:8090";
const SAIDA = process.argv[3] || path.join(process.cwd(), "e2e-saida");
fs.mkdirSync(SAIDA, { recursive: true });

const CANDIDATOS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const executablePath = CANDIDATOS.find((p) => fs.existsSync(p));
if (!executablePath) throw new Error("Chrome/Edge não encontrado.");

const VARIANTES = [
  { nome: "A-MIN", url: "/relatorio/os/os_testeaudit/amostra/am_amin/ensaio/en_amin", folhasEsperadas: 1 },
  { nome: "A-OBS", url: "/relatorio/os/os_testeaudit/amostra/am_aobs/ensaio/en_aobs" },
  { nome: "A-DET", url: "/relatorio/os/os_testeaudit/amostra/am_adet/ensaio/en_adet" },
  { nome: "A-FOTO", url: "/relatorio/os/os_testeaudit/amostra/am_afoto/ensaio/en_afoto" },
  { nome: "A-TUDO", url: "/relatorio/os/os_testeaudit/amostra/am_atudo/ensaio/en_atudo" },
];

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-first-run", "--no-default-browser-check", "--window-size=1400,1000"],
  defaultViewport: { width: 1400, height: 1000 },
});
const resultados = [];
let falhas = 0;
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(120_000);
  const errosDoConsole = [];
  page.on("pageerror", (e) => errosDoConsole.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errosDoConsole.push(msg.text().slice(0, 300));
  });

  // Modo convidado = `sessionStorage["labflow:guest"]` (hooks/use-auth.tsx).
  // Gravado antes de cada documento carregar: clicar em "Entrar sem login"
  // logo após o carregamento às vezes acontece antes da hidratação e não faz nada.
  await page.evaluateOnNewDocument(() => sessionStorage.setItem("labflow:guest", "1"));

  for (const v of VARIANTES) {
    const inicio = Date.now();
    await page.goto(`${BASE}${v.url}`, { waitUntil: "networkidle2" });
    try {
      await page.waitForSelector(".print-only-report .printable-report", { timeout: 60_000 });
    } catch {
      // Registra o que a tela mostrava em vez de só abortar: sem isso, "não
      // renderizou" não diz se foi login, carregamento dos dados ou erro de tela.
      const captura = path.join(SAIDA, `diagnostico-${v.nome}.png`);
      await page.screenshot({ path: captura });
      const diag = await page.evaluate(() => ({ url: location.href, texto: document.body.innerText.slice(0, 800) }));
      falhas++;
      resultados.push({ variante: v.nome, ok: false, problemas: [`o laudo não renderizou em ${diag.url}`], diagnostico: diag, captura });
      console.log(`FALHA  ${v.nome.padEnd(7)} o laudo não renderizou em ${diag.url}`);
      console.log(`       tela: ${diag.texto.replace(/\s+/g, " ").slice(0, 400)}`);
      console.log(`       erros de console até aqui: ${JSON.stringify(errosDoConsole.slice(-4))}`);
      continue;
    }
    await new Promise((r) => setTimeout(r, 2500)); // gráficos (recharts) terminarem de medir

    const r = await page.evaluate(async () => {
      const el = document.querySelector(".print-only-report");
      const folhas = [...el.querySelectorAll(".printable-report")];
      const medidas = folhas.map((f) => {
        const a = f.querySelector(".report-content-area");
        return {
          cabecalho: f.querySelector("td.text-right")?.textContent?.replace(/\s+/g, " ").trim(),
          estouroPx: a.scrollHeight - a.clientHeight,
          fotos: f.querySelectorAll(".report-content-area img").length,
          blocos: [...f.querySelectorAll(".report-content-area .uppercase")]
            .map((e) => e.textContent.trim().slice(0, 32))
            .filter(Boolean),
        };
      });
      const m = await import("/src/lib/report-pdf.ts");
      let pdf = null;
      let erro = null;
      try {
        const out = await m.rasterizarRelatorioParaPdf(el, { fotosObrigatorias: true, aoEstourar: "erro" });
        const texto = await out.blob.text();
        const b64 = await new Promise((res) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result).split(",")[1]);
          fr.readAsDataURL(out.blob);
        });
        pdf = {
          b64,
          bytes: out.blob.size,
          paginas: (texto.match(/\/Type\s*\/Page\b(?!s)/g) || []).length,
          fotosFalharam: out.fotosQueFalharam.length,
          cortadas: out.folhasCortadas,
        };
      } catch (e) {
        erro = e instanceof Error ? e.message : String(e);
      }
      return { medidas, pdf, erro };
    });

    const problemas = [];
    if (r.erro) problemas.push(`geração falhou: ${r.erro}`);
    const cortes = r.medidas.filter((m) => m.estouroPx > 1);
    if (cortes.length) problemas.push(`folhas com corte: ${cortes.map((c) => c.cabecalho).join(", ")}`);
    if (r.pdf && r.pdf.paginas !== r.medidas.length) problemas.push(`PDF com ${r.pdf.paginas} páginas para ${r.medidas.length} folhas`);
    if (v.folhasEsperadas && r.medidas.length !== v.folhasEsperadas) {
      problemas.push(`esperava ${v.folhasEsperadas} folha(s), saíram ${r.medidas.length}`);
    }
    const total = r.medidas.length;
    r.medidas.forEach((m, i) => {
      if (m.cabecalho && !m.cabecalho.endsWith(`${i + 1} / ${total}`)) problemas.push(`cabeçalho "${m.cabecalho}" na folha ${i + 1}`);
    });

    let arquivo = null;
    if (r.pdf) {
      arquivo = path.join(SAIDA, `PERM-V_${v.nome}.pdf`);
      fs.writeFileSync(arquivo, Buffer.from(r.pdf.b64, "base64"));
    }
    if (problemas.length) falhas++;
    resultados.push({
      variante: v.nome,
      ok: problemas.length === 0,
      folhas: total,
      pdfPaginas: r.pdf?.paginas ?? null,
      pdfKB: r.pdf ? Math.round(r.pdf.bytes / 1024) : null,
      fotosPorFolha: r.medidas.map((m) => m.fotos).join("+"),
      segundos: Math.round((Date.now() - inicio) / 100) / 10,
      problemas,
      arquivo,
      blocosPorFolha: r.medidas.map((m) => m.blocos),
    });
    console.log(`${problemas.length ? "FALHA" : "ok   "}  ${v.nome.padEnd(7)} folhas=${total} pdf=${r.pdf?.paginas ?? "-"}p ${problemas.join(" | ")}`);
  }

  // A pré-visualização tem de mostrar o mesmo número de folhas que o PDF.
  const pv = await page.evaluate(async () => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent?.includes("Pré-visualizar"));
    if (!b) return { erro: "botão de pré-visualização não encontrado" };
    b.click();
    await new Promise((r) => setTimeout(r, 2500));
    const dlg = document.querySelector("[role=dialog]");
    return {
      preVisualizacao: dlg ? dlg.querySelectorAll(".printable-report").length : -1,
      pdf: document.querySelectorAll(".print-only-report .printable-report").length,
    };
  });
  const pvOk = !pv.erro && pv.preVisualizacao === pv.pdf;
  if (!pvOk) falhas++;
  console.log(`${pvOk ? "ok   " : "FALHA"}  pré-visualização A-TUDO: ${JSON.stringify(pv)}`);
  await page.screenshot({ path: path.join(SAIDA, "pre-visualizacao-A-TUDO.png") });

  if (errosDoConsole.length) console.log("Erros de página:", errosDoConsole.slice(0, 5));
  fs.writeFileSync(path.join(SAIDA, "resultado.json"), JSON.stringify({ resultados, preVisualizacao: pv }, null, 2));
} finally {
  await browser.close();
}
console.log(falhas === 0 ? "\nTUDO OK" : `\n${falhas} FALHA(S)`);
process.exitCode = falhas === 0 ? 0 : 1;
