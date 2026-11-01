import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import type { FileDTO } from "@/lib/types";

/** GET /api/files/:id — full file record including the base64/cipher payload. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const file = await db.fileItem.findFirst({ where: { id, userId: user.id } });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  return NextResponse.json({
    file: {
      id: file.id,
      name: file.name,
      mime: file.mime,
      size: file.size,
      isEncrypted: file.isEncrypted,
      data: file.data,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
    },
  });
}

/** DELETE /api/files/:id */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  await db.fileItem.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
