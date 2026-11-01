import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

const schema = z.object({ encryptionEnabled: z.boolean() });

export async function PATCH(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: { encryptionEnabled: parsed.data.encryptionEnabled },
    select: { id: true, email: true, encryptionEnabled: true, createdAt: true },
  });
  return NextResponse.json({ user: { ...updated, createdAt: updated.createdAt.toISOString() } });
}
