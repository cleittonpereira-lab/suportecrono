// Resolução de identidade dos server functions — SÓ SERVIDOR.
//
// Fica separado de `auth-middleware.ts` porque usa `getRequest()` de
// `@tanstack/react-start/server`, que não pode entrar no pacote do navegador.
// `auth-middleware.ts` é alcançável pelo cliente (os server functions o
// importam), então lá este módulo só é carregado com `import()` dinâmico dentro
// dos callbacks `.server()`, que o compilador remove do lado do cliente.
//
// A identidade vem só do que o servidor consegue verificar:
//   1. token do Supabase, validado com `auth.getUser`; ou
//   2. o cookie de sessão assinado (`si_session`) que os logins do app emitem
//      (senha, cadastro e Google — ver auth.functions.ts / auth-session.server.ts).
// Os cabeçalhos `x-local-user-*` enviados pelo navegador não contam: antes eles
// definiam quem estava agindo, e sem eles o servidor assumia o admin.
import { getRequest } from '@tanstack/react-start/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

export const CONVIDADO_ID = 'convidado'

type Claims = { sub: string; email?: string; user_metadata?: { full_name?: string; name?: string } }
type Identidade = { userId: string; claims: Claims; convidado: boolean }

const CONVIDADO: Identidade = {
  userId: CONVIDADO_ID,
  claims: { sub: CONVIDADO_ID, user_metadata: { full_name: 'Convidado' } },
  convidado: true,
}

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_')
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    )
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value))
    }
    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization')
    }
    headers.set('apikey', supabaseKey)
    return fetch(input, { ...init, headers })
  }
}

/** Identidade de um token do Supabase, validado no próprio Supabase. */
async function identidadeSupabase(): Promise<Identidade | null> {
  const authHeader = getRequest()?.headers?.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) return null

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null

  const supabase = createClient<Database>(url, key, {
    global: { fetch: createSupabaseFetch(key), headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  })
  try {
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) return null
    return {
      userId: data.user.id,
      claims: { sub: data.user.id, email: data.user.email, user_metadata: data.user.user_metadata },
      convidado: false,
    }
  } catch {
    return null
  }
}

/**
 * Registro do usuário por isolate, por até 60s. Validar a assinatura do cookie
 * é só criptografia local, mas saber se a conta está ativa exige ler o
 * registro no Drive — sem este cache, cada autosave pagaria essa leitura.
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

async function contexto(ident: Identidade) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
  return {
    supabase: supabaseAdmin as any,
    userId: ident.userId,
    claims: ident.claims as any,
    convidado: ident.convidado,
  }
}

/** Leitura: identidade verificada se houver; senão, convidado (nunca um usuário real). */
export async function contextoDeLeitura() {
  let ident = await identidadeSupabase()
  if (!ident) {
    try {
      ident = await identidadeDoCookie()
    } catch (err) {
      // Numa leitura, a identidade só serve para registro; não derruba a tela.
      console.warn('[auth] Não foi possível conferir a sessão; seguindo como convidado:', err)
    }
  }
  return contexto(ident ?? CONVIDADO)
}

/** Gravação: exige sessão verificada de conta ativa. */
export async function contextoDeGravacao() {
  const ident = (await identidadeSupabase()) ?? (await identidadeDoCookie())
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
  return !!((await identidadeSupabase()) ?? (await identidadeDoCookie()))
}
