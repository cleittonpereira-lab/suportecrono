/**
 * Regras da sala de tempo real (Fase 3), sem nada do runtime do Cloudflare —
 * para poderem ser testadas. A sala em si (Durable Object) está em
 * `sala-tempo-real.ts`.
 */

/** Uma aba conectada: quem é e qual laudo (scopeId) está aberto nela. */
export type Presente = {
  id: string;
  userId: string;
  nome: string;
  onde: string | null;
  desde: string;
};

export type DocMudado = { pasta: string; nome: string };

export type MensagemDoCliente = { t: "onde"; onde: string | null };

export type MensagemDaSala =
  | { t: "ola"; id: string; userId: string }
  | { t: "mudou"; docs: DocMudado[] }
  | { t: "presenca"; lista: Presente[] };

const LIMITE_DOCS = 200;

/** Mensagem vinda de uma aba; qualquer coisa fora do formato é ignorada. */
export function lerMensagemDoCliente(bruto: unknown): MensagemDoCliente | null {
  if (typeof bruto !== "string" || bruto.length > 2000) return null;
  try {
    const m = JSON.parse(bruto) as { t?: unknown; onde?: unknown };
    if (m?.t === "onde" && (m.onde === null || (typeof m.onde === "string" && m.onde.length <= 300))) {
      return { t: "onde", onde: m.onde };
    }
  } catch {
    // não é JSON: ignora
  }
  return null;
}

/** Corpo do aviso que o Worker manda depois de gravar: `{ docs: [{ pasta, nome }] }`. */
export function lerAviso(corpo: unknown): DocMudado[] {
  const docs = (corpo as { docs?: unknown } | null)?.docs;
  if (!Array.isArray(docs)) return [];
  return docs.filter(
    (d): d is DocMudado =>
      !!d &&
      typeof (d as DocMudado).pasta === "string" &&
      typeof (d as DocMudado).nome === "string" &&
      (d as DocMudado).pasta.length <= 100 &&
      (d as DocMudado).nome.length <= 300,
  );
}

/** Uma requisição que grava o mesmo documento várias vezes gera um aviso só por documento. */
export function juntarDocs(docs: DocMudado[]): DocMudado[] {
  const vistos = new Set<string>();
  const out: DocMudado[] = [];
  for (const d of docs) {
    const chave = `${d.pasta}/${d.nome}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push({ pasta: d.pasta, nome: d.nome });
    if (out.length >= LIMITE_DOCS) break;
  }
  return out;
}

/** Lista de presença enviada às abas: sem conexões inválidas, em ordem de nome. */
export function listaDePresenca(presentes: (Presente | null | undefined)[]): Presente[] {
  return presentes
    .filter((p): p is Presente => !!p && typeof p.id === "string")
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Nome do registro do ensaio no banco, a partir do scopeId (os/…/amostra/…/ensaio/…). */
export function registroDoEnsaio(scopeId: string): string | null {
  const partes = scopeId.split("/");
  const iAm = partes.indexOf("amostra");
  const iEn = partes.indexOf("ensaio");
  if (iAm === -1 || iEn === -1 || !partes[iAm + 1] || !partes[iEn + 1]) return null;
  return `${partes[iAm + 1]}__${partes[iEn + 1]}.json`;
}

/** Quem mais está no mesmo laudo que esta aba — sem a própria aba e sem a mesma pessoa em outra aba. */
export function outrosNoMesmoLugar(
  lista: Presente[],
  eu: { id: string; userId: string } | null,
  onde: string | null,
): Presente[] {
  if (!onde) return [];
  return lista.filter((p) => p.onde === onde && p.id !== eu?.id && p.userId !== eu?.userId);
}
