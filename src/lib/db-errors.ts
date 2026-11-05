/**
 * Honest database errors.
 *
 * A fresh deploy with a missing, unreachable or wrongly-configured database
 * used to surface as a generic `500 "Try again"` — the operator had no way
 * to learn the real problem (protocol mismatch, tables never pushed, SQLite
 * on a read-only serverless filesystem). This layer translates Prisma's
 * low-level failure codes into one actionable sentence, so a broken deploy
 * tells the operator exactly what to fix instead of asking them to retry.
 *
 * Unknown errors return null → callers keep their existing generic 500.
 * Deliberately NOT mapped: P2002 (unique violations are handled per-route as
 * 409s), validation errors, and anything that is not a database-readiness
 * problem — those must never leak internals.
 */

export function currentDriver(): "postgres" | "sqlite" {
  const url = process.env.DATABASE_URL ?? "";
  return url.startsWith("postgres") || url.startsWith("postgresql") ? "postgres" : "sqlite";
}

/** The one-line, operator-actionable description — or null when the error is
 *  not a database-readiness problem. */
export function describeDbError(e: unknown): string | null {
  const err = e as { code?: unknown; message?: unknown };
  const code = typeof err?.code === "string" ? err.code : "";
  const message = typeof err?.message === "string" ? err.message : "";
  const driver = currentDriver();
  const pushHint =
    driver === "sqlite"
      ? "run `npx prisma db push` against this DATABASE_URL to create it"
      : "run `npx prisma db push` once against this DATABASE_URL to create the tables";

  // SQLite on a read-only filesystem (Vercel/Cloudflare serverless, some
  // containers) — the engine opens the file fine and dies on first write.
  if (/readonly database|read-only file system|EROFS/i.test(message)) {
    return (
      "The database file is on a read-only filesystem — serverless platforms cannot persist SQLite. " +
      "Set DATABASE_URL to a Postgres URL (e.g. Neon), or run NexNotes via Docker/Node on a writable disk. See docs/DEPLOYMENT.md."
    );
  }

  // provider/protocol mismatch: the client was GENERATED for one driver but
  // DATABASE_URL points at another (e.g. a sqlite-bound image handed a
  // postgres URL at runtime). Carries no P-code — sniff the message.
  if (/must start with the protocol/i.test(message)) {
    return (
      "DATABASE_URL does not match the database driver this build was made with. " +
      "Rebuild with the same DATABASE_URL you run with (npm install / docker build pick up the provider automatically) — see docs/DEPLOYMENT.md."
    );
  }

  // SQLite error 14 (SQLITE_CANTOPEN): the file cannot be opened OR created —
  // missing directory, bad permissions, or a read-only filesystem. Also has
  // no P-code.
  if (/Unable to open the database file/i.test(message)) {
    return (
      "The SQLite database file cannot be opened or created — check that the path in DATABASE_URL exists and is writable. " +
      "On serverless hosts (Vercel/Cloudflare) SQLite cannot persist at all — use a Postgres URL. See docs/DEPLOYMENT.md."
    );
  }

  switch (code) {
    case "P1001": // can't reach the server
      return "Cannot reach the database — check that DATABASE_URL points at a running database and that its host allows connections.";
    case "P1002": // timed out
      return "The database did not respond in time — check DATABASE_URL and the database's load / firewall.";
    case "P1003": // file does not exist / db does not exist
      return driver === "sqlite"
        ? `The SQLite database file does not exist yet — ${pushHint}.`
        : "The database does not exist — create it in your Postgres provider and re-check DATABASE_URL.";
    case "P1017": // server closed the connection
      return "The database closed the connection — verify DATABASE_URL (pooled URLs for Neon: append ?pgbouncer=true).";
    case "P2021": // table does not exist
      return `The database is reachable but has no tables yet — ${pushHint}.`;
    case "P2022": // column does not exist (schema drift after upgrade)
      return `The database schema is out of date — ${pushHint}.`;
    default:
      return null;
  }
}

export interface DbErrorResponse {
  status: 503;
  body: { error: string };
}

/** Ready-to-return JSON response for a database-readiness failure, or null
 *  when the caller should keep its existing handling. */
export function dbErrorResponse(e: unknown): DbErrorResponse | null {
  const message = describeDbError(e);
  return message ? { status: 503, body: { error: message } } : null;
}
