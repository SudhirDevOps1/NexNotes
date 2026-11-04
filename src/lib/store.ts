"use client";

/**
 * NexNotes client state — the local-first sync engine.
 *
 * Data flow for every mutation:
 *   1. update in-memory store (plaintext for the UI)
 *   2. persist to IndexedDB (ciphertext when E2E / note-lock is active) + mark dirty
 *   3. debounced push to /api/sync; pull server changes in the same round-trip
 *
 * Offline: step 3 fails silently, dirty items stay queued in IndexedDB and are
 * flushed automatically on the next `online` event / successful sync.
 * Locked notes keep a second layer of per-note-password encryption
 * (nxlock:v1) — plaintext lives only in `unlockedNotes` for this session.
 */

import { create } from "zustand";
import { toast } from "sonner";
import type {
  Change, EditorWidth, FileDTO, FolderDTO, HistoryDTO, NoteDTO, NoteType,
  SyncResponse, TagDTO, UserDTO,
} from "@/lib/types";
import { idbDelete, idbGetAll, idbGetMeta, idbSetMeta, idbClearAll, idbPut } from "@/lib/local-db";
import {
  cacheKey, clearStoredKey, decryptText, deriveKey, deriveNoteKey,
  encryptNoteText, encryptText, getCachedKey, getCachedNoteKey,
  isEncrypted, isLockEncrypted, restoreKey, serializeKey, sha256Hex,
  cacheNoteKey, dropCachedNoteKey, dropAllNoteKeys,
} from "@/lib/crypto";
import { parseStandardNotesBackup, looksLikeNexNotesBackup } from "@/lib/sn-import";
import { copyText } from "@/lib/clipboard";
import { parseSheet, sheetToMarkdown } from "@/components/nexnotes/sheet-editor";


/** note body → markdown (spreadsheet notes are serialised to a md table) */
function noteToMarkdown(content: string): string {
  const sheet = parseSheet(content);
  return sheet ? sheetToMarkdown(sheet) : content;
}

export interface UiNote extends NoteDTO { dirty: boolean }
export interface UiFolder extends FolderDTO { dirty: boolean }
export interface UiTag extends TagDTO { dirty: boolean }
export interface UiFile extends FileDTO { data?: string }

export type ViewKind =
  | "all" | "starred" | "archive" | "trash" | "untagged" | "conflicts"
  | "files" | "folder" | "tag" | "auth" | "smart";
export interface View { kind: ViewKind; id?: string }

/** v2.0 — Smart Views: saved searches / filters (device-local, privacy-first). */
export interface SmartView {
  id: string;
  title: string;
  query: string;
  noteType?: string; // "" = any type
  starredOnly?: boolean;
  tagId?: string | null;
  folderId?: string | null;
}

export interface SortMode { by: "updated" | "created" | "title"; dir: "desc" | "asc" }

interface AppState {
  status: "boot" | "anon" | "locked" | "ready";
  user: UserDTO | null;
  encKey: CryptoKey | null;
  notes: Record<string, UiNote>;
  folders: Record<string, UiFolder>;
  tags: Record<string, UiTag>;
  files: Record<string, UiFile>;
  unlockedNotes: Record<string, { title: string; content: string }>;
  tombstones: Change[];
  view: View;
  selectedNoteId: string | null;
  query: string;
  sort: SortMode;
  online: boolean;
  syncing: boolean;
  lastSyncAt: string | null;
  paletteOpen: boolean;
  settingsOpen: boolean;
  historyNoteId: string | null;
  lockNoteId: string | null;
  shortcutsOpen: boolean;
  mobilePane: "list" | "editor";
  /** desktop sidebar collapsed to give the editor full width (v1.3) */
  sidebarCollapsed: boolean;
  /** desktop note-list pane collapsed — editor gets the whole stage (v1.4) */
  listCollapsed: boolean;
  /** v2.0 — Smart Views (saved searches, device-local) */
  smartViews: SmartView[];
  /** v2.0 — batch selection (note list multi-select) */
  selection: string[];
  selectionMode: boolean;
}

interface AppActions {
  boot: () => Promise<void>;
  signIn: (email: string, password: string, code?: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sync: (silent?: boolean) => Promise<void>;
  createNote: (opts?: { folderId?: string; tagId?: string; noteType?: NoteType }) => Promise<string>;
  updateNote: (id: string, patch: Partial<NoteDTO>) => Promise<void>;
  trashNote: (id: string) => Promise<void>;
  restoreNote: (id: string) => Promise<void>;
  deleteForever: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;
  toggleStar: (id: string) => Promise<void>;
  duplicateNote: (id: string) => Promise<void>;
  setNoteType: (id: string, type: NoteType) => Promise<void>;
  setEditorWidth: (id: string, width: EditorWidth) => Promise<void>;
  togglePreventEdit: (id: string) => Promise<void>;
  lockNote: (id: string, password: string) => Promise<void>;
  unlockNote: (id: string, password: string) => Promise<void>;
  relockNote: (id: string) => void;
  removeLock: (id: string, password: string) => Promise<void>;
  fetchHistory: (noteId: string) => Promise<HistoryDTO[]>;
  restoreVersion: (noteId: string, version: HistoryDTO) => Promise<void>;
  uploadFiles: (files: File[]) => Promise<void>;
  deleteFile: (id: string) => Promise<void>;
  downloadFile: (id: string) => Promise<void>;
  resolveConflict: (id: string, action: "keep" | "discard") => Promise<void>;
  changePassword: (currentPw: string, newPw: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  ensureTag: (name: string) => Promise<string>;
  deleteTag: (id: string) => Promise<void>;
  createFolder: (name: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  setView: (view: View) => void;
  selectNote: (id: string | null) => void;
  setQuery: (q: string) => void;
  setSort: (sort: SortMode) => void;
  setOnline: (online: boolean) => void;
  setPalette: (open: boolean) => void;
  setSettings: (open: boolean) => void;
  setHistory: (noteId: string | null) => void;
  setLockDialog: (noteId: string | null) => void;
  setShortcuts: (open: boolean) => void;
  setMobilePane: (pane: "list" | "editor") => void;
  toggleSidebar: () => void;
  /** collapse / expand the desktop note-list pane (v1.4, Alt+L) */
  toggleList: () => void;
  enableEncryption: (password: string) => Promise<void>;
  disableEncryption: (password: string) => Promise<void>;
  unlockVault: (password: string) => Promise<void>;
  exportJson: () => Promise<void>;
  exportMarkdown: () => Promise<void>;
  exportNote: (id: string, format: "md" | "txt" | "html") => Promise<void>;
  importJson: (file: File) => Promise<void>;
  importFiles: (files: File[]) => Promise<void>;
  importStandardNotes: (file: File) => Promise<{ imported: number; skippedEncrypted: number }>;
  copyNoteMarkdown: (id: string) => Promise<void>;
  /** v2.0 — plaintext JSON payload builder shared by export + auto-backup */
  buildExportPayload: () => Promise<string>;
  /* v2.0 — smart views */
  addSmartView: (v: Omit<SmartView, "id">) => void;
  deleteSmartView: (id: string) => void;
  /* v2.0 — batch operations */
  toggleSelect: (id: string) => void;
  setSelectionMode: (on: boolean) => void;
  selectAllVisible: () => void;
  clearSelection: () => void;
  batchTrash: () => Promise<void>;
  batchRestore: () => Promise<void>;
  batchStar: () => Promise<void>;
  batchMove: (folderId: string | null) => Promise<void>;
  batchTag: (tagName: string) => Promise<void>;
  batchMerge: () => Promise<void>;
  batchExport: () => Promise<void>;
}

export type AppStore = AppState & AppActions;

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `nx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePush(store: AppStore, delay = 700) {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void store.sync(true);
  }, delay);
}

/** Persist one note to IndexedDB — encrypting content when E2E is active.
 *  Locked notes carry their own nxlock ciphertext and are left untouched. */
async function persistNote(state: AppState, note: UiNote): Promise<UiNote> {
  let content = note.content;
  let isEncrypted = false;
  if (isLockEncrypted(note.content)) {
    isEncrypted = true; // opaque to the account layer
  } else if (state.user?.encryptionEnabled && state.encKey) {
    content = await encryptText(state.encKey, content);
    isEncrypted = true;
  }
  const row: UiNote = { ...note, content, isEncrypted, dirty: note.dirty };
  await idbPut("notes", [row]);
  return row;
}

/** Decrypt every account-encrypted (nxenc) note in memory with the vault key.
 *  The in-memory contract is "plaintext for the UI" (see the header above) —
 *  this is the one place ciphertext is allowed to turn back into plaintext in
 *  bulk. A note that fails to decrypt KEEPS its ciphertext: the editor renders
 *  a vault gate for it instead of silently showing an empty note. */
async function decryptVaultInMemory(
  key: CryptoKey,
  notes: Record<string, UiNote>
): Promise<Record<string, UiNote>> {
  const out: Record<string, UiNote> = {};
  for (const [id, n] of Object.entries(notes)) {
    if (isEncrypted(n.content) && !isLockEncrypted(n.content)) {
      try {
        out[id] = { ...n, content: await decryptText(key, n.content) };
      } catch {
        out[id] = n; // undecryptable — UI shows the vault gate, never gibberish/empty
      }
    } else {
      out[id] = n;
    }
  }
  return out;
}

/** Encrypt note rows for the wire / IndexedDB when E2E is active.
 *  Memory is plaintext for the UI; anything leaving the process — sync push
 *  body or the idb snapshot sync() writes back — must be ciphertext again.
 *  Rows already carrying nxenc/nxlock ciphertext pass through untouched. */
async function encryptRowsForIdb(
  state: AppState,
  notes: Record<string, UiNote>
): Promise<Record<string, UiNote>> {
  if (!state.user?.encryptionEnabled || !state.encKey) return notes;
  const out: Record<string, UiNote> = {};
  for (const [id, n] of Object.entries(notes)) {
    out[id] = isEncrypted(n.content)
      ? n
      : { ...n, content: await encryptText(state.encKey, n.content) };
  }
  return out;
}

function parse(json: unknown): unknown {
  return json;
}

/* ------------------------------------------------------------------ */
/* store                                                               */
/* ------------------------------------------------------------------ */

export const useApp = create<AppStore>((set, get) => ({
  status: "boot",
  user: null,
  encKey: null,
  notes: {},
  folders: {},
  tags: {},
  files: {},
  unlockedNotes: {},
  tombstones: [],
  view: { kind: "all" },
  selectedNoteId: null,
  query: "",
  sort: { by: "updated", dir: "desc" },
  online: true,
  syncing: false,
  lastSyncAt: null,
  paletteOpen: false,
  settingsOpen: false,
  historyNoteId: null,
  lockNoteId: null,
  shortcutsOpen: false,
  mobilePane: "list",
  sidebarCollapsed: false,
  listCollapsed: false,
  smartViews: [],
  selection: [],
  selectionMode: false,

  /* ---------------- boot & auth ---------------- */

  toggleSidebar() {
    const next = !get().sidebarCollapsed;
    try { localStorage.setItem("nx-sidebar-collapsed", next ? "1" : "0"); } catch { /* private mode */ }
    set({ sidebarCollapsed: next });
  },

  toggleList() {
    const next = !get().listCollapsed;
    try { localStorage.setItem("nx-list-collapsed", next ? "1" : "0"); } catch { /* private mode */ }
    set({ listCollapsed: next });
  },

  /* ---------------- smart views (v2.0, device-local) ---------------- */

  addSmartView(v) {
    const sv: SmartView = { ...v, id: newId() };
    const next = [...get().smartViews, sv];
    try { localStorage.setItem("nx-smart-views", JSON.stringify(next)); } catch { /* private mode */ }
    set({ smartViews: next, view: { kind: "smart", id: sv.id } });
    toast.success(`Smart view “${sv.title}” created`, { duration: 1600 });
  },

  deleteSmartView(id) {
    const next = get().smartViews.filter((v) => v.id !== id);
    try { localStorage.setItem("nx-smart-views", JSON.stringify(next)); } catch { /* private mode */ }
    const view = get().view;
    set({
      smartViews: next,
      ...(view.kind === "smart" && view.id === id ? { view: { kind: "all" as const } } : {}),
    });
  },

  /* ---------------- batch operations (v2.0) ---------------- */

  toggleSelect(id) {
    const cur = get().selection;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    set({ selection: next, selectionMode: next.length > 0 || get().selectionMode });
  },

  setSelectionMode(on) {
    set(on ? { selectionMode: true } : { selectionMode: false, selection: [] });
  },

  selectAllVisible() {
    const visible = selectVisibleNotes(get());
    set({ selection: visible.map((n) => n.id), selectionMode: true });
  },

  clearSelection() {
    set({ selection: [], selectionMode: false });
  },

  async batchTrash() {
    const ids = [...get().selection];
    for (const id of ids) {
       
      await get().trashNote(id);
    }
    set({ selection: [], selectionMode: false });
    toast.success(`${ids.length} note${ids.length === 1 ? "" : "s"} moved to trash`);
  },

  async batchRestore() {
    const ids = [...get().selection];
    for (const id of ids) {
       
      await get().restoreNote(id);
    }
    set({ selection: [], selectionMode: false });
    toast.success(`${ids.length} note${ids.length === 1 ? "" : "s"} restored`);
  },

  async batchStar() {
    const ids = [...get().selection];
    for (const id of ids) {
       
      await get().updateNote(id, { starred: true });
    }
    set({ selection: [], selectionMode: false });
    toast.success(`${ids.length} note${ids.length === 1 ? "" : "s"} starred`);
  },

  async batchMove(folderId) {
    const ids = [...get().selection];
    for (const id of ids) {
       
      await get().updateNote(id, { folderId });
    }
    set({ selection: [], selectionMode: false });
    const name = folderId ? get().folders[folderId]?.name : "No folder";
    toast.success(`${ids.length} note${ids.length === 1 ? "" : "s"} moved to “${name}”`);
  },

  async batchTag(tagName) {
    const clean = tagName.trim().toLowerCase();
    if (!clean) return;
    const tagId = await get().ensureTag(clean);
    if (!tagId) return;
    const ids = [...get().selection];
    for (const id of ids) {
      const n = get().notes[id];
       
      if (n && !n.tagIds.includes(tagId)) await get().updateNote(id, { tagIds: [...n.tagIds, tagId] });
    }
    set({ selection: [], selectionMode: false });
    toast.success(`#${clean} added to ${ids.length} note${ids.length === 1 ? "" : "s"}`);
  },

  async batchMerge() {
    const state = get();
    const sel = state.selection
      .map((id) => state.notes[id])
      .filter((n): n is UiNote => !!n)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    if (sel.length < 2) {
      toast.error("Select at least 2 notes to merge");
      return;
    }
    const target = sel[0];
    const tu = state.unlockedNotes[target.id];
    let merged = tu ? tu.content : isLockEncrypted(target.content) ? "" : target.content;
    let mergedCount = 1;
    for (const n of sel.slice(1)) {
      const u = state.unlockedNotes[n.id];
      const title = u ? u.title : isLockEncrypted(n.title) ? "Locked note" : n.title;
      const content = u ? u.content : isLockEncrypted(n.content) ? "🔒 Locked note — merge skipped its content." : n.content;
      merged += `\n\n---\n\n# ${title || "Untitled"}\n\n${noteToMarkdown(content)}`;
      mergedCount++;
    }
    await get().updateNote(target.id, { content: merged });
    for (const n of sel.slice(1)) {
       
      await get().trashNote(n.id);
    }
    set({ selection: [], selectionMode: false, selectedNoteId: target.id });
    toast.success(`${mergedCount} notes merged into “${(tu?.title ?? target.title) || "Untitled"}”`);
  },

  async batchExport() {
    const state = get();
    const sel = state.selection
      .map((id) => state.notes[id])
      .filter((n): n is UiNote => !!n)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    if (!sel.length) return;
    const parts = sel.map((n) => {
      const u = state.unlockedNotes[n.id];
      const title = u ? u.title : isLockEncrypted(n.title) ? "Locked note" : n.title;
      const content = u ? u.content : isLockEncrypted(n.content) ? "🔒 Locked note — unlock to export." : n.content;
      return `<!-- ${n.id} · updated ${n.updatedAt} -->\n# ${title || "Untitled"}\n\n${noteToMarkdown(content)}\n\n---\n`;
    });
    downloadBlob(
      new Blob([parts.join("\n")], { type: "text/markdown" }),
      `nexnotes-selection-${sel.length}-${new Date().toISOString().slice(0, 10)}.md`
    );
    toast.success(`Exported ${sel.length} notes as Markdown`, { duration: 1600 });
    set({ selection: [], selectionMode: false });
  },

  async boot() {
    // 1. hydrate local cache first (instant, offline-friendly)
    const [notes, folders, tags, files, lastSyncAt, tombstones, lastUser, sort] = await Promise.all([
      idbGetAll<UiNote>("notes"),
      idbGetAll<UiFolder>("folders"),
      idbGetAll<UiTag>("tags"),
      idbGetAll<UiFile>("files"),
      idbGetMeta<string>("lastSyncAt"),
      idbGetMeta<Change[]>("tombstones"),
      idbGetMeta<UserDTO>("lastUser"),
      idbGetMeta<SortMode>("sort"),
    ]);

    set({
      notes: Object.fromEntries(notes.map((n) => [n.id, n])),
      folders: Object.fromEntries(folders.map((f) => [f.id, f])),
      tags: Object.fromEntries(tags.map((t) => [t.id, t])),
      files: Object.fromEntries(files.map((f) => [f.id, f])),
      tombstones: tombstones ?? [],
      lastSyncAt: lastSyncAt ?? null,
      sort: sort ?? { by: "updated", dir: "desc" },
      online: typeof navigator === "undefined" ? true : navigator.onLine,
      sidebarCollapsed: (() => {
        try { return localStorage.getItem("nx-sidebar-collapsed") === "1"; } catch { return false; }
      })(),
      listCollapsed: (() => {
        try { return localStorage.getItem("nx-list-collapsed") === "1"; } catch { return false; }
      })(),
      smartViews: (() => {
        try { return JSON.parse(localStorage.getItem("nx-smart-views") ?? "[]") as SmartView[]; } catch { return []; }
      })(),
    });

    // 2. session check
    let user: UserDTO | null = null;
    try {
      const r = await fetch("/api/auth/me");
      user = r.ok ? (await r.json()).user : null;
    } catch {
      user = null; // offline — fall back to cached session below
    }

    if (!user && lastUser && get().online === false) {
      user = lastUser; // offline session continuation
    }

    if (!user) {
      set({ status: "anon" });
      return;
    }

    set({ user });
    await idbSetMeta("lastUser", user);

    if (user.encryptionEnabled) {
      const key = await restoreKey(user.id);
      if (!key) {
        set({ status: "locked" });
        return;
      }
      set({ encKey: key });
      // v2.2 bugfix — hydrated IndexedDB rows carry nxenc ciphertext; decrypt
      // them now, or the editor/previews would render raw ciphertext.
      set({ notes: await decryptVaultInMemory(key, get().notes) });
    }

    await get().sync(true);
    void refreshFiles(set, get);
    set({ status: "ready" });
  },

  async signIn(email, password, code) {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, ...(code ? { code } : {}) }),
    });
    if (r.ok) {
      const data = (await r.json()) as { user?: UserDTO; twoFactorRequired?: boolean };
      if (data.twoFactorRequired) {
        // v2.0 — account 2FA: the client shows the code step and retries with it
        throw new Error("2FA_REQUIRED");
      }
      if (!data.user) throw new Error("Login failed");
      set({ user: data.user, status: "ready" });
      await idbSetMeta("lastUser", data.user);

      if (data.user.encryptionEnabled) {
        const key = await restoreKey(data.user.id);
        if (!key) {
          set({ status: "locked" });
          return;
        }
        set({ encKey: key });
        set({ notes: await decryptVaultInMemory(key, get().notes) }); // same fix as boot()
      }
      await get().sync(true);
      void refreshFiles(set, get);
      return;
    }
    const { error } = await r.json().catch(() => ({ error: "Login failed" }));
    throw new Error(error || "Login failed");
  },

  async signUp(email, password) {
    const r = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok) {
      const { error } = await r.json().catch(() => ({ error: "Registration failed" }));
      throw new Error(error || "Registration failed");
    }
    const { user } = await r.json();
    set({ user, status: "ready" });
    await idbSetMeta("lastUser", user);
    await get().sync(true);
    void refreshFiles(set, get);
  },

  async signOut() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch { /* offline — clear locally anyway */ }
    if (get().user) clearStoredKey(get().user!.id);
    dropAllNoteKeys();
    await idbClearAll();
    set({
      status: "anon", user: null, encKey: null, notes: {}, folders: {}, tags: {},
      files: {}, unlockedNotes: {}, tombstones: [], lastSyncAt: null,
      selectedNoteId: null, view: { kind: "all" }, query: "",
      settingsOpen: false, historyNoteId: null, lockNoteId: null,
      shortcutsOpen: false, mobilePane: "list",
    });
  },

  /* ---------------- sync ---------------- */

  async sync(silent = false) {
    const state = get();
    if (!state.user || state.syncing) return;
    if (!silent) set({ syncing: true });

    try {
      const changes: Change[] = [...state.tombstones];
      const pushedIds = new Set<string>();

      for (const n of Object.values(state.notes)) {
        if (n.dirty) {
          let data = { ...n, dirty: undefined } as unknown as NoteDTO;
          // v2.2 — memory is plaintext for the UI; the wire must be ciphertext
          // (locked notes already carry nxlock ciphertext and pass through)
          if (!isEncrypted(n.content) && state.user?.encryptionEnabled && state.encKey) {
            data = { ...data, content: await encryptText(state.encKey, n.content) };
          }
          changes.push({ type: "note", op: "upsert", data });
          pushedIds.add(n.id);
        }
      }
      for (const f of Object.values(state.folders)) {
        if (f.dirty) changes.push({ type: "folder", op: "upsert", data: { ...f } });
      }
      for (const t of Object.values(state.tags)) {
        if (t.dirty) changes.push({ type: "tag", op: "upsert", data: { ...t } });
      }

      const r = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ since: state.lastSyncAt, changes }),
      });

      if (r.status === 401) {
        const u = get().user;
        if (u) clearStoredKey(u.id);
        set({ status: "anon", user: null });
        return;
      }
      if (!r.ok) throw new Error(`sync failed (${r.status})`);

      const res: SyncResponse = await r.json();
      const now = get();

      // 1. mark pushed items clean
      const cleaned: Record<string, UiNote> = {};
      for (const [id, n] of Object.entries(now.notes)) {
        cleaned[id] = pushedIds.has(id) ? { ...n, dirty: false } : n;
      }
      const cleanedFolders = { ...now.folders };
      for (const id of Object.keys(cleanedFolders)) cleanedFolders[id] = { ...cleanedFolders[id], dirty: false };
      const cleanedTags = { ...now.tags };
      for (const id of Object.keys(cleanedTags)) cleanedTags[id] = { ...cleanedTags[id], dirty: false };

      // 2. apply server changes (only onto non-dirty local items)
      for (const sn of res.notes) {
        const local = cleaned[sn.id];
        if (local && (local.dirty || new Date(local.updatedAt) >= new Date(sn.updatedAt))) continue;
        let content = sn.content;
        if (isLockEncrypted(content)) {
          // note-password protected — ciphertext stays; invalidate stale unlock
          if (now.unlockedNotes[sn.id] && local && local.updatedAt !== sn.updatedAt) {
            delete cleaned[sn.id]; // replaced below without the cached plaintext
          }
        } else if (isEncrypted(content) && now.encKey) {
          // v2.2 bugfix — on a decrypt failure keep the ciphertext (the editor
          // shows a vault gate for it); blanking the note hid real data.
          try { content = await decryptText(now.encKey, content); } catch { /* keep ciphertext */ }
        }
        cleaned[sn.id] = { ...sn, content, dirty: false };
      }
      for (const sf of res.folders) {
        const local = cleanedFolders[sf.id];
        if (local && (local.dirty || new Date(local.updatedAt) >= new Date(sf.updatedAt))) continue;
        cleanedFolders[sf.id] = { ...sf, dirty: false };
      }
      for (const st of res.tags) {
        const local = cleanedTags[st.id];
        if (local && (local.dirty || new Date(local.updatedAt) >= new Date(st.updatedAt))) continue;
        cleanedTags[st.id] = { ...st, dirty: false };
      }

      // 3. apply server-side deletions (tombstones from any device)
      const delNotes: string[] = [];
      const delFolders: string[] = [];
      const delTags: string[] = [];
      for (const d of res.deletions ?? []) {
        if (d.itemType === "note") delNotes.push(d.itemId);
        else if (d.itemType === "folder") delFolders.push(d.itemId);
        else delTags.push(d.itemId);
      }
      let finalNotes = cleaned;
      let finalFolders = cleanedFolders;
      let finalTags = cleanedTags;
      if (delNotes.length) {
        finalNotes = Object.fromEntries(Object.entries(finalNotes).filter(([id]) => !delNotes.includes(id)));
        await idbDelete("notes", delNotes);
      }
      if (delFolders.length) {
        finalFolders = Object.fromEntries(Object.entries(finalFolders).filter(([id]) => !delFolders.includes(id)));
        await idbDelete("folders", delFolders);
      }
      if (delTags.length) {
        finalTags = Object.fromEntries(Object.entries(finalTags).filter(([id]) => !delTags.includes(id)));
        await idbDelete("tags", delTags);
      }

      // 3b. full pull (fresh login / first sync): prune cached items the server
      // no longer has. dirty items are offline-created and must survive;
      // non-dirty items missing from the full server list were deleted
      // server-side (another device, or a seed cleanup) — tombstones cannot
      // cover caches that predate them.
      if (!state.lastSyncAt) {
        const serverNoteIds = new Set(res.notes.map((n) => n.id));
        const serverFolderIds = new Set(res.folders.map((f) => f.id));
        const serverTagIds = new Set(res.tags.map((t) => t.id));
        const staleNotes = Object.values(finalNotes).filter((n) => !n.dirty && !serverNoteIds.has(n.id)).map((n) => n.id);
        const staleFolders = Object.values(finalFolders).filter((f) => !f.dirty && !serverFolderIds.has(f.id)).map((f) => f.id);
        const staleTags = Object.values(finalTags).filter((t) => !t.dirty && !serverTagIds.has(t.id)).map((t) => t.id);
        if (staleNotes.length) {
          finalNotes = Object.fromEntries(Object.entries(finalNotes).filter(([id]) => !staleNotes.includes(id)));
          await idbDelete("notes", staleNotes);
        }
        if (staleFolders.length) {
          finalFolders = Object.fromEntries(Object.entries(finalFolders).filter(([id]) => !staleFolders.includes(id)));
          await idbDelete("folders", staleFolders);
        }
        if (staleTags.length) {
          finalTags = Object.fromEntries(Object.entries(finalTags).filter(([id]) => !staleTags.includes(id)));
          await idbDelete("tags", staleTags);
        }
      }

      // keep unlockedNotes in sync with the note set
      const finalUnlocked: Record<string, { title: string; content: string }> = {};
      for (const id of Object.keys(now.unlockedNotes)) {
        if (finalNotes[id] && finalNotes[id].locked) finalUnlocked[id] = now.unlockedNotes[id];
        else dropCachedNoteKey(id);
      }

      // 4. persist — rows go back to IndexedDB as ciphertext when E2E is on
      // (v2.2 bugfix: this snapshot used to write memory as-is, which turned
      // into plaintext-at-rest once memory became plaintext for the UI)
      await idbPut("notes", Object.values(await encryptRowsForIdb(now, finalNotes)));
      await idbPut("folders", Object.values(finalFolders));
      await idbPut("tags", Object.values(finalTags));
      await idbSetMeta("lastSyncAt", res.serverTime);
      await idbSetMeta("tombstones", []);

      set({
        notes: finalNotes,
        folders: finalFolders,
        tags: finalTags,
        unlockedNotes: finalUnlocked,
        tombstones: [],
        lastSyncAt: res.serverTime,
        online: true,
      });

      if (res.conflictsCreated > 0) {
        toast.warning(`${res.conflictsCreated} sync conflict${res.conflictsCreated > 1 ? "s" : ""} saved`, {
          description: "Both versions were kept — resolve them in the Conflicts view.",
        });
      }
    } catch {
      set({ online: false });
    } finally {
      set({ syncing: false });
    }
  },

  /* ---------------- notes ---------------- */

  async createNote(opts) {
    const state = get();
    if (!state.user) return "";
    const id = newId();
    const t = new Date().toISOString();
    const note: UiNote = {
      id,
      title: "",
      content: "",
      isEncrypted: false,
      folderId: opts?.folderId ?? (state.view.kind === "folder" ? state.view.id ?? null : null),
      tagIds: opts?.tagId ? [opts.tagId] : state.view.kind === "tag" && state.view.id ? [state.view.id] : [],
      starred: false,
      noteType: opts?.noteType ?? "markdown",
      preventEdit: false,
      editorWidth: "narrow",
      locked: false,
      lockHash: null,
      conflictOf: null,
      pinned: false,
      archived: false,
      trashed: false,
      trashedAt: null,
      createdAt: t,
      updatedAt: t,
      dirty: true,
    };
    const persisted = await persistNote(state, note);
    // in-memory stays plaintext for the UI — only the IndexedDB row is ciphertext
    set((s) => ({ notes: { ...s.notes, [id]: { ...persisted, content: note.content } } }));
    set({ selectedNoteId: id, mobilePane: "editor" });
    schedulePush(get());
    return id;
  },

  async updateNote(id, patch) {
    const state = get();
    const prev = state.notes[id];
    if (!prev) return;
    const t = new Date().toISOString();

    // v2.2 bugfix — vault locked: refuse edits that would write over account
    // ciphertext. Saving text typed into a not-yet-decrypted note used to
    // encrypt the ciphertext a second time and destroy the note for good.
    const prevIsCipher = isEncrypted(prev.content) && !isLockEncrypted(prev.content);
    if (
      prevIsCipher && !state.encKey && !prev.locked &&
      (patch.title !== undefined || patch.content !== undefined)
    ) {
      return;
    }

    let next: UiNote = { ...prev, ...patch, updatedAt: t, dirty: true };

    // locked notes: re-encrypt plaintext edits with the per-note key
    if (prev.locked && (patch.title !== undefined || patch.content !== undefined)) {
      const noteKey = getCachedNoteKey(id);
      const unlocked = state.unlockedNotes[id];
      if (!noteKey || !unlocked) return; // cannot edit a locked note we can't open
      const title = patch.title ?? unlocked.title;
      const content = patch.content ?? unlocked.content;
      next = {
        ...next,
        title: await encryptNoteText(noteKey, title),
        content: await encryptNoteText(noteKey, content),
      };
      set((s) => ({ unlockedNotes: { ...s.unlockedNotes, [id]: { title, content } } }));
    }

    const persisted = await persistNote(state, next);
    // in-memory stays plaintext for the UI (header contract). Locked notes are
    // the exception: their nxlock ciphertext stays in memory and the plaintext
    // lives only in `unlockedNotes` for this session.
    const uiRow: UiNote = prev.locked ? persisted : { ...persisted, content: next.content };
    set((s) => ({ notes: { ...s.notes, [id]: uiRow } }));
    schedulePush(get());
  },

  async trashNote(id) {
    const state = get();
    const prev = state.notes[id];
    if (!prev) return;
    const t = new Date().toISOString();
    const next: UiNote = { ...prev, trashed: true, trashedAt: t, updatedAt: t, dirty: true };
    const persisted = await persistNote(state, next);
    set((s) => ({
      notes: { ...s.notes, [id]: persisted },
      selectedNoteId: s.selectedNoteId === id ? null : s.selectedNoteId,
      mobilePane: s.selectedNoteId === id ? "list" : s.mobilePane,
    }));
    schedulePush(get());
  },

  async restoreNote(id) {
    const state = get();
    const prev = state.notes[id];
    if (!prev) return;
    const t = new Date().toISOString();
    const next: UiNote = { ...prev, trashed: false, trashedAt: null, updatedAt: t, dirty: true };
    const persisted = await persistNote(state, next);
    set((s) => ({ notes: { ...s.notes, [id]: persisted } }));
    schedulePush(get());
  },

  async deleteForever(id) {
    const state = get();
    const { [id]: _removed, ...rest } = state.notes;
    void _removed;
    await idbDelete("notes", [id]);
    const tombstones = [...state.tombstones, { type: "note", op: "delete", id } as Change];
    await idbSetMeta("tombstones", tombstones);
    dropCachedNoteKey(id);
    const unlockedNotes = { ...state.unlockedNotes };
    delete unlockedNotes[id];
    set({
      notes: rest, tombstones, unlockedNotes,
      selectedNoteId: state.selectedNoteId === id ? null : state.selectedNoteId,
    });
    schedulePush(get());
  },

  async emptyTrash() {
    const state = get();
    const trashed = Object.values(state.notes).filter((n) => n.trashed);
    if (!trashed.length) return;
    const tombstones = [...state.tombstones, ...trashed.map((n) => ({ type: "note", op: "delete", id: n.id } as Change))];
    const kept = Object.fromEntries(Object.entries(state.notes).filter(([id]) => !trashed.some((t) => t.id === id)));
    await idbDelete("notes", trashed.map((n) => n.id));
    await idbSetMeta("tombstones", tombstones);
    set({ notes: kept, tombstones });
    schedulePush(get());
  },

  async toggleStar(id) {
    const n = get().notes[id];
    if (!n) return;
    await get().updateNote(id, { starred: !n.starred });
    toast.success(n.starred ? "Removed from starred" : "⭐ Starred", { duration: 1200 });
  },

  async duplicateNote(id) {
    const state = get();
    const src = state.notes[id];
    if (!src) return;
    if (src.locked && !state.unlockedNotes[id]) {
      toast.error("Unlock the note before duplicating it");
      return;
    }
    const unlocked = state.unlockedNotes[id];
    const t = new Date().toISOString();
    const copy: UiNote = {
      ...src,
      id: newId(),
      title: unlocked ? `${unlocked.title || "Untitled"} (copy)` : `${src.title || "Untitled"} (copy)`,
      content: unlocked ? unlocked.content : src.content,
      locked: false,
      lockHash: null,
      conflictOf: null,
      starred: false,
      pinned: false,
      pinnedAt: undefined,
      trashed: false,
      trashedAt: null,
      createdAt: t,
      updatedAt: t,
      dirty: true,
    } as unknown as UiNote;
    const persisted = await persistNote(state, copy);
    set((s) => ({ notes: { ...s.notes, [copy.id]: persisted }, selectedNoteId: copy.id }));
    schedulePush(get());
    toast.success("Note duplicated", { duration: 1400 });
  },

  async setNoteType(id, type) {
    await get().updateNote(id, { noteType: type });
    toast.success(`Note type: ${type}`, { duration: 1200 });
  },

  async setEditorWidth(id, width) {
    await get().updateNote(id, { editorWidth: width });
  },

  async togglePreventEdit(id) {
    const n = get().notes[id];
    if (!n) return;
    await get().updateNote(id, { preventEdit: !n.preventEdit });
    toast.success(n.preventEdit ? "Editing enabled" : "Editing prevented (read-only)", { duration: 1400 });
  },

  /* ---------------- note password protection ---------------- */

  async lockNote(id, password) {
    const state = get();
    const note = state.notes[id];
    if (!note || !password) return;
    if (note.locked && !state.unlockedNotes[id]) return;
    if (isLockEncrypted(note.content) && !state.unlockedNotes[id]) return;

    const noteKey = await deriveNoteKey(id, password);
    const title = state.unlockedNotes[id]?.title ?? note.title;
    const content = state.unlockedNotes[id]?.content ?? note.content;

    const titleCt = await encryptNoteText(noteKey, title);
    const contentCt = await encryptNoteText(noteKey, content);
    const lockHash = await sha256Hex(`nexnotes-lock:${id}:${password}`);

    const t = new Date().toISOString();
    const next: UiNote = { ...note, title: titleCt, content: contentCt, locked: true, lockHash, isEncrypted: true, updatedAt: t, dirty: true };
    await idbPut("notes", [next]);
    cacheNoteKey(id, noteKey);
    set((s) => ({
      notes: { ...s.notes, [id]: next },
      unlockedNotes: { ...s.unlockedNotes, [id]: { title, content } },
    }));
    schedulePush(get());
    toast.success("Note protected with a password 🔒", {
      description: "Content is encrypted with its own key on this device and the server.",
    });
  },

  async unlockNote(id, password) {
    const state = get();
    const note = state.notes[id];
    if (!note || !note.lockHash) throw new Error("This note has no protection set");
    const hash = await sha256Hex(`nexnotes-lock:${id}:${password}`);
    if (hash !== note.lockHash) throw new Error("Wrong password");
    const noteKey = await deriveNoteKey(id, password);
    let title = note.title;
    let content = note.content;
    try {
      title = await decryptText(noteKey, title);
      content = await decryptText(noteKey, content);
    } catch {
      throw new Error("Could not decrypt this note with that password");
    }
    cacheNoteKey(id, noteKey);
    set((s) => ({ unlockedNotes: { ...s.unlockedNotes, [id]: { title, content } } }));
    toast.success("Note unlocked for this session", { duration: 1400 });
  },

  relockNote(id) {
    const state = get();
    if (!state.notes[id]?.locked) return;
    dropCachedNoteKey(id);
    const unlockedNotes = { ...state.unlockedNotes };
    delete unlockedNotes[id];
    set({ unlockedNotes });
    toast.success("Note locked again", { duration: 1200 });
  },

  async removeLock(id, password) {
    const state = get();
    const note = state.notes[id];
    if (!note?.lockHash) return;
    const hash = await sha256Hex(`nexnotes-lock:${id}:${password}`);
    if (hash !== note.lockHash) throw new Error("Wrong password");
    const noteKey = await deriveNoteKey(id, password);
    let title = note.title;
    let content = note.content;
    try {
      title = await decryptText(noteKey, title);
      content = await decryptText(noteKey, content);
    } catch {
      throw new Error("Could not decrypt this note with that password");
    }
    dropCachedNoteKey(id);
    const unlockedNotes = { ...state.unlockedNotes };
    delete unlockedNotes[id];
    await get().updateNote(id, { title, content, locked: false, lockHash: null });
    set({ unlockedNotes });
    toast.success("Password protection removed");
  },

  /* ---------------- note history ---------------- */

  async fetchHistory(noteId) {
    const state = get();
    const r = await fetch(`/api/history/${noteId}`);
    if (!r.ok) throw new Error("Could not load history");
    const { versions } = (await r.json()) as { versions: HistoryDTO[] };
    const out: HistoryDTO[] = [];
    for (const v of versions) {
      let title = v.title;
      let content = v.content;
      try {
        if (isLockEncrypted(content)) {
          const noteKey = getCachedNoteKey(noteId);
          if (noteKey) {
            title = await decryptText(noteKey, title);
            content = await decryptText(noteKey, content);
          } else {
            content = "__locked__";
            title = "Locked version";
          }
        } else if (isEncrypted(content) && state.encKey) {
          title = await decryptText(state.encKey, title);
          content = await decryptText(state.encKey, content);
        }
      } catch {
        content = "__undecryptable__";
      }
      out.push({ ...v, title, content });
    }
    return out;
  },

  async restoreVersion(noteId, version) {
    const state = get();
    let { title, content } = version;
    // v2.2 bugfix — history versions can come back as ciphertext; restoring
    // one raw used to double-encrypt the note. Decrypt first, refuse clearly
    // when we can't.
    if (isLockEncrypted(content)) {
      const noteKey = getCachedNoteKey(noteId);
      if (!noteKey) throw new Error("Unlock the note to restore this version");
      content = await decryptText(noteKey, content);
      if (isLockEncrypted(title)) title = await decryptText(noteKey, title);
    } else if (isEncrypted(content)) {
      if (!state.encKey) throw new Error("Unlock the vault to restore this version");
      try {
        content = await decryptText(state.encKey, content);
        if (isEncrypted(title)) title = await decryptText(state.encKey, title);
      } catch {
        throw new Error("This version cannot be decrypted with the current vault key");
      }
    }
    await get().updateNote(noteId, { title, content });
    toast.success("Version restored", {
      description: "The current version was saved to history automatically.",
    });
  },

  /* ---------------- files ---------------- */

  async uploadFiles(fileList) {
    const state = get();
    if (!state.user) return;
    let ok = 0;
    for (const file of fileList.slice(0, 20)) {
      if (file.size > 3 * 1024 * 1024) {
        toast.error(`${file.name}: over 3 MB limit`);
        continue;
      }
      try {
        const buf = new Uint8Array(await file.arrayBuffer());
        let b64 = "";
        for (let i = 0; i < buf.length; i += 0x8000) {
          b64 += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        }
        b64 = btoa(b64);
        let data = b64;
        let isEncrypted = false;
        if (state.user.encryptionEnabled && state.encKey) {
          data = await encryptText(state.encKey, b64);
          isEncrypted = true;
        }
        const r = await fetch("/api/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, mime: file.type || "application/octet-stream", size: file.size, data, isEncrypted }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Upload failed");
        const { file: dto } = (await r.json()) as { file: FileDTO };
        await idbPut("files", [{ ...dto }]);
        set((s) => ({ files: { ...s.files, [dto.id]: { ...dto } } }));
        ok++;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Could not upload ${file.name}`);
      }
    }
    if (ok) toast.success(`${ok} file${ok > 1 ? "s" : ""} uploaded`, { duration: 1600 });
  },

  async deleteFile(id) {
    const state = get();
    await fetch(`/api/files/${id}`, { method: "DELETE" }).catch(() => {});
    const files = { ...state.files };
    delete files[id];
    await idbDelete("files", [id]);
    set({ files });
    toast.success("File deleted", { duration: 1200 });
  },

  async downloadFile(id) {
    const state = get();
    const meta = state.files[id];
    if (!meta) return;
    try {
      let data = meta.data;
      if (!data) {
        const r = await fetch(`/api/files/${id}`);
        if (!r.ok) throw new Error("Download failed");
        const { file } = await r.json();
        data = file.data as string;
        const updated = { ...meta, data };
        await idbPut("files", [updated]);
        set((s) => ({ files: { ...s.files, [id]: updated } }));
      }
      let b64 = data!;
      if (meta.isEncrypted) {
        if (!state.encKey) throw new Error("Unlock the vault to decrypt this file");
        b64 = await decryptText(state.encKey, b64);
      }
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: meta.mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = meta.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  },

  /* ---------------- conflicts ---------------- */

  async resolveConflict(id, action) {
    if (action === "discard") {
      await get().deleteForever(id);
      toast.success("Conflict copy discarded", { duration: 1400 });
      return;
    }
    await get().updateNote(id, { conflictOf: null });
    toast.success("Conflict resolved — both notes kept", { duration: 1600 });
  },

  /* ---------------- account ---------------- */

  async changePassword(currentPw, newPw) {
    const state = get();
    if (!state.user) throw new Error("Not signed in");
    const r = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
    });
    if (!r.ok) {
      const { error } = await r.json().catch(() => ({ error: "Could not change password" }));
      throw new Error(error || "Could not change password");
    }
    if (state.user.encryptionEnabled && state.encKey) {
      // re-derive and re-encrypt everything cached locally
      const newKey = await deriveKey(state.user.email, newPw);
      cacheKey(state.user.id, newKey);
      await serializeKey(state.user.id, newKey);
      set({ encKey: newKey });
      const notes = { ...get().notes };
      for (const n of Object.values(notes)) {
        if (isLockEncrypted(n.content)) continue; // per-note layer is independent
        notes[n.id] = await persistNote(get(), { ...n, dirty: true });
      }
      set({ notes });
      schedulePush(get(), 0);
    }
    toast.success("Password changed", {
      description: state.user.encryptionEnabled ? "All notes were re-encrypted with the new key." : undefined,
    });
  },

  async deleteAccount() {
    const state = get();
    if (!state.user) return;
    const r = await fetch("/api/auth/delete-account", { method: "POST" });
    if (!r.ok) throw new Error("Could not delete the account");
    if (state.user) clearStoredKey(state.user.id);
    dropAllNoteKeys();
    await idbClearAll();
    set({
      status: "anon", user: null, encKey: null, notes: {}, folders: {}, tags: {},
      files: {}, unlockedNotes: {}, tombstones: [], lastSyncAt: null, selectedNoteId: null,
      view: { kind: "all" },
    });
    toast.success("Account deleted — all data wiped");
  },

  /* ---------------- tags & folders ---------------- */

  async ensureTag(name) {
    const state = get();
    const clean = name.trim().toLowerCase().replace(/^#/, "");
    if (!clean) return "";
    const existing = Object.values(state.tags).find((t) => t.name === clean);
    if (existing) return existing.id;
    const t = new Date().toISOString();
    const tag: UiTag = { id: newId(), name: clean, createdAt: t, updatedAt: t, dirty: true };
    await idbPut("tags", [tag]);
    set((s) => ({ tags: { ...s.tags, [tag.id]: tag } }));
    schedulePush(get());
    return tag.id;
  },

  async deleteTag(id) {
    const state = get();
    const { [id]: _tag, ...restTags } = state.tags;
    void _tag;
    const tombstones = [...state.tombstones, { type: "tag", op: "delete", id } as Change];
    await idbDelete("tags", [id]);
    await idbSetMeta("tombstones", tombstones);
    // remove tag from notes
    const notes = { ...state.notes };
    for (const n of Object.values(notes)) {
      if (n.tagIds.includes(id)) {
        const next = { ...n, tagIds: n.tagIds.filter((t) => t !== id), updatedAt: new Date().toISOString(), dirty: true };
        notes[n.id] = await persistNote(state, next);
      }
    }
    set({ tags: restTags, notes, tombstones, view: state.view.kind === "tag" && state.view.id === id ? { kind: "all" } : state.view });
    schedulePush(get());
  },

  async createFolder(name) {
    const state = get();
    const t = new Date().toISOString();
    const folder: UiFolder = { id: newId(), name: name.trim().slice(0, 100), createdAt: t, updatedAt: t, dirty: true };
    await idbPut("folders", [folder]);
    set((s) => ({ folders: { ...s.folders, [folder.id]: folder } }));
    schedulePush(get());
  },

  async renameFolder(id, name) {
    const state = get();
    const prev = state.folders[id];
    if (!prev) return;
    const next: UiFolder = { ...prev, name: name.trim().slice(0, 100), updatedAt: new Date().toISOString(), dirty: true };
    await idbPut("folders", [next]);
    set((s) => ({ folders: { ...s.folders, [id]: next } }));
    schedulePush(get());
  },

  async deleteFolder(id) {
    const state = get();
    const { [id]: _f, ...restFolders } = state.folders;
    void _f;
    const tombstones = [...state.tombstones, { type: "folder", op: "delete", id } as Change];
    await idbDelete("folders", [id]);
    await idbSetMeta("tombstones", tombstones);
    const notes = { ...state.notes };
    for (const n of Object.values(notes)) {
      if (n.folderId === id) {
        const next = { ...n, folderId: null, updatedAt: new Date().toISOString(), dirty: true };
        notes[n.id] = await persistNote(state, next);
      }
    }
    set({
      folders: restFolders, notes, tombstones,
      view: state.view.kind === "folder" && state.view.id === id ? { kind: "all" } : state.view,
    });
    schedulePush(get());
  },

  /* ---------------- ui ---------------- */

  setView(view) {
    set({ view, selectedNoteId: null, mobilePane: "list" });
  },
  selectNote(id) {
    set({ selectedNoteId: id, mobilePane: id ? "editor" : "list" });
  },
  setQuery(q) { set({ query: q }); },
  async setSort(sort) {
    set({ sort });
    await idbSetMeta("sort", sort);
  },
  setOnline(online) {
    set({ online });
    if (online) void get().sync(true);
  },
  setPalette(paletteOpen) { set({ paletteOpen }); },
  setSettings(settingsOpen) { set({ settingsOpen }); },
  setHistory(historyNoteId) { set({ historyNoteId }); },
  setLockDialog(lockNoteId) { set({ lockNoteId }); },
  setShortcuts(shortcutsOpen) { set({ shortcutsOpen }); },
  setMobilePane(mobilePane) { set({ mobilePane }); },

  /* ---------------- encryption ---------------- */

  async enableEncryption(password) {
    const state = get();
    if (!state.user) throw new Error("Not signed in");
    const key = await deriveKey(state.user.email, password);
    // verify round-trip before committing
    const probe = "nexnotes-probe";
    if ((await decryptText(key, await encryptText(key, probe))) !== probe) {
      throw new Error("Encryption self-test failed");
    }
    cacheKey(state.user.id, key);
    await serializeKey(state.user.id, key);

    const r = await fetch("/api/user/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encryptionEnabled: true }),
    });
    if (!r.ok) throw new Error("Could not update settings");
    const { user } = await r.json();
    set({ user, encKey: key });
    await idbSetMeta("lastUser", user);

    // re-encrypt every note in IndexedDB — the in-memory store stays plaintext
    // (v2.2 bugfix: swapping the encrypted rows into memory is what made every
    // note render as raw nxenc ciphertext right after enabling encryption)
    const notes = { ...get().notes };
    for (const n of Object.values(notes)) {
      if (isLockEncrypted(n.content)) continue; // already double-protected
      const persisted = await persistNote(get(), { ...n, dirty: true });
      notes[n.id] = { ...persisted, content: n.content };
    }
    set({ notes });
    schedulePush(get(), 0);
  },

  async disableEncryption(password) {
    const state = get();
    if (!state.user) throw new Error("Not signed in");
    // verify the password can decrypt existing data before disabling
    const anyEnc = Object.values(state.notes).find((n) => n.isEncrypted || (isEncrypted(n.content) && !isLockEncrypted(n.content)));
    if (anyEnc) {
      const key = await deriveKey(state.user.email, password);
      try {
        await decryptText(key, anyEnc.content);
      } catch {
        throw new Error("Wrong password — cannot decrypt your notes");
      }
    }
    const r = await fetch("/api/user/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encryptionEnabled: false }),
    });
    if (!r.ok) throw new Error("Could not update settings");
    const { user } = await r.json();
    clearStoredKey(user.id);
    set({ user, encKey: null });
    await idbSetMeta("lastUser", user);

    const notes = { ...get().notes };
    for (const n of Object.values(notes)) {
      if (isLockEncrypted(n.content)) continue; // keep note-lock layer intact
      const persisted = await persistNote(get(), { ...n, isEncrypted: false, dirty: true });
      notes[n.id] = { ...persisted, content: n.content }; // memory stays plaintext
    }
    set({ notes });
    schedulePush(get(), 0);
  },

  async unlockVault(password) {
    const state = get();
    if (!state.user) throw new Error("Not signed in");
    const key = await deriveKey(state.user.email, password);
    // Verify the password against the data: at least ONE note must decrypt.
    // (v2.2 bugfix — the probe used to be one arbitrary encrypted note, so a
    // single stray note encrypted with a different/lost key could lock the
    // correct password out forever. PBKDF2 dominates the cost of the extra
    // AES-GCM attempts, so trying notes in order is still fail-fast in practice.)
    const encNotes = Object.values(state.notes).filter(
      (n) => isEncrypted(n.content) && !isLockEncrypted(n.content)
    );
    if (encNotes.length) {
      let verified = false;
      for (const n of encNotes) {
        try {
          await decryptText(key, n.content);
          verified = true;
          break;
        } catch {
          /* try the next note */
        }
      }
      if (!verified) throw new Error("Wrong password");
    }
    cacheKey(state.user.id, key);
    await serializeKey(state.user.id, key);
    set({ encKey: key, status: "ready" });
    // decrypt everything in memory (undecryptable notes keep their ciphertext —
    // the editor shows a vault gate instead of an empty note)
    set({ notes: await decryptVaultInMemory(key, get().notes) });
    void get().sync(true);
    void refreshFiles(set, get);
  },

  /* ---------------- import / export ---------------- */

  async buildExportPayload() {
    const state = get();
    // Export is always PLAINTEXT — decrypt E2E ciphertext first (bugfix: older
    // versions exported raw nxenc ciphertext that no client could re-open).
    const notesOut: Record<string, unknown>[] = [];
    for (const n of Object.values(state.notes)) {
      const u = state.unlockedNotes[n.id];
      let title = u ? u.title : n.title;
      let content = u ? u.content : n.content;
      if (isLockEncrypted(content)) {
        title = "Locked note";
        content = "🔒 Locked note — unlock it (or export after unlocking) to include its content.";
      } else if (isEncrypted(content)) {
        if (state.encKey) {
          try {
            title = await decryptText(state.encKey, title);
            content = await decryptText(state.encKey, content);
          } catch {
            content = "⚠️ Could not decrypt this note with the current session key.";
          }
        } else {
          content = "⚠️ Encrypted note — enable/open the vault and export again to include plaintext.";
        }
      }
      notesOut.push({ ...n, title, content, dirty: undefined });
    }
    const payload = {
      app: "nexnotes",
      version: 2,
      exportedAt: new Date().toISOString(),
      account: state.user?.email ?? null,
      encrypted: false,
      notes: notesOut,
      folders: Object.values(state.folders).map((f) => ({ ...f, dirty: undefined })),
      tags: Object.values(state.tags).map((t) => ({ ...t, dirty: undefined })),
    };
    return JSON.stringify(payload, null, 2);
  },

  async exportJson() {
    const json = await get().buildExportPayload();
    downloadBlob(
      new Blob([json], { type: "application/json" }),
      `nexnotes-backup-${new Date().toISOString().slice(0, 10)}.json`
    );
  },

  async exportMarkdown() {
    const state = get();
    const notes = Object.values(state.notes)
      .filter((n) => !n.trashed)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    const parts = notes.map((n) => {
      const u = state.unlockedNotes[n.id];
      const title = u ? u.title : isLockEncrypted(n.title) ? "Locked note" : n.title;
      const content = u ? u.content : isLockEncrypted(n.content) ? "🔒 Locked note — unlock to export." : n.content;
      return `<!-- ${n.id} · updated ${n.updatedAt} -->\n# ${title || "Untitled"}\n\n${noteToMarkdown(content)}\n\n---\n`;
    });
    downloadBlob(
      new Blob([parts.join("\n")], { type: "text/markdown" }),
      `nexnotes-markdown-${new Date().toISOString().slice(0, 10)}.md`
    );
  },

  async exportNote(id, format) {
    const state = get();
    const n = state.notes[id];
    if (!n) return;
    const u = state.unlockedNotes[id];
    const title = (u ? u.title : isLockEncrypted(n.title) ? "locked-note" : n.title) || "untitled";
    const content = u ? u.content : isLockEncrypted(n.content) ? "" : n.content;
    const safe = title.replace(/[^\w\s-…]/g, "").trim().slice(0, 60).replace(/\s+/g, "-").toLowerCase() || "note";
    if (format === "txt") {
      downloadBlob(new Blob([content], { type: "text/plain" }), `${safe}.txt`);
    } else if (format === "html") {
      /* v2.1 — standalone styled HTML, rendered with the same sanitized
       * markdown pipeline the app uses. Self-contained: no external requests. */
      const [{ createElement }, { renderToStaticMarkup }, editorMod] = await Promise.all([
        import("react"),
        import("react-dom/server"),
        import("@/components/nexnotes/editor"),
      ]);
      const inner = renderToStaticMarkup(createElement(editorMod.Markdown, null, noteToMarkdown(content)));
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const doc = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>body{max-width:760px;margin:0 auto;padding:48px 20px;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;color:#18181b;line-height:1.75}h1,h2,h3{line-height:1.25}code{font-family:ui-monospace,SFMono-Regular,monospace;font-size:.85em;background:#f4f4f5;padding:.15rem .35rem;border-radius:.35rem}pre{display:table;width:100%;background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;padding:12px;overflow-x:auto}pre>div{display:table-row}pre>div>span:last-child{display:table-cell;white-space:pre}blockquote{border-left:3px solid #e4e4e7;margin:0;padding-left:14px;color:#52525b}table{border-collapse:collapse;width:100%}th,td{border:1px solid #e4e4e7;padding:6px 10px;text-align:left}th{background:#fafafa}img{max-width:100%}footer{margin-top:48px;padding-top:14px;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a}a{color:#18181b}@media print{body{padding:0}}</style></head><body><h1>${esc(title)}</h1>${inner}<footer>Exported from NexNotes — local-first, E2E-encrypted notes. ${new Date().toLocaleDateString()}</footer></body></html>`;
      downloadBlob(new Blob([doc], { type: "text/html;charset=utf-8" }), `${safe}.html`);
    } else {
      downloadBlob(new Blob([`# ${title}\n\n${noteToMarkdown(content)}`], { type: "text/markdown" }), `${safe}.md`);
    }
    toast.success(`Exported ${safe}.${format}`, { duration: 1400 });
  },

  async importJson(file) {
    const text = await file.text();
    const data = JSON.parse(text) as {
      notes?: NoteDTO[]; folders?: FolderDTO[]; tags?: TagDTO[];
    };
    if (!Array.isArray(data.notes)) throw new Error("Not a NexNotes backup file");
    const state = get();
    const notes = { ...state.notes };
    const folders = { ...state.folders };
    const tags = { ...state.tags };

    for (const f of data.folders ?? []) {
      const local = folders[f.id];
      if (!local || new Date(local.updatedAt) < new Date(f.updatedAt)) {
        folders[f.id] = { ...f, dirty: true };
      }
    }
    for (const t of data.tags ?? []) {
      const local = tags[t.id];
      if (!local || new Date(local.updatedAt) < new Date(t.updatedAt)) {
        tags[t.id] = { ...t, dirty: true };
      }
    }
    for (const n of data.notes) {
      const decrypted = isEncrypted(n.content) ? "" : n.content; // foreign ciphertext can't be opened
      const local = notes[n.id];
      if (!local || new Date(local.updatedAt) < new Date(n.updatedAt)) {
        const merged: UiNote = {
          ...n,
          content: local ? n.content : decrypted,
          isEncrypted: false,
          trashedAt: n.trashedAt ?? null,
          dirty: true,
        };
        notes[n.id] = await persistNote(get(), merged);
      }
    }
    set({ notes, folders, tags });
    schedulePush(get(), 0);
  },

  async importFiles(files) {
    const state = get();
    const notes = { ...state.notes };
    for (const file of files.slice(0, 50)) {
      const text = await file.text();
      if (file.name.endsWith(".json")) continue;
      const t = new Date().toISOString();
      const title = file.name.replace(/\.(md|markdown|txt)$/i, "").slice(0, 200);
      const note: UiNote = {
        id: newId(), title, content: text.slice(0, 500_000), isEncrypted: false,
        folderId: null, tagIds: [], starred: false, noteType: "markdown",
        preventEdit: false, editorWidth: "narrow", locked: false, lockHash: null,
        conflictOf: null, pinned: false, archived: false, trashed: false,
        trashedAt: null, createdAt: t, updatedAt: t, dirty: true,
      };
      notes[note.id] = await persistNote(state, note);
    }
    set({ notes });
    schedulePush(get(), 0);
  },

  /* ---------------- Standard Notes import ---------------- */

  async importStandardNotes(file) {
    const state = get();
    if (!state.user) throw new Error("Not signed in");
    const text = await file.text();

    // transparently accept our own backups here too
    if (looksLikeNexNotesBackup(text)) {
      const blob = new File([text], file.name, { type: "application/json" });
      await get().importJson(blob);
      return { imported: Object.keys(get().notes).length, skippedEncrypted: 0 };
    }

    const result = parseStandardNotesBackup(text);
    if (!result.notes.length && result.skippedEncrypted > 0) {
      throw new Error(
        `This backup is encrypted. Export a DECRYPTED backup from Standard Notes (Account → Export → Decrypted) — ${result.skippedEncrypted} encrypted items were skipped.`
      );
    }

    const now = get();
    const notes = { ...now.notes };
    // SN tag names → NexNotes tags (created on demand)
    const tagNameToId = new Map<string, string>();
    for (const t of Object.values(now.tags)) tagNameToId.set(t.name, t.id);

    let imported = 0;
    for (const draft of result.notes) {
      if (notes[draft.externalId]) continue; // already imported before — idempotent
      const tagIds: string[] = [];
      for (const name of [...new Set(draft.tagNames)].slice(0, 10)) {
        const clean = name.trim().toLowerCase().replace(/^#/, "").slice(0, 60);
        if (!clean) continue;
        let tagId = tagNameToId.get(clean);
        if (!tagId) {
          tagId = await get().ensureTag(clean);
          if (tagId) tagNameToId.set(clean, tagId);
        }
        if (tagId) tagIds.push(tagId);
      }
      const t = new Date().toISOString();
      const note: UiNote = {
        id: draft.externalId, // keep the SN uuid → re-import stays idempotent
        title: draft.title,
        content: draft.content,
        isEncrypted: false,
        folderId: null,
        tagIds,
        starred: false,
        noteType: "markdown",
        preventEdit: false,
        editorWidth: "narrow",
        locked: false,
        lockHash: null,
        conflictOf: null,
        pinned: false,
        archived: !!draft.archived,
        trashed: !!draft.trashed,
        trashedAt: draft.trashed ? (draft.updatedAt ?? t) : null,
        createdAt: draft.createdAt ?? t,
        updatedAt: draft.updatedAt ?? t,
        dirty: true,
      };
      notes[note.id] = await persistNote(now, note);
      imported++;
    }
    set({ notes });
    schedulePush(get(), 0);
    return { imported, skippedEncrypted: result.skippedEncrypted };
  },

  async copyNoteMarkdown(id) {
    const state = get();
    const n = state.notes[id];
    if (!n) return;
    const u = state.unlockedNotes[id];
    const title = u ? u.title : isLockEncrypted(n.title) ? "Locked note" : n.title;
    const content = u ? u.content : isLockEncrypted(n.content) ? "🔒 Locked note" : n.content;
    const ok = await copyText(`# ${title || "Untitled"}\n\n${noteToMarkdown(content)}`);
    if (ok) toast.success("Note copied as Markdown", { duration: 1400 });
    else toast.error("Clipboard unavailable in this browser");
  },
}));

/* ------------------------------------------------------------------ */
/* files refresh helper                                                */
/* ------------------------------------------------------------------ */

async function refreshFiles(
  set: (partial: Partial<AppState>) => void,
  get: () => AppStore
) {
  try {
    const r = await fetch("/api/files");
    if (!r.ok) return;
    const { files } = (await r.json()) as { files: FileDTO[] };
    const existing = get().files;
    const merged: Record<string, UiFile> = { ...existing };
    for (const f of files) {
      merged[f.id] = { ...merged[f.id], ...f }; // keep cached data if present
    }
    await idbPut("files", Object.values(merged));
    set({ files: merged });
  } catch { /* offline — keep cache */ }
}

/* ------------------------------------------------------------------ */
/* selectors & utils                                                   */
/* ------------------------------------------------------------------ */

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function selectVisibleNotes(
  s: Pick<AppState, "notes" | "view" | "query" | "sort" | "unlockedNotes" | "smartViews">
): UiNote[] {
  const q = s.query.trim().toLowerCase();
  let list = Object.values(s.notes).filter((n) => {
    const kind = s.view.kind as string;
    if (kind === "conflicts") return !!n.conflictOf && !n.trashed;
    if (kind === "trash") return n.trashed;
    if (n.conflictOf && kind !== "conflicts") return false;
    if (s.view.kind === "archive") return n.archived && !n.trashed;
    if (s.view.kind === "starred") return n.starred && !n.trashed && !n.archived;
    if (s.view.kind === "untagged") return n.tagIds.length === 0 && !n.trashed && !n.archived;
    if (s.view.kind === "auth") return n.noteType === "authenticator" && !n.trashed && !n.archived;
    if (s.view.kind === "smart") {
      // v2.0 — Smart View filter (saved search); the live search box still narrows it
      if (n.trashed || n.archived) return false;
      const sv = s.smartViews.find((v) => v.id === s.view.id);
      if (!sv) return true;
      if (sv.starredOnly && !n.starred) return false;
      if (sv.noteType && n.noteType !== sv.noteType) return false;
      if (sv.tagId && !n.tagIds.includes(sv.tagId)) return false;
      if (sv.folderId && n.folderId !== sv.folderId) return false;
      const sq = sv.query.trim().toLowerCase();
      if (sq) {
        const u = s.unlockedNotes[n.id];
        const title = u ? u.title : isLockEncrypted(n.title) ? "" : n.title;
        const content = u ? u.content : isLockEncrypted(n.content) ? "" : n.content;
        if (!title.toLowerCase().includes(sq) && !content.toLowerCase().includes(sq)) return false;
      }
      return true;
    }
    if (n.trashed || n.archived) return false;
    if (s.view.kind === "folder") return n.folderId === s.view.id;
    if (s.view.kind === "tag") return n.tagIds.includes(s.view.id!);
    return true;
  });
  if (q) {
    list = list.filter((n) => {
      const u = s.unlockedNotes[n.id];
      const title = u ? u.title : isLockEncrypted(n.title) ? "" : n.title;
      const content = u ? u.content : isLockEncrypted(n.content) ? "" : n.content;
      return title.toLowerCase().includes(q) || content.toLowerCase().includes(q);
    });
  }
  const dir = s.sort.dir === "asc" ? 1 : -1;
  return list.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (s.sort.by === "title") {
      const ta = (s.unlockedNotes[a.id]?.title ?? a.title).toLowerCase();
      const tb = (s.unlockedNotes[b.id]?.title ?? b.title).toLowerCase();
      return ta < tb ? -dir : ta > tb ? dir : 0;
    }
    if (s.sort.by === "created") {
      return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
    }
    return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * dir;
  });
}

export function noteDisplayTitle(s: Pick<AppState, "unlockedNotes">, n: UiNote): string {
  const u = s.unlockedNotes[n.id];
  if (u) return u.title;
  if (isLockEncrypted(n.title) || (n.locked && !u)) return "🔒 Locked note";
  return n.title;
}

export { parse };
