import crypto from "node:crypto";
import { db } from "@/lib/db";

/**
 * REST API v1 auth (v1.3) — personal bearer tokens, Obsidian-style.
 *
 * Tokens look like `nx_<24 base64url chars>`; only the SHA-256 hash is stored
 * (ApiToken.tokenHash). The raw token is returned exactly once at creation.
 * Pass as:  Authorization: Bearer nx_xxxxxxxx
 */

export interface ApiTokenRecord {
  id: string;
  userId: string;
  name: string;
  prefix: string;
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createRawToken(): { token: string; prefix: string; tokenHash: string } {
  const token = `nx_${crypto.randomBytes(24).toString("base64url")}`;
  return { token, prefix: token.slice(0, 11), tokenHash: hashToken(token) };
}

/** Returns the token row (with userId) when the request carries a valid bearer token. */
export async function authApiToken(req: Request): Promise<ApiTokenRecord | null> {
  const header = req.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+(nx_[A-Za-z0-9_-]{16,})$/i);
  if (!m) return null;
  const rec = await db.apiToken.findUnique({ where: { tokenHash: hashToken(m[1]) } });
  if (!rec || rec.revokedAt) return null;
  // fire-and-forget last-used stamp (don't block the response on failure)
  void db.apiToken.update({ where: { id: rec.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  return { id: rec.id, userId: rec.userId, name: rec.name, prefix: rec.prefix };
}

/** Shape a note row for API output (same fields the web client syncs). */
export function apiNote(n: {
  id: string; title: string; content: string; isEncrypted: boolean; folderId: string | null;
  starred: boolean; noteType: string; preventEdit: boolean; editorWidth: string;
  locked: boolean; conflictOf: string | null; pinned: boolean; archived: boolean;
  trashed: boolean; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: n.id,
    title: n.title,
    content: n.content, // ciphertext when account E2E is on (by design — zero-knowledge)
    isEncrypted: n.isEncrypted,
    noteType: n.noteType,
    folderId: n.folderId,
    starred: n.starred,
    pinned: n.pinned,
    archived: n.archived,
    trashed: n.trashed,
    preventEdit: n.preventEdit,
    editorWidth: n.editorWidth,
    locked: n.locked,
    conflictOf: n.conflictOf,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}
