/**
 * Helpers compartilhados entre os wrappers de sync com Google Drive.
 * Antes cada feature (M.ESP.A, Triaxial CID, Adensamento) tinha sua própria
 * cópia de `blobToBase64` — agora todas passam por aqui.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}