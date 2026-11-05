import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { APP_VERSION } from "@/lib/version";
import { ensureSchemaReady } from "@/lib/db-bootstrap";

/**
 * GET /api/health — liveness for the desktop shell's boot gate, plus driver +
 * storage info surfaced in Settings. Driver detection mirrors
 * scripts/db-switch.mjs (DATABASE_URL protocol).
 *
 * The counts probe is best-effort with a hard timeout: the Electron shell
 * refuses to open the window until this answers, so a slow database start
 * (cold query engine, an antivirus scan, a lock left by a crashed process)
 * must degrade to "counts unavailable" instead of hanging the boot into the
 * 45-second failure dialog. A timed-out or failed probe still logs a warning
 * into server.log so the next failure dialog has something to show.
 */
const COUNT_PROBE_TIMEOUT_MS = 2_500;

export async function GET() {
  const url = process.env.DATABASE_URL ?? "";
  const driver = url.startsWith("postgres") || url.startsWith("postgresql") ? "postgres" : "sqlite";

  let counts = { notes: 0, users: 0, files: 0 };
  let dbReady = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const probed = await Promise.race([
      (async () => {
        // first run on a fresh install? the schema creates itself here, so the
        // login page's health probe heals the database before the first click
        await ensureSchemaReady();
        return await Promise.all([db.note.count(), db.user.count(), db.fileItem.count()]);
      })(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), COUNT_PROBE_TIMEOUT_MS);
      }),
    ]);
    if (probed) {
      counts = { notes: probed[0], users: probed[1], files: probed[2] };
    } else {
      dbReady = false;
      console.warn(
        `[health] db probe timed out after ${COUNT_PROBE_TIMEOUT_MS}ms — starting anyway, counts unavailable`
      );
    }
  } catch (e) {
    dbReady = false;
    console.warn("[health] db probe failed — starting anyway, counts unavailable:", e);
  } finally {
    clearTimeout(timer);
  }

  return NextResponse.json({
    ok: true,
    dbReady,
    driver,
    driverLabel: driver === "postgres" ? "Neon Postgres" : "Local SQLite",
    counts,
    version: APP_VERSION,
    time: new Date().toISOString(),
  });
}
