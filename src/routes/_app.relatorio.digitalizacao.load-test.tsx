import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { LoadTestPendenciaEditor } from "@/features/load-test/ui";

const searchSchema = z.object({ pid: z.string().optional() });

export const Route = createFileRoute("/_app/relatorio/digitalizacao/load-test")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  component: LoadTestDigitacaoPage,
  head: () => ({
    meta: [
      { title: "Digitalização — Point Load Test · Suporte INFRA" },
      { name: "description", content: "Coleta de dados de campo (altura, diâmetro, carga de ruptura por determinação) para o Point Load Test — Índice de Resistência à Carga Pontual de Rocha (ASTM D5731 / ISRM 2016)." },
    ],
  }),
});

function LoadTestDigitacaoPage() {
  const { pid } = useSearch({ from: "/_app/relatorio/digitalizacao/load-test" });
  const navigate = useNavigate();
  return (
    <LoadTestPendenciaEditor
      pendenciaId={pid ?? null}
      onBack={() => navigate({ to: "/relatorio/digitalizacao" })}
    />
  );
}
