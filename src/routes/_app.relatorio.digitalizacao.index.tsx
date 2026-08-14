import { createFileRoute } from "@tanstack/react-router";
import { MEspAWorkspace, ScannerCard } from "@/features/mesp-natural/ui";

export const Route = createFileRoute("/_app/relatorio/digitalizacao/")({
  ssr: false,
  component: DigitalizacaoQrPage,
});

function DigitalizacaoQrPage() {
  return (
    <MEspAWorkspace
      source={(onIdentified) => <ScannerCard onIdentified={onIdentified} />}
    />
  );
}