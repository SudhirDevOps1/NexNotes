/** Generates PWA icons from public/icon.svg using sharp. */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const root = "/home/z/my-project";
const svg = fs.readFileSync(path.join(root, "public/icon.svg"));

const outDir = path.join(root, "public", "icons");
fs.mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(path.join(outDir, `icon-${size}.png`));
  console.log(`✓ icon-${size}.png`);
}

// apple touch icon (180)
await sharp(svg, { density: 300 }).resize(180, 180).png().toFile(path.join(outDir, "apple-touch-icon.png"));
console.log("✓ apple-touch-icon.png");
