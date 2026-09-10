// Amostras sintéticas de PERM.V para teste local (modo offline, grava em .data/).
// Uso: node scripts/seed-teste-permv.mjs
//
// Replica o formato em disco do driveStorage sem credenciais: cada arquivo
// existe em duas cópias — `<pastaId>_<nome>` (vista pela listagem da pasta) e
// `<nome>` (vista pela leitura por nome). O id da pasta offline é derivado de
// (pastaPai, nome) — mesmo `hashCurto` (FNV-1a) de createFolder em driveStorage.ts.
import fs from "node:fs";
import path from "node:path";

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

const agora = new Date().toISOString();
const OS_ID = "os_testeaudit";

gravar("lab-os", `${OS_ID}.json`, {
  id: OS_ID,
  numero: "TESTE-AUDIT",
  client: "Laboratório — Teste de Auditoria",
  workNumber: "TESTE-AUDIT",
  local: "Ensaios de Laboratório",
  operator: "Téc. Teste",
  technicalResp: "Engº Maurício Malanconi - CREA: 5063078630",
  revision: "0",
  createdAt: agora,
  updatedAt: agora,
  rev: 1,
});

// Fotos: bytes reais de uma imagem do projeto, servidas por /api/photo/<id>.
const png = fs.readFileSync(path.join(process.cwd(), "public", "suporte-infra-logo.png"));
function foto(i, kind) {
  const id = `seedfoto${i}`;
  fs.writeFileSync(path.join(DATA, `photo_${id}`), png);
  fs.writeFileSync(path.join(DATA, `photo_${id}.meta`), "image/png", "utf8");
  return {
    id: `ph_${id}`,
    dataUrl: "",
    url: `/api/photo/${id}`,
    caption: "",
    createdAt: agora,
    kind,
    bytes: png.length,
  };
}

function leituras(n) {
  // Carga caindo de forma exponencial, como no ensaio real; temperatura ~21 °C.
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i === 0 ? 0 : 60 * i * (1 + i * 0.4);
    const h = 160 * Math.exp(-t / 2600);
    out.push({
      id: `lt_${i}`,
      tSegundos: Math.round(t),
      leituraBruta: Math.round((160 - h) * 100) / 100,
      temperatura: 20.5 + (i % 3) * 0.5,
      alturaCp: null,
    });
  }
  return out;
}

function sample(extra) {
  return {
    client: "Laboratório — Teste de Auditoria",
    workNumber: "TESTE-AUDIT",
    reportNumber: extra.reportNumber,
    borehole: "SP-TESTE",
    depth: "1,50 a 2,00",
    local: "Ensaios de Laboratório",
    date: agora.slice(0, 10),
    revision: "0",
    operator: "Téc. Teste",
    technicalResp: "Engº Maurício Malanconi - CREA: 5063078630",
    typedBy: "Téc. Teste",
    description: "Argila siltosa — amostra sintética de teste",
    code: extra.reportNumber,
    os: "TESTE-AUDIT",
    granulometricDescription: "",
    naturezaAgua: "Destilada / deairada",
    gradienteHidraulico: 10,
    massaUmida: 377.7,
    capsulas: [
      { numero: "1", tara: 20, wet: 60, dry: 52 },
      { numero: "2", tara: 21, wet: 61, dry: 53 },
      { numero: "3", tara: 19, wet: 59, dry: 51 },
    ],
    massaEspecificaGraos: 2.564,
    diametroInicial: 5,
    alturaInicial: 10,
    cargaHidraulicaInicial: 160,
    calibracao: {
      modo: "volume",
      volumeReferenciaMl: 1,
      alturaReferenciaCm: 1,
      areaBuretaCm2: null,
      diametroInternoBuretaMm: null,
      curva: [],
    },
    leituras: leituras(extra.nLeituras),
    observacoes: extra.observacoes ?? "",
    mediaExcluidas: extra.mediaExcluidas ?? [],
  };
}

const obsLonga = Array.from(
  { length: 15 },
  (_, i) => `${i + 1}. Observação técnica de teste — trincas visíveis no topo do corpo de prova após a moldagem, registradas antes da saturação.`,
).join("\n");

const variantes = [
  { am: "am_amin", en: "en_amin", reportNumber: "A-MIN", nLeituras: 6 },
  { am: "am_aobs", en: "en_aobs", reportNumber: "A-OBS", nLeituras: 6, observacoes: obsLonga },
  { am: "am_adet", en: "en_adet", reportNumber: "A-DET", nLeituras: 13, mediaExcluidas: ["lt_1"] },
  { am: "am_afoto", en: "en_afoto", reportNumber: "A-FOTO", nLeituras: 6, fotos: 6 },
  { am: "am_atudo", en: "en_atudo", reportNumber: "A-TUDO", nLeituras: 13, observacoes: obsLonga, fotos: 6, mediaExcluidas: ["lt_1", "lt_2"] },
];

let nFoto = 0;
for (const v of variantes) {
  gravar("lab-amostras", `${OS_ID}__${v.am}.json`, {
    id: v.am,
    osId: OS_ID,
    reportNumber: v.reportNumber,
    borehole: "SP-TESTE",
    depth: "1,50 a 2,00",
    description: "Argila siltosa — amostra sintética de teste",
    granulometricDescription: null,
    code: v.reportNumber,
    sampleType: null,
    materialType: null,
    coords: null,
    photos: [],
    createdAt: agora,
    updatedAt: agora,
    rev: 1,
  });
  const photos = Array.from({ length: v.fotos ?? 0 }, (_, i) => foto(++nFoto, i % 2 === 0 ? "moldagem" : "ruptura"));
  const s = sample(v);
  gravar("lab-ensaios", `${v.am}__${v.en}.json`, {
    id: v.en,
    amostraId: v.am,
    tipo: "perm-v",
    status: "rascunho",
    label: "Permeabilidade a Carga Variável (PERM.V)",
    nome: "Permeabilidade a Carga Variável (PERM.V)",
    sigla: "PERM.V",
    operator: "Téc. Teste",
    photos,
    payload: { sample: s, photos },
    createdAt: agora,
    updatedAt: agora,
    rev: 1,
    draftRev: 1,
  });
  console.log(`${v.reportNumber.padEnd(7)} /relatorio/os/${OS_ID}/amostra/${v.am}/ensaio/${v.en}`);
}
