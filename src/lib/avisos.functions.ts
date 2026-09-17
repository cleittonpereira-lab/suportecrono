/**
 * Avisos no aparelho (Fase 5, parte 2): inscrever/cancelar este navegador,
 * saber a situação e mandar um aviso de teste para si mesmo.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirLogin, requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { endpointDePushValido } from "@/lib/avisos-logica";

const InscricaoInput = z.object({
  endpoint: z.string().max(1000).refine(endpointDePushValido, "Serviço de push não reconhecido."),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  aparelho: z.string().max(200).optional(),
});

export const inscreverAvisos = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((v: unknown) => InscricaoInput.parse(v))
  .handler(async ({ data, context }) => {
    const { inscrever } = await import("./avisos.server");
    await inscrever((context as { userId: string }).userId, data);
    return { ok: true };
  });

export const cancelarAvisos = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((v: unknown) => z.object({ endpoint: z.string().max(1000) }).parse(v))
  .handler(async ({ data, context }) => {
    const { cancelar } = await import("./avisos.server");
    await cancelar((context as { userId: string }).userId, data.endpoint);
    return { ok: true };
  });

/** Caixa de avisos da pessoa logada — usada pelo sino de notificações no cabeçalho. */
export const minhaCaixaDeAvisos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await import("./avisos.server");
    return s.minhaCaixa((context as { userId: string }).userId);
  });

export const marcarAvisosLidos = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .inputValidator((v: unknown) => z.object({ ate: z.string().min(1) }).parse(v))
  .handler(async ({ data, context }) => {
    const s = await import("./avisos.server");
    await s.marcarCaixaLida((context as { userId: string }).userId, data.ate);
    return { ok: true };
  });

export const situacaoDosAvisos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await import("./avisos.server");
    return { configurado: s.avisosConfigurados(), aparelhos: await s.quantosAparelhos((context as { userId: string }).userId) };
  });

export const enviarAvisoDeTeste = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .handler(async ({ context }) => {
    const s = await import("./avisos.server");
    if (!s.avisosConfigurados()) {
      throw new Error("O servidor ainda não tem a chave dos avisos (segredo VAPID_PRIVATE_JWK).");
    }
    const agora = new Date();
    await s.avisarPessoas([(context as { userId: string }).userId], {
      id: `teste_${agora.getTime().toString(36)}`,
      titulo: "Aviso de teste",
      corpo: "Se você está vendo isto, os avisos do Suporte Lab chegam neste aparelho.",
      url: "/perfil",
      criadoEm: agora.toISOString(),
    });
    return { ok: true };
  });
