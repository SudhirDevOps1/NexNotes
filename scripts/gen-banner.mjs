/**
 * Generates the README brand banner (docs/banner.png) and a square logo
 * (docs/logo.png) for NexNotes — matching the in-app emerald identity.
 */
import sharp from "sharp";
import fs from "node:fs";

const root = "/home/z/my-project";

const banner = `
<svg width="1200" height="320" viewBox="0 0 1200 320" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1210"/>
      <stop offset="1" stop-color="#0d1a15"/>
    </linearGradient>
    <linearGradient id="em" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#10b981"/>
      <stop offset="1" stop-color="#059669"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.22" cy="0.1" r="0.9">
      <stop offset="0" stop-color="#10b981" stop-opacity="0.22"/>
      <stop offset="0.55" stop-color="#10b981" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#10b981" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1200" height="320" rx="28" fill="url(#bg)"/>
  <rect width="1200" height="320" rx="28" fill="url(#glow)"/>
  <rect x="1" y="1" width="1198" height="318" rx="27" fill="none" stroke="#1d3a2e" stroke-width="2"/>

  <!-- giant watermark N, right side -->
  <g transform="translate(1010,54) scale(7.4)" opacity="0.07">
    <path d="M0 24V0l24 24V0" fill="none" stroke="#10b981" stroke-width="5"
          stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <!-- app icon -->
  <g transform="translate(64,80)">
    <rect width="160" height="160" rx="40" fill="url(#em)"/>
    <g transform="translate(24,28) scale(4.7)">
      <path d="M2.5 24V2.5L26.5 26.5V2.5" fill="none" stroke="#ffffff" stroke-width="5"
            stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </g>

  <!-- wordmark -->
  <text x="272" y="150" font-family="DejaVu Sans" font-weight="bold" font-size="88" fill="#ffffff">Nex<tspan fill="#10b981">Notes</tspan></text>
  <text x="276" y="196" font-family="DejaVu Sans" font-size="27" fill="#8fb5a5">Local-first &#183; End-to-end encrypted &#183; Every premium feature free</text>

  <!-- feature chips -->
  <g font-family="DejaVu Sans Mono" font-size="17" fill="#a7d7c4">
    <g>
      <rect x="276" y="228" width="118" height="38" rx="19" fill="#12241c" stroke="#1f4634"/>
      <text x="300" y="252">Markdown</text>
    </g>
    <g>
      <rect x="410" y="228" width="106" height="38" rx="19" fill="#12241c" stroke="#1f4634"/>
      <text x="434" y="252">Prism.js</text>
    </g>
    <g>
      <rect x="532" y="228" width="150" height="38" rx="19" fill="#12241c" stroke="#1f4634"/>
      <text x="556" y="252">AES-256-GCM</text>
    </g>
    <g>
      <rect x="698" y="228" width="70" height="38" rx="19" fill="#12241c" stroke="#1f4634"/>
      <text x="722" y="252">2FA</text>
    </g>
    <g>
      <rect x="784" y="228" width="140" height="38" rx="19" fill="#12241c" stroke="#1f4634"/>
      <text x="808" y="252">PWA offline</text>
    </g>
    <g>
      <rect x="940" y="228" width="120" height="38" rx="19" fill="#12241c" stroke="#1f4634"/>
      <text x="964" y="252">REST API</text>
    </g>
  </g>

  <text x="276" y="298" font-family="DejaVu Sans Mono" font-size="16" fill="#4f7263">open-source &#183; AGPL-3.0 &#183; self-hostable &#183; SQLite / Neon Postgres</text>
</svg>`;

fs.writeFileSync("/tmp/banner.svg", banner);
await sharp(Buffer.from(banner), { density: 192 })
  .resize(2400, 640)
  .png({ compressionLevel: 9 })
  .toFile(`${root}/docs/banner.png`);
console.log("✓ docs/banner.png (2400×640)");

// square logo from the in-app icon
const icon = fs.readFileSync(`${root}/public/icon.svg`);
await sharp(icon, { density: 300 })
  .resize(512, 512)
  .png()
  .toFile(`${root}/docs/logo.png`);
console.log("✓ docs/logo.png (512×512)");
