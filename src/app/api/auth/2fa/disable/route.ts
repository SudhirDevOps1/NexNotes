import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSessionUserId, verifyPassword } from "@/lib/auth";
import { verifyTotp } from "@/lib/totp";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/2fa/disable — turn two-factor off.
 * Requires BOTH the account password and a live TOTP code.
 */
const schema = z.object({ password: z.string().min(1).max(200), code: z.string().min(6).max(12) });

export async function POST(req: NextRequest) {
  try {
    const uid = await getSessionUserId();
    if (!uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Password and authenticator code required." }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { id: uid } });
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    if (!user.twofaEnabled) return NextResponse.json({ error: "Two-factor is not enabled." }, { status: 400 });

    const okPw = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!okPw) return NextResponse.json({ error: "Incorrect password." }, { status: 403 });

    if (!user.twofaSecret || !verifyTotp(user.twofaSecret, parsed.data.code)) {
      return NextResponse.json({ error: "Wrong authenticator code." }, { status: 403 });
    }

    await db.user.update({
      where: { id: uid },
      data: { twofaEnabled: false, twofaSecret: null, twofaBackupHash: null },
    });
    return NextResponse.json({ enabled: false });
  } catch (e) {
    console.error("2fa disable error", e);
    return NextResponse.json({ error: "Disable failed. Try again." }, { status: 500 });
  }
}
