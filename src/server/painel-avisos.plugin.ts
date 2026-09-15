/**
 * Plugin do nitro: avisos do Painel do coordenador no mesmo agendamento de 15
 * em 15 min da checagem de saúde — o resumo da manhã e a entrega que entrou em
 * risco ou atrasou. Ver src/lib/painel-avisos.server.ts.
 */
import { checarAvisosDoPainel } from "../lib/painel-avisos.server";
import { CRON_SAUDE } from "./saude.plugin";

type EventoAgendado = { controller?: { cron?: string } };
type AppNitro = { hooks: { hook(nome: string, fn: (evento: EventoAgendado) => unknown): void } };

export async function aoDisparoDosAvisosDoPainel(evento: EventoAgendado): Promise<void> {
  if (evento.controller?.cron !== CRON_SAUDE) return;
  try {
    console.log(`[painel-avisos] ${await checarAvisosDoPainel()}`);
  } catch (err) {
    console.error("[painel-avisos] Falhou:", err);
  }
}

export default function painelAvisos(nitroApp: AppNitro): void {
  nitroApp.hooks.hook("cloudflare:scheduled", aoDisparoDosAvisosDoPainel);
}
