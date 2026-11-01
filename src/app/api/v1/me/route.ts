import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authApiToken } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/** GET /api/v1/me — account info for the supplied bearer token. */
export async function GET(req: Request) {
  const tok = await authApiToken(req);
  if (!tok) return NextResponse.json({ error: "Invalid or revoked API token" }, { status: 401 });
  const user = await db.user.findUnique({
    where: { id: tok.userId },
    select: { id: true, email: true, encryptionEnabled: true, createdAt: true },
  });
  if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const [notes, files] = await Promise.all([
    db.note.count({ where: { userId: user.id, trashed: false } }),
    db.fileItem.count({ where: { userId: user.id } }),
  ]);
  return NextResponse.json({
    user,
    stats: { notes, files },
    token: { name: tok.name, prefix: tok.prefix },
  });
}
