# Changelog

All notable changes to NexNotes. Format: [Keep a Changelog](https://keepachangelog.com) ·
Versioning: [SemVer](https://semver.org).

## [0.1.0](https://github.com/SudhirDevOps1/NexNotes/compare/v0.0.6...v0.1.0) (2026-11-05)


### Features

* **auth:** brute-force limits, session rotation, no more public secret ([ff23d01](https://github.com/SudhirDevOps1/NexNotes/commit/ff23d01480053baaa8bd733354c3822d7af37b38))

## [0.0.6](https://github.com/SudhirDevOps1/NexNotes/compare/v0.0.5...v0.0.6) (2026-11-05)


### Bug Fixes

* **vault:** signed-in password recovery + honest session errors ([d39ba3c](https://github.com/SudhirDevOps1/NexNotes/commit/d39ba3c4918cce54c71a9dfbf7e9feceadc6f359))

## [0.0.5](https://github.com/SudhirDevOps1/NexNotes/compare/v0.0.4...v0.0.5) (2026-11-05)


### Bug Fixes

* **vault:** verify the account password before deriving the E2E key ([d656375](https://github.com/SudhirDevOps1/NexNotes/commit/d656375d06db09911e1436fe949a9647ecc85f48))

## [0.0.4](https://github.com/SudhirDevOps1/NexNotes/compare/v0.0.3...v0.0.4) (2026-11-04)


### Bug Fixes

* **vault:** never render or re-encrypt account ciphertext in the editor ([9b4f59c](https://github.com/SudhirDevOps1/NexNotes/commit/9b4f59c327f77c581b6052d6676b5fcdb46407db))

## [0.0.3](https://github.com/SudhirDevOps1/NexNotes/compare/v0.0.2...v0.0.3) (2026-11-04)


### Bug Fixes

* **health:** the boot gate no longer hangs on a slow database start ([a8a1f20](https://github.com/SudhirDevOps1/NexNotes/commit/a8a1f209dc770eb8f7eb1d973e8ece245ba75b2b))
* **sync:** same-name tag/folder pushes land instead of retrying forever ([5401046](https://github.com/SudhirDevOps1/NexNotes/commit/540104687ac8dcc41198d049783569b4dfe56afd))

## [0.0.2](https://github.com/SudhirDevOps1/NexNotes/compare/v0.0.1...v0.0.2) (2026-11-04)


### Bug Fixes

* **release:** the release tag must stay plain-v or artifacts never build ([8d31a8c](https://github.com/SudhirDevOps1/NexNotes/commit/8d31a8c02e5a8e97597e3279c9af8eec0cb4cfce))

## [0.0.1] — 2026-11-02 — "Honest numbers"

**The version resets to `0.0.1`.** NexNotes is in active public development, and
SemVer 0.x is the industry convention for exactly that (major version zero = rapid
development, unstable API). The 2.x line jumped ahead of reality; everything it shipped
is still here, now under a numbering scheme that tells the truth:

- **`0.0.x`** — fixes · **`0.x.0`** — features · breaking changes bump the minor
  (`0.0.1 → 0.1.0`) until 1.0.0
- release-please is configured with `bump-minor-pre-major` /
  `bump-patch-for-minor-pre-major`, so Conventional Commits keep driving the train
- `1.0.0` is reserved for a stable, documented, supported API — see
  [`docs/VERSIONING.md`](docs/VERSIONING.md) for the full policy and the graduation
  checklist

No code changed in this release; the version files, the manifest and this changelog
were renumbered. Earlier entries below are kept verbatim as the pre-0.x history.

## [2.2.0] — 2026-11-02 — "Real desktop app"

The desktop experience is rebuilt on Electron. Nothing about the web app changed.

### Added — desktop
- **Windows installer (Electron + NSIS)** — one click, per-user install to
  `%LOCALAPPDATA%\Programs\nexnotes-desktop` (the folder follows the package
  name; app and shortcuts show as **NexNotes**), no admin rights, no directory
  page; the app launches right after setup. Notes live in `%APPDATA%\NexNotes`
  and survive both upgrades and uninstalls.
- **Linux AppImage (Electron)** — real desktop window with icon and taskbar name,
  no more console-plus-browser-tab launch.
- **Desktop shell** (`desktop/`) — the Next.js standalone server runs as a child
  process inside Electron's own runtime (`ELECTRON_RUN_AS_NODE`), so no second
  Node runtime ships in the box. First run seeds the schema-initialized SQLite
  database from the bundle; the server log lands in the user-data dir; a
  `server.json` handshake file publishes the picked port for CI smoke tests.

### Fixed
- The 2.1.0 Windows installer aborted with **"Can't write: \INSTALL.txt"** — its
  NSIS script had no `InstallDir`, so interactive installs tried to write to the
  drive root. Replaced wholesale by the Electron installer above.
- **"Installer integrity check has failed"** on download is a truncated download,
  not a broken build — releases now ship one `SHA256SUMS.txt` covering every asset
  so a bad download can be proven in seconds.

### Changed — CI
- Windows artifacts are now built **on a Windows runner** and the silent-installed
  app is booted and health-checked before anything is published; the AppImage is
  boot-tested under Xvfb; checksums are generated for all assets in one file.

## [2.1.0] — 2026-11-01 — "Prism code experience"

Additive release: code gets a first-class experience. Nothing removed.

### Added — code
- **Prism syntax highlighting everywhere** (`prism-react-renderer`, self-hosted — no CDN, privacy-first):
  markdown code fences, **code-note preview**, print documents and public share pages.
- **40+ languages** — bundled grammars plus registered extras (Rust, C#, Java, Kotlin, Swift, PHP,
  Ruby, Dart, Lua) and a hand-written **Prisma schema** grammar.
- **Code block toolbar** — language badge, one-click **copy** (morphs to a green check),
  **line-number toggle**, **word-wrap toggle**; oneLight/oneDark themes follow the app theme.
- **Auto-detection** of unlabeled fences (prisma/json/ts/tsx/js/python/bash/sql/go/rust/java/csharp/
  html/css/yaml/diff/ini…).
- **Code notes**: language picker (per-note, stored device-local) + **Tab / Shift+Tab**
  indent & dedent.
- Unknown fence languages degrade gracefully to plain rendering — highlighting never throws.

### Added — editor
- **Find & Replace** — the find bar gains a replace row: Replace current match + Replace All,
  live match counter preserved.
- **Note templates** — note menu → *Insert template*: Daily journal, Meeting notes, Bug report,
  Code review, Project README; inserted at the caret.
- **Export HTML** — standalone styled web page rendered with the same sanitized markdown pipeline;
  self-contained, no external requests, `noindex`.
- **Spelling toggle** — Settings → Appearance → *Check spelling* (prose editors only; code/HTML stay off).

### Changed
- `/api/health` version → `2.1.0`; sidebar badge → v2.1; demo seed gains a
  "Code demo — Prism highlighting" tour note.

## [2.0.0] — 2026-11-01 — "Every premium tool, free"

Public open-source launch. Everything below is **additive** — no v1.x feature was removed.

### Added — security
- **Account two-factor authentication (TOTP)** — RFC 6238 via WebCrypto-compatible server
  implementation, QR + manual key setup, 8 single-use backup codes (bcrypt-hashed), ±1 window drift,
  login rate limiting (10/10min/email). Verified end-to-end (setup → required code → backup login →
  single-use enforcement).
- Public **share links** hardened: 128-bit tokens, `noindex/nofollow`, locked & E2E-encrypted notes
  unshareable, revocable.

### Added — editors
- **Rich text (WYSIWYG) editor** (mdxeditor) — new `richtext` note type; content stays plain markdown,
  fully interoperable with sync/API/export. Toolbar: undo/redo, block types, bold/italic/underline,
  links, lists, code blocks, tables, thematic breaks.
- **KaTeX math** in markdown (`$…$`, `$$…$$`) — sanitized-then-rendered pipeline.
- **Wiki links `[[…]]`** with editor autocomplete (↑↓/Enter), open-or-create navigation, and a
  **backlinks panel** in the editor toolbar.

### Added — productivity
- **Batch operations** — multi-select in the note list: Star / Move to folder / Tag / **Merge** /
  Export / Trash / Restore with an animated action bar and live counts.
- **Smart Views** — saved searches (query + type + tag + folder + starred filters), device-local,
  one-click create from the sidebar.
- **Daily auto-backup** — decrypted local snapshots (IndexedDB, last 7), backup-now / download /
  restore-in-place, runs while the app is open.
- **Theme presets** — Nord, Solarized Light, Rosé Pine, Gruvbox, Tokyo Night (light+dark pairs) on
  top of the existing 8 accents and editor typography.

### Added — platform
- `richtext` accepted by the sync whitelist and the v1 REST API.
- `GET/POST /api/notes/:id/share` + public `/s/<token>` pages (sanitized server-rendered markdown,
  sandboxed iframes for HTML notes).
- Health endpoint now reports `2.0.0`; About dialog updated.

### Added — repo & release engineering
- Full documentation suite: README, FEATURES (SN comparison), API, SELF-HOSTING (Docker · Node ·
  Neon), PRIVACY, SECURITY-ARCHITECTURE, SECURITY.md, CONTRIBUTING, CODE_OF_CONDUCT, PLAN, CHANGELOG.
- GitHub Actions: `ci.yml` (lint → typecheck → build → boot smoke test), `docker.yml` (GHCR on tags),
  `release.yml` (artifacted releases).
- Dockerfile (multi-stage, standalone, non-root, healthcheck) + docker-compose + `.env.example` +
  `.dockerignore`.
- Deny-all whitelist `.gitignore` — no secrets or databases can ever be committed.
- AGPL-3.0 LICENSE.

### Verified
Login & 2FA flows (curl, all branches) · wiki navigation · KaTeX rendering · merge · smart view
create/filter · share round-trip in a fresh context · WYSIWYG typing · auto-backup snapshot ·
theme switching · API v1 200/401 · mobile 390 px · `/api/health` → `2.0.0`.

## [1.3.0] — earlier

- Live 2FA authenticator notes (rotating codes, countdown rings, add-account dialog)
- Collapsible sidebar (Alt+S) + collapsible note list (Alt+L)
- REST API v1 with personal bearer tokens (hash-only storage)
- Integrations vault (Discord/Telegram/GitHub/webhook, device-local encrypted) + Send-to-Discord
- HTML note type (sandboxed iframe) + sanitized inline HTML in markdown
- PWA network-first fix; sync whitelist for `html`; starter notes for new accounts

## [1.2.0] — earlier

- Mobile-responsive editor overhaul, split/zen modes, typography prefs, folder rename, tag colors,
  starter notes, sync + export fixes, Standard Notes importer.

## [1.0.0] — initial clean-room release

- Local-first notes (IndexedDB), account auth (bcrypt/JWT), E2E encryption, folders/tags,
  protected notes, note history, files, PWA, themes, SQLite + Neon/Postgres drivers.
