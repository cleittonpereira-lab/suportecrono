import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileText, PieChart, ListOrdered } from "lucide-react";
import { CadastroListView } from "@/components/views/cadastro-list-view";
import { CadastroDashboardView } from "@/components/views/cadastro-dashboard-view";

export const Route = createFileRoute("/_app/cadastro")({
  head: () => ({ meta: [{ title: "Cadastro de OS | Suporte INFRA" }] }),
  component: Page,
});

type TabKey = "indicadores" | "lista";

function initialTab(): TabKey {
  if (typeof window === "undefined") return "indicadores";
  const v = new URLSearchParams(window.location.search).get("tab");
  return v === "lista" ? "lista" : "indicadores";
}

function Page() {
  const [tab, setTab] = useState<TabKey>(initialTab);

  // Mantém a URL sincronizada (sem recarregar).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") !== tab) {
      url.searchParams.set("tab", tab);
      window.history.replaceState(null, "", url);
    }
  }, [tab]);

  return (
    <div className="space-y-6 w-full">
      <PageHeader
        eyebrow="Ordens de serviço · Cadastro"
        icon={FileText}
        title="Cadastro de OS"
        description={
          tab === "indicadores"
            ? "Indicadores da carteira — OS por mês, tomador, SUP e serviço"
            : "Lista completa das OS cadastradas com filtros e detalhes"
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="h-10">
          <TabsTrigger value="indicadores" className="gap-1.5">
            <PieChart className="h-3.5 w-3.5" /> Indicadores
          </TabsTrigger>
          <TabsTrigger value="lista" className="gap-1.5">
            <ListOrdered className="h-3.5 w-3.5" /> Lista
          </TabsTrigger>
        </TabsList>
        <TabsContent value="indicadores" className="mt-5">
          <CadastroDashboardView />
        </TabsContent>
        <TabsContent value="lista" className="mt-5">
          <CadastroListView />
        </TabsContent>
      </Tabs>
    </div>
  );
}