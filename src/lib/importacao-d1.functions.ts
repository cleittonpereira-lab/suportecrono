/**
 * Importação Drive → banco (D1), só para o administrador. A lógica está em
 * importacao-d1.server.ts; aqui ficam só as funções chamadas pela tela.
 */
import { createServerFn } from "@tanstack/react-start";
import { exigirLogin } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { RelatorioPasta, SituacaoDoBanco } from "@/lib/importacao-d1.server";
import type { RelatorioChegada } from "@/lib/chegada-fotos.server";
import type { ResultadoCopia } from "@/lib/copia-diaria.server";

async function exigirAdministrador(): Promise<void> {
  // Import dinâmico: módulo só de servidor (este arquivo é alcançável pelo navegador).
  const { getSessionUserRecord } = await import("@/lib/auth-session.server");
  const usuario = await getSessionUserRecord();
  if (usuario?.role !== "admin") throw new Error("Só o administrador pode mexer na importação dos dados.");
}

export const situacaoDoBancoD1 = createServerFn({ method: "GET" })
  .middleware([exigirLogin])
  .handler(async (): Promise<SituacaoDoBanco> => {
    await exigirAdministrador();
    const { situacaoDoBanco } = await import("@/lib/importacao-d1.server");
    return situacaoDoBanco();
  });

const ImportarInput = z.object({
  modo: z.enum(["simular", "incluir", "sincronizar"]),
  pasta: z.string().min(1),
  /** De onde continuar a pasta (ver `proximo` no relatório). */
  inicio: z.number().int().min(0).default(0),
});

export const importarDadosParaD1 = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .validator((v: unknown) => ImportarInput.parse(v))
  .handler(async ({ data }): Promise<RelatorioPasta> => {
    await exigirAdministrador();
    const { importarAlvo } = await import("@/lib/importacao-d1.server");
    return importarAlvo(data.modo, data.pasta, data.inicio);
  });

const ImagensChegadaInput = z.object({ simular: z.boolean() });

/** Tira do quadro de Chegada as imagens antigas guardadas como texto (ver chegada-fotos.server.ts). */
export const tirarImagensDoQuadroChegada = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .validator((v: unknown) => ImagensChegadaInput.parse(v))
  .handler(async ({ data }): Promise<RelatorioChegada> => {
    await exigirAdministrador();
    const { tirarImagensDoQuadro } = await import("@/lib/chegada-fotos.server");
    return tirarImagensDoQuadro(data.simular);
  });

/** Grava agora a cópia do banco no Drive (a mesma do agendamento diário). */
export const gerarCopiaDoBancoAgora = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .handler(async (): Promise<ResultadoCopia> => {
    await exigirAdministrador();
    const { gerarCopiaDoBanco } = await import("@/lib/copia-diaria.server");
    return gerarCopiaDoBanco();
  });
