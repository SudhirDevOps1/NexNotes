import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { seedNewUserStarters } from "@/lib/seed";
import { guard, clientIp, HOUR_1 } from "@/lib/rate-limit";
import { dbErrorResponse } from "@/lib/db-errors";

const schema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(6).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Enter a valid email and a password of at least 6 characters." },
        { status: 400 }
      );
    }
    const email = parsed.data.email.toLowerCase().trim();

    // v2.3.2 — account creation is also a cost surface (DB rows, starter
    // notes). Ten per IP per hour is far above any human pace.
    const limited = guard(req, "register", clientIp(req), 10, HOUR_1);
    if (limited) return limited;

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const user = await db.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true, encryptionEnabled: true, createdAt: true },
    });

    await createSession(user.id);
    // never land a new user on an empty app
    void seedNewUserStarters(user.id).catch(() => {});
    return NextResponse.json({ user });
  } catch (e) {
    console.error("register error", e);
    // honest failure for broken deploys — see src/lib/db-errors.ts
    const dbErr = dbErrorResponse(e);
    if (dbErr) return NextResponse.json(dbErr.body, { status: dbErr.status });
    return NextResponse.json({ error: "Could not create the account. Try again." }, { status: 500 });
  }
}
