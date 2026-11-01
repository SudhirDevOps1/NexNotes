import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { verifyTotp, generateBackupCodes } from "@/lib/totp";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/2fa/enable — step 2: verify a live code for the pending
 * secret, activate 2FA, return single-use backup codes (shown once, stored
 * server-side only as bcrypt hashes).
 */
const schema = z.object({ code: z.string().min(6).max(12) });

export async function POST(req: NextRequest) {
  try {
    const uid = await getSessionUserId();
    if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });

    const user = await db.user.findUnique({ where: { id: uid } });
    if (!user?.twofaSecret) {
      return NextResponse.json({ error: "Run setup first." }, { status: 400 });
    }
    if (user.twofaEnabled) {
      return NextResponse.json({ error: "Two-factor is already enabled." }, { status: 400 });
    }

    if (!verifyTotp(user.twofaSecret, parsed.data.code)) {
      return NextResponse.json({ error: "Wrong code — check your authenticator and try again." }, { status: 403 });
    }

    const codes = generateBackupCodes(8);
    const hashes = await Promise.all(codes.map((c) => bcrypt.hash(c, 10)));
    await db.user.update({
      where: { id: uid },
      data: { twofaEnabled: true, twofaBackupHash: hashes.join(",") },
    });

    return NextResponse.json({ enabled: true, backupCodes: codes });
  } catch (e) {
    console.error("2fa enable error", e);
    return NextResponse.json({ error: "Enable failed. Try again." }, { status: 500 });
  }
}
