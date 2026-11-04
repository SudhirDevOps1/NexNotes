#!/usr/bin/env node
/**
 * Rebuilds every brand asset from one vector source — README banner, social
 * preview, logo, the runtime favicon/PWA logo and the Electron icon set.
 * Run: `node scripts/build-brand-assets.mjs`
 *
 * The mark is a white "N" monogram on an emerald tile with a folded page
 * corner — the fold is the notes affordance that makes the mark read as a
 * notes app rather than a generic letter badge. Docs assets, the runtime
 * icons and the desktop shell icons are all generated here, so they can
 * never drift apart.
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(ROOT, "docs");
const DESKTOP_BUILD = join(ROOT, "desktop", "build");
const PUBLIC_ICONS = join(ROOT, "public", "icons");

const FONT_SANS = "Noto Sans SC";
const FONT_MONO = "Sarasa Mono SC";

// ── brand tokens ─────────────────────────────────────────────────────────────
const G = ["#34d399", "#10b981", "#047857"]; // emerald ramp
const INK = "#0b1512";
const MIST = "#9fb8ae";

/** The mark on its 64-unit design grid, scaled to any pixel size.
 *  Rounded emerald tile, folded page corner (top-right), white N monogram. */
function markSVG(size) {
  const u = size / 64; // one design-grid unit
  return `
  <defs>
    <linearGradient id="grad${size}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${G[0]}"/><stop offset="0.55" stop-color="${G[1]}"/><stop offset="1" stop-color="${G[2]}"/>
    </linearGradient>
    <radialGradient id="sheen${size}" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <path d="M${14 * u} 0 H${50 * u} L${64 * u} ${14 * u} V${50 * u}
           A${14 * u} ${14 * u} 0 0 1 ${50 * u} ${64 * u} H${14 * u}
           A${14 * u} ${14 * u} 0 0 1 0 ${50 * u} V${14 * u}
           A${14 * u} ${14 * u} 0 0 1 ${14 * u} 0 Z" fill="url(#grad${size})"/>
  <ellipse cx="${19 * u}" cy="${12 * u}" rx="${38 * u}" ry="${24 * u}" fill="url(#sheen${size})" opacity="0.18"/>
  <path d="M${50 * u} 0 L${50 * u} ${14 * u} L${64 * u} ${14 * u} Z" fill="#ffffff" opacity="0.30"/>
  <path d="M${20 * u} ${44 * u} V${20 * u} L${44 * u} ${44 * u} V${20 * u}"
        fill="none" stroke="#ffffff" stroke-width="${5.75 * u}"
        stroke-linecap="round" stroke-linejoin="round"/>`;
}

function markDocument(size, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">${inner}</svg>`;
}

// ── shared scenery ───────────────────────────────────────────────────────────
function scenery(W, H) {
  return `
  <defs>
    <radialGradient id="glowL" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#10b981" stop-opacity="0.13"/><stop offset="1" stop-color="#10b981" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dots" width="44" height="44" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1.5" fill="#34d399" fill-opacity="0.05"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="${INK}"/>
  <rect width="${W}" height="${H}" fill="url(#dots)"/>
  <circle cx="${Math.round(W * 0.14)}" cy="0" r="${Math.round(H * 1.15)}" fill="url(#glowL)"/>
  <circle cx="${Math.round(W * 0.86)}" cy="${H}" r="${Math.round(H * 1.05)}" fill="url(#glowL)"/>`;
}

/** Pill chip whose width is derived from the monospace advance width. */
function chip(label, x, y, { fs = 30, pad = 26, gap = 18 } = {}) {
  const mono = fs * 0.6; // Sarasa Mono advance width
  const w = Math.round(label.length * mono + pad * 2);
  const h = Math.round(fs * 1.9);
  const text = `<text x="${x + pad}" y="${y + h / 2}" font-family="${FONT_MONO}" font-weight="600" font-size="${fs}" fill="#d7e8e1" dominant-baseline="central">${label}</text>`;
  const rect = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#10b9810f" stroke="#10b981" stroke-opacity="0.38" stroke-width="1.5"/>`;
  return { svg: rect + text, next: x + w + gap, w };
}

/** Lay a row of chips out symmetrically around the canvas centre. */
function chipRow(labels, W, y, opts) {
  const widths = labels.map((l) => Math.round(l.length * opts.fs * 0.6 + opts.pad * 2));
  const total = widths.reduce((a, b) => a + b, 0) + opts.gap * (labels.length - 1);
  let cx = Math.round((W - total) / 2);
  let svg = "";
  labels.forEach((l, i) => {
    const r = chip(l, cx, y, opts);
    svg += r.svg;
    cx = r.next;
  });
  return svg;
}

// ── banner 2400×640 (centred, symmetric) ─────────────────────────────────────
const CHIPS = ["Markdown + Prism", "KaTeX", "Spreadsheets", "TOTP 2FA", "PWA offline", "REST API"];

function bannerSVG() {
  const W = 2400, H = 640;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  ${scenery(W, H)}
  <g transform="translate(-130,96)" opacity="0.05">${markSVG(470)}</g>
  <g transform="translate(${W - 340},96)" opacity="0.05">${markSVG(470)}</g>
  <g transform="translate(${Math.round(W / 2 - 74)},72)">${markSVG(148)}</g>
  <text x="${W / 2}" y="332" text-anchor="middle" font-family="${FONT_SANS}" font-weight="700" font-size="112" letter-spacing="-2" fill="#ffffff">Nex<tspan fill="#34d399">Notes</tspan></text>
  <text x="${W / 2}" y="396" text-anchor="middle" font-family="${FONT_SANS}" font-weight="400" font-size="37" fill="${MIST}">Local-first · End-to-end encrypted · Every premium feature free</text>
  ${chipRow(CHIPS, W, 434, { fs: 30, pad: 26, gap: 18 })}
  <text x="${W / 2}" y="578" text-anchor="middle" font-family="${FONT_MONO}" font-weight="400" font-size="27" fill="${MIST}" fill-opacity="0.62">open-source · AGPL-3.0 · self-hostable · SQLite / Neon Postgres · Windows · Linux · Web</text>
</svg>`;
}

// ── social preview 1200×630 ──────────────────────────────────────────────────
function ogSVG() {
  const W = 1200, H = 630;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  ${scenery(W, H)}
  <g transform="translate(${Math.round(W / 2 - 70)},64)">${markSVG(140)}</g>
  <text x="${W / 2}" y="308" text-anchor="middle" font-family="${FONT_SANS}" font-weight="700" font-size="94" letter-spacing="-1.5" fill="#ffffff">Nex<tspan fill="#34d399">Notes</tspan></text>
  <text x="${W / 2}" y="362" text-anchor="middle" font-family="${FONT_SANS}" font-weight="400" font-size="30" fill="${MIST}">Local-first · End-to-end encrypted · Every premium feature free</text>
  ${chipRow(["Markdown", "KaTeX", "Spreadsheets", "TOTP 2FA", "REST API"], W, 408, { fs: 24, pad: 20, gap: 14 })}
  <text x="${W / 2}" y="560" text-anchor="middle" font-family="${FONT_MONO}" font-size="23" fill="${MIST}" fill-opacity="0.6">open-source · AGPL-3.0 · self-hostable · no telemetry</text>
</svg>`;
}

// ── ICO packer (PNG-compressed layers, Vista+) ───────────────────────────────
async function packIco(pngBuffers) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngBuffers.length, 4);
  const entries = [];
  let offset = 6 + pngBuffers.length * 16;
  for (const { size, buf } of pngBuffers) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8); e.writeUInt32LE(offset, 12);
    entries.push(e); offset += buf.length;
  }
  return Buffer.concat([header, ...entries, ...pngBuffers.map((p) => p.buf)]);
}

// ── build ────────────────────────────────────────────────────────────────────
async function main() {
  mkdirSync(DOCS, { recursive: true });
  const jobs = [];

  // vector sources (committed to the repo)
  writeFileSync(join(DOCS, "logo-mark.svg"), markDocument(512, markSVG(512)));
  writeFileSync(join(DOCS, "banner.svg"), bannerSVG());
  writeFileSync(join(DOCS, "og.svg"), ogSVG());

  // runtime favicon + PWA logo — the same mark, plain SVG
  writeFileSync(join(ROOT, "public", "icon.svg"), markDocument(64, markSVG(64)));
  writeFileSync(join(ROOT, "public", "logo.svg"), markDocument(64, markSVG(64)));

  // docs raster set
  jobs.push(
    sharp(Buffer.from(bannerSVG()), { density: 96 }).png({ compressionLevel: 9 })
      .toFile(join(DOCS, "banner.png")),
    sharp(Buffer.from(ogSVG()), { density: 96 }).png({ compressionLevel: 9 })
      .toFile(join(DOCS, "og.png")),
    sharp(Buffer.from(markDocument(512, markSVG(512))), { density: 96 })
      .resize(512, 512).png({ compressionLevel: 9 }).toFile(join(DOCS, "logo.png")),
  );

  // Electron app icon: PNG 512 + multi-size ICO
  const iconSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoPngs = [];
  for (const size of iconSizes) {
    const buf = await sharp(Buffer.from(markDocument(512, markSVG(512))), { density: 300 })
      .resize(size, size).png().toBuffer();
    icoPngs.push({ size, buf });
    if (size === 256) jobs.push(sharp(buf).resize(512, 512, { kernel: "nearest" }).png({ compressionLevel: 9 }).toFile(join(DESKTOP_BUILD, "icon.png")));
  }
  const big512 = await sharp(Buffer.from(markDocument(512, markSVG(512))), { density: 300 })
    .resize(512, 512).png({ compressionLevel: 9 }).toBuffer();
  jobs.push(writeFileSync(join(DESKTOP_BUILD, "icon.png"), big512));
  jobs.push(writeFileSync(join(DESKTOP_BUILD, "icon.ico"), await packIco(icoPngs)));

  // PWA icon set (same mark, maskable padding handled by the app manifest)
  mkdirSync(PUBLIC_ICONS, { recursive: true });
  for (const size of [192, 512]) {
    const buf = await sharp(Buffer.from(markDocument(512, markSVG(512))), { density: 300 })
      .resize(size, size).png({ compressionLevel: 9 }).toBuffer();
    jobs.push(writeFileSync(join(PUBLIC_ICONS, `icon-${size}.png`), buf));
  }

  await Promise.all(jobs);
  console.log("brand assets rebuilt: docs/banner.{svg,png} docs/og.{svg,png} docs/logo.{svg→logo-mark.svg,png} public/icon.svg public/logo.svg public/icons/icon-{192,512}.png desktop/build/icon.{png,ico}");
}

main().catch((err) => { console.error(err); process.exit(1); });
