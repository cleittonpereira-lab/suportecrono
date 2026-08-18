import { createServerFn } from "@tanstack/react-start";
import fs from "node:fs";
import path from "node:path";

const DRAFT_DIR = path.join(process.cwd(), ".data", "drafts");

function ensureDraftDir() {
  if (!fs.existsSync(DRAFT_DIR)) {
    fs.mkdirSync(DRAFT_DIR, { recursive: true });
  }
}

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export const saveSharedDraft = createServerFn({ method: "POST" })
  .validator((d: { scopeId: string; payload: any }) => d)
  .handler(async ({ data }) => {
    try {
      ensureDraftDir();
      const safeKey = sanitizeKey(data.scopeId);
      const filePath = path.join(DRAFT_DIR, `${safeKey}.json`);
      const fileData = {
        scopeId: data.scopeId,
        payload: data.payload,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2), "utf8");
      return { success: true };
    } catch (err) {
      console.warn("Falha ao salvar rascunho compartilhado em disco:", err);
      return { success: false, error: String(err) };
    }
  });

export const loadSharedDraft = createServerFn({ method: "GET" })
  .validator((d: { scopeId: string }) => d)
  .handler(async ({ data }) => {
    try {
      ensureDraftDir();
      const safeKey = sanitizeKey(data.scopeId);
      const filePath = path.join(DRAFT_DIR, `${safeKey}.json`);
      if (!fs.existsSync(filePath)) {
        return { success: true, payload: null };
      }
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      return { success: true, payload: parsed.payload, updatedAt: parsed.updatedAt };
    } catch (err) {
      console.warn("Falha ao ler rascunho compartilhado:", err);
      return { success: false, payload: null, error: String(err) };
    }
  });
