import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthUser, verifyPassword } from "@/lib/auth";
import { guard, MIN_5 } from "@/lib/rate-limit";
import { dbErrorResponse } from "@/lib/db-errors";
import { ensureSchemaReady } from "@/lib/db-bootstrap";

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
  let user;
  try {
    user = await getAuthUser();
  } catch (e) {
    // empty database on a fresh install → self-create the schema and retry
    // before surfacing the honest 503 (which reads as "server unreachable" on
    // the client and flips vault flows to offline fallbacks)
    try {
      await ensureSchemaReady();
      user = await getAuthUser();
    } catch {
      console.error("verify-password error", e);
      const dbErr = dbErrorResponse(e);
      if (dbErr) return NextResponse.json({ ok: false, ...dbErr.body }, { status: dbErr.status });
      throw e;
    }
  }
  if (!user) {
    return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
  }

  // v2.3.2 — this endpoint is an oracle for checking guesses against the
  // account password; cap it (30 per 5 min is far above interactive use).
  const limited = guard(req, "verify-pw", user.id, 30, MIN_5);
  if (limited) {
    return NextResponse.json(
      { ok: false, reason: "rate-limited" },
      { status: 429, headers: { "Retry-After": limited.headers.get("Retry-After") ?? "60" } }
    );
  }

  let full;
  try {
    full = await db.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
  } catch (e) {
    try {
      await ensureSchemaReady();
      full = await db.user.findUnique({
        where: { id: user.id },
        select: { passwordHash: true },
      });
    } catch {
      console.error("verify-password error", e);
      const dbErr = dbErrorResponse(e);
      if (dbErr) return NextResponse.json({ ok: false, ...dbErr.body }, { status: dbErr.status });
      throw e;
    }
  }
  if (!full) {
    return NextResponse.json({ ok: false, reason: "unauthenticated" }, { status: 401 });
  }

  const ok = await verifyPassword(parsed.data.password, full.passwordHash);
  if (ok) return NextResponse.json({ ok: true }, { status: 200 });
  return NextResponse.json({ ok: false, reason: "wrong-password" }, { status: 401 });
}
