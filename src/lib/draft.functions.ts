import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ensureFolderPath, readDriveJson, writeDriveJson } from "@/lib/driveStorage";
import type { SerializableJson } from "@/lib/lab-entities.functions";
import { FOLDER_ENSAIOS, ensaioFileName, toSerializableJson, type EnsaioFile, type DraftHistoryEntry } from "@/lib/lab-entities.functions";

function normStr(s?: string | null) {
  return (s || "").trim().toLowerCase();
}

export function getCanonicalScopeId(osNum?: string | null, amCode?: string | null, ensaioKind?: string | null): string {
  const cleanOs = normStr(osNum).replace(/[^a-z0-9_-]/g, "_");
  const cleanAm = normStr(amCode).replace(/[^a-z0-9_-]/g, "_");
  const cleanEn = normStr(ensaioKind).replace(/[^a-z0-9_-]/g, "_");
  return `os/${cleanOs || "os"}/amostra/${cleanAm || "amostra"}/ensaio/${cleanEn || "ensaio"}`;
}

/** Extrai osId/amostraId/ensaioId de um scopeId no formato os/{id}/amostra/{id}/ensaio/{id}. */
function parseScope(scopeId: string): { osId: string; amostraId: string; ensaioId: string } | null {
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

/**
 * Calcula diff raso/recursivo entre dois payloads JSON para histórico de auditoria.
 */
export function computeJsonDiff(
  oldObj: Record<string, any> | null | undefined,
  newObj: Record<string, any> | null | undefined,
  prefix = ""
): Record<string, { de: any; para: any }> {
  const diffs: Record<string, { de: any; para: any }> = {};
  const o = oldObj || {};
  const n = newObj || {};

  const allKeys = new Set([...Object.keys(o), ...Object.keys(n)]);

  for (const key of allKeys) {
    if (key === "updatedAt" || key === "timestamp") continue;
    const path = prefix ? `${prefix}.${key}` : key;
    const vOld = o[key];
    const vNew = n[key];

    if (vOld === vNew) continue;

    // Se ambos são objetos (e não arrays/null), desce um nível
    if (
      vOld &&
      vNew &&
      typeof vOld === "object" &&
      typeof vNew === "object" &&
      !Array.isArray(vOld) &&
      !Array.isArray(vNew)
    ) {
      const nested = computeJsonDiff(vOld, vNew, path);
      Object.assign(diffs, nested);
    } else {
      const strOld = JSON.stringify(vOld);
      const strNew = JSON.stringify(vNew);
      if (strOld !== strNew) {
        diffs[path] = { de: vOld ?? null, para: vNew ?? null };
      }
    }
  }

  return diffs;
}

const MAX_HISTORY = 40;

// Caminho genérico (não é um ensaio específico) para usos como o catálogo
// de anéis (scopeId "config/aneis_catalog") — um pequeno armazém
// chave→valor no Drive, com o mesmo controle de rev.
const FOLDER_KV = ["lab-kv"];
type KvFile = { payload: SerializableJson; rev: number; updatedAt: string };
function kvFileName(scopeId: string) {
  return `${scopeId.replace(/[^a-zA-Z0-9_.-]+/g, "_")}.json`;
}

const SaveDraftInput = z.object({
  scopeId: z.string().min(1),
  payload: z.any(),
  expectedRev: z.number().int().optional(),
  changedBy: z.string().optional(),
  changedByName: z.string().optional(),
});

export const saveSharedDraft = createServerFn({ method: "POST" })
  .validator((d: z.infer<typeof SaveDraftInput>) => d)
  .handler(async ({ data }) => {
    try {
      const nowIso = new Date().toISOString();
      const payload = data.payload;
      const ids = parseScope(data.scopeId);

      if (!ids) {
        // Chave genérica (ex: catálogo de anéis) — armazém chave→valor simples.
        const kvFolderId = await ensureFolderPath(FOLDER_KV);
        const kvName = kvFileName(data.scopeId);
        const kvExisting = await readDriveJson<KvFile>(kvName, kvFolderId);
        if (
          kvExisting &&
          typeof data.expectedRev === "number" &&
          typeof kvExisting.rev === "number" &&
          kvExisting.rev > data.expectedRev
        ) {
          return {
            success: false,
            conflict: true,
            currentRev: kvExisting.rev,
            currentPayload: kvExisting.payload,
            message: "Este item foi alterado em outro computador.",
          };
        }
        const kvNextRev = (kvExisting?.rev ?? 0) + 1;
        await writeDriveJson(kvName, { payload, rev: kvNextRev, updatedAt: nowIso } as KvFile, kvFolderId);
        return { success: true, rev: kvNextRev };
      }

      const folderId = await ensureFolderPath(FOLDER_ENSAIOS);
      const name = ensaioFileName(ids.amostraId, ids.ensaioId);
      const existing = await readDriveJson<EnsaioFile>(name, folderId);

      // Verificação de Concorrência Otimista (Optimistic Locking) — usa um
      // contador dedicado ao rascunho (draftRev), separado do rev geral da
      // entidade (que também é incrementado por fotos/status/aprovações).
      // Comparar contra o rev geral fazia esse aviso disparar sem ninguém
      // mais de fato ter editado o rascunho.
      const currentDraftRev = existing?.draftRev ?? existing?.rev ?? 0;
      if (existing && typeof data.expectedRev === "number" && currentDraftRev > data.expectedRev) {
        return {
          success: false,
          conflict: true,
          currentRev: currentDraftRev,
          currentPayload: toSerializableJson(existing.payload) ?? null,
          message: "Este relatório foi alterado em outro computador enquanto você digitava.",
        };
      }

      const nextRev = currentDraftRev + 1;

      // Diff de auditoria
      const oldPayload = (existing?.payload as Record<string, any>) || {};
      const diff = computeJsonDiff(oldPayload, payload);
      const history: DraftHistoryEntry[] = existing?.draftHistory ? [...existing.draftHistory] : [];
      if (Object.keys(diff).length > 0) {
        history.unshift({
          changedAt: nowIso,
          changedBy: data.changedBy || null,
          changedByName: data.changedByName || "Operador",
          diff,
        });
        if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
      }

      const file: EnsaioFile = {
        id: ids.ensaioId,
        amostraId: ids.amostraId,
        tipo: existing?.tipo || "cisalhamento-direto",
        status: existing?.status ?? null,
        label: existing?.label ?? null,
        nome: existing?.nome ?? null,
        sigla: existing?.sigla ?? null,
        operator: existing?.operator ?? null,
        photos: existing?.photos ?? [],
        payload,
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
        // rev geral da entidade não é tocado pelo rascunho — evita corrida
        // com fotos/status, que também gravam neste mesmo arquivo (ver
        // draftRev abaixo, dedicado só ao controle de concorrência do rascunho).
        rev: existing?.rev ?? 0,
        draftRev: nextRev,
        workflowStatus: existing?.workflowStatus,
        approvals: existing?.approvals,
        // Preserva aprovações/comentários já registrados — sem isso, cada
        // autosave do rascunho (a cada poucos segundos de digitação) apagava
        // silenciosamente o histórico de verificação/aprovação do ensaio.
        reportApprovals: existing?.reportApprovals,
        approvalComments: existing?.approvalComments,
        draftHistory: history,
      };

      await writeDriveJson(name, file, folderId);

      return { success: true, rev: nextRev };
    } catch (err: any) {
      console.error("[saveSharedDraft] Erro fatal:", err);
      return { success: false, error: err?.message || String(err) };
    }
  });

export const loadSharedDraft = createServerFn({ method: "GET" })
  .validator((d: { scopeId: string; osNum?: string; amCode?: string; ensaioTipo?: string }) => d)
  .handler(async ({ data }) => {
    try {
      const ids = parseScope(data.scopeId);
      if (!ids) {
        const kvFolderId = await ensureFolderPath(FOLDER_KV);
        const kvExisting = await readDriveJson<KvFile>(kvFileName(data.scopeId), kvFolderId);
        if (kvExisting && kvExisting.payload != null) {
          return { success: true, payload: kvExisting.payload, rev: kvExisting.rev ?? 1, updatedAt: kvExisting.updatedAt };
        }
        return { success: true, payload: null, rev: 1 };
      }
      const folderId = await ensureFolderPath(FOLDER_ENSAIOS);
      const name = ensaioFileName(ids.amostraId, ids.ensaioId);
      const existing = await readDriveJson<EnsaioFile>(name, folderId);

      if (existing && existing.payload != null) {
        return {
          success: true,
          payload: existing.payload,
          rev: existing.draftRev ?? existing.rev ?? 1,
          updatedAt: existing.updatedAt,
        };
      }

      return { success: true, payload: null, rev: 1 };
    } catch (err: any) {
      console.warn("[loadSharedDraft] Falha ao ler rascunho:", err);
      return { success: false, payload: null, rev: 1, error: err?.message || String(err) };
    }
  });

export const listDraftHistory = createServerFn({ method: "GET" })
  .validator((d: { scopeId: string }) => d)
  .handler(async ({ data }) => {
    try {
      const ids = parseScope(data.scopeId);
      if (!ids) return { history: [] };
      const folderId = await ensureFolderPath(FOLDER_ENSAIOS);
      const name = ensaioFileName(ids.amostraId, ids.ensaioId);
      const existing = await readDriveJson<EnsaioFile>(name, folderId);
      return { history: existing?.draftHistory ?? [] };
    } catch (err: any) {
      console.warn("[listDraftHistory] Erro:", err);
      return { history: [] };
    }
  });
