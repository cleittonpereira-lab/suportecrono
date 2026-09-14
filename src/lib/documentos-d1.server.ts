/**
 * Documentos do app no Cloudflare D1 — o que antes eram arquivos JSON no Google
 * Drive (OS, amostras, ensaios, pendências, usuários, quadro de Chegada...).
 *
 * A chave é a mesma de antes: pasta + nome do arquivo. Por isso o resto do app
 * não muda: `driveStorage.ts` desvia para cá as pastas de dados quando o D1 está
 * ligado, e fotos/PDFs continuam no Drive.
 *
 * O que o D1 dá e o Drive não dava:
 *  - trava de verdade entre servidores: `UPDATE ... WHERE rev = ?` só vence uma
 *    vez; quem perde relê e aplica a alteração de novo (`atualizarDocumento`);
 *  - consulta: listar uma pasta é uma query, não uma chamada por arquivo;
 *  - consistência imediata: o que foi gravado aparece na leitura seguinte.
 */
// Import do módulo inteiro, sem tocar em nada no carregamento: este arquivo
// chega ao pacote do navegador (via driveStorage.ts), onde os módulos do Node
// são substitutos que estouram ao primeiro acesso. `import { AsyncLocalStorage }`
// acessava na hora e travava o app inteiro na tela de carregamento.
import * as asyncHooks from "node:async_hooks";
import { registrarMudanca } from "./avisos-mudanca";

/** Só a parte da API do D1 usada aqui (evita depender dos tipos do Workers). */
export interface D1Resultado<T = Record<string, unknown>> {
  results?: T[];
  meta?: { changes?: number };
}
export interface D1Comando {
  bind(...valores: unknown[]): D1Comando;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Resultado<T>>;
  run(): Promise<D1Resultado>;
}
export interface D1Banco {
  prepare(sql: string): D1Comando;
}

type Ambiente = { DB?: D1Banco; DADOS_NO_D1?: string };

/**
 * Dentro de `lendoDoDrive`, o desvio para o D1 fica desligado — é assim que a
 * importação lê os arquivos originais do Drive com o D1 já ligado.
 */
let escopoDrive: asyncHooks.AsyncLocalStorage<boolean> | null = null;

/** Criado no primeiro uso — sempre no servidor (ver o comentário do import). */
function escopo(): asyncHooks.AsyncLocalStorage<boolean> {
  escopoDrive ??= new asyncHooks.AsyncLocalStorage<boolean>();
  return escopoDrive;
}

export function lendoDoDrive<T>(fn: () => Promise<T>): Promise<T> {
  return escopo().run(true, fn);
}

/** O binding `DB` do Worker — o nitro publica o `env` da requisição em `globalThis.__env__`. */
export function obterD1(): D1Banco | null {
  const env = (globalThis as { __env__?: Ambiente }).__env__;
  const db = env?.DB;
  return db && typeof db.prepare === "function" ? db : null;
}

/** D1 como fonte dos documentos: binding presente E `DADOS_NO_D1=1` (a chave de liga/desliga). */
export function d1Ativo(): boolean {
  if (escopoDrive?.getStore()) return false;
  const env = (globalThis as { __env__?: Ambiente }).__env__;
  const chave = env?.DADOS_NO_D1 ?? (typeof process !== "undefined" ? process.env?.DADOS_NO_D1 : undefined);
  return String(chave) === "1" && obterD1() !== null;
}

/** D1 obrigatório: quem chama já decidiu, por `d1Ativo`, que o documento mora aqui. */
export function exigirD1(): D1Banco {
  const db = obterD1();
  if (!db) throw new Error("Banco de dados (D1) não configurado neste servidor.");
  return db;
}

/**
 * O D1 recusa registro acima de ~2 MB. Melhor uma mensagem clara na gravação do
 * que um erro genérico do banco — e é o sinal de que há imagem embutida no JSON.
 */
const LIMITE_BYTES = 1_900_000;

function serializar(pasta: string, nome: string, dados: unknown): string {
  const json = JSON.stringify(dados);
  if (json.length > LIMITE_BYTES) {
    throw new Error(
      `${pasta}/${nome} tem ${(json.length / 1e6).toFixed(1)} MB — acima do limite do banco. ` +
        `Imagens precisam ir como arquivo no Drive, não dentro do registro.`,
    );
  }
  return json;
}

const AGORA = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

export type DocumentoListado = { nome: string; rev: number; atualizadoEm: string };

export async function lerDocumento<T>(db: D1Banco, pasta: string, nome: string): Promise<{ dados: T; rev: number } | null> {
  const linha = await db
    .prepare("SELECT dados, rev FROM documentos WHERE pasta = ? AND nome = ?")
    .bind(pasta, nome)
    .first<{ dados: string; rev: number }>();
  return linha ? { dados: JSON.parse(linha.dados) as T, rev: Number(linha.rev) } : null;
}

/** Nomes, revisões e datas de uma pasta — sem o conteúdo. */
export async function listarDocumentos(db: D1Banco, pasta: string): Promise<DocumentoListado[]> {
  const { results = [] } = await db
    .prepare("SELECT nome, rev, atualizado_em FROM documentos WHERE pasta = ? ORDER BY nome")
    .bind(pasta)
    .all<{ nome: string; rev: number; atualizado_em: string }>();
  return results.map((r) => ({ nome: r.nome, rev: Number(r.rev), atualizadoEm: r.atualizado_em }));
}

/** Conteúdo de vários documentos da mesma pasta, em lotes (o D1 aceita até 100 parâmetros). */
export async function lerDocumentos<T>(
  db: D1Banco,
  pasta: string,
  nomes: string[],
): Promise<Map<string, { dados: T; rev: number; atualizadoEm: string }>> {
  const out = new Map<string, { dados: T; rev: number; atualizadoEm: string }>();
  for (let i = 0; i < nomes.length; i += 90) {
    const lote = nomes.slice(i, i + 90);
    const { results = [] } = await db
      .prepare(
        `SELECT nome, dados, rev, atualizado_em FROM documentos WHERE pasta = ? AND nome IN (${lote.map(() => "?").join(",")})`,
      )
      .bind(pasta, ...lote)
      .all<{ nome: string; dados: string; rev: number; atualizado_em: string }>();
    for (const r of results) {
      out.set(r.nome, { dados: JSON.parse(r.dados) as T, rev: Number(r.rev), atualizadoEm: r.atualizado_em });
    }
  }
  return out;
}

/** Grava por cima (cria se não existir). Devolve a nova revisão. */
export async function gravarDocumento(db: D1Banco, pasta: string, nome: string, dados: unknown): Promise<number> {
  const json = serializar(pasta, nome, dados);
  const linha = await db
    .prepare(
      `INSERT INTO documentos (pasta, nome, dados, rev) VALUES (?, ?, ?, 1)
       ON CONFLICT (pasta, nome) DO UPDATE SET dados = excluded.dados, rev = documentos.rev + 1, atualizado_em = ${AGORA}
       RETURNING rev`,
    )
    .bind(pasta, nome, json)
    .first<{ rev: number }>();
  // Toda gravação entra no aviso de tempo real desta requisição (avisos-mudanca.ts).
  registrarMudanca(pasta, nome);
  return Number(linha?.rev ?? 1);
}

/**
 * Ler-alterar-gravar atômico, entre quaisquer servidores.
 *
 * `alterar` recebe o conteúdo atual (null = não existe) e devolve o novo, ou
 * null para não gravar. Se outra gravação entrar entre a leitura e a escrita, a
 * escrita não acontece (`rev` mudou): relê e chama `alterar` de novo com o
 * conteúdo novo — nunca grava por cima do que não viu.
 */
export async function atualizarDocumento<T>(
  db: D1Banco,
  pasta: string,
  nome: string,
  alterar: (atual: T | null) => T | null | Promise<T | null>,
): Promise<T | null> {
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    const atual = await lerDocumento<T>(db, pasta, nome);
    const proximo = await alterar(atual?.dados ?? null);
    if (proximo === null) return atual?.dados ?? null;
    const json = serializar(pasta, nome, proximo);
    const r = atual
      ? await db
          .prepare(`UPDATE documentos SET dados = ?, rev = rev + 1, atualizado_em = ${AGORA} WHERE pasta = ? AND nome = ? AND rev = ?`)
          .bind(json, pasta, nome, atual.rev)
          .run()
      : await db
          .prepare("INSERT INTO documentos (pasta, nome, dados, rev) VALUES (?, ?, ?, 1) ON CONFLICT (pasta, nome) DO NOTHING")
          .bind(pasta, nome, json)
          .run();
    if ((r.meta?.changes ?? 0) === 1) {
      registrarMudanca(pasta, nome);
      return proximo;
    }
  }
  throw new Error(`Muitas gravações simultâneas em ${pasta}/${nome}. Tente de novo.`);
}

export async function apagarDocumento(db: D1Banco, pasta: string, nome: string): Promise<void> {
  await db.prepare("DELETE FROM documentos WHERE pasta = ? AND nome = ?").bind(pasta, nome).run();
  registrarMudanca(pasta, nome);
}

/** Inclui só se ainda não existe — usado pela importação, que nunca sobrescreve o que já está no banco. */
export async function incluirSeNaoExiste(db: D1Banco, pasta: string, nome: string, dados: unknown): Promise<boolean> {
  const r = await db
    .prepare("INSERT INTO documentos (pasta, nome, dados, rev) VALUES (?, ?, ?, 1) ON CONFLICT (pasta, nome) DO NOTHING")
    .bind(pasta, nome, serializar(pasta, nome, dados))
    .run();
  const incluiu = (r.meta?.changes ?? 0) === 1;
  if (incluiu) registrarMudanca(pasta, nome);
  return incluiu;
}
