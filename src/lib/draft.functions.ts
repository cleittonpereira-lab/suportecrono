import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function normStr(s?: string | null) {
  return (s || "").trim().toLowerCase();
}

export function getCanonicalScopeId(osNum?: string | null, amCode?: string | null, ensaioKind?: string | null): string {
  const cleanOs = normStr(osNum).replace(/[^a-z0-9_-]/g, "_");
  const cleanAm = normStr(amCode).replace(/[^a-z0-9_-]/g, "_");
  const cleanEn = normStr(ensaioKind).replace(/[^a-z0-9_-]/g, "_");
  return `os/${cleanOs || "os"}/amostra/${cleanAm || "amostra"}/ensaio/${cleanEn || "ensaio"}`;
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
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const nowIso = new Date().toISOString();
      const scopeId = data.scopeId;
      const payload = data.payload;

      // 1. Consulta versão e payload atual no Supabase
      const { data: existing, error: findErr } = await supabaseAdmin
        .from("lab_index")
        .select("scope_id, rev, extra, workflow_status")
        .eq("scope_id", scopeId)
        .maybeSingle();

      if (findErr) {
        console.warn("[saveSharedDraft] Erro ao buscar lab_index:", findErr);
      }

      // 2. Verificação de Concorrência Otimista (Optimistic Locking)
      if (
        existing &&
        typeof data.expectedRev === "number" &&
        typeof existing.rev === "number" &&
        existing.rev > data.expectedRev
      ) {
        return {
          success: false,
          conflict: true,
          currentRev: existing.rev,
          currentPayload: existing.extra,
          message: "Este relatório foi alterado em outro computador enquanto você digitava.",
        };
      }

      const nextRev = (existing?.rev ?? 0) + 1;

      // Extrai metadados do payload
      const sample = payload?.sample || {};
      const osNumero = sample.os || sample.os_numero || null;
      const osCliente = sample.client || sample.cliente || "Geral";
      const amostraCode = sample.code || sample.reportNumber || sample.amostra || null;
      const ensaioNome = sample.equipment || sample.ensaio || "Ensaio";
      const ensaioTipo = sample.tipo || sample.tipo_ensaio || "cisalhamento-direto";
      const canonicalId = getCanonicalScopeId(osNumero, amostraCode, ensaioTipo);

      // 3. Grava no Supabase (Fonte Soberana Transacional)
      const rowData = {
        scope_id: scopeId,
        os_numero: osNumero,
        os_cliente: osCliente,
        amostra_code: amostraCode,
        ensaio_nome: ensaioNome,
        ensaio_tipo: ensaioTipo,
        workflow_status: existing?.workflow_status || "digitacao",
        extra: payload,
        rev: nextRev,
        updated_at: nowIso,
      };

      const { error: upsertErr } = await supabaseAdmin.from("lab_index").upsert(rowData);
      if (upsertErr) {
        throw new Error(`Falha ao salvar rascunho no banco: ${upsertErr.message}`);
      }

      if (canonicalId !== scopeId) {
        try {
          await supabaseAdmin
            .from("lab_index")
            .upsert({ ...rowData, scope_id: canonicalId });
        } catch {}
      }

      // 4. Grava diff de auditoria no histórico
      const oldExtra = (existing?.extra as Record<string, any>) || {};
      const diff = computeJsonDiff(oldExtra, payload);
      if (Object.keys(diff).length > 0) {
        try {
          await supabaseAdmin.from("lab_draft_history").insert({
            scope_id: scopeId,
            rev: nextRev,
            changed_by: data.changedBy || null,
            changed_by_name: data.changedByName || "Operador",
            changed_at: nowIso,
            diff,
          });
        } catch (histErr) {
          console.warn("[saveSharedDraft] Aviso ao gravar histórico de auditoria:", histErr);
        }
      }

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
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const scopeId = data.scopeId;
      const canonicalId = data.osNum && data.amCode ? getCanonicalScopeId(data.osNum, data.amCode, data.ensaioTipo) : null;
      const queryIds = Array.from(new Set([scopeId, canonicalId].filter(Boolean) as string[]));

      // 1. Busca soberana no Supabase (lab_index)
      const { data: indexRows, error: idxErr } = await supabaseAdmin
        .from("lab_index")
        .select("extra, rev, updated_at, os_numero, amostra_code")
        .in("scope_id", queryIds)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (!idxErr && indexRows && indexRows.length > 0 && indexRows[0].extra) {
        return {
          success: true,
          payload: indexRows[0].extra,
          rev: indexRows[0].rev ?? 1,
          updatedAt: indexRows[0].updated_at,
        };
      }

      // 2. Busca por OS e Amostra no lab_index se não achou por ID direto
      if (data.osNum && data.amCode) {
        const { data: byOsRows } = await supabaseAdmin
          .from("lab_index")
          .select("extra, rev, updated_at")
          .eq("os_numero", data.osNum)
          .eq("amostra_code", data.amCode)
          .order("updated_at", { ascending: false })
          .limit(1);

        if (byOsRows && byOsRows.length > 0 && byOsRows[0].extra) {
          return {
            success: true,
            payload: byOsRows[0].extra,
            rev: byOsRows[0].rev ?? 1,
            updatedAt: byOsRows[0].updated_at,
          };
        }
      }

      // 3. Fallback retroativo: se não existe no banco, busca ensaio.json no Drive e auto-importa
      if (data.osNum && data.amCode) {
        try {
          const { ensureFolderPath, readDriveJson } = await import("./driveStorage");
          const ensFolder = data.ensaioTipo || "Ensaio";
          const folderId = await ensureFolderPath([data.osNum, data.amCode, ensFolder, "dados"]);
          const parsed = await readDriveJson<any>("ensaio.json", folderId);
          if (parsed) {
            const nowIso = new Date().toISOString();
            await supabaseAdmin.from("lab_index").upsert({
              scope_id: scopeId,
              os_numero: data.osNum,
              amostra_code: data.amCode,
              ensaio_tipo: data.ensaioTipo || "Ensaio",
              workflow_status: "digitacao",
              extra: parsed,
              rev: 1,
              updated_at: nowIso,
            });

            return {
              success: true,
              payload: parsed,
              rev: 1,
              updatedAt: nowIso,
            };
          }
        } catch {}
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
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rows, error } = await supabaseAdmin
        .from("lab_draft_history")
        .select("id, scope_id, rev, changed_by, changed_by_name, changed_at, diff")
        .eq("scope_id", data.scopeId)
        .order("changed_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return { history: rows || [] };
    } catch (err: any) {
      console.warn("[listDraftHistory] Erro:", err);
      return { history: [] };
    }
  });
