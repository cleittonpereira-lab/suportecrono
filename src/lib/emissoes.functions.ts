/**
 * Central de Emissões — listagem global de aprovações para admin/verificador,
 * lida diretamente dos arquivos por-ensaio no Drive (lab-ensaios/).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ensureFolderPath, listFilesInFolder, readDriveJson } from "@/lib/driveStorage";
import { FOLDER_ENSAIOS, type EnsaioFile } from "@/lib/lab-entities.functions";

export interface EmissaoRow {
  /** null quando ensaio está apenas em "digitacao" e ainda não gerou nenhuma revisão. */
  id: string | null;
  scope_id: string;
  rev: number | null;
  status: string; // status da última revisão OU "digitacao" quando não há revisão
  workflow_status: string; // status do fluxo no arquivo do ensaio
  requested_by: string | null;
  requested_by_name: string | null;
  requested_at: string | null;
  verified_by: string | null;
  verified_by_name: string | null;
  verified_at: string | null;
  verification_comment: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  comment: string | null;
  filename: string | null;
  os_numero: string | null;
  os_cliente: string | null;
  amostra_code: string | null;
  ensaio_tipo: string | null;
  ensaio_nome: string | null;
  updated_at: string | null;
  pendencia_created_at: string | null;
  pendencia_started_at: string | null;
  pendencia_finished_at: string | null;
  digitador_nome: string | null;
}

const Input = z.object({
  /** filtro por workflow_status do arquivo do ensaio. */
  workflowStatuses: z.array(z.string()).optional(),
});

export const listEmissoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => Input.parse(v))
  .handler(async ({ data }): Promise<EmissaoRow[]> => {
    try {
      const enFolderId = await ensureFolderPath(FOLDER_ENSAIOS);
      const amFolderId = await ensureFolderPath(["lab-amostras"]);
      const osFolderId = await ensureFolderPath(["lab-os"]);

      const files = await listFilesInFolder(enFolderId);
      const ensaios = (
        await Promise.all(files.map((f) => readDriveJson<EnsaioFile>(f.name, enFolderId)))
      ).filter((e): e is EnsaioFile => e !== null);

      const filtered = data.workflowStatuses && data.workflowStatuses.length > 0
        ? ensaios.filter((e) => data.workflowStatuses!.includes(e.workflowStatus || "digitacao"))
        : ensaios;

      if (filtered.length === 0) return [];

      // Índice de nome de arquivo -> amostraId, montado uma vez (evita
      // listar a pasta de amostras de novo para cada ensaio).
      const amFiles = await listFilesInFolder(amFolderId);
      const amFileByAmostraId = new Map<string, string>();
      for (const f of amFiles) {
        const amId = f.name.replace(/\.json$/, "").split("__").slice(1).join("__");
        if (amId) amFileByAmostraId.set(amId, f.name);
      }

      const amostraCache = new Map<string, any>();
      const osCache = new Map<string, any>();

      const rows = await Promise.all(
        filtered.map(async (en): Promise<EmissaoRow> => {
          const approvals = (en.reportApprovals ?? []).slice().sort((a, b) => b.rev - a.rev);
          const latest = approvals[0];

          let amostra: any = amostraCache.get(en.amostraId);
          if (amostra === undefined) {
            const fname = amFileByAmostraId.get(en.amostraId);
            amostra = fname ? await readDriveJson<any>(fname, amFolderId) : null;
            amostraCache.set(en.amostraId, amostra);
          }

          let os: any = amostra?.osId ? osCache.get(amostra.osId) : null;
          if (amostra?.osId && os === undefined) {
            os = await readDriveJson<any>(`${amostra.osId}.json`, osFolderId);
            osCache.set(amostra.osId, os);
          }

          const scopeId = amostra?.osId
            ? `os/${amostra.osId}/amostra/${en.amostraId}/ensaio/${en.id}`
            : `amostra/${en.amostraId}/ensaio/${en.id}`;

          return {
            id: latest?.id ?? null,
            scope_id: scopeId,
            rev: latest?.rev ?? null,
            status: latest?.status ?? "digitacao",
            workflow_status: en.workflowStatus || "digitacao",
            requested_by: latest?.requested_by ?? null,
            requested_by_name: latest?.requested_by_name ?? null,
            requested_at: latest?.requested_at ?? null,
            verified_by: latest?.verified_by ?? null,
            verified_by_name: latest?.verified_by_name ?? null,
            verified_at: latest?.verified_at ?? null,
            verification_comment: latest?.verification_comment ?? null,
            decided_by: latest?.decided_by ?? null,
            decided_by_name: latest?.decided_by_name ?? null,
            decided_at: latest?.decided_at ?? null,
            comment: latest?.comment ?? null,
            filename: latest?.filename ?? null,
            os_numero: os?.numero ?? null,
            os_cliente: os?.client ?? null,
            amostra_code: amostra?.code ?? amostra?.reportNumber ?? null,
            ensaio_tipo: en.tipo ?? null,
            ensaio_nome: en.nome ?? null,
            updated_at: en.updatedAt ?? null,
            // Timing detalhado de SLA da Central de Pendências não é
            // correlacionado aqui (pendência é indexada por texto
            // os/amostra/ensaio, sem chave direta pro arquivo do ensaio) -
            // usa o requested_by_name da própria aprovação como digitador.
            pendencia_created_at: null,
            pendencia_started_at: null,
            pendencia_finished_at: null,
            digitador_nome: latest?.requested_by_name ?? null,
          };
        }),
      );

      return rows.sort((a, b) => (a.updated_at ?? "") < (b.updated_at ?? "") ? 1 : -1);
    } catch (err) {
      console.warn("[listEmissoes] Erro capturado:", err);
      return [];
    }
  });
