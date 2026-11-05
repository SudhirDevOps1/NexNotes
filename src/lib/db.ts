import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from '@prisma/client'

/**
 * Zero-config database default — the app runs with no .env at all.
 * Missing DATABASE_URL falls back to the committed default (a local SQLite
 * file next to the checkout / server directory), so "run the app" is enough:
 * the schema itself is created on first use by src/lib/db-bootstrap.ts.
 */
const DEFAULT_SQLITE_URL = "file:./db/custom.db";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = DEFAULT_SQLITE_URL;
  console.log(`[db] DATABASE_URL not set — defaulting to local SQLite (${DEFAULT_SQLITE_URL})`);
}

/**
 * SQLite can create its database file, but not the folders above it. A fresh
 * clone (or a fresh standalone bundle) has no db/ directory yet — create it
 * eagerly so the very first write cannot fail with SQLITE_CANTOPEN.
 * Prisma resolves relative file: URLs against the schema's directory (prisma/)
 * for the CLI and against the process CWD for the runtime client; both
 * candidate folders are created so either resolution works.
 */
const url = process.env.DATABASE_URL;
if (url.startsWith("file:")) {
  const filePart = url.slice("file:".length).split("?")[0]!.trim();
  const candidates = path.isAbsolute(filePart)
    ? [filePart]
    : [
        path.resolve(process.cwd(), filePart), // runtime client (CWD-relative)
        path.resolve(process.cwd(), "prisma", filePart), // CLI (schema-relative)
      ];
  for (const candidate of candidates) {
    try {
      fs.mkdirSync(path.dirname(candidate), { recursive: true });
    } catch {
      // read-only filesystem → the honest db-errors message will explain
    }
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
