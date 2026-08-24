/**
 * Estado central do laboratório persistido de forma SOBERANA no Google Drive (`_lab-state.json`).
 * Todas as OS, amostras e ensaios ficam sincronizados em tempo real entre todas as máquinas do laboratório.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { readDriveJson, writeDriveJson, DRIVE_ROOT_FOLDER_ID } from "./driveStorage";

const STATE_FILENAME = "_lab-state.json";
const GLOBAL_SCOPE_ID = "__global_lab_state__";

export const loadLabStateFromDrive = createServerFn({ method: "GET" })
  .handler(async () => {
    // 1. Tenta carregar do Google Drive (Fonte Primária Soberana)
    try {
      const state = await readDriveJson<any>(STATE_FILENAME, DRIVE_ROOT_FOLDER_ID);
      if (state) {
        const stateJson = typeof state === "string" ? state : JSON.stringify(state);
        return { stateJson, fileId: "gdrive", updatedAt: new Date().toISOString() };
      }
    } catch (err) {
      console.warn("[loadLabState] Aviso ao ler do Google Drive:", err);
    }

    // 2. Fallback secundário no Supabase se existir
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row } = await supabaseAdmin
        .from("lab_index")
        .select("extra, updated_at")
        .eq("scope_id", GLOBAL_SCOPE_ID)
        .maybeSingle();

      if (row?.extra) {
        const stateJson = typeof row.extra === "string" ? row.extra : JSON.stringify(row.extra);
        return { stateJson, fileId: "supabase", updatedAt: row.updated_at };
      }
    } catch {}

    // 3. Fallback em arquivo local se existir
    try {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const localFile = path.join(process.cwd(), ".data", "lab-state.json");
      if (fs.existsSync(localFile)) {
        const stateJson = fs.readFileSync(localFile, "utf8");
        return { stateJson, fileId: "local" };
      }
    } catch {}

    return { stateJson: null as string | null, fileId: null as string | null };
  });

const SaveLabStateInput = z.object({
  stateJson: z.string().min(2),
});

export const saveLabStateToDrive = createServerFn({ method: "POST" })
  .validator((input: unknown) => SaveLabStateInput.parse(input))
  .handler(async ({ data }) => {
    const nowIso = new Date().toISOString();
    let parsed: any = null;
    try {
      parsed = JSON.parse(data.stateJson);
    } catch {
      parsed = data.stateJson;
    }

    // 1. Grava no Google Drive (Fonte Primária Soberana)
    try {
      await writeDriveJson(STATE_FILENAME, parsed, DRIVE_ROOT_FOLDER_ID);
    } catch (err) {
      console.error("[saveLabState] Erro ao gravar no Google Drive:", err);
    }

    // 2. Grava no Supabase como espelho secundário (não-bloqueante)
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("lab_index").upsert({
        scope_id: GLOBAL_SCOPE_ID,
        os_numero: "GLOBAL",
        ensaio_nome: "Lab State",
        workflow_status: "sincronizado",
        extra: parsed,
        updated_at: nowIso,
      });
    } catch {}

    return { ok: true, fileId: "gdrive", savedAt: nowIso };
  });

