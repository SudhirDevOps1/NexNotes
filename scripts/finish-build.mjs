#!/usr/bin/env node
/**
 * Post-build step: copy static assets into the standalone server bundle.
 *
 * `next build` with output:"standalone" emits a server that does NOT serve
 * /_next/static or /public — the docs tell you to copy them in. WHERE to copy
 * depends on the layout Next chose:
 *
 *   - flat (Docker, CI):  .next/standalone/server.js
 *   - nested (builds run inside a workspace whose PARENT has node_modules —
 *     Next then treats the parent as the monorepo root):
 *         .next/standalone/<projectDir>/server.js
 *
 * The old inline `cp` in package.json only knew the flat layout; a nested
 * build produced a server that 404'd every chunk and hung on "Loading…" —
 * reproducible in this sandbox, invisible in Docker/CI. This script finds the
 * server.js and copies next to it, whichever layout is active.
 */
import fs from "node:fs";
import path from "node:path";
import { cpSync, existsSync } from "node:fs";

const root = path.resolve(process.cwd());
const standalone = path.join(root, ".next", "standalone");

function findServerDir() {
  if (existsSync(path.join(standalone, "server.js"))) return standalone;
  // nested layout: search one level down (Next names it after the project dir)
  if (existsSync(standalone)) {
    for (const entry of fs.readdirSync(standalone, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const candidate = path.join(standalone, entry.name);
        if (existsSync(path.join(candidate, "server.js"))) return candidate;
      }
    }
  }
  return null;
}

const serverDir = findServerDir();
if (!serverDir) {
  console.error("✗ no standalone server.js found under .next/standalone — nothing to copy");
  process.exit(1);
}

cpSync(path.join(root, ".next", "static"), path.join(serverDir, ".next", "static"), { recursive: true });
cpSync(path.join(root, "public"), path.join(serverDir, "public"), { recursive: true });
console.log(`✓ standalone assets copied → ${path.relative(root, serverDir)}`);
