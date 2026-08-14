import { splitSetores } from "@/lib/schedule-utils";

interface Props {
  setor: string;
  size?: "xs" | "sm";
  className?: string;
}

const SETOR_STYLES: Record<string, string> = {
  Convencionais:
    "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
  Especiais:
    "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900",
  Dosagem:
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
};

const FALLBACK_STYLES = [
  "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-900",
  "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200 dark:bg-fuchsia-950/40 dark:text-fuchsia-300 dark:border-fuchsia-900",
  "bg-lime-100 text-lime-800 border-lime-200 dark:bg-lime-950/40 dark:text-lime-300 dark:border-lime-900",
];

function hashIndex(s: string, mod: number) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

function styleFor(part: string) {
  return (
    SETOR_STYLES[part] ?? FALLBACK_STYLES[hashIndex(part, FALLBACK_STYLES.length)]
  );
}

export function SetorBadges({ setor, size = "sm", className }: Props) {
  const parts = splitSetores(setor);
  const sizeCls = size === "xs" ? "text-[10px]" : "text-xs";
  if (parts.length === 0) {
    return (
      <span
        className={`inline-flex items-center rounded-md border bg-muted text-muted-foreground px-2 py-0.5 font-semibold ${sizeCls}`}
      >
        —
      </span>
    );
  }
  return (
    <div className={`inline-flex flex-wrap gap-1 ${className ?? ""}`}>
      {parts.map((p) => (
        <span
          key={p}
          className={`inline-flex items-center rounded-md border px-2 py-0.5 font-semibold ${sizeCls} ${styleFor(p)}`}
        >
          {p}
        </span>
      ))}
    </div>
  );
}