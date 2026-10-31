/**
 * Escolhe de onde o editor de um ensaio tira o estado inicial ao abrir: da
 * cópia do ensaio no labStore (`ensaio.payload`) ou do rascunho local do
 * próprio editor (`loadDraft`).
 *
 * Antes era sempre `ensaio.payload ?? rascunhoLocal`. Só que essa cópia do
 * labStore pode estar mais velha que o rascunho: o backup do labStore guarda
 * a árvore inteira no localStorage e falha calado quando passa da cota, e o
 * refresh pode trazer do servidor uma leitura atrasada. Ao recarregar, a busca
 * remota (`fetchRemote…Draft`) não corrige nada quando a rev do servidor é a
 * mesma do rascunho local — então a tela abria com os dados antigos e o
 * autosave seguinte os gravava por cima da edição no servidor. Era assim que
 * o cadastro da amostra "voltava" depois de salvo.
 *
 * Regra: vence quem tiver a rev maior; empatado, o salvo por último. Payload
 * sem rev nem savedAt foi gravado pela própria tela via `onPayloadChange`, no
 * mesmo instante que o rascunho local — nunca é mais novo que ele.
 */
type Marcas = { rev?: unknown; savedAt?: unknown };

function rev(r: object): number | undefined {
  const v = (r as Marcas).rev;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function salvoEm(r: object): number | undefined {
  const v = (r as Marcas).savedAt;
  if (typeof v !== "string") return undefined;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : undefined;
}

export function escolherRascunhoInicial<T extends object>(
  doEnsaio: T | null | undefined,
  local: T | null | undefined,
): T | undefined {
  if (!doEnsaio) return local ?? undefined;
  if (!local) return doEnsaio;

  const revEnsaio = rev(doEnsaio);
  const revLocal = rev(local);
  if (revEnsaio !== undefined && revLocal !== undefined && revEnsaio !== revLocal) {
    return revEnsaio > revLocal ? doEnsaio : local;
  }

  const tEnsaio = salvoEm(doEnsaio);
  const tLocal = salvoEm(local);
  if (tEnsaio === undefined && revEnsaio === undefined) return local;
  if (tEnsaio !== undefined && tLocal !== undefined && tEnsaio !== tLocal) {
    return tEnsaio > tLocal ? doEnsaio : local;
  }
  return doEnsaio;
}
