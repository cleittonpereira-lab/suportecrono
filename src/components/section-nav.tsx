import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { pathToTab } from "@/lib/tab-permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  Sparkles,
  PackageSearch,
  BarChart3,
  Activity,
  TrafficCone,
  PieChart,
  ListOrdered,
  FilePlus,
  AlertTriangle,
  CalendarRange,
  ClipboardList,
  Wrench,
  FlaskConical,
  FileText,
  Beaker,
  ScanLine,
  Droplets,
  type LucideIcon,
} from "lucide-react";

type Tab = { title: string; url: string; icon: LucideIcon };
type Section = { key: string; label: string; match: (p: string) => boolean; tabs: readonly Tab[] };

const SECTIONS: readonly Section[] = [
  {
    key: "overview",
    label: "Visão geral",
    match: (p) => p === "/" || p.startsWith("/assistente"),
    tabs: [
      { title: "Dashboard", url: "/", icon: LayoutDashboard },
      { title: "Assistente IA", url: "/assistente", icon: Sparkles },
    ],
  },
  {
    key: "entregas",
    label: "Entregas",
    match: (p) =>
      p.startsWith("/entregas") ||
      p.startsWith("/pendentes") ||
      p.startsWith("/entregues") ||
      p.startsWith("/criar-entrega"),
    tabs: [
      { title: "Entregas", url: "/entregas", icon: PackageSearch },
    ],
  },
  {
    key: "analises",
    label: "Análises",
    match: (p) =>
      p.startsWith("/analises") ||
      p.startsWith("/saturacao") ||
      p.startsWith("/gestao") ||
      p.startsWith("/cadastro-dashboard"),
    tabs: [
      { title: "Produtividade", url: "/analises", icon: BarChart3 },
      { title: "Saturação", url: "/saturacao", icon: Activity },
      { title: "Gestão de entregas", url: "/gestao", icon: TrafficCone },
      { title: "Cadastro de OS", url: "/cadastro?tab=indicadores", icon: PieChart },
    ],
  },
  {
    key: "os",
    label: "Ordens de serviço",
    match: (p) => p.startsWith("/ordens-servico") || p === "/cadastro" || p.startsWith("/cadastro/"),
    tabs: [
      { title: "Painel de OS", url: "/ordens-servico", icon: ListOrdered },
      { title: "OS cadastradas", url: "/cadastro", icon: FilePlus },
    ],
  },
  {
    key: "alertas",
    label: "Alertas",
    match: (p) => false,
    tabs: [],
  },
  {
    key: "programacao",
    label: "Programação de ensaios",
    match: (p) => p.startsWith("/programacao"),
    tabs: [
      { title: "Visão geral", url: "/programacao", icon: CalendarRange },
      { title: "Central", url: "/programacao/central", icon: ClipboardList },
      { title: "Gantt", url: "/programacao/gantt", icon: CalendarRange },
      { title: "Dashboard", url: "/programacao/dashboard", icon: LayoutDashboard },
      { title: "Equipamentos", url: "/programacao/equipamentos", icon: Wrench },
      { title: "Tipos de ensaio", url: "/programacao/tipos-ensaio", icon: FlaskConical },
    ],
  },
  {
    key: "relatorio",
    label: "Relatório",
    match: (p) => p.startsWith("/relatorio") && !p.startsWith("/relatorio/digitalizacao") && !p.startsWith("/relatorio/especiais"),
    tabs: [
      { title: "Central de Relatórios", url: "/relatorio/pendentes", icon: ClipboardList },
      { title: "Cisalhamento Direto", url: "/relatorio/cisalhamento-direto", icon: Beaker },
      { title: "Adensamento", url: "/relatorio/adensamento", icon: Beaker },
      { title: "Triaxial CID", url: "/relatorio/triaxial-cid", icon: FlaskConical },
      { title: "M.ESP.A Natural", url: "/relatorio/mesp-a", icon: FlaskConical },
      { title: "ASF.DAP (Densidade Aparente)", url: "/relatorio/asf-dap", icon: Beaker },
      { title: "Permeabilidade Carga Variável (PERM.V)", url: "/relatorio/perm-v", icon: Droplets },
      { title: "Módulo de Resiliência", url: "/relatorio/modulo-resiliencia", icon: FlaskConical },
      { title: "Umidade Natural", url: "/relatorio/umidade-natural", icon: Beaker },
    ],
  },
  {
    key: "ensaios-especiais",
    label: "Ensaios Especiais",
    match: (p) => p.startsWith("/relatorio/especiais"),
    tabs: [
      { title: "Ensaios Especiais", url: "/relatorio/especiais", icon: Sparkles },
    ],
  },
  {
    key: "digitalizacao",
    label: "Digitalização",
    match: (p) => p.startsWith("/relatorio/digitalizacao"),
    tabs: [
      { title: "Digitalização de Ensaios", url: "/relatorio/digitalizacao", icon: ScanLine },
    ],
  },
];

export function useCurrentSection() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return SECTIONS.find((s) => s.match(pathname)) ?? null;
}

export function SectionNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { canAccess } = useAuth();

  // Filtra abas por permissão; remove seções sem nenhuma aba visível.
  const visibleSections = SECTIONS
    .map((sec) => {
      const tabs = sec.tabs.filter((t) => {
        const key = pathToTab(t.url.split("?")[0]);
        return key ? canAccess(key) : true;
      });
      return { ...sec, tabs };
    })
    .filter((sec) => sec.tabs.length > 0);

  const activeSection = visibleSections.find((s) => s.match(pathname));

  const isActive = (url: string) =>
    url === "/" ? pathname === "/" : pathname === url || pathname.startsWith(url + "/");

  return (
    <nav aria-label="Navegação principal" className="w-full overflow-x-auto scrollbar-none">
      <div className="flex items-center justify-start md:justify-center gap-0.5 flex-nowrap md:flex-wrap min-w-max md:min-w-0">
        {visibleSections.map((sec) => {
          const isSectionActive = activeSection?.key === sec.key;
          const currentTab = sec.tabs.find((t) => isActive(t.url));
          const FirstIcon = (currentTab ?? sec.tabs[0]).icon;
          return (
            <DropdownMenu key={sec.key}>
              <DropdownMenuTrigger
                className={
                  "relative inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 sm:px-3 py-2 text-[12.5px] font-medium outline-none transition-colors " +
                  (isSectionActive
                    ? "text-foreground bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60")
                }
              >
                <FirstIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline whitespace-nowrap font-display tracking-tight">
                  {sec.label}
                </span>
                {isSectionActive && currentTab && (
                  <span className="hidden md:inline text-muted-foreground/60 font-normal">
                    · {currentTab.title}
                  </span>
                )}
                <ChevronDown className="h-3 w-3 opacity-60 hidden sm:inline" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 p-1.5">
                <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                  {sec.label}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {sec.tabs.map((tab) => {
                  const active = isActive(tab.url);
                  return (
                    <DropdownMenuItem key={tab.url} asChild className="p-0">
                      <Link
                        to={tab.url}
                        className={
                          "flex w-full items-center gap-2.5 rounded-sm px-2 py-2 text-sm " +
                          (active
                            ? "bg-primary/10 text-foreground"
                            : "text-foreground/90 hover:bg-accent")
                        }
                      >
                        <span
                          className={
                            "grid h-7 w-7 shrink-0 place-items-center rounded-md " +
                            (active
                              ? "bg-primary/15 text-primary"
                              : "bg-muted/60 text-muted-foreground")
                          }
                        >
                          <tab.icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 truncate">{tab.title}</span>
                        {active && (
                          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                        )}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}
      </div>
    </nav>
  );
}