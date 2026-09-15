/**
 * Detecção de "sem rede" para o app instalado (Fase 5). Distingue o pedido
 * que não chegou ao servidor (aparelho offline, Wi-Fi sem internet) de uma
 * resposta de erro do servidor — só o primeiro caso vira fila ou modo offline.
 */

export function estaOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/** O erro é de rede (o pedido não chegou), e não uma recusa do servidor? */
export function semRede(err: unknown): boolean {
  if (!estaOnline()) return true;
  // fetch que falhou antes de ter resposta: TypeError com "Failed to fetch"
  // (Chrome), "Load failed" (Safari) ou "NetworkError…" (Firefox).
  return err instanceof TypeError && /fetch|network|load failed/i.test(err.message);
}
