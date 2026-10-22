import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { CadastroOsResult } from "@/lib/cadastro.functions";

/** Aviso quando a planilha de Cadastro de OS não pôde ser lida (ou são dados de exemplo). */
export function CadastroAviso({ data }: { data: CadastroOsResult | undefined }) {
  if (!data?.aviso) return null;
  return (
    <Alert variant={data.exemplo ? "default" : "destructive"}>
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>{data.aviso}</AlertDescription>
    </Alert>
  );
}
