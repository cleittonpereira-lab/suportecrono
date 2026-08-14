import { splitEscopo, type EscopoTag } from "@/lib/schedule-utils";

export const ESCOPO_TONE: Record<EscopoTag, string> = {
  "Caracterização Comp/CBR":
    "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900",
  "Triaxiais Mec. Solos":
    "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900",
  "MR / DP":
    "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200 dark:bg-fuchsia-950/40 dark:text-fuchsia-300 dark:border-fuchsia-900",
  Adensamento:
    "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
  "Edométrico (expansão / colapso)":
    "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
  Cisalhamento:
    "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
  "MCT.C":
    "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-900",
};
const EXTRA_TONE = "bg-muted text-muted-foreground border-border";

export function EscopoBadges({
  escopo,
  size = "sm",
}: {
  escopo?: string;
  size?: "xs" | "sm";
}) {
  if (!escopo?.trim()) return null;
  const { tags, extras } = splitEscopo(escopo);
  const txt = size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5";
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t}
          className={`inline-flex items-center rounded-md border font-semibold ${ESCOPO_TONE[t]} ${txt}`}
        >
          {t}
        </span>
      ))}
      {extras.map((e, i) => (
        <span
          key={`x-${i}`}
          className={`inline-flex items-center rounded-md border font-medium ${EXTRA_TONE} ${txt}`}
        >
          {e}
        </span>
      ))}
    </div>
  );
}