/**
 * Impressão digital dos dados que entram no laudo. O servidor guarda essa impressão
 * quando a revisão é enviada para verificação e a compara de novo antes de verificar
 * ou aprovar: se mudou, o PDF enviado já não corresponde aos dados salvos.
 */

/** Campos do rascunho que só dizem respeito à tela ou a horários, não ao laudo. */
const CAMPOS_SO_DE_TELA = new Set(["selectedCpId", "tab", "savedAt", "rev"]);

/** JSON com as chaves em ordem, para o mesmo conteúdo sempre dar o mesmo texto. */
export function serializaEstavel(valor: unknown): string {
  if (valor === undefined) return "null";
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor) ?? "null";
  if (Array.isArray(valor)) return `[${valor.map((item) => serializaEstavel(item)).join(",")}]`;
  const obj = valor as Record<string, unknown>;
  const chaves = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${chaves.map((k) => `${JSON.stringify(k)}:${serializaEstavel(obj[k])}`).join(",")}}`;
}

/** Impressão digital (SHA-256, em hexadecimal) do rascunho do ensaio e das fotos dele. */
export async function hashDadosDoLaudo(payload: unknown, fotos: unknown): Promise<string> {
  const dados =
    payload && typeof payload === "object"
      ? Object.fromEntries(Object.entries(payload as Record<string, unknown>).filter(([k]) => !CAMPOS_SO_DE_TELA.has(k)))
      : payload;
  const bytes = new TextEncoder().encode(serializaEstavel({ dados, fotos: fotos ?? [] }));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
