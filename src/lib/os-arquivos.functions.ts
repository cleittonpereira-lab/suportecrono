import { createServerFn } from "@tanstack/react-start";
import fs from "fs";
import path from "path";

/**
 * Integração com Google Drive e fallback local em disco para Notas & Arquivos de OS.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const ROOT_CHAIN = ["AppRecebimento", "programação", "ProgramaçãoEnsaios"] as const;

function env() {
  const e = process.env as Record<string, string | undefined>;
  return {
    LOVABLE_API_KEY: e.LOVABLE_API_KEY ?? "",
    GOOGLE_DRIVE_API_KEY: e.GOOGLE_DRIVE_API_KEY ?? "",
  };
}

function hasDriveAuth() {
  const e = env();
  return Boolean(e.LOVABLE_API_KEY && e.GOOGLE_DRIVE_API_KEY);
}

function authHeaders() {
  const e = env();
  return {
    Authorization: `Bearer ${e.LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": e.GOOGLE_DRIVE_API_KEY,
  };
}

async function driveGet(urlPath: string) {
  const res = await fetch(`${GATEWAY}${urlPath}`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function findFolderByName(name: string, parentId: string | null): Promise<string | null> {
  const esc = name.replace(/'/g, "\\'");
  const scope = parentId ? ` and '${parentId}' in parents` : "";
  const q = `mimeType='application/vnd.google-apps.folder' and name='${esc}'${scope} and trashed=false`;
  const url = `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=10&includeItemsFromAllDrives=true&supportsAllDrives=true&corpora=allDrives`;
  const j = await driveGet(url);
  const files: Array<{ id: string; name: string }> = j.files ?? [];
  const exact = files.find((f) => f.name === name);
  return exact?.id ?? null;
}

async function createFolder(name: string, parentId: string | null): Promise<string> {
  const metadata: Record<string, unknown> = {
    name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (parentId) metadata.parents = [parentId];
  const res = await fetch(`${GATEWAY}/drive/v3/files?supportsAllDrives=true&fields=id`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Falha ao criar pasta "${name}": ${res.status} ${t.slice(0, 200)}`);
  }
  const created = (await res.json()) as { id: string };
  return created.id;
}

async function resolveRootChain(opts?: { createIfMissing?: boolean }): Promise<string | null> {
  let parent: string | null = null;
  for (const name of ROOT_CHAIN) {
    const found: string | null = await findFolderByName(name, parent);
    if (found) {
      parent = found;
      continue;
    }
    if (!opts?.createIfMissing) return null;
    parent = await createFolder(name, parent);
  }
  return parent;
}

async function resolveOsFolderId(os: string, opts?: { createIfMissing?: boolean }): Promise<string | null> {
  const trimmed = os.trim().replace(/^OS\s+/i, "");
  if (!trimmed) throw new Error("OS vazia");
  const rootId = await resolveRootChain({ createIfMissing: opts?.createIfMissing });
  if (!rootId) return null;
  const folderName = `OS ${trimmed}`;
  const existing = await findFolderByName(folderName, rootId);
  if (existing) return existing;
  if (!opts?.createIfMissing) return null;
  return createFolder(folderName, rootId);
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
};

/* ------------------ Armazenamento Local em Disco (Fallback) ------------------ */

const LOCAL_DATA_DIR = path.join(process.cwd(), ".data");
const NOTES_DIR = path.join(LOCAL_DATA_DIR, "os_notes");
const FILES_DIR = path.join(LOCAL_DATA_DIR, "os_files");

function cleanOsKey(os: string): string {
  return os.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
}

function ensureLocalDirs(osKey: string) {
  if (!fs.existsSync(NOTES_DIR)) fs.mkdirSync(NOTES_DIR, { recursive: true });
  const osFilesDir = path.join(FILES_DIR, osKey);
  if (!fs.existsSync(osFilesDir)) fs.mkdirSync(osFilesDir, { recursive: true });
  return { osFilesDir };
}

/* --------------------------------- RPCs ---------------------------------- */

export const listOsFiles = createServerFn({ method: "GET" })
  .inputValidator((d: { os: string }) => d)
  .handler(async ({ data }) => {
    if (hasDriveAuth()) {
      try {
        const folderId = await resolveOsFolderId(data.os);
        if (folderId) {
          const q = `'${folderId}' in parents and trashed=false`;
          const fields = "files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink,thumbnailLink)";
          const url = `/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=100&orderBy=modifiedTime desc&includeItemsFromAllDrives=true&supportsAllDrives=true&corpora=allDrives`;
          const j = await driveGet(url);
          return {
            folderId: folderId as string | null,
            folderUrl: `https://drive.google.com/drive/folders/${folderId}` as string | null,
            files: (j.files ?? []).filter((f: any) => f.name !== "_notas.md") as DriveFile[],
          };
        }
      } catch {
        // Fallback para armazenamento local
      }
    }

    const osKey = cleanOsKey(data.os);
    const { osFilesDir } = ensureLocalDirs(osKey);
    const files: DriveFile[] = [];
    if (fs.existsSync(osFilesDir)) {
      const items = fs.readdirSync(osFilesDir);
      for (const item of items) {
        const filePath = path.join(osFilesDir, item);
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          const parts = item.split("__");
          const fileId = parts[0] || item;
          const fileName = parts.slice(1).join("__") || item;
          files.push({
            id: `${osKey}:::${item}`,
            name: fileName,
            mimeType: fileName.endsWith(".pdf") ? "application/pdf" : fileName.endsWith(".png") ? "image/png" : "image/jpeg",
            size: String(stat.size),
            modifiedTime: stat.mtime.toISOString(),
          });
        }
      }
    }
    return {
      folderId: `local-${osKey}`,
      folderUrl: null,
      files,
    };
  });

export const uploadOsFile = createServerFn({ method: "POST" })
  .inputValidator((d: { os: string; name: string; mimeType: string; base64: string }) => d)
  .handler(async ({ data }) => {
    if (hasDriveAuth()) {
      try {
        const folderId = await resolveOsFolderId(data.os, { createIfMissing: true });
        if (folderId) {
          const boundary = `----lovable-${crypto.randomUUID()}`;
          const metadata = { name: data.name, mimeType: data.mimeType, parents: [folderId] };
          const bin = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
          const enc = new TextEncoder();
          const head = enc.encode(
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
              `--${boundary}\r\nContent-Type: ${data.mimeType}\r\n\r\n`,
          );
          const tail = enc.encode(`\r\n--${boundary}--`);
          const body = new Uint8Array(head.length + bin.length + tail.length);
          body.set(head, 0);
          body.set(bin, head.length);
          body.set(tail, head.length + bin.length);

          const url = `${GATEWAY}/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,modifiedTime,webViewLink,iconLink,thumbnailLink`;
          const res = await fetch(url, {
            method: "POST",
            headers: {
              ...authHeaders(),
              "Content-Type": `multipart/related; boundary=${boundary}`,
            },
            body,
          });
          if (res.ok) {
            return (await res.json()) as DriveFile;
          }
        }
      } catch {
        // Fallback local
      }
    }

    const osKey = cleanOsKey(data.os);
    const { osFilesDir } = ensureLocalDirs(osKey);
    const id = crypto.randomUUID().slice(0, 8);
    const filename = `${id}__${data.name}`;
    const filePath = path.join(osFilesDir, filename);
    const buffer = Buffer.from(data.base64, "base64");
    fs.writeFileSync(filePath, buffer);

    return {
      id: `${osKey}:::${filename}`,
      name: data.name,
      mimeType: data.mimeType,
      size: String(buffer.length),
      modifiedTime: new Date().toISOString(),
    };
  });

export const deleteOsFile = createServerFn({ method: "POST" })
  .inputValidator((d: { fileId: string }) => d)
  .handler(async ({ data }) => {
    if (hasDriveAuth() && !data.fileId.includes(":::")) {
      try {
        const res = await fetch(`${GATEWAY}/drive/v3/files/${data.fileId}?supportsAllDrives=true`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        if (res.ok || res.status === 204) return { ok: true };
      } catch {
        // Fallback local
      }
    }

    if (data.fileId.includes(":::")) {
      const [osKey, filename] = data.fileId.split(":::");
      const filePath = path.join(FILES_DIR, osKey, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    return { ok: true };
  });

export const fetchOsFileContent = createServerFn({ method: "GET" })
  .inputValidator((d: { fileId: string }) => d)
  .handler(async ({ data }) => {
    if (hasDriveAuth() && !data.fileId.includes(":::")) {
      try {
        const meta = await driveGet(
          `/drive/v3/files/${data.fileId}?fields=id,name,mimeType,size&supportsAllDrives=true`,
        );
        const res = await fetch(
          `${GATEWAY}/drive/v3/files/${data.fileId}?alt=media&supportsAllDrives=true`,
          { headers: authHeaders() },
        );
        if (res.ok) {
          const buf = new Uint8Array(await res.arrayBuffer());
          let binary = "";
          const chunk = 0x8000;
          for (let i = 0; i < buf.length; i += chunk) {
            binary += String.fromCharCode(...buf.subarray(i, i + chunk));
          }
          return {
            id: meta.id as string,
            name: meta.name as string,
            mimeType: meta.mimeType as string,
            base64: btoa(binary),
          };
        }
      } catch {
        // Fallback local
      }
    }

    if (data.fileId.includes(":::")) {
      const [osKey, filename] = data.fileId.split(":::");
      const filePath = path.join(FILES_DIR, osKey, filename);
      if (fs.existsSync(filePath)) {
        const buffer = fs.readFileSync(filePath);
        const base64 = buffer.toString("base64");
        const parts = filename.split("__");
        const name = parts.slice(1).join("__") || filename;
        return {
          id: data.fileId,
          name,
          mimeType: name.endsWith(".pdf") ? "application/pdf" : name.endsWith(".png") ? "image/png" : "image/jpeg",
          base64,
        };
      }
    }
    throw new Error("Arquivo não encontrado");
  });

export const getOsNotes = createServerFn({ method: "GET" })
  .inputValidator((d: { os: string }) => d)
  .handler(async ({ data }) => {
    if (hasDriveAuth()) {
      try {
        const folderId = await resolveOsFolderId(data.os);
        if (folderId) {
          const q = `'${folderId}' in parents and name='_notas.md' and trashed=false`;
          const url = `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)&pageSize=10&orderBy=modifiedTime desc&includeItemsFromAllDrives=true&supportsAllDrives=true&corpora=allDrives`;
          const j = await driveGet(url);
          const files = j.files ?? [];
          if (files.length > 0) {
            const res = await fetch(`${GATEWAY}/drive/v3/files/${files[0].id}?alt=media&supportsAllDrives=true`, {
              headers: authHeaders(),
            });
            if (res.ok) return { notes: await res.text() };
          }
        }
      } catch {
        // Fallback local
      }
    }

    const osKey = cleanOsKey(data.os);
    ensureLocalDirs(osKey);
    const noteFile = path.join(NOTES_DIR, `${osKey}.md`);
    if (fs.existsSync(noteFile)) {
      return { notes: fs.readFileSync(noteFile, "utf-8") };
    }
    return { notes: "" };
  });

export const saveOsNotes = createServerFn({ method: "POST" })
  .inputValidator((d: { os: string; notes: string }) => d)
  .handler(async ({ data }) => {
    if (hasDriveAuth()) {
      try {
        const folderId = await resolveOsFolderId(data.os, { createIfMissing: true });
        if (folderId) {
          const q = `'${folderId}' in parents and name='_notas.md' and trashed=false`;
          const url = `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,modifiedTime)&pageSize=10&orderBy=modifiedTime desc&includeItemsFromAllDrives=true&supportsAllDrives=true&corpora=allDrives`;
          const j = await driveGet(url);
          const noteFiles = j.files ?? [];

          const boundary = `----lovable-${crypto.randomUUID()}`;
          const metadata: Record<string, unknown> = { name: "_notas.md", mimeType: "text/markdown", parents: [folderId] };
          const enc = new TextEncoder();
          const bodyText = data.notes ?? "";
          const head = enc.encode(
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
              `--${boundary}\r\nContent-Type: text/markdown; charset=UTF-8\r\n\r\n`,
          );
          const bin = enc.encode(bodyText);
          const tail = enc.encode(`\r\n--${boundary}--`);
          const body = new Uint8Array(head.length + bin.length + tail.length);
          body.set(head, 0);
          body.set(bin, head.length);
          body.set(tail, head.length + bin.length);

          const uploadUrl = `${GATEWAY}/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id`;
          const res = await fetch(uploadUrl, {
            method: "POST",
            headers: { ...authHeaders(), "Content-Type": `multipart/related; boundary=${boundary}` },
            body,
          });
          if (res.ok) {
            await Promise.allSettled(
              noteFiles.map((f: any) =>
                fetch(`${GATEWAY}/drive/v3/files/${f.id}?supportsAllDrives=true`, {
                  method: "DELETE",
                  headers: authHeaders(),
                }),
              ),
            );
          }
        }
      } catch {
        // Fallback local
      }
    }

    const osKey = cleanOsKey(data.os);
    ensureLocalDirs(osKey);
    const noteFile = path.join(NOTES_DIR, `${osKey}.md`);
    fs.writeFileSync(noteFile, data.notes ?? "", "utf-8");

    return { ok: true };
  });