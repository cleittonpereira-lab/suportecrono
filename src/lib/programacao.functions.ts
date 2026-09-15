import { createServerFn } from "@tanstack/react-start";
import { exigirLogin, requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { apagar, atualizar, importar, inserir, lerAba } from "./programacao-fonte.server";
import type { PedidoImportacao, ResumoImportacao } from "./programacao-importacao";
import type { Diagnostico, ResultadoArrumacao } from "./programacao-reparo.server";

/**
 * CRUD do módulo "Programação de Ensaios". A fonte é a planilha do Google
 * (aba por aba; sem ela, a cópia do app) — regras em programacao-fonte.server.ts.
 */

type Linha = Record<string, string>;

/* --------------------------------- CRUD ---------------------------------- */

export const listRows = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { sheet: string }) => d)
  .handler(async ({ data }) => lerAba(data.sheet));

export const insertRow = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d: { sheet: string; row: Record<string, unknown> }) => d)
  .handler(async ({ data }) => {
    const id = (data.row.id as string) || crypto.randomUUID();
    const agora = new Date().toISOString();
    await inserir(data.sheet, { ...data.row, id, created_at: agora, updated_at: agora } as Linha);
    return { id };
  });

export const updateRow = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d: { sheet: string; id: string; patch: Record<string, unknown> }) => d)
  .handler(async ({ data }) => {
    // Antes, não achar o registro era "ok" em silêncio — e a edição sumia.
    if (!(await atualizar(data.sheet, data.id, data.patch))) {
      throw new Error(`Registro não encontrado em "${data.sheet}". Atualize a tela e tente de novo.`);
    }
    return { ok: true };
  });

export const deleteRow = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d: { sheet: string; id: string }) => d)
  .handler(async ({ data }) => {
    await apagar(data.sheet, data.id);
    return { ok: true };
  });

/** Sem efeito: gravar um campo novo já cria a coluna no cabeçalho. Mantida para as telas antigas. */
export const ensureColumns = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d: { sheet: string; columns: string[] }) => d)
  .handler(async ({ data }) => {
    return { header: data.columns };
  });

export const listEquipamentos = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async () => lerAba("Equipamentos"));

/* ------------------------------ Importação ------------------------------- */

/**
 * Importa os ensaios de uma planilha de OS de uma vez: resolve os tipos pelas
 * etiquetas no servidor, reaproveita a amostra que já existe e não duplica o
 * ensaio já importado.
 */
export const importarEnsaios = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d: PedidoImportacao) => {
    if (!Array.isArray(d?.linhas) || d.linhas.length === 0) throw new Error("Nada selecionado para importar.");
    if (d.linhas.length > 2000) throw new Error("Importe no máximo 2.000 linhas por vez.");
    return d;
  })
  .handler(async ({ data }): Promise<ResumoImportacao> => importar(data));

/* ------------------------ Arrumar a planilha (admin) ------------------------ */

async function exigirAdministrador(): Promise<string> {
  // Import dinâmico: módulo só de servidor (este arquivo é alcançável pelo navegador).
  const { getSessionUserRecord } = await import("@/lib/auth-session.server");
  const u = (await getSessionUserRecord()) as { role?: string; email?: string; nome?: string; id?: string } | null;
  if (u?.role !== "admin") throw new Error("Só o administrador pode arrumar a planilha da programação.");
  return u.email || u.nome || u.id || "admin";
}

/** Simula a arrumação (não grava nada): linhas tortas, tipos a corrigir, o que não foi reconhecido. */
export const diagnosticarProgramacao = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .handler(async (): Promise<Diagnostico> => {
    await exigirAdministrador();
    const { diagnosticar } = await import("./programacao-reparo.server");
    return diagnosticar();
  });

/** Endireita a planilha (com cópia do antes). */
export const arrumarPlanilhaProgramacao = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .handler(async (): Promise<ResultadoArrumacao> => {
    const por = await exigirAdministrador();
    const { arrumar } = await import("./programacao-reparo.server");
    return arrumar(por);
  });
