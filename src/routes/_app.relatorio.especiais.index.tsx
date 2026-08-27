import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EnsaiosEspeciaisView } from "@/features/lab/components/EnsaiosEspeciaisView";

export const Route = createFileRoute("/_app/relatorio/especiais/")({
  ssr: false,
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
  return (
    <div className="space-y-6 w-full px-4 sm:px-6 md:px-8 py-8">
      <PageHeader
        eyebrow="Suporte LAB · Acompanhamento dedicado"
        icon={Sparkles}
        title="Ensaios Especiais"
        description="Cisalhamento, Triaxiais e Adensamento — recebimento, execução, relatórios, emissões e diálogo com o cliente, tudo por OS."
      />
      <EnsaiosEspeciaisView />
    </div>
  );
}
