/**
 * Registro, por requisição, dos documentos gravados no banco — para a sala de
 * tempo real avisar as outras telas (ver tempo-real.server.ts). Cada
 * requisição junta tudo o que gravou e manda um aviso só, depois da resposta.
 *
 * Fora de uma requisição coletando (testes, agendamento), registrar não faz nada.
 */
// Mesmo cuidado de documentos-d1.server.ts: este arquivo chega ao pacote do
// navegador (via driveStorage), onde os módulos do Node estouram ao primeiro
// acesso. Import do módulo inteiro e criação só no primeiro uso, no servidor.
import * as asyncHooks from "node:async_hooks";

export type DocGravado = { pasta: string; nome: string };

let escopo: asyncHooks.AsyncLocalStorage<DocGravado[]> | null = null;

export function registrarMudanca(pasta: string, nome: string): void {
  escopo?.getStore()?.push({ pasta, nome });
}

/** Roda `fn` coletando os documentos que ela gravar. */
export async function coletandoMudancas<T>(fn: () => Promise<T>): Promise<{ resultado: T; docs: DocGravado[] }> {
  escopo ??= new asyncHooks.AsyncLocalStorage<DocGravado[]>();
  const docs: DocGravado[] = [];
  const resultado = await escopo.run(docs, fn);
  return { resultado, docs };
}
