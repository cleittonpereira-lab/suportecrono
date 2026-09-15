/**
 * Plugin do nitro: regrava a planilha da Programação a partir do app todo dia,
 * no mesmo agendamento da cópia diária (09:00 UTC = 06:00 em Brasília). Só
 * depois do primeiro reparo feito pelo administrador — ver
 * src/lib/programacao-reparo.server.ts.
 */
import { espelharSeLiberado } from "../lib/programacao-reparo.server";
import { CRON_COPIA_DIARIA } from "./copia-diaria.plugin";

type EventoAgendado = { controller?: { cron?: string } };
type AppNitro = { hooks: { hook(nome: string, fn: (evento: EventoAgendado) => unknown): void } };

export async function aoDisparoDoEspelho(evento: EventoAgendado): Promise<void> {
  if (evento.controller?.cron !== CRON_COPIA_DIARIA) return;
  try {
    console.log(`[programacao-espelho] ${await espelharSeLiberado()}`);
  } catch (err) {
    console.error("[programacao-espelho] Falhou:", err);
  }
}

export default function programacaoEspelho(nitroApp: AppNitro): void {
  nitroApp.hooks.hook("cloudflare:scheduled", aoDisparoDoEspelho);
}
