import { syncRevisionToDrive, fetchRevisionHistory } from "@/lib/driveSync.functions";
import type { OedSampleProps, OedStage, OedPhysicalIndices, OedCompressibilityParams } from "./types";
import type { Photo } from "@/features/lab/types";
import { getOedometerXlsxBase64 } from "./exportXlsx";

export async function syncOedometerRevisionToDrive(params: {
  sample: OedSampleProps;
  stages: OedStage[];
  phys: OedPhysicalIndices;
  stagesCalc: any[];
  params: OedCompressibilityParams;
  photos?: Photo[];
  pdfBlob: Blob;
  revNumber: number;
  approvedBy?: string;
  verifiedBy?: string;
}): Promise<{ ok: boolean; revisionUrl?: string; folderUrl?: string; error?: string }> {
  try {
    // 1. Converte PDF Blob para Base64
    const pdfBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result as string;
        resolve(res.split(",")[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(params.pdfBlob);
    });

    const pdfFilename = `ADENSAMENTO_${params.sample.os || "OS"}_${params.sample.code || "AMOSTRA"}_Rev${String(params.revNumber).padStart(2, "0")}.pdf`;

    // 2. Gera XLSX Executivo em Base64
    let xlsxPayload: { filename: string; base64: string } | undefined;
    try {
      xlsxPayload = await getOedometerXlsxBase64({
        sample: params.sample,
        stages: params.stages,
        phys: params.phys,
        stagesCalc: params.stagesCalc,
        params: params.params,
        photos: params.photos || [],
      });
    } catch (e) {
      console.warn("Falha ao gerar base64 do XLSX para Adensamento:", e);
    }

    // 3. Monta fotos para payload
    const fotosPayload = (params.photos || []).map((p, idx) => ({
      name: `foto_${idx + 1}_${p.kind || "ensaio"}.jpg`,
      base64: p.dataUrl.split(",")[1] || "",
    }));

    // 4. Monta dados JSON completos
    const dadosJson = {
      tipo: "adensamento",
      sample: params.sample,
      stages: params.stages,
      phys: params.phys,
      params: params.params,
      syncedAt: new Date().toISOString(),
    };

    // 5. Executa a sincronização oficial
    const res = await syncRevisionToDrive({
      data: {
        osNumber: params.sample.os || "OS-GERAL",
        clientName: params.sample.client || "Cliente",
        sampleCode: params.sample.code || "AMOSTRA",
        testType: "Adensamento Edometrico",
        revNumber: params.revNumber,
        pdf: {
          filename: pdfFilename,
          base64: pdfBase64,
        },
        xlsx: xlsxPayload,
        dadosJson,
        fotos: fotosPayload,
        aprovador: params.approvedBy || params.sample.technicalResp || "Maurício P. Barbosa",
      },
    });

    return res;
  } catch (err: any) {
    console.error("Erro ao sincronizar com Google Drive:", err);
    return { ok: false, error: err?.message || "Erro desconhecido ao sincronizar com Drive" };
  }
}
