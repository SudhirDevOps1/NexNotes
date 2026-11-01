# Changelog

All notable changes to NexNotes. Format: [Keep a Changelog](https://keepachangelog.com) ·
Versioning: [SemVer](https://semver.org).

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
