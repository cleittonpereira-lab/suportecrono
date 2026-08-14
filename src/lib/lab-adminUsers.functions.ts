/**
 * Server functions para gestão de usuários (somente admin).
 * Verifica o papel do chamador via `has_role(auth.uid(), 'admin')` executando
 * com o token do próprio usuário (RLS). Só então usa o admin client para
 * listar/remover contas ou gravar em `user_roles`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso restrito ao administrador.");
}

export type AdminUserRow = {
  id: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  role: "admin" | "usuario";
  emailConfirmed: boolean;
};

export const listAppUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUserRow[]> => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw new Error(error.message);
    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rolesErr) throw new Error(rolesErr.message);
    const roleByUser = new Map<string, "admin" | "usuario">();
    for (const r of roles ?? []) roleByUser.set(r.user_id, r.role as "admin" | "usuario");
    return (data.users ?? []).map((u) => ({
      id: u.id,
      email: u.email ?? null,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      role: roleByUser.get(u.id) ?? "usuario",
      emailConfirmed: Boolean(u.email_confirmed_at),
    }));
  });

const SetRoleInput = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "usuario"]),
});

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SetRoleInput.parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // remove papéis anteriores e insere o novo
    const { error: delErr } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId);
    if (delErr) throw new Error(delErr.message);
    const { error: insErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (insErr) throw new Error(insErr.message);
    return { ok: true };
  });

const InviteInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["admin", "usuario"]).default("usuario"),
});

export const createAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InviteInput.parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    const uid = created.user?.id;
    if (uid) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
      await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });
    }
    return { ok: true, userId: uid };
  });

const DeleteInput = z.object({ userId: z.string().uuid() });

const SetPasswordInput = z.object({
  userId: z.string().uuid(),
  password: z.string().min(8, "Senha deve ter ao menos 8 caracteres."),
});

/** Admin define/redefine a senha de qualquer usuário. */
export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SetPasswordInput.parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => DeleteInput.parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) {
      throw new Error("Você não pode excluir sua própria conta.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const isCurrentUserAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) return { isAdmin: false };
    return { isAdmin: Boolean(data) };
  });

/**
 * Retorna, para cada usuário, se o e-mail já foi confirmado e a data do
 * último login. Usado pela tela de Gestão de usuários para mostrar o estágio
 * do convite (enviado / validado por e-mail / aguardando aprovação / ativo).
 */
export const listAuthMeta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ perPage: 500 });
    if (error) throw new Error(error.message);
    return (data.users ?? []).map((u) => ({
      id: u.id,
      emailConfirmedAt: (u.email_confirmed_at ?? null) as string | null,
      lastSignInAt: (u.last_sign_in_at ?? null) as string | null,
      invitedAt: (u.invited_at ?? null) as string | null,
    }));
  });

const SetLabRoleInput = z.object({
  userId: z.string().uuid(),
  labRole: z.enum(["aprovador", "verificador", "digitador", "nenhum"]),
});

export const setUserLabRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SetLabRoleInput.parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ lab_report_role: data.labRole })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SetTituloInput = z.object({
  userId: z.string().uuid(),
  titulo: z.string().max(200).nullable(),
});

export const setUserTitulo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SetTituloInput.parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ titulo: data.titulo?.trim() || null })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SetUsernameInput = z.object({
  userId: z.string().uuid(),
  username: z
    .string()
    .trim()
    .min(3, "Usuário deve ter ao menos 3 caracteres.")
    .max(40, "Usuário muito longo.")
    .regex(/^[a-zA-Z0-9._-]+$/i, "Use apenas letras, números, ponto, traço ou sublinhado.")
    .nullable(),
});

const SetNomeInput = z.object({
  userId: z.string().uuid(),
  nome: z.string().trim().min(2, "Informe o nome.").max(120),
});

/** Admin altera o nome exibido do usuário. */
export const setUserNome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SetNomeInput.parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ nome: data.nome })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SetEmailInput = z.object({
  userId: z.string().uuid(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("E-mail inválido.")
    .refine((v) => v.endsWith("@suportesolos.com.br"), "Apenas e-mails @suportesolos.com.br."),
});

/** Admin altera o e-mail (Auth + profiles) do usuário. */
export const setUserEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SetEmailInput.parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email: data.email,
      email_confirm: true,
    });
    if (authErr) throw new Error(authErr.message);
    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({ email: data.email })
      .eq("id", data.userId);
    if (profErr) throw new Error(profErr.message);
    return { ok: true };
  });

/** Admin define/troca o `username` de qualquer perfil. */
export const setUserUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => SetUsernameInput.parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uname = data.username ? data.username.toLowerCase() : null;
    if (uname) {
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("username", uname)
        .neq("id", data.userId)
        .maybeSingle();
      if (existing) throw new Error("Este nome de usuário já está em uso.");
    }
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ username: uname })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true, username: uname };
  });

const InviteUserInput = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("E-mail inválido.")
    .refine((v) => v.endsWith("@suportesolos.com.br"), "Apenas e-mails @suportesolos.com.br."),
  nome: z.string().trim().min(2, "Informe o nome.").max(120),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Usuário deve ter ao menos 3 caracteres.")
    .max(40, "Usuário muito longo.")
    .regex(/^[a-z0-9._-]+$/, "Use apenas letras, números, ponto, traço ou sublinhado.")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  role: z.enum(["admin", "gestor", "usuario"]).default("usuario"),
});

/**
 * Admin envia convite por e-mail. Cria o usuário no Auth (trigger cria o
 * profile), define username/role e retorna o link de convite para reenvio se
 * necessário. O usuário define a própria senha ao clicar no link.
 */
export const inviteAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => InviteUserInput.parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) valida username disponível antes de convidar
    if (data.username) {
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("username", data.username)
        .maybeSingle();
      if (existing) throw new Error("Este nome de usuário já está em uso.");
    }

    // 2) envia convite (Supabase manda o e-mail com link de setup de senha)
    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      data.email,
      { data: { nome: data.nome } },
    );
    if (error) throw new Error(error.message);
    const uid = invited.user?.id;
    if (!uid) throw new Error("Não foi possível criar o usuário.");

    // 3) grava nome + username no profile (trigger de novo usuário já criou a linha)
    const update: { nome: string; username?: string } = { nome: data.nome };
    if (data.username) update.username = data.username;
    await supabaseAdmin.from("profiles").update(update).eq("id", uid);

    // 4) papel inicial
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
    await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });

    return { ok: true, userId: uid, email: data.email };
  });