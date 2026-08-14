import { createFileRoute } from "@tanstack/react-router";
import { MEspAWorkspace, PendenciasCard } from "@/features/mesp-natural/ui";

export const Route = createFileRoute("/_app/relatorio/digitalizacao/pendencias")({
  ssr: false,
  component: DigitalizacaoPendenciasPage,
});

function DigitalizacaoPendenciasPage() {
  return (
    <MEspAWorkspace
      source={(onIdentified) => (
        <PendenciasCard onPick={(p, id) => onIdentified(id, p.id)} />
      )}
    />
  );
}