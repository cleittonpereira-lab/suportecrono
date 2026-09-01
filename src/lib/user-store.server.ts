/**
 * Usuários, papéis e permissões — armazenados no Google Drive (substitui as
 * tabelas `profiles`/`user_roles`/`tab_permissions`/`guest_permissions` do
 * Supabase, que ficavam sujeitas às instabilidades de conexão do banco).
 *
 * Um arquivo por usuário (mesmo padrão de `lab-pendencias.functions.ts`):
 * evita concorrência de escrita num arquivo único e permite achar um usuário
 * por id sem listar a pasta inteira. `listUsers`/`getUserByEmail` fazem
 * scan completo (aceitável pro tamanho do time) com dedupe pelo mais recente,
 * pro caso raro de dois arquivos com o mesmo id (condição de corrida no Drive).
 */
import crypto from "node:crypto";
import {
  ensureFolderPath,
  readDriveJson,
  writeDriveJson,
  listFilesInFolder,
} from "@/lib/driveStorage";

const FOLDER_USUARIOS = ["usuarios"];
const GUEST_TABS_FILE = "guest-tabs.json";

export type UserRole = "admin" | "gestor" | "usuario";
export type LabRole = "aprovador" | "verificador" | "digitador" | "nenhum";
export type UserStatus = "pendente" | "ativo" | "bloqueado";

export interface UserRecord {
  id: string;
  email: string;
  username: string | null;
  nome: string;
  cargo: string | null;
  titulo: string | null;
  /** null = conta migrada do Supabase, ainda sem senha nova definida */
  passwordHash: string | null;
  role: UserRole;
  labRole: LabRole;
  status: UserStatus;
  /** vazio = usa o padrão do papel (ver tab-permissions.ts) */
  tabs: string[];
  avatarFileId: string | null;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  createdAt: string;
  updatedAt: string;
  rev: number;
}

export type PublicUser = Omit<UserRecord, "passwordHash">;

export function toPublicUser(u: UserRecord): PublicUser {
  const { passwordHash: _drop, ...rest } = u;
  return rest;
}

function fileName(id: string): string {
  return `${id}.json`;
}

// ---- senha (node:crypto — já usado com sucesso neste deploy Cloudflare em google-auth.server.ts) ----

const PBKDF2_ITERATIONS = 120_000;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, "sha256");
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations)) return false;
  const salt = Buffer.from(parts[2], "base64url");
  const expected = Buffer.from(parts[3], "base64url");
  const computed = crypto.pbkdf2Sync(password, salt, iterations, expected.length, "sha256");
  if (computed.length !== expected.length) return false;
  return crypto.timingSafeEqual(computed, expected);
}

// ---- CRUD ----

export async function getUserById(id: string): Promise<UserRecord | null> {
  if (!id) return null;
  const folderId = await ensureFolderPath(FOLDER_USUARIOS);
  return readDriveJson<UserRecord>(fileName(id), folderId);
}

export async function listUsers(): Promise<UserRecord[]> {
  const folderId = await ensureFolderPath(FOLDER_USUARIOS);
  const files = await listFilesInFolder(folderId);
  const rows = await Promise.all(
    files
      .filter((f) => f.name !== GUEST_TABS_FILE)
      .map((f) => readDriveJson<UserRecord>(f.name, folderId)),
  );
  const byId = new Map<string, UserRecord>();
  for (const r of rows) {
    if (!r) continue;
    const prev = byId.get(r.id);
    if (!prev || prev.updatedAt < r.updatedAt) byId.set(r.id, r);
  }
  return Array.from(byId.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  const users = await listUsers();
  return users.find((u) => u.email.toLowerCase() === target) ?? null;
}

export async function getUserByUsername(username: string): Promise<UserRecord | null> {
  const target = username.trim().toLowerCase();
  if (!target) return null;
  const users = await listUsers();
  return users.find((u) => (u.username ?? "").toLowerCase() === target) ?? null;
}

export async function saveUser(record: UserRecord): Promise<void> {
  const folderId = await ensureFolderPath(FOLDER_USUARIOS);
  await writeDriveJson(fileName(record.id), record, folderId);
}

export async function createUser(input: {
  email: string;
  nome: string;
  password?: string | null;
  username?: string | null;
  cargo?: string | null;
  role?: UserRole;
  status?: UserStatus;
}): Promise<UserRecord> {
  const now = new Date().toISOString();
  const record: UserRecord = {
    id: crypto.randomUUID(),
    email: input.email.trim().toLowerCase(),
    username: input.username?.trim().toLowerCase() || null,
    nome: input.nome.trim(),
    cargo: input.cargo?.trim() || null,
    titulo: null,
    passwordHash: input.password ? hashPassword(input.password) : null,
    role: input.role ?? "usuario",
    labRole: "nenhum",
    status: input.status ?? "pendente",
    tabs: [],
    avatarFileId: null,
    emailConfirmedAt: input.password ? now : null,
    lastSignInAt: null,
    createdAt: now,
    updatedAt: now,
    rev: 1,
  };
  await saveUser(record);
  return record;
}

/** Aplica um patch parcial e grava, incrementando `rev`/`updatedAt`. */
export async function updateUser(id: string, patch: Partial<UserRecord>): Promise<UserRecord> {
  const current = await getUserById(id);
  if (!current) throw new Error("Usuário não encontrado.");
  const next: UserRecord = {
    ...current,
    ...patch,
    id: current.id,
    updatedAt: new Date().toISOString(),
    rev: (current.rev ?? 0) + 1,
  };
  await saveUser(next);
  return next;
}

// ---- permissões de convidado (um único arquivo pequeno, escrita rara) ----

export async function getGuestTabs(): Promise<string[]> {
  const folderId = await ensureFolderPath(FOLDER_USUARIOS);
  const data = await readDriveJson<{ tabs: string[] }>(GUEST_TABS_FILE, folderId);
  return data?.tabs ?? [];
}

export async function setGuestTabs(tabs: string[]): Promise<void> {
  const folderId = await ensureFolderPath(FOLDER_USUARIOS);
  await writeDriveJson(GUEST_TABS_FILE, { tabs }, folderId);
}
