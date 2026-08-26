/**
 * Cálculos de Umidade Natural — NBR 6457.
 * w [%] = (m_úmida − m_seca) / (m_seca − tara) · 100
 */
import type { MoistureCapsule } from "./types";

export function capsuleMoisturePct(c: MoistureCapsule): number | null {
  const ms = c.dry - c.tara;
  const mw = c.wet - c.dry;
  if (!(ms > 0)) return null;
  const w = (mw / ms) * 100;
  return Number.isFinite(w) ? w : null;
}

export function averageMoisturePct(caps: MoistureCapsule[]): number | null {
  const valid = caps.map(capsuleMoisturePct).filter((x): x is number => x != null);
  if (!valid.length) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/** Desvio de cada cápsula em relação à média — controle de qualidade entre determinações. */
export function moistureDeviations(caps: MoistureCapsule[]): (number | null)[] {
  const avg = averageMoisturePct(caps);
  if (avg == null) return caps.map(() => null);
  return caps.map((c) => {
    const w = capsuleMoisturePct(c);
    return w == null ? null : w - avg;
  });
}
