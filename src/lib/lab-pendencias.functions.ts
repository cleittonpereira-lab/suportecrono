/**
 * Server functions para o ciclo de vida de pendências de digitação e SLAs.
 *
 * Persistência no Google Drive: um arquivo por pendência, nomeado de forma
 * determinística a partir de (os, amostra, ensaio) — isso permite achar
 * (ou confirmar que não existe) uma pendência por essas 3 chaves sem
 * precisar listar/ler todos os arquivos da pasta, preservando o mesmo
 * comportamento idempotente que a constraint UNIQUE(os,amostra,ensaio)
 * dava no Supabase.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ensureFolderPath, readDriveJson, writeDriveJson, listFilesInFolder, findFileInFolder, deleteDriveFile } from "@/lib/driveStorage";

type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];

function displayName(claims: { email?: string; user_metadata?: { full_name?: string; name?: string } } | undefined) {
  return (
    (claims?.user_metadata?.full_name as string | undefined) ||
    (claims?.user_metadata?.name as string | undefined) ||
    (claims?.email ? claims.email.split("@")[0] : "Operador")
  );
}

function asJsonObject(val: JsonValue | null | undefined): Record<string, unknown> {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return {};
}

const FOLDER_PENDENCIAS = ["lab-pendencias"];

function pendenciaKey(os: string, amostra: string | null, ensaio: string): string {
  const raw = `${os.trim()}__${(amostra ?? "").trim()}__${ensaio.trim()}`;
  return raw.toLowerCase().replace(/[^a-z0-9_.-]+/g, "_");
}

export type PendenciaDigitacao = {
  id: string;
  os: string;
  amostra: string | null;
  ensaio: string;
  tipo_ensaio: string | null;
  equipamento: string | null;
  data_conclusao: string;
  status: "pendente" | "em_digitacao" | "digitado" | "verificado" | "aprovado" | "concluido_externo";
  origem: "gantt" | "digitalizacao" | "avulso";
  operador_user_id: string | null;
  operador_nome_text?: string | null;
  digitador_user_id?: string | null;
  verificador_user_id?: string | null;
  aprovador_user_id?: string | null;
  observacao: string | null;
  payload: JsonValue | null;
  created_at: string;
  updated_at: string;
  operador_nome?: string | null;
  digitador_nome?: string | null;
  verificador_nome?: string | null;
  aprovador_nome?: string | null;
  rev?: number;
};

const CriarInput = z.object({
  os: z.string().min(1),
  amostra: z.string().nullable().optional(),
  ensaio: z.string().min(1),
  tipo_ensaio: z.string().optional(),
  equipamento: z.string().optional(),
  programacao_id: z.string().optional(),
  operador_nome: z.string().optional(),
  origem: z.enum(["gantt", "digitalizacao", "avulso"]).optional(),
  payload: z.record(z.unknown()).optional(),
});

export const criarPendenciaDigitacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CriarInput.parse(i))
  .handler(async ({ context, data }) => {
    const amostraNorm = data.amostra == null || data.amostra.trim() === "" ? null : data.amostra.trim();
    const key = pendenciaKey(data.os.trim(), amostraNorm, data.ensaio.trim());
    const nowIso = new Date().toISOString();
    const folderId = await ensureFolderPath(FOLDER_PENDENCIAS);
    const name = `${key}.json`;

    const existing = await readDriveJson<PendenciaDigitacao>(name, folderId);
    if (existing) {
      // Já existe (idempotente, igual ao ON CONFLICT antigo) - não sobrescreve status já avançado.
      return { ok: true, id: existing.id, created: false };
    }

    const record: PendenciaDigitacao = {
      id: key,
      os: data.os.trim(),
      amostra: amostraNorm,
      ensaio: data.ensaio.trim(),
      tipo_ensaio: data.tipo_ensaio ?? null,
      equipamento: data.equipamento ?? null,
      operador_user_id: context.userId,
      operador_nome: data.operador_nome ?? null,
      status: "pendente",
      origem: data.origem ?? "gantt",
      payload: {
        ...(data.payload || {}),
        programacao_id: data.programacao_id ?? null,
        execucao_concluida_at: nowIso,
      } as JsonValue,
      data_conclusao: nowIso,
      observacao: null,
      created_at: nowIso,
      updated_at: nowIso,
      rev: 1,
    };

    await writeDriveJson(name, record, folderId);
    return { ok: true, id: key, created: true };
  });

export const listPendenciasDigitacao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<PendenciaDigitacao[]> => {
    try {
      const folderId = await ensureFolderPath(FOLDER_PENDENCIAS);
      const files = await listFilesInFolder(folderId);
      const rows = await Promise.all(
        files.map((f) => readDriveJson<PendenciaDigitacao>(f.name, folderId)),
      );
      // O nome do arquivo é determinístico por (os, amostra, ensaio), mas o
      // Drive não impede dois arquivos com o mesmo nome na mesma pasta — uma
      // condição de corrida (dois scans quase simultâneos) pode criar dois
      // arquivos com o mesmo `id` lógico. Mantém só o mais recente de cada
      // `id` pra nunca mostrar "pendência duplicada" na tela.
      const byId = new Map<string, PendenciaDigitacao>();
      for (const r of rows) {
        if (!r) continue;
        const prev = byId.get(r.id);
        if (!prev || prev.updated_at < r.updated_at) byId.set(r.id, r);
      }
      return Array.from(byId.values()).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    } catch (err) {
      console.warn("[listPendenciasDigitacao] Falha:", err);
      return [];
    }
  });

const UpdateStatusInput = z.object({
  id: z.string().min(1),
  status: z.enum(["pendente", "em_digitacao", "digitado", "verificado", "aprovado", "concluido_externo"]),
  observacao: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
});

export const atualizarStatusPendencia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => UpdateStatusInput.parse(i))
  .handler(async ({ context, data }) => {
    const now = new Date().toISOString();
    const folderId = await ensureFolderPath(FOLDER_PENDENCIAS);
    const name = `${data.id}.json`;
    const existing = await readDriveJson<PendenciaDigitacao>(name, folderId);
    if (!existing) {
      throw new Error("Pendência não encontrada.");
    }

    const prevPayload = asJsonObject(existing.payload);
    const incomingPayload = data.payload ?? {};
    const nextPayload = {
      ...prevPayload,
      ...incomingPayload,
      ...(data.status === "em_digitacao" ? { digitacao_started_at: prevPayload.digitacao_started_at || now } : {}),
      ...(data.status === "digitado" ? { digitacao_finished_at: now } : {}),
      ...(data.status === "verificado" ? { verificado_at: now } : {}),
      ...(data.status === "aprovado" ? { aprovado_at: now } : {}),
      ...(data.status === "concluido_externo" ? { concluido_externo_at: now } : {}),
    };

    const patch: Partial<PendenciaDigitacao> = {
      status: data.status,
      payload: nextPayload as JsonValue,
      updated_at: now,
    };
    if (data.observacao !== undefined) patch.observacao = data.observacao;
    const actorName = displayName((context as { claims?: { email?: string; user_metadata?: { full_name?: string; name?: string } } }).claims);
    if (data.status === "em_digitacao" || data.status === "digitado") {
      patch.digitador_user_id = context.userId;
      patch.digitador_nome = actorName;
    }
    if (data.status === "verificado") {
      patch.verificador_user_id = context.userId;
      patch.verificador_nome = actorName;
    }
    if (data.status === "aprovado") {
      patch.aprovador_user_id = context.userId;
      patch.aprovador_nome = actorName;
    }

    const nextRecord: PendenciaDigitacao = { ...existing, ...patch, rev: (existing.rev ?? 0) + 1 };
    await writeDriveJson(name, nextRecord, folderId);

    return { ok: true };
  });

export const atualizarPendenciaDigitacao = atualizarStatusPendencia;

const ConcluirExternoInput = z.object({
  id: z.string().min(1),
  observacao: z.string().optional(),
});

export const concluirPendenciaExterna = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ConcluirExternoInput.parse(i))
  .handler(async ({ data }) => {
    return atualizarStatusPendencia({
      data: {
        id: data.id,
        status: "concluido_externo",
        observacao: data.observacao || "Relatório Concluído fora da Central (Planilha Excel)",
      },
    });
  });

const CriarAvulsoInput = z.object({
  os: z.string().min(1),
  cliente: z.string().optional(),
  obra: z.string().optional(),
  amostra: z.string().optional(),
  ensaio: z.string().min(1),
  tipo_ensaio: z.string().min(1),
  operador_nome: z.string().optional(),
  observacoes: z.string().optional(),
});

export const criarRelatorioAvulso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CriarAvulsoInput.parse(i))
  .handler(async ({ context, data }) => {
    const now = new Date().toISOString();
    const amostraNorm = data.amostra?.trim() || null;
    const key = pendenciaKey(data.os.trim(), amostraNorm, data.ensaio.trim());
    const folderId = await ensureFolderPath(FOLDER_PENDENCIAS);
    const name = `${key}.json`;

    const payload = {
      cliente: data.cliente || "",
      obra: data.obra || "",
      digitacao_started_at: now,
      avulso: true,
    };

    const record: PendenciaDigitacao = {
      id: key,
      os: data.os.trim(),
      amostra: amostraNorm,
      ensaio: data.ensaio.trim(),
      tipo_ensaio: data.tipo_ensaio.trim(),
      equipamento: null,
      status: "em_digitacao",
      origem: "avulso",
      digitador_user_id: context.userId,
      operador_user_id: null,
      operador_nome: data.operador_nome?.trim() || null,
      observacao: data.observacoes?.trim() || null,
      payload: payload as JsonValue,
      data_conclusao: now,
      created_at: now,
      updated_at: now,
      rev: 1,
    };

    await writeDriveJson(name, record, folderId);
    return { ok: true, id: key };
  });

const DeleteInput = z.object({ id: z.string().min(1) });

export const removerPendenciaDigitacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => DeleteInput.parse(i))
  .handler(async ({ data }) => {
    const folderId = await ensureFolderPath(FOLDER_PENDENCIAS);
    // Uma condição de corrida na criação pode ter deixado mais de um arquivo
    // com o mesmo nome na pasta (ver listPendenciasDigitacao) — apaga todos,
    // não só o primeiro encontrado.
    for (let i = 0; i < 10; i++) {
      const fileId = await findFileInFolder(`${data.id}.json`, folderId);
      if (!fileId) break;
      await deleteDriveFile(fileId);
    }
    return { ok: true };
  });
