import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, hashPassword, getAuthUser, createSession } from "@/lib/auth";
import { guard, HOUR_1 } from "@/lib/rate-limit";

/**
 * POST /api/auth/change-password
 * Verifies the current password, rotates the bcrypt hash. If the account has
 * E2E enabled the client re-encrypts all locally cached notes with the newly
 * derived key and pushes them right after this call succeeds.
 */
const schema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(6).max(200),
});

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "New password must be at least 6 characters." }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: authUser.id } });
  if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const limited = guard(req, "change-pw", user.id, 10, HOUR_1);
  if (limited) return limited;

  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Current password is incorrect." }, { status: 401 });

  // v2.3.2 — rotate the session version in the same write: cookies minted
  // before this moment (stolen sessions, old devices) stop authenticating,
  // while THIS device gets a fresh cookie in this very response.
  const pv = user.pwVersion + 1;
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword), pwVersion: pv },
  });
  await createSession(user.id, pv);
  return NextResponse.json({ ok: true });
}
