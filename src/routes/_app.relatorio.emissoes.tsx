import { createFileRoute } from "@tanstack/react-router";
import { EmissoesInner } from "@/components/emissoes-inner";

export const Route = createFileRoute("/_app/relatorio/emissoes")({
  ssr: false,
  component: EmissoesPage,
});

function EmissoesPage() {
  return <EmissoesInner />;
}
