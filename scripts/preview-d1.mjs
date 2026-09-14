// Roda o app COMPILADO no runtime local do Cloudflare (workerd), ligado ao D1
// local de wrangler.dev.jsonc — o teste mais próximo da produção.
//
//   npm run build
//   npx wrangler d1 migrations apply DB --local --config wrangler.dev.jsonc
//   node scripts/preview-d1.mjs [porta]
//
// Pega a configuração que o nitro gera no build (.output/server/wrangler.json),
// acrescenta o banco e a chave DADOS_NO_D1 de wrangler.dev.jsonc, e sobe o
// `wrangler dev` com o mesmo diretório de dados do banco local. Nada aqui toca a
// produção: sem credenciais do Google, o que ainda é do Drive fica em .data/.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const raiz = resolve(import.meta.dirname, "..");
const pastaServidor = join(raiz, ".output", "server");
const gerada = join(pastaServidor, "wrangler.json");
if (!existsSync(gerada)) {
  console.error("Não achei .output/server/wrangler.json — rode `npm run build` antes.");
  process.exit(1);
}

// wrangler.dev.jsonc tem comentários de linha: remove antes de ler como JSON.
const semComentarios = readFileSync(join(raiz, "wrangler.dev.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, "");
const dev = JSON.parse(semComentarios);
const config = JSON.parse(readFileSync(gerada, "utf8"));

const teste = {
  ...config,
  d1_databases: dev.d1_databases.map((d) => ({ ...d, migrations_dir: join(raiz, d.migrations_dir) })),
  vars: { ...(config.vars ?? {}), ...dev.vars },
};
const arquivoTeste = join(pastaServidor, "wrangler.preview-d1.json");
writeFileSync(arquivoTeste, JSON.stringify(teste, null, 2));

const porta = process.argv[2] ?? "8093";
// Opções extras vão direto ao wrangler — ex.: `--test-scheduled`, que abre
// /__scheduled?cron=... para disparar o agendamento (cópia diária) na hora.
const extras = process.argv.slice(3);
const args = ["wrangler", "dev", "--config", arquivoTeste, "--persist-to", join(raiz, ".wrangler", "state"), "--port", porta, "--local", ...extras];
console.log(`> npx ${args.join(" ")}`);
const filho = spawn("npx", args, { cwd: pastaServidor, stdio: "inherit", shell: true });
filho.on("exit", (codigo) => process.exit(codigo ?? 0));
