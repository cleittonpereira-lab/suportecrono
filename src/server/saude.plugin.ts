/**
 * Plugin do nitro: checagem de saúde do servidor de 15 em 15 minutos (Fase 6),
 * pelo agendamento do Cloudflare (Cron Trigger em vite.config.ts). Avisa os
 * administradores no celular quando há falhas ou lentidão — ver
 * src/lib/saude.server.ts.
 */
import { verificarSaude } from "../lib/saude.server";

export const CRON_SAUDE = "*/15 * * * *";

type EventoAgendado = { controller?: { cron?: string } };
type AppNitro = { hooks: { hook(nome: string, fn: (evento: EventoAgendado) => unknown): void } };

export async function aoDisparoDaSaude(evento: EventoAgendado): Promise<void> {
  if (evento.controller?.cron !== CRON_SAUDE) return;
  try {
    const r = await verificarSaude();
    console.log(`[saude] ${r.resumo}${r.alertou ? " — alerta enviado aos administradores" : ""}`);
  } catch (err) {
    console.error("[saude] Checagem falhou:", err);
  }
}

export default function saude(nitroApp: AppNitro): void {
  nitroApp.hooks.hook("cloudflare:scheduled", aoDisparoDaSaude);
}
