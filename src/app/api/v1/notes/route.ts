import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authApiToken, apiNote } from "@/lib/api-auth";
import type { NoteType, EditorWidth } from "@/lib/types";

export const dynamic = "force-dynamic";

const NOTE_TYPES: NoteType[] = ["markdown", "plain", "richtext", "task", "checklist", "code", "spreadsheet", "authenticator", "html"];
const WIDTHS: EditorWidth[] = ["narrow", "medium", "full"];

/**
 * GET /api/v1/notes            — list notes (?q=search&limit=&trash=1&archive=1)
 * POST /api/v1/notes           — create a note { title, content, noteType, folderId?, starred?, pinned? }
 *
 * Auth: Authorization: Bearer nx_…
 * With account E2E encryption enabled the server stores ciphertext only, so
 * `content` comes back as nxenc:v1:… — that is the zero-knowledge design.
 */
export async function GET(req: Request) {
  const tok = await authApiToken(req);
  if (!tok) return NextResponse.json({ error: "Invalid or revoked API token" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 100) || 100));
  const trash = url.searchParams.get("trash") === "1";
  const archive = url.searchParams.get("archive") === "1";

  const where: Record<string, unknown> = { userId: tok.userId };
  if (trash) {
    where.trashed = true;
  } else if (archive) {
    where.archived = true;
    where.trashed = false;
  } else {
    where.trashed = false;
    where.archived = false;
  }
  if (q) {
    where.OR = [{ title: { contains: q } }, { content: { contains: q } }];
  }

  const rows = await db.note.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({
    count: rows.length,
    notes: rows.map(apiNote),
  });
}

export async function POST(req: Request) {
  const tok = await authApiToken(req);
  if (!tok) return NextResponse.json({ error: "Invalid or revoked API token" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = String(body.title ?? "").slice(0, 500);
  const content = String(body.content ?? "");
  const noteType = NOTE_TYPES.includes(body.noteType as NoteType) ? (body.noteType as NoteType) : "markdown";
  const editorWidth = WIDTHS.includes(body.editorWidth as EditorWidth) ? (body.editorWidth as EditorWidth) : "narrow";
  const now = new Date();
  const id =
    typeof body.id === "string" && body.id.length >= 8
      ? body.id
      : `api-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  let folderId: string | null = null;
  if (typeof body.folderId === "string") {
    const folder = await db.folder.findFirst({ where: { id: body.folderId, userId: tok.userId } });
    folderId = folder?.id ?? null;
  }

  const created = await db.note.create({
    data: {
      id,
      userId: tok.userId,
      title,
      content,
      noteType,
      editorWidth,
      folderId,
      starred: !!body.starred,
      pinned: !!body.pinned,
      createdAt: now,
      updatedAt: now,
      isEncrypted: content.startsWith("nxenc:v1:"),
    },
  });

  return NextResponse.json({ note: apiNote(created) }, { status: 201 });
}
