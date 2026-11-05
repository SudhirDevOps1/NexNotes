import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveKey, encryptText, isEncrypted } from "@/lib/crypto";
import type { HistoryDTO } from "@/lib/types";

/**
 * E2E vault regression tests (the "ciphertext everywhere" bug).
 *
 * The store contract (src/lib/store.ts header) is: the in-memory notes map is
 * PLAINTEXT for the UI; only the IndexedDB rows are ciphertext. Three code
 * paths used to swap encrypted rows into memory (enableEncryption,
 * updateNote/createNote, boot hydration) and made every note render as raw
 * `nxenc:v1:…` gibberish the moment E2E was enabled — one keystroke there
 * double-encrypted a note for good. These tests pin the contract.
 */

const { idb } = vi.hoisted(() => ({
  idb: {
    notes: new Map<string, Record<string, unknown>>(),
    folders: new Map<string, Record<string, unknown>>(),
    tags: new Map<string, Record<string, unknown>>(),
    files: new Map<string, Record<string, unknown>>(),
  },
}));

vi.mock("@/lib/local-db", () => ({
  idbGetAll: async (store: keyof typeof idb) => [...idb[store].values()],
  idbPut: async (store: keyof typeof idb, items: Record<string, unknown>[]) => {
    for (const item of items) idb[store].set(item.id as string, item);
  },
  idbDelete: async () => {},
  idbGetMeta: async () => undefined,
  idbSetMeta: async () => {},
  idbClearAll: async () => {},
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/lib/clipboard", () => ({ copyText: vi.fn() }));

vi.mock("@/components/nexnotes/sheet-editor", () => ({
  parseSheet: () => null,
  sheetToMarkdown: () => "",
}));

const USER = {
  id: "u1",
  email: "demo@nextnotes.app",
  encryptionEnabled: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};
const PW = "vault-password-123";

let syncBodies: { since: string | null; changes: { type: string; op: string; data: Record<string, unknown> }[] }[];

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** minimal valid NoteDTO for server-pulled notes */
function serverNote(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "srv1",
    title: "From server",
    content: "",
    isEncrypted: false,
    folderId: null,
    tagIds: [],
    starred: false,
    noteType: "markdown",
    preventEdit: false,
    editorWidth: "narrow",
    locked: false,
    lockHash: null,
    conflictOf: null,
    pinned: false,
    archived: false,
    trashed: false,
    trashedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  idb.notes.clear();
  idb.folders.clear();
  idb.tags.clear();
  idb.files.clear();
  syncBodies = [];
  // fresh store instance per test
  vi.resetModules();
  if (typeof sessionStorage !== "undefined") sessionStorage.clear();
});

describe("E2E vault store contract", () => {
  it("keeps the in-memory store PLAINTEXT after enabling encryption (only idb rows encrypt)", async () => {
    let encryptionEnabled = false;
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === "/api/auth/me") return okJson({ user: { ...USER, encryptionEnabled } });
      if (u === "/api/user/verify-password") {
        const { password } = JSON.parse(String(init?.body));
        return password === PW ? okJson({ ok: true }) : new Response(JSON.stringify({ ok: false }), { status: 401 });
      }
      if (u === "/api/user/settings" && init?.method === "PATCH") {
        encryptionEnabled = true;
        return okJson({ user: { ...USER, encryptionEnabled } });
      }
      if (u === "/api/sync") {
        const body = JSON.parse(String(init?.body));
        syncBodies.push(body);
        return okJson({ serverTime: new Date().toISOString(), notes: [], folders: [], tags: [], deletions: [], applied: 0, conflictsCreated: 0 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const { useApp } = await import("@/lib/store");
    await useApp.getState().boot();
    expect(useApp.getState().status).toBe("ready");

    const id = await useApp.getState().createNote();
    await useApp.getState().updateNote(id, { title: "My note", content: "Hello secret world" });
    expect(useApp.getState().notes[id].content).toBe("Hello secret world");

    await useApp.getState().enableEncryption(PW);
    // let the debounced push (schedulePush 0ms) fire
    await new Promise((r) => setTimeout(r, 30));

    // THE BUG: memory used to become raw nxenc ciphertext right here
    expect(useApp.getState().notes[id].content).toBe("Hello secret world");
    expect(useApp.getState().notes[id].title).toBe("My note");

    // idb row IS encrypted
    const row = idb.notes.get(id)!;
    expect(String(row.content)).toMatch(/^nxenc:v1:/);

    // and the sync push carries ciphertext, never plaintext
    const pushed = syncBodies.flatMap((b) => b.changes).filter((c) => c.type === "note");
    const mine = pushed.find((c) => (c.data as { id: string }).id === id);
    expect(String(mine?.data.content)).toMatch(/^nxenc:v1:/);
  });

  it("boot() decrypts hydrated IndexedDB rows when the vault key is restorable", async () => {
    let encryptionEnabled = false;
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === "/api/auth/me") return okJson({ user: { ...USER, encryptionEnabled } });
      if (u === "/api/user/verify-password") {
        const { password } = JSON.parse(String(init?.body));
        return password === PW ? okJson({ ok: true }) : new Response(JSON.stringify({ ok: false }), { status: 401 });
      }
      if (u === "/api/user/settings" && init?.method === "PATCH") {
        encryptionEnabled = true;
        return okJson({ user: { ...USER, encryptionEnabled } });
      }
      if (u === "/api/sync") {
        // server echo: the full note list as the server sees it (ciphertext)
        return okJson({
          serverTime: new Date().toISOString(),
          notes: [...idb.notes.values()],
          folders: [], tags: [], deletions: [], applied: 0, conflictsCreated: 0,
        });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const { useApp } = await import("@/lib/store");
    await useApp.getState().boot();
    const id = await useApp.getState().createNote();
    await useApp.getState().updateNote(id, { content: "survives a reload" });
    await useApp.getState().enableEncryption(PW);

    // simulate a reload: memory is wiped, only idb (ciphertext) remains
    useApp.setState({ notes: {}, encKey: null });
    await useApp.getState().boot();

    expect(useApp.getState().status).toBe("ready");
    expect(useApp.getState().notes[id].content).toBe("survives a reload"); // was nxenc gibberish before the fix
  });

  it("refuses to edit a note while the vault is locked — no double encryption", async () => {
    const { useApp } = await import("@/lib/store");
    const { encryptText: enc } = await import("@/lib/crypto");
    const key = await deriveKey(USER.email, PW);
    const ciphertext = await enc(key, "the real content");

    useApp.setState({
      user: { ...USER, encryptionEnabled: true },
      encKey: null, // vault locked
      notes: {
        n1: {
          id: "n1", title: "t", content: ciphertext, isEncrypted: true, folderId: null,
          tagIds: [], starred: false, noteType: "markdown", preventEdit: false,
          editorWidth: "narrow", locked: false, lockHash: null, conflictOf: null,
          pinned: false, archived: false, trashed: false, trashedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", dirty: false,
        },
      },
    });
    idb.notes.set("n1", { id: "n1", content: ciphertext });

    // a keystroke into a not-yet-decrypted note used to encrypt the ciphertext again
    await useApp.getState().updateNote("n1", { content: "typo fix" });

    expect(useApp.getState().notes.n1.content).toBe(ciphertext);
    const row = idb.notes.get("n1")!;
    expect(row.content).toBe(ciphertext); // untouched — no double-encrypted garbage

    // after unlocking, edits work again
    useApp.setState({ encKey: key });
    await useApp.getState().updateNote("n1", { content: "typo fixed for real" });
    expect(useApp.getState().notes.n1.content).toBe("typo fixed for real");
    const row2 = idb.notes.get("n1")!;
    expect(String(row2.content)).toMatch(/^nxenc:v1:/);
    const key2 = await deriveKey(USER.email, PW);
    const { decryptText } = await import("@/lib/crypto");
    expect(await decryptText(key2, String(row2.content))).toBe("typo fixed for real");
  });

  it("sync pull decrypts with the vault key and keeps ciphertext (never blanks a note) on failure", async () => {
    const { useApp } = await import("@/lib/store");
    const { decryptText } = await import("@/lib/crypto");
    const key = await deriveKey(USER.email, PW);
    const goodCipher = await encryptText(key, "server-side secret");
    const badCipher = await encryptText(await deriveKey("someone@else.dev", "other-pw"), "other account");

    let payload: { notes: unknown[] } = { notes: [] };
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      if (String(url) === "/api/sync") {
        return okJson({ serverTime: new Date().toISOString(), ...payload, folders: [], tags: [], deletions: [], applied: 0, conflictsCreated: 0 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    useApp.setState({
      user: { ...USER, encryptionEnabled: true },
      encKey: null,
      notes: {},
      lastSyncAt: "2026-01-01T00:00:00.000Z",
    });

    // vault locked: pulled ciphertext must stay ciphertext — not "" (the old bug hid data)
    payload = { notes: [serverNote({ id: "srv1", content: goodCipher, isEncrypted: true })] };
    await useApp.getState().sync(true);
    expect(isEncrypted(useApp.getState().notes.srv1.content)).toBe(true);

    // vault unlocked: a NEWER server revision decrypts on apply
    useApp.setState({ encKey: key });
    payload = { notes: [serverNote({ id: "srv1", content: goodCipher, isEncrypted: true, updatedAt: "2026-01-03T00:00:00.000Z" })] };
    await useApp.getState().sync(true);
    expect(useApp.getState().notes.srv1.content).toBe("server-side secret");

    // a note encrypted with a DIFFERENT key keeps its ciphertext (no blanking)
    payload = { notes: [serverNote({ id: "srv2", content: badCipher, isEncrypted: true })] };
    await useApp.getState().sync(true);
    expect(useApp.getState().notes.srv2.content).toBe(badCipher);
  });

  it("unlockVault decrypts everything in memory and keeps undecryptable notes as ciphertext", async () => {
    let encryptionEnabled = true;
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === "/api/auth/me") return okJson({ user: { ...USER, encryptionEnabled } });
      if (u === "/api/user/verify-password") {
        const { password } = JSON.parse(String(init?.body));
        return password === PW ? okJson({ ok: true }) : new Response(JSON.stringify({ ok: false }), { status: 401 });
      }
      if (u === "/api/user/settings" && init?.method === "PATCH") {
        encryptionEnabled = Boolean(JSON.parse(String(init?.body)).encryptionEnabled);
        return okJson({ user: { ...USER, encryptionEnabled } });
      }
      if (u === "/api/sync") {
        return okJson({ serverTime: new Date().toISOString(), notes: [], folders: [], tags: [], deletions: [], applied: 0, conflictsCreated: 0 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const { useApp } = await import("@/lib/store");
    await useApp.getState().boot();
    const good = await useApp.getState().createNote();
    await useApp.getState().updateNote(good, { content: "readable after unlock" });
    await useApp.getState().enableEncryption(PW);

    // a note encrypted with a lost/different password
    const alienKey = await deriveKey("lost@device.dev", "old-password");
    const alienCipher = await encryptText(alienKey, "cannot decrypt me");
    // simulate a locked hydrated session: the good note carries its idb ciphertext
    const goodRow = idb.notes.get(good)!;
    useApp.setState({
      notes: {
        [good]: { ...useApp.getState().notes[good], content: String(goodRow.content) },
        lost: { ...useApp.getState().notes[good], id: "lost", content: alienCipher },
      },
      encKey: null,
      status: "locked",
    });

    await useApp.getState().unlockVault(PW);

    expect(useApp.getState().status).toBe("ready");
    expect(useApp.getState().notes[good].content).toBe("readable after unlock");
    // undecryptable: stays ciphertext for the UI gate — NOT "" (old bug hid it)
    expect(useApp.getState().notes.lost.content).toBe(alienCipher);
  });

  it("restoreVersion decrypts an encrypted history version instead of double-encrypting", async () => {
    const { useApp } = await import("@/lib/store");
    const { decryptText } = await import("@/lib/crypto");
    const key = await deriveKey(USER.email, PW);
    const versionCipher = await encryptText(key, "version one text");

    useApp.setState({
      user: { ...USER, encryptionEnabled: true },
      encKey: key,
      notes: {
        n1: {
          id: "n1", title: "t", content: "current text", isEncrypted: true, folderId: null,
          tagIds: [], starred: false, noteType: "markdown", preventEdit: false,
          editorWidth: "narrow", locked: false, lockHash: null, conflictOf: null,
          pinned: false, archived: false, trashed: false, trashedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", dirty: false,
        },
      },
    });

    const version: HistoryDTO = {
      id: "v1", noteId: "n1", title: "old title", content: versionCipher,
      isEncrypted: true, createdAt: "2026-01-01T00:00:00.000Z",
    };
    await useApp.getState().restoreVersion("n1", version);

    expect(useApp.getState().notes.n1.content).toBe("version one text");
    expect(useApp.getState().notes.n1.title).toBe("old title");
    void decryptText;
  });

  it("unlockVault on a fresh device (empty IndexedDB) rejects ANY wrong password online", async () => {
    // v2.3 bugfix — the demo-account lockout: a fresh browser has no notes in
    // memory, the old note-probe had nothing to verify against, so ANY
    // password unlocked the vault and the subsequent sync re-encrypted every
    // server note with a key nobody knew.
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === "/api/auth/me") return okJson({ user: { ...USER, encryptionEnabled: true } });
      if (u === "/api/user/verify-password") {
        const { password } = JSON.parse(String(init?.body));
        return password === PW ? okJson({ ok: true }) : new Response(JSON.stringify({ ok: false }), { status: 401 });
      }
      if (u === "/api/sync") {
        return okJson({ serverTime: new Date().toISOString(), notes: [], folders: [], tags: [], deletions: [], applied: 0, conflictsCreated: 0 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const { useApp } = await import("@/lib/store");
    await useApp.getState().boot();
    expect(useApp.getState().status).toBe("locked"); // fresh device + E2E account
    expect(Object.keys(useApp.getState().notes)).toHaveLength(0); // nothing to probe

    await expect(useApp.getState().unlockVault("whatever-i-typed")).rejects.toThrow("Wrong password");
    expect(useApp.getState().status).toBe("locked");

    // the real account password still unlocks
    await useApp.getState().unlockVault(PW);
    expect(useApp.getState().status).toBe("ready");
  });

  it("enableEncryption refuses a password the server rejects — nothing gets encrypted", async () => {
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === "/api/auth/me") return okJson({ user: { ...USER, encryptionEnabled: false } });
      if (u === "/api/user/verify-password") {
        const { password } = JSON.parse(String(init?.body));
        return password === PW ? okJson({ ok: true }) : new Response(JSON.stringify({ ok: false }), { status: 401 });
      }
      if (u === "/api/user/settings" && init?.method === "PATCH") {
        throw new Error("PATCH must never be reached with a rejected password");
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const { useApp } = await import("@/lib/store");
    await useApp.getState().boot();
    const id = await useApp.getState().createNote();
    await useApp.getState().updateNote(id, { content: "still plaintext" });

    await expect(useApp.getState().enableEncryption("typo-password")).rejects.toThrow("Wrong account password");
    expect(useApp.getState().user!.encryptionEnabled).toBe(false);
    expect(useApp.getState().encKey).toBe(null);
    expect(useApp.getState().notes[id].content).toBe("still plaintext");
    const row = idb.notes.get(id)!;
    expect(String(row.content)).not.toMatch(/^nxenc:/); // nothing was encrypted
  });

  it("enableEncryption never double-encrypts stray ciphertext — skips it and reports locked notes", async () => {
    const alienCipher = await encryptText(await deriveKey("lost@device.dev", "old-pw"), "orphan");

    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === "/api/auth/me") return okJson({ user: { ...USER, encryptionEnabled: false } });
      if (u === "/api/user/verify-password") {
        const { password } = JSON.parse(String(init?.body));
        return password === PW ? okJson({ ok: true }) : new Response(JSON.stringify({ ok: false }), { status: 401 });
      }
      if (u === "/api/user/settings" && init?.method === "PATCH") {
        return okJson({ user: { ...USER, encryptionEnabled: true } });
      }
      if (u === "/api/sync") {
        return okJson({ serverTime: new Date().toISOString(), notes: [], folders: [], tags: [], deletions: [], applied: 0, conflictsCreated: 0 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const { useApp } = await import("@/lib/store");
    await useApp.getState().boot();
    const id = await useApp.getState().createNote();
    await useApp.getState().updateNote(id, { content: "normal note" });
    // the stray ciphertext exists in memory (as decryptVaultInMemory leaves it)
    // AND in IndexedDB (as a previous session persisted it)
    idb.notes.set("orphan", { id: "orphan", content: alienCipher, isEncrypted: true });
    useApp.setState({
      notes: {
        ...useApp.getState().notes,
        orphan: { ...useApp.getState().notes[id], id: "orphan", content: alienCipher },
      },
    });

    const { lockedNotes } = await useApp.getState().enableEncryption(PW);
    expect(lockedNotes).toBe(1);

    // the orphan keeps its ORIGINAL ciphertext — not a second nxenc wrapper
    expect(useApp.getState().notes.orphan.content).toBe(alienCipher);
    const row = idb.notes.get("orphan")!;
    expect(row.content).toBe(alienCipher);
    const occurrences = String(row.content).split("nxenc:v1:").length - 1;
    expect(occurrences).toBe(1); // double encryption used to make this 2

    // the healthy note IS encrypted
    const goodRow = idb.notes.get(id)!;
    expect(String(goodRow.content)).toMatch(/^nxenc:v1:/);
  });

  it("disableEncryption works with the correct account password even when a stray note cannot decrypt", async () => {
    // v2.3 bugfix — the deadlock: the old disable probe required decrypting
    // the FIRST encrypted note, so one stray note encrypted with a lost key
    // made it impossible to ever turn E2E off ("Wrong password — cannot
    // decrypt your notes" with the CORRECT password).
    const key = await deriveKey(USER.email, PW);
    const alienCipher = await encryptText(await deriveKey("lost@device.dev", "old-pw"), "orphan");

    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === "/api/auth/me") return okJson({ user: { ...USER, encryptionEnabled: true } });
      if (u === "/api/user/verify-password") {
        const { password } = JSON.parse(String(init?.body));
        return password === PW ? okJson({ ok: true }) : new Response(JSON.stringify({ ok: false }), { status: 401 });
      }
      if (u === "/api/user/settings" && init?.method === "PATCH") {
        return okJson({ user: { ...USER, encryptionEnabled: false } });
      }
      if (u === "/api/sync") {
        return okJson({ serverTime: new Date().toISOString(), notes: [], folders: [], tags: [], deletions: [], applied: 0, conflictsCreated: 0 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const { useApp } = await import("@/lib/store");

    useApp.setState({
      user: { ...USER, encryptionEnabled: true },
      encKey: key,
      notes: {
        good: {
          id: "good", title: "t", content: "readable note", isEncrypted: true, folderId: null,
          tagIds: [], starred: false, noteType: "markdown", preventEdit: false,
          editorWidth: "narrow", locked: false, lockHash: null, conflictOf: null,
          pinned: false, archived: false, trashed: false, trashedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", dirty: false,
        },
        stray: {
          id: "stray", title: "lost", content: alienCipher, isEncrypted: true, folderId: null,
          tagIds: [], starred: false, noteType: "markdown", preventEdit: false,
          editorWidth: "narrow", locked: false, lockHash: null, conflictOf: null,
          pinned: false, archived: false, trashed: false, trashedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", dirty: false,
        },
      },
    });

    const { lockedNotes } = await useApp.getState().disableEncryption(PW);
    expect(lockedNotes).toBe(1); // the stray stays locked — but disable WORKS
    expect(useApp.getState().encKey).toBe(null);
    expect(useApp.getState().user!.encryptionEnabled).toBe(false);
    expect(useApp.getState().notes.good.content).toBe("readable note");
    expect(useApp.getState().notes.stray.content).toBe(alienCipher); // untouched
  });
});

describe("vault recovery (v2.3.1)", () => {
  it("a dead session reports 'sign in again', never 'wrong password', and encrypts nothing", async () => {
    // The server answers 401 for BOTH "wrong password" and "no valid
    // session" — the client used to read every 401 as a bad password, so a
    // stale cookie (server DB rebuilt, session expired) screamed "Wrong
    // account password" at people whose password was perfectly fine.
    let patchCalls = 0;
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === "/api/auth/me") return okJson({ user: USER });
      if (u === "/api/user/verify-password") {
        return new Response(JSON.stringify({ ok: false, reason: "unauthenticated" }), { status: 401 });
      }
      if (u === "/api/user/settings" && init?.method === "PATCH") {
        patchCalls++;
        return okJson({ user: { ...USER, encryptionEnabled: true } });
      }
      if (u === "/api/sync") {
        return okJson({ serverTime: new Date().toISOString(), notes: [], folders: [], tags: [], deletions: [], applied: 0, conflictsCreated: 0 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const { useApp } = await import("@/lib/store");
    useApp.setState({ user: { ...USER } });

    // seed one plaintext note in memory and in IndexedDB
    idb.notes.set("n1", { id: "n1", content: "plain text", isEncrypted: false });
    useApp.setState({
      notes: {
        n1: {
          id: "n1", title: "t", content: "plain text", isEncrypted: false, folderId: null,
          tagIds: [], starred: false, noteType: "markdown", preventEdit: false,
          editorWidth: "narrow", locked: false, lockHash: null, conflictOf: null,
          pinned: false, archived: false, trashed: false, trashedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", dirty: false,
        },
      },
    });

    await expect(useApp.getState().enableEncryption(PW)).rejects.toThrow(
      /session has expired/
    );
    expect(patchCalls).toBe(0); // no settings flip behind a dead session
    expect(useApp.getState().user!.encryptionEnabled).toBe(false);
    expect(idb.notes.get("n1")!.content).toBe("plain text"); // nothing encrypted
  });

  it("resetPassword rotates the password through the recovery endpoint (E2E off)", async () => {
    const bodies: Record<string, unknown>[] = [];
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u === "/api/auth/me") return okJson({ user: USER });
      if (u === "/api/auth/reset-password") {
        bodies.push(JSON.parse(String(init?.body)));
        return okJson({ ok: true });
      }
      if (u === "/api/sync") {
        return okJson({ serverTime: new Date().toISOString(), notes: [], folders: [], tags: [], deletions: [], applied: 0, conflictsCreated: 0 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const { useApp } = await import("@/lib/store");
    useApp.setState({ user: { ...USER } });

    await expect(useApp.getState().resetPassword("brand-new-pw")).resolves.toBeUndefined();
    expect(bodies).toEqual([{ newPassword: "brand-new-pw" }]);

    // server refusal (E2E on → 409) surfaces its message verbatim
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ error: "End-to-end encryption is on — the password cannot be reset without the current one." }),
        { status: 409 }
      )) as typeof fetch;
    await expect(useApp.getState().resetPassword("another-pw")).rejects.toThrow(
      /cannot be reset without the current one/
    );
  });
});
