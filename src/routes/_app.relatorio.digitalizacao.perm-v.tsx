import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { PermVPendenciaEditor } from "@/features/perm-v/ui";

const searchSchema = z.object({ pid: z.string().optional() });

export const Route = createFileRoute("/_app/relatorio/digitalizacao/perm-v")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  component: PermVDigitacaoPage,
  head: () => ({
    meta: [
      { title: "Digitalização — Permeabilidade a Carga Variável (PERM.V) · Suporte INFRA" },
      { name: "description", content: "Coleta de dados de campo (calibração da bureta, leituras de carga hidráulica) para o ensaio de Permeabilidade a Carga Variável, Método B (ABNT NBR 14545:2021)." },
    ],
  }),
});

function PermVDigitacaoPage() {
  const { pid } = useSearch({ from: "/_app/relatorio/digitalizacao/perm-v" });
  const navigate = useNavigate();
  return (
    <PermVPendenciaEditor
      pendenciaId={pid ?? null}
      onBack={() => navigate({ to: "/relatorio/digitalizacao" })}
    />
  );
}
