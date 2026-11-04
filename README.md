<div align="center">
  <img src="docs/banner.png" alt="NexNotes — Local-first · End-to-end encrypted · Every premium feature free" width="100%"/>

  **The free, open-source, local-first notes app — every "premium" feature unlocked, forever.**

  A clean-room rewrite of what a modern notes app should be: end-to-end encrypted, offline-first,
  self-hostable in one command, and **zero paid gates**. Think *"Vaultwarden for your notes."*

  [![CI](https://github.com/SudhirDevOps1/NexNotes/actions/workflows/ci.yml/badge.svg)](https://github.com/SudhirDevOps1/NexNotes/actions/workflows/ci.yml)
  [![e2e-gate](https://github.com/SudhirDevOps1/NexNotes/actions/workflows/e2e-gate.yml/badge.svg)](https://github.com/SudhirDevOps1/NexNotes/actions/workflows/e2e-gate.yml)
  [![CodeQL](https://github.com/SudhirDevOps1/NexNotes/actions/workflows/codeql.yml/badge.svg)](https://github.com/SudhirDevOps1/NexNotes/actions/workflows/codeql.yml)
  [![codecov](https://codecov.io/gh/SudhirDevOps1/NexNotes/graph/badge.svg)](https://codecov.io/gh/SudhirDevOps1/NexNotes)
  [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/SudhirDevOps1/NexNotes/badge)](https://scorecard.dev/viewer/?uri=github.com/SudhirDevOps1/NexNotes)
  [![Latest release](https://img.shields.io/github/v/release/SudhirDevOps1/NexNotes?label=release&color=10b981)](https://github.com/SudhirDevOps1/NexNotes/releases/latest)
  [![Docker](https://github.com/SudhirDevOps1/NexNotes/actions/workflows/docker.yml/badge.svg)](https://github.com/SudhirDevOps1/NexNotes/actions/workflows/docker.yml)
  [![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
  [![Status: 0.x — in development](https://img.shields.io/badge/status-0.x%20in%20development-orange)](docs/VERSIONING.md)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

  ### 🧪 Instant demo (built into every instance)

  | Email | Password | Locked note password |
  |---|---|---|
  | `demo@nexnotes.app` | `NexNotes@2026` | `demo123` |

  *The login screen has a one-click **Demo login** button — the account is auto-seeded with 20+
  example notes covering every feature (code highlighting, spreadsheets, authenticator, HTML…).*

  ![NexNotes — notes list, rendered markdown editor, tags and folders](docs/screenshots/desktop-notes.png)

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

## 🖼️ Feature showcase

Every note type and every tool, as it actually looks in the app.

### Editors — seven ways to write

| | |
|---|---|
| ![Rich text WYSIWYG](docs/screenshots/richtext-wysiwyg.png) | ![KaTeX math + wiki links](docs/screenshots/editor-math-wikilinks.png) |
| *Rich text (WYSIWYG) — stored as plain markdown underneath* | *Markdown with KaTeX math and clickable `[[wiki links]]`* |
| ![Prism syntax highlighting](docs/screenshots/code-highlighting.png) | ![Spreadsheets](docs/screenshots/spreadsheet.png) |
| *Code notes — Prism highlighting, 40+ languages, line numbers, copy* | *Spreadsheet notes — formulas, rows and columns in a note* |
| ![Task notes](docs/screenshots/task-note.png) | ![HTML notes](docs/screenshots/html-sandbox.png) |
| *Task notes — interactive checklists* | *HTML notes rendered in a sandboxed iframe (scripts off)* |
| ![Authenticator](docs/screenshots/authenticator.png) | ![Templates](docs/screenshots/templates.png) |
| *Authenticator notes — live TOTP codes, generated on-device* | *One-click templates: journal, meeting notes, bug report…* |

### Think & link

| | |
|---|---|
| ![Backlinks](docs/screenshots/backlinks.png) | ![Find & replace + search](docs/screenshots/search.png) |
| *Backlinks panel — every note that links here* | *Debounced full-text search, unlock-aware* |
| ![Command palette](docs/screenshots/command-palette.png) | ![Smart views](docs/screenshots/smart-views-batch.png) |
| *Command palette — `Ctrl+K` for notes, actions, navigation* | *Smart views — save any search as a living filter* |

### Organise & operate

| | |
|---|---|
| ![Batch operations](docs/screenshots/batch-operations.png) | ![Files pane](docs/screenshots/files-pane.png) |
| *Batch operations — select → tag / move / merge / export / trash* | *Files library — E2E-encryptable attachments* |
| ![Note history](docs/screenshots/history-dialog.png) | ![Live stats](docs/screenshots/stats-dialog.png) |
| *Note history — automatic snapshots, one-click restore* | *Stats — words, streaks and writing rhythms, live* |

### Privacy & security

| | |
|---|---|
| ![Locked note](docs/screenshots/lock-dialog.png) | ![2FA setup](docs/screenshots/twofa-setup.png) |
| *Per-note passwords — AES-GCM ciphertext server-side* | *TOTP 2FA with QR + single-use backup codes* |
| ![API tokens](docs/screenshots/api-tokens.png) | ![Public share page](docs/screenshots/share-page.png) |
| *REST API tokens — stored hash-only* | *Read-only public share links — noindex, revocable* |

### Everywhere you are

| | |
|---|---|
| ![Themes](docs/screenshots/settings-themes.png) | ![Mobile](docs/screenshots/mobile-responsive.png) |
| *Nord, Solarized, Rosé Pine, Gruvbox, Tokyo Night — all free* | *Fully responsive — same data on the phone* |

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

## 📚 Documentation

| Doc | What's inside |
|---|---|
| [`docs/FEATURES.md`](docs/FEATURES.md) | Full feature matrix vs Standard Notes |
| [`docs/API.md`](docs/API.md) · [`docs/PRIVACY.md`](docs/PRIVACY.md) | REST API reference · the privacy model |
| [`docs/SELF-HOSTING.md`](docs/SELF-HOSTING.md) | Docker, SQLite/Postgres, backups, reverse proxy |
| [`docs/SECURITY-ARCHITECTURE.md`](docs/SECURITY-ARCHITECTURE.md) | Threat model, crypto choices, sandboxing |
| [`docs/VERSIONING.md`](docs/VERSIONING.md) | The 0.x versioning policy + 1.0.0 graduation checklist |
| [`docs/CI-CD.md`](docs/CI-CD.md) | The 13-workflow pipeline, tier by tier |
| [`docs/BRANCH-PROTECTION.md`](docs/BRANCH-PROTECTION.md) | Branch protection & rulesets — exact settings |
| [`docs/RELEASE_SETUP.md`](docs/RELEASE_SETUP.md) | release-please, Electron builds, repo settings |
| [`PLAN.md`](PLAN.md) | Roadmap — shipped plans, verified gate by gate |

## ⌨️ Highlights

- **Command palette** — `Ctrl+K` · **New note** — `Alt+N` · **Settings** — `Ctrl+,`
- **Collapsible everything** — sidebar (`Alt+S`), note list (`Alt+L`), zen mode
- **Live digits everywhere** — rotating TOTP codes with countdown rings, live word counts, animated stat counters
- **Smart views** — save "starred + contains #demo" as a reusable view
- **Batch merge** — select messy notes, merge into one in a click
- **`[[wiki links]]`** — type `[[` for autocomplete; backlinks panel shows what links here
- **Authenticator notes** — store otpauth:// secrets, get live 6-digit codes on-device

## 🗺️ Status

- **v0.0.1** — active public development on the 0.x line: `0.0.x` fixes, `0.x.0` features,
  `1.0.0` reserved for a stable, documented API. Policy: [`docs/VERSIONING.md`](docs/VERSIONING.md) ·
  history: [`CHANGELOG.md`](CHANGELOG.md)
- AGPL-3.0 — fork it, self-host it, ship it. Attribution appreciated, never stripped.

## 🤝 Contributing

PRs are welcome — [`CONTRIBUTING.md`](CONTRIBUTING.md) has the full guide (`bun run lint && bunx tsc --noEmit` must pass).

## 📜 License

[GNU AGPL-3.0](LICENSE) — if you run a modified version as a network service, you must offer
your source. This project is an independent clean-room codebase; it is not affiliated with
Standard Notes.
