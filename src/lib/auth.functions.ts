/**
 * Login/cadastro/sessão — substitui as chamadas `supabase.auth.*` usadas em
 * `src/routes/auth.tsx` e `src/routes/_app.perfil.tsx`. Usuários vivem no
 * Drive via `user-store.server.ts`; sessão é um cookie assinado (ver
 * `auth-session.server.ts`).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  createUser,
  getGuestTabs as getGuestTabsStore,
  getUserByEmail,
  getUserByUsername,
  toPublicUser,
  updateUser,
  verifyPassword,
  hashPassword,
  type PublicUser,
} from "@/lib/user-store.server";
import { issueSession, clearSession, getSessionUserRecord, requireAppAuth } from "@/lib/auth-session.server";

function isCleitton(email: string): boolean {
  return email.toLowerCase().includes("cleitton");
}

// ---- login com e-mail/usuário + senha ----

const LoginInput = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
});

export const loginWithPassword = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => LoginInput.parse(i))
  .handler(async ({ data }): Promise<{ user: PublicUser }> => {
    const idf = data.identifier.trim().toLowerCase();
    const user = idf.includes("@") ? await getUserByEmail(idf) : await getUserByUsername(idf);
    if (!user) throw new Error("Usuário não encontrado.");
    if (!verifyPassword(data.password, user.passwordHash)) {
      throw new Error(
        user.passwordHash
          ? "Senha incorreta."
          : "Esta conta ainda não tem senha definida — peça ao administrador pra definir uma em Gestão de usuários.",
      );
    }
    if (user.status === "bloqueado") {
      throw new Error("Sua conta está bloqueada pelo administrador.");
    }
    const updated = await updateUser(user.id, { lastSignInAt: new Date().toISOString() });
    issueSession(updated.id);
    return { user: toPublicUser(updated) };
  });

// ---- cadastro próprio (fica pendente até um admin aprovar) ----

const SignUpInput = z.object({
  nome: z.string().trim().min(2, "Informe o nome."),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres."),
});

export const signUpSelf = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => SignUpInput.parse(i))
  .handler(async ({ data }): Promise<{ user: PublicUser }> => {
    const existing = await getUserByEmail(data.email);
    if (existing) throw new Error("Este email já está cadastrado. Faça login na aba Entrar.");
    const cleitton = isCleitton(data.email);
    const user = await createUser({
      email: data.email,
      nome: data.nome,
      password: data.password,
      username: data.email.split("@")[0],
      role: cleitton ? "admin" : "usuario",
      status: cleitton ? "ativo" : "pendente",
    });
    issueSession(user.id);
    return { user: toPublicUser(user) };
  });

// ---- login com Google (o servidor confere o access_token com o Google antes de emitir sessão) ----

const GoogleLoginInput = z.object({ accessToken: z.string().min(1) });

export const loginWithGoogle = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => GoogleLoginInput.parse(i))
  .handler(async ({ data }): Promise<{ user: PublicUser }> => {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${data.accessToken}` },
    });
    if (!res.ok) throw new Error("Não foi possível confirmar sua conta Google.");
    const gUser = (await res.json()) as { email?: string; name?: string; picture?: string };
    if (!gUser.email) throw new Error("Conta Google sem e-mail associado.");

    let user = await getUserByEmail(gUser.email);
    if (!user) {
      const cleitton = isCleitton(gUser.email);
      user = await createUser({
        email: gUser.email,
        nome: gUser.name || gUser.email.split("@")[0],
        username: gUser.email.split("@")[0],
        role: cleitton ? "admin" : "usuario",
        status: cleitton ? "ativo" : "pendente",
      });
    }
    if (user.status === "bloqueado") throw new Error("Sua conta está bloqueada pelo administrador.");
    user = await updateUser(user.id, { lastSignInAt: new Date().toISOString() });
    issueSession(user.id);
    return { user: toPublicUser(user) };
  });

// ---- sessão atual / logout ----

export const getSessionUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ user: PublicUser | null }> => {
    const user = await getSessionUserRecord();
    return { user: user ? toPublicUser(user) : null };
  },
);

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  clearSession();
  return { ok: true };
});

/** Público (usado no modo Convidado, sem login). */
export const getPublicGuestTabs = createServerFn({ method: "GET" }).handler(async (): Promise<string[]> => {
  return getGuestTabsStore();
});

// ---- perfil próprio (usado por src/routes/_app.perfil.tsx) ----

const UpdateProfileInput = z.object({
  nome: z.string().trim().min(1).optional(),
  cargo: z.string().trim().optional(),
});

export const updateOwnProfile = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((i: unknown) => UpdateProfileInput.parse(i))
  .handler(async ({ context, data }): Promise<{ user: PublicUser }> => {
    const patch: Record<string, unknown> = {};
    if (data.nome !== undefined) patch.nome = data.nome || context.user.nome;
    if (data.cargo !== undefined) patch.cargo = data.cargo || null;
    const updated = await updateUser(context.user.id, patch);
    return { user: toPublicUser(updated) };
  });

const SetAvatarInput = z.object({ avatarFileId: z.string().min(1) });

export const setOwnAvatar = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((i: unknown) => SetAvatarInput.parse(i))
  .handler(async ({ context, data }): Promise<{ user: PublicUser }> => {
    const updated = await updateUser(context.user.id, { avatarFileId: data.avatarFileId });
    return { user: toPublicUser(updated) };
  });

const ChangeOwnPasswordInput = z.object({ password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres.") });

export const changeOwnPassword = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .inputValidator((i: unknown) => ChangeOwnPasswordInput.parse(i))
  .handler(async ({ context, data }) => {
    await updateUser(context.user.id, { passwordHash: hashPassword(data.password) });
    return { ok: true };
  });
