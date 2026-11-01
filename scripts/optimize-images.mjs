/**
 * Lossless image recompression for committed assets.
 *
 * PNGs are re-encoded at maximum zlib effort with metadata stripped —
 * pixel data is untouched. JPEGs are intentionally skipped (no lossless
 * path that is worth the complexity here). Files must shrink by >2% to
 * count as a win; the log lists every candidate and what happened.
 *
 * Used by .github/workflows/image-optimizer.yml; safe to run locally too:
 *   bun scripts/optimize-images.mjs
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const ROOTS = [path.join(process.cwd(), "docs"), path.join(process.cwd(), "public")];
const SKIP_DIRS = new Set(["node_modules", ".next"]);
const MIN_SAVING_RATIO = 0.02; // <2% smaller is churn, not a win

async function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(path.join(dir, entry.name));
    } else if (/\.(png)$/i.test(entry.name)) {
      yield path.join(dir, entry.name);
    }
  }
}

let totalBefore = 0;
let totalAfter = 0;
let optimized = 0;
let skipped = 0;

for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  for await (const file of walk(root)) {
    const before = fs.statSync(file).size;
    const tmp = `${file}.opt.png`;
    try {
      await sharp(file, { limitInputPixels: 4096 * 4096 })
        .png({ compressionLevel: 9, effort: 10 })
        .toFile(tmp);
      const after = fs.statSync(tmp).size;
      totalBefore += before;
      if (after < before * (1 - MIN_SAVING_RATIO)) {
        fs.renameSync(tmp, file);
        totalAfter += after;
        optimized++;
        console.log(
          `✓ ${path.relative(process.cwd(), file)}: ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB`
        );
      } else {
        skipped++;
        totalAfter += before;
        fs.rmSync(tmp, { force: true });
        console.log(`· ${path.relative(process.cwd(), file)}: already optimal`);
      }
    } catch (err) {
      fs.rmSync(tmp, { force: true });
      console.warn(`! ${path.relative(process.cwd(), file)}: skipped (${err.message})`);
      skipped++;
      totalAfter += before;
    }
  }
}

console.log(
  `\n${optimized} optimized, ${skipped} left as-is. ` +
    `${(totalBefore / 1024).toFixed(0)} KB → ${(totalAfter / 1024).toFixed(0)} KB ` +
    `(${(((totalBefore - totalAfter) / Math.max(totalBefore, 1)) * 100).toFixed(1)}% saved).`
);
process.exit(0);
