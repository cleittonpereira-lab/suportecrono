import { createContext, useContext, type ReactNode } from "react";
import type { Amostra, OS, Ensaio, Photo, Coords } from "./types";

export interface LabEnsaioContextValue {
  os: OS;
  amostra: Amostra;
  ensaio: Ensaio;
  /** Fotos do ENSAIO (não da amostra). */
  photos: Photo[];
  coords?: Coords;
  onPayloadChange: (payload: unknown) => void;
  /** Adiciona foto ao ensaio (usa `specimenId` para vincular a um CP no Triaxial). */
  addPhoto: (photo: Omit<Photo, "id" | "createdAt">) => void;
  removePhoto: (photoId: string) => void;
  updatePhoto: (photoId: string, patch: Partial<Photo>) => void;
}

const Ctx = createContext<LabEnsaioContextValue | null>(null);

export function LabEnsaioProvider({
  value,
  children,
}: {
  value: LabEnsaioContextValue;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOptionalLabEnsaio(): LabEnsaioContextValue | null {
  return useContext(Ctx);
}