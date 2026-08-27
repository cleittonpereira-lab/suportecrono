import { createFileRoute, redirect } from "@tanstack/react-router";

// Fundida em /relatorio/pendentes (aba "Por OS").
export const Route = createFileRoute("/_app/relatorio/os/")({
  beforeLoad: () => { throw redirect({ href: "/relatorio/pendentes?tab=por-os" }); },
});
