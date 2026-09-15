/**
 * Etiqueta de ensaio → Tipo de Ensaio da programação.
 *
 * As planilhas de campo trazem etiquetas cruas ("CD3.NAT", "TRI.UU",
 * "COMP.S.7"). A importação (no servidor, ao gravar; na tela, na prévia) e o
 * reparo dos dados usam esta mesma regra — antes cada tela tinha a sua, e a
 * importação que não achava o tipo criava um "tipo" novo com a etiqueta crua
 * a cada linha (o "CD3.IN" cadastrado três vezes).
 */
import { ENSAIO_TAG, ENSAIO_LABEL, type EnsaioTipo } from "@/features/lab/types";

export type TipoProg = { id: string; nome: string; codigo?: string | null };

const norm = (s: unknown) => String(s ?? "").trim().toUpperCase();

/**
 * Códigos canônicos do app (ENSAIO_TAG), do mais específico para o mais
 * genérico, para "TRI.CIDsat" não ser engolido por um "TRI" mais curto.
 */
const CODIGOS_CANONICOS: { code: string; tipo: EnsaioTipo }[] = (
  Object.entries(ENSAIO_TAG) as [EnsaioTipo, { code: string; aliases?: string[] }][]
)
  .flatMap(([tipo, info]) => [info.code, ...(info.aliases ?? [])].map((code) => ({ code: code.toUpperCase(), tipo })))
  .sort((a, b) => b.code.length - a.code.length);

/** Etiquetas fora do padrão do app: pedaço da etiqueta → pedaço do nome do tipo. */
const APELIDOS: { etiqueta: string[]; nome: string[] }[] = [
  { etiqueta: ["CD", "CISALHA"], nome: ["cisalha"] },
  { etiqueta: ["ADENS", "EDOM", "OED"], nome: ["adens"] },
  { etiqueta: ["TRIAX", "UU", "CU"], nome: ["triax"] },
  { etiqueta: ["CARACT", "CBR"], nome: ["caract", "cbr"] },
  { etiqueta: ["MR", "DP"], nome: ["resili", "mr"] },
  { etiqueta: ["MCT"], nome: ["mct"] },
  { etiqueta: ["PERM"], nome: ["perm"] },
  // "compress", não "comp": "Caracterização Comp/CBR" também tem "comp".
  { etiqueta: ["COMP"], nome: ["compress"] },
];

/**
 * Tipo "avulso": criado por uma importação com a etiqueta crua como nome e
 * como código (ex.: nome "CD3.IN", código "CD3.IN").
 */
export function ehTipoAvulso(t: TipoProg): boolean {
  const nome = norm(t.nome);
  return !!nome && nome === norm(t.codigo);
}

/**
 * Acha o tipo de uma etiqueta, nesta ordem:
 * 1. nome ou código cadastrado igual à etiqueta;
 * 2. código canônico do app (igual ou prefixo — "CD3.NAT" = CD + nº de CPs +
 *    condição), pelo nome do ensaio no app ou pelo código;
 * 3. apelidos por pedaço da etiqueta.
 * Sem nada: null — quem chama decide se cadastra um tipo novo.
 */
export function resolverTipo<T extends TipoProg>(etiqueta: string, tipos: T[]): T | null {
  const tag = norm(etiqueta);
  if (!tag) return null;

  const exato = tipos.find((t) => norm(t.nome) === tag || norm(t.codigo) === tag);
  if (exato) return exato;

  const canonico = CODIGOS_CANONICOS.find((c) => tag === c.code || tag.startsWith(c.code));
  if (canonico) {
    const nomeNoApp = norm(ENSAIO_LABEL[canonico.tipo]);
    const achado = tipos.find((t) => norm(t.nome) === nomeNoApp || norm(t.codigo) === canonico.code);
    if (achado) return achado;
  }

  for (const a of APELIDOS) {
    if (!a.etiqueta.some((e) => tag.includes(e))) continue;
    const achado = tipos.find((t) => a.nome.some((n) => t.nome.toLowerCase().includes(n)));
    if (achado) return achado;
  }
  return null;
}
