import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import type { FileDTO } from "@/lib/types";

/**
 * File library — per-account attachments ("Files" view).
 * GET  → metadata list (no payload), POST → upload (base64 or E2E ciphertext).
 * Payload limit: 3 MB before base64 encoding.
 */

const MAX_BYTES = 3 * 1024 * 1024;

const uploadSchema = z.object({
  name: z.string().min(1).max(255),
  mime: z.string().max(150).default("application/octet-stream"),
  size: z.number().int().min(0).max(MAX_BYTES),
  data: z.string().max(Math.ceil(MAX_BYTES * 1.4) + 2048), // base64 slack
  isEncrypted: z.boolean().default(false),
});

function toDTO(f: {
  id: string; name: string; mime: string; size: number;
  isEncrypted: boolean; createdAt: Date; updatedAt: Date;
}): FileDTO {
  return {
    id: f.id, name: f.name, mime: f.mime, size: f.size,
    isEncrypted: f.isEncrypted,
    createdAt: f.createdAt.toISOString(), updatedAt: f.updatedAt.toISOString(),
  };
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const rows = await db.fileItem.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, mime: true, size: true, isEncrypted: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({ files: rows.map(toDTO) });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = uploadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid file payload (max 3 MB)." }, { status: 400 });
  }

  const created = await db.fileItem.create({
    data: {
      id: crypto.randomUUID(),
      userId: user.id,
      name: parsed.data.name,
      mime: parsed.data.mime,
      size: parsed.data.size,
      data: parsed.data.data,
      isEncrypted: parsed.data.isEncrypted,
    },
    select: { id: true, name: true, mime: true, size: true, isEncrypted: true, createdAt: true, updatedAt: true },
  });
  return NextResponse.json({ file: toDTO(created) }, { status: 201 });
}
