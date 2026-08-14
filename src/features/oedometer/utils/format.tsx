import type { ReactNode } from "react";

/** Formata número no padrão pt-BR com casas decimais fixas. */
export const fmt = (n: number | null | undefined, d = 3) =>
  n == null || !isFinite(n)
    ? "—"
    : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Notação científica com expoente sobrescrito (JSX). */
export const exp2 = (n: number | null | undefined): ReactNode => {
  if (n == null || !isFinite(n)) return "—";
  const [mant, expRaw] = n.toExponential(2).split("e");
  const mantBR = mant.replace(".", ",");
  const exp = parseInt(expRaw, 10);
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {mantBR} × 10<sup style={{ fontSize: "0.75em" }}>{exp}</sup>
    </span>
  );
};

const SUP_MAP: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "-": "⁻", "+": "⁺",
};

/** Converte cada caractere para o sobrescrito Unicode correspondente. */
export const toSup = (s: string) => s.split("").map((c) => SUP_MAP[c] ?? c).join("");

/** Notação científica em string (para tooltips/labels). */
export const exp2Str = (n: number | null | undefined): string => {
  if (n == null || !isFinite(n)) return "—";
  const [mant, expRaw] = n.toExponential(2).split("e");
  return `${mant.replace(".", ",")} × 10${toSup(String(parseInt(expRaw, 10)))}`;
};

/** Converte strings com `_x` ou `_{xxx}` em JSX com <sub>. Ex.: "Sr_f" → Sr<sub>f</sub>. */
export function subscriptify(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const re = /_\{([^}]+)\}|_([A-Za-z0-9]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <sub key={key++} style={{ fontSize: "0.75em" }}>
        {m[1] ?? m[2]}
      </sub>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : text;
}

/** Formata tempo em segundos/minutos/horas conforme magnitude. */
export const fmtTime = (t: number) =>
  t < 1 ? `${(t * 60).toFixed(0)}s` : t < 60 ? `${t}min` : `${t / 60}h`;

/** Rótulo padrão para tensão efetiva. */
export const sigmaLabel = (sigma: number) => `${fmt(sigma, 0)} kPa`;