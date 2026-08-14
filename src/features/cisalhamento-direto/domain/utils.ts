const PI = Math.PI;

export const equalTicks = (
  min: number | "auto" | undefined,
  max: number | "auto" | undefined,
  count = 6,
): number[] | undefined => {
  if (min === "auto" || max === "auto" || min == null || max == null) return undefined;
  const a = Number(min), b = Number(max);
  if (!isFinite(a) || !isFinite(b) || b <= a) return undefined;

  const range = b - a;
  const raw = range / Math.max(1, count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const s = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
  const step = s * mag;

  const decimals = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)));
  const round = (v: number) => {
    const f = Math.pow(10, decimals);
    return Math.round(v * f) / f;
  };
  const start = Math.ceil(a / step - 1e-9) * step;
  const end = Math.floor(b / step + 1e-9) * step;
  const out: number[] = [];
  for (let v = start; v <= end + 1e-9; v += step) out.push(round(v));
  if (out[0] !== round(a) && Math.abs(a - Math.round(a / step) * step) < 1e-9) out.unshift(round(a));
  return out.length ? out : undefined;
};
