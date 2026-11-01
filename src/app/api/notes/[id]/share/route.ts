import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * v2.0 — Public share links (Listed-style publishing, self-hosted).
 *
 * POST /api/notes/:id/share  { enabled: true }  → creates/enables a read-only
 * public page at /s/<token> and returns the link. { enabled: false } revokes.
 *
 * Privacy-first: off by default, token is a 128-bit random value, the public
 * page is noindex and renders sanitized content only, and trashed notes are
 * never served.
 */
const schema = z.object({ enabled: z.boolean() });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const uid = await getSessionUserId();
    if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const { id } = await ctx.params;
    const note = await db.note.findFirst({ where: { id, userId: uid } });
    if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Send { enabled: boolean }." }, { status: 400 });

    if (!parsed.data.enabled) {
      await db.note.update({ where: { id: note.id }, data: { shareEnabled: false } });
      return NextResponse.json({ enabled: false });
    }

    const shareToken = note.shareToken ?? crypto.randomBytes(16).toString("base64url");
    await db.note.update({ where: { id: note.id }, data: { shareToken, shareEnabled: true } });

    return NextResponse.json({
      enabled: true,
      token: shareToken,
      path: `/s/${shareToken}`,
    });
  } catch (e) {
    console.error("share link error", e);
    return NextResponse.json({ error: "Share failed. Try again." }, { status: 500 });
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const note = await db.note.findFirst({
    where: { id, userId: uid },
    select: { shareToken: true, shareEnabled: true },
  });
  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  return NextResponse.json({
    enabled: note.shareEnabled,
    token: note.shareToken,
    path: note.shareToken && note.shareEnabled ? `/s/${note.shareToken}` : null,
  });
}
