import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ensureFolderPath, uploadBytesToDrive, findFileInFolder } from "./driveStorage";

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
      const nowIso = new Date().toISOString();
      const scopeId = data.scopeId;
      const payload = data.payload;

      // Extrai metadados do payload se existirem
      const sample = payload?.sample || {};
      const osNumero = sample.os || sample.os_numero || null;
      const osCliente = sample.client || sample.cliente || "Geral";
      const amostraCode = sample.code || sample.reportNumber || sample.amostra || null;
      const ensaioNome = sample.equipment || sample.ensaio || "Ensaio";
      const ensaioTipo = sample.tipo || sample.tipo_ensaio || "cisalhamento-direto";

      const canonicalId = getCanonicalScopeId(osNumero, amostraCode, ensaioTipo);
      const incomingHasData = hasMeaningfulData(payload);

      // 1. Grava no Google Drive na pasta do ensaio se OS e Amostra existirem
      if (osNumero && amostraCode) {
        try {
          const osFolder = `${osNumero} - ${osCliente}`;
          const ensFolder = ensaioNome || ensaioTipo;
          const folderId = await ensureFolderPath([osFolder, amostraCode, ensFolder, "dados"]);
          const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
          await uploadBytesToDrive({
            parentId: folderId,
            name: "ensaio.json",
            mimeType: "application/json",
            bytes,
            overwrite: true,
          });
        } catch (err) {
          console.warn("[saveSharedDraft] Aviso ao gravar ensaio.json no Drive:", err);
        }
      }

      // 2. Backup local em disco
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

      // 3. Espelho no Supabase de forma não-bloqueante
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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

        await Promise.allSettled([
          supabaseAdmin.from("lab_index").upsert({ scope_id: scopeId, ...rowData }),
          canonicalId !== scopeId ? supabaseAdmin.from("lab_index").upsert({ scope_id: canonicalId, ...rowData }) : Promise.resolve(),
        ]);
      } catch {}

      return { success: true };
    } catch (err) {
      console.warn("Falha ao salvar rascunho:", err);
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

      // 0. Tenta buscar diretamente do Google Drive (dados/ensaio.json)
      if (data.osNum && data.amCode) {
        try {
          const { ensureFolderPath, readDriveJson } = await import("./driveStorage");
          const ensFolder = data.ensaioTipo || "Ensaio";
          const folderId = await ensureFolderPath([data.osNum, data.amCode, ensFolder, "dados"]);
          const parsed = await readDriveJson<any>("ensaio.json", folderId);
          if (parsed) {
            return {
              success: true,
              payload: parsed,
              updatedAt: new Date().toISOString(),
            };
          }
        } catch {}
      }

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
