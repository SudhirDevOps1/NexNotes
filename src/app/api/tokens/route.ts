import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { createRawToken } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * Personal API token management for the Settings → API section.
 * GET    /api/tokens        — list (prefix + metadata only, never the raw token)
 * POST   /api/tokens        — create { name } → returns the RAW token once
 * DELETE /api/tokens?id=…   — revoke
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const tokens = await db.apiToken.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });
  return NextResponse.json({ tokens });
}

export async function POST(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const name = String(body.name ?? "").trim().slice(0, 60) || "My token";
  const count = await db.apiToken.count({ where: { userId: user.id, revokedAt: null } });
  if (count >= 10) {
    return NextResponse.json({ error: "Token limit reached (10) — revoke an old one first." }, { status: 400 });
  }
  const { token, prefix, tokenHash } = createRawToken();
  const rec = await db.apiToken.create({
    data: { userId: user.id, name, prefix, tokenHash },
    select: { id: true, name: true, prefix: true, createdAt: true },
  });
  return NextResponse.json({ token, record: rec }, { status: 201 });
}

export async function DELETE(req: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await db.apiToken.updateMany({
    where: { id, userId: user.id },
    data: { revokedAt: new Date() },
  });
  return NextResponse.json({ revoked: true });
}
