import type { Photo } from "./types";

/**
 * Fotos do ensaio ao abrir um editor que guarda uma cópia delas no rascunho
 * (`payload.photos`: Cisalhamento Direto, Triaxial, Adensamento).
 *
 * Antes, a cópia do rascunho SUBSTITUÍA as fotos do ensaio. Ela pode estar
 * atrasada — o autosave recusado por conflito não regrava, e o rascunho fica
 * sem a foto que o ensaio já tem — e, como o labStore manda a lista inteira
 * com a base anterior (`mesclarFotos`), a foto que faltava na cópia era
 * gravada no servidor como "removida pelo usuário". Era assim que fotos
 * sumiam quando o verificador/aprovador abria o laudo em outro computador.
 *
 * Agora quem manda são as fotos do ensaio. Do rascunho só entra o que falta:
 * conteúdo (`url`/`dataUrl`) de foto do ensaio que chegou sem nenhum, e foto
 * que só existe no rascunho (ensaios antigos, em que ela nunca chegou ao
 * ensaio). Nada é removido. Devolve `null` quando não há o que mudar.
 */
export function fotosAoAbrirOEditor(doEnsaio: Photo[] | undefined, doRascunho: unknown): Photo[] | null {
  if (!Array.isArray(doRascunho) || doRascunho.length === 0) return null;
  const rascunho = (doRascunho as Photo[]).filter((p) => p && typeof p === "object" && typeof p.id === "string");
  const ensaio = doEnsaio ?? [];
  const doRascunhoPorId = new Map(rascunho.map((p) => [p.id, p]));
  const idsDoEnsaio = new Set(ensaio.map((p) => p.id));

  let mudou = false;
  const completadas = ensaio.map((p) => {
    if (p.url || p.dataUrl) return p;
    const copia = doRascunhoPorId.get(p.id);
    if (!copia || (!copia.url && !copia.dataUrl)) return p;
    mudou = true;
    return { ...p, url: copia.url || p.url, dataUrl: copia.dataUrl || p.dataUrl };
  });
  const soNoRascunho = rascunho.filter((p) => !idsDoEnsaio.has(p.id));
  if (soNoRascunho.length > 0) mudou = true;
  return mudou ? [...completadas, ...soNoRascunho] : null;
}
