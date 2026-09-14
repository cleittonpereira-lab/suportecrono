/**
 * Lado do Worker do tempo real (Fase 3): acesso à sala (Durable Object) e o
 * aviso, ao fim de cada requisição, do que ela gravou no banco.
 * A sala está em src/server/sala-tempo-real.ts.
 */
import { coletandoMudancas } from "./avisos-mudanca";

type Ambiente = { SALA_TEMPO_REAL?: DurableObjectNamespace };

/** A sala única do laboratório; `null` num servidor sem o Durable Object configurado. */
export function salaTempoReal(): DurableObjectStub | null {
  const ns = (globalThis as { __env__?: Ambiente }).__env__?.SALA_TEMPO_REAL;
  if (!ns || typeof ns.idFromName !== "function") return null;
  return ns.get(ns.idFromName("laboratorio"));
}

/**
 * Roda a requisição coletando os documentos que ela gravar e, no fim, manda um
 * aviso só à sala — depois da resposta pronta (waitUntil), sem atrasar quem
 * gravou. Falha no aviso não afeta a gravação: as outras telas pegam a mudança
 * na consulta periódica.
 */
export async function comAvisosDeMudanca<T>(request: Request, next: () => Promise<T>): Promise<T> {
  const { resultado, docs } = await coletandoMudancas(next);
  if (docs.length === 0) return resultado;
  const sala = salaTempoReal();
  if (!sala) return resultado;
  const envio = sala
    .fetch("https://sala/aviso", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ docs }),
    })
    .then(() => undefined)
    .catch((err: unknown) => console.warn("[tempo-real] Aviso de mudança não enviado:", err));
  const esperarDepois = (request as Request & { waitUntil?: (p: Promise<unknown>) => void }).waitUntil;
  if (typeof esperarDepois === "function") esperarDepois(envio);
  else await envio;
  return resultado;
}
