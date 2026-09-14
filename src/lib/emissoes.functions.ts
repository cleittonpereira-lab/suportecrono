/**
 * Central de Emissões — listagem global de aprovações para admin/verificador,
 * lida diretamente dos arquivos por-ensaio no Drive (lab-ensaios/).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ensureFolderPath, lerJsonsDaPasta, type ArquivoListado } from "@/lib/driveStorage";
import { FOLDER_ENSAIOS, type EnsaioFile } from "@/lib/lab-entities.functions";

/**
 * Índice id → conteúdo. Havendo cópias homônimas do mesmo registro, fica a
 * modificada por último — o mesmo critério de `readDriveJson`.
 */
function maisRecentePorId<T extends { id?: string }>(lidos: { arquivo: ArquivoListado; data: T }[]): Map<string, T> {
  const porId = new Map<string, { data: T; quando: string }>();
  for (const { arquivo, data } of lidos) {
    if (!data?.id) continue;
    const quando = arquivo.modifiedTime ?? "";
    const atual = porId.get(data.id);
    if (!atual || quando > atual.quando) porId.set(data.id, { data, quando });
  }
  return new Map([...porId].map(([id, v]) => [id, v.data]));
}

/**
 * Deriva o farol a partir da revisão mais recente em `reportApprovals`, não
 * do campo `workflowStatus` gravado separadamente — os dois já saíram de
 * sincronia mais de uma vez. Mesma lógica de approvals.functions.ts's
 * deriveWorkflowStatus (arquivo diferente, mesmo princípio: `reportApprovals`
 * sempre foi corretamente mantido, então derivar dali corrige
 * retroativamente ensaios já aprovados antes deste fix).
 */
function deriveWorkflowStatus(en: EnsaioFile): string {
  const approvals = (en.reportApprovals ?? []).slice();
  if (approvals.length > 0) {
    const latest = approvals.reduce((a, b) => (b.rev > a.rev ? b : a));
    if (latest.status === "aprovado") return "aprovado";
    if (latest.status === "pendente_aprovacao" || latest.status === "verificado") return "aguardando_aprovacao";
    if (latest.status === "pendente_verificacao" || latest.status === "rejeitado_verificacao" || latest.status === "rejeitado") return "aguardando_verificacao";
  }
  return en.workflowStatus || "digitacao";
}

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

      // Só baixa os ensaios que mudaram desde a última leitura (ver lerJsonsDaPasta).
      const ensaios = (await lerJsonsDaPasta<EnsaioFile>(enFolderId)).map((l) => l.data);

      const filtered = data.workflowStatuses && data.workflowStatuses.length > 0
        ? ensaios.filter((e) => data.workflowStatuses!.includes(deriveWorkflowStatus(e)))
        : ensaios;

      if (filtered.length === 0) return [];

      // Amostras e OS lidas uma vez cada, pela listagem, em vez de uma busca
      // por nome + download para cada ensaio.
      const [amLidas, osLidas] = await Promise.all([
        lerJsonsDaPasta<{ id?: string; osId?: string; code?: string; reportNumber?: string }>(amFolderId),
        lerJsonsDaPasta<{ id?: string; numero?: string; client?: string }>(osFolderId),
      ]);
      const amostraPorId = maisRecentePorId(amLidas);
      const osPorId = maisRecentePorId(osLidas);

      const rows = filtered.map(
        (en): EmissaoRow => {
          const approvals = (en.reportApprovals ?? []).slice().sort((a, b) => b.rev - a.rev);
          const latest = approvals[0];

          const amostra = amostraPorId.get(en.amostraId) ?? null;
          const os = amostra?.osId ? (osPorId.get(amostra.osId) ?? null) : null;

          const scopeId = amostra?.osId
            ? `os/${amostra.osId}/amostra/${en.amostraId}/ensaio/${en.id}`
            : `amostra/${en.amostraId}/ensaio/${en.id}`;

          return {
            id: latest?.id ?? null,
            scope_id: scopeId,
            rev: latest?.rev ?? null,
            status: latest?.status ?? "digitacao",
            workflow_status: deriveWorkflowStatus(en),
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
        },
      );

      return rows.sort((a, b) => (a.updated_at ?? "") < (b.updated_at ?? "") ? 1 : -1);
    } catch (err) {
      // NÃO devolver [] aqui. Para o React Query, lista vazia é uma resposta
      // de SUCESSO: ele troca os dados bons por nada, e a Central de
      // Relatórios renderiza como se nenhum laudo estivesse aprovado — furo,
      // profundidade e "Laudo Aprovado" somem da linha, que cai para "Em
      // Digitação". Foi exatamente o que aconteceu: a mesma OS apareceu ora
      // com 7/13 aprovados, ora com 2/13, sem nada ter sido apagado.
      //
      // Propagando o erro, o React Query mantém o último resultado bom na tela
      // e marca a query como falha, em vez de mentir que está tudo em digitação.
      console.error("[listEmissoes] Falha ao montar a lista:", err);
      throw err;
    }
  });
