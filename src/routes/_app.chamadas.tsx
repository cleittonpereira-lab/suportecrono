import { createFileRoute, redirect } from "@tanstack/react-router";

// Fundida em /alertas (aba "Programação de OS").
export const Route = createFileRoute("/_app/chamadas")({
  beforeLoad: () => { throw redirect({ href: "/alertas?tab=programacao" }); },
});
