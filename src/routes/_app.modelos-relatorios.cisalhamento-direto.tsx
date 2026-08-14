import { createFileRoute } from "@tanstack/react-router";
import { CDPage } from "./_app.relatorio.cisalhamento-direto";

export const Route = createFileRoute("/_app/modelos-relatorios/cisalhamento-direto")({
  ssr: false,
  component: CDPage,
  head: () => ({
    meta: [
      { title: "Modelo: Cisalhamento Direto — Suporte INFRA" },
      {
        name: "description",
        content: "Espelho fiel do relatório de cisalhamento direto para consulta de modelo.",
      },
    ],
  }),
});
