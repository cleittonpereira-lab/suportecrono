/**
 * Atas do Qualidade - LAB: um JSON por reunião na pasta de dados
 * "qualidade-atas" (D1 quando ligado, como as demais pastas de dados).
 *
 * Toda alteração passa por `atualizarDriveJson` (ler-alterar-gravar com
 * trava): duas pessoas editando a mesma ata ao vivo não apagam o trabalho uma
 * da outra. A tela manda OPERAÇÕES pequenas ("mudar o prazo deste item"), não
 * o documento inteiro. Regras em lib/atas-qualidade.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth, exigirLogin } from "@/integrations/supabase/auth-middleware";
import {
  atualizarDriveJson,
  deleteDriveFile,
  ensureFolderPath,
  findFileInFolder,
  lerJsonsDaPasta,
} from "@/lib/driveStorage";
import {
  aplicarOperacao,
  copiaParaReuniaoNova,
  GRUPO_PADRAO,
  itemEmAberto,
  renumerarPorData,
  type OperacaoAta,
  type Participante,
  type Reuniao,
} from "@/lib/atas-qualidade";
import { listUsers } from "@/lib/user-store.server";

const PASTA = ["qualidade-atas"];

function nomeDe(claims: { email?: string; user_metadata?: { full_name?: string; name?: string } } | undefined): string {
  return (
    (claims?.user_metadata?.full_name as string | undefined) ||
    (claims?.user_metadata?.name as string | undefined) ||
    (claims?.email ? claims.email.split("@")[0] : "Operador")
  );
}

const nomeDoArquivo = (id: string) => `${id}.json`;

async function lerTodas(): Promise<Reuniao[]> {
  const folderId = await ensureFolderPath(PASTA);
  const docs = await lerJsonsDaPasta<Reuniao>(folderId);
  const porId = new Map<string, Reuniao>();
  for (const { data } of docs) {
    if (!data?.id) continue;
    const antes = porId.get(data.id);
    if (!antes || antes.atualizadaEm < data.atualizadaEm) porId.set(data.id, data);
  }
  return renumerarPorData([...porId.values()]);
}

export const listarReunioes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => lerTodas());

/** Contas ativas — para sugerir participantes e responsáveis. */
export const listarPessoasDaQualidade = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const users = await listUsers();
    return users
      .filter((u) => u.status === "ativo" && u.nome.trim())
      .map((u) => ({ nome: u.nome.trim(), cargo: u.cargo ?? "" }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  });

const ParticipanteSchema = z.object({
  nome: z.string().max(120),
  presente: z.boolean(),
  funcao: z.string().max(120).default(""),
  externo: z.boolean().default(false),
});

const DataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const CriarInput = z.object({
  grupo: z.string().trim().min(1).max(120).default(GRUPO_PADRAO),
  titulo: z.string().trim().max(160).default(""),
  data: DataIso,
  horaInicio: z.string().max(5).default(""),
  horaFim: z.string().max(5).default(""),
  local: z.string().max(200).default(""),
  pauta: z.string().max(5000).default(""),
  participantes: z.array(ParticipanteSchema).max(80).default([]),
});

export const criarReuniao = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((i: unknown) => CriarInput.parse(i))
  .handler(async ({ context, data }) => {
    const quem = nomeDe(context.claims);
    const agora = new Date().toISOString();
    const todas = await lerTodas();
    const id = crypto.randomUUID();
    const reuniao: Reuniao = {
      id,
      grupo: data.grupo,
      numero: 0,
      titulo: data.titulo,
      data: data.data,
      horaInicio: data.horaInicio,
      horaFim: data.horaFim,
      local: data.local.trim(),
      pauta: data.pauta,
      observacoes: "",
      participantes: data.participantes as Participante[],
      itens: [],
      status: "agendada",
      redator: quem,
      criadaPor: quem,
      criadaEm: agora,
      atualizadaEm: agora,
      encerradaEm: null,
      encerradaPor: null,
    };
    const folderId = await ensureFolderPath(PASTA);
    await atualizarDriveJson<Reuniao>(nomeDoArquivo(id), folderId, () => reuniao);
    // O número é a posição pela data — calculado junto com as demais.
    return renumerarPorData([...todas, reuniao]).find((r) => r.id === id) as Reuniao;
  });

const ItemBase = z.object({
  tipo: z.enum(["acao", "decisao", "informe"]).optional(),
  descricao: z.string().max(4000),
  responsaveis: z.array(z.string().max(120)).max(20).optional(),
  prazo: DataIso.nullable().optional(),
  status: z.enum(["pendente", "em_andamento", "concluida", "cancelada"]).optional(),
  observacao: z.string().max(4000).optional(),
});

const OperacaoSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("dados"),
    campos: z.object({
      grupo: z.string().max(120).optional(),
      titulo: z.string().max(160).optional(),
      data: z.string().max(10).optional(),
      horaInicio: z.string().max(5).optional(),
      horaFim: z.string().max(5).optional(),
      local: z.string().max(200).optional(),
      pauta: z.string().max(5000).optional(),
      observacoes: z.string().max(8000).optional(),
      redator: z.string().max(120).optional(),
    }),
  }),
  z.object({ op: z.literal("participantes"), participantes: z.array(ParticipanteSchema).max(80) }),
  z.object({ op: z.literal("item_novo"), id: z.string().min(8).max(64), item: ItemBase }),
  z.object({
    op: z.literal("item_alterar"),
    itemId: z.string().min(1).max(64),
    campos: ItemBase.partial(),
  }),
  z.object({ op: z.literal("item_remover"), itemId: z.string().min(1).max(64) }),
  z.object({ op: z.literal("status"), status: z.enum(["agendada", "em_andamento", "encerrada"]) }),
]);

const OperarInput = z.object({
  reuniaoId: z.string().min(8).max(64),
  ops: z.array(OperacaoSchema).min(1).max(50),
});

export const operarReuniao = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((i: unknown) => OperarInput.parse(i))
  .handler(async ({ context, data }) => {
    const quem = nomeDe(context.claims);
    const folderId = await ensureFolderPath(PASTA);
    const novo = await atualizarDriveJson<Reuniao>(nomeDoArquivo(data.reuniaoId), folderId, (atual) => {
      if (!atual) throw new Error("Reunião não encontrada (talvez tenha sido excluída).");
      const agora = new Date().toISOString();
      let r = atual;
      for (const o of data.ops) r = aplicarOperacao(r, o as OperacaoAta, quem, agora);
      return r;
    });
    return novo as Reuniao;
  });

const TrazerInput = z.object({
  deReuniaoId: z.string().min(8).max(64),
  paraReuniaoId: z.string().min(8).max(64),
  itemIds: z.array(z.string().min(1).max(64)).min(1).max(100),
});

/**
 * Traz ações em aberto de uma reunião anterior para a reunião atual: cria a
 * cópia na atual (primeiro) e marca a de origem como "transferida". Se algo
 * falhar no meio, a pendência pode ficar nas duas — nunca em nenhuma.
 */
export const trazerPendencias = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((i: unknown) => TrazerInput.parse(i))
  .handler(async ({ context, data }) => {
    if (data.deReuniaoId === data.paraReuniaoId) throw new Error("Escolha uma reunião de origem diferente da atual.");
    const quem = nomeDe(context.claims);
    const folderId = await ensureFolderPath(PASTA);
    const agora = new Date().toISOString();

    const origem = (await lerTodas()).find((r) => r.id === data.deReuniaoId);
    if (!origem) throw new Error("Reunião de origem não encontrada.");
    const itens = origem.itens.filter((i) => data.itemIds.includes(i.id) && itemEmAberto(i));
    if (itens.length === 0) return { trazidos: 0 };

    let destinoNumeroEData: { numero: number; data: string } | null = null;
    const idsTrazidos: string[] = [];
    await atualizarDriveJson<Reuniao>(nomeDoArquivo(data.paraReuniaoId), folderId, (destino) => {
      if (!destino) throw new Error("Reunião atual não encontrada.");
      destinoNumeroEData = { numero: destino.numero, data: destino.data };
      const novos = [];
      for (const it of itens) {
        // Já trazido antes (clique repetido): não duplica.
        if (destino.itens.some((d) => d.origem?.reuniaoId === origem.id && d.origem.itemId === it.id)) {
          idsTrazidos.push(it.id);
          continue;
        }
        novos.push(copiaParaReuniaoNova(origem, it, quem, agora, crypto.randomUUID()));
        idsTrazidos.push(it.id);
      }
      if (novos.length === 0) return destino;
      return { ...destino, itens: [...destino.itens, ...novos], atualizadaEm: agora };
    });

    const dest = destinoNumeroEData as { numero: number; data: string } | null;
    await atualizarDriveJson<Reuniao>(nomeDoArquivo(origem.id), folderId, (atual) => {
      if (!atual) return null;
      return {
        ...atual,
        atualizadaEm: agora,
        itens: atual.itens.map((i) =>
          idsTrazidos.includes(i.id) && itemEmAberto(i)
            ? {
                ...i,
                status: "transferida" as const,
                transferidaPara: {
                  reuniaoId: data.paraReuniaoId,
                  reuniaoNumero: dest?.numero ?? 0,
                  reuniaoData: dest?.data ?? "",
                },
              }
            : i,
        ),
      };
    });
    return { trazidos: idsTrazidos.length };
  });

const ExcluirInput = z.object({ reuniaoId: z.string().min(8).max(64) });

export const excluirReuniao = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((i: unknown) => ExcluirInput.parse(i))
  .handler(async ({ context, data }) => {
    const todas = await lerTodas();
    const r = todas.find((x) => x.id === data.reuniaoId);
    if (!r) return { ok: true };
    const quem = nomeDe(context.claims);
    const pode = context.role === "admin" || context.role === "gestor" || r.criadaPor === quem;
    if (!pode) throw new Error("Sem permissão: só quem criou a reunião, gestor ou administrador exclui.");
    const folderId = await ensureFolderPath(PASTA);
    for (let i = 0; i < 10; i++) {
      const fileId = await findFileInFolder(nomeDoArquivo(data.reuniaoId), folderId);
      if (!fileId) break;
      await deleteDriveFile(fileId);
    }
    return { ok: true };
  });
