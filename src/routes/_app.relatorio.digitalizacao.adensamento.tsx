import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { AdensPendenciaEditor } from "@/features/adens-scan/ui";

const searchSchema = z.object({ pid: z.string().uuid().optional() });

export const Route = createFileRoute("/_app/relatorio/digitalizacao/adensamento")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  component: AdensDigitacaoPage,
  head: () => ({
    meta: [
      { title: "Digitalização — Adensamento · Suporte INFRA" },
      { name: "description", content: "Coleta de dados de campo (moldagem + cápsulas iniciais) para o ensaio de Adensamento Edométrico." },
    ],
  }),
});

function AdensDigitacaoPage() {
  const { pid } = useSearch({ from: "/_app/relatorio/digitalizacao/adensamento" });
  const navigate = useNavigate();
  return (
    <AdensPendenciaEditor
      pendenciaId={pid ?? null}
      onBack={() => navigate({ to: "/relatorio/digitalizacao" })}
    />
  );
}