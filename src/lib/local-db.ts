/** Minimal IndexedDB wrapper — the local-first persistence layer. */

const DB_NAME = "nexnotes";
const DB_VERSION = 2;
const STORES = ["notes", "folders", "tags", "files", "meta"] as const;
export type IdbStore = (typeof STORES)[number];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("notes")) db.createObjectStore("notes", { keyPath: "id" });
      if (!db.objectStoreNames.contains("folders")) db.createObjectStore("folders", { keyPath: "id" });
      if (!db.objectStoreNames.contains("tags")) db.createObjectStore("tags", { keyPath: "id" });
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "k" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: IdbStore, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export async function idbGetAll<T>(store: IdbStore): Promise<T[]> {
  try {
    const result = await tx<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

export async function idbPut(store: IdbStore, items: unknown[]): Promise<void> {
  if (!items.length) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(store, "readwrite");
    const os = t.objectStore(store);
    for (const item of items) os.put(item);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function idbDelete(store: IdbStore, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(store, "readwrite");
    const os = t.objectStore(store);
    for (const id of ids) os.delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function idbGetMeta<T>(key: string): Promise<T | null> {
  const row = await tx<{ k: string; v: T } | undefined>("meta", "readonly", (s) => s.get(key));
  return row ? row.v : null;
}

export async function idbSetMeta(key: string, value: unknown): Promise<void> {
  await idbPut("meta", [{ k: key, v: value }]);
}

export async function idbClearAll(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORES as unknown as string[], "readwrite");
    for (const s of STORES) t.objectStore(s).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
