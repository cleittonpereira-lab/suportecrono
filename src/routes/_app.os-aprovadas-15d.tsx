import { createFileRoute, redirect } from "@tanstack/react-router";

// Fundida em /alertas (aba "Aprovadas (15d)").
export const Route = createFileRoute("/_app/os-aprovadas-15d")({
  beforeLoad: () => { throw redirect({ href: "/alertas?tab=aprovadas15d" }); },
});
