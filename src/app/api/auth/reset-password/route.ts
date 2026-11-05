import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, getAuthUser, createSession } from "@/lib/auth";
import { guard, HOUR_1 } from "@/lib/rate-limit";

/**
 * POST /api/auth/reset-password
 *
 * Signed-in password recovery for people who forgot their login password.
 * Self-hosted instances have no mail server, so "forgot password" cannot go
 * the usual email-link route — but a valid session cookie already proves
 * account access (delete-account accepts nothing more), so letting the
 * holder rotate a password they forgot adds no new capability.
 *
 * Guard rails:
 *  - requires a valid session (401 otherwise);
 *  - REFUSES when end-to-end encryption is enabled (409): with E2E on, the
 *    account password IS the key source — resetting it blind would strand
 *    every ciphertext forever. Those accounts must use "Change password"
 *    with the current password, which re-keys the vault.
 *  - with E2E off nothing is encrypted anywhere, so rotating the hash is
 *    lossless by construction.
 *
 * 200 { ok: true } — password rotated, current session stays valid
 */
const schema = z.object({ newPassword: z.string().min(6).max(200) });

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser();
  if (!authUser) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "New password must be at least 6 characters." },
      { status: 400 }
    );
  }

  const user = await db.user.findUnique({
    where: { id: authUser.id },
    select: { id: true, encryptionEnabled: true, pwVersion: true },
  });
  if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const limited = guard(req, "reset-pw", user.id, 5, HOUR_1);
  if (limited) return limited;

  if (user.encryptionEnabled) {
    return NextResponse.json(
      {
        error:
          "End-to-end encryption is on — the password cannot be reset without the current one, or every note would be locked forever. Use Change password instead.",
      },
      { status: 409 }
    );
  }

  // v2.3.2 — same rotation contract as change-password: pre-reset cookies
  // (a device that "forgot" because someone else had it?) die everywhere;
  // this device gets the fresh cookie in this response.
  const pv = user.pwVersion + 1;
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword), pwVersion: pv },
  });
  await createSession(user.id, pv);
  return NextResponse.json({ ok: true });
}
