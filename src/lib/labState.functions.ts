/**
 * Estado central do laboratório persistido como UM único JSON no Google Drive
 * (`_lab-state.json` na raiz da pasta Suporte Infra). Todas as OS, amostras
 * e ensaios ficam nesse arquivo — carregado 1x ao entrar no app e regravado
 * a cada 1s de inatividade (autosave).
 *
 * Fotos e PDFs continuam sendo enviados por `driveSync.functions.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const DRIVE_V3 = `${GATEWAY}/drive/v3`;
const DRIVE_UPLOAD = `${GATEWAY}/upload/drive/v3/files`;
const ROOT_FOLDER_ID = "17RBUhXfOcliyGyBTZ0je0QytNfeL7fGg";
const STATE_FILENAME = "_lab-state.json";

function driveHeaders(extra: Record<string, string> = {}): Headers {
  const h = new Headers(extra);
  h.set("Authorization", `Bearer ${process.env.LOVABLE_API_KEY}`);
  h.set("X-Connection-Api-Key", `${process.env.GOOGLE_DRIVE_API_KEY}`);
  return h;
}

function requireDriveEnv() {
  if (!process.env.LOVABLE_API_KEY || !process.env.GOOGLE_DRIVE_API_KEY) {
    throw new Error("Conexão com Google Drive não configurada.");
  }
}

function escQ(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findStateFileId(): Promise<string | null> {
  const q = `name = '${escQ(STATE_FILENAME)}' and '${ROOT_FOLDER_ID}' in parents and trashed = false`;
  const url = `${DRIVE_V3}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent("files(id,name,modifiedTime)")}&pageSize=1`;
  const res = await fetch(url, { method: "GET", headers: driveHeaders() });
  if (!res.ok) throw new Error(`Drive list ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { files?: { id: string }[] };
  return data.files?.[0]?.id ?? null;
}

async function uploadJson(bytes: Uint8Array, existingId: string | null): Promise<string> {
  if (existingId) {
    const res = await fetch(`${DRIVE_UPLOAD}/${existingId}?uploadType=media&fields=id`, {
      method: "PATCH",
      headers: driveHeaders({ "Content-Type": "application/json" }),
      body: bytes as BodyInit,
    });
    if (!res.ok) throw new Error(`Drive update ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return existingId;
  }
  const boundary = `----lovable${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name: STATE_FILENAME, parents: [ROOT_FOLDER_ID] });
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.byteLength + bytes.byteLength + tail.byteLength);
  body.set(head, 0);
  body.set(bytes, head.byteLength);
  body.set(tail, head.byteLength + bytes.byteLength);
  const res = await fetch(`${DRIVE_UPLOAD}?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: driveHeaders({ "Content-Type": `multipart/related; boundary=${boundary}` }),
    body: body as BodyInit,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Drive upload ${res.status}: ${text.slice(0, 300)}`);
  return (JSON.parse(text) as { id: string }).id;
}

export const loadLabStateFromDrive = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    requireDriveEnv();
    const id = await findStateFileId();
    if (!id) return { stateJson: null as string | null, fileId: null as string | null };
    const res = await fetch(`${DRIVE_V3}/files/${id}?alt=media`, {
      method: "GET",
      headers: driveHeaders(),
    });
    if (!res.ok) throw new Error(`Drive download ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const stateJson = await res.text();
    return { stateJson, fileId: id };
  });

const SaveLabStateInput = z.object({
  stateJson: z.string().min(2),
});

export const saveLabStateToDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SaveLabStateInput.parse(input))
  .handler(async ({ data }) => {
    requireDriveEnv();
    const existing = await findStateFileId();
    const bytes = new TextEncoder().encode(data.stateJson);
    const fileId = await uploadJson(bytes, existing);
    return { ok: true, fileId, savedAt: new Date().toISOString() };
  });