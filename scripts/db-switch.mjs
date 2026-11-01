#!/usr/bin/env node
/**
 * NexNotes database driver switcher.
 *
 * Usage:
 *   node scripts/db-switch.mjs sqlite
 *   node scripts/db-switch.mjs postgres "postgresql://user:pass@ep-x.neon.tech/nexnotes?sslmode=require"
 *
 * - Rewrites prisma/schema.prisma to the selected driver (the other driver is
 *   preserved in prisma/schema.postgres.prisma / prisma/schema.sqlite.prisma).
 * - For postgres: writes DIRECT_URL (Neon pooled connections) and runs db push.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = path.resolve(process.cwd());
const prismaDir = path.join(root, "prisma");
const active = path.join(prismaDir, "schema.prisma");
const pgFile = path.join(prismaDir, "schema.postgres.prisma");
const liteFile = path.join(prismaDir, "schema.sqlite.prisma");
const envFile = path.join(root, ".env");

const mode = process.argv[2];
if (!mode || !["sqlite", "postgres"].includes(mode)) {
  console.error("Usage: node scripts/db-switch.mjs <sqlite|postgres> [NEON_CONNECTION_STRING]");
  process.exit(1);
}

function snapshotActive() {
  const cur = fs.readFileSync(active, "utf8");
  if (cur.includes('provider = "postgresql"')) fs.writeFileSync(pgFile, cur);
  else fs.writeFileSync(liteFile, cur);
}

snapshotActive();
const source = mode === "postgres" ? pgFile : liteFile;
fs.copyFileSync(source, active);

if (mode === "postgres") {
  const url = process.argv[3];
  if (!url) {
    console.error("Provide a Neon/Postgres connection string as the 2nd argument.");
    process.exit(1);
  }
  let env = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
  const setVar = (env, k, v) => {
    const re = new RegExp(`^${k}=.*$`, "m");
    const line = `${k}=${v}`;
    return re.test(env) ? env.replace(re, line) : env.trimEnd() + (env ? "\n" : "") + line + "\n";
  };
  // Neon: pooled connection for Prisma Client, direct for migrations
  const pooled = url.includes("?") ? url + "&pgbouncer=true&connection_limit=1" : url + "?pgbouncer=true&connection_limit=1";
  const direct = url.replace(/([?&])pgbouncer=true&?/, "$1").replace(/[?&]$/, "");
  env = setVar(env, "DATABASE_URL", `"${pooled}"`);
  env = setVar(env, "DIRECT_URL", `"${direct}"`);
  fs.writeFileSync(envFile, env);
  console.log("→ .env updated (DATABASE_URL + DIRECT_URL)");
}

console.log(`→ Active driver: ${mode}`);
execSync(`npx prisma generate --schema ${active}`, { stdio: "inherit" });
if (mode === "postgres") {
  execSync(`npx prisma db push --accept-data-loss --schema ${active}`, { stdio: "inherit" });
}
console.log(`✓ NexNotes now uses ${mode.toUpperCase()}${mode === "postgres" ? " (Neon-ready)" : ""}`);
