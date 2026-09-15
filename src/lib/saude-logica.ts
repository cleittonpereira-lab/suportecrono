/**
 * Saúde do servidor (Fase 6) — a parte pura: o que é uma ocorrência, quando
 * vira alerta e o texto do aviso. Gravação e checagem em saude.server.ts; a
 * checagem roda de 15 em 15 minutos (src/server/saude.plugin.ts).
 *
 * Regras combinadas com o laboratório: 5 erros OU 3 requisições lentas
 * (acima de 8 s) em 15 minutos → aviso no celular dos administradores, sem
 * repetir o mesmo alerta por 1 hora.
 */

export interface Ocorrencia {
  tipo: "erro" | "lenta";
  /** Caminho da requisição (server functions aparecem como /_serverFn/…). */
  rota: string;
  ms: number;
  mensagem?: string;
  em: string;
}

export const LIMITE_LENTA_MS = 8_000;
export const JANELA_MIN = 15;
export const LIMITE_ERROS = 5;
export const LIMITE_LENTAS = 3;
export const INTERVALO_ALERTA_MIN = 60;
const GUARDAR_HORAS = 24;
const MAX_OCORRENCIAS = 500;

/** Mantém só as últimas 24 h, no máximo 500 — um documento só, sem faxina. */
export function aparar(lista: Ocorrencia[], agora = new Date()): Ocorrencia[] {
  const limite = new Date(agora.getTime() - GUARDAR_HORAS * 3600_000).toISOString();
  return lista.filter((o) => o.em >= limite).slice(-MAX_OCORRENCIAS);
}

/** "/_serverFn/4852246c57b6…" → "/_serverFn/4852246c…" (o hash inteiro não diz nada a ninguém). */
export function rotaCurta(rota: string): string {
  const m = /^\/_serverFn\/([0-9a-f]{8})[0-9a-f]*/.exec(rota);
  return m ? `/_serverFn/${m[1]}…` : rota.slice(0, 80);
}

export interface AvaliacaoDeSaude {
  erros: number;
  lentas: number;
  resumo: string;
  alerta: { titulo: string; corpo: string } | null;
}

export function avaliarSaude(ocorrencias: Ocorrencia[], agora = new Date()): AvaliacaoDeSaude {
  const desde = new Date(agora.getTime() - JANELA_MIN * 60_000).toISOString();
  const recentes = ocorrencias.filter((o) => o.em >= desde);
  const erros = recentes.filter((o) => o.tipo === "erro");
  const lentas = recentes.filter((o) => o.tipo === "lenta");
  const resumo = `${erros.length} erro(s) e ${lentas.length} requisição(ões) lenta(s) nos últimos ${JANELA_MIN} min`;

  if (erros.length >= LIMITE_ERROS) {
    const ultimo = erros[erros.length - 1];
    return {
      erros: erros.length,
      lentas: lentas.length,
      resumo,
      alerta: {
        titulo: "Servidor com falhas",
        corpo: `${resumo}. Última: ${rotaCurta(ultimo.rota)} — ${(ultimo.mensagem ?? "sem mensagem").slice(0, 120)}`,
      },
    };
  }
  if (lentas.length >= LIMITE_LENTAS) {
    const pior = lentas.reduce((a, b) => (b.ms > a.ms ? b : a));
    return {
      erros: erros.length,
      lentas: lentas.length,
      resumo,
      alerta: {
        titulo: "Servidor lento",
        corpo: `${resumo}. A mais lenta: ${(pior.ms / 1000).toFixed(1).replace(".", ",")} s em ${rotaCurta(pior.rota)}.`,
      },
    };
  }
  return { erros: erros.length, lentas: lentas.length, resumo, alerta: null };
}

/** O último alerta já passou de 1 hora (ou nunca houve)? */
export function podeAlertarDeNovo(ultimoAlertaEm: string | null, agora = new Date()): boolean {
  if (!ultimoAlertaEm) return true;
  const t = Date.parse(ultimoAlertaEm);
  return Number.isNaN(t) || agora.getTime() - t >= INTERVALO_ALERTA_MIN * 60_000;
}
