import { getFeriados } from "@/lib/schedule-utils";

/**
 * Utilitários de "dias úteis" para o módulo de Programação.
 *
 * Regra padrão: sábados, domingos e feriados (nacionais + SP + São Pedro/SP)
 * NÃO contam. Para incluí-los, passe `incluirFds = true` — usado quando o
 * usuário marca "Considerar finais de semana e feriados" ao programar.
 */

const feriadosCache = new Map<number, Map<string, string>>();
const WORKDAY_CAPACITY = 1;
const WORKLOAD_EPSILON = 0.000001;

function feriadosOf(year: number): Map<string, string> {
  let m = feriadosCache.get(year);
  if (!m) {
    m = getFeriados(year);
    feriadosCache.set(year, m);
  }
  return m;
}

function toIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addCalendarDaysIso(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toIsoLocal(d);
}

function roundWorkload(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export function normalizeDurationDays(raw: unknown, fallback = 0.25): number {
  const n = typeof raw === "string" ? Number(raw.replace(",", ".")) : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function isBusinessDayIso(iso: string): boolean {
  const d = new Date(iso + "T00:00:00");
  const wk = d.getDay();
  if (wk === 0 || wk === 6) return false;
  return !feriadosOf(d.getFullYear()).has(iso);
}

/** Se a data cair em fim de semana/feriado, avança até o próximo dia útil. */
export function nextBusinessDayIso(iso: string, incluirFds = false): string {
  if (incluirFds) return iso;
  let cur = iso;
  // safety cap
  for (let i = 0; i < 366 && !isBusinessDayIso(cur); i++) {
    cur = addCalendarDaysIso(cur, 1);
  }
  return cur;
}

/**
 * Retorna a data de FIM previsto a partir de `startIso` e duração em dias.
 * Suporta valores fracionados (2,5 → conta como 3 dias na grade do Gantt).
 * Quando `incluirFds` é false (padrão), pula sábados, domingos e feriados.
 */
export function endIsoFromDur(
  startIso: string,
  duracao: number,
  incluirFds = false,
): string {
  const dur = normalizeDurationDays(duracao);
  // Frações (0,25 / 0,5 / 0,75) cabem no mesmo dia — fim = início.
  const offset = dur <= 1 ? 0 : Math.max(0, Math.ceil(dur) - 1);
  if (incluirFds) return addCalendarDaysIso(startIso, offset);
  let cur = nextBusinessDayIso(startIso, false);
  let counted = 0;
  while (counted < offset) {
    cur = addCalendarDaysIso(cur, 1);
    if (isBusinessDayIso(cur)) counted++;
  }
  return cur;
}

/**
 * Avança `n` dias calendário e, se cair em fim de semana/feriado,
 * pula para o próximo dia útil (a menos que `incluirFds`).
 */
export function addBusinessOffsetIso(
  iso: string,
  n: number,
  incluirFds = false,
): string {
  const cal = addCalendarDaysIso(iso, n);
  return nextBusinessDayIso(cal, incluirFds);
}

/**
 * Aloca carga em dias, usando 1 como capacidade diária do equipamento.
 * Ex.: quatro ensaios de 0,25 no mesmo equipamento cabem no mesmo dia;
 * o quinto ensaio de 0,25 é empurrado para o próximo dia útil.
 */
export function allocateWorkloadOnDays(
  dayLoads: Map<string, number>,
  earliestStartIso: string,
  duracao: unknown,
  incluirFds = false,
): { inicio: string; fim: string; duracao: number } {
  const dur = normalizeDurationDays(duracao);
  const firstChunk = Math.min(dur, WORKDAY_CAPACITY);
  let remaining = dur;
  let cur = nextBusinessDayIso(earliestStartIso, incluirFds);
  let inicio: string | null = null;
  let fim = cur;

  for (let guard = 0; guard < 3660 && remaining > WORKLOAD_EPSILON; guard++) {
    const used = Math.max(0, Math.min(WORKDAY_CAPACITY, dayLoads.get(cur) ?? 0));
    const free = Math.max(0, WORKDAY_CAPACITY - used);

    if (!inicio && free + WORKLOAD_EPSILON < firstChunk) {
      cur = addBusinessOffsetIso(cur, 1, incluirFds);
      continue;
    }

    if (free > WORKLOAD_EPSILON) {
      const take = Math.min(remaining, free);
      dayLoads.set(cur, roundWorkload(used + take));
      remaining = roundWorkload(remaining - take);
      if (!inicio) inicio = cur;
      fim = cur;
    }

    if (remaining > WORKLOAD_EPSILON) {
      cur = addBusinessOffsetIso(cur, 1, incluirFds);
    }
  }

  return { inicio: inicio ?? cur, fim, duracao: dur };
}

export function nextAvailableWorkDay(
  dayLoads: Map<string, number>,
  startIso: string,
  incluirFds = false,
  duracao: unknown = 0.25,
): string {
  const required = Math.min(normalizeDurationDays(duracao), WORKDAY_CAPACITY);
  let cur = nextBusinessDayIso(startIso, incluirFds);
  for (let guard = 0; guard < 3660; guard++) {
    const used = Math.max(0, Math.min(WORKDAY_CAPACITY, dayLoads.get(cur) ?? 0));
    if (WORKDAY_CAPACITY - used + WORKLOAD_EPSILON >= required) return cur;
    cur = addBusinessOffsetIso(cur, 1, incluirFds);
  }
  return cur;
}

/** Retrocede até o dia útil anterior (ou o próprio se já for útil). */
export function prevBusinessDayIso(iso: string, incluirFds = false): string {
  if (incluirFds) return iso;
  let cur = iso;
  for (let i = 0; i < 366 && !isBusinessDayIso(cur); i++) {
    cur = addCalendarDaysIso(cur, -1);
  }
  return cur;
}

/** Subtrai N dias úteis de uma data ISO. */
export function subBusinessDaysIso(
  iso: string,
  n: number,
  incluirFds = false,
): string {
  if (incluirFds) return addCalendarDaysIso(iso, -Math.max(0, n));
  let cur = prevBusinessDayIso(iso, false);
  let counted = 0;
  while (counted < n) {
    cur = addCalendarDaysIso(cur, -1);
    if (isBusinessDayIso(cur)) counted++;
  }
  return cur;
}

/** Parse tolerante para o flag `incluir_fds` vindo do Sheets. */
export function parseIncluirFds(raw: unknown): boolean {
  if (raw === true) return true;
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "sim" || s === "yes";
}

const WORK_PERIODS: Array<[number, number]> = [
  [8, 12],
  [13, 17],
];

function atLocalHour(base: Date, hour: number): Date {
  const d = new Date(base);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function addOneCalendarDay(d: Date): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return next;
}

export const BUSINESS_DAY_MS = 8 * 60 * 60 * 1000;

/**
 * Tempo útil real entre dois timestamps, contando horas e minutos e pulando
 * sábados, domingos e feriados. Jornada padrão: 08–12h e 13–17h.
 */
export function businessElapsedMs(startIso: string | null | undefined, endIso: string | null | undefined): number {
  if (!startIso || !endIso) return NaN;
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return 0;

  let cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);

  let total = 0;
  for (let guard = 0; guard < 3660 && cur <= last; guard++) {
    const iso = toIsoLocal(cur);
    if (isBusinessDayIso(iso)) {
      for (const [fromHour, toHour] of WORK_PERIODS) {
        const periodStart = atLocalHour(cur, fromHour);
        const periodEnd = atLocalHour(cur, toHour);
        const from = Math.max(periodStart.getTime(), start.getTime());
        const to = Math.min(periodEnd.getTime(), end.getTime());
        if (to > from) total += to - from;
      }
    }
    cur = addOneCalendarDay(cur);
  }
  return total;
}