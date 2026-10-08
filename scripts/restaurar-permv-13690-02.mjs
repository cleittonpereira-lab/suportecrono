// Restaura o PERM.V original da amostra 13690-02 (OS 17948-26, SH-02-189,
// 2.00 – 2.80 m) como um ensaio NOVO — outra linha de relatório. Não altera
// nem apaga nenhum registro existente: só faz INSERT de
// lab-ensaios/am_0ddwhzg4we__en_rec1369002.json.
//
// Em 08/10 o avulso do 13690-03 abriu esta amostra e gravou por cima do
// ensaio en_mysec3a4wv. A digitação original (salva às 09:07) está em
// recuperacao-17948-26-13690-02/dados/ensaio.json, na pasta do Drive.
//
//   node scripts/restaurar-permv-13690-02.mjs            → só confere (leitura)
//   node scripts/restaurar-permv-13690-02.mjs --aplicar  → grava a linha nova
//
// Opcional: --local (banco local, para testar), --origem "<caminho do ensaio.json>" (padrão: a pasta do Drive).
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "..");
const local = process.argv.includes("--local"); // teste no banco local de wrangler.dev.jsonc
const CONFIG = join(raiz, local ? "wrangler.dev.jsonc" : "wrangler.d1-producao.jsonc");
const BANCO = "suportecrono-dados";

const AMOSTRA_ID = "am_0ddwhzg4we";
const ENSAIO_SOBRESCRITO = "en_mysec3a4wv";
const ENSAIO_NOVO = "en_rec1369002";
const NOME_NOVO = `${AMOSTRA_ID}__${ENSAIO_NOVO}.json`;
const CODIGO = "13690-02";

const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const iOrigem = args.indexOf("--origem");
const origem =
  iOrigem >= 0
    ? args[iOrigem + 1]
    : "G:/Drives compartilhados/SuporteCrono - Laboratório/recuperacao-17948-26-13690-02/dados/ensaio.json";

function d1(sqlOuArquivo, { arquivo = false } = {}) {
  const alvo = arquivo ? ["--file", sqlOuArquivo] : ["--command", sqlOuArquivo];
  // O wrangler do projeto direto pelo node, sem shell: o SQL vai como está (o
  // cmd do Windows mexeria nas aspas e nos `%`).
  const r = spawnSync(
    process.execPath,
    [join(raiz, "node_modules", "wrangler", "bin", "wrangler.js"), "d1", "execute", BANCO, ...(local ? ["--local", "--persist-to", join(raiz, ".wrangler", "state")] : ["--remote"]), "--config", CONFIG, "--json", ...alvo],
    { cwd: raiz, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error("wrangler d1 execute falhou.");
  }
  const saida = JSON.parse(r.stdout.slice(r.stdout.indexOf("[")));
  return saida[0]?.results ?? [];
}

const sqlTexto = (s) => `'${String(s).replace(/'/g, "''")}'`;

function falhar(msg) {
  console.error(`\n✗ ${msg}\nNada foi gravado.`);
  process.exit(1);
}

// 1. Original salvo
const original = JSON.parse(readFileSync(origem, "utf8"));
const s = original.sample ?? {};
if (s.code !== CODIGO || s.os !== "17948-26" || !/^2[.,]00/.test(s.depth ?? "")) {
  falhar(`O arquivo de origem não é o PERM.V do ${CODIGO} (code=${s.code}, os=${s.os}, depth=${s.depth}).`);
}
console.log(`Original: ${s.os} · ${s.reportNumber} · ${s.code} · ${s.depth} · Mu ${s.massaUmida} · D ${s.diametroInicial} · H ${s.alturaInicial} · ${s.leituras?.length} leituras (salvo ${original.savedAt})`);

// 2. Situação atual no banco (só leitura)
const amostra = d1(`SELECT dados FROM documentos WHERE pasta='lab-amostras' AND nome LIKE '%__${AMOSTRA_ID}.json'`);
if (amostra.length !== 1) falhar(`Amostra ${AMOSTRA_ID} não encontrada (${amostra.length} registros).`);
const am = JSON.parse(amostra[0].dados);
console.log(`Amostra ${AMOSTRA_ID}: nome ${am.reportNumber} · código ${am.code} · prof. ${am.depth}`);
if (String(am.code ?? "").trim() !== CODIGO) falhar(`A amostra ${AMOSTRA_ID} tem código ${am.code}, não ${CODIGO}.`);

const ensaios = d1(`SELECT nome, rev, atualizado_em, dados FROM documentos WHERE pasta='lab-ensaios' AND nome LIKE '${AMOSTRA_ID}__%'`);
console.log(`\nEnsaios ligados à amostra (${ensaios.length}):`);
let modelo = null;
for (const e of ensaios) {
  const d = JSON.parse(e.dados);
  const ps = d.payload?.sample ?? {};
  const revs = (d.reportApprovals ?? []).map((a) => `Rev-${String(a.rev).padStart(2, "0")} ${a.status}`).join(", ") || "sem revisões no fluxo";
  console.log(`  ${e.nome}  ${d.tipo}  status=${d.status}  dados de: ${ps.code ?? "?"} ${ps.depth ?? ""}  Mu=${ps.massaUmida ?? "?"}  (${revs}; atualizado ${e.atualizado_em})`);
  if (d.id === ENSAIO_SOBRESCRITO) modelo = d;
}
if (ensaios.some((e) => e.nome === NOME_NOVO)) falhar(`A linha restaurada (${NOME_NOVO}) já existe.`);

// 3. Linha nova
const agora = new Date().toISOString();
const novo = {
  id: ENSAIO_NOVO,
  amostraId: AMOSTRA_ID,
  tipo: "perm-v",
  status: "rascunho",
  label: modelo?.label ?? "PERM.V",
  nome: modelo?.nome ?? "PERM.V",
  sigla: modelo?.sigla ?? "PERM.V",
  operator: s.operator ?? modelo?.operator ?? null,
  photos: [],
  payload: { sample: s, photos: [], rev: 0, savedAt: original.savedAt },
  createdAt: agora,
  updatedAt: agora,
  rev: 1,
  draftRev: 0,
  draftHistory: [
    {
      changedAt: agora,
      changedBy: "restauracao",
      changedByName: "Restauração 08/10 (digitação original do 13690-02)",
      diff: { origem: { de: `${ENSAIO_SOBRESCRITO} (sobrescrito pelo avulso do 13690-03)`, para: ENSAIO_NOVO } },
    },
  ],
};

console.log(`\nLinha nova: lab-ensaios/${NOME_NOVO} (status rascunho, sem revisões, sem fotos).`);
if (!aplicar) {
  console.log("\nSó conferência. Para gravar: node scripts/restaurar-permv-13690-02.mjs --aplicar");
  process.exit(0);
}

const pasta = mkdtempSync(join(tmpdir(), "restaurar-permv-"));
const sql = join(pasta, "insert.sql");
// INSERT puro: se a linha já existir, a chave (pasta, nome) recusa — nunca sobrescreve.
writeFileSync(
  sql,
  `INSERT INTO documentos (pasta, nome, dados, rev, criado_em, atualizado_em) VALUES ('lab-ensaios', ${sqlTexto(NOME_NOVO)}, ${sqlTexto(JSON.stringify(novo))}, 1, ${sqlTexto(agora)}, ${sqlTexto(agora)});\n`,
  "utf8",
);
d1(sql, { arquivo: true });

const conf = d1(`SELECT dados FROM documentos WHERE pasta='lab-ensaios' AND nome=${sqlTexto(NOME_NOVO)}`);
const g = conf[0] && JSON.parse(conf[0].dados).payload?.sample;
if (!g || g.code !== CODIGO || g.massaUmida !== s.massaUmida) falhar("A conferência depois do INSERT não bateu — verifique o banco.");
console.log(`\n✓ Gravado: ${NOME_NOVO} — ${g.code} ${g.depth}, Mu ${g.massaUmida}, ${g.leituras.length} leituras.`);
console.log("Abra o PERM.V restaurado pela OS 17948-26 → SH-02-189 (13690-02), confira e envie para revisão.");
