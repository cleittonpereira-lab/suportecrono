import { createFileRoute } from "@tanstack/react-router";
import { FilaDoTecnico } from "@/features/lab/components/FilaDoTecnico";

export const Route = createFileRoute("/_app/relatorio/digitalizacao/fila")({
  ssr: false,
  component: FilaDoTecnico,
  head: () => ({
    meta: [{ title: "Minha fila — Digitalização · Suporte INFRA" }],
  }),
});
