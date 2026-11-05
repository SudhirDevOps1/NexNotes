import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthUser, verifyPassword } from "@/lib/auth";

const schema = z.object({ password: z.string().min(1) });

/**
 * POST /api/user/verify-password
 *
 * Confirms that a typed password really is the account password (bcrypt
 * compare against passwordHash). The E2E vault key is derived from the
 * account password on the CLIENT — PBKDF2 happens in the browser and the
 * key never leaves the device — but the client needs a definitive yes/no
 * before it encrypts anything with that key (enable / unlock / disable
 * flows). This endpoint is that check: the answer changes nothing on the
 * server, and the password itself is never logged or stored.
 *
 * 200 { ok: true }                       — password is correct
 * 401 { ok: false, reason: "wrong-password" }     — signed in, wrong password
 * 401 { ok: false, reason: "unauthenticated" }    — no valid session
 *
 * The reason matters: the client turns "wrong-password" into "that's not your
 * login password", but "unauthenticated" into "your session expired — sign in
 * again". Collapsing both into a bare 401 made a dead session shout "wrong
 * account password" and send users hunting for a password that was fine.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const full = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!full) {
    return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });
  }

  const ok = await verifyPassword(parsed.data.password, full.passwordHash);
  if (ok) return NextResponse.json({ ok: true }, { status: 200 });
  return NextResponse.json({ ok: false, reason: "wrong-password" }, { status: 401 });
}
