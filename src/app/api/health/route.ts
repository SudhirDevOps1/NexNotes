import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/health — driver + storage info surfaced in Settings.
 * Driver detection mirrors scripts/db-switch.mjs (DATABASE_URL protocol).
 */
export async function GET() {
  const url = process.env.DATABASE_URL ?? "";
  const driver = url.startsWith("postgres") || url.startsWith("postgresql") ? "postgres" : "sqlite";

  let notes = 0, users = 0, files = 0;
  try {
    [notes, users, files] = await Promise.all([
      db.note.count(),
      db.user.count(),
      db.fileItem.count(),
    ]);
  } catch {
    /* db not migrated yet */
  }

  return NextResponse.json({
    ok: true,
    driver,
    driverLabel: driver === "postgres" ? "Neon Postgres" : "Local SQLite",
    counts: { notes, users, files },
    version: "2.0.0",
    time: new Date().toISOString(),
  });
}
