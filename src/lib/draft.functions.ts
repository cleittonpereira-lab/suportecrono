import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_");
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

      // 1. Grava no lab_index (tabela central de estados)
      try {
        await supabaseAdmin.from("lab_index").upsert({
          scope_id: scopeId,
          os_numero: osNumero,
          os_cliente: osCliente,
          amostra_code: amostraCode,
          ensaio_nome: ensaioNome,
          ensaio_tipo: ensaioTipo,
          workflow_status: "em_digitacao",
          extra: payload,
          updated_at: nowIso,
        });
      } catch (e) {
        console.warn("[saveSharedDraft] Aviso ao salvar lab_index:", e);
      }

      // 2. Se for uma pendência vinculada ou avulsa, atualiza o payload e status em lab_pendencias_digitacao
      try {
        // Tenta por ID direto
        const { data: byId } = await supabaseAdmin
          .from("lab_pendencias_digitacao")
          .select("id, status")
          .eq("id", scopeId)
          .maybeSingle();

        if (byId?.id) {
          const nextStatus = byId.status === "pendente" ? "em_digitacao" : byId.status;
          await supabaseAdmin
            .from("lab_pendencias_digitacao")
            .update({
              payload: payload as never,
              status: nextStatus,
              updated_at: nowIso,
            })
            .eq("id", byId.id);
        } else if (osNumero && amostraCode) {
          // Tenta por OS e Amostra
          const { data: byOsAm } = await supabaseAdmin
            .from("lab_pendencias_digitacao")
            .select("id, status")
            .eq("os", osNumero)
            .eq("amostra", amostraCode)
            .maybeSingle();

          if (byOsAm?.id) {
            const nextStatus = byOsAm.status === "pendente" ? "em_digitacao" : byOsAm.status;
            await supabaseAdmin
              .from("lab_pendencias_digitacao")
              .update({
                payload: payload as never,
                status: nextStatus,
                updated_at: nowIso,
              })
              .eq("id", byOsAm.id);
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

      return { success: true };
    } catch (err) {
      console.warn("Falha ao salvar rascunho compartilhado:", err);
      return { success: false, error: String(err) };
    }
  });

export const loadSharedDraft = createServerFn({ method: "GET" })
  .validator((d: { scopeId: string }) => d)
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const scopeId = data.scopeId;

      // 1. Tenta buscar no lab_index do Supabase
      try {
        const { data: indexRow } = await supabaseAdmin
          .from("lab_index")
          .select("extra, updated_at")
          .eq("scope_id", scopeId)
          .maybeSingle();

        if (indexRow?.extra) {
          return {
            success: true,
            payload: indexRow.extra,
            updatedAt: indexRow.updated_at,
          };
        }
      } catch (e) {
        console.warn("[loadSharedDraft] Aviso ao buscar lab_index:", e);
      }

      // 2. Tenta buscar em lab_pendencias_digitacao
      try {
        const { data: pendRow } = await supabaseAdmin
          .from("lab_pendencias_digitacao")
          .select("payload, updated_at")
          .eq("id", scopeId)
          .maybeSingle();

        if (pendRow?.payload) {
          return {
            success: true,
            payload: pendRow.payload,
            updatedAt: pendRow.updated_at,
          };
        }
      } catch (e) {
        console.warn("[loadSharedDraft] Aviso ao buscar lab_pendencias_digitacao:", e);
      }

      // 3. Fallback: tenta buscar no disco local
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
