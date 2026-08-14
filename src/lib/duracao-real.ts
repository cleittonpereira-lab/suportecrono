/**
 * Helpers para calcular e formatar a "Duração Real" de um ensaio.
 *
 * A grade da Programação salva apenas a DATA de início/fim reais
 * (`data_inicio_real`, `data_fim_real`). Para tarefas que começam e
 * terminam no mesmo dia isso força a leitura de "1 dia" mesmo quando
 * o ensaio durou 2 horas. Passamos a persistir também um timestamp
 * ISO completo (`inicio_real_ts`, `fim_real_ts`) no momento em que
 * o operador marca início/término, para poder mostrar horas.
 */

export function nowIsoTs(): string {
  return new Date().toISOString();
}

export function computeDurRealHours(
  iniTs?: string | null,
  fimTs?: string | null,
): number | null {
  if (!iniTs || !fimTs) return null;
  const a = Date.parse(iniTs);
  const b = Date.parse(fimTs);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return (b - a) / 3_600_000;
}

/** Formata a duração real usando timestamps quando disponíveis. */
export function formatDurReal(
  iniIso?: string | null,
  fimIso?: string | null,
  iniTs?: string | null,
  fimTs?: string | null,
): string | null {
  const h = computeDurRealHours(iniTs, fimTs);
  if (h != null) {
    if (h < 1) {
      const min = Math.max(1, Math.round(h * 60));
      return `${min} min`;
    }
    if (h < 24) {
      const v = Math.round(h * 10) / 10;
      return `${String(v).replace(".", ",")} h`;
    }
    const d = Math.floor(h / 24);
    const rem = Math.round(h - d * 24);
    return rem > 0 ? `${d}d ${rem}h` : `${d} dia(s)`;
  }
  if (iniIso && fimIso) {
    const a = new Date(iniIso + "T00:00:00").getTime();
    const b = new Date(fimIso + "T00:00:00").getTime();
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
      const days = Math.max(1, Math.round((b - a) / 86_400_000) + 1);
      return `${days} dia(s)`;
    }
  }
  return null;
}

/** Duração em dias fracionários (para médias/estatísticas). */
export function durRealDays(
  iniIso?: string | null,
  fimIso?: string | null,
  iniTs?: string | null,
  fimTs?: string | null,
): number | null {
  const h = computeDurRealHours(iniTs, fimTs);
  if (h != null) return Math.round((h / 24) * 100) / 100;
  if (iniIso && fimIso) {
    const a = new Date(iniIso + "T00:00:00").getTime();
    const b = new Date(fimIso + "T00:00:00").getTime();
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) {
      return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
    }
  }
  return null;
}