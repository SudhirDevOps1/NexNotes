<div align="center">
  <img src="docs/banner.png" alt="NexNotes — Local-first · End-to-end encrypted · Every premium feature free" width="100%"/>

  **The free, open-source, local-first notes app — every "premium" feature unlocked, forever.**

  A clean-room rewrite of what a modern notes app should be: end-to-end encrypted, offline-first,
  self-hostable in one command, and **zero paid gates**. Think *"Vaultwarden for your notes."*

  [![CI](https://github.com/SudhirDevOps1/NexNotes/actions/workflows/ci.yml/badge.svg)](https://github.com/SudhirDevOps1/NexNotes/actions/workflows/ci.yml)
  [![CodeQL](https://github.com/SudhirDevOps1/NexNotes/actions/workflows/codeql.yml/badge.svg)](https://github.com/SudhirDevOps1/NexNotes/actions/workflows/codeql.yml)
  [![codecov](https://codecov.io/gh/SudhirDevOps1/NexNotes/graph/badge.svg)](https://codecov.io/gh/SudhirDevOps1/NexNotes)
  [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/SudhirDevOps1/NexNotes/badge)](https://scorecard.dev/viewer/?uri=github.com/SudhirDevOps1/NexNotes)
  [![Release](https://github.com/SudhirDevOps1/NexNotes/actions/workflows/release.yml/badge.svg)](https://github.com/SudhirDevOps1/NexNotes/actions/workflows/release.yml)
  [![CodeRabbit Pull Request Reviews](https://img.shields.io/endpoint?url=https://coderabbit.ai/badge.svg)](https://coderabbit.ai)
  [![Docker](https://github.com/SudhirDevOps1/NexNotes/actions/workflows/docker.yml/badge.svg)](https://github.com/SudhirDevOps1/NexNotes/actions/workflows/docker.yml)
  [![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
  [![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)](package.json)

  ### 🧪 Instant demo (built into every instance)

  | Email | Password | Locked note password |
  |---|---|---|
  | `demo@nexnotes.app` | `NexNotes@2026` | `demo123` |

  *The login screen has a one-click **Demo login** button — the account is auto-seeded with 20+
  example notes covering every feature (code highlighting, spreadsheets, authenticator, HTML…).*

  ![NexNotes main screen](docs/screenshots/desktop-notes.png)

</div>

---

## ✨ Why NexNotes?

Standard Notes charges ~$90/year for its "Productivity" plan. NexNotes gives you **all of it — free** —
plus things it doesn't have. No accounts to rent, no upgrade walls, no telemetry.

| Standard Notes paid plan | NexNotes |
|---|---|
| Super notes (markdown, syntax, tables) | ✅ Markdown **+ Prism syntax highlighting (40+ langs) + KaTeX math + `[[wiki links]]` + backlinks** |
| All premium editors | ✅ Rich text (WYSIWYG), Markdown, Tasks, Checklists, Code, **Spreadsheets**, Authenticator, HTML pages |
| Note history | ✅ Automatic version snapshots + restore |
| Protected notes | ✅ Per-note passwords (AES-GCM ciphertext) |
| Encrypted attachments | ✅ Files library, E2E-encryptable |
| Premium themes | ✅ Nord, Solarized, Rosé Pine, Gruvbox, Tokyo Night + 8 accents + editor fonts |
| Two-factor login | ✅ TOTP (RFC 6238) with single-use backup codes |
| Automatic backups | ✅ Daily local snapshots (IndexedDB, last 7) + restore |
| Listed publishing | ✅ Self-hosted public share links (`/s/<token>`, revocable, noindex) |
| Offline web access | ✅ PWA + IndexedDB local-first sync |
| REST API | ✅ `/api/v1/*` with personal bearer tokens (hash-only storage) |
| — | ➕ **Batch operations** (select → tag / move / merge / export / trash) |
| — | ➕ **Smart views** (saved searches) |
| — | ➕ **Code, first-class** — Prism highlighting w/ copy·line-numbers·wrap, language picker, find & replace, templates, HTML export |
| — | ➕ Integrations vault (Discord webhook, Telegram, GitHub… — Obsidian-style) |
| — | ➕ Command palette, live stats, reading progress, zen mode, collapsible panels |
| — | ➕ Import from Standard Notes (decrypted backups) |
| — | ➕ Multi-database: **SQLite (default) · Neon Postgres** switchable |

Full comparison: [`docs/FEATURES.md`](docs/FEATURES.md)

## 🔐 Privacy-first, by architecture

- **E2E encryption** — AES-256-GCM, key derived from your password (PBKDF2, 310k iterations).
  Turn it on in Settings → the server stores only ciphertext.
- **Local-first** — every keystroke saves to IndexedDB instantly; the server is a sync target, not a dependency.
- **No telemetry. No trackers. No third-party scripts.** Ever.
- **HTML notes** render in a sandboxed iframe with JavaScript disabled; markdown HTML is sanitized (GitHub schema).
- **2FA secrets** (TOTP) are verified server-side but API tokens are stored **hash-only**.

Read the full model: [`docs/PRIVACY.md`](docs/PRIVACY.md) · [`docs/SECURITY-ARCHITECTURE.md`](docs/SECURITY-ARCHITECTURE.md)

## 🚀 Quick start

### Desktop app (Windows · Linux)

Installers are attached to every [release](https://github.com/SudhirDevOps1/NexNotes/releases) —
no Node, no terminal, no Docker:

| Asset | What it is |
|---|---|
| `NexNotes-x.y.z-windows-x64-setup.exe` | Windows installer — one click, per-user (`%LOCALAPPDATA%\Programs`), **no admin rights** |
| `NexNotes-x.y.z-linux-x64.AppImage` | Linux AppImage — `chmod +x`, double-click, done |
| `nexnotes-vx.y.z-windows-x64.zip` / `nexnotes-vx.y.z-linux-x64.tar.gz` | Portable **server** for self-hosters (needs Node 20+) |
| `nexnotes-vx.y.z-SHA256SUMS.txt` | SHA-256 checksums for all of the above |

The desktop app is real Electron: it runs its server internally and shows the UI in its own
window (taskbar icon, name and all). Notes live in `%APPDATA%\NexNotes` (Windows) or
`~/.config/NexNotes` (Linux) and survive both upgrades and uninstalls.

> **"NSIS Error: Installer integrity check has failed"** almost always means a truncated
> download. Re-download and verify with
> `sha256sum -c nexnotes-vx.y.z-SHA256SUMS.txt` (Windows: `certutil -hashfile <file> SHA256`).

### Docker (recommended)

```bash
git clone https://github.com/SudhirDevOps1/NexNotes.git
cd NexNotes
docker compose up -d          # → http://localhost:3000
```

### Node / Bun (dev)

```bash
git clone https://github.com/SudhirDevOps1/NexNotes.git
cd NexNotes
bun install
bunx prisma db push           # SQLite — zero config
bun run dev                   # → http://localhost:3000
```

### Use Neon Postgres (or any Postgres)

```bash
node scripts/db-switch.mjs postgres "postgresql://user:pass@ep-xxx.neon.tech/nexnotes?sslmode=require"
bun run db:push
bun run dev
```

Details: [`docs/SELF-HOSTING.md`](docs/SELF-HOSTING.md)

## 🧭 Tour

| | |
|---|---|
| ![Editor with math & wiki links](docs/screenshots/editor-math-wikilinks.png) | ![Settings & themes](docs/screenshots/settings-themes.png) |
| *KaTeX math + clickable wiki links + backlinks* | *Premium theme presets — all free* |
| ![2FA setup](docs/screenshots/twofa-setup.png) | ![WYSIWYG editor](docs/screenshots/richtext-wysiwyg.png) |
| *Account 2FA with QR + backup codes* | *Rich text editor (markdown underneath)* |
| ![Share page](docs/screenshots/share-page.png) | ![Mobile](docs/screenshots/mobile-responsive.png) |
| *Public read-only share links* | *Fully responsive* |

## ⌨️ Highlights

- **Command palette** — `Ctrl+K` · **New note** — `Alt+N` · **Settings** — `Ctrl+,`
- **Collapsible everything** — sidebar (`Alt+S`), note list (`Alt+L`), zen mode
- **Live digits everywhere** — rotating TOTP codes with countdown rings, live word counts, animated stat counters
- **Smart views** — save "starred + contains #demo" as a reusable view
- **Batch merge** — select messy notes, merge into one in a click
- **`[[wiki links]]`** — type `[[` for autocomplete; backlinks panel shows what links here
- **Authenticator notes** — store otpauth:// secrets, get live 6-digit codes on-device

## 🗺️ Status

- **v2.1.0** — Prism code experience: syntax highlighting (40+ languages), find & replace,
  note templates, HTML export. See [`CHANGELOG.md`](CHANGELOG.md) and [`PLAN.md`](PLAN.md)
- AGPL-3.0 — fork it, self-host it, ship it. Attribution appreciated, never stripped.

## 🤝 Contributing

PRs are welcome — [`CONTRIBUTING.md`](CONTRIBUTING.md) has the full guide (`bun run lint && bunx tsc --noEmit` must pass).

## 📜 License

[GNU AGPL-3.0](LICENSE) — if you run a modified version as a network service, you must offer
your source. This project is an independent clean-room codebase; it is not affiliated with
Standard Notes.
