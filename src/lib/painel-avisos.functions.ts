/**
 * Avisos do Painel do coordenador — as preferências de cada pessoa e o
 * "receber o resumo agora". Só para administradores e quem tem a permissão
 * do painel. Envio e agenda em painel-avisos.server.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirLogin } from "@/integrations/supabase/auth-middleware";
import type { Preferencias } from "./painel-avisos-logica";

async function exigirAcessoAoPainel(): Promise<string> {
  // Import dinâmico: módulo só de servidor (este arquivo é alcançável pelo navegador).
  const { getSessionUserRecord } = await import("@/lib/auth-session.server");
  const u = await getSessionUserRecord();
  const temAcesso = !!u && u.status === "ativo" && (u.role === "admin" || (u.tabs ?? []).includes("painel_coordenador"));
  if (!u || !temAcesso) throw new Error("Os avisos do painel são para administradores e quem tem o Painel do coordenador.");
  return u.id;
}

export const minhasPreferenciasDoPainel = createServerFn({ method: "GET" })
  .middleware([exigirLogin])
  .handler(async (): Promise<Preferencias> => {
    const id = await exigirAcessoAoPainel();
    const { preferenciasDe } = await import("./painel-avisos.server");
    return preferenciasDe(id);
  });

export const salvarMinhasPreferenciasDoPainel = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((v: unknown) => z.object({ resumo: z.boolean(), risco: z.boolean() }).parse(v))
  .handler(async ({ data }): Promise<Preferencias> => {
    const id = await exigirAcessoAoPainel();
    const { salvarPreferencias } = await import("./painel-avisos.server");
    await salvarPreferencias(id, data);
    return data;
  });

/** Monta o resumo agora e manda só para os aparelhos de quem pediu (a prévia volta sempre). */
export const receberResumoAgora = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .handler(async () => {
    const id = await exigirAcessoAoPainel();
    const { enviarResumoPara } = await import("./painel-avisos.server");
    return enviarResumoPara(id);
  });
