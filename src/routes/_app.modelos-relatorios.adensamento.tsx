import { createFileRoute } from "@tanstack/react-router";
import { AdensamentoPage } from "@/routes/_app.relatorio.adensamento";
import { LabEnsaioProvider, type LabEnsaioContextValue } from "@/features/lab/context";

export const Route = createFileRoute("/_app/modelos-relatorios/adensamento")({
  ssr: false,
  component: ModeloAdensamento,
  head: () => ({
    meta: [
      { title: "Modelo · Adensamento — Suporte INFRA" },
      {
        name: "description",
        content:
          "Modelo vivo do relatório de Adensamento Edométrico com amostra fantasma para consulta administrativa.",
      },
    ],
  }),
});

const NOW = "2026-01-01T00:00:00.000Z";
const PHANTOM_CTX: LabEnsaioContextValue = {
  os: {
    id: "modelo-os",
    createdAt: NOW,
    updatedAt: NOW,
    numero: "OS-MODELO",
    client: "Cliente Modelo",
    workNumber: "OBRA-MODELO",
    local: "Local Modelo",
    operator: "Operador Modelo",
    technicalResp: "Responsável Modelo",
    revision: "00",
    amostras: [],
  },
  amostra: {
    id: "modelo-amostra",
    createdAt: NOW,
    updatedAt: NOW,
    reportNumber: "AM-MODELO",
    borehole: "SP-MODELO",
    depth: "0,00 – 0,50 m",
    description: "Amostra modelo (template)",
    granulometricDescription: "—",
    code: "MOD-000",
    photos: [],
    ensaios: [],
  },
  ensaio: {
    id: "modelo-ensaio-adens",
    tipo: "adensamento",
    status: "rascunho",
    createdAt: NOW,
    updatedAt: NOW,
    label: "MODELO",
    operator: "Operador Modelo",
    photos: [],
  },
  photos: [],
  onPayloadChange: () => {},
  addPhoto: () => {},
  removePhoto: () => {},
  updatePhoto: () => {},
};

function ModeloAdensamento() {
  return (
    <LabEnsaioProvider value={PHANTOM_CTX}>
      <AdensamentoPage />
    </LabEnsaioProvider>
  );
}