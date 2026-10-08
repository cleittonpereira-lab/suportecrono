/**
 * Pasta da amostra no Drive e quais laudos de uma pasta são desta amostra.
 *
 * A pasta era só `reportNumber || code`. Na OS 17948-26 duas amostras têm o
 * nome SH-02-189 (códigos 13690-02 e 13690-03, profundidades diferentes) e
 * caíam na MESMA pasta: o mesmo manifest.json, o mesmo dados/ensaio.json, e a
 * Rev-00 de uma contava como revisão da outra (08/10).
 *
 * Agora, quando o nome difere do código, o código entra no nome da pasta:
 * "SH-02-189 (13690-03)". A pasta antiga continua sendo lida, para as
 * revisões já emitidas lá; como ela pode ser dividida com outra amostra, os
 * laudos dela passam pelo nome oficial do arquivo
 * (OS_Amostra_Furo_Prof_Sigla_Rev-NN, lib/nome-laudo.ts), que tem a
 * profundidade.
 *
 * Puro de propósito, para ser testado.
 */
import { limparParte, nomeDoArquivoDoLaudo } from "./nome-laudo";

export type AmostraDaPasta = { reportNumber?: string | null; code?: string | null };

/** Nome de pasta sem os caracteres proibidos no Drive. */
export function safeName(s: string, fallback: string): string {
  const clean = (s || "").toString().replace(/[\\/:*?"<>|]/g, "-").trim();
  return clean || fallback;
}

function norm(v: string | null | undefined): string {
  return String(v ?? "").trim().toLowerCase();
}

/** Pasta antiga: só o nome (ou o código). Pode ser dividida por duas amostras de mesmo nome. */
export function nomeAntigoDaPastaDaAmostra(am: AmostraDaPasta): string {
  return safeName(am.reportNumber?.trim() || am.code?.trim() || "", "Amostra-sem-codigo");
}

/** Pasta da amostra: "SH-02-189 (13690-03)" quando o nome difere do código; senão a antiga. */
export function nomeDaPastaDaAmostra(am: AmostraDaPasta): string {
  const nome = am.reportNumber?.trim() ?? "";
  const codigo = am.code?.trim() ?? "";
  if (nome && codigo && norm(nome) !== norm(codigo)) return safeName(`${nome} (${codigo})`, "Amostra-sem-codigo");
  return nomeAntigoDaPastaDaAmostra(am);
}

export type IdentidadeDoLaudo = {
  os?: string | null;
  amostra?: string | null;
  furo?: string | null;
  prof?: string | null;
  sigla: string;
};

/** Nome oficial sem o `_Rev-NN.ext`: "17948-26_SH-02-189_SH-02_5.00-5.80_PERM.V". */
export function prefixoDoLaudo(id: IdentidadeDoLaudo): string {
  return nomeDoArquivoDoLaudo({ ...id, rev: 0, ext: "pdf" }).replace(/_Rev-00\.pdf$/, "");
}

const REVISAO = /^(.*)_Rev-?\d+\.(pdf|xlsx)$/i;

/**
 * O arquivo é o laudo de OUTRA amostra: nome oficial com a mesma OS e a mesma
 * sigla, mas outro trecho Amostra_Furo_Prof. Nome fora do padrão oficial
 * (os nomes antigos de cada tela) não dá para atribuir e continua contando
 * como desta amostra — contar a mais só pula um número; contar a menos
 * deixaria gravar por cima de uma revisão.
 */
export function laudoDeOutraAmostra(nomeArquivo: string, meu: IdentidadeDoLaudo): boolean {
  const m = REVISAO.exec(nomeArquivo.normalize("NFC"));
  if (!m) return false;
  const base = m[1].toLowerCase();
  const prefixo = prefixoDoLaudo(meu).toLowerCase();
  if (base === prefixo) return false;
  const os = limparParte(meu.os).toLowerCase();
  const sigla = limparParte(meu.sigla).toLowerCase();
  if (os && !base.startsWith(`${os}_`)) return false;
  return base.endsWith(`_${sigla}`);
}
