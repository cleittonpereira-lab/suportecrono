import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function normStr(s?: string | null) {
  return (s || "").trim().toLowerCase();
}

export function getCanonicalScopeId(osNum?: string | null, amCode?: string | null, ensaioKind?: string | null): string {
  const cleanOs = normStr(osNum).replace(/[^a-z0-9_-]/g, "_");
  const cleanAm = normStr(amCode).replace(/[^a-z0-9_-]/g, "_");
  const cleanEn = normStr(ensaioKind).replace(/[^a-z0-9_-]/g, "_");
  return `os/${cleanOs || "os"}/amostra/${cleanAm || "amostra"}/ensaio/${cleanEn || "ensaio"}`;
}

export function hasMeaningfulData(payload: any): boolean {
  if (!payload) return false;
  if (Array.isArray(payload.photos) && payload.photos.length > 0) return true;
  if (Array.isArray(payload.specimens) && payload.specimens.length > 0) {
    for (const sp of payload.specimens) {
      if (sp.wetMass > 0 || sp.wetMassCPAnel > 0 || sp.normalStressTarget > 0 || sp.sigma3Target > 0) return true;
      if (Array.isArray(sp.shearData) && sp.shearData.some((r: any) => r.shearForceKgf > 0 || r.horizDispMm > 0)) return true;
      if (Array.isArray(sp.shear) && sp.shear.some((r: any) => r.loadCellKgf > 0 || r.dispMm > 0)) return true;
      if (Array.isArray(sp.capsules) && sp.capsules.some((c: any) => c.numero || c.tara > 0 || c.wet > 0)) return true;
      if (Array.isArray(sp.initialCapsules) && sp.initialCapsules.some((c: any) => c.numero || c.tara > 0 || c.wet > 0)) return true;
      if (Array.isArray(sp.finalCapsules) && sp.finalCapsules.some((c: any) => c.numero || c.tara > 0 || c.wet > 0)) return true;
    }
  }
  if (Array.isArray(payload.stages) && payload.stages.some((st: any) => st.sigma > 0 || st.finalDial > 0)) return true;
  return false;
}

export const saveSharedDraft = createServerFn({ method: "POST" })
  .validator((d: { scopeId: string; payload: any }) => d)
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const nowIso = new Date().toISOString();
      const scopeId = data.scopeId;
      const payload = data.payload;

      // Extrai metadados do payload se existirem
      const sample = payload?.sample || {};
      const osNumero = sample.os || sample.os_numero || null;
      const osCliente = sample.client || sample.cliente || null;
      const amostraCode = sample.code || sample.reportNumber || sample.amostra || null;
      const ensaioNome = sample.equipment || sample.ensaio || "Ensaio";
      const ensaioTipo = sample.tipo || sample.tipo_ensaio || "cisalhamento-direto";

      const canonicalId = getCanonicalScopeId(osNumero, amostraCode, ensaioTipo);
      const incomingHasData = hasMeaningfulData(payload);

      // Proteção contra sobrescrita por estado vazio inicial
      if (!incomingHasData && (osNumero || scopeId)) {
        try {
          const queryIds = Array.from(new Set([scopeId, canonicalId].filter(Boolean) as string[]));
          const { data: existingRows } = await supabaseAdmin
            .from("lab_index")
            .select("extra")
            .in("scope_id", queryIds)
            .limit(1);

          if (existingRows && existingRows.length > 0 && hasMeaningfulData(existingRows[0].extra)) {
            console.log("[saveSharedDraft] Sobrescrita bloqueada: o rascunho existente no banco possui dados preenchidos e o payload de envio está vazio.");
            return { success: true, preserved: true };
          }
        } catch {}
      }

      // 1. Grava no lab_index sob o scopeId da rota E o canonicalId determinístico
      let labIndexError: string | null = null;
      try {
        const rowData = {
          os_numero: osNumero,
          os_cliente: osCliente,
          amostra_code: amostraCode,
          ensaio_nome: ensaioNome,
          ensaio_tipo: ensaioTipo,
          workflow_status: "digitacao",
          extra: payload,
          updated_at: nowIso,
        };

        const results = await Promise.all([
          supabaseAdmin.from("lab_index").upsert({ scope_id: scopeId, ...rowData }),
          canonicalId !== scopeId ? supabaseAdmin.from("lab_index").upsert({ scope_id: canonicalId, ...rowData }) : Promise.resolve({ error: null }),
        ]);

        for (const res of results) {
          if (res && (res as any).error) {
            labIndexError = (res as any).error.message || String((res as any).error);
            console.error("[saveSharedDraft] Erro Supabase lab_index:", (res as any).error);
          }
        }
      } catch (e: any) {
        labIndexError = e?.message || String(e);
        console.error("[saveSharedDraft] Exceção ao salvar lab_index:", e);
      }

      // 2. Se for uma pendência vinculada ou avulsa, atualiza o payload e status em lab_pendencias_digitacao
      try {
        let pTargetId: string | null = null;
        let pTargetStatus: string = "em_digitacao";

        const { data: pById } = await supabaseAdmin
          .from("lab_pendencias_digitacao")
          .select("id, status")
          .eq("id", scopeId)
          .limit(1);

        if (pById && pById.length > 0) {
          pTargetId = pById[0].id;
          pTargetStatus = pById[0].status === "pendente" ? "em_digitacao" : pById[0].status;
        } else if (osNumero && amostraCode) {
          const { data: rows } = await supabaseAdmin
            .from("lab_pendencias_digitacao")
            .select("id, status, ensaio, tipo_ensaio")
            .eq("os", osNumero)
            .eq("amostra", amostraCode);

          if (rows && rows.length > 0) {
            const matched = rows.find(
              (r) =>
                normStr(r.tipo_ensaio) === normStr(ensaioTipo) ||
                normStr(r.ensaio) === normStr(ensaioNome) ||
                normStr(r.ensaio).includes(normStr(ensaioTipo)),
            ) || rows[0];

            pTargetId = matched.id;
            pTargetStatus = matched.status === "pendente" ? "em_digitacao" : matched.status;
          }
        }

        if (pTargetId) {
          const { error: updErr } = await supabaseAdmin
            .from("lab_pendencias_digitacao")
            .update({
              payload: payload as never,
              status: pTargetStatus,
              updated_at: nowIso,
            })
            .eq("id", pTargetId);
          if (updErr) {
            console.error("[saveSharedDraft] Erro ao atualizar lab_pendencias_digitacao:", updErr.message);
          }
        } else if (osNumero) {
          const { error: insErr } = await supabaseAdmin.from("lab_pendencias_digitacao").insert({
            os: osNumero,
            amostra: amostraCode,
            ensaio: ensaioNome,
            tipo_ensaio: ensaioTipo,
            status: "em_digitacao",
            origem: "avulso",
            payload: payload as never,
            created_at: nowIso,
            updated_at: nowIso,
          });
          if (insErr) {
            console.error("[saveSharedDraft] Erro ao inserir lab_pendencias_digitacao:", insErr.message);
          }
        }
      } catch (e) {
        console.warn("[saveSharedDraft] Aviso ao atualizar lab_pendencias_digitacao:", e);
      }

      // 3. Backup local em disco se ambiente permitir
      try {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const draftDir = path.join(process.cwd(), ".data", "drafts");
        if (!fs.existsSync(draftDir)) {
          fs.mkdirSync(draftDir, { recursive: true });
        }
        const safeKey = sanitizeKey(data.scopeId);
        const filePath = path.join(draftDir, `${safeKey}.json`);
        fs.writeFileSync(filePath, JSON.stringify({ scopeId, payload, updatedAt: nowIso }, null, 2), "utf8");
      } catch {}

      if (labIndexError) {
        return { success: false, error: labIndexError };
      }

      return { success: true };
    } catch (err) {
      console.warn("Falha ao salvar rascunho compartilhado:", err);
      return { success: false, error: String(err) };
    }
  });

export const loadSharedDraft = createServerFn({ method: "GET" })
  .validator((d: { scopeId: string; osNum?: string; amCode?: string; ensaioTipo?: string }) => d)
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const scopeId = data.scopeId;
      const canonicalId = data.osNum && data.amCode ? getCanonicalScopeId(data.osNum, data.amCode, data.ensaioTipo) : null;

      // 1. Tenta buscar no lab_index por scopeId ou por canonicalId
      try {
        const queryIds = Array.from(new Set([scopeId, canonicalId].filter(Boolean) as string[]));
        const { data: indexRows } = await supabaseAdmin
          .from("lab_index")
          .select("extra, updated_at, os_numero, amostra_code")
          .in("scope_id", queryIds)
          .order("updated_at", { ascending: false })
          .limit(1);

        if (indexRows && indexRows.length > 0 && indexRows[0].extra) {
          return {
            success: true,
            payload: indexRows[0].extra,
            updatedAt: indexRows[0].updated_at,
          };
        }
      } catch (e) {
        console.warn("[loadSharedDraft] Aviso ao buscar lab_index:", e);
      }

      // 2. Busca por OS e Amostra no lab_index se não achou por ID direto
      if (data.osNum && data.amCode) {
        try {
          const { data: byOsRows } = await supabaseAdmin
            .from("lab_index")
            .select("extra, updated_at")
            .eq("os_numero", data.osNum)
            .eq("amostra_code", data.amCode)
            .order("updated_at", { ascending: false })
            .limit(1);

          if (byOsRows && byOsRows.length > 0 && byOsRows[0].extra) {
            return {
              success: true,
              payload: byOsRows[0].extra,
              updatedAt: byOsRows[0].updated_at,
            };
          }
        } catch {}
      }

      // 3. Tenta buscar em lab_pendencias_digitacao por ID ou por (OS, Amostra)
      try {
        const { data: pendRows } = await supabaseAdmin
          .from("lab_pendencias_digitacao")
          .select("payload, updated_at")
          .eq("id", scopeId)
          .limit(1);

        if (pendRows && pendRows.length > 0 && pendRows[0].payload) {
          return {
            success: true,
            payload: pendRows[0].payload,
            updatedAt: pendRows[0].updated_at,
          };
        }

        if (data.osNum && data.amCode) {
          const { data: pendByOs } = await supabaseAdmin
            .from("lab_pendencias_digitacao")
            .select("payload, updated_at")
            .eq("os", data.osNum)
            .eq("amostra", data.amCode)
            .order("updated_at", { ascending: false })
            .limit(1);

          if (pendByOs && pendByOs.length > 0 && pendByOs[0].payload) {
            return {
              success: true,
              payload: pendByOs[0].payload,
              updatedAt: pendByOs[0].updated_at,
            };
          }
        }
      } catch (e) {
        console.warn("[loadSharedDraft] Aviso ao buscar lab_pendencias_digitacao:", e);
      }

      // 4. Fallback: tenta buscar no disco local
      try {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const draftDir = path.join(process.cwd(), ".data", "drafts");
        const safeKey = sanitizeKey(data.scopeId);
        const filePath = path.join(draftDir, `${safeKey}.json`);
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, "utf8");
          const parsed = JSON.parse(raw);
          return { success: true, payload: parsed.payload, updatedAt: parsed.updatedAt };
        }
      } catch {}

      return { success: true, payload: null };
    } catch (err) {
      console.warn("Falha ao ler rascunho compartilhado:", err);
      return { success: false, payload: null, error: String(err) };
    }
  });
