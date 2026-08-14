import { createFileRoute, redirect } from "@tanstack/react-router";

// Fundida em /entregas (aba "Histórico").
export const Route = createFileRoute("/_app/entregues")({
  beforeLoad: () => { throw redirect({ href: "/entregas?tab=historico" }); },
});
