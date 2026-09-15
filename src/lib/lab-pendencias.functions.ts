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
import { ensureFolderPath, readDriveJson, writeDriveJson, atualizarDriveJson, lerJsonsDaPasta, findFileInFolder, deleteDriveFile } from "@/lib/driveStorage";
import { aplicarStatusPendencia, escolherPendenciaDoEnsaio, proximaPendencia } from "@/lib/pendencia-match";
import { exigirPermissaoNoFluxo, type PapelDoUsuario } from "@/lib/papeis";
import { chaveDaPendencia } from "@/lib/pendencia-chave";

type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];

function displayName(claims: { email?: string; user_metadata?: { full_name?: string; name?: string } } | undefined) {
  return (
    (claims?.user_metadata?.full_name as string | undefined) ||
    (claims?.user_metadata?.name as string | undefined) ||
    (claims?.email ? claims.email.split("@")[0] : "Operador")
  );
}

const FOLDER_PENDENCIAS = ["lab-pendencias"];

/** Mesma chave que o aparelho calcula sem rede (fila offline da bancada). */
const pendenciaKey = chaveDaPendencia;

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
    // Leitura em lab-pendencias-leitura.server.ts (também usada pelo Painel do coordenador no agendamento).
    const { listarPendencias } = await import("./lab-pendencias-leitura.server");
    return listarPendencias();
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
    // Mover a pendência para verificado/aprovado pelo Kanban é verificar/aprovar:
    // mesma regra do fluxo (lib/papeis.ts), conferida no servidor.
    if (data.status === "verificado") exigirPermissaoNoFluxo(context as PapelDoUsuario, "verificar");
    if (data.status === "aprovado") exigirPermissaoNoFluxo(context as PapelDoUsuario, "aprovar");
    if (data.status === "concluido_externo") exigirPermissaoNoFluxo(context as PapelDoUsuario, "concluir_fora");
    const now = new Date().toISOString();
    const folderId = await ensureFolderPath(FOLDER_PENDENCIAS);
    const name = `${data.id}.json`;
    const actorName = displayName((context as { claims?: { email?: string; user_metadata?: { full_name?: string; name?: string } } }).claims);

    // Ler-alterar-gravar com trava — no banco, atômico entre servidores.
    await atualizarDriveJson<PendenciaDigitacao>(name, folderId, (existing) => {
      if (!existing) {
        throw new Error("Pendência não encontrada.");
      }
      return aplicarStatusPendencia(existing, data.status, { userId: context.userId, nome: actorName }, now, {
        observacao: data.observacao,
        payload: data.payload,
      });
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
  const todas = (await lerJsonsDaPasta<PendenciaDigitacao>(folderId)).map((l) => l.data);

  const escolha = escolherPendenciaDoEnsaio(todas, alvo);
  if (escolha.tipo === "nenhuma") return "nao_encontrada";
  if (escolha.tipo === "ambigua") {
    console.warn(
      `[lab-pendencias] Ensaio ${alvo.ensaioId}: mais de uma pendência candidata (${escolha.ids.join(", ")}); nenhuma foi alterada.`,
    );
    return "ambigua";
  }

  const name = `${escolha.pendencia.id}.json`;
  const resultado: { v: ResultadoSincronizacao } = { v: "inalterada" };
  await atualizarDriveJson<PendenciaDigitacao>(name, folderId, (atual) => {
    if (!atual) {
      resultado.v = "nao_encontrada";
      return null;
    }
    const proxima = proximaPendencia(atual, alvo.status, alvo.ator, new Date().toISOString());
    resultado.v = proxima ? "atualizada" : "inalterada";
    return proxima;
  });
  return resultado.v;
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
