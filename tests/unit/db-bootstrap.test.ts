import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  isSchemaMissingError,
  makeIdempotent,
  resolveDdlPath,
  runSchemaBootstrap,
  splitSqlStatements,
  type RawSqlClient,
} from "@/lib/db-bootstrap";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

function scratchClient(): { client: PrismaClient & RawSqlClient; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexnotes-bootstrap-"));
  dirs.push(dir);
  const client = new PrismaClient({
    datasourceUrl: `file:${path.join(dir, "scratch.db")}`,
  }) as unknown as PrismaClient & RawSqlClient;
  return { client, dir };
}

describe("db-bootstrap — classification", () => {
  it("recognises Prisma schema-missing codes", () => {
    expect(isSchemaMissingError({ code: "P2021" })).toBe(true);
    expect(isSchemaMissingError({ code: "P2022" })).toBe(true);
    expect(isSchemaMissingError({ code: "P1003" })).toBe(true);
  });

  it("recognises engine-level messages without P-codes", () => {
    expect(isSchemaMissingError(new Error("no such table: User"))).toBe(true);
    expect(
      isSchemaMissingError(new Error('error: relation "User" does not exist')),
    ).toBe(true);
    expect(
      isSchemaMissingError(new Error('column "pwVersion" does not exist')),
    ).toBe(true);
  });

  it("refuses to touch unrelated failures", () => {
    expect(isSchemaMissingError({ code: "P1001" })).toBe(false);
    expect(isSchemaMissingError({ code: "P2002" })).toBe(false);
    expect(isSchemaMissingError(new Error("readonly database"))).toBe(false);
    expect(isSchemaMissingError(new Error("Cannot reach the server"))).toBe(false);
    expect(isSchemaMissingError(null)).toBe(false);
  });
});

describe("db-bootstrap — SQL tooling", () => {
  it("keeps Postgres DO $$ blocks intact while splitting", () => {
    const sql = [
      'CREATE TABLE "A" ("id" TEXT NOT NULL);',
      "DO $$ BEGIN",
      '    ALTER TABLE "A" ADD CONSTRAINT "A_b_fkey" FOREIGN KEY ("b") REFERENCES "B"("id");',
      "EXCEPTION",
      "    WHEN duplicate_object THEN NULL;",
      "END $$;",
      "-- AddFk",
      'CREATE INDEX "A_b_idx" ON "A"("b");',
    ].join("\n");
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(3);
    expect(stmts[1]).toContain("END $$");
    expect(stmts[2]).toContain("CREATE INDEX");
  });

  it("drops comment-only fragments and the banner", () => {
    const stmts = splitSqlStatements("-- banner\n-- more\n;\n-- CreateTable\nCREATE TABLE \"T\" (\"id\" TEXT);\n-- CreateIndex\n");
    expect(stmts).toEqual(['CREATE TABLE "T" ("id" TEXT)']);
  });

  it("survives semicolons inside string literals", () => {
    const stmts = splitSqlStatements(`INSERT INTO "T" VALUES ('a;b');`);
    expect(stmts).toHaveLength(1);
  });

  it("makes every CREATE re-runnable", () => {
    const out = makeIdempotent('CREATE TABLE "T" ("id" TEXT);\nCREATE UNIQUE INDEX "T_k" ON "T"("id");\nCREATE INDEX "T_i" ON "T"("x");\nCREATE TABLE IF NOT EXISTS "U" ("id" TEXT);');
    expect(out).toContain("CREATE TABLE IF NOT EXISTS \"T\"");
    expect(out).toContain("CREATE UNIQUE INDEX IF NOT EXISTS \"T_k\"");
    expect(out).toContain("CREATE INDEX IF NOT EXISTS \"T_i\"");
    expect((out.match(/IF NOT EXISTS/g) ?? []).length).toBe(4);
  });

  it("resolves snapshot paths for both drivers", () => {
    expect(resolveDdlPath("sqlite").some((p) => p.endsWith("prisma/db-init.sqlite.sql"))).toBe(true);
    expect(resolveDdlPath("postgres").some((p) => p.endsWith("db-init.postgres.sql"))).toBe(true);
  });
});

describe("db-bootstrap — real empty-database boot", () => {
  it("creates the full schema on a fresh SQLite file", async () => {
    const { client } = scratchClient();
    // before: no tables
    await expect(client.$queryRawUnsafe('SELECT 1 FROM "User" LIMIT 1')).rejects.toThrow();
    // boot
    await expect(runSchemaBootstrap(client)).resolves.toBe(true);
    // after: every table exists
    const rows = (await client.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('User','Note','Folder','Tag','NoteTag','NoteHistory','FileItem','Deletion','ApiToken')",
    )) as Array<{ name: string }>;
    expect(rows).toHaveLength(9);
    // and the schema is actually usable
    await client.user.create({ data: { email: "boot@test", passwordHash: "h" } });
    expect(await client.user.count()).toBe(1);
    await client.$disconnect();
  }, 30_000);

  it("is a no-op when the schema already exists", async () => {
    const { client } = scratchClient();
    await runSchemaBootstrap(client);
    await expect(runSchemaBootstrap(client)).resolves.toBe(false);
    await client.$disconnect();
  }, 30_000);

  it("can re-apply the committed snapshot without breaking anything", async () => {
    const { client } = scratchClient();
    await runSchemaBootstrap(client);
    await client.user.create({ data: { email: "keep@test", passwordHash: "h" } });
    const sql = fs.readFileSync(path.join(process.cwd(), "prisma", "db-init.sqlite.sql"), "utf8");
    const stmts = splitSqlStatements(makeIdempotent(sql));
    await client.$transaction(stmts.map((s) => client.$executeRawUnsafe(s)));
    expect(await client.user.count()).toBe(1);
    await client.$disconnect();
  }, 30_000);
});
