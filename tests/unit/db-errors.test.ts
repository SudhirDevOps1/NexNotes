import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { currentDriver, dbErrorResponse, describeDbError } from "@/lib/db-errors";

/**
 * A broken deploy used to answer register/login with a generic
 * `500 "Try again"` that could never succeed. These tests pin the honest
 * translations: every database-readiness failure gets an operator-actionable
 * message; everything else stays null so callers keep their generic path.
 */

const initError = (code: string, message = "init failed") =>
  ({ code, message, name: "PrismaClientInitializationError" }) as unknown as Error;

const knownError = (code: string, message = "request failed") =>
  ({ code, message, name: "PrismaClientKnownRequestError" }) as unknown as Error;

const OLD_URL = process.env.DATABASE_URL;

beforeAll(() => {
  // pin the driver so the sqlite-flavoured hints are asserted deterministically
  process.env.DATABASE_URL = "file:./db/test.db";
});

afterAll(() => {
  if (OLD_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = OLD_URL;
});

describe("currentDriver", () => {
  it("classifies from DATABASE_URL", () => {
    process.env.DATABASE_URL = "postgresql://u@h/db";
    expect(currentDriver()).toBe("postgres");
    process.env.DATABASE_URL = "file:./db/test.db";
    expect(currentDriver()).toBe("sqlite");
    process.env.DATABASE_URL = "file:./db/test.db"; // restore for later blocks
  });
});

describe("describeDbError", () => {
  it("maps unreachable database (P1001)", () => {
    const msg = describeDbError(initError("P1001"));
    expect(msg).toMatch(/Cannot reach the database/i);
    expect(msg).toMatch(/DATABASE_URL/);
  });

  it("maps missing tables (P2021) to a db push hint", () => {
    const msg = describeDbError(knownError("P2021"));
    expect(msg).toMatch(/no tables yet/i);
    expect(msg).toMatch(/prisma db push/);
  });

  it("maps missing sqlite file (P1003) to a db push hint", () => {
    const msg = describeDbError(initError("P1003"));
    expect(msg).toMatch(/SQLite database file/i);
    expect(msg).toMatch(/prisma db push/);
  });

  it("maps schema drift (P2022) to a db push hint", () => {
    expect(describeDbError(knownError("P2022"))).toMatch(/out of date/);
  });

  it("maps timeouts (P1002) and dropped connections (P1017)", () => {
    expect(describeDbError(initError("P1002"))).toMatch(/did not respond in time/i);
    expect(describeDbError(initError("P1017"))).toMatch(/closed the connection/i);
  });

  it("detects SQLite on a read-only filesystem by message", () => {
    const msg = describeDbError(
      new Error("Error querying the database: attempt to write a readonly database")
    );
    expect(msg).toMatch(/read-only filesystem/i);
    expect(msg).toMatch(/Neon|Postgres/);
    expect(msg).toMatch(/docs\/DEPLOYMENT\.md/);
  });

  it("detects a driver/protocol mismatch (no P-code) by message", () => {
    const msg = describeDbError(
      initError("", "Error: The URL must start with the protocol `postgresql://`.")
    );
    expect(msg).toMatch(/does not match the database driver/i);
    expect(msg).toMatch(/Rebuild/);
    expect(msg).toMatch(/docs\/DEPLOYMENT\.md/);
  });

  it("detects an unopenable SQLite file (error 14, no P-code)", () => {
    const msg = describeDbError(
      initError("", "Error querying the database: Error code 14: Unable to open the database file")
    );
    expect(msg).toMatch(/cannot be opened or created/i);
    expect(msg).toMatch(/DATABASE_URL/);
  });

  it("does NOT touch unique violations or unknown errors", () => {
    expect(describeDbError(knownError("P2002"))).toBeNull();
    expect(describeDbError(new Error("something else"))).toBeNull();
    expect(describeDbError(undefined)).toBeNull();
    expect(describeDbError({ code: 42 })).toBeNull();
  });
});

describe("dbErrorResponse", () => {
  it("returns a 503 with the honest body", () => {
    const res = dbErrorResponse(initError("P1001"));
    expect(res?.status).toBe(503);
    expect(res?.body.error).toMatch(/Cannot reach the database/);
  });

  it("returns null for non-database errors", () => {
    expect(dbErrorResponse(knownError("P2002"))).toBeNull();
    expect(dbErrorResponse(new Error("boom"))).toBeNull();
  });
});
