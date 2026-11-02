#!/usr/bin/env node
/**
 * Writes one SHA256SUMS file covering every release asset in a directory —
 * portable server packages and the Electron installers/appimage alike.
 *
 * Lives in scripts/ rather than inline in the publish job so the exact
 * checksum format (sha256sum-compatible: "<hex>  <name>", two spaces) is
 * testable locally and can never silently drift between releases.
 *
 * Usage: node scripts/make-sums.mjs <dist-dir> <sums-file-name>
 *   e.g. node scripts/make-sums.mjs dist nexnotes-v2.2.0-SHA256SUMS.txt
 */
import { createReadStream } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const [dir, sumsName] = process.argv.slice(2);
if (!dir || !sumsName) {
  console.error("usage: node scripts/make-sums.mjs <dist-dir> <sums-file-name>");
  process.exit(1);
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

const skip = new Set([sumsName]);
const files = (await readdir(dir)).filter((f) => !skip.has(f)).sort();
if (files.length === 0) throw new Error(`no assets found in ${dir}`);

const lines = [];
for (const f of files) {
  lines.push(`${await sha256(path.join(dir, f))}  ${f}`);
}
await writeFile(path.join(dir, sumsName), lines.join("\n") + "\n");
console.log(`SHA256SUMS written for ${files.length} assets:`);
console.log(lines.map((l) => l.slice(0, 24) + "…  " + l.split("  ")[1]).join("\n"));
