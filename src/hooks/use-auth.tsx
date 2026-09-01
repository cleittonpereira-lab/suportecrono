import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ALL_TABS, TAB_META, type TabKey } from "@/lib/tab-permissions";
import { getSessionUser, getPublicGuestTabs, logout as logoutFn } from "@/lib/auth.functions";
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
  isGuest: boolean;
  isAuthenticated: boolean;
  canAccess: (tab: TabKey) => boolean;
  displayName: string;
  enterGuest: () => void;
  exitGuest: () => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

const GUEST_KEY = "labflow:guest";
const LOCAL_SESSION_KEY = "labflow:auth_session";

/**
 * Grava a mesma chave/formato que `src/integrations/supabase/auth-attacher.ts`
 * já lê — é o que faz os server functions que só precisam de "quem fez a
 * ação" (chat de OS, aprovações, pendências etc.) continuarem funcionando
 * sem nenhuma mudança neles.
 */
function persistLocalIdentity(user: AppUser, profile: Profile, role: Role) {
  try {
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ user, profile, role }));
  } catch {}
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
  const getPublicGuestTabsFn = useServerFn(getPublicGuestTabs);
  const logoutServerFn = useServerFn(logoutFn);

  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [allowedTabs, setAllowedTabs] = useState<Set<TabKey> | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [guestTabs, setGuestTabs] = useState<Set<TabKey> | null>(null);

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
    persistLocalIdentity(u, p, r);
  };

  const loadGuestTabs = async () => {
    try {
      const tabs = await getPublicGuestTabsFn();
      setGuestTabs(tabs.length > 0 ? new Set(tabs as TabKey[]) : null);
    } catch {
      setGuestTabs(null);
    }
  };

  const refresh = async () => {
    try {
      const { user: raw } = await getSessionUserFn();
      applySession(raw);
    } catch {
      applySession(null);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsGuest(sessionStorage.getItem(GUEST_KEY) === "1");
    }
    void loadGuestTabs();
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
      if (isGuest) {
        if (meta.adminOnly) return false;
        if (guestTabs) return guestTabs.has(tab);
        return true;
      }
      if (!user) return false;

      if (role === "admin") return true;
      if (isBlocked || isPending) return false;

      if (meta.adminOnly) return false;
      if (allowedTabs) return allowedTabs.has(tab);
      return true;
    };

    const displayName = isGuest ? "Convidado" : profile?.nome || user?.email?.split("@")[0] || "Usuário";

    return {
      loading,
      user,
      profile,
      role,
      allowedTabs,
      isGuest,
      isAuthenticated: authed,
      canAccess,
      displayName,
      enterGuest: () => {
        sessionStorage.setItem(GUEST_KEY, "1");
        setIsGuest(true);
      },
      exitGuest: () => {
        sessionStorage.removeItem(GUEST_KEY);
        setIsGuest(false);
      },
      signOut: async () => {
        try {
          await logoutServerFn();
        } catch {}
        clearLocalIdentity();
        sessionStorage.removeItem(GUEST_KEY);
        setUser(null);
        setProfile(null);
        setRole(null);
        setAllowedTabs(null);
        setIsGuest(false);
      },
      refresh,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, profile, role, allowedTabs, isGuest, guestTabs]);

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
