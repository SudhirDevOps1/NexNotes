import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser, destroySession } from "@/lib/auth";

/**
 * POST /api/auth/delete-account — danger zone.
 * Cascades wipe notes, folders, tags, files, history and tombstones.
 */
export async function POST() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  await db.user.delete({ where: { id: user.id } });
  await destroySession();
  return NextResponse.json({ ok: true });
}
