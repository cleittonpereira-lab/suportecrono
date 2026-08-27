// Gerado automaticamente originalmente — mas passou a levar uma correção manual
// (ver comentário abaixo) porque nem todo login desta app cria uma sessão
// Supabase real (ex.: "Entrar com Google" e o "Modo Resiliente" offline em
// src/routes/auth.tsx só gravam uma sessão local no localStorage). Sem isso,
// toda ação de quem entra por esses caminhos era atribuída no servidor a uma
// identidade padrão fixa, em vez da pessoa real.
import { createMiddleware } from '@tanstack/react-start'
import { supabase } from './client'

const LOCAL_SESSION_KEY = 'labflow:auth_session'

// Must be registered as a global `functionMiddleware` in `src/start.ts`; otherwise
// the browser never attaches the bearer token to serverFn RPCs.
export const attachSupabaseAuth = createMiddleware({ type: 'function' }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token) {
      return next({ headers: { Authorization: `Bearer ${token}` } })
    }

    // Sem sessão Supabase real — repassa a identidade da sessão local (se
    // existir) por headers, pra o servidor não cair na identidade padrão fixa.
    try {
      if (typeof window !== 'undefined') {
        const raw = window.localStorage.getItem(LOCAL_SESSION_KEY)
        if (raw) {
          const local = JSON.parse(raw)
          const headers: Record<string, string> = {}
          if (local?.user?.id) headers['x-local-user-id'] = encodeURIComponent(String(local.user.id))
          if (local?.user?.email) headers['x-local-user-email'] = encodeURIComponent(String(local.user.email))
          const name = local?.profile?.nome || local?.user?.user_metadata?.full_name
          if (name) headers['x-local-user-name'] = encodeURIComponent(String(name))
          return next({ headers })
        }
      }
    } catch {}

    return next({ headers: {} })
  },
)
