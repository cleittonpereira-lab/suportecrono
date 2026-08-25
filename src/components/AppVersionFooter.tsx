function formatBuildTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AppVersionFooter() {
  return (
    <div
      className="pointer-events-none fixed bottom-1 right-1.5 z-40 select-none text-[10px] leading-none text-muted-foreground/50"
      title={`Versão ${__APP_VERSION__} — build em ${formatBuildTime(__BUILD_TIME__)}`}
    >
      v{__APP_VERSION__} · {formatBuildTime(__BUILD_TIME__)}
    </div>
  );
}
