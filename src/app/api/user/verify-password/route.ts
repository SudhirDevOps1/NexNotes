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
 * 200 { ok: true }  — password is correct
 * 401 { ok: false } — wrong password (or not signed in)
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  const full = await db.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!full) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const ok = await verifyPassword(parsed.data.password, full.passwordHash);
  return NextResponse.json({ ok }, { status: ok ? 200 : 401 });
}
