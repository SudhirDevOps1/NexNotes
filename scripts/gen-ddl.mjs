#!/usr/bin/env node
/**
 * DDL snapshot generator — the self-initializing database source.
 *
 * Enterprises run `prisma migrate deploy` from a release pipeline; NexNotes
 * additionally ships a snapshot of its full schema DDL so that a FIRST RUN
 * needs no release pipeline at all: the server itself creates every table it
 * needs the first time something touches the database (see
 * src/lib/db-bootstrap.ts). This script regenerates that snapshot:
 *
 *     npm run db:ddl
 *
 * Outputs (committed, reviewed like the schema mirror):
 *   prisma/db-init.sqlite.sql    — from the active SQLite schema
 *   prisma/db-init.postgres.sql  — from the Postgres mirror (when present)
 *
 * The runtime makes the snapshot idempotent (CREATE … IF NOT EXISTS) before
 * executing it, so it can run safely on every cold boot and on concurrent
 * serverless cold starts. A unit test pins that the committed snapshots match
 * the live schema — same idea as tests/unit/schema-parity.test.ts.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const active = path.join(root, "prisma", "schema.prisma");
const pgMirror = path.join(root, "prisma", "schema.postgres.prisma");
const liteMirror = path.join(root, "prisma", "schema.sqlite.prisma");
const prismaBin = path.join(root, "node_modules", ".bin", "prisma");

const read = (f) => fs.readFileSync(f, "utf8");
const activeProvider = () =>
  (/provider\s*=\s*"(sqlite|postgresql)"/.exec(read(active))?.[1] ?? "sqlite");

function generate(schemaFile, driver) {
  let sql = execFileSync(
    prismaBin,
    ["migrate", "diff", "--from-empty", `--to-schema-datamodel=${schemaFile}`, "--script"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  if (driver === "postgres") {
    // ALTER TABLE … ADD CONSTRAINT has no IF NOT EXISTS in Postgres — wrap each
    // one in a duplicate_object-swallowing DO block so the snapshot can be
    // re-applied on every boot (and by racing serverless cold starts) safely.
    sql = sql.replace(
      /^ALTER TABLE .* ADD CONSTRAINT .*;$/gm,
      (stmt) => `DO $$ BEGIN\n    ${stmt}\nEXCEPTION\n    WHEN duplicate_object THEN NULL;\nEND $$;`,
    );
  }
  const banner = [
    `-- NexNotes full-schema DDL snapshot (${driver}) — GENERATED, do not hand-edit.`,
    `-- Regenerate after every schema change:  npm run db:ddl`,
    "-- Applied automatically at boot by src/lib/db-bootstrap.ts (idempotent at runtime).",
    "",
  ].join("\n");
  const file = path.join(root, "prisma", `db-init.${driver}.sql`);
  fs.writeFileSync(file, banner + sql.trimEnd() + "\n");
  const statements = sql.split(/;/).filter((s) => s.trim()).length;
  console.log(`✓ ${path.relative(root, file)} — ${statements} statements (${driver})`);
}

const prov = activeProvider();

// Active driver snapshot — always generated.
generate(active, prov === "postgresql" ? "postgres" : "sqlite");

// Opposite-driver snapshot — generated from its mirror file when present, so a
// build switched to Postgres still ships the SQLite snapshot (and vice versa).
const opposite = prov === "sqlite" ? "postgres" : "sqlite";
const oppositeSchema = opposite === "postgres" ? pgMirror : liteMirror;
if (fs.existsSync(oppositeSchema)) {
  generate(oppositeSchema, opposite);
} else {
  console.log(`→ no ${path.relative(root, oppositeSchema)} — skipping ${opposite} snapshot`);
}
