import { ExternalLink } from "lucide-react";

export function SondButton({
  os,
  variant = "pill",
  className = "",
}: {
  os?: string;
  variant?: "pill" | "button";
  className?: string;
}) {
  if (!os) return null;
  const href = `https://sond.com.br/servicos/os-numero/${os}`;
  if (variant === "button") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent hover:text-accent-foreground ${className}`}
        title="Abrir no SOND"
      >
        <ExternalLink className="h-3 w-3" /> SOND
      </a>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent hover:text-accent-foreground ${className}`}
      title="Abrir no SOND"
    >
      SOND
    </a>
  );
}