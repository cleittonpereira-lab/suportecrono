import { createFileRoute, redirect } from "@tanstack/react-router";

// "Meus laudos" virou a primeira aba da Central de Relatórios (lugar único).
export const Route = createFileRoute("/_app/relatorio/meus-laudos")({
  beforeLoad: () => {
    throw redirect({ to: "/relatorio/pendentes", search: { tab: "meus-laudos" } });
  },
});
