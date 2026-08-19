import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function normStr(s?: string | null) {
  return (s || "").trim().toLowerCase();
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
          workflow_status: "digitacao",
          extra: payload,
          updated_at: nowIso,
        });
      } catch (e) {
        console.warn("[saveSharedDraft] Aviso ao salvar lab_index:", e);
      }

      // 2. Se for uma pendência vinculada ou avulsa, atualiza o payload e status em lab_pendencias_digitacao
      try {
        let pTargetId: string | null = null;
        let pTargetStatus: string = "em_digitacao";

        // Tenta por ID direto (se scopeId for UUID da pendencia)
        const { data: pById } = await supabaseAdmin
          .from("lab_pendencias_digitacao")
          .select("id, status")
          .eq("id", scopeId)
          .limit(1);

        if (pById && pById.length > 0) {
          pTargetId = pById[0].id;
          pTargetStatus = pById[0].status === "pendente" ? "em_digitacao" : pById[0].status;
        } else if (osNumero && amostraCode) {
          // Tenta buscar por OS, Amostra e Tipo de Ensaio
          const { data: rows } = await supabaseAdmin
            .from("lab_pendencias_digitacao")
            .select("id, status, ensaio, tipo_ensaio")
            .eq("os", osNumero)
            .eq("amostra", amostraCode);

          if (rows && rows.length > 0) {
            // Tenta match exato por tipo/ensaio
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
          await supabaseAdmin
            .from("lab_pendencias_digitacao")
            .update({
              payload: payload as never,
              status: pTargetStatus,
              updated_at: nowIso,
            })
            .eq("id", pTargetId);
        } else if (osNumero) {
          // Se não encontrou pendência existente, insere nova pendência em digitação
          await supabaseAdmin.from("lab_pendencias_digitacao").insert({
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
        const { data: indexRows } = await supabaseAdmin
          .from("lab_index")
          .select("extra, updated_at")
          .eq("scope_id", scopeId)
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

      // 2. Tenta buscar em lab_pendencias_digitacao
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
