import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CDPage } from "./_app.relatorio.cisalhamento-direto";
import { LabEnsaioProvider, type LabEnsaioContextValue } from "@/features/lab/context";
import type { Photo } from "@/features/lab/types";

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
const PHANTOM_CTX: Omit<LabEnsaioContextValue, "photos" | "addPhoto" | "removePhoto" | "updatePhoto"> = {
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
  onPayloadChange: () => {},
};

function ModeloCisalhamento() {
  const [photos, setPhotos] = useState<Photo[]>(() => {
    try {
      const saved = localStorage.getItem("cd_modelo_photos");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const addPhoto = (photo: Omit<Photo, "id" | "createdAt">) => {
    const newPhoto: Photo = {
      ...photo,
      id: "photo_" + Math.random().toString(36).substring(2, 9),
      createdAt: new Date().toISOString(),
    };
    setPhotos((prev) => {
      const next = [...prev, newPhoto];
      try {
        localStorage.setItem("cd_modelo_photos", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const removePhoto = (photoId: string) => {
    setPhotos((prev) => {
      const next = prev.filter((p) => p.id !== photoId);
      try {
        localStorage.setItem("cd_modelo_photos", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const updatePhoto = (photoId: string, patch: Partial<Photo>) => {
    setPhotos((prev) => {
      const next = prev.map((p) => (p.id === photoId ? { ...p, ...patch } : p));
      try {
        localStorage.setItem("cd_modelo_photos", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const dynamicCtx: LabEnsaioContextValue = useMemo(
    () => ({
      ...PHANTOM_CTX,
      photos,
      addPhoto,
      removePhoto,
      updatePhoto,
    }),
    [photos],
  );

  return (
    <LabEnsaioProvider value={dynamicCtx}>
      <CDPage />
    </LabEnsaioProvider>
  );
}
