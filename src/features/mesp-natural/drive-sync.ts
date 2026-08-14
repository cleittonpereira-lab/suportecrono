import { syncRevisionToDrive } from "@/lib/driveSync.functions";
import { blobToBase64 } from "@/lib/drive-sync-client";
import type { DeterminacaoInput } from "@/features/mesp-natural/calc";
import type { Identificacao } from "@/features/mesp-natural/ui";

export function mespIndexMetadata(ident: Identificacao) {
  return {
    os_numero: ident.os || null,
    os_cliente: ident.tomador || null,
    amostra_code: ident.amostraCodigo || null,
    ensaio_tipo: "mesp-a",
    ensaio_nome: `M.ESP.A · ${ident.amostraCodigo || ident.tipoEnsaioNome || "Amostra"}`,
  };
}

export async function syncMEspARevision(args: {
  scopeId: string;
  rev: number;
  filename: string;
  pdfBlob: Blob;
  ident: Identificacao;
  dets: DeterminacaoInput[];
  obs: string;
}) {
  const base64 = await blobToBase64(args.pdfBlob);
  return syncRevisionToDrive({
    data: {
      scopeId: args.scopeId,
      os: {
        numero: args.ident.os || "",
        cliente: args.ident.tomador || "",
      },
      amostra: {
        code: args.ident.amostraCodigo || "",
        descricao: args.ident.amostraDescricao || "",
      },
      ensaio: {
        tipo: "mesp-a",
        nome: `M.ESP.A · ${args.ident.amostraCodigo || "Amostra"}`,
      },
      rev: args.rev,
      pdf: { filename: args.filename, base64 },
      dadosJson: JSON.stringify({
        metodologia: "M.ESP.A",
        ident: args.ident,
        dets: args.dets,
        obs: args.obs,
        rev: args.rev,
        savedAt: new Date().toISOString(),
      }),
      fotos: [],
      manifest: {
        metodologia: "Massa Específica Aparente Natural",
        norma: "ABNT NBR 16867:2020",
      },
    },
  });
}