/**
 * Serve o binário de uma foto enviada via `uploadPhoto` (ver
 * `src/lib/photo-upload.functions.ts`) — rota GET simples e cacheável pelo
 * navegador, usável direto como `<img src="/api/photo/{fileId}">`, sem
 * precisar de nenhuma chamada RPC (evita reenviar a foto toda vez que a
 * página/board é sincronizado).
 */
import { createFileRoute } from "@tanstack/react-router";
import { readPhotoBytes } from "@/lib/driveStorage";

export const Route = createFileRoute("/api/photo/$fileId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const result = await readPhotoBytes(params.fileId);
        if (!result) {
          return new Response("Foto não encontrada", { status: 404 });
        }
        return new Response(result.bytes as BodyInit, {
          headers: {
            "Content-Type": result.mimeType,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
