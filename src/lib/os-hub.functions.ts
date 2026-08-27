/**
 * Dados do hub de uma OS (aba "Ensaios Especiais"): data acordada com o
 * cliente (com histórico) + chat cronológico por OS. Um arquivo JSON por OS
 * no Drive, mesmo padrão de `lab-pendencias.functions.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ensureFolderPath, readDriveJson, writeDriveJson } from "@/lib/driveStorage";
import { uploadPhoto } from "@/lib/photo-upload.functions";

const FOLDER_OS_HUB = ["os-hub"];

function osKey(osNumero: string): string {
  return osNumero.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_");
}

function displayName(claims: { email?: string; user_metadata?: { full_name?: string; name?: string } } | undefined) {
  return (
    (claims?.user_metadata?.full_name as string | undefined) ||
    (claims?.user_metadata?.name as string | undefined) ||
    (claims?.email ? claims.email.split("@")[0] : "Operador")
  );
}

export type ChatMessage = {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string | null;
  text?: string | null;
  photoUrl?: string | null;
  createdAt: string;
};

export type OsHubData = {
  osNumero: string;
  dataAcordadaAtual: string | null;
  dataAcordadaOriginal: string | null;
  historicoData: { data: string; alteradoPor: string; alteradoEm: string }[];
  arquivada: boolean;
  arquivadaEm?: string | null;
  arquivadaPor?: string | null;
  messages: ChatMessage[];
};

function emptyHub(osNumero: string): OsHubData {
  return {
    osNumero,
    dataAcordadaAtual: null,
    dataAcordadaOriginal: null,
    historicoData: [],
    arquivada: false,
    messages: [],
  };
}

const OsNumeroInput = z.object({ osNumero: z.string().min(1) });

export const getOsHub = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => OsNumeroInput.parse(i))
  .handler(async ({ data }) => {
    const folderId = await ensureFolderPath(FOLDER_OS_HUB);
    const name = `${osKey(data.osNumero)}.json`;
    const existing = await readDriveJson<OsHubData>(name, folderId);
    return existing ?? emptyHub(data.osNumero);
  });

const AtualizarDataInput = z.object({ osNumero: z.string().min(1), novaData: z.string().min(1) });

export const atualizarDataAcordada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AtualizarDataInput.parse(i))
  .handler(async ({ context, data }) => {
    const folderId = await ensureFolderPath(FOLDER_OS_HUB);
    const name = `${osKey(data.osNumero)}.json`;
    const hub = (await readDriveJson<OsHubData>(name, folderId)) ?? emptyHub(data.osNumero);
    const nowIso = new Date().toISOString();
    const autor = displayName(context.claims);

    if (!hub.dataAcordadaOriginal) hub.dataAcordadaOriginal = data.novaData;
    hub.dataAcordadaAtual = data.novaData;
    hub.historicoData.push({ data: data.novaData, alteradoPor: autor, alteradoEm: nowIso });

    await writeDriveJson(name, hub, folderId);
    return hub;
  });

export const arquivarOs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => OsNumeroInput.parse(i))
  .handler(async ({ context, data }) => {
    const folderId = await ensureFolderPath(FOLDER_OS_HUB);
    const name = `${osKey(data.osNumero)}.json`;
    const hub = (await readDriveJson<OsHubData>(name, folderId)) ?? emptyHub(data.osNumero);
    hub.arquivada = true;
    hub.arquivadaEm = new Date().toISOString();
    hub.arquivadaPor = displayName(context.claims);
    await writeDriveJson(name, hub, folderId);
    return hub;
  });

export const desarquivarOs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => OsNumeroInput.parse(i))
  .handler(async ({ data }) => {
    const folderId = await ensureFolderPath(FOLDER_OS_HUB);
    const name = `${osKey(data.osNumero)}.json`;
    const hub = (await readDriveJson<OsHubData>(name, folderId)) ?? emptyHub(data.osNumero);
    hub.arquivada = false;
    hub.arquivadaEm = undefined;
    hub.arquivadaPor = undefined;
    await writeDriveJson(name, hub, folderId);
    return hub;
  });

const PostChatInput = z.object({
  osNumero: z.string().min(1),
  text: z.string().optional(),
  photoDataUrl: z.string().optional(),
});

export const postOsChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => PostChatInput.parse(i))
  .handler(async ({ context, data }) => {
    if (!data.text?.trim() && !data.photoDataUrl) {
      throw new Error("Mensagem vazia — escreva um texto ou anexe uma foto.");
    }

    let photoUrl: string | undefined;
    if (data.photoDataUrl) {
      const uploaded = await uploadPhoto({ data: { dataUrl: data.photoDataUrl, namePrefix: `chat_${osKey(data.osNumero)}` } });
      photoUrl = uploaded.url;
    }

    const folderId = await ensureFolderPath(FOLDER_OS_HUB);
    const name = `${osKey(data.osNumero)}.json`;
    const hub = (await readDriveJson<OsHubData>(name, folderId)) ?? emptyHub(data.osNumero);

    const message: ChatMessage = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      authorId: context.userId,
      authorName: displayName(context.claims),
      authorAvatar: (context.claims?.user_metadata as any)?.avatar_url ?? null,
      text: data.text?.trim() || null,
      photoUrl: photoUrl ?? null,
      createdAt: new Date().toISOString(),
    };
    hub.messages.push(message);

    await writeDriveJson(name, hub, folderId);
    return message;
  });
