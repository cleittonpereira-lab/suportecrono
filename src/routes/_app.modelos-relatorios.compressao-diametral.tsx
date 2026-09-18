import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CompressaoDiametralPage } from "@/routes/_app.relatorio.compressao-diametral";
import { LabEnsaioProvider, type LabEnsaioContextValue } from "@/features/lab/context";
import type { Photo } from "@/features/lab/types";

export const Route = createFileRoute("/_app/modelos-relatorios/compressao-diametral")({
  ssr: false,
  component: ModeloCompressaoDiametral,
  head: () => ({
    meta: [
      { title: "Modelo · Compressão Diametral — Suporte INFRA" },
      {
        name: "description",
        content:
          "Modelo vivo do relatório de Compressão Diametral (mistura asfáltica DNER-ME 138/94, solo-cimento DNIT 136/2010-ME) com amostra fantasma para consulta administrativa.",
      },
    ],
  }),
});

const NOW = "2026-01-01T00:00:00.000Z";
const PHANTOM_CTX: Omit<LabEnsaioContextValue, "photos" | "addPhoto" | "removePhoto" | "updatePhoto"> = {
  os: {
    id: "modelo-os-compdiam",
    createdAt: NOW,
    updatedAt: NOW,
    numero: "OS-MODELO",
    client: "Cliente Modelo",
    workNumber: "OBRA-MODELO",
    local: "Local Modelo",
    operator: "Operador Modelo",
    technicalResp: "Engº Maurício Malanconi - CREA: 5063078630",
    revision: "00",
    amostras: [],
  },
  amostra: {
    id: "modelo-amostra-compdiam",
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
    id: "modelo-ensaio-compdiam",
    tipo: "compressao-diametral",
    status: "rascunho",
    createdAt: NOW,
    updatedAt: NOW,
    label: "MODELO",
    operator: "Operador Modelo",
    photos: [],
  },
  onPayloadChange: () => {},
};

function ModeloCompressaoDiametral() {
  const [photos, setPhotos] = useState<Photo[]>(() => {
    try {
      const saved = localStorage.getItem("compdiam_modelo_photos");
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
      try { localStorage.setItem("compdiam_modelo_photos", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const removePhoto = (photoId: string) => {
    setPhotos((prev) => {
      const next = prev.filter((p) => p.id !== photoId);
      try { localStorage.setItem("compdiam_modelo_photos", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const updatePhoto = (photoId: string, patch: Partial<Photo>) => {
    setPhotos((prev) => {
      const next = prev.map((p) => (p.id === photoId ? { ...p, ...patch } : p));
      try { localStorage.setItem("compdiam_modelo_photos", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const dynamicCtx: LabEnsaioContextValue = useMemo(
    () => ({ ...PHANTOM_CTX, photos, addPhoto, removePhoto, updatePhoto }),
    [photos],
  );

  return (
    <LabEnsaioProvider value={dynamicCtx}>
      <CompressaoDiametralPage />
    </LabEnsaioProvider>
  );
}
