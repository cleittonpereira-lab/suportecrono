import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AsfTbPage } from "@/routes/_app.relatorio.asf-tb";
import { LabEnsaioProvider, type LabEnsaioContextValue } from "@/features/lab/context";
import type { Photo } from "@/features/lab/types";

export const Route = createFileRoute("/_app/modelos-relatorios/asf-tb")({
  ssr: false,
  component: ModeloAsfTb,
  head: () => ({
    meta: [
      { title: "Modelo · Teor de Betume e Granulometria (ASF.TB) — Suporte INFRA" },
      {
        name: "description",
        content:
          "Modelo vivo do relatório de teor de betume (DNER-ME 053/94) e granulometria do agregado extraído (DNIT 412/2025-ME) com amostra fantasma.",
      },
    ],
  }),
});

const NOW = "2026-01-01T00:00:00.000Z";
const PHANTOM_CTX: Omit<LabEnsaioContextValue, "photos" | "addPhoto" | "removePhoto" | "updatePhoto"> = {
  os: {
    id: "modelo-os-asftb",
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
    id: "modelo-amostra-asftb",
    createdAt: NOW,
    updatedAt: NOW,
    reportNumber: "AM-MODELO",
    borehole: "SP-MODELO",
    depth: "0,00 – 0,05 m",
    description: "Amostra modelo (template)",
    granulometricDescription: "—",
    code: "MOD-000",
    photos: [],
    ensaios: [],
  },
  ensaio: {
    id: "modelo-ensaio-asftb",
    tipo: "asf-tb",
    status: "rascunho",
    createdAt: NOW,
    updatedAt: NOW,
    label: "MODELO",
    operator: "Operador Modelo",
    photos: [],
  },
  onPayloadChange: () => {},
};

const CHAVE_FOTOS = "asftb_modelo_photos";

function lerFotos(): Photo[] {
  try {
    const saved = localStorage.getItem(CHAVE_FOTOS);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function gravarFotos(fotos: Photo[]) {
  try {
    localStorage.setItem(CHAVE_FOTOS, JSON.stringify(fotos));
  } catch {}
}

function ModeloAsfTb() {
  const [photos, setPhotos] = useState<Photo[]>(lerFotos);

  const mudarFotos = (f: (prev: Photo[]) => Photo[]) =>
    setPhotos((prev) => {
      const next = f(prev);
      gravarFotos(next);
      return next;
    });

  const dynamicCtx: LabEnsaioContextValue = useMemo(
    () => ({
      ...PHANTOM_CTX,
      photos,
      addPhoto: (photo) =>
        mudarFotos((prev) => [
          ...prev,
          { ...photo, id: "photo_" + Math.random().toString(36).substring(2, 9), createdAt: new Date().toISOString() },
        ]),
      removePhoto: (photoId) => mudarFotos((prev) => prev.filter((p) => p.id !== photoId)),
      updatePhoto: (photoId, patch) => mudarFotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, ...patch } : p))),
    }),
    [photos],
  );

  return (
    <LabEnsaioProvider value={dynamicCtx}>
      <AsfTbPage />
    </LabEnsaioProvider>
  );
}
