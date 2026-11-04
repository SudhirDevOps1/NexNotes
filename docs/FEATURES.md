# Feature matrix — NexNotes vs Standard Notes

> Verified November 2025 against Standard Notes' public feature/pricing pages, help center
> (editors list), community forum and G2 reviews. NexNotes is an independent clean-room
> codebase — no SN code is used.

## 1. Editors & note types

| Capability | SN Free | SN Productivity ($90/yr) | NexNotes (free) |
|---|---|---|---|
| Plain text | ✅ | ✅ | ✅ |
| Markdown + live preview, split view | ✅ | ✅ | ✅ + format toolbar |
| Rich text WYSIWYG | ❌ | ✅ (Rich Text editor) | ✅ **mdxeditor** (markdown underneath) |
| Task lists / checklists | ❌ | ✅ (Tasks, Advanced checklist) | ✅ interactive checkboxes |
| Code editor | ❌ | ✅ | ✅ |
| Spreadsheets | ❌ | ✅ | ✅ (nxsheet format + formulas) |
| Authenticator (2FA codes) | ❌ | ✅ | ✅ live RFC 6238 codes + countdown rings, add-account dialog |
| HTML pages | ❌ | ❌ | ✅ sandboxed iframe preview, scripts off |
| Inline HTML in markdown | ❌ | ✅ | ✅ sanitized (rehype-sanitize GitHub schema) |
| KaTeX math | ❌ | ❌ | ✅ inline `$…$` and block `$$…$$` |
| `[[wiki links]]` + autocomplete | ❌ | ❌ | ✅ |
| Backlinks panel | ❌ | ❌ | ✅ |
| Editor width (narrow/medium/full) | ❌ | ✅ | ✅ |
| Per-note typography (font/size/spacing) | ❌ | ✅ | ✅ |

## 2. Organising

| Capability | SN Free | SN Productivity | NexNotes |
|---|---|---|---|
| Tags | ✅ | ✅ | ✅ + deterministic colors |
| Folders / nested tags | ❌ | ✅ (tag folders) | ✅ folders + rename |
| Pinned / starred / archived | ✅ | ✅ | ✅ |
| Trash + restore + auto-purge 30d | ✅ | ✅ | ✅ |
| **Batch operations** (tag/move/merge/export/trash) | ❌ | ❌ | ✅ multi-select action bar |
| **Smart views** (saved searches/filters) | ❌ | ❌ | ✅ device-local |
| Saved conflicts view | ✅ | ✅ | ✅ conflict copies + keep/discard |
| Command palette | ❌ | ❌ | ✅ Ctrl+K (notes, actions, navigation) |
| Full-text search | ✅ | ✅ | ✅ debounced, unlock-aware |
| Sorting (updated/created/title, asc/desc) | ✅ | ✅ | ✅ |

## 3. Security & privacy

| Capability | SN Free | SN Productivity | NexNotes |
|---|---|---|---|
| E2E encryption (AES-256-GCM, PBKDF2) | ✅ | ✅ | ✅ WebCrypto, on-device key |
| Per-note password protection | ❌ | ✅ | ✅ nxlock ciphertext + session unlock |
| Account 2FA (TOTP) | ✅ | ✅ | ✅ + single-use backup codes (bcrypt-hashed) |
| Login rate limiting on 2FA | ✅ | ✅ | ✅ 10 attempts / 10 min / email |
| Encrypted file attachments | ❌ | ✅ | ✅ E2E-encryptable file library |
| Note history / revisions | ❌ | ✅ | ✅ auto snapshots + restore (server-side, ciphertext-safe) |
| Hash-only API tokens | ✅ | ✅ | ✅ SHA-256, prefix display, revocable |
| Sandboxed HTML rendering | ❌ | ❌ | ✅ iframe without `allow-scripts` |
| XSS-sanitized markdown | ✅ | ✅ | ✅ GitHub schema |

## 4. Sync, offline & deployment

| Capability | SN Free | SN Productivity | NexNotes |
|---|---|---|---|
| Local-first (works fully offline) | ❌ (web) | ✅ | ✅ IndexedDB + PWA service worker |
| Cross-device sync | ✅ | ✅ | ✅ push/pull LWW + conflict copies + tombstones |
| Self-host server | ❌ | ❌ | ✅ one command (Docker / Node) |
| Multi-database | ❌ | ❌ | ✅ SQLite default · Neon/Postgres switchable |
| PWA install | ❌ | ✅ | ✅ manifest + icons + offline shell |
| Import from Standard Notes | — | — | ✅ decrypted .txt/.json backups, idempotent |
| Export JSON / Markdown / per-note | ❌ | ✅ | ✅ plaintext decrypt-on-export |
| **Daily auto-backup snapshots** | ❌ | ✅ (desktop) | ✅ IndexedDB, last 7, restore-in-place |
| Public share links (publishing) | ❌ | ✅ Listed (hosted) | ✅ self-hosted `/s/<token>`, noindex, revocable |
| REST API | ✅ | ✅ | ✅ `/api/v1/me`, `/api/v1/notes[...]` |
| Integrations vault (Discord/Telegram/GitHub/LLM/webhook) | ❌ | ❌ | ✅ device-local, E2E-encrypted at rest — [`API-KEYS.md`](API-KEYS.md) |
| Multi-instance (self-host) accounts | — | — | ✅ unlimited |

## 5. Appearance

| Capability | SN Free | SN Productivity | NexNotes |
|---|---|---|---|
| Light/dark mode | ✅ | ✅ | ✅ |
| Accent colors | ✅ (few) | ✅ | ✅ 8 accents |
| Full theme presets | ❌ | ✅ (Futura, Titanium…) | ✅ Nord, Solarized L, Rosé Pine, Gruvbox, Tokyo Night |
| Live statistics dashboard | ❌ | ❌ | ✅ animated counters (notes, words, streaks, storage) |
| Reading progress bar | ❌ | ❌ | ✅ |
| Zen mode | ❌ | ✅ | ✅ + split mode |

## 6. What Standard Notes has that NexNotes doesn't (yet)

Full transparency — no fake checkmarks:

- Native mobile/desktop apps (NexNotes is installable as a PWA today; wrappers welcome)
- Listed's hosted blog domains (NexNotes share links are self-hosted instead)
- Extension marketplace / third-party editors (NexNotes editors are built-in)
- File versioning (note revisions exist; file history is on the roadmap)

See [`PLAN.md`](../PLAN.md) for the running roadmap.


## v2.1 — Prism code experience (2026-11-01)

| Feature | Where |
|---|---|
| Prism syntax highlighting (self-hosted, no CDN) | markdown fences · code notes · print · share pages |
| 40+ languages incl. **Prisma schema** grammar | fence tag or code-note language picker |
| Copy button, line-number toggle, word-wrap toggle | every code block header |
| Light/dark highlight themes (oneLight / oneDark) | follows the app theme automatically |
| Auto-detection of unlabeled code | 20+ heuristics (prisma, ts, py, bash, sql, go, rust…) |
| Tab / Shift+Tab indent & dedent | code & HTML note editors |
| Find & Replace (+ Replace All) | editor find bar (Ctrl+F) |
| Insert templates (journal · meeting · bug · review · README) | note ⋯ menu |
| Export note as standalone styled HTML | note ⋯ menu → Export |
| Spelling check toggle | Settings → Appearance |

Privacy notes: highlighting runs fully client-side from bundled grammars — no CDN, no telemetry.
Code-note language choices live in `localStorage` (`nx-codelangs`) and never leave the device.
