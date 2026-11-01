import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUserId, verifyPassword } from "@/lib/auth";
import { generateBase32Secret, otpauthUri } from "@/lib/totp";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/2fa/setup — step 1 of enabling two-factor auth.
 * Body: { password } (re-authentication, protects against session hijack).
 * Generates (or regenerates) a pending TOTP secret and returns the otpauth://
 * URI + manual key. Two-factor is NOT active until /api/auth/2fa/enable
 * verifies a live code.
 */
const schema = z.object({ password: z.string().min(1).max(200) });

export async function POST(req: NextRequest) {
  try {
    const uid = await getSessionUserId();
    if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Password required." }, { status: 400 });

    const user = await db.user.findUnique({ where: { id: uid } });
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const ok = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!ok) return NextResponse.json({ error: "Incorrect password." }, { status: 403 });

    const secret = generateBase32Secret();
    await db.user.update({ where: { id: uid }, data: { twofaSecret: secret, twofaEnabled: false } });

    return NextResponse.json({
      secret,
      otpauthUri: otpauthUri(secret, user.email),
      email: user.email,
      pending: true,
    });
  } catch (e) {
    console.error("2fa setup error", e);
    return NextResponse.json({ error: "Setup failed. Try again." }, { status: 500 });
  }
}
