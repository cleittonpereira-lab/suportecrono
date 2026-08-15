import { createFileRoute } from "@tanstack/react-router";
import { CDPage } from "./_app.relatorio.cisalhamento-direto";
import { LabEnsaioProvider, type LabEnsaioContextValue } from "@/features/lab/context";

export const Route = createFileRoute("/_app/modelos-relatorios/cisalhamento-direto")({
  ssr: false,
  component: ModeloCisalhamento,
  head: () => ({
    meta: [
      { title: "Modelo: Cisalhamento Direto — Suporte INFRA" },
      {
        name: "description",
        content: "Espelho fiel do relatório de cisalhamento direto para consulta de modelo.",
      },
    ],
  }),
});

const NOW = "2026-01-01T00:00:00.000Z";
const PHANTOM_CTX: LabEnsaioContextValue = {
  os: {
    id: "modelo-os-cd",
    createdAt: NOW,
    updatedAt: NOW,
    numero: "OS-MODELO",
    client: "Cliente Modelo LTDA.",
    workNumber: "OBRA-MODELO",
    local: "Local Modelo / SP",
    operator: "Operador Modelo",
    technicalResp: "Engº Responsável · CREA-SP 000000",
    revision: "00",
    amostras: [],
  },
  amostra: {
    id: "modelo-amostra-cd",
    createdAt: NOW,
    updatedAt: NOW,
    reportNumber: "AM-MODELO",
    borehole: "SP-MODELO",
    depth: "1,00 – 1,50 m",
    description: "Argila siltosa, cinza-escura, plástica, saturada.",
    granulometricDescription: "Argila (65%) · Silte (28%) · Areia fina (7%).",
    code: "CD-MOD-01",
    photos: [],
    ensaios: [],
  },
  ensaio: {
    id: "modelo-ensaio-cd",
    tipo: "cisalhamento-direto",
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

function ModeloCisalhamento() {
  return (
    <LabEnsaioProvider value={PHANTOM_CTX}>
      <CDPage />
    </LabEnsaioProvider>
  );
}
