import type { ReportVersion } from "./types";

const DB_NAME = "SuporteCrono_Oedometer_Versions_DB";
const STORE_NAME = "versions";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveOedReportVersion(version: ReportVersion): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(version);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function listOedReportVersions(scopeId: string): Promise<ReportVersion[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const all = req.result as ReportVersion[];
      const filtered = all.filter((v) => v.scopeId === scopeId);
      filtered.sort((a, b) => b.rev - a.rev);
      resolve(filtered);
    };
    req.onerror = () => reject(req.error);
  });
}
