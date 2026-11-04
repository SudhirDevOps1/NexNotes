import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import type { Change, NoteDTO, FolderDTO, TagDTO, SyncResponse, NoteType, EditorWidth } from "@/lib/types";

/**
 * Local-first sync endpoint.
 *
 * Push: client sends its dirty changes (upserts with client-owned timestamps,
 * deletes as tombstones). Server applies them with last-write-wins semantics
 * (comparing the client-supplied updatedAt). When an older edit arrives for a
 * note that changed on the server, the incoming copy is kept as a CONFLICT
 * copy (conflictOf set) instead of being dropped. Every pushed edit that
 * changes an existing note's content first snapshots the previous version
 * into NoteHistory (max 25 versions per note).
 * Pull: server returns everything updated after `since` (or everything on a
 * first sync when `since` is null).
 */

const NOTE_TYPES: NoteType[] = ["markdown", "plain", "richtext", "task", "checklist", "code", "spreadsheet", "authenticator", "html"];
const WIDTHS: EditorWidth[] = ["narrow", "medium", "full"];
const HISTORY_CAP = 25;

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string" && !(v instanceof Date)) return null;
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Folders and tags carry unique(userId, name). The rename guard below covers
 * the sequential case, but two devices pushing the same name on different ids
 * inside one batch — or the suffixed name itself already taken — still reach
 * P2002. Failing the change is the worst answer: the client keeps it queued
 * and retries the same batch forever (that is the "Invalid prisma.tag.create()
 * invocation" spam seen in desktop server logs). Retry instead with a longer
 * suffix so the row lands under a free name; a third failure is genuinely
 * abnormal and goes back to the per-change catch.
 */
async function upsertNamed(
  model: "folder" | "tag",
  id: string,
  data: { userId: string; name: string; createdAt: Date; updatedAt: Date }
): Promise<void> {
  const cap = model === "folder" ? 100 : 60;
  let name = data.name;
  for (let attempt = 0; ; attempt++) {
    try {
      if (model === "folder") {
        await db.folder.upsert({ where: { id }, create: { id, ...data, name }, update: { ...data, name } });
      } else {
        await db.tag.upsert({ where: { id }, create: { id, ...data, name }, update: { ...data, name } });
      }
      return;
    } catch (e) {
      if ((e as { code?: string })?.code !== "P2002" || attempt >= 2) throw e;
      const suffix = `${id.slice(0, 4)}${attempt ? `-${Date.now().toString(36)}` : ""}`;
      name = `${name.slice(0, cap - suffix.length - 1)}-${suffix}`;
    }
  }
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { since?: unknown; changes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const since = parseDate(body.since);
  const changes = Array.isArray(body.changes) ? (body.changes as Change[]) : [];
  let applied = 0;
  let conflictsCreated = 0;

  for (const ch of changes.slice(0, 500)) {
    try {
      if (ch.type === "note") {
        if (ch.op === "delete") {
          await db.note.deleteMany({ where: { id: ch.id, userId: user.id } });
          await db.deletion.create({ data: { userId: user.id, itemType: "note", itemId: ch.id } });
          applied++;
          continue;
        }
        const d = ch.data;
        if (!d || typeof d.id !== "string") continue;
        const updatedAt = parseDate(d.updatedAt);
        const createdAt = parseDate(d.createdAt) ?? updatedAt ?? new Date();
        if (!updatedAt) continue;

        const existing = await db.note.findUnique({ where: { id: d.id } });
        if (existing) {
          if (existing.userId !== user.id) continue; // foreign id — ignore
          // LWW: server copy is strictly newer → keep the stale push as a conflict copy
          if (existing.updatedAt.getTime() > updatedAt.getTime() + 499) {
            const incomingContent = String(d.content ?? "");
            const differs = incomingContent !== existing.content || String(d.title ?? "") !== existing.title;
            const dupe = differs
              ? await db.note.findFirst({
                  where: { userId: user.id, conflictOf: existing.id, content: incomingContent, trashed: false },
                  select: { id: true },
                })
              : { id: "x" };
            if (differs && !dupe) {
              await db.note.create({
                data: {
                  id: d.id ?? crypto.randomUUID(),
                  userId: user.id,
                  title: String(d.title ?? "").slice(0, 500),
                  content: incomingContent.slice(0, 2_000_000),
                  isEncrypted: !!d.isEncrypted,
                  folderId: existing.folderId,
                  starred: false,
                  noteType: NOTE_TYPES.includes(d.noteType) ? d.noteType : "markdown",
                  conflictOf: existing.id,
                  pinned: false,
                  archived: false,
                  trashed: false,
                  trashedAt: null,
                  createdAt: updatedAt,
                  updatedAt: new Date(),
                },
              });
              conflictsCreated++;
              applied++;
            }
            continue;
          }
        }

        // snapshot the replaced version into history (E2E ciphertext stays opaque)
        if (existing && existing.content !== String(d.content ?? "") && String(d.content ?? "") !== "") {
          await db.noteHistory.create({
            data: {
              userId: user.id,
              noteId: existing.id,
              title: existing.title,
              content: existing.content,
              isEncrypted: existing.isEncrypted,
              createdAt: existing.updatedAt,
            },
          });
          const hist = await db.noteHistory.findMany({
            where: { noteId: existing.id },
            orderBy: { createdAt: "desc" },
            skip: HISTORY_CAP,
            select: { id: true },
          });
          if (hist.length) {
            await db.noteHistory.deleteMany({ where: { id: { in: hist.map((h) => h.id) } } });
          }
        }

        // validate folder ownership
        let folderId: string | null = null;
        if (typeof d.folderId === "string" && d.folderId) {
          const folder = await db.folder.findFirst({ where: { id: d.folderId, userId: user.id } });
          if (folder) folderId = folder.id;
        }

        const noteType = NOTE_TYPES.includes(d.noteType) ? d.noteType : "markdown";
        const editorWidth = WIDTHS.includes(d.editorWidth) ? d.editorWidth : "narrow";
        const data = {
          userId: user.id,
          title: String(d.title ?? "").slice(0, 500),
          content: String(d.content ?? ""),
          isEncrypted: !!d.isEncrypted,
          folderId,
          starred: !!d.starred,
          noteType,
          preventEdit: !!d.preventEdit,
          editorWidth,
          locked: !!d.locked,
          lockHash: typeof d.lockHash === "string" ? d.lockHash : null,
          conflictOf: typeof d.conflictOf === "string" ? d.conflictOf : null,
          pinned: !!d.pinned,
          archived: !!d.archived,
          trashed: !!d.trashed,
          trashedAt: d.trashed ? (parseDate(d.trashedAt) ?? updatedAt) : null,
          createdAt,
          updatedAt,
        };

        const saved = await db.note.upsert({ where: { id: d.id }, create: { id: d.id, ...data }, update: data });

        // rebuild tag links
        if (Array.isArray(d.tagIds)) {
          const ownedIds = [...new Set(d.tagIds.filter((x: unknown) => typeof x === "string"))];
          const owned = ownedIds.length
            ? await db.tag.findMany({ where: { userId: user.id, id: { in: ownedIds } }, select: { id: true } })
            : [];
          await db.noteTag.deleteMany({ where: { noteId: saved.id } });
          for (const t of owned) {
            await db.noteTag.create({ data: { noteId: saved.id, tagId: t.id } }).catch(() => {});
          }
        }
        applied++;
      } else if (ch.type === "folder") {
        if (ch.op === "delete") {
          await db.folder.deleteMany({ where: { id: ch.id, userId: user.id } });
          await db.deletion.create({ data: { userId: user.id, itemType: "folder", itemId: ch.id } });
          applied++;
          continue;
        }
        const d = ch.data;
        if (!d || typeof d.id !== "string" || !d.name) continue;
        const updatedAt = parseDate(d.updatedAt);
        const createdAt = parseDate(d.createdAt) ?? updatedAt ?? new Date();
        if (!updatedAt) continue;
        const existing = await db.folder.findUnique({ where: { id: d.id } });
        if (existing) {
          if (existing.userId !== user.id) continue;
          if (existing.updatedAt.getTime() > updatedAt.getTime() + 499) continue;
        }
        const data = { userId: user.id, name: String(d.name).slice(0, 100), createdAt, updatedAt };
        await upsertNamed("folder", d.id, data);
        applied++;
      } else if (ch.type === "tag") {
        if (ch.op === "delete") {
          await db.tag.deleteMany({ where: { id: ch.id, userId: user.id } });
          await db.deletion.create({ data: { userId: user.id, itemType: "tag", itemId: ch.id } });
          applied++;
          continue;
        }
        const d = ch.data;
        if (!d || typeof d.id !== "string" || !d.name) continue;
        const updatedAt = parseDate(d.updatedAt);
        const createdAt = parseDate(d.createdAt) ?? updatedAt ?? new Date();
        if (!updatedAt) continue;
        const existing = await db.tag.findUnique({ where: { id: d.id } });
        if (existing) {
          if (existing.userId !== user.id) continue;
          if (existing.updatedAt.getTime() > updatedAt.getTime() + 499) continue;
        }
        // respect unique(userId,name): if another tag already owns the name, rename ours slightly
        let name = String(d.name).slice(0, 60).trim() || "tag";
        const nameOwner = await db.tag.findFirst({ where: { userId: user.id, name } });
        if (nameOwner && nameOwner.id !== d.id) name = `${name}-${d.id.slice(0, 4)}`.slice(0, 60);
        await upsertNamed("tag", d.id, { userId: user.id, name, createdAt, updatedAt });
        applied++;
      }
    } catch (e) {
      console.error("sync change failed", ch.type, ch.op, e);
    }
  }

  // Pull (incremental or full)
  const sinceFilter = since ? { updatedAt: { gt: since } } : undefined;
  const [notes, folders, tags, deletions] = await Promise.all([
    db.note.findMany({ where: { userId: user.id, ...(sinceFilter ?? {}) } }),
    db.folder.findMany({ where: { userId: user.id, ...(sinceFilter ?? {}) } }),
    db.tag.findMany({ where: { userId: user.id, ...(sinceFilter ?? {}) } }),
    since
      ? db.deletion.findMany({ where: { userId: user.id, deletedAt: { gt: since } } })
      : Promise.resolve([]),
  ]);

  // housekeeping: drop tombstones older than 30 days
  if (since) {
    await db.deletion.deleteMany({
      where: { userId: user.id, deletedAt: { lt: new Date(Date.now() - 30 * 86400_000) } },
    }).catch(() => {});

    // auto-purge notes trashed more than 30 days ago (Standard Notes behaviour)
    const purgeCutoff = new Date(Date.now() - 30 * 86400_000);
    const stale = await db.note.findMany({
      where: { userId: user.id, trashed: true, trashedAt: { lt: purgeCutoff } },
      select: { id: true },
    }).catch(() => [] as { id: string }[]);
    if (stale.length) {
      await db.note.deleteMany({ where: { id: { in: stale.map((n) => n.id) } } }).catch(() => {});
    }
  }

  const noteTagLinks = notes.length
    ? await db.noteTag.findMany({ where: { noteId: { in: notes.map((n) => n.id) } } })
    : [];

  const noteDTOs: NoteDTO[] = notes.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
    isEncrypted: n.isEncrypted,
    folderId: n.folderId,
    tagIds: noteTagLinks.filter((l) => l.noteId === n.id).map((l) => l.tagId),
    starred: n.starred,
    noteType: (NOTE_TYPES.includes(n.noteType as NoteType) ? n.noteType : "markdown") as NoteType,
    preventEdit: n.preventEdit,
    editorWidth: (WIDTHS.includes(n.editorWidth as EditorWidth) ? n.editorWidth : "narrow") as EditorWidth,
    locked: n.locked,
    lockHash: n.lockHash,
    conflictOf: n.conflictOf,
    pinned: n.pinned,
    archived: n.archived,
    trashed: n.trashed,
    trashedAt: n.trashedAt ? n.trashedAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  }));
  const folderDTOs: FolderDTO[] = folders.map((f) => ({
    id: f.id,
    name: f.name,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  }));
  const tagDTOs: TagDTO[] = tags.map((t) => ({
    id: t.id,
    name: t.name,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));

  const res: SyncResponse = {
    serverTime: new Date().toISOString(),
    notes: noteDTOs,
    folders: folderDTOs,
    tags: tagDTOs,
    deletions: deletions.map((d) => ({
      itemType: d.itemType as "note" | "folder" | "tag",
      itemId: d.itemId,
    })),
    applied,
    conflictsCreated,
  };
  return NextResponse.json(res);
}
