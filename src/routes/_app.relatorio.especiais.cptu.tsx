import { createFileRoute } from "@tanstack/react-router";
import { Drill } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { CptuView } from "@/features/cptu/CptuView";

export const Route = createFileRoute("/_app/relatorio/especiais/cptu")({
  ssr: false,
  component: CptuPage,
  head: () => ({
    meta: [
      { title: "Acompanhamento de CPTu — Suporte INFRA" },
      {
        name: "description",
        content:
          "Status, pontos de controle, mapa e metragem dos CPTu, a partir do extrato da SOND.",
      },
    ],
  }),
});

function CptuPage() {
  return (
    <div className="w-full space-y-6 px-4 py-8 sm:px-6 md:px-8">
      <PageHeader
        eyebrow="Ensaios Especiais · Campo"
        icon={Drill}
        title="Acompanhamento de CPTu"
        description="Cada CPTu numa linha: status da SOND, recebimento dos dados de campo, verificação dos dados brutos, relatório, links e observações — com mapa e resumo por OS."
      />
      <CptuView />
    </div>
  );
}
