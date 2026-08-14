import { exp2Str } from "../../utils/format";

/** Gera ticks "redondos" para escala aritmética com `target` divisões aproximadas. */
export const niceTicks = (min: number, max: number, target = 6) => {
  if (!isFinite(min) || !isFinite(max) || max <= min) return undefined;
  const range = max - min;
  const rawStep = range / target;
  const pow = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / pow;
  let step: number;
  if (norm < 1.5) step = 1 * pow;
  else if (norm < 3) step = 2 * pow;
  else if (norm < 7) step = 5 * pow;
  else step = 10 * pow;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 1e-6; v += step) ticks.push(+v.toFixed(10));
  return ticks.length >= 2 ? ticks : undefined;
};

/** Mantém todos os ticks de um eixo com o mesmo número de casas decimais. */
export const decimalsFor = (axisMax: number) => {
  const m = Math.abs(axisMax);
  if (m <= 0.01) return 4;
  if (m <= 0.1) return 3;
  return 2;
};

export const fmtNiceTick = (axisMax: number) => {
  const d = decimalsFor(axisMax);
  return (v: number) => v.toFixed(d);
};

/** Ticks principais + secundários (2..9) para grade logarítmica "verdadeira". */
export const logTicks = (min: number, max: number) => {
  const lo = Math.floor(Math.log10(min));
  const hi = Math.ceil(Math.log10(max));
  const out: number[] = [];
  for (let p = lo; p <= hi; p++) {
    const base = Math.pow(10, p);
    out.push(base);
    if (p < hi) {
      for (let k = 2; k <= 9; k++) {
        const v = k * base;
        if (v <= Math.pow(10, hi)) out.push(v);
      }
    }
  }
  return out;
};

/** Apenas os ticks secundários (2..9 entre décadas). */
export const logMinorTicks = (min: number, max: number) => {
  const lo = Math.floor(Math.log10(min));
  const hi = Math.ceil(Math.log10(max));
  const out: number[] = [];
  for (let p = lo; p < hi; p++) {
    const base = Math.pow(10, p);
    for (let k = 2; k <= 9; k++) {
      const v = k * base;
      if (v >= min && v <= max) out.push(v);
    }
  }
  return out;
};

export const isDecade = (v: number) => {
  if (!isFinite(v) || v <= 0) return false;
  const l = Math.log10(v);
  return Math.abs(l - Math.round(l)) < 1e-9;
};

/** Formata ticks log de tensão (1, 10, 100, 1.000…) — rotula apenas décadas. */
export const fmtLogTick = (v: number) => {
  if (!isFinite(v) || v <= 0) return "";
  if (!isDecade(v)) return "";
  return v >= 1000
    ? v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })
    : String(Math.round(v));
};

/** Formata ticks log em notação científica (Cv, kv) — rotula apenas décadas. */
export const fmtLogTickSci = (v: number) => (isDecade(v) ? exp2Str(v) : "");

/** Formatter que rotula apenas o valor final da escala (eixo de permeabilidade). */
export const fmtLogTickEndOnly = (maxVal: number) => (v: number) => {
  if (!isFinite(v) || v <= 0) return "";
  return Math.abs(Math.log10(v) - Math.log10(maxVal)) < 1e-9 ? exp2Str(v) : "";
};