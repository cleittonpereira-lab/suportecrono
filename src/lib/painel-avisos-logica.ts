/**
 * Avisos do Painel do coordenador — só lógica. O resumo da manhã e o aviso de
 * entrega que entrou em risco ou atrasou; quem recebe e quando. Envio e
 * agenda em painel-avisos.server.ts / server/painel-avisos.plugin.ts.
 */
import type { Aviso } from "./avisos-logica";
import type { LinhaPrazo, PainelModelo } from "./painel-coordenador";

/** Resumo da manhã: dias úteis, a partir das 7h de Brasília (até 12h, se a checagem das 7h falhar). */
export const RESUMO = { de: 7, ate: 12 };
/** Aviso de risco só no expediente (dias úteis, 7h–19h de Brasília). */
export const EXPEDIENTE = { de: 7, ate: 19 };
/** Mais que isso numa checagem vira um aviso só, "e mais N". */
export const MAX_AVISOS_DE_RISCO = 5;

export type Preferencias = { resumo: boolean; risco: boolean };
export const PREFERENCIAS_PADRAO: Preferencias = { resumo: true, risco: true };

export type MomentoBr = { hoje: string; hora: number; diaDaSemana: number };

/** Data, hora e dia da semana em Brasília — o agendamento do Cloudflare roda em UTC. */
export function agoraEmBrasilia(agora: Date = new Date()): MomentoBr {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(agora)
      .map((x) => [x.type, x.value]),
  );
  const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hoje: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) % 24, diaDaSemana: DIAS[p.weekday] ?? 0 };
}

const diaUtil = (m: MomentoBr) => m.diaDaSemana >= 1 && m.diaDaSemana <= 5;

export function horaDoResumo(m: MomentoBr, ultimoResumo: string | null): boolean {
  return diaUtil(m) && m.hora >= RESUMO.de && m.hora < RESUMO.ate && ultimoResumo !== m.hoje;
}

export function noExpediente(m: MomentoBr): boolean {
  return diaUtil(m) && m.hora >= EXPEDIENTE.de && m.hora < EXPEDIENTE.ate;
}

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const idDe = (prefixo: string, agora: Date) => `painel_${prefixo}_${agora.getTime().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/** O resumo da manhã: só o que pede atenção; sem nada parado, diz isso. */
export function montarResumo(m: PainelModelo, agora: Date): Aviso {
  const t = m.tiles;
  const partes: string[] = [];
  if (t.atrasadas.total) partes.push(plural(t.atrasadas.total, "entrega atrasada", "entregas atrasadas"));
  if (t.entregas7d.emRisco) partes.push(`${t.entregas7d.emRisco} em risco nos próximos 7 dias`);
  if (t.laudosParados.total) partes.push(plural(t.laudosParados.total, "laudo parado", "laudos parados"));
  if (t.aguardandoProgramacao.parados) {
    partes.push(`${plural(t.aguardandoProgramacao.parados, "ensaio", "ensaios")} sem programação há 2+ dias úteis`);
  }
  if (t.emAndamento.alemDoPrevisto) partes.push(`${t.emAndamento.alemDoPrevisto} na bancada além do previsto`);
  const gargalo = m.esteira.find((e) => e.gargalo);
  const corpo = partes.length
    ? `${partes.join(" · ")}.${gargalo ? ` Gargalo: ${gargalo.nome.toLowerCase()}.` : ""}`
    : `Nada parado. ${plural(t.emAndamento.total, "ensaio", "ensaios")} em andamento, ${plural(t.entregas7d.total, "entrega", "entregas")} nos próximos 7 dias.`;
  return { id: idDe("resumo", agora), titulo: "Bom dia — resumo do laboratório", corpo: corpo.slice(0, 240), url: "/coordenacao", criadoEm: agora.toISOString() };
}

/** OS em risco ou atraso → a situação que foi avisada. Muda quando entra em risco, atrasa ou muda a data. */
export type EstadoRiscos = Record<string, string>;
const assinatura = (p: LinhaPrazo) => `${p.situacao}|${p.entrega}`;

/**
 * O que é novo desde a última checagem. A primeira checagem (sem estado) só
 * registra — senão, no dia em que isto entra no ar, todas as OS já atrasadas
 * disparariam ao mesmo tempo.
 */
export function novosRiscos(prazos: LinhaPrazo[], anterior: EstadoRiscos | null): { avisar: LinhaPrazo[]; estado: EstadoRiscos } {
  const estado: EstadoRiscos = {};
  for (const p of prazos) if (p.situacao !== "ok") estado[p.chave] = assinatura(p);
  if (!anterior) return { avisar: [], estado };
  return { avisar: prazos.filter((p) => p.situacao !== "ok" && anterior[p.chave] !== assinatura(p)), estado };
}

export function avisoDeRisco(p: LinhaPrazo, agora: Date): Aviso {
  const titulo = p.situacao === "atraso" ? `OS ${p.os} atrasou` : `OS ${p.os} em risco`;
  const quando =
    p.situacao === "atraso"
      ? `Entrega era ${br(p.entrega)} (${plural(p.diasAtraso, "dia", "dias")} de atraso).`
      : `Entrega em ${br(p.entrega)}: ${p.motivoRisco}.`;
  const corpo = `${p.cliente ? `${p.cliente} — ` : ""}${quando} Falta: ${p.falta}.`;
  return { id: idDe(`risco_${p.chave}`, agora), titulo, corpo: corpo.slice(0, 240), url: "/coordenacao", criadoEm: agora.toISOString() };
}

export function avisoDosDemais(resto: LinhaPrazo[], agora: Date): Aviso {
  const lista = resto.map((p) => p.os).join(", ");
  return {
    id: idDe("riscos", agora),
    titulo: `E mais ${plural(resto.length, "OS", "OS")} em risco ou atraso`,
    corpo: `OS ${lista}`.slice(0, 240),
    url: "/coordenacao",
    criadoEm: agora.toISOString(),
  };
}

/** Quem recebe: conta ativa, administrador ou com a permissão do painel, e com o aviso ligado. */
export function destinatariosDoPainel(
  usuarios: { id: string; role: string; status: string; tabs?: string[] | null }[],
  preferencias: Record<string, Partial<Preferencias>>,
  tipo: keyof Preferencias,
): string[] {
  return usuarios
    .filter((u) => u.status === "ativo" && (u.role === "admin" || (u.tabs ?? []).includes("painel_coordenador")))
    .filter((u) => ({ ...PREFERENCIAS_PADRAO, ...preferencias[u.id] })[tipo])
    .map((u) => u.id);
}
