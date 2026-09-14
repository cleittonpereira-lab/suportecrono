/**
 * Central de Cápsulas — pesagens de umidade (inicial / tara / final).
 *
 * Fluxo típico:
 *   1. Operador A pesa a cápsula com solo úmido e registra `peso_inicial` +
 *      número. (opcional: tara já conhecida da cápsula seca vazia)
 *   2. No dia seguinte, Operador B procura a cápsula pelo número, o sistema
 *      lista TODAS as pendentes com aquele número (sem `peso_final`), e o
 *      operador escolhe a correta e digita `peso_final`.
 *
 * Um documento por cápsula na pasta de dados `lab-capsulas` (no banco D1
 * quando ligado). Antes ficavam na tabela `lab_capsulas` do Supabase antigo,
 * fora do ar desde 25/08 — a tela não gravava nem listava. Cada registro tem os
 * mesmos campos da tabela, então a tela não muda.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth, exigirLogin } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { atualizarDriveJson, deleteDriveFile, ensureFolderPath, findFileInFolder, lerJsonsDaPasta, writeDriveJson } from "@/lib/driveStorage";

export const FOLDER_CAPSULAS = ["lab-capsulas"];

export type Capsula = {
  id: string;
  numero: string;
  os: string | null;
  amostra: string | null;
  tipo_ensaio: string | null;
  ensaio_codigo: string | null;
  determinacao: string | null;
  peso_inicial: number | null;
  peso_tara: number | null;
  peso_final: number | null;
  data_inicial: string | null;
  data_tara: string | null;
  data_final: string | null;
  operador_inicial_id: string | null;
  operador_inicial_nome: string | null;
  operador_final_id: string | null;
  operador_final_nome: string | null;
  pendencia_id: string | null;
  observacoes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const nomeDoArquivo = (id: string) => `${id}.json`;

/** Campos que a tela pode alterar direto; id e datas de criação ficam de fora. */
const CAMPOS_EDITAVEIS = new Set<keyof Capsula>([
  "numero",
  "os",
  "amostra",
  "tipo_ensaio",
  "ensaio_codigo",
  "determinacao",
  "peso_inicial",
  "peso_tara",
  "peso_final",
  "data_inicial",
  "data_tara",
  "data_final",
  "operador_inicial_nome",
  "operador_final_nome",
  "pendencia_id",
  "observacoes",
]);

const CriarInput = z.object({
  numero: z.string().min(1),
  os: z.string().nullable().optional(),
  amostra: z.string().nullable().optional(),
  tipo_ensaio: z.string().nullable().optional(),
  ensaio_codigo: z.string().nullable().optional(),
  determinacao: z.string().nullable().optional(),
  peso_inicial: z.number().nullable().optional(),
  peso_tara: z.number().nullable().optional(),
  // Pendências hoje têm id em texto (os__amostra__ensaio), não UUID.
  pendencia_id: z.string().nullable().optional(),
  observacoes: z.string().nullable().optional(),
  operador_nome: z.string().nullable().optional(),
});

export const criarCapsula = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((i: unknown) => CriarInput.parse(i))
  .handler(async ({ context, data }): Promise<Capsula> => {
    const now = new Date().toISOString();
    const capsula: Capsula = {
      id: crypto.randomUUID(),
      numero: data.numero.trim(),
      os: data.os ?? null,
      amostra: data.amostra ?? null,
      tipo_ensaio: data.tipo_ensaio ?? null,
      ensaio_codigo: data.ensaio_codigo ?? null,
      determinacao: data.determinacao ?? null,
      peso_inicial: data.peso_inicial ?? null,
      peso_tara: data.peso_tara ?? null,
      peso_final: null,
      data_inicial: data.peso_inicial != null ? now : null,
      data_tara: data.peso_tara != null ? now : null,
      data_final: null,
      operador_inicial_id: context.userId,
      operador_inicial_nome: data.operador_nome ?? null,
      operador_final_id: null,
      operador_final_nome: null,
      pendencia_id: data.pendencia_id ?? null,
      observacoes: data.observacoes ?? null,
      created_by: context.userId,
      created_at: now,
      updated_at: now,
    };
    await writeDriveJson(nomeDoArquivo(capsula.id), capsula, await ensureFolderPath(FOLDER_CAPSULAS));
    return capsula;
  });

const AtualizarFinalInput = z.object({
  id: z.string().uuid(),
  peso_final: z.number(),
  peso_tara: z.number().nullable().optional(),
  operador_nome: z.string().nullable().optional(),
});

export const registrarPesagemFinal = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((i: unknown) => AtualizarFinalInput.parse(i))
  .handler(async ({ context, data }): Promise<Capsula> => {
    const now = new Date().toISOString();
    const folderId = await ensureFolderPath(FOLDER_CAPSULAS);
    const row = await atualizarDriveJson<Capsula>(nomeDoArquivo(data.id), folderId, (atual) => {
      if (!atual) throw new Error("Cápsula não encontrada.");
      return {
        ...atual,
        peso_final: data.peso_final,
        data_final: now,
        operador_final_id: context.userId,
        operador_final_nome: data.operador_nome ?? null,
        ...(data.peso_tara != null ? { peso_tara: data.peso_tara, data_tara: now } : {}),
        updated_at: now,
      };
    });
    return row as Capsula;
  });

const AtualizarInput = z.object({
  id: z.string().uuid(),
  patch: z.record(z.string(), z.any()),
});

export const atualizarCapsula = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((i: unknown) => AtualizarInput.parse(i))
  .handler(async ({ data }): Promise<Capsula> => {
    const patch = Object.fromEntries(
      Object.entries(data.patch).filter(([campo]) => CAMPOS_EDITAVEIS.has(campo as keyof Capsula)),
    );
    const folderId = await ensureFolderPath(FOLDER_CAPSULAS);
    const row = await atualizarDriveJson<Capsula>(nomeDoArquivo(data.id), folderId, (atual) => {
      if (!atual) throw new Error("Cápsula não encontrada.");
      return { ...atual, ...patch, updated_at: new Date().toISOString() };
    });
    return row as Capsula;
  });

const RemoverInput = z.object({ id: z.string().uuid() });
export const removerCapsula = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((i: unknown) => RemoverInput.parse(i))
  .handler(async ({ data }) => {
    const folderId = await ensureFolderPath(FOLDER_CAPSULAS);
    const fileId = await findFileInFolder(nomeDoArquivo(data.id), folderId);
    if (fileId) await deleteDriveFile(fileId);
    return { ok: true };
  });

export const listarCapsulas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<Capsula[]> => {
    const folderId = await ensureFolderPath(FOLDER_CAPSULAS);
    return (await lerJsonsDaPasta<Capsula>(folderId))
      .map((l) => l.data)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 2000);
  });
