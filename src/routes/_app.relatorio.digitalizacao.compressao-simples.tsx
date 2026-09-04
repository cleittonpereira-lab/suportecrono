import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { CompressaoSimplesPendenciaEditor } from "@/features/compressao-simples/ui";

const searchSchema = z.object({ pid: z.string().optional() });

export const Route = createFileRoute("/_app/relatorio/digitalizacao/compressao-simples")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  component: CompressaoSimplesDigitacaoPage,
  head: () => ({
    meta: [
      { title: "Digitalização — Compressão Simples · Suporte INFRA" },
      { name: "description", content: "Coleta de dados de campo (dimensões do CP, umidade, curva de ruptura) para o ensaio de Compressão Simples em solo (NBR 12770), rocha (NBR 15845-5) ou dosagem/solo-cimento (NBR 12025)." },
    ],
  }),
});

function CompressaoSimplesDigitacaoPage() {
  const { pid } = useSearch({ from: "/_app/relatorio/digitalizacao/compressao-simples" });
  const navigate = useNavigate();
  return (
    <CompressaoSimplesPendenciaEditor
      pendenciaId={pid ?? null}
      onBack={() => navigate({ to: "/relatorio/digitalizacao" })}
    />
  );
}
