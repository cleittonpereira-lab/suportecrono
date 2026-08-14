import { createFileRoute, redirect } from "@tanstack/react-router";

// Fundida em /entregas (aba "Pendentes").
export const Route = createFileRoute("/_app/pendentes")({
  beforeLoad: () => { throw redirect({ href: "/entregas?tab=pendentes" }); },
});