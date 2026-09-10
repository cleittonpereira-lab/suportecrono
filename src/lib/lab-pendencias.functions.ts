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
import { requireSupabaseAuth, exigirLogin } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ensureFolderPath, readDriveJson, readDriveJsonById, writeDriveJson, listFilesInFolder, findFileInFolder, deleteDriveFile, withKeyLock } from "@/lib/driveStorage";
import { aplicarStatusPendencia, escolherPendenciaDoEnsaio, proximaPendencia } from "@/lib/pendencia-match";

type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];

/**
 * Roda `fn` sobre `items` com no máximo `limit` chamadas em voo ao mesmo
 * tempo. `readDriveJson` faz 2 requisições HTTP por arquivo (acha o id +
 * baixa o conteúdo) — sem isso, `Promise.all(files.map(readDriveJson))`
 * disparava 2×N requisições simultâneas numa única invocação do Worker.
 * Com a pasta de pendências crescendo (uso normal do dia a dia), isso
 * passou a estourar o limite de subrequests/CPU do Cloudflare Workers
 * ("Error 1102: Worker exceeded resource limits") em qualquer tela que
 * chamasse `listPendenciasDigitacao` — ou seja, quase todas.
 */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function displayName(claims: { email?: string; user_metadata?: { full_name?: string; name?: string } } | undefined) {
  return (
    (claims?.user_metadata?.full_name as string | undefined) ||
    (claims?.user_metadata?.name as string | undefined) ||
    (claims?.email ? claims.email.split("@")[0] : "Operador")
  );
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
  .middleware([exigirLogin])
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
    // Antes, qualquer falha aqui (rede, timeout, limite de recursos do
    // Worker) era engolida e devolvia [] como se fosse sucesso — pro
    // React Query isso NÃO é um erro, é uma resposta válida vazia, então
    // ele substituía a lista de pendências (todos os ensaios "em
    // digitação" que ainda não têm registro no labStore) por nada.
    // Resultado: a cada falha transitória, linhas inteiras da Central de
    // Relatórios somem e só voltam no próximo refetch bem-sucedido — o
    // "aparece e desaparece" reportado. Deixando propagar o erro, o React
    // Query mantém os últimos dados bons na tela em vez de trocar por
    // uma lista vazia.
    const folderId = await ensureFolderPath(FOLDER_PENDENCIAS);
    const files = await listFilesInFolder(folderId);
    const rows = await mapWithConcurrency(files, 8, (f) =>
      readDriveJsonById<PendenciaDigitacao>(f.id, f.name),
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
  });

const UpdateStatusInput = z.object({
  id: z.string().min(1),
  status: z.enum(["pendente", "em_digitacao", "digitado", "verificado", "aprovado", "concluido_externo"]),
  observacao: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
});

export const atualizarStatusPendencia = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((i: unknown) => UpdateStatusInput.parse(i))
  .handler(async ({ context, data }) => {
    const now = new Date().toISOString();
    const folderId = await ensureFolderPath(FOLDER_PENDENCIAS);
    const name = `${data.id}.json`;
    const actorName = displayName((context as { claims?: { email?: string; user_metadata?: { full_name?: string; name?: string } } }).claims);

    await withKeyLock(`rmw:${folderId}:${name}`, async () => {
      const existing = await readDriveJson<PendenciaDigitacao>(name, folderId);
      if (!existing) {
        throw new Error("Pendência não encontrada.");
      }
      const nextRecord = aplicarStatusPendencia(existing, data.status, { userId: context.userId, nome: actorName }, now, {
        observacao: data.observacao,
        payload: data.payload,
      });
      await writeDriveJson(name, nextRecord, folderId);
    });

    return { ok: true };
  });

export const atualizarPendenciaDigitacao = atualizarStatusPendencia;

export type ResultadoSincronizacao = "atualizada" | "inalterada" | "nao_encontrada" | "ambigua";

/**
 * Leva o avanço do fluxo de aprovação do ensaio para a pendência vinculada.
 *
 * A aprovação é gravada no arquivo do ensaio, mas quando o ensaio não chega ao
 * labStore a Central de Relatórios monta a linha pela pendência — e nada
 * atualizava a pendência: na OS 17960-26, 6 de 8 laudos aprovados continuavam
 * "em_digitacao" nela, aparecendo como rascunho e sem furo/profundidade.
 *
 * Escolha da pendência sem chute (ver `escolherPendenciaDoEnsaio`): ambígua ou
 * inexistente não atualiza nada. Leitura e escrita no mesmo lock.
 */
export async function sincronizarPendenciaDoEnsaio(alvo: {
  ensaioId: string;
  osNumero: string | null | undefined;
  amostraCodigos: (string | null | undefined)[];
  tipoEnsaio: string | null | undefined;
  status: PendenciaDigitacao["status"];
  ator: { userId: string; nome: string };
}): Promise<ResultadoSincronizacao> {
  const folderId = await ensureFolderPath(FOLDER_PENDENCIAS);
  const files = await listFilesInFolder(folderId);
  const todas = (await mapWithConcurrency(files, 8, (f) => readDriveJsonById<PendenciaDigitacao>(f.id, f.name))).filter(
    (p): p is PendenciaDigitacao => !!p,
  );

  const escolha = escolherPendenciaDoEnsaio(todas, alvo);
  if (escolha.tipo === "nenhuma") return "nao_encontrada";
  if (escolha.tipo === "ambigua") {
    console.warn(
      `[lab-pendencias] Ensaio ${alvo.ensaioId}: mais de uma pendência candidata (${escolha.ids.join(", ")}); nenhuma foi alterada.`,
    );
    return "ambigua";
  }

  const name = `${escolha.pendencia.id}.json`;
  return withKeyLock(`rmw:${folderId}:${name}`, async () => {
    const atual = await readDriveJson<PendenciaDigitacao>(name, folderId);
    if (!atual) return "nao_encontrada";
    const proxima = proximaPendencia(atual, alvo.status, alvo.ator, new Date().toISOString());
    if (!proxima) return "inalterada";
    await writeDriveJson(name, proxima, folderId);
    return "atualizada";
  });
}

const ConcluirExternoInput = z.object({
  id: z.string().min(1),
  observacao: z.string().optional(),
});

export const concluirPendenciaExterna = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
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
  .middleware([exigirLogin])
  .inputValidator((i: unknown) => CriarAvulsoInput.parse(i))
  .handler(async ({ context, data }) => {
    const now = new Date().toISOString();
    const amostraNorm = data.amostra?.trim() || null;
    const key = pendenciaKey(data.os.trim(), amostraNorm, data.ensaio.trim());
    const folderId = await ensureFolderPath(FOLDER_PENDENCIAS);
    const name = `${key}.json`;

    // Idempotente, como criarPendenciaDigitacao: criar um avulso para um
    // (OS, amostra, ensaio) que já tem pendência regravava o registro do zero —
    // voltava o status para "em_digitacao" e apagava digitador, verificador,
    // aprovador e a revisão.
    const existente = await readDriveJson<PendenciaDigitacao>(name, folderId);
    if (existente) return { ok: true, id: existente.id, created: false };

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
    return { ok: true, id: key, created: true };
  });

const DeleteInput = z.object({ id: z.string().min(1) });

export const removerPendenciaDigitacao = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
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
