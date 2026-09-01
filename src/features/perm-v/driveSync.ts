import { syncRevisionToDrive, getDriveSyncStatus } from "@/lib/driveSync.functions";
import { blobToBase64 } from "@/lib/drive-sync-client";
import type { PermVSample } from "./types";
import type { Photo } from "@/features/lab/types";

export { blobToBase64 };

export interface DrivePhotoInput {
  cpId: string;
  filename: string;
  mimeType: string;
  base64: string;
}

export interface SyncRevisionArgs {
  scopeId: string;
  rev: number;
  pdfBlob: Blob;
  pdfFilename: string;
  sample: PermVSample;
  photos?: Photo[];
  ctxOs?: { numero?: string; cliente?: string };
  ctxAmostra?: { code?: string; descricao?: string };
  ctxEnsaio?: { tipo?: string; nome?: string };
  fotos?: DrivePhotoInput[];
}

export async function syncRevision(args: SyncRevisionArgs) {
  const pdfBase64 = await blobToBase64(args.pdfBlob);
  const dados = {
    sample: args.sample,
    savedAt: new Date().toISOString(),
    rev: args.rev,
  };

  return syncRevisionToDrive({
    data: {
      scopeId: args.scopeId,
      os: {
        numero: args.ctxOs?.numero ?? args.sample.workNumber ?? "",
        cliente: args.ctxOs?.cliente ?? args.sample.client ?? "",
      },
      amostra: {
        code: args.ctxAmostra?.code ?? args.sample.code ?? "",
        descricao: args.ctxAmostra?.descricao ?? args.sample.description ?? "",
      },
      ensaio: {
        tipo: args.ctxEnsaio?.tipo ?? "perm-v",
        nome: args.ctxEnsaio?.nome ?? args.sample.reportNumber ?? "",
      },
      rev: args.rev,
      pdf: { filename: args.pdfFilename, base64: pdfBase64 },
      dadosJson: JSON.stringify(dados),
      fotos: args.fotos ?? [],
      manifest: {
        operador: args.sample.operator,
        digitadoPor: args.sample.typedBy ?? "",
        equipamento: args.sample.equipment ?? "",
      },
    },
  });
}

export async function fetchDriveStatus(scopeId: string) {
  return getDriveSyncStatus({ data: { scopeId } });
}
