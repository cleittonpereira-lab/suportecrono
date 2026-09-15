/**
 * Id da pendência de digitação: determinístico por OS, amostra e ensaio.
 *
 * Puro de propósito: o servidor usa para gravar (lab-pendencias.functions.ts)
 * e o aparelho, sem rede, para saber de antemão o id que a pendência terá
 * quando a fila offline a criar (lib/fila-offline.ts, Fase 5). Mudar esta
 * função muda o id das pendências novas — as antigas continuam com o delas.
 */
export function chaveDaPendencia(os: string, amostra: string | null | undefined, ensaio: string): string {
  const raw = `${os.trim()}__${(amostra ?? "").trim()}__${ensaio.trim()}`;
  return raw.toLowerCase().replace(/[^a-z0-9_.-]+/g, "_");
}
