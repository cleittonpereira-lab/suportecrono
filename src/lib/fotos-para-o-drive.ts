/**
 * Fotos do ensaio para a pasta `fotos/` da revisão no Drive (syncRevisionToDrive).
 *
 * As telas montavam essa lista só a partir do `dataUrl` e descartavam o resto.
 * Desde que a foto virou arquivo próprio no Drive (`url` = /api/photo/{id}), o
 * `dataUrl` fica vazio — e essas fotos não iam mais para a pasta da revisão.
 * Agora a foto com arquivo próprio vai pelo `fileId`: o servidor copia o
 * arquivo que já está no Drive, sem a foto passar de novo pela rede do navegador.
 */
export type FotoParaODrive = {
  cpId: string;
  filename: string;
  mimeType: string;
  /** Conteúdo em base64; vazio quando a foto vai pelo `fileId`. */
  base64: string;
  /** Arquivo da foto no Drive (de `/api/photo/{fileId}`). */
  fileId?: string;
};

type FotoMin = { id: string; kind?: string; dataUrl?: string; url?: string; specimenId?: string };

/** fileId de uma url `/api/photo/{fileId}` (ou null). */
export function fileIdDaFoto(url: string | undefined): string | null {
  const m = /\/api\/photo\/([^/?#]+)/.exec(url ?? "");
  return m ? decodeURIComponent(m[1]) : null;
}

export function fotosParaODrive(fotos: FotoMin[] | undefined, cpIdDe: (f: FotoMin) => string = () => "geral"): FotoParaODrive[] {
  const out: FotoParaODrive[] = [];
  for (const p of fotos ?? []) {
    const nome = `${p.kind || "foto"}_${p.id}`;
    const m = /^data:(.*?);base64,(.*)$/s.exec(p.dataUrl ?? "");
    if (m && m[2]) {
      const mimeType = m[1] || "image/jpeg";
      out.push({ cpId: cpIdDe(p), filename: `${nome}.${mimeType.split("/")[1] || "jpg"}`, mimeType, base64: m[2] });
      continue;
    }
    const fileId = fileIdDaFoto(p.url);
    if (fileId) out.push({ cpId: cpIdDe(p), filename: `${nome}.jpg`, mimeType: "image/jpeg", base64: "", fileId });
  }
  return out;
}
