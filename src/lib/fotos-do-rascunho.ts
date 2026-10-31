/**
 * Tira do rascunho de um ensaio o conteúdo (base64) das fotos que já têm arquivo
 * próprio (`url` = /api/photo/...). Os editores mandam `photos` junto com o
 * rascunho a cada autosave; com o `dataUrl` de cada foto, cada gravação levava
 * megabytes, o servidor ainda guardava a lista inteira de novo no histórico de
 * salvamentos, e o Worker estourava o limite de CPU/memória — o 503 no salvar.
 * Para exibir, a tela usa `url || dataUrl`, então nada some. Foto ainda sem
 * `url` (não enviada) mantém o `dataUrl`: é a única cópia dela.
 */
/**
 * Valor de um item do histórico de salvamentos sem imagens embutidas: troca
 * todo texto `data:...` por "". O histórico é auditoria de quem mudou o quê;
 * as fotos antigas ficavam inteiras ali (antes e depois), até 40 vezes no mesmo
 * arquivo do ensaio.
 */
export function semImagensEmbutidas<T>(v: T): T {
  if (typeof v === "string") return (v.startsWith("data:") ? "" : v) as T;
  if (Array.isArray(v)) return v.map(semImagensEmbutidas) as T;
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, semImagensEmbutidas(x)])) as T;
  }
  return v;
}

export function semConteudoDasFotos<T>(payload: T): T {
  if (!payload || typeof payload !== "object") return payload;
  const fotos = (payload as { photos?: unknown }).photos;
  if (!Array.isArray(fotos)) return payload;
  return {
    ...payload,
    photos: fotos.map((f) =>
      f && typeof f === "object" && typeof (f as { url?: unknown }).url === "string" && (f as { url: string }).url
        ? { ...(f as object), dataUrl: "" }
        : f,
    ),
  };
}
