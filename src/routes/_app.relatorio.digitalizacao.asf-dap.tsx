import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { AsfDapPendenciaEditor } from "@/features/asf-dap/ui";

// Nota: `pid` aqui é `pendenciaKey(os,amostra,ensaio)` — uma string
// determinística slugificada, não um UUID (ver lab-pendencias.functions.ts).
const searchSchema = z.object({ pid: z.string().optional() });

export const Route = createFileRoute("/_app/relatorio/digitalizacao/asf-dap")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  component: AsfDapDigitacaoPage,
  head: () => ({
    meta: [
      { title: "Digitalização — Densidade Aparente (ASF.DAP) · Suporte INFRA" },
      { name: "description", content: "Coleta de dados de campo (massas / paquímetro) para o ensaio de Densidade Aparente de misturas asfálticas (DNIT 428/2022-ME)." },
    ],
  }),
});

function AsfDapDigitacaoPage() {
  const { pid } = useSearch({ from: "/_app/relatorio/digitalizacao/asf-dap" });
  const navigate = useNavigate();
  return (
    <AsfDapPendenciaEditor
      pendenciaId={pid ?? null}
      onBack={() => navigate({ to: "/relatorio/digitalizacao" })}
    />
  );
}
