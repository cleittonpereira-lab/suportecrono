import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ALL_TABS, TAB_META, type TabKey } from "@/lib/tab-permissions";
import type { User } from "@supabase/supabase-js";

export type Role = "admin" | "gestor" | "usuario" | "verificador";
export type ProfileStatus = "pendente" | "ativo" | "bloqueado";

export type Profile = {
  id: string;
  email: string;
  nome: string | null;
  cargo: string | null;
  avatar_url: string | null;
  status: ProfileStatus;
};

type AuthState = {
  loading: boolean;
  user: User | null;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [allowedTabs, setAllowedTabs] = useState<Set<TabKey> | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [guestTabs, setGuestTabs] = useState<Set<TabKey> | null>(null);

  const loadGuestTabs = async () => {
    try {
      const { data } = await supabase.from("guest_permissions").select("tab_key");
      if (data && data.length > 0) {
        setGuestTabs(new Set(data.map((r: { tab_key: string }) => r.tab_key as TabKey)));
      } else {
        setGuestTabs(null);
      }
    } catch {
      setGuestTabs(null);
    }
  };

  const loadUserData = async (u: User | null) => {
    if (!u) {
      setProfile(null);
      setRole(null);
      setAllowedTabs(null);
      return;
    }
    try {
      const [{ data: prof }, { data: roles }, { data: tabs }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", u.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.id),
        supabase.from("tab_permissions").select("tab_key").eq("user_id", u.id),
      ]);

      if (prof) {
        setProfile(prof as Profile);
      } else {
        // Perfil default ativo para novos usuários autenticados
        const newProf: Profile = {
          id: u.id,
          email: u.email || "",
          nome: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "Usuário",
          cargo: null,
          avatar_url: u.user_metadata?.avatar_url || null,
          status: "ativo",
        };
        setProfile(newProf);
        supabase.from("profiles").upsert(newProf).catch(() => {});
      }

      const roleList = (roles ?? []).map((r: { role: Role }) => r.role);
      const isCleitton = (u.email || "").toLowerCase().includes("cleitton");
      const r: Role = (roleList.includes("admin") || isCleitton)
        ? "admin"
        : roleList.includes("gestor")
        ? "gestor"
        : roleList.includes("verificador")
        ? "verificador"
        : "usuario";
      setRole(r);

      if (tabs && tabs.length > 0) {
        setAllowedTabs(new Set(tabs.map((t: { tab_key: string }) => t.tab_key as TabKey)));
      } else {
        setAllowedTabs(null);
      }
    } catch (err) {
      console.warn("Erro ao carregar dados do usuário:", err);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsGuest(sessionStorage.getItem(GUEST_KEY) === "1");
    }
    loadGuestTabs();
    const { data: sub } = supabase.auth.onAuthStateChange(async (_evt, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        await Promise.all([loadUserData(u), loadGuestTabs()]);
      } else {
        setProfile(null);
        setRole(null);
        setAllowedTabs(null);
      }
      setLoading(false);
    });
    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) {
        await loadUserData(u);
      }
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
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
      
      // Admin bypass / Cleitton
      const emailLower = (user.email || "").toLowerCase();
      if (role === "admin" || emailLower.includes("cleitton") || emailLower === "cleitton.pereira@suportesolos.com.br" || emailLower === "cleittonpereira.lab@gmail.com") {
        return true;
      }

      if (isBlocked || isPending) return false;

      if (meta.adminOnly) return false;
      if (allowedTabs) return allowedTabs.has(tab);
      return true;
    };
    const displayName = isGuest
      ? "Convidado"
      : profile?.nome || user?.email?.split("@")[0] || "Usuário";
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
        await supabase.auth.signOut();
        sessionStorage.removeItem(GUEST_KEY);
        setIsGuest(false);
      },
      refresh: async () => {
        await Promise.all([loadUserData(user), loadGuestTabs()]);
      },
    };
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
