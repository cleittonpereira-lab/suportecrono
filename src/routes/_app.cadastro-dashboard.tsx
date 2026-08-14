import { createFileRoute, redirect } from "@tanstack/react-router";

// Fundida em /cadastro (aba "Indicadores"). Mantém a URL antiga funcional.
export const Route = createFileRoute("/_app/cadastro-dashboard")({
  beforeLoad: () => {
    throw redirect({ href: "/cadastro?tab=indicadores" });
  },
});
