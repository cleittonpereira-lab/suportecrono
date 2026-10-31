/**
 * Item do histórico de salvamentos do rascunho sem valores grandes.
 *
 * `computeJsonDiff` não desce em listas: mudar uma leitura de um CP guardava a
 * lista `specimens` INTEIRA (antes e depois) no histórico — com os dados brutos
 * importados (milhares de leituras por CP), cada autosave acrescentava duas
 * cópias do ensaio, até 40 vezes no mesmo registro. O registro passava do
 * limite do banco (~2 MB) ou o Worker estourava o tempo, e o salvamento parava
 * de responder ("Cannot read properties of undefined (reading 'conflict')").
 *
 * O histórico é auditoria de quem mudou o quê: valor grande vira um resumo.
 */
export const TAMANHO_MAXIMO_NO_HISTORICO = 2_000;

export function resumoDoValor(v: unknown): unknown {
  if (v === undefined || v === null) return v ?? null;
  const texto = JSON.stringify(v) ?? "";
  if (texto.length <= TAMANHO_MAXIMO_NO_HISTORICO) return v;
  const kb = Math.round(texto.length / 1024);
  if (Array.isArray(v)) return `(lista com ${v.length} itens, ${kb} kB — não guardada no histórico)`;
  if (typeof v === "object") return `(objeto de ${kb} kB — não guardado no histórico)`;
  return `${String(v).slice(0, 200)}… (${kb} kB — cortado no histórico)`;
}

export function diffSemValoresGrandes<T extends Record<string, { de: unknown; para: unknown }>>(diff: T): T {
  if (!diff || typeof diff !== "object") return diff;
  return Object.fromEntries(
    Object.entries(diff).map(([k, d]) => [k, d && typeof d === "object" ? { de: resumoDoValor(d.de), para: resumoDoValor(d.para) } : d]),
  ) as T;
}
