import { createFileRoute } from "@tanstack/react-router";
import { EnsaioListByType } from "@/features/lab/components/EnsaioListByType";
import { FlaskConical } from "lucide-react";

export const Route = createFileRoute("/_app/relatorio/mesp-a-natural")({
  component: MEspANaturalListRoute,
  head: () => ({
    meta: [
      { title: "M.ESP.A · Natural — Suporte INFRA" },
      {
        name: "description",
        content: "Lista de ensaios de Massa Específica Aparente Natural (NBR 16867:2020).",
      },
    ],
  }),
});

function MEspANaturalListRoute() {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground px-6 pt-6">
        <FlaskConical className="h-4 w-4" /> M.ESP.A · Massa Específica Aparente Natural
      </div>
      <EnsaioListByType tipo="mesp-a" />
    </div>
  );
}