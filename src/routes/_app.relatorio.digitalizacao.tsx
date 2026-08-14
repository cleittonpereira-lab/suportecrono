import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { ScanLine, Camera, ClipboardList, Beaker } from "lucide-react";

export const Route = createFileRoute("/_app/relatorio/digitalizacao")({
  ssr: false,
  component: DigitalizacaoLayout,
  head: () => ({
    meta: [
      { title: "Digitalização de Ensaios — Suporte INFRA" },
      {
        name: "description",
        content:
          "Digitalização de ensaios geotécnicos com leitura de QR e pendências vindas do Gantt — a partir da Massa Específica Aparente Natural (NBR 16867).",
      },
    ],
  }),
});

const TABS = [
  { to: "/relatorio/digitalizacao", label: "QR Code", icon: Camera, exact: true },
  { to: "/relatorio/digitalizacao/pendencias", label: "Pendências", icon: ClipboardList, exact: false },
  { to: "/relatorio/digitalizacao/capsulas", label: "Cápsulas", icon: Beaker, exact: false },
] as const;

function DigitalizacaoLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string, exact: boolean) =>
    exact ? pathname === to || pathname === to + "/" : pathname.startsWith(to);
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
      <PageHeader
        eyebrow="Laboratório"
        icon={ScanLine}
        title="Digitalização de Ensaios"
        description="Escaneie o QR da amostra para pré-preencher a identificação, ou acesse as pendências vindas do Gantt."
      />
      <nav className="inline-flex rounded-lg border bg-muted/40 p-1 gap-1">
        {TABS.map((t) => {
          const active = isActive(t.to, t.exact);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              className={
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors " +
                (active ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")
              }
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}