import { syncRevisionToDrive } from "@/lib/driveSync.functions";
import { blobToBase64 } from "@/lib/drive-sync-client";
import type { OedSampleProps, OedStage, OedStageCalculated, PhysicalIndices, CompressibilityParams } from "./types";
import type { Photo } from "@/features/lab/types";

export interface SyncDriveResult {
  ok: boolean;
  revisionUrl?: string;
  folderUrl?: string;
  error?: string;
}

export async function syncOedometerRevisionToDrive(args: {
  sample: OedSampleProps;
  stages: OedStage[];
  phys: PhysicalIndices;
  stagesCalc: OedStageCalculated[];
  params: CompressibilityParams;
  photos: Photo[];
  pdfBlob: Blob;
  revNumber: number;
}): Promise<SyncDriveResult> {
  try {
    const scopeId = `os/${args.sample.os || "OS"}/amostra/${args.sample.code || "AMOSTRA"}/ensaio/adensamento`;

    const fotosPayload = args.photos.map((p, idx) => ({
      cpId: `AD-${idx + 1}`,
      filename: `FOTO_ADENSAMENTO_${idx + 1}.jpg`,
      mimeType: "image/jpeg",
      base64: p.dataUrl.split(",")[1] || "",
    }));

    const dadosJson = JSON.stringify(
      {
        ensaio: "adensamento_unidimensional",
        normas: ["ABNT NBR 16853/20", "ASTM D2435"],
        sample: args.sample,
        stages: args.stages,
        phys: args.phys,
        stagesCalc: args.stagesCalc,
        params: args.params,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );

    const pdfBase64 = await blobToBase64(args.pdfBlob);

    const res = await syncRevisionToDrive({
      data: {
        scopeId,
        os: { numero: args.sample.os || "OS", cliente: args.sample.client || "CLIENTE" },
        amostra: { code: args.sample.code || "AMOSTRA", descricao: args.sample.description || "" },
        ensaio: { tipo: "adensamento", nome: "Adensamento Edométrico" },
        rev: args.revNumber,
        pdf: {
          filename: `ADENSAMENTO_${args.sample.os || "OS"}_${args.sample.code || "AMOSTRA"}_Rev${String(args.revNumber).padStart(2, "0")}.pdf`,
          base64: pdfBase64,
        },
        dadosJson,
        fotos: fotosPayload,
        manifest: {},
      },
    });

    return {
      ok: res.ok,
      revisionUrl: res.storagePath || undefined,
      folderUrl: res.folderUrl ?? undefined,
      error: res.ok ? undefined : "Falha na sincronização",
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || String(err),
    };
  }
}
