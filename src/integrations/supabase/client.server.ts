// Server-side Supabase client with service role key - bypasses RLS.
// Use this for admin operations in server functions and server routes only.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

let cachedAuthToken: string | null = null;
let tokenExpiresAt = 0;
let pendingAuthPromise: Promise<string | null> | null = null;

async function getSystemToken(supabaseUrl: string, supabaseKey: string): Promise<string | null> {
  const now = Date.now();
  if (cachedAuthToken && now < tokenExpiresAt - 60_000) {
    return cachedAuthToken;
  }

  if (pendingAuthPromise) return pendingAuthPromise;

  pendingAuthPromise = (async () => {
    try {
      const rawClient = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data, error } = await rawClient.auth.signInWithPassword({
        email: "lab.suporte@suportesolos.com.br",
        password: "SuporteLab2026!Global",
      });

      if (!error && data?.session?.access_token) {
        cachedAuthToken = data.session.access_token;
        tokenExpiresAt = data.session.expires_at ? data.session.expires_at * 1000 : now + 3600_000;
        return cachedAuthToken;
      }
    } catch (err) {
      console.warn("[supabaseAdmin] Falha ao autenticar:", err);
    } finally {
      pendingAuthPromise = null;
    }
    return null;
  })();

  return pendingAuthPromise;
}

function createSupabaseFetch(supabaseUrl: string, supabaseKey: string): typeof fetch {
  return async (input, init) => {
    const bearer = await getSystemToken(supabaseUrl, supabaseKey);
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (bearer) {
      headers.set('Authorization', `Bearer ${bearer}`);
    } else if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createSupabaseAdminClient() {
  const SUPABASE_URL =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    "https://owcjhvbvcmnhqmmgbijz.supabase.co";
  const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93Y2podmJ2Y21uaHFtbWdiaWp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NDEzMDIsImV4cCI6MjA5ODUxNzMwMn0._boAkAfOR5q7KIRViVg6GTqBf5B0_ecCYROpKRe1S94";

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: {
      fetch: createSupabaseFetch(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

// Server-side Supabase client with service role - bypasses RLS
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});
