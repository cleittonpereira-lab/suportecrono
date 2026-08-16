import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AdensamentoPage } from "./_app.relatorio.adensamento";
import { LabEnsaioProvider, type LabEnsaioContextValue } from "@/features/lab/context";
import type { Photo } from "@/features/lab/types";

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
const PHANTOM_CTX: Omit<LabEnsaioContextValue, "photos" | "addPhoto" | "removePhoto" | "updatePhoto"> = {
  os: {
    id: "modelo-os-adens",
    createdAt: NOW,
    updatedAt: NOW,
    numero: "OS-MODELO",
    client: "Cliente Modelo LTDA.",
    workNumber: "OBRA-MODELO",
    local: "Guarulhos / SP",
    operator: "Operador Modelo",
    technicalResp: "Engº Responsável · CREA-SP 000000",
    revision: "00",
    amostras: [],
  },
  amostra: {
    id: "modelo-amostra-adens",
    createdAt: NOW,
    updatedAt: NOW,
    reportNumber: "AM-MODELO",
    borehole: "SH-01",
    depth: "2,50 – 3,00 m",
    description: "Argila siltosa de coloração cinza escura, consistência mole a média.",
    granulometricDescription: "Argila siltosa, fração fina predominante.",
    code: "AD-MOD-01",
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
  onPayloadChange: () => {},
};

function ModeloAdensamento() {
  const [photos, setPhotos] = useState<Photo[]>(() => {
    try {
      if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
        const saved = localStorage.getItem("adens_modelo_photos");
        return saved ? JSON.parse(saved) : [];
      }
      return [];
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
        if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
          localStorage.setItem("adens_modelo_photos", JSON.stringify(next));
        }
      } catch {}
      return next;
    });
  };

  const removePhoto = (photoId: string) => {
    setPhotos((prev) => {
      const next = prev.filter((p) => p.id !== photoId);
      try {
        if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
          localStorage.setItem("adens_modelo_photos", JSON.stringify(next));
        }
      } catch {}
      return next;
    });
  };

  const updatePhoto = (photoId: string, patch: Partial<Photo>) => {
    setPhotos((prev) => {
      const next = prev.map((p) => (p.id === photoId ? { ...p, ...patch } : p));
      try {
        if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
          localStorage.setItem("adens_modelo_photos", JSON.stringify(next));
        }
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
    [photos]
  );

  return (
    <LabEnsaioProvider value={dynamicCtx}>
      <AdensamentoPage />
    </LabEnsaioProvider>
  );
}
