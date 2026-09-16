import { createFileRoute } from "@tanstack/react-router";
import { EnsaioListByType } from "@/features/lab/components/EnsaioListByType";
import { FlaskConical } from "lucide-react";

export const Route = createFileRoute("/_app/relatorio/triaxial-uu")({
  component: TriaxialUuListRoute,
  head: () => ({
    meta: [
      { title: "Triaxial UU — Suporte INFRA" },
      {
        name: "description",
        content:
          "Fila de ensaios triaxiais UU (Não Consolidado Não Drenado, ASTM D2850 / NBR 12770): sem fases de saturação/adensamento, cisalhamento em tensões totais — envoltória, gráficos e cálculo próprios, diferentes do CID e do CIU.",
      },
    ],
  }),
});

function TriaxialUuListRoute() {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground px-6 pt-6">
        <FlaskConical className="h-4 w-4" /> Triaxial UU · Não Consolidado Não Drenado
      </div>
      <EnsaioListByType tipo="triaxial-uu" />
    </div>
  );
}
