/**
 * Número da revisão a gerar, decidido pelo SERVIDOR (lib/revisoes-regra.ts).
 *
 * Cada tela numerava pelo histórico guardado no navegador. Em outro computador,
 * ou depois de apagar versões ali, o número voltava para trás e batia numa
 * revisão existente — às vezes aprovada. E um reenvio depois de uma devolução
 * virava outra revisão. O servidor reaproveita a revisão que ainda não foi
 * aprovada e só abre outra depois da aprovação.
 *
 * `local` (o que o navegador acha) só vale quando o servidor não responde.
 */
import { toast } from "sonner";
import { getProximaRevisao } from "./driveSync.functions";

export async function numeroDaProximaRevisao(scopeId: string, local: number): Promise<number> {
  try {
    const { proxima } = await getProximaRevisao({ data: { scopeId } });
    if (proxima != null) return proxima;
  } catch (err) {
    console.warn("[revisão] Falha ao consultar a próxima revisão no servidor:", err);
  }
  toast.warning(
    "Não foi possível confirmar no servidor as revisões já emitidas; a numeração usa só o histórico deste computador.",
  );
  return local;
}
