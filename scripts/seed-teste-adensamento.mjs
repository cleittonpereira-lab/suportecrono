// Amostra de ADENSAMENTO para teste local (modo offline, grava em .data/).
// Uso: node scripts/seed-teste-adensamento.mjs <arquivo-de-ensaio-real.json>
//
// Montar estágios de adensamento sintéticos realistas (leituras por estágio,
// ajustes de Casagrande/Taylor) é trabalhoso e pouco fiel; em vez disso, copia
// o payload de um ensaio real — lido, nunca alterado — para dentro da OS de
// teste TESTE-AUDIT (a mesma de `seed-teste-permv.mjs`, que deve rodar antes).
// Mesmo formato em disco do driveStorage offline: `<pastaId>_<nome>` e `<nome>`.
import fs from "node:fs";
import path from "node:path";

const origem = process.argv[2];
if (!origem || !fs.existsSync(origem)) {
  console.error("Informe o caminho de um arquivo lab-ensaios/<amostra>__<ensaio>.json de adensamento.");
  process.exit(1);
}

const RAIZ_DRIVE = "0AB6VPuj1fWHEUk9PVA";
const DATA = path.join(process.cwd(), ".data");
fs.mkdirSync(DATA, { recursive: true });

function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
const pasta = (nome) => `local_folder_${hash(`${RAIZ_DRIVE}/${nome}`)}`;
const seguro = (s) => s.replace(/[^\w.-]+/g, "_");

function gravar(nomePasta, arquivo, dados) {
  const texto = JSON.stringify(dados, null, 2);
  fs.writeFileSync(path.join(DATA, seguro(`${pasta(nomePasta)}_${arquivo}`)), texto);
  fs.writeFileSync(path.join(DATA, seguro(arquivo)), texto);
}

const real = JSON.parse(fs.readFileSync(origem, "utf8"));
if (real.tipo !== "adensamento") throw new Error(`O arquivo é de ${real.tipo}, não de adensamento.`);
const agora = new Date().toISOString();
const OS_ID = "os_testeaudit";
const AM = "am_adens";
const EN = "en_adens";
const CODIGO = "A-ADENS";

const payload = structuredClone(real.payload ?? {});
payload.sample = {
  ...payload.sample,
  os: "TESTE-AUDIT",
  client: "Laboratório — Teste de Auditoria",
  workNumber: "TESTE-AUDIT",
  project: "Teste de Auditoria",
  code: CODIGO,
  reportNumber: CODIGO,
  borehole: "SP-TESTE",
};

gravar("lab-amostras", `${OS_ID}__${AM}.json`, {
  id: AM,
  osId: OS_ID,
  reportNumber: CODIGO,
  borehole: "SP-TESTE",
  depth: payload.sample.depth ?? "",
  description: payload.sample.description ?? "",
  granulometricDescription: null,
  code: CODIGO,
  sampleType: null,
  materialType: null,
  coords: null,
  photos: [],
  createdAt: agora,
  updatedAt: agora,
  rev: 1,
});

gravar("lab-ensaios", `${AM}__${EN}.json`, {
  id: EN,
  amostraId: AM,
  tipo: "adensamento",
  status: "rascunho",
  label: real.label,
  nome: real.nome,
  sigla: real.sigla,
  operator: real.operator,
  photos: real.photos ?? [],
  payload,
  createdAt: agora,
  updatedAt: agora,
  rev: 1,
  draftRev: 1,
});

console.log(
  `${CODIGO}  estágios=${payload.stages?.length ?? 0} fotos=${(real.photos ?? []).length}  ` +
    `/relatorio/os/${OS_ID}/amostra/${AM}/ensaio/${EN}`,
);
