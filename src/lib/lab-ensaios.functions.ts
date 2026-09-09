import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EnsaioStatus, EnsaioTipo, Coords, Photo } from "@/features/lab/types";

export type SerializableJson =
  | string
  | number
  | boolean
  | null
  | SerializableJson[]
  | { [key: string]: SerializableJson };

const SnapshotInput = z.object({
  scopeId: z.string().min(1),
});

const ENSAIO_TIPOS: EnsaioTipo[] = [
  "adensamento",
  "triaxial-cid",
  "triaxial-cid-sat",
  "triaxial-cid-nat",
  "triaxial-ciu",
  "triaxial-uu",
  "cisalhamento-direto",
  "mesp-a",
];

function isEnsaioTipo(value: unknown): value is EnsaioTipo {
  return typeof value === "string" && ENSAIO_TIPOS.includes(value as EnsaioTipo);
}

function parseScope(scopeId: string) {
  const parts = scopeId.split("/");
  const iOs = parts.indexOf("os");
  const iAm = parts.indexOf("amostra");
  const iEn = parts.indexOf("ensaio");
  if (iOs === -1 || iAm === -1 || iEn === -1) return null;
  const osId = parts[iOs + 1];
  const amostraId = parts[iAm + 1];
  const ensaioId = parts[iEn + 1];
  if (!osId || !amostraId || !ensaioId) return null;
  return { osId, amostraId, ensaioId };
}

function workflowToStatus(status: unknown): EnsaioStatus {
  if (status === "aprovado") return "concluido";
  if (status === "digitacao") return "rascunho";
  return "processando";
}

/**
 * Mesma lógica de lab-entities.functions.ts's deriveEnsaioStatus: deriva o
 * status a partir do histórico de aprovações por revisão
 * (`reportApprovals`), não do campo `status`/`workflowStatus` gravado
 * separadamente — esses saem de sincronia quando um caminho de escrita
 * esquece de atualizar os dois juntos, e `reportApprovals` sempre foi
 * corretamente mantido por todos eles.
 */
function deriveStatus(foundEn: { status?: unknown; workflowStatus?: unknown; reportApprovals?: unknown }): EnsaioStatus {
  const approvals = Array.isArray(foundEn.reportApprovals) ? (foundEn.reportApprovals as { rev: number; status: string }[]) : [];
  if (approvals.length > 0) {
    const latest = approvals.reduce((a, b) => (b.rev > a.rev ? b : a));
    if (latest.status === "aprovado") return "aprovado";
    if (latest.status === "pendente_aprovacao" || latest.status === "verificado") return "aguardando_aprovacao";
    if (latest.status === "pendente_verificacao" || latest.status === "rejeitado_verificacao" || latest.status === "rejeitado") return "aguardando_verificacao";
  }
  return (foundEn.status as EnsaioStatus) || workflowToStatus(foundEn.workflowStatus);
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toSerializableJson(value: unknown): SerializableJson | undefined {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as SerializableJson;
  } catch {
    return undefined;
  }
}

export type LabEnsaioSnapshot = {
  os: {
    id: string;
    numero: string;
    client?: string;
    workNumber?: string;
    local?: string;
    operator?: string;
    technicalResp?: string;
    revision?: string;
  };
  amostra: {
    id: string;
    reportNumber?: string;
    code?: string;
    description?: string;
    granulometricDescription?: string;
    borehole?: string;
    depth?: string;
    coords?: Coords;
  };
  ensaio: {
    id: string;
    tipo: EnsaioTipo;
    label?: string;
    status: EnsaioStatus;
    payload?: SerializableJson;
    photos?: Photo[];
  };
};

/**
 * Recupera os metadados mínimos de um ensaio pelo scope_id do fluxo de emissões.
 * Usado quando o usuário abre direto o botão "Ir para ensaio" e o estado local
 * de OS/Amostras ainda não foi hidratado no navegador.
 */
export const getLabEnsaioSnapshot = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => SnapshotInput.parse(v))
  .handler(async ({ data }): Promise<LabEnsaioSnapshot | null> => {
    const ids = parseScope(data.scopeId);
    if (!ids) return null;

    // Lê diretamente os arquivos individuais do Drive (fonte de verdade
    // atual). Cada leitura é O(1) - sabemos o nome exato do arquivo pelos
    // IDs no scopeId, sem precisar escanear/ler o resto.
    try {
      const { ensureFolderPath, readDriveJson } = await import("@/lib/driveStorage");

      const osFolderId = await ensureFolderPath(["lab-os"]);
      const foundOs = await readDriveJson<any>(`${ids.osId}.json`, osFolderId);
      if (!foundOs) return null;

      const amFolderId = await ensureFolderPath(["lab-amostras"]);
      const foundAm = await readDriveJson<any>(`${ids.osId}__${ids.amostraId}.json`, amFolderId);
      if (!foundAm) return null;

      const enFolderId = await ensureFolderPath(["lab-ensaios"]);
      const foundEn = await readDriveJson<any>(`${ids.amostraId}__${ids.ensaioId}.json`, enFolderId);
      if (!foundEn) return null;

      return {
        os: {
          id: foundOs.id,
          numero: foundOs.numero || ids.osId,
          client: foundOs.client,
          workNumber: foundOs.workNumber,
          local: foundOs.local,
          operator: foundOs.operator,
          technicalResp: foundOs.technicalResp,
          revision: foundOs.revision,
        },
        amostra: {
          id: foundAm.id,
          reportNumber: foundAm.reportNumber,
          code: foundAm.code,
          description: foundAm.description,
          granulometricDescription: foundAm.granulometricDescription,
          borehole: foundAm.borehole,
          depth: foundAm.depth,
          coords: foundAm.coords,
        },
        ensaio: {
          id: foundEn.id,
          tipo: foundEn.tipo,
          label: foundEn.label,
          status: deriveStatus(foundEn),
          payload: toSerializableJson(foundEn.payload),
          photos: Array.isArray(foundEn.photos) ? (foundEn.photos as Photo[]) : [],
        },
      };
    } catch (err) {
      console.warn("[getLabEnsaioSnapshot] Falha ao ler arquivos do Drive:", err);
      return null;
    }
  });