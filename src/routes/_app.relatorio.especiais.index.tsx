import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Sparkles, LayoutDashboard, List, UploadCloud, BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnsaiosEspeciaisView } from "@/features/lab/components/EnsaiosEspeciaisView";
import { EnsaiosEspeciaisDashboard } from "@/features/lab/components/EnsaiosEspeciaisDashboard";
import { AnaliseAmostrasView } from "@/features/lab/components/AnaliseAmostrasView";
import { ProducaoView } from "@/features/lab/components/ProducaoView";

export const Route = createFileRoute("/_app/relatorio/especiais/")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
  }),
  component: EnsaiosEspeciaisPage,
  head: () => ({
    meta: [
      { title: "Ensaios Especiais — Suporte INFRA" },
      {
        name: "description",
        content: "Central de acompanhamento das OS de Cisalhamento, Triaxiais e Adensamento.",
      },
    ],
  }),
});

function EnsaiosEspeciaisPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const activeTab = search.tab ?? "lista";

  return (
    <div className="space-y-6 w-full px-4 sm:px-6 md:px-8 py-8">
      <PageHeader
        eyebrow="Suporte LAB · Acompanhamento dedicado"
        icon={Sparkles}
        title="Ensaios Especiais"
        description="Cisalhamento, Triaxiais e Adensamento — recebimento, execução, relatórios, emissões e diálogo com o cliente, tudo por OS."
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => navigate({ to: "/relatorio/especiais", search: { tab: v } })}
        className="space-y-4"
      >
        <TabsList className="flex flex-wrap h-auto justify-start gap-1 w-full bg-muted/40 p-1 border">
          <TabsTrigger value="lista" className="gap-1.5 text-xs">
            <List className="h-3.5 w-3.5" /> Lista
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="gap-1.5 text-xs">
            <LayoutDashboard className="h-3.5 w-3.5 text-indigo-600" /> Dashboard
          </TabsTrigger>
          <TabsTrigger value="analise-amostras" className="gap-1.5 text-xs">
            <UploadCloud className="h-3.5 w-3.5 text-amber-600" /> Análise de Amostras
          </TabsTrigger>
          <TabsTrigger value="producao" className="gap-1.5 text-xs">
            <BarChart3 className="h-3.5 w-3.5 text-emerald-600" /> Produção
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lista">
          <EnsaiosEspeciaisView />
        </TabsContent>
        <TabsContent value="dashboard">
          <EnsaiosEspeciaisDashboard />
        </TabsContent>
        <TabsContent value="analise-amostras">
          <AnaliseAmostrasView />
        </TabsContent>
        <TabsContent value="producao">
          <ProducaoView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
