/**
 * Upload de fotos como arquivo binário real no Drive (não mais como texto
 * base64 embutido dentro dos JSONs compartilhados) — ver `driveStorage.ts`
 * (`uploadPhotoBytes`) e a rota que serve as fotos de volta, `api.photo.$fileId.tsx`.
 *
 * Motivação: o board de Chegada de Amostras e a árvore de relatórios do
 * laboratório eram relidos por inteiro a cada poucos segundos por toda aba
 * aberta — com fotos em base64 embutidas, isso gerava consumo de banda que
 * só crescia (nunca encolhe) e derrubava o limite mensal do Vercel. Guardando
 * a foto como arquivo próprio e só uma URL curta no JSON, o payload polado
 * fica pequeno independente de quantas fotos existirem.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ensureFolderPath, uploadPhotoBytes } from "@/lib/driveStorage";

const FOLDER_FOTOS = ["fotos"];

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mimeType: string } {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) throw new Error("Formato de imagem inválido (esperado data URL base64).");
  const mimeType = m[1] || "image/jpeg";
  const bytes = Uint8Array.from(Buffer.from(m[2], "base64"));
  return { bytes, mimeType };
}

const UploadInput = z.object({
  dataUrl: z.string().min(1),
  /** Prefixo do nome do arquivo, só pra facilitar achar no Drive manualmente — não precisa ser único (o Drive permite nomes repetidos; a busca é sempre por fileId). */
  namePrefix: z.string().optional(),
});

/** Prefixo usado pela galeria do formulário público de chegada (ChegadaImageGallery). */
const PREFIXO_PUBLICO = "chegada";
const TAMANHO_MAXIMO_PUBLICO = 12 * 1024 * 1024;

// Reaproveitado pelas fotos de ensaio, avatar e chat da OS (área logada) e pelo
// formulário público de Chegada de Amostras (`registro-amostra.tsx`, usado por
// colaboradores sem login). Antes, sem middleware nenhum, qualquer pessoa com a
// URL enviava qualquer arquivo, de qualquer tamanho, para o Drive.
//
// Agora: sem sessão verificada, SÓ fotos de chegada, e só imagem até 12 MB.
// Todo o resto exige login. Os limites valem apenas para o caminho público,
// para não mudar o que quem está logado já envia.
export const uploadPhoto = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => UploadInput.parse(i))
  .handler(async ({ data }) => {
    const prefixo = (data.namePrefix || "foto").replace(/[^\w-]+/g, "_");
    const { bytes, mimeType } = decodeDataUrl(data.dataUrl);

    // Import dinâmico: o módulo é só de servidor e este arquivo é alcançável
    // pelo navegador (ver auth-middleware.ts).
    const { sessaoVerificada } = await import("@/integrations/supabase/auth-identidade.server");
    if (!(await sessaoVerificada())) {
      if (prefixo !== PREFIXO_PUBLICO) {
        throw new Error("Não autenticado: entre no sistema para enviar fotos.");
      }
      if (!mimeType.startsWith("image/")) throw new Error("Só é possível enviar imagens.");
      if (bytes.byteLength > TAMANHO_MAXIMO_PUBLICO) throw new Error("Imagem grande demais (máximo 12 MB).");
    }

    const ext = mimeType.split("/")[1]?.split("+")[0] || "jpg";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rand = Math.random().toString(36).slice(2, 8);
    const name = `${prefixo}_${stamp}_${rand}.${ext}`;

    const folderId = await ensureFolderPath(FOLDER_FOTOS);
    const fileId = await uploadPhotoBytes({ parentId: folderId, name, mimeType, bytes });

    return { fileId, url: `/api/photo/${fileId}` };
  });
