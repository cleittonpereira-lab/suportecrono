import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /** Show the wordmark next to the icon. Default true. */
  withText?: boolean;
  /** Kept for backwards compatibility; no longer used. */
  accent?: boolean;
  /** Force a specific theme (e.g. 'light' for reports and printable PDFs) */
  forceTheme?: "light" | "dark" | "auto";
}

/**
 * Logomarca oficial Suporte INFRA.
 * - Na aplicação geral (auto): 'SUPORTE' fica branco no modo escuro e preto no modo claro.
 * - Em relatórios, laudos e impressões (forceTheme="light"): sempre texto preto em fundo claro.
 */
export function SuporteLogo({
  className,
  withText = true,
  forceTheme = "auto",
}: LogoProps) {
  const commonClasses = cn(
    withText ? "h-9 md:h-11 w-auto" : "h-9 w-9 object-contain object-left",
    "shrink-0 select-none",
    className,
  );

  if (forceTheme === "light") {
    return (
      <img
        src="/suporte-infra-logo.png"
        alt="Suporte INFRA"
        className={commonClasses}
        draggable={false}
      />
    );
  }

  if (forceTheme === "dark") {
    return (
      <img
        src="/suporte-infra-logo-dark.png"
        alt="Suporte INFRA"
        className={commonClasses}
        draggable={false}
      />
    );
  }

  return (
    <>
      {/* Modo Claro (texto Suporte preto/escuro) */}
      <img
        src="/suporte-infra-logo.png"
        alt="Suporte INFRA"
        className={cn(commonClasses, "dark:hidden")}
        draggable={false}
      />
      {/* Modo Escuro (texto SUPORTE branco) */}
      <img
        src="/suporte-infra-logo-dark.png"
        alt="Suporte INFRA"
        className={cn(commonClasses, "hidden dark:block")}
        draggable={false}
      />
    </>
  );
}

/** Ícone compacto marca d'água oficial da Suporte INFRA. */
export function SuporteMark({
  className,
  forceTheme = "auto",
}: {
  className?: string;
  forceTheme?: "light" | "dark" | "auto";
}) {
  if (forceTheme === "light") {
    return (
      <div className={cn("h-9 w-9 overflow-hidden flex items-center justify-start shrink-0", className)}>
        <img
          src="/suporte-infra-logo.png"
          alt="Suporte INFRA"
          className="h-9 w-auto max-w-none object-contain object-left"
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div className={cn("h-9 w-9 overflow-hidden flex items-center justify-start shrink-0", className)}>
      <img
        src="/suporte-infra-logo.png"
        alt="Suporte INFRA"
        className="h-9 w-auto max-w-none object-contain object-left dark:hidden"
        draggable={false}
      />
      <img
        src="/suporte-infra-logo-dark.png"
        alt="Suporte INFRA"
        className="h-9 w-auto max-w-none object-contain object-left hidden dark:block"
        draggable={false}
      />
    </div>
  );
}