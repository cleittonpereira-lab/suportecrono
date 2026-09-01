/**
 * Persistência simples de versões (revisões) do relatório de Permeabilidade
 * a Carga Variável (PERM.V) em PDF usando IndexedDB. Escopo por ensaio
 * (`scopeId`), tipicamente o `ctx.ensaio.id`. Se não houver contexto, usa a
 * chave "local".
 */

const DB_NAME = "suporte-infra-report-versions-perm-v";
const STORE = "versions";
const DB_VERSION = 1;

export type ReportVersion = {
  id: string;             // uuid
  scopeId: string;        // ensaio.id (ou "local")
  rev: number;            // 0, 1, 2, ...
  createdAt: string;      // ISO
  filename: string;
  size: number;           // bytes do PDF
  note?: string;
  pdfBlob: Blob;          // conteúdo do PDF
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("by_scope", "scopeId", { unique: false });
        os.createIndex("by_scope_rev", ["scopeId", "rev"], { unique: false });
      }
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  return openDb().then((db) =>
    new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      let out: T;
      Promise.resolve(run(store))
        .then((v) => { out = v; })
        .catch(reject);
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }),
  );
}

function reqAsPromise<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function listVersions(scopeId: string): Promise<ReportVersion[]> {
  return tx("readonly", async (store) => {
    const idx = store.index("by_scope");
    const all: ReportVersion[] = await reqAsPromise(idx.getAll(IDBKeyRange.only(scopeId)));
    return all.sort((a, b) => b.rev - a.rev);
  });
}

export async function nextRev(scopeId: string): Promise<number> {
  const items = await listVersions(scopeId);
  return items.length === 0 ? 0 : items[0].rev + 1;
}

export async function saveVersion(v: Omit<ReportVersion, "id" | "createdAt">): Promise<ReportVersion> {
  const full: ReportVersion = {
    ...v,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  await tx("readwrite", (store) => reqAsPromise(store.add(full)));
  return full;
}

export async function deleteVersion(id: string): Promise<void> {
  await tx("readwrite", (store) => reqAsPromise(store.delete(id)));
}

export async function getVersion(id: string): Promise<ReportVersion | undefined> {
  return tx("readonly", (store) => reqAsPromise(store.get(id) as IDBRequest<ReportVersion | undefined>));
}

export function downloadVersion(v: ReportVersion) {
  const url = URL.createObjectURL(v.pdfBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = v.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Abre o PDF da revisão numa nova aba (visualização, sem download).
 * O usuário pode então imprimir ou baixar pelo próprio visualizador do navegador.
 */
export function viewVersion(v: ReportVersion) {
  const url = URL.createObjectURL(v.pdfBlob);
  const w = window.open(url, "_blank", "noopener,noreferrer");
  if (!w) {
    downloadVersion(v);
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
