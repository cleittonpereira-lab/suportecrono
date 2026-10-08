// Restaura a amostra 13690-02 (OS 17948-26, SH-02-189, 2.00 – 2.80 m) e o
// PERM.V original dela como registros NOVOS — outra linha de relatório. Não
// altera nem apaga nenhum registro existente: só faz INSERT de
//   lab-amostras/os_14btm864w0__am_rec1369002.json
//   lab-ensaios/am_rec1369002__en_rec1369002.json
//
// Em 08/10 o avulso do 13690-03 abriu a amostra am_0ddwhzg4we (13690-02) e
// gravou por cima dela — código e profundidade da amostra e o ensaio
// en_mysec3a4wv. Os dois ficaram com o 13690-03 e assim continuam. A
// digitação original (salva às 09:07) está em
// recuperacao-17948-26-13690-02/dados/ensaio.json, na pasta do Drive.
//
//   node scripts/restaurar-permv-13690-02.mjs            → só confere (leitura)
//   node scripts/restaurar-permv-13690-02.mjs --aplicar  → grava as linhas novas
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

const OS_ID = "os_14btm864w0";
const AMOSTRA_SOBRESCRITA = "am_0ddwhzg4we";
const ENSAIO_SOBRESCRITO = "en_mysec3a4wv";
const AMOSTRA_NOVA = "am_rec1369002";
const ENSAIO_NOVO = "en_rec1369002";
const ARQ_AMOSTRA = `${OS_ID}__${AMOSTRA_NOVA}.json`;
const ARQ_ENSAIO = `${AMOSTRA_NOVA}__${ENSAIO_NOVO}.json`;
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
    [
      join(raiz, "node_modules", "wrangler", "bin", "wrangler.js"),
      "d1", "execute", BANCO,
      ...(local ? ["--local", "--persist-to", join(raiz, ".wrangler", "state")] : ["--remote"]),
      "--config", CONFIG, "--json", ...alvo,
    ],
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
const amostras = d1(`SELECT nome, dados FROM documentos WHERE pasta='lab-amostras' AND nome LIKE '${OS_ID}__%'`).map((r) => ({
  nome: r.nome,
  ...JSON.parse(r.dados),
}));
const sobrescrita = amostras.find((a) => a.id === AMOSTRA_SOBRESCRITA);
if (!sobrescrita) falhar(`Amostra ${AMOSTRA_SOBRESCRITA} não encontrada.`);
console.log(`Amostra ${AMOSTRA_SOBRESCRITA} (fica como está): ${sobrescrita.reportNumber} · ${sobrescrita.code} · ${sobrescrita.depth}`);
const ja = amostras.filter((a) => String(a.code ?? "").trim() === CODIGO);
if (ja.length > 0) falhar(`Já existe amostra com código ${CODIGO} na OS: ${ja.map((a) => a.nome).join(", ")}.`);

const ensaios = d1(`SELECT nome, dados FROM documentos WHERE pasta='lab-ensaios' AND (nome LIKE '${AMOSTRA_SOBRESCRITA}__%' OR nome LIKE '${AMOSTRA_NOVA}__%')`);
let modelo = null;
for (const e of ensaios) {
  const d = JSON.parse(e.dados);
  const ps = d.payload?.sample ?? {};
  const revs = (d.reportApprovals ?? []).map((a) => `Rev-${String(a.rev).padStart(2, "0")} ${a.status}`).join(", ") || "sem revisões no fluxo";
  console.log(`  ${e.nome}  ${d.tipo}  status=${d.status}  dados de: ${ps.code ?? "?"} ${ps.depth ?? ""}  Mu=${ps.massaUmida ?? "?"}  (${revs})`);
  if (d.id === ENSAIO_SOBRESCRITO) modelo = d;
}
if (ensaios.some((e) => e.nome === ARQ_ENSAIO)) falhar(`A linha restaurada (${ARQ_ENSAIO}) já existe.`);

// 3. Linhas novas
const agora = new Date().toISOString();
const amostra = {
  ...sobrescrita,
  id: AMOSTRA_NOVA,
  code: CODIGO,
  reportNumber: s.reportNumber ?? sobrescrita.reportNumber,
  borehole: s.borehole ?? sobrescrita.borehole,
  depth: s.depth,
  description: s.description ?? "",
  photos: [],
  createdAt: agora,
  updatedAt: agora,
  rev: 1,
};
delete amostra.nome;

const ensaio = {
  id: ENSAIO_NOVO,
  amostraId: AMOSTRA_NOVA,
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
      diff: { origem: { de: `${AMOSTRA_SOBRESCRITA}/${ENSAIO_SOBRESCRITO} (sobrescrito pelo avulso do 13690-03)`, para: `${AMOSTRA_NOVA}/${ENSAIO_NOVO}` } },
    },
  ],
};

console.log(`\nLinhas novas:\n  lab-amostras/${ARQ_AMOSTRA}  ${amostra.reportNumber} · ${amostra.code} · ${amostra.depth}\n  lab-ensaios/${ARQ_ENSAIO}  PERM.V em rascunho, sem revisões, sem fotos`);
if (!aplicar) {
  console.log("\nSó conferência. Para gravar: node scripts/restaurar-permv-13690-02.mjs --aplicar");
  process.exit(0);
}

const pasta = mkdtempSync(join(tmpdir(), "restaurar-permv-"));
const sql = join(pasta, "insert.sql");
const linha = (p, nome, dados) =>
  `INSERT INTO documentos (pasta, nome, dados, rev, criado_em, atualizado_em) VALUES ('${p}', ${sqlTexto(nome)}, ${sqlTexto(JSON.stringify(dados))}, 1, ${sqlTexto(agora)}, ${sqlTexto(agora)});`;
// INSERT puro: se a linha já existir, a chave (pasta, nome) recusa — nunca sobrescreve.
writeFileSync(sql, `${linha("lab-amostras", ARQ_AMOSTRA, amostra)}\n${linha("lab-ensaios", ARQ_ENSAIO, ensaio)}\n`, "utf8");
d1(sql, { arquivo: true });

const ga = d1(`SELECT dados FROM documentos WHERE pasta='lab-amostras' AND nome=${sqlTexto(ARQ_AMOSTRA)}`)[0];
const ge = d1(`SELECT dados FROM documentos WHERE pasta='lab-ensaios' AND nome=${sqlTexto(ARQ_ENSAIO)}`)[0];
const am = ga && JSON.parse(ga.dados);
const g = ge && JSON.parse(ge.dados).payload?.sample;
if (!am || am.code !== CODIGO || !g || g.code !== CODIGO || g.massaUmida !== s.massaUmida) {
  falhar("A conferência depois do INSERT não bateu — verifique o banco.");
}
console.log(`\n✓ Gravado: amostra ${am.reportNumber} · ${am.code} · ${am.depth} e PERM.V com Mu ${g.massaUmida}, ${g.leituras.length} leituras.`);
console.log("Abra pela OS 17948-26 → SH-02-189 (13690-02), confira e envie para revisão.");
