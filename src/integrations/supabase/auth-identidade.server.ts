// Resolução de identidade dos server functions — SÓ SERVIDOR.
//
// Fica separado de `auth-middleware.ts` porque usa módulos só de servidor, que
// não podem entrar no pacote do navegador. `auth-middleware.ts` é alcançável
// pelo cliente (os server functions o importam), então lá este módulo só é
// carregado com `import()` dinâmico dentro dos callbacks `.server()`, que o
// compilador remove do lado do cliente. (A pasta ainda se chama `supabase` por
// histórico: ~30 arquivos importam o middleware por este caminho.)
//
// A identidade vem só do cookie de sessão assinado (`si_session`) que os
// logins do app emitem — senha, cadastro e Google (ver auth.functions.ts /
// auth-session.server.ts). O token do Supabase Auth deixou de valer: o projeto
// saiu do ar em 25/08 e cada validação era uma ida à rede que só falhava. Os
// cabeçalhos `x-local-user-*` enviados pelo navegador também não contam.

export const CONVIDADO_ID = 'convidado'

type Claims = { sub: string; email?: string; user_metadata?: { full_name?: string; name?: string } }
type Identidade = { userId: string; claims: Claims; convidado: boolean }

const CONVIDADO: Identidade = {
  userId: CONVIDADO_ID,
  claims: { sub: CONVIDADO_ID, user_metadata: { full_name: 'Convidado' } },
  convidado: true,
}

/**
 * Registro do usuário por isolate, por até 60s. Validar a assinatura do cookie
 * é só criptografia local, mas saber se a conta está ativa exige ler o
 * registro no banco — sem este cache, cada autosave pagaria essa leitura.
 * Um bloqueio feito pelo admin leva no máximo 60s para valer.
 */
const cacheUsuarios = new Map<string, { em: number; ident: Identidade | null }>()
const VALIDADE_CACHE_MS = 60_000

/** Identidade do cookie de sessão assinado — só de conta ATIVA (pendente e bloqueada não gravam). */
async function identidadeDoCookie(): Promise<Identidade | null> {
  const { getSessionUserId } = await import('@/lib/auth-session.server')
  const userId = getSessionUserId()
  if (!userId) return null

  const noCache = cacheUsuarios.get(userId)
  if (noCache && Date.now() - noCache.em < VALIDADE_CACHE_MS) return noCache.ident

  const { getUserById } = await import('@/lib/user-store.server')
  const user = await getUserById(userId)
  const ident: Identidade | null =
    user && user.status === 'ativo'
      ? {
          userId: user.id,
          claims: { sub: user.id, email: user.email, user_metadata: { full_name: user.nome } },
          convidado: false,
        }
      : null
  cacheUsuarios.set(userId, { em: Date.now(), ident })
  return ident
}

function contexto(ident: Identidade) {
  return {
    userId: ident.userId,
    claims: ident.claims as any,
    convidado: ident.convidado,
  }
}

/** Leitura: identidade verificada se houver; senão, convidado (nunca um usuário real). */
export async function contextoDeLeitura() {
  let ident: Identidade | null = null
  try {
    ident = await identidadeDoCookie()
  } catch (err) {
    // Numa leitura, a identidade só serve para registro; não derruba a tela.
    console.warn('[auth] Não foi possível conferir a sessão; seguindo como convidado:', err)
  }
  return contexto(ident ?? CONVIDADO)
}

/** Gravação: exige sessão verificada de conta ativa. */
export async function contextoDeGravacao() {
  const ident = await identidadeDoCookie()
  if (!ident) {
    throw new Error('Não autenticado: entre no sistema com uma conta ativa para gravar alterações.')
  }
  return contexto(ident)
}

/**
 * Há uma sessão verificada de conta ativa nesta requisição? Para funções que
 * precisam decidir por conta própria — ex.: `uploadPhoto`, que aceita sem login
 * apenas as fotos do formulário público de chegada.
 */
export async function sessaoVerificada(): Promise<boolean> {
  return !!(await identidadeDoCookie())
}
