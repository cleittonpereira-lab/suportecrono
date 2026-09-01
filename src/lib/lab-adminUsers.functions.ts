/**
 * Server functions da tela "Gestão de usuários" (somente admin) — reescrito
 * pra usar o Drive (`user-store.server.ts`) em vez das tabelas do Supabase
 * (`profiles`/`user_roles`/`tab_permissions`/`guest_permissions`), que
 * ficavam sujeitas às instabilidades de conexão do banco.
 *
 * Autorização via `requireAppAdmin` (`auth-session.server.ts`) — cookie de
 * sessão próprio, não depende mais do Supabase Auth.
 */
import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAppAdmin } from "@/lib/auth-session.server";
import {
  createUser,
  getGuestTabs,
  getUserByEmail,
  getUserByUsername,
  hashPassword,
  listUsers,
  setGuestTabs,
  toPublicUser,
  updateUser,
  type PublicUser,
} from "@/lib/user-store.server";

function randomTempPassword(): string {
  return crypto.randomBytes(6).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 10) || "labtemp123";
}

export const listAdminUsers = createServerFn({ method: "GET" })
  .middleware([requireAppAdmin])
  .handler(async (): Promise<{ users: PublicUser[]; guestTabs: string[] }> => {
    const [users, guestTabs] = await Promise.all([listUsers(), getGuestTabs()]);
    return { users: users.map(toPublicUser), guestTabs };
  });

const StatusInput = z.object({ userId: z.string().min(1), status: z.enum(["pendente", "ativo", "bloqueado"]) });

export const setUserStatus = createServerFn({ method: "POST" })
  .middleware([requireAppAdmin])
  .inputValidator((i: unknown) => StatusInput.parse(i))
  .handler(async ({ data }) => {
    await updateUser(data.userId, { status: data.status });
    return { ok: true };
  });

const AppRoleInput = z.object({ userId: z.string().min(1), role: z.enum(["admin", "gestor", "usuario"]) });

export const setUserAppRole = createServerFn({ method: "POST" })
  .middleware([requireAppAdmin])
  .inputValidator((i: unknown) => AppRoleInput.parse(i))
  .handler(async ({ data }) => {
    await updateUser(data.userId, { role: data.role });
    return { ok: true };
  });

const CargoInput = z.object({ userId: z.string().min(1), cargo: z.string().max(200) });

export const setUserCargo = createServerFn({ method: "POST" })
  .middleware([requireAppAdmin])
  .inputValidator((i: unknown) => CargoInput.parse(i))
  .handler(async ({ data }) => {
    await updateUser(data.userId, { cargo: data.cargo.trim() || null });
    return { ok: true };
  });

const TituloInput = z.object({ userId: z.string().min(1), titulo: z.string().max(200).nullable() });

export const setUserTitulo = createServerFn({ method: "POST" })
  .middleware([requireAppAdmin])
  .inputValidator((i: unknown) => TituloInput.parse(i))
  .handler(async ({ data }) => {
    await updateUser(data.userId, { titulo: data.titulo?.trim() || null });
    return { ok: true };
  });

const LabRoleInput = z.object({
  userId: z.string().min(1),
  labRole: z.enum(["aprovador", "verificador", "digitador", "nenhum"]),
});

export const setUserLabRole = createServerFn({ method: "POST" })
  .middleware([requireAppAdmin])
  .inputValidator((i: unknown) => LabRoleInput.parse(i))
  .handler(async ({ data }) => {
    await updateUser(data.userId, { labRole: data.labRole });
    return { ok: true };
  });

const UsernameInput = z.object({
  userId: z.string().min(1),
  username: z
    .string()
    .trim()
    .min(3, "Usuário deve ter ao menos 3 caracteres.")
    .max(40, "Usuário muito longo.")
    .regex(/^[a-zA-Z0-9._-]+$/i, "Use apenas letras, números, ponto, traço ou sublinhado.")
    .nullable(),
});

export const setUserUsername = createServerFn({ method: "POST" })
  .middleware([requireAppAdmin])
  .inputValidator((i: unknown) => UsernameInput.parse(i))
  .handler(async ({ data }) => {
    const uname = data.username ? data.username.toLowerCase() : null;
    if (uname) {
      const existing = await getUserByUsername(uname);
      if (existing && existing.id !== data.userId) throw new Error("Este nome de usuário já está em uso.");
    }
    await updateUser(data.userId, { username: uname });
    return { ok: true, username: uname };
  });

const NomeInput = z.object({ userId: z.string().min(1), nome: z.string().trim().min(2, "Informe o nome.").max(120) });

export const setUserNome = createServerFn({ method: "POST" })
  .middleware([requireAppAdmin])
  .inputValidator((i: unknown) => NomeInput.parse(i))
  .handler(async ({ data }) => {
    await updateUser(data.userId, { nome: data.nome });
    return { ok: true };
  });

const EmailInput = z.object({
  userId: z.string().min(1),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("E-mail inválido.")
    .refine((v) => v.endsWith("@suportesolos.com.br"), "Apenas e-mails @suportesolos.com.br."),
});

export const setUserEmail = createServerFn({ method: "POST" })
  .middleware([requireAppAdmin])
  .inputValidator((i: unknown) => EmailInput.parse(i))
  .handler(async ({ data }) => {
    const existing = await getUserByEmail(data.email);
    if (existing && existing.id !== data.userId) throw new Error("Este e-mail já está em uso por outra conta.");
    await updateUser(data.userId, { email: data.email });
    return { ok: true };
  });

const PasswordInput = z.object({
  userId: z.string().min(1),
  password: z.string().min(8, "Senha deve ter ao menos 8 caracteres."),
});

export const setUserPassword = createServerFn({ method: "POST" })
  .middleware([requireAppAdmin])
  .inputValidator((i: unknown) => PasswordInput.parse(i))
  .handler(async ({ data }) => {
    await updateUser(data.userId, { passwordHash: hashPassword(data.password), status: "ativo" });
    return { ok: true };
  });

const TabPermissionsInput = z.object({ userId: z.string().min(1), tabs: z.array(z.string()) });

export const setUserTabPermissions = createServerFn({ method: "POST" })
  .middleware([requireAppAdmin])
  .inputValidator((i: unknown) => TabPermissionsInput.parse(i))
  .handler(async ({ data }) => {
    await updateUser(data.userId, { tabs: data.tabs });
    return { ok: true };
  });

const GuestTabsInput = z.object({ tabs: z.array(z.string()) });

export const setGuestTabPermissions = createServerFn({ method: "POST" })
  .middleware([requireAppAdmin])
  .inputValidator((i: unknown) => GuestTabsInput.parse(i))
  .handler(async ({ data }) => {
    await setGuestTabs(data.tabs);
    return { ok: true };
  });

/**
 * Cria a conta diretamente com uma senha temporária (não há envio de e-mail
 * — o admin comunica a senha pro usuário; mesmo espírito do botão "Senha"
 * já existente na tela).
 */
const InviteInput = z.object({
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

export const inviteAppUser = createServerFn({ method: "POST" })
  .middleware([requireAppAdmin])
  .inputValidator((i: unknown) => InviteInput.parse(i))
  .handler(async ({ data }): Promise<{ ok: true; userId: string; email: string; tempPassword: string }> => {
    const existing = await getUserByEmail(data.email);
    if (existing) throw new Error("Este e-mail já está cadastrado.");
    const username = data.username || data.email.split("@")[0].toLowerCase();
    const usernameTaken = await getUserByUsername(username);
    if (usernameTaken) throw new Error("Este nome de usuário já está em uso.");

    const tempPassword = randomTempPassword();
    const user = await createUser({
      email: data.email,
      nome: data.nome,
      username,
      password: tempPassword,
      role: data.role,
      status: "ativo",
    });
    return { ok: true, userId: user.id, email: user.email, tempPassword };
  });

/** Ativa perfis pendentes e preenche username em branco (mesmo objetivo de antes, agora sobre o Drive). */
export const syncAndActivateUsers = createServerFn({ method: "POST" })
  .middleware([requireAppAdmin])
  .handler(async () => {
    const users = await listUsers();
    let updatedCount = 0;
    for (const u of users) {
      const patch: Record<string, unknown> = {};
      if (!u.username && u.email) patch.username = u.email.split("@")[0].toLowerCase();
      if (u.status === "pendente") patch.status = "ativo";
      if (Object.keys(patch).length > 0) {
        await updateUser(u.id, patch);
        updatedCount++;
      }
    }
    return { ok: true, updatedCount };
  });
