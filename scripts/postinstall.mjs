/**
 * Install-time hook: pick the right Prisma schema for this environment, then
 * generate the client. Runs on every `npm/bun install` (Vercel included), so
 * it must NEVER fail the install — exactly like prisma's own tolerant
 * postinstall. Both steps degrade to warnings:
 *
 *   - pick-schema is skipped when scripts/ isn't there yet (Docker deps stage
 *     installs before the source is copied) or when it can't decide.
 *   - prisma generate is skipped when no schema exists yet (same stage).
 *
 * On Vercel the install step sees DATABASE_URL, so a Postgres deployment gets
 * a Postgres client generated without anyone hand-editing a schema file.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

try {
  if (fs.existsSync(path.join(process.cwd(), "scripts", "pick-schema.mjs"))) {
    execSync("node scripts/pick-schema.mjs", { stdio: "inherit" });
  }
} catch (e) {
  console.warn("→ pick-schema skipped:", e instanceof Error ? e.message : e);
}

try {
  execSync("npx --no-install prisma generate", { stdio: "inherit" });
} catch (e) {
  console.warn("→ prisma generate skipped (no schema yet?):", e instanceof Error ? e.message.split("\n")[0] : e);
}

process.exit(0);
