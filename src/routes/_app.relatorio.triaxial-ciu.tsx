import { createFileRoute } from "@tanstack/react-router";
import { EnsaioListByType } from "@/features/lab/components/EnsaioListByType";
import { FlaskConical } from "lucide-react";

export const Route = createFileRoute("/_app/relatorio/triaxial-ciu")({
  component: TriaxialCiuListRoute,
  head: () => ({
    meta: [
      { title: "Triaxial CIU — Suporte INFRA" },
      {
        name: "description",
        content:
          "Fila de ensaios triaxiais CIU (Consolidado Isotropicamente Não Drenado, ASTM D4767 / ISO 17892-9): mesmas fases de saturação/adensamento do CID, mas cisalhamento não drenado com medição de poropressão — envoltória, gráficos e cálculo próprios, diferentes do CID.",
      },
    ],
  }),
});

function TriaxialCiuListRoute() {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground px-6 pt-6">
        <FlaskConical className="h-4 w-4" /> Triaxial CIU · Consolidado Isotropicamente Não Drenado
      </div>
      <EnsaioListByType tipo="triaxial-ciu" />
    </div>
  );
}
