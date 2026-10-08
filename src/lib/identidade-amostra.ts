/**
 * Quando duas amostras são a mesma: pelo conjunto Código + Nome + Profundidade.
 *
 * Antes a Central achava a amostra só pelo nome (reportNumber) OU pelo código.
 * Numa OS com várias amostras "SH-02-189" em profundidades diferentes, abrir um
 * relatório avulso com o nome "SH-02-189" e outro código caía na amostra que já
 * existia, e a digitação gravava por cima do ensaio dela (OS 17948-26, 08/10).
 *
 * Regra:
 * - Campo informado dos dois lados tem de bater: código com código, nome com
 *   nome, profundidade com profundidade (pelos números: "5.00 – 5.80 m" = "5,00-5,80").
 * - Amostra antiga sem nome próprio (nome = código) conta como sem nome.
 * - Pelo menos um identificador (código ou nome) tem de bater.
 * - Mais de uma candidata é ambígua: não escolhe nenhuma. Abrir a amostra
 *   errada apaga dados; recusar só pede que se abra pela OS.
 *
 * Puro de propósito, para ser testado.
 */

export type AlvoAmostra = {
  /** Identificação da amostra / Nº do laudo (ex.: "SH-02-189"). */
  nome?: string | null;
  /** Código de coleta (ex.: "13690-03"). */
  codigo?: string | null;
  /** Profundidade (ex.: "5.00 – 5.80 m"). */
  prof?: string | null;
  /**
   * Só um texto, sem saber se é nome ou código (pendências antigas guardavam
   * um ou outro). Bate com o nome OU com o código da amostra.
   */
  qualquer?: string | null;
};

export type AmostraComIdentidade = {
  reportNumber?: string | null;
  code?: string | null;
  depth?: string | null;
};

function norm(v: string | null | undefined): string {
  return String(v ?? "").trim().toLowerCase();
}

/** "5.00 – 5.80 m" → "5|5.8"; sem números, o texto normalizado. */
export function normProfundidade(v: string | null | undefined): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const nums = s.match(/\d+(?:[.,]\d+)?/g);
  if (!nums) return norm(s);
  return nums.map((n) => String(Number(n.replace(",", ".")))).join("|");
}

/** Nome próprio da amostra: vazio quando é só uma cópia do código. */
function nomeProprio(a: AmostraComIdentidade): string {
  const nome = norm(a.reportNumber);
  return nome && nome !== norm(a.code) ? nome : "";
}

export function mesmaAmostra(a: AmostraComIdentidade, alvo: AlvoAmostra): boolean {
  const aCod = norm(a.code);
  const aNome = nomeProprio(a);
  const aProf = normProfundidade(a.depth);
  const cod = norm(alvo.codigo);
  const nome = norm(alvo.nome) && norm(alvo.nome) !== cod ? norm(alvo.nome) : "";
  const prof = normProfundidade(alvo.prof);
  const qualquer = norm(alvo.qualquer);

  if (cod && aCod && cod !== aCod) return false;
  if (nome && aNome && nome !== aNome) return false;
  if (prof && aProf && prof !== aProf) return false;

  return (
    (!!cod && cod === aCod) ||
    (!!nome && nome === aNome) ||
    (!!qualquer && (qualquer === aCod || qualquer === norm(a.reportNumber)))
  );
}

export type EscolhaAmostra<T> =
  | { tipo: "encontrada"; amostra: T }
  | { tipo: "nenhuma" }
  | { tipo: "ambigua"; amostras: T[] };

export function acharAmostra<T extends AmostraComIdentidade>(amostras: T[], alvo: AlvoAmostra): EscolhaAmostra<T> {
  const candidatas = amostras.filter((a) => mesmaAmostra(a, alvo));
  if (candidatas.length === 1) return { tipo: "encontrada", amostra: candidatas[0] };
  if (candidatas.length > 1) return { tipo: "ambigua", amostras: candidatas };
  return { tipo: "nenhuma" };
}

/** Texto para mostrar a amostra sem ambiguidade: "SH-02-189 · 13690-03 · 5.00 – 5.80 m". */
export function rotuloAmostra(a: AmostraComIdentidade): string {
  return [a.reportNumber, a.code && a.code !== a.reportNumber ? a.code : "", a.depth].filter(Boolean).join(" · ");
}
