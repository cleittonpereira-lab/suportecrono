import { createFileRoute, redirect } from "@tanstack/react-router";

// Fundida em /relatorio/pendentes (Central de Relatórios).
export const Route = createFileRoute("/_app/relatorio/")({
  beforeLoad: () => { throw redirect({ href: "/relatorio/pendentes" }); },
});
