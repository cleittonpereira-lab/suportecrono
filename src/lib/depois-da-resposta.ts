/**
 * Trabalho para depois da resposta (ex.: mandar os avisos do fluxo de
 * aprovação): quem aprovou ou reprovou não espera o envio. A requisição junta
 * as tarefas e as entrega ao `waitUntil` do Worker ao terminar.
 *
 * SÓ SERVIDOR — carregar com `import()` dentro de código de servidor (usa
 * node:async_hooks, que estoura no navegador). Fora de uma requisição
 * coletando (testes, agendamento), a tarefa roda solta.
 */
import * as asyncHooks from "node:async_hooks";

let escopo: asyncHooks.AsyncLocalStorage<Promise<unknown>[]> | null = null;

export function depoisDaResposta(tarefa: Promise<unknown>): void {
  const lista = escopo?.getStore();
  const segura = tarefa.catch((err: unknown) => console.warn("[depois-da-resposta] Tarefa falhou:", err));
  if (lista) lista.push(segura);
}

/** Roda a requisição coletando as tarefas e as passa ao `waitUntil` (ou espera, se não houver). */
export async function comTarefasDepois<T>(request: Request, fn: () => Promise<T>): Promise<T> {
  escopo ??= new asyncHooks.AsyncLocalStorage<Promise<unknown>[]>();
  const lista: Promise<unknown>[] = [];
  const resultado = await escopo.run(lista, fn);
  if (lista.length > 0) {
    const todas = Promise.allSettled(lista);
    const esperarDepois = (request as Request & { waitUntil?: (p: Promise<unknown>) => void }).waitUntil;
    if (typeof esperarDepois === "function") esperarDepois(todas);
    else await todas;
  }
  return resultado;
}
