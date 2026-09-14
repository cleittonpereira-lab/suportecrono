import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { AsfTbPendenciaEditor } from "@/features/asf-tb/ui";

// Nota: `pid` aqui é `pendenciaKey(os,amostra,ensaio)` — uma string
// determinística slugificada, não um UUID (ver lab-pendencias.functions.ts).
const searchSchema = z.object({ pid: z.string().optional() });

export const Route = createFileRoute("/_app/relatorio/digitalizacao/asf-tb")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  component: AsfTbDigitacaoPage,
  head: () => ({
    meta: [
      { title: "Digitalização — Teor de Betume (ASF.TB) · Suporte INFRA" },
      {
        name: "description",
        content:
          "Coleta de dados de bancada do teor de betume (DNER-ME 053/94) e da granulometria do agregado extraído (DNIT 412/2025-ME).",
      },
    ],
  }),
});

function AsfTbDigitacaoPage() {
  const { pid } = useSearch({ from: "/_app/relatorio/digitalizacao/asf-tb" });
  const navigate = useNavigate();
  return (
    <AsfTbPendenciaEditor
      pendenciaId={pid ?? null}
      onBack={() => navigate({ to: "/relatorio/digitalizacao" })}
    />
  );
}
