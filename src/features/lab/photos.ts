/**
 * Utilitário: converte um File em data URL comprimida (JPEG).
 * Reduz para no máx 1600 px na maior aresta e qualidade 0.82 —
 * suficiente para relatório em A4 e para não estourar localStorage.
 */
export async function fileToCompressedDataUrl(
  file: File,
  maxSide = 1600,
  quality = 0.82,
): Promise<{ dataUrl: string; bytes: number }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D não disponível");
  ctx.drawImage(bmp, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const bytes = Math.round((dataUrl.length - "data:image/jpeg;base64,".length) * 0.75);
  return { dataUrl, bytes };
}

export function formatBytes(n?: number): string {
  if (!n || !isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}