import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ALL_TABS, TAB_META, type TabKey } from "@/lib/tab-permissions";
import { getSessionUser, logout as logoutFn } from "@/lib/auth.functions";
import { semRede } from "@/lib/rede";
import { esquecerPaginasGuardadas } from "@/lib/pwa";
import type { PublicUser } from "@/lib/user-store.server";

export type Role = "admin" | "gestor" | "usuario" | "verificador";
export type ProfileStatus = "pendente" | "ativo" | "bloqueado";

export type AppUser = {
  id: string;
  email: string;
  user_metadata?: { full_name?: string; avatar_url?: string };
};

export type Profile = {
  id: string;
  email: string;
  nome: string | null;
  cargo: string | null;
  avatar_url: string | null;
  status: ProfileStatus;
  labRole: "aprovador" | "verificador" | "digitador" | "nenhum";
};

type AuthState = {
  loading: boolean;
  user: AppUser | null;
  profile: Profile | null;
  role: Role | null;
  allowedTabs: Set<TabKey> | null; // null = todas (default do role)
  isAuthenticated: boolean;
  canAccess: (tab: TabKey) => boolean;
  displayName: string;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

/** Marca do antigo modo "Entrar sem login" (removido na Fase 4) — apagada ao abrir. */
const GUEST_KEY_ANTIGA = "labflow:guest";
const LOCAL_SESSION_KEY = "labflow:auth_session";

/**
 * Cópia local de quem está logado, para a tela abrir já identificada. O
 * servidor não usa isto: a identidade dele vem do cookie de sessão.
 */
function persistLocalIdentity(user: AppUser, profile: Profile, role: Role, tabs: string[]) {
  try {
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ user, profile, role, tabs }));
  } catch {}
}

/** A cópia local, para o app instalado seguir identificado sem rede (Fase 5). */
function lerIdentidadeLocal(): { user: AppUser; profile: Profile; role: Role; tabs?: string[] } | null {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY) || "null");
    return v?.user?.id && v?.profile && v?.role ? v : null;
  } catch {
    return null;
  }
}

function clearLocalIdentity() {
  try {
    localStorage.removeItem(LOCAL_SESSION_KEY);
  } catch {}
}

function toAppUserAndProfile(u: PublicUser): { user: AppUser; profile: Profile; role: Role } {
  const user: AppUser = {
    id: u.id,
    email: u.email,
    user_metadata: {
      full_name: u.nome ?? undefined,
      avatar_url: u.avatarFileId ? `/api/photo/${u.avatarFileId}` : undefined,
    },
  };
  const profile: Profile = {
    id: u.id,
    email: u.email,
    nome: u.nome,
    cargo: u.cargo,
    avatar_url: u.avatarFileId ? `/api/photo/${u.avatarFileId}` : null,
    status: u.status,
    labRole: u.labRole,
  };
  return { user, profile, role: u.role };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const getSessionUserFn = useServerFn(getSessionUser);
  const logoutServerFn = useServerFn(logoutFn);

  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [allowedTabs, setAllowedTabs] = useState<Set<TabKey> | null>(null);
  const [loading, setLoading] = useState(true);

  const applySession = (raw: PublicUser | null) => {
    if (!raw) {
      setUser(null);
      setProfile(null);
      setRole(null);
      setAllowedTabs(null);
      clearLocalIdentity();
      return;
    }
    const { user: u, profile: p, role: r } = toAppUserAndProfile(raw);
    setUser(u);
    setProfile(p);
    setRole(r);
    setAllowedTabs(raw.tabs && raw.tabs.length > 0 ? new Set(raw.tabs as TabKey[]) : null);
    persistLocalIdentity(u, p, r, raw.tabs ?? []);
  };

  const refresh = async () => {
    try {
      const { user: raw } = await getSessionUserFn();
      applySession(raw);
    } catch (err) {
      // Sem rede (app instalado, bancada sem sinal): segue com quem estava logado
      // neste aparelho — o servidor confere a sessão de novo em cada envio. Uma
      // resposta do servidor (sessão inválida) continua saindo da conta.
      const local = semRede(err) ? lerIdentidadeLocal() : null;
      if (!local) {
        applySession(null);
        return;
      }
      setUser(local.user);
      setProfile(local.profile);
      setRole(local.role);
      setAllowedTabs(local.tabs && local.tabs.length > 0 ? new Set(local.tabs as TabKey[]) : null);
    }
  };

  useEffect(() => {
    try {
      sessionStorage.removeItem(GUEST_KEY_ANTIGA);
    } catch {}
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, []);

  const value = useMemo<AuthState>(() => {
    const isBlocked = profile?.status === "bloqueado";
    const isPending = profile?.status === "pendente";
    const authed = !!user && !isBlocked && !isPending;

    const canAccess = (tab: TabKey): boolean => {
      const meta = TAB_META[tab];
      if (!user) return false;

      if (role === "admin") return true;
      if (isBlocked || isPending) return false;

      if (meta.adminOnly) return false;
      // Por concessão (ex.: Painel do coordenador): só quem foi marcado — o padrão do papel não inclui.
      if (meta.porConcessao) return !!allowedTabs?.has(tab);
      if (allowedTabs) return allowedTabs.has(tab);
      return true;
    };

    const displayName = profile?.nome || user?.email?.split("@")[0] || "Usuário";

    return {
      loading,
      user,
      profile,
      role,
      allowedTabs,
      isAuthenticated: authed,
      canAccess,
      displayName,
      signOut: async () => {
        try {
          await logoutServerFn();
        } catch {}
        clearLocalIdentity();
        // Páginas guardadas para uso sem rede saem com a conta; a fila da bancada fica.
        void esquecerPaginasGuardadas();
        setUser(null);
        setProfile(null);
        setRole(null);
        setAllowedTabs(null);
      },
      refresh,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, profile, role, allowedTabs]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}

// Helper para descobrir abas visíveis
export function useVisibleTabs(): Set<TabKey> {
  const { canAccess } = useAuth();
  return new Set(ALL_TABS.filter((t) => canAccess(t)));
}
