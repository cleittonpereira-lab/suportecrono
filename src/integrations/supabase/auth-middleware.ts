// Gerado automaticamente originalmente — recebeu uma correção manual (ver
// `localIdentityFromRequest` abaixo) pra não atribuir toda ação de quem
// logou sem sessão Supabase real (Google/Modo Resiliente, ver auth-attacher.ts
// e src/routes/auth.tsx) a uma identidade padrão fixa.
import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

const FALLBACK_USER_ID = '00000000-0000-0000-0000-000000000001'

function localIdentityFromRequest(request: ReturnType<typeof getRequest>) {
  const rawName = request?.headers?.get('x-local-user-name')
  if (!rawName) {
    return {
      userId: FALLBACK_USER_ID,
      claims: {
        sub: FALLBACK_USER_ID,
        email: 'cleitton.pereira@suportesolos.com.br',
        user_metadata: { full_name: 'Cleitton Pereira' },
      } as any,
    }
  }
  const rawId = request?.headers?.get('x-local-user-id')
  const rawEmail = request?.headers?.get('x-local-user-email')
  const userId = rawId ? decodeURIComponent(rawId) : FALLBACK_USER_ID
  return {
    userId,
    claims: {
      sub: userId,
      email: rawEmail ? decodeURIComponent(rawEmail) : undefined,
      user_metadata: { full_name: decodeURIComponent(rawName) },
    } as any,
  }
}

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      const missing = [
        ...(!SUPABASE_URL ? ['SUPABASE_URL'] : []),
        ...(!SUPABASE_PUBLISHABLE_KEY ? ['SUPABASE_PUBLISHABLE_KEY'] : []),
      ];
      const message = `Missing Supabase environment variable(s): ${missing.join(', ')}. Connect Supabase in Lovable Cloud.`;
      console.error(`[Supabase] ${message}`);
      throw new Error(message);
    }
    
    const request = getRequest();
    const authHeader = request?.headers?.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      return next({
        context: {
          supabase: supabaseAdmin as any,
          ...localIdentityFromRequest(request),
        },
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      throw new Error('Unauthorized: No token provided');
    }

    const supabase = createClient<Database>(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        global: {
          fetch: createSupabaseFetch(SUPABASE_PUBLISHABLE_KEY),
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        auth: {
          storage: undefined,
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        return next({
          context: {
            supabase: supabaseAdmin as any,
            ...localIdentityFromRequest(request),
          },
        });
      }

      return next({
        context: {
          supabase,
          userId: data.user.id,
          claims: {
            sub: data.user.id,
            email: data.user.email,
            user_metadata: data.user.user_metadata,
          } as any,
        },
      });
    } catch {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      return next({
        context: {
          supabase: supabaseAdmin as any,
          ...localIdentityFromRequest(request),
        },
      });
    }
  },
);
