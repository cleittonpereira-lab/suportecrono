import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EnsaioStatus, EnsaioTipo, Coords } from "@/features/lab/types";

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

    // 1. Tenta buscar no Google Drive (_lab-state.json)
    try {
      const { readDriveJson } = await import("@/lib/driveStorage");
      const globalState = await readDriveJson<any>("_lab-state.json");
      if (globalState?.os && Array.isArray(globalState.os)) {
        const foundOs = globalState.os.find((o: any) => o.id === ids.osId);
        if (foundOs) {
          const foundAm = (foundOs.amostras || []).find((a: any) => a.id === ids.amostraId);
          if (foundAm) {
            const foundEn = (foundAm.ensaios || []).find((e: any) => e.id === ids.ensaioId);
            if (foundEn) {
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
                  status: foundEn.status || "rascunho",
                  payload: toSerializableJson(foundEn.payload),
                },
              };
            }
          }
        }
      }
    } catch {}

    // 2. Fallback no Supabase lab_index
    let idx: any = null;
    let pendPayload: Record<string, unknown> = {};

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: idxRow } = await supabaseAdmin
        .from("lab_index")
        .select("scope_id, os_numero, os_cliente, amostra_code, ensaio_tipo, ensaio_nome, workflow_status, extra")
        .eq("scope_id", data.scopeId)
        .maybeSingle();

      idx = idxRow;
      if (idx?.extra) {
        pendPayload = asObject(idx.extra);
      }
    } catch {}

    if (!idx) return null;

    const osNumero = String(idx.os_numero ?? "").trim();
    const amostraCode = String(idx.amostra_code ?? "").trim();
    const ident = asObject(pendPayload.ident);
    const tipoRaw = idx.ensaio_tipo;
    const tipo = isEnsaioTipo(tipoRaw) ? tipoRaw : (String(tipoRaw).includes("cisalhamento") ? "cisalhamento-direto" : "triaxial-cid");
    const payload = Object.keys(pendPayload).length > 0 ? pendPayload : undefined;

    return {
      os: {
        id: ids.osId,
        numero: osNumero || ids.osId,
        client: String(idx.os_cliente ?? ident.tomador ?? ""),
        workNumber: "",
        local: String(ident.obra ?? ""),
      },
      amostra: {
        id: ids.amostraId,
        reportNumber: amostraCode,
        code: amostraCode,
        description: String(ident.amostraDescricao ?? ""),
        borehole: String(ident.furo ?? ""),
        depth: String(ident.profundidade ?? ""),
      },
      ensaio: {
        id: ids.ensaioId,
        tipo,
        label: String(idx.ensaio_nome ?? ""),
        status: workflowToStatus(idx.workflow_status),
        payload: toSerializableJson(payload),
      },
    };
  });