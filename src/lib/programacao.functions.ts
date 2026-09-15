import { createServerFn } from "@tanstack/react-start";
import { exigirLogin, requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { atualizarStore, readStore, type DadosProgramacao } from "./programacao-store.server";
import type { PedidoImportacao, ResumoImportacao } from "./programacao-importacao";
import type { Diagnostico, ResultadoEspelho, ResultadoReparo } from "./programacao-reparo.server";

/**
 * CRUD do módulo "Programação de Ensaios".
 *
 * O app lê e grava SÓ no próprio banco (programacao_db.json, no D1), cada
 * gravação com trava. A planilha do Google virou espelho gerado pelo app — todo
 * dia de manhã e pelo botão do administrador (programacao-reparo.server.ts).
 *
 * Antes cada gravação ia também para a planilha, com as colunas na ordem dos
 * campos enviados e não na do cabeçalho, e as telas liam a planilha: o ensaio
 * importado aparecia sem tipo e sem amostra ("Ensaio • amostra").
 */

type Linha = Record<string, string>;

async function lerAba(aba: string): Promise<Linha[]> {
  const dados = (await readStore()) as DadosProgramacao;
  return dados[aba] ?? [];
}

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
    const nova = { ...data.row, id, created_at: agora, updated_at: agora } as Linha;
    await atualizarStore((d) => ({ ...d, [data.sheet]: [...(d[data.sheet] ?? []), nova] }));
    return { id };
  });

export const updateRow = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d: { sheet: string; id: string; patch: Record<string, unknown> }) => d)
  .handler(async ({ data }) => {
    let achou = false;
    await atualizarStore((d) => {
      const aba = d[data.sheet] ?? [];
      const i = aba.findIndex((r) => r.id === data.id);
      achou = i !== -1;
      if (!achou) return null;
      const nova = [...aba];
      nova[i] = { ...aba[i], ...data.patch, updated_at: new Date().toISOString() } as Linha;
      return { ...d, [data.sheet]: nova };
    });
    // Antes, não achar o registro era "ok" em silêncio — e a edição sumia.
    if (!achou) throw new Error(`Registro não encontrado em "${data.sheet}". Atualize a tela e tente de novo.`);
    return { ok: true };
  });

export const deleteRow = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d: { sheet: string; id: string }) => d)
  .handler(async ({ data }) => {
    await atualizarStore((d) => {
      const aba = d[data.sheet] ?? [];
      const restantes = aba.filter((r) => r.id !== data.id);
      return restantes.length === aba.length ? null : { ...d, [data.sheet]: restantes };
    });
    return { ok: true };
  });

/** Sem efeito desde que a planilha virou espelho (o espelho monta o cabeçalho). Mantida para as telas antigas. */
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
 * Importa os ensaios de uma planilha de OS numa gravação só: resolve os tipos
 * pelas etiquetas no servidor (com a lista de tipos do banco), reaproveita a
 * amostra que já existe e não duplica o ensaio já importado.
 */
export const importarEnsaios = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d: PedidoImportacao) => {
    if (!Array.isArray(d?.linhas) || d.linhas.length === 0) throw new Error("Nada selecionado para importar.");
    if (d.linhas.length > 2000) throw new Error("Importe no máximo 2.000 linhas por vez.");
    return d;
  })
  .handler(async ({ data }): Promise<ResumoImportacao> => {
    const { planejarImportacao } = await import("./programacao-importacao");
    let resumo!: ResumoImportacao;
    await atualizarStore((d) => {
      const r = planejarImportacao(d, data, () => crypto.randomUUID(), new Date().toISOString());
      resumo = r.resumo;
      return r.dados as DadosProgramacao;
    });
    return resumo;
  });

/* ------------------------- Reparo e espelho (admin) ------------------------ */

async function exigirAdministrador(): Promise<string> {
  // Import dinâmico: módulo só de servidor (este arquivo é alcançável pelo navegador).
  const { getSessionUserRecord } = await import("@/lib/auth-session.server");
  const u = (await getSessionUserRecord()) as { role?: string; email?: string; nome?: string; id?: string } | null;
  if (u?.role !== "admin") throw new Error("Só o administrador pode reparar a programação.");
  return u.email || u.nome || u.id || "admin";
}

/** Simula o reparo (não grava nada): o que a planilha tem, o que viria para o app, os tipos corrigidos. */
export const diagnosticarProgramacao = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d: { manterSoNoApp: boolean }) => ({ manterSoNoApp: !!d?.manterSoNoApp }))
  .handler(async ({ data }): Promise<Diagnostico> => {
    await exigirAdministrador();
    const { diagnosticar } = await import("./programacao-reparo.server");
    return diagnosticar(data);
  });

/** Aplica o reparo (com cópia do antes) e regrava a planilha como espelho. */
export const repararProgramacao = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((d: { manterSoNoApp: boolean }) => ({ manterSoNoApp: !!d?.manterSoNoApp }))
  .handler(async ({ data }): Promise<ResultadoReparo> => {
    const por = await exigirAdministrador();
    const { reparar } = await import("./programacao-reparo.server");
    return reparar(data, por);
  });

/** Regrava a planilha a partir do app agora (a mesma coisa que o agendamento diário faz). */
export const espelharPlanilhaProgramacao = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .handler(async (): Promise<ResultadoEspelho> => {
    await exigirAdministrador();
    const { espelhar } = await import("./programacao-reparo.server");
    return espelhar();
  });
