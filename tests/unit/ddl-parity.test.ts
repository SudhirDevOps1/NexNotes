import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DDL snapshot parity — the committed prisma/db-init.*.sql files are what the
 * runtime replays to self-create a fresh database (src/lib/db-bootstrap.ts).
 * If someone edits schema.prisma without regenerating them (`npm run db:ddl`),
 * new installs would boot with a STALE schema — missing the very columns the
 * new code queries. This test fails CI the same way the schema-mirror parity
 * test does, keeping the snapshots honest.
 */

const root = process.cwd();
const prismaBin = path.join(root, "node_modules", ".bin", "prisma");

function expectedDdl(schemaFile: string, driver: "sqlite" | "postgres"): string {
  let sql = execFileSync(
    prismaBin,
    ["migrate", "diff", "--from-empty", `--to-schema-datamodel=${schemaFile}`, "--script"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  if (driver === "postgres") {
    sql = sql.replace(
      /^ALTER TABLE .* ADD CONSTRAINT .*;$/gm,
      (stmt) => `DO $$ BEGIN\n    ${stmt}\nEXCEPTION\n    WHEN duplicate_object THEN NULL;\nEND $$;`,
    );
  }
  // normalize both sides the same way: leading comment lines are cosmetic
  return sql.replace(/^(--[^\n]*\n?)+/, "").trim() + "\n";
}

function committedDdl(driver: "sqlite" | "postgres"): string {
  const file = path.join(root, "prisma", `db-init.${driver}.sql`);
  const body = fs.readFileSync(file, "utf8");
  // strip the generated banner: leading comment-only lines
  return body.replace(/^(--[^\n]*\n?)+/, "").trim() + "\n";
}

describe("DDL snapshot parity", () => {
  it("sqlite snapshot matches the active schema", () => {
    expect(committedDdl("sqlite")).toBe(expectedDdl(path.join(root, "prisma", "schema.prisma"), "sqlite"));
  }, 60_000);

  it("postgres snapshot matches the Postgres mirror", () => {
    expect(committedDdl("postgres")).toBe(
      expectedDdl(path.join(root, "prisma", "schema.postgres.prisma"), "postgres"),
    );
  }, 60_000);
});
