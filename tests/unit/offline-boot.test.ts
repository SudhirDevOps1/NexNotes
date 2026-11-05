import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserDTO } from "@/lib/types";

/**
 * Offline boot + honest network errors (the Standard-Notes behaviour).
 *
 * boot() used to fall back to the cached session only when
 * navigator.onLine was false. That flag stays true on any network whose
 * server is unreachable — dev server stopped, Vercel asleep — so a reload
 * bounced people to the login screen with every cached note hidden, and
 * sign-in showed the browser's raw "Failed to fetch". These tests pin the
 * contract: an UNREACHABLE server continues the cached session (offline
 * chip on), only a definitive 401 signs the user out.
 */

const { idb, meta } = vi.hoisted(() => ({
  idb: {
    notes: new Map<string, Record<string, unknown>>(),
    folders: new Map<string, Record<string, unknown>>(),
    tags: new Map<string, Record<string, unknown>>(),
    files: new Map<string, Record<string, unknown>>(),
  },
  meta: new Map<string, unknown>(),
}));

vi.mock("@/lib/local-db", () => ({
  idbGetAll: async (store: keyof typeof idb) => [...idb[store].values()],
  idbPut: async (store: keyof typeof idb, items: Record<string, unknown>[]) => {
    for (const item of items) idb[store].set(item.id as string, item);
  },
  idbDelete: async () => {},
  idbGetMeta: async (key: string) => meta.get(key),
  idbSetMeta: async (key: string, value: unknown) => {
    meta.set(key, value);
  },
  idbClearAll: async () => {
    idb.notes.clear();
    idb.folders.clear();
    idb.tags.clear();
    idb.files.clear();
    meta.clear();
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/lib/clipboard", () => ({ copyText: vi.fn() }));

vi.mock("@/components/nexnotes/sheet-editor", () => ({
  parseSheet: () => null,
  sheetToMarkdown: () => "",
}));

const USER: UserDTO = {
  id: "u1",
  email: "solo@device.test",
  encryptionEnabled: false,
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  for (const m of [idb.notes, idb.folders, idb.tags, idb.files]) m.clear();
  meta.clear();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** every request dies at the network layer — the server is simply not there */
function serverDown() {
  vi.stubGlobal("fetch", (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch);
}

function notFound() {
  return new Response("not found", { status: 404 });
}

describe("boot with an unreachable server", () => {
  it("continues the cached session and flags offline — notes stay open", async () => {
    serverDown();
    meta.set("lastUser", USER);

    const { useApp } = await import("@/lib/store");
    await useApp.getState().boot();

    expect(useApp.getState().status).toBe("ready");
    expect(useApp.getState().user?.email).toBe(USER.email);
    expect(useApp.getState().online).toBe(false); // the chip must tell the truth
  });

  it("still signs out on a definitive 401 — a dead session is not an outage", async () => {
    meta.set("lastUser", USER);
    vi.stubGlobal("fetch", (async (url: RequestInfo | URL) => {
      if (String(url) === "/api/auth/me") return new Response("unauthorized", { status: 401 });
      return notFound();
    }) as typeof fetch);

    const { useApp } = await import("@/lib/store");
    await useApp.getState().boot();

    expect(useApp.getState().status).toBe("anon");
    expect(useApp.getState().user).toBeNull();
  });

  it("lands on anon with no cached session — nothing to continue", async () => {
    serverDown();
    const { useApp } = await import("@/lib/store");
    await useApp.getState().boot();
    expect(useApp.getState().status).toBe("anon");
  });
});

describe("auth network errors read like a human wrote them", () => {
  it("signIn explains the server is unreachable", async () => {
    serverDown();
    const { useApp } = await import("@/lib/store");
    await expect(useApp.getState().signIn("a@b.c", "password1")).rejects.toThrow(
      /Can't reach the server/
    );
  });

  it("signUp explains the server is unreachable", async () => {
    serverDown();
    const { useApp } = await import("@/lib/store");
    await expect(useApp.getState().signUp("a@b.c", "password1")).rejects.toThrow(
      /Can't reach the server/
    );
  });
});
