import { createFileRoute, Outlet, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { UserMenu } from "@/components/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { SectionNav } from "@/components/section-nav";
import { usePageMeta } from "@/hooks/use-page-meta";
import { useCurrentSection } from "@/hooks/use-current-section";
import { useSchedule } from "@/hooks/use-schedule";
import { useAuth } from "@/hooks/use-auth";
import { pathToTab } from "@/lib/tab-permissions";

export const Route = createFileRoute("/_app")({
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

  // Guard: sem sessão e sem convidado → /auth
  useEffect(() => {
    if (loading) return;
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
  }, [loading, user, profile, isGuest, pathname, canAccess, nav]);

  if (loading || (!user && !isGuest)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const goBack = () => {
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
          <header className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              {!isHome && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={goBack}
                  title="Voltar para a página anterior"
                  aria-label="Voltar para a página anterior"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              {meta.title && (
                <div>
                  <h1 className="text-base font-semibold leading-none">{meta.title}</h1>
                  {meta.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
                      {meta.description}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {mounted && dataUpdatedAt > 0 && (
                <div className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground border border-border/60 rounded-md px-2.5 py-1 bg-muted/30">
                  <span>Atualizado: {new Date(dataUpdatedAt).toLocaleTimeString("pt-BR")}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 hover:bg-transparent"
                    onClick={() => refetch()}
                    disabled={isFetching}
                    title="Atualizar dados da planilha agora"
                  >
                    <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              )}
              <ThemeToggle />
              <UserMenu />
            </div>
          </header>

          {section && <SectionNav section={section} />}
        </div>

        <main className="flex-1">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
