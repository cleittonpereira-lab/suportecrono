/**
 * Plugin do nitro: roda a cópia diária do banco no Drive quando o agendamento
 * do Cloudflare dispara (Cron Trigger configurado em vite.config.ts).
 *
 * O Worker chama o gancho `cloudflare:scheduled` a cada disparo e já mantém a
 * execução viva até a promessa terminar (waitUntil no handler do nitro).
 */
import { gerarCopiaDoBanco } from "../lib/copia-diaria.server";

/** 09:00 UTC = 06:00 em Brasília, antes do expediente. */
export const CRON_COPIA_DIARIA = "0 9 * * *";

type EventoAgendado = { controller?: { cron?: string } };
type AppNitro = { hooks: { hook(nome: string, fn: (evento: EventoAgendado) => unknown): void } };

export async function aoDisparoAgendado(evento: EventoAgendado): Promise<void> {
  if (evento.controller?.cron !== CRON_COPIA_DIARIA) return;
  try {
    const r = await gerarCopiaDoBanco();
    console.log(`[copia-diaria] ${r.arquivo}: ${r.documentos} documentos, ${Math.round(r.bytes / 1024)} KB; ${r.apagadas} cópia(s) antiga(s) apagada(s).`);
  } catch (err) {
    console.error("[copia-diaria] Falhou:", err);
  }
}

export default function copiaDiaria(nitroApp: AppNitro): void {
  nitroApp.hooks.hook("cloudflare:scheduled", aoDisparoAgendado);
}
