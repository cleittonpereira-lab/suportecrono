import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  BarChart3,
  TrafficCone,
  ClipboardList,
  Activity,
  FilePlus,
  AlertTriangle,
  ListOrdered,
  PackageSearch,
  Sparkles,
  PieChart,
  CalendarRange,
  Shield,
  ScanLine,
  FileText,
  Beaker,
  FlaskConical,
  PackagePlus,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { SuporteLogo, SuporteMark } from "@/components/suporte-logo";
import { useAuth } from "@/hooks/use-auth";
import { pathToTab } from "@/lib/tab-permissions";

type NavItem = { title: string; url: string; icon: LucideIcon; hint?: string };
type NavSection = { label: string; items: readonly NavItem[] };

const sections: readonly NavSection[] = [
  {
    label: "Visão geral",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Assistente IA", url: "/assistente", icon: Sparkles },
    ],
  },
  {
    label: "Logística",
    items: [
      { title: "Chegada de amostras", url: "/chegada-amostras", icon: PackageSearch },
      { title: "Registrar chegada", url: "/registro-amostra", icon: PackagePlus },
      { title: "Entregas", url: "/entregas", icon: PackageSearch },
    ],
  },
  {
    label: "Análises",
    items: [
      { title: "Produtividade", url: "/analises", icon: BarChart3 },
      { title: "Saturação", url: "/saturacao", icon: Activity },
      { title: "Gestão de entregas", url: "/gestao", icon: TrafficCone },
      { title: "Cadastro de OS", url: "/cadastro?tab=indicadores", icon: PieChart },
    ],
  },
  {
    label: "Ordens de serviço",
    items: [
      { title: "Painel de OS", url: "/ordens-servico", icon: ListOrdered },
      { title: "OS cadastradas", url: "/cadastro", icon: FilePlus },
    ],
  },
  {
    label: "Alertas",
    items: [],
  },
  {
    label: "PROGRAMAÇÃO DE ENSAIOS\nLABORATÓRIO ESPECIAIS",
    items: [
      { title: "Visão geral", url: "/programacao", icon: CalendarRange },
      { title: "Central de programação", url: "/programacao/central", icon: ClipboardList },
      { title: "Gantt de execução", url: "/programacao/gantt", icon: CalendarRange },
      { title: "Dashboard operacional", url: "/programacao/dashboard", icon: LayoutDashboard },
      { title: "Leitor QR (mobile)", url: "/programacao/scan", icon: ScanLine },
    ],
  },
  {
    label: "RELATÓRIO",
    items: [
      { title: "Central de Relatórios", url: "/relatorio/pendentes", icon: ClipboardList },
      { title: "Cisalhamento Direto", url: "/relatorio/cisalhamento-direto", icon: Beaker },
      { title: "Adensamento", url: "/relatorio/adensamento", icon: Beaker },
      { title: "Triaxial CID", url: "/relatorio/triaxial-cid", icon: FlaskConical },
      { title: "M.ESP.A Natural", url: "/relatorio/mesp-a", icon: FlaskConical },
      { title: "ASF.DAP (Densidade Aparente)", url: "/relatorio/asf-dap", icon: Beaker },
      { title: "Módulo de Resiliência", url: "/relatorio/modulo-resiliencia", icon: FlaskConical },
      { title: "Umidade Natural", url: "/relatorio/umidade-natural", icon: Beaker },
      { title: "Modelos Relatórios", url: "/modelos-relatorios", icon: FileText },
    ],
  },
  {
    label: "ENSAIOS ESPECIAIS",
    items: [
      { title: "Ensaios Especiais", url: "/relatorio/especiais", icon: Sparkles },
    ],
  },
  {
    label: "DIGITALIZAÇÃO",
    items: [
      { title: "Digitalização de Ensaios", url: "/relatorio/digitalizacao", icon: ScanLine },
    ],
  },
];

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { canAccess, role } = useAuth();
  const isActive = (url: string) =>
    url === "/" ? pathname === "/" : pathname.startsWith(url);

  // Filtra items conforme permissão + adiciona admin section para admins
  const visibleSections = sections
    .map((s) => ({ ...s, items: s.items.filter((it) => {
      if (it.url === "/modelos-relatorios") return role === "admin";
      const tab = pathToTab(it.url);
      return tab ? canAccess(tab) : true;
    }) }))
    .filter((s) => s.items.length > 0);

  const withAdmin = role === "admin"
    ? [...visibleSections, { label: "Administração", items: [
        { title: "Modelos Relatórios", url: "/modelos-relatorios", icon: FileText },
        { title: "  · Adensamento", url: "/modelos-relatorios/adensamento", icon: Beaker },
        { title: "  · Triaxial CID", url: "/modelos-relatorios/triaxial-cid", icon: FlaskConical },
        { title: "  · M.ESP.A Natural", url: "/modelos-relatorios/mesp-a-natural", icon: FlaskConical },
        { title: "  · Cisalhamento Direto", url: "/modelos-relatorios/cisalhamento-direto", icon: Beaker },
        { title: "Gestão de usuários", url: "/admin/usuarios", icon: Shield },
      ] }]
    : visibleSections;

  return (
    <Sidebar collapsible="offcanvas" variant="inset">
      <SidebarHeader>
        <div className="flex items-center px-2 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="hidden group-data-[collapsible=icon]:block">
            <SuporteMark className="h-7 w-auto text-primary" />
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <SuporteLogo />
          </div>
        </div>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent className="gap-0">
        {withAdmin.map((section, idx) => (
          <div key={section.label}>
            {idx > 0 && (
              <SidebarSeparator className="my-1 group-data-[collapsible=icon]:hidden" />
            )}
            <SidebarGroup>
              <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
                {section.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map((item) => {
                    const active = isActive(item.url);
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          tooltip={item.title}
                          className="relative h-9 rounded-md font-medium data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"
                        >
                          <Link to={item.url} search={{}}>
                            {active && (
                              <span
                                aria-hidden
                                className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary group-data-[collapsible=icon]:hidden"
                              />
                            )}
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{item.title}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/60">
        <div className="px-2 py-2 text-[10px] leading-tight text-muted-foreground group-data-[collapsible=icon]:hidden">
          <div className="font-semibold text-foreground/80">
            SuporteINFRA · Laboratório
          </div>
          <div>Plataforma interna de gestão · v1.0</div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}