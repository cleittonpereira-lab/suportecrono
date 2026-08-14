import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { MEspAWorkspace, type Identificacao } from "@/features/mesp-natural/ui";

export const Route = createFileRoute("/_app/modelos-relatorios/mesp-a-natural")({
  ssr: false,
  component: ModeloMEspA,
  head: () => ({
    meta: [
      { title: "Modelo · M.ESP.A Natural — Suporte INFRA" },
      {
        name: "description",
        content:
          "Modelo vivo do relatório de Massa Específica Aparente Natural com amostra fantasma para consulta administrativa.",
      },
    ],
  }),
});

const PHANTOM: Identificacao = {
  os: "OS-MODELO-000",
  amostraCodigo: "A-000 (modelo)",
  amostraDescricao: "Amostra fantasma — modelo de relatório",
  tomador: "Tomador Demonstração",
  obra: "Obra Demonstração",
  tipoEnsaioNome: "Massa Específica Aparente Natural",
  tipoEnsaioCodigo: "mesp-a",
  furo: "SP-01",
  profundidade: "1,50 – 2,00 m",
};

function PhantomAutoIdentify({
  onIdentified,
}: {
  onIdentified: (id: Identificacao, pendenciaId: string | null) => void;
}) {
  useEffect(() => {
    onIdentified(PHANTOM, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function ModeloMEspA() {
  return (
    <MEspAWorkspace
      source={(onIdentified) => <PhantomAutoIdentify onIdentified={onIdentified} />}
    />
  );
}