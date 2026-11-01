"use client";

/**
 * NexNotes v2.0 — automatic local backups (privacy-first).
 *
 * Snapshots are plain-text JSON (decrypted client-side) stored in a dedicated
 * IndexedDB database on THIS device only — never synced, never uploaded.
 * Keeps the last 7 daily snapshots; restore replaces local notes after
 * confirmation. Analog of Standard Notes' paid "automatic backups".
 */

const DB_NAME = "nexnotes-backups";
const STORE = "snapshots";
const MAX_KEEP = 7;

export interface BackupSnapshot {
  id: string; // ISO date + random suffix
  createdAt: string;
  count: number;
  payload: string; // JSON string of the full export
}

function openBackupDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openBackupDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listBackups(): Promise<BackupSnapshot[]> {
  try {
    const all = await tx<BackupSnapshot[]>("readonly", (s) => s.getAll() as IDBRequest<BackupSnapshot[]>);
    return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  } catch {
    return [];
  }
}

export async function saveBackup(payload: string, count: number): Promise<BackupSnapshot> {
  const snap: BackupSnapshot = {
    id: `${new Date().toISOString().slice(0, 10)}-${Date.now() % 100000}`,
    createdAt: new Date().toISOString(),
    count,
    payload,
  };
  await tx("readwrite", (s) => s.put(snap) as IDBRequest);
  // prune old snapshots beyond MAX_KEEP
  const all = await listBackups();
  for (const old of all.slice(MAX_KEEP)) {
    await tx("readwrite", (s) => s.delete(old.id) as IDBRequest).catch(() => undefined);
  }
  return snap;
}

export async function lastBackupAt(): Promise<string | null> {
  const all = await listBackups();
  return all[0]?.createdAt ?? null;
}

const LAST_RUN_KEY = "nx-autobackup-last";

/** Run the daily auto-backup if it is enabled and the last run is older than 20 h. */
export async function maybeAutoBackup(
  enabled: boolean,
  buildPayload: () => Promise<{ payload: string; count: number } | null>
): Promise<boolean> {
  if (!enabled) return false;
  try {
    const last = localStorage.getItem(LAST_RUN_KEY);
    if (last && Date.now() - new Date(last).getTime() < 20 * 60 * 60 * 1000) return false;
    const res = await buildPayload();
    if (!res) return false;
    await saveBackup(res.payload, res.count);
    localStorage.setItem(LAST_RUN_KEY, new Date().toISOString());
    return true;
  } catch {
    return false;
  }
}

export function autoBackupLastRun(): string | null {
  try {
    return localStorage.getItem(LAST_RUN_KEY);
  } catch {
    return null;
  }
}
