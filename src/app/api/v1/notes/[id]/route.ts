import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authApiToken, apiNote } from "@/lib/api-auth";
import type { NoteType, EditorWidth } from "@/lib/types";

export const dynamic = "force-dynamic";

const NOTE_TYPES: NoteType[] = ["markdown", "plain", "task", "checklist", "code", "spreadsheet", "authenticator", "html"];
const WIDTHS: EditorWidth[] = ["narrow", "medium", "full"];

/**
 * GET    /api/v1/notes/:id — one note
 * PATCH  /api/v1/notes/:id — update fields { title?, content?, noteType?, starred?, … }
 * DELETE /api/v1/notes/:id — move to trash (hard delete with ?hard=1)
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const tok = await authApiToken(req);
  if (!tok) return NextResponse.json({ error: "Invalid or revoked API token" }, { status: 401 });
  const { id } = await ctx.params;
  const note = await db.note.findFirst({ where: { id, userId: tok.userId } });
  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  return NextResponse.json({ note: apiNote(note) });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const tok = await authApiToken(req);
  if (!tok) return NextResponse.json({ error: "Invalid or revoked API token" }, { status: 401 });
  const { id } = await ctx.params;
  const existing = await db.note.findFirst({ where: { id, userId: tok.userId } });
  if (!existing) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.title === "string") data.title = body.title.slice(0, 500);
  if (typeof body.content === "string") {
    data.content = body.content;
    data.isEncrypted = body.content.startsWith("nxenc:v1:");
  }
  if (NOTE_TYPES.includes(body.noteType as NoteType)) data.noteType = body.noteType;
  if (WIDTHS.includes(body.editorWidth as EditorWidth)) data.editorWidth = body.editorWidth;
  if (typeof body.starred === "boolean") data.starred = body.starred;
  if (typeof body.pinned === "boolean") data.pinned = body.pinned;
  if (typeof body.archived === "boolean") data.archived = body.archived;
  if (typeof body.trashed === "boolean") {
    data.trashed = body.trashed;
    data.trashedAt = body.trashed ? new Date() : null;
  }
  if (typeof body.preventEdit === "boolean") data.preventEdit = body.preventEdit;
  if (body.folderId === null || typeof body.folderId === "string") {
    if (body.folderId === null) {
      data.folderId = null;
    } else {
      const folder = await db.folder.findFirst({ where: { id: body.folderId as string, userId: tok.userId } });
      data.folderId = folder?.id ?? null;
    }
  }

  const updated = await db.note.update({ where: { id: existing.id }, data });
  return NextResponse.json({ note: apiNote(updated) });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const tok = await authApiToken(req);
  if (!tok) return NextResponse.json({ error: "Invalid or revoked API token" }, { status: 401 });
  const { id } = await ctx.params;
  const existing = await db.note.findFirst({ where: { id, userId: tok.userId } });
  if (!existing) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  const hard = new URL(req.url).searchParams.get("hard") === "1";
  if (hard) {
    await db.note.delete({ where: { id: existing.id } });
    await db.deletion.create({ data: { userId: tok.userId, itemType: "note", itemId: existing.id } });
    return NextResponse.json({ deleted: true, mode: "hard" });
  }
  await db.note.update({
    where: { id: existing.id },
    data: { trashed: true, trashedAt: new Date(), updatedAt: new Date() },
  });
  return NextResponse.json({ deleted: true, mode: "trash" });
}
