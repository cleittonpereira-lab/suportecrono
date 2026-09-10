// Middlewares de autenticação dos server functions.
//
// Antes, `requireSupabaseAuth` aceitava QUALQUER requisição: sem token do
// Supabase, a identidade vinha dos cabeçalhos `x-local-user-*` enviados pelo
// próprio navegador — ou, sem eles, de um usuário padrão fixo (o admin). E ~29
// funções de gravação nem usavam middleware. Qualquer um com a URL do Worker
// gravava, aprovava laudo e apagava dados como qualquer pessoa.
//
//   - `requireSupabaseAuth` → LEITURA. Sem sessão verificada, segue como
//     convidado: o modo "Entrar sem login" é de visualização.
//   - `exigirLogin` → GRAVAÇÃO. Sem sessão verificada de conta ativa, recusa.
//
// Como a identidade é verificada: ver `auth-identidade.server.ts`. Aquele
// módulo usa APIs só de servidor, e este arquivo é alcançável pelo navegador —
// por isso ele só é carregado com `import()` dentro dos callbacks `.server()`,
// que o compilador remove do lado do cliente.
import { createMiddleware } from '@tanstack/react-start'

/** Leitura: identidade verificada se houver; senão, convidado (nunca um usuário real). */
export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const { contextoDeLeitura } = await import('./auth-identidade.server')
  return next({ context: await contextoDeLeitura() })
})

/** Gravação: exige sessão verificada de conta ativa. */
export const exigirLogin = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const { contextoDeGravacao } = await import('./auth-identidade.server')
  return next({ context: await contextoDeGravacao() })
})
