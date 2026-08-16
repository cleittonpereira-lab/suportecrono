import { syncRevisionToDrive, getDriveSyncStatus } from "@/lib/driveSync.functions";
import { blobToBase64 } from "@/lib/drive-sync-client";
import type { CDSample, CDSpecimen, CDSpecimenResults, CDEnvelopeResult } from "./types";
import { getCDRawDataXlsxBase64 } from "./exportXlsx";
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
  sample: CDSample;
  specimens: CDSpecimen[];
  results?: CDSpecimenResults[];
  envelope?: CDEnvelopeResult | null;
  photos?: Photo[];
  ctxOs?: { numero?: string; cliente?: string };
  ctxAmostra?: { code?: string; descricao?: string };
  ctxEnsaio?: { tipo?: string; nome?: string };
  fotos?: DrivePhotoInput[];
  dadosExtra?: Record<string, unknown>;
}

export async function syncRevision(args: SyncRevisionArgs) {
  const pdfBase64 = await blobToBase64(args.pdfBlob);
  const dados = {
    sample: args.sample,
    specimens: args.specimens,
    ...args.dadosExtra,
    savedAt: new Date().toISOString(),
    rev: args.rev,
  };

  // Gera a planilha XLSX completa para salvar no Google Drive
  let xlsxPayload: { filename: string; base64: string } | undefined = undefined;
  try {
    if (args.results) {
      const base = (args.sample.workNumber || args.sample.os || "relatorio").toString().replace(/[^\w-]+/g, "_");
      const filename = `Cisalhamento-Direto_${base}_Rev-${String(args.rev).padStart(2, "0")}.xlsx`;
      xlsxPayload = await getCDRawDataXlsxBase64({
        sample: args.sample,
        specimens: args.specimens,
        results: args.results,
        envelope: args.envelope || null,
        photos: args.photos,
        filename,
      });
    }
  } catch (err) {
    console.warn("Falha ao gerar XLSX para sync no Drive:", err);
  }

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
        tipo: args.ctxEnsaio?.tipo ?? "cisalhamento-direto",
        nome: args.ctxEnsaio?.nome ?? args.sample.reportNumber ?? "",
      },
      rev: args.rev,
      pdf: { filename: args.pdfFilename, base64: pdfBase64 },
      xlsx: xlsxPayload,
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
