import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import { ensureDemoUser, DEMO_EMAIL } from "@/lib/seed";
import { verifyTotp, normalizeBackupCode } from "@/lib/totp";
import { guard, clientIp, MIN_5 } from "@/lib/rate-limit";
import { dbErrorResponse } from "@/lib/db-errors";
import { retryAfterSchemaBootstrap } from "@/lib/db-bootstrap";

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
  code: z.string().min(6).max(12).optional(),
});

/**
 * v2.0 — tiny in-memory rate limiter for 2FA code attempts.
 * Buckets: `${email}` → timestamps of failed attempts in the last 10 min.
 * Self-host friendly (no Redis needed); resets on server restart.
 */
const attempts = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;
function tooManyAttempts(email: string): boolean {
  const now = Date.now();
  const list = (attempts.get(email) ?? []).filter((t) => now - t < WINDOW_MS);
  attempts.set(email, list);
  return list.length >= MAX_ATTEMPTS;
}
function recordFailedAttempt(email: string) {
  const list = attempts.get(email) ?? [];
  list.push(Date.now());
  attempts.set(email, list);
}

/** Verify a TOTP code, or fall back to a single-use backup code (consumes it). */
async function verifyTwoFactor(
  user: { id: string; twofaSecret: string | null; twofaBackupHash: string | null },
  code: string
): Promise<boolean> {
  if (user.twofaSecret && verifyTotp(user.twofaSecret, code)) return true;

  const normalized = normalizeBackupCode(code);
  if (!user.twofaBackupHash) return false;
  const hashes = user.twofaBackupHash.split(",");
  for (let i = 0; i < hashes.length; i++) {
     
    if (await bcrypt.compare(normalized, hashes[i])) {
      hashes.splice(i, 1);
      await db.user.update({
        where: { id: user.id },
        data: { twofaBackupHash: hashes.length ? hashes.join(",") : null },
      });
      return true;
    }
  }
  return false;
}

export async function POST(req: NextRequest) {
  // parsed once — the schema-bootstrap retry below re-runs the handler, and a
  // NextRequest body can only be consumed a single time
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const handle = async (): Promise<Response> => {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
    }
    const email = parsed.data.email.toLowerCase().trim();

    // v2.3.2 — password attempts were the one surface without any limit
    // (only 2FA codes had one). Per-account and per-IP buckets.
    const limited =
      guard(req, "login-ip", clientIp(req), 30, MIN_5) ??
      guard(req, "login-acct", email, 10, MIN_5);
    if (limited) return limited;

    // keep the shared demo account alive even after DB resets
    if (email === DEMO_EMAIL) {
      try {
        await ensureDemoUser();
      } catch (e) {
        console.error("demo seed failed", e);
      }
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "No account found with this email." }, { status: 401 });
    }

    const ok = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }

    // v2.0 — account two-factor authentication (TOTP / backup codes)
    if (user.twofaEnabled) {
      if (!parsed.data.code) {
        return NextResponse.json({ twoFactorRequired: true });
      }
      if (tooManyAttempts(email)) {
        return NextResponse.json(
          { error: "Too many attempts. Wait 10 minutes or use a backup code." },
          { status: 429 }
        );
      }
      const valid = await verifyTwoFactor(user, parsed.data.code);
      if (!valid) {
        recordFailedAttempt(email);
        return NextResponse.json({ error: "Wrong authentication code.", twoFactorRequired: true }, { status: 401 });
      }
      attempts.delete(email);
    }

    await createSession(user.id, user.pwVersion);
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        encryptionEnabled: user.encryptionEnabled,
        createdAt: user.createdAt.toISOString(),
      },
    });
  };

  try {
    return await handle();
  } catch (e) {
    // empty database on a fresh install? create the schema and try once more
    // before giving up — the first boot must not ask the operator for `db push`
    const retried = await retryAfterSchemaBootstrap(e, handle);
    if (retried) return retried;
    console.error("login error", e);
    // a broken deploy must say WHY (unreachable db, missing tables, driver
    // mismatch, read-only fs) instead of a "Try again" that can never work
    const dbErr = dbErrorResponse(e);
    if (dbErr) return NextResponse.json(dbErr.body, { status: dbErr.status });
    return NextResponse.json({ error: "Login failed. Try again." }, { status: 500 });
  }
}
