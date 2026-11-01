import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import type { HistoryDTO } from "@/lib/types";

/**
 * GET /api/history/:noteId — version history of one note.
 * Content is returned as stored (plaintext / E2E ciphertext / note-lock
 * ciphertext); the client decrypts what it can.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ noteId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { noteId } = await params;
  const note = await db.note.findFirst({
    where: { id: noteId, userId: user.id },
    select: { id: true },
  });
  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  const rows = await db.noteHistory.findMany({
    where: { noteId, userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const versions: HistoryDTO[] = rows.map((h) => ({
    id: h.id,
    noteId: h.noteId,
    title: h.title,
    content: h.content,
    isEncrypted: h.isEncrypted,
    createdAt: h.createdAt.toISOString(),
  }));
  return NextResponse.json({ versions });
}

/** DELETE /api/history/:noteId — clear all snapshots of a note. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ noteId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { noteId } = await params;
  await db.noteHistory.deleteMany({ where: { noteId, userId: user.id } });
  return NextResponse.json({ ok: true });
}
