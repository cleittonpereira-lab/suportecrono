import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { CompressaoDiametralPendenciaEditor } from "@/features/compressao-diametral/ui";

const searchSchema = z.object({ pid: z.string().optional() });

export const Route = createFileRoute("/_app/relatorio/digitalizacao/compressao-diametral")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  component: CompressaoDiametralDigitacaoPage,
  head: () => ({
    meta: [
      { title: "Digitalização — Compressão Diametral · Suporte INFRA" },
      { name: "description", content: "Coleta de dados de campo (dimensões do CP, umidade quando aplicável, carga de ruptura) para o ensaio de tração por compressão diametral em mistura asfáltica (ASF.CD, DNER-ME 138/94) ou solo-cimento (COMP.D, DNIT 136/2010-ME)." },
    ],
  }),
});

function CompressaoDiametralDigitacaoPage() {
  const { pid } = useSearch({ from: "/_app/relatorio/digitalizacao/compressao-diametral" });
  const navigate = useNavigate();
  return (
    <CompressaoDiametralPendenciaEditor
      pendenciaId={pid ?? null}
      onBack={() => navigate({ to: "/relatorio/digitalizacao" })}
    />
  );
}
