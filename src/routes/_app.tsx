import { createFileRoute, Outlet, useRouterState, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { RefreshCw, ArrowLeft } from "lucide-react";
import { useSchedule } from "@/hooks/use-schedule";
import { fetchSchedule } from "@/lib/sheets.functions";
import { ThemeToggle } from "@/components/theme-toggle";
import { AiAssistantFloating } from "@/components/ai-assistant-floating";
import { SectionNav, useCurrentSection } from "@/components/section-nav";
import { UserMenu } from "@/components/user-menu";
import { useAuth } from "@/hooks/use-auth";
import { pathToTab } from "@/lib/tab-permissions";
import { Loader2 } from "lucide-react";
import { SuporteLogo } from "@/components/suporte-logo";
import { Link } from "@tanstack/react-router";

const PAGE_META: Record<string, { title: string; subtitle?: string }> = {
  "/": { title: "Dashboard", subtitle: "Visão geral das entregas" },
  "/assistente": { title: "Assistente IA", subtitle: "Pergunte sobre seus dados" },
  "/entregas": { title: "Cronograma", subtitle: "Tabela e calendário de entregas" },
  "/criar-entrega": { title: "Nova entrega", subtitle: "Registrar entregas no cronograma" },
  "/pendentes": { title: "Pendentes", subtitle: "Entregas sem data de postagem" },
  "/entregues": { title: "Histórico de entregas", subtitle: "OS já entregues" },
  "/analises": { title: "Produtividade", subtitle: "Análises operacionais" },
  "/saturacao": { title: "Saturação", subtitle: "Carga por setor" },
  "/gestao": { title: "Gestão de entregas", subtitle: "Faróis e prazos" },
  "/cadastro-dashboard": { title: "Cadastro de OS", subtitle: "Indicadores da carteira" },
  "/ordens-servico": { title: "Painel de OS", subtitle: "Tudo por ordem de serviço" },
  "/cadastro": { title: "OS cadastradas", subtitle: "Base de ordens de serviço" },
  "/programacao": { title: "Programação de ensaios", subtitle: "Módulo estilo Microsoft Project" },
  "/programacao/equipamentos": { title: "Equipamentos", subtitle: "Cadastro dos equipamentos" },
  "/programacao/tipos-ensaio": { title: "Tipos de ensaio", subtitle: "Catálogo, tempos e dependências" },
};

function usePageMeta() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const match = PAGE_META[pathname] ??
    Object.entries(PAGE_META)
      .filter(([k]) => k !== "/" && pathname.startsWith(k))
      .sort((a, b) => b[0].length - a[0].length)[0]?.[1];
  return match ?? { title: "Suporte INFRA" };
}

export const Route = createFileRoute("/_app")({
  loader: async ({ context }) => {
    // We intentionally don't await/ensureQueryData here to avoid blocking SSR
    // when the Sheets gateway is slow. The client-side useQuery will handle
    // the fetch and show the loading state.
  },
  component: AppLayout,
});

function AppLayout() {
  const { dataUpdatedAt, isFetching, refetch } = useSchedule();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const meta = usePageMeta();
  const section = useCurrentSection();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === "/" || pathname === "/dashboard";
  const nav = useNavigate();
  const { loading, user, profile, isGuest, canAccess } = useAuth();

  const isPublicModel = pathname.startsWith("/modelos-relatorios");

  // Guard: sem sessão e sem convidado → /auth
  useEffect(() => {
    if (loading || isPublicModel) return;
    if (!user && !isGuest) {
      nav({ to: "/auth", replace: true });
      return;
    }
    if (user && profile?.status === "pendente") {
      nav({ to: "/pendente", replace: true });
      return;
    }
    // Guard de aba
    const tab = pathToTab(pathname);
    if (tab && !canAccess(tab)) {
      if (pathname !== "/entregas" && pathname !== "/") {
        nav({ to: "/entregas", replace: true });
      }
    }
  }, [loading, user, profile, isGuest, pathname, canAccess, nav, isPublicModel]);

  if ((loading && !isPublicModel) || (!user && !isGuest && !isPublicModel)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const goBack = () => {
    // Comporta-se como o botão "voltar" do navegador: retorna à página
    // anterior no histórico. Se não houver histórico (aba nova / deep link),
    // cai para a Central de Programação como default seguro.
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      router.navigate({ to: "/programacao/central" });
    }
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <div className="sticky top-0 z-10 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          {/* Mobile: stacked rows for breathing room; Desktop: single row */}
          <div className="flex flex-col md:flex-row md:items-stretch md:gap-3 px-3 md:px-6">
            <div className="flex items-center gap-2 py-2 md:py-0">
              <SidebarTrigger className="h-8 w-8 shrink-0 self-center text-muted-foreground hover:text-foreground hidden md:inline-flex" />
              <Link
                to="/dashboard"
                search={{}}
                className="shrink-0 flex items-center md:py-2"
                aria-label="Suporte INFRA — início"
              >
                <SuporteLogo className="h-8 md:h-12 w-auto" />
              </Link>
              {!isHome && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={goBack}
                  className="h-8 w-8 shrink-0 self-center text-muted-foreground hover:text-foreground"
                  title="Voltar"
                  aria-label="Voltar"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              {/* Mobile-only action cluster, pushed right */}
              <div className="ml-auto flex items-center gap-1 md:hidden">
                {(profile?.nome || user?.email) && (
                  <span className="text-[11px] text-muted-foreground mr-1 truncate max-w-[110px]">
                    Olá, <span className="font-medium text-foreground">{profile?.nome || user?.email?.split("@")[0]}</span>
                  </span>
                )}
                <ThemeToggle />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title="Atualizar"
                >
                  <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                </Button>
                <UserMenu />
              </div>
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="hidden md:flex h-9 items-center justify-end gap-2">
                {(profile?.nome || user?.email) && (
                  <span className="text-xs text-muted-foreground mr-1">
                    Olá, <span className="font-medium text-foreground">{profile?.nome || user?.email?.split("@")[0]}</span>
                  </span>
                )}
                <div className="hidden md:flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      isFetching ? "bg-primary animate-pulse" : "bg-emerald-500/70"
                    }`}
                  />
                  <span className="tabular-nums">
                    {mounted && dataUpdatedAt
                      ? new Date(dataUpdatedAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </span>
                </div>
                <ThemeToggle />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title="Atualizar"
                >
                  <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                </Button>
                <div className="ml-1"><UserMenu /></div>
              </div>
              <div className="flex-1 min-h-0 pb-1 md:pb-0">
                <SectionNav />
              </div>
            </div>
          </div>
        </div>
        <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden">
          <Outlet />
        </main>
        <AiAssistantFloating />
      </SidebarInset>
    </SidebarProvider>
  );
}