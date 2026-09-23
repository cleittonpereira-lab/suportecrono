/**
 * Checks de entrega do laudo (SOND e GDrive do cliente) — regra em
 * lib/entrega-laudo.ts. Grava no arquivo do ensaio, junto do fluxo de
 * aprovação, com a mesma trava das outras gravações do laudo.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { exigirLogin } from "@/integrations/supabase/auth-middleware";
import { atualizarDriveJson, ensureFolderPath } from "@/lib/driveStorage";
import { FOLDER_ENSAIOS, ensaioFileName, type EnsaioFile } from "@/lib/lab-entities.functions";
import { exigirPermissaoNoFluxo, type PapelDoUsuario } from "@/lib/papeis";
import { marcarEntrega, revisaoAprovadaVigente, type EntregaDoLaudo } from "@/lib/entrega-laudo";

function parseScope(scopeId: string) {
  const p = scopeId.split("/");
  const iAm = p.indexOf("amostra");
  const iEn = p.indexOf("ensaio");
  if (iAm === -1 || iEn === -1 || !p[iAm + 1] || !p[iEn + 1]) return null;
  return { amostraId: p[iAm + 1], ensaioId: p[iEn + 1] };
}

const Entrada = z.object({
  scopeIds: z.array(z.string().min(1)).min(1).max(200),
  canal: z.enum(["sond", "gdrive"]),
  marcado: z.boolean(),
});

export const marcarEntregaDosLaudos = createServerFn({ method: "POST" })
  .middleware([exigirLogin])
  .validator((v: unknown) => Entrada.parse(v))
  .handler(async ({ data, context }) => {
    // Mesma regra de "concluído fora (Excel)": quem verifica (lib/papeis.ts).
    exigirPermissaoNoFluxo(context as PapelDoUsuario, "concluir_fora");
    const { userId, claims } = context as {
      userId: string;
      claims?: { email?: string; user_metadata?: { full_name?: string; name?: string } };
    };
    const nome =
      claims?.user_metadata?.full_name ||
      claims?.user_metadata?.name ||
      (claims?.email ? claims.email.split("@")[0] : null);
    const em = new Date().toISOString();
    const folderId = await ensureFolderPath(FOLDER_ENSAIOS);

    const feitos: string[] = [];
    const recusados: { scopeId: string; motivo: string }[] = [];
    for (const scopeId of data.scopeIds) {
      const ids = parseScope(scopeId);
      if (!ids) {
        recusados.push({ scopeId, motivo: "identificação inválida" });
        continue;
      }
      let motivo: string | null = null;
      await atualizarDriveJson<EnsaioFile & { entregaLaudo?: EntregaDoLaudo }>(
        ensaioFileName(ids.amostraId, ids.ensaioId),
        folderId,
        (existing) => {
          if (!existing) {
            motivo = "ensaio não encontrado";
            return null;
          }
          const rev = revisaoAprovadaVigente(existing.reportApprovals);
          if (rev == null) {
            motivo = "o laudo não está aprovado";
            return null;
          }
          motivo = null;
          return {
            ...existing,
            updatedAt: em,
            entregaLaudo: marcarEntrega(
              existing.entregaLaudo,
              rev,
              data.canal,
              data.marcado ? { em, por: userId, porNome: nome } : null,
            ),
          };
        },
      );
      if (motivo) recusados.push({ scopeId, motivo });
      else feitos.push(scopeId);
    }
    return { feitos, recusados };
  });
