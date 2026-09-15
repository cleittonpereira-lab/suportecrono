// Laudo de ponta a ponta (Fase 6) no app COMPILADO, no runtime local do
// Cloudflare (wrangler dev), com um banco D1 próprio e vazio — nada aqui toca
// a produção, o Drive ou contas reais.
//
//   npm run build && npm run e2e          (porta opcional: node scripts/e2e-laudo.mjs 8097)
//
// Cria no banco de teste uma conta de administrador/aprovador e assina a
// sessão dela com um segredo gerado na hora (sem senha). Percorre, pelo
// servidor, o caminho de um laudo: OS → amostra → ensaio → rascunho → enviar
// para verificação → verificar → aprovar; e o da bancada: pendência criada e
// finalizada aparecendo na Central. Confere também que sem login nada grava.
// Sai com código 1 se algo falhar — é o que o GitHub Actions confere.
import { execSync, spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "..");
const require = createRequire(join(raiz, "package.json"));
const { toJSON, fromCrossJSON } = require("seroval");
// Mesmos plugins que o app usa para ler as respostas das server functions
// (@tanstack/start-client-core → client-rpc/serverFnFetcher.js).
const { defaultSerovalPlugins } = await import("@tanstack/router-core");

const PORTA = process.argv[2] ?? "8097";
const BASE = `http://127.0.0.1:${PORTA}`;
const pastaServidor = join(raiz, ".output", "server");
const estado = join(raiz, ".wrangler", "e2e");
const SEGREDO = randomBytes(24).toString("hex");
const USUARIO = "e2e-admin";
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- Preparação: configuração, banco e conta de teste ----------------

const gerada = join(pastaServidor, "wrangler.json");
if (!existsSync(gerada)) {
  console.error("Não achei .output/server/wrangler.json — rode `npm run build` antes.");
  process.exit(1);
}
const dev = JSON.parse(readFileSync(join(raiz, "wrangler.dev.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, ""));
const config = JSON.parse(readFileSync(gerada, "utf8"));
const arqConfig = join(pastaServidor, "wrangler.e2e.json");
writeFileSync(
  arqConfig,
  JSON.stringify(
    {
      ...config,
      d1_databases: dev.d1_databases.map((d) => ({ ...d, migrations_dir: join(raiz, d.migrations_dir) })),
      vars: { ...(config.vars ?? {}), DADOS_NO_D1: "1", AUTH_SESSION_SECRET: SEGREDO },
    },
    null,
    2,
  ),
);

rmSync(estado, { recursive: true, force: true });
mkdirSync(estado, { recursive: true });
const wrangler = (args) =>
  execSync(`npx wrangler ${args} --config "${arqConfig}" --persist-to "${estado}"`, {
    cwd: pastaServidor,
    stdio: "pipe",
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
  });

wrangler("d1 migrations apply DB --local");
const agora = new Date().toISOString();
const conta = {
  id: USUARIO,
  email: "e2e@teste.local",
  username: "e2e",
  nome: "Teste Automático",
  cargo: null,
  titulo: null,
  passwordHash: null,
  role: "admin",
  labRole: "aprovador",
  status: "ativo",
  tabs: [],
  avatarFileId: null,
  emailConfirmedAt: agora,
  lastSignInAt: null,
  createdAt: agora,
  updatedAt: agora,
  rev: 1,
};
const semente = join(estado, "semente.sql");
writeFileSync(
  semente,
  `INSERT INTO documentos (pasta, nome, dados) VALUES ('usuarios', '${USUARIO}.json', '${JSON.stringify(conta).replace(/'/g, "''")}');\n`,
);
wrangler(`d1 execute DB --local --file "${semente}"`);

/** Mesmo formato de src/lib/auth-session.server.ts (payload.exp em base64url + HMAC-SHA256). */
function cookieDaSessao(userId) {
  const payload = `${userId}.${Date.now() + 60 * 60 * 1000}`;
  const assinatura = createHmac("sha256", SEGREDO).update(payload).digest("base64url");
  return `si_session=${Buffer.from(payload, "utf8").toString("base64url")}.${assinatura}`;
}
const COOKIE = cookieDaSessao(USUARIO);

/** Ids das server functions deste build, pelo nome (arquivo do resolvedor gerado pelo TanStack Start). */
function idsDasFuncoes() {
  const arq = readdirSync(pastaServidor).find((n) => n.startsWith("__23tanstack-start-server-fn-resolver") && n.endsWith(".mjs"));
  if (!arq) throw new Error("Resolvedor das server functions não encontrado em .output/server.");
  const texto = readFileSync(join(pastaServidor, arq), "utf8");
  const ids = {};
  for (const m of texto.matchAll(/"([0-9a-f]{64})":\s*\{\s*functionName:\s*"(\w+?)_createServerFn_handler"/g)) ids[m[2]] = m[1];
  return ids;
}
const IDS = idsDasFuncoes();

// ---------------- App no ar ----------------

const naoWindows = process.platform !== "win32";
// --test-scheduled: abre /cdn-cgi/handler/scheduled para disparar os agendamentos (checagem de saúde).
const app = spawn(`npx wrangler dev --config "${arqConfig}" --persist-to "${estado}" --port ${PORTA} --local --test-scheduled`, {
  cwd: pastaServidor,
  shell: true,
  detached: naoWindows,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, CI: "1" },
});
let registro = "";
app.stdout.on("data", (d) => (registro += d));
app.stderr.on("data", (d) => (registro += d));

function encerrar() {
  try {
    if (naoWindows) process.kill(-app.pid, "SIGTERM");
    else execSync(`taskkill /pid ${app.pid} /T /F`, { stdio: "ignore" });
  } catch {
    // já terminou
  }
}

async function aguardarApp() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/auth`)).ok) return;
    } catch {
      // ainda subindo
    }
    await espera(1000);
  }
  throw new Error(`O app não subiu em 2 minutos. Fim do registro:\n${registro.slice(-3000)}`);
}

async function chamar(nome, metodo, data, { comSessao = true } = {}) {
  const id = IDS[nome];
  if (!id) throw new Error(`Server function ${nome} não encontrada neste build.`);
  const corpo = JSON.stringify(toJSON({ data }));
  const url = `${BASE}/_serverFn/${id}` + (metodo === "GET" ? `?payload=${encodeURIComponent(corpo)}` : "");
  const headers = { "x-tsr-serverFn": "true", origin: BASE, "sec-fetch-site": "same-origin" };
  if (metodo === "POST") headers["content-type"] = "application/json";
  if (comSessao) headers.cookie = COOKIE;
  const r = await fetch(url, { method: metodo, headers, body: metodo === "POST" ? corpo : undefined });
  const texto = await r.text();
  let valor;
  try {
    valor = fromCrossJSON(JSON.parse(texto), { plugins: defaultSerovalPlugins, refs: new Map() });
  } catch {
    valor = undefined;
  }
  const erro = valor?.error ? String(valor.error.message ?? valor.error) : r.ok ? null : `HTTP ${r.status}`;
  return { status: r.status, resultado: valor?.result, erro, texto };
}

// ---------------- Roteiro ----------------

const falhas = [];
function conferir(rotulo, ok, detalhe = "") {
  console.log(`${ok ? "OK   " : "FALHA"} ${rotulo}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!ok) falhas.push(rotulo);
}

try {
  await aguardarApp();

  for (const p of ["/auth", "/registro-amostra", "/manifest.webmanifest", "/sw.js"]) {
    const r = await fetch(BASE + p);
    conferir(`página ${p}`, r.status === 200, `HTTP ${r.status}`);
  }

  const t = new Date().toISOString();
  const osId = "e2e-os";
  const amId = "e2e-am";
  const enId = "e2e-en";
  const scopeId = `os/${osId}/amostra/${amId}/ensaio/${enId}`;
  const os = { id: osId, numero: "E2E-01", client: "Cliente Teste", createdAt: t, updatedAt: t };

  // Sem login, nada grava nem lê.
  let r = await chamar("upsertOSFn", "POST", os, { comSessao: false });
  conferir("gravação sem login é recusada", /n[ãa]o autenticado/i.test(r.erro ?? r.texto), r.erro ?? "");
  const semLogin = await fetch(`${BASE}/api/avisos`);
  conferir("avisos sem login: 401", semLogin.status === 401, `HTTP ${semLogin.status}`);

  r = await chamar("getSessionUser", "GET", undefined);
  conferir("sessão da conta de teste", r.resultado?.user?.id === USUARIO, r.erro ?? "");

  // O laudo, do rascunho à aprovação.
  r = await chamar("upsertOSFn", "POST", os);
  conferir("OS criada", !r.erro, r.erro ?? "");
  r = await chamar("upsertAmostraFn", "POST", { id: amId, osId, reportNumber: "AM-E2E", code: "E2E-001", createdAt: t, updatedAt: t });
  conferir("amostra criada", !r.erro, r.erro ?? "");
  r = await chamar("upsertEnsaioFn", "POST", {
    id: enId,
    amostraId: amId,
    tipo: "asf-dap",
    status: "em_digitacao",
    nome: "ASF.DAP",
    createdAt: t,
    updatedAt: t,
  });
  conferir("ensaio criado", !r.erro, r.erro ?? "");
  r = await chamar("saveSharedDraft", "POST", {
    scopeId,
    payload: { sample: { os: "E2E-01", reportNumber: "AM-E2E", client: "Cliente Teste" } },
    changedBy: USUARIO,
    changedByName: "Teste Automático",
  });
  conferir("rascunho salvo", !r.erro && r.resultado?.success !== false, r.erro ?? "");

  const etapa = async () => (await chamar("getWorkflowStatuses", "POST", { scopeIds: [scopeId] })).resultado?.statuses?.[scopeId];

  r = await chamar("requestApproval", "POST", {
    scopeId,
    rev: 0,
    filename: "E2E-01_AM-E2E_ASF.DAP_Rev-00.pdf",
    index: { os_numero: "E2E-01", os_cliente: "Cliente Teste", amostra_code: "AM-E2E", ensaio_tipo: "asf-dap", ensaio_nome: "ASF.DAP" },
  });
  conferir("enviado para verificação", !r.erro, r.erro ?? "");
  let e = await etapa();
  conferir("etapa: aguardando verificação", e === "aguardando_verificacao", String(e));

  r = await chamar("verifyApproval", "POST", { scopeId, rev: 0, decision: "verificado" });
  conferir("verificado", !r.erro, r.erro ?? "");
  e = await etapa();
  conferir("etapa: aguardando aprovação", e === "aguardando_aprovacao", String(e));

  r = await chamar("decideApproval", "POST", { scopeId, rev: 0, decision: "aprovado", comment: "teste automático" });
  conferir("aprovado", !r.erro, r.erro ?? "");
  e = await etapa();
  conferir("etapa: aprovado", e === "aprovado", String(e));

  r = await chamar("listApprovals", "GET", { scopeId });
  const linha = Array.isArray(r.resultado) ? r.resultado.find((a) => a.rev === 0) : null;
  conferir(
    "registro da revisão com verificador e aprovador",
    linha?.status === "aprovado" && linha?.verified_by === USUARIO && linha?.decided_by === USUARIO,
    linha ? `${linha.status} · verif. ${linha.verified_by} · aprov. ${linha.decided_by}` : r.erro ?? "sem revisão",
  );

  // A bancada: pendência criada pelo QR, finalizada, e a Central a lista.
  r = await chamar("criarPendenciaDigitacao", "POST", {
    os: "E2E-01",
    amostra: "AM-E2E",
    ensaio: "Permeabilidade a Carga Variável (PERM.V)",
    tipo_ensaio: "perm-v",
    origem: "digitalizacao",
    payload: { ident: { os: "E2E-01", amostraCodigo: "AM-E2E" } },
  });
  const pid = r.resultado?.id;
  conferir("pendência da bancada criada", !!pid, r.erro ?? "");
  r = await chamar("atualizarStatusPendencia", "POST", {
    id: pid,
    status: "pendente",
    payload: { ident: { os: "E2E-01", amostraCodigo: "AM-E2E" }, obs: "teste automático" },
  });
  conferir("bancada finalizada", !r.erro, r.erro ?? "");
  r = await chamar("listPendenciasDigitacao", "GET", undefined);
  const naCentral = Array.isArray(r.resultado) && r.resultado.some((p) => p.id === pid && p.status === "pendente");
  conferir("Central lista a pendência", naCentral, r.erro ?? "");

  // Programação: a importação resolve o tipo pela etiqueta e grava só no app.
  const linhaImp = (tag) => ({
    identificacao: "Furo E2E",
    codigo_amostra: "SH-E2E",
    tipo: "SH",
    topo: "",
    base: "",
    amostra_coletada: "",
    tag,
  });
  const pedidoImp = { osNumero: "E2E-PROG", tomador: "Teste", obra: "", linhas: [linhaImp("CD3.IN"), linhaImp("TRI.UU")] };
  r = await chamar("importarEnsaios", "POST", pedidoImp);
  conferir("importação de ensaios", r.resultado?.ensaios === 2 && r.resultado?.amostrasNovas === 1, r.erro ?? JSON.stringify(r.resultado));
  r = await chamar("listRows", "GET", { sheet: "Ensaios" });
  const importados = (r.resultado ?? []).filter((e) => e.etiqueta === "CD3.IN" || e.etiqueta === "TRI.UU");
  conferir(
    "ensaios importados com o tipo certo",
    importados.length === 2 &&
      importados.find((e) => e.etiqueta === "CD3.IN")?.tipo_ensaio_id === "te-cisalhamento" &&
      importados.find((e) => e.etiqueta === "TRI.UU")?.tipo_ensaio_id === "te-triaxial",
    r.erro ?? JSON.stringify(importados.map((e) => [e.etiqueta, e.tipo_ensaio_id])),
  );
  r = await chamar("importarEnsaios", "POST", pedidoImp);
  conferir("importar de novo não duplica", r.resultado?.ensaios === 0 && r.resultado?.repetidos === 2, r.erro ?? JSON.stringify(r.resultado));
  r = await chamar("diagnosticarProgramacao", "POST", undefined);
  conferir("diagnóstico da programação responde (sem planilha aqui)", r.resultado?.planilhaConfigurada === false, r.erro ?? "");

  const comLogin = await fetch(`${BASE}/api/avisos`, { headers: { cookie: COOKIE } });
  conferir("avisos com login: 200", comLogin.status === 200, `HTTP ${comLogin.status}`);

  // Checagem de saúde (agendamento de 15 em 15 min): roda e registra o resumo, sem erro.
  const agendado = await fetch(`${BASE}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent("*/15 * * * *")}`);
  await espera(1500);
  conferir(
    "checagem de saúde agendada roda",
    agendado.ok && registro.includes("[saude]") && !registro.includes("[saude] Checagem falhou"),
    `HTTP ${agendado.status}`,
  );
} catch (err) {
  conferir("roteiro executado até o fim", false, err instanceof Error ? err.message : String(err));
} finally {
  // E2E_MANTER=1: o app local fica no ar (com os dados do roteiro) para olhar as telas no navegador.
  if (process.env.E2E_MANTER) {
    console.log(`\nApp no ar em ${BASE} — cookie da conta de teste:\n${COOKIE}\n(Ctrl+C para encerrar)`);
    process.on("SIGINT", () => {
      encerrar();
      process.exit(0);
    });
    await new Promise(() => {});
  }
  encerrar();
}

if (falhas.length > 0) {
  console.log(`\n${falhas.length} FALHA(S). Fim do registro do app:\n${registro.slice(-2500)}`);
  process.exit(1);
}
console.log("\nTUDO OK — laudo de ponta a ponta verificado.");
process.exit(0);
