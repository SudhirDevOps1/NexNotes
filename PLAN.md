# NexNotes v2.0 — "All Premium Tools Free" — Implementation Plan (plan-first, execute-after)

**Date:** 2026-11-01 · **App:** clean-room NexNotes (Next.js 16 + React 19 + Tailwind 4 + Prisma: SQLite default, Neon/Postgres switchable)
**Rule:** ADDITIVE ONLY — nothing existing is removed. Everything privacy-first & local-first.
**Target repo:** `https://github.com/SudhirDevOps1/NexNotes.git` (clean conventional commits, full docs, GitHub Actions, Docker)

---

## 0. Research summary (what Standard Notes charges for → we give free)

Verified against live sources (standardnotes.com help/pricing pages, G2, community):

| Standard Notes (paid tier) | NexNotes status |
|---|---|
| Super notes (markdown, syntax highlighting, tables, embeds, links) | ✅ v1.3 (markdown + code highlight + GFM tables) → **v2.0 adds wiki-links `[[…]]` + backlinks + KaTeX math** |
| All editors (Rich Text, Markdown Pro, Spreadsheets, Code, Tasks, Checklist, Authenticator) | ✅ v1.3 (task, checklist, code, spreadsheet, authenticator, html) → **v2.0 adds a true WYSIWYG Rich Text editor** (mdxeditor) |
| Note history / revisions | ✅ v1.3 |
| Protected notes (per-note password) | ✅ v1.3 (nxlock ciphertext) |
| Encrypted attachments | ✅ v1.3 (files pane, E2E-encryptable) |
| Themes + custom accent | ✅ v1.3 (8 accents + fonts) → **v2.0 adds full theme presets: Nord, Solarized Light/Dark, Rosé Pine, Gruvbox, Tokyo Night** |
| Two-factor authentication (login) | ❌ → **v2.0: TOTP 2FA with backup codes (RFC 6238, server-verified)** |
| Automatic backups | ❌ → **v2.0: daily local auto-backup snapshots (IndexedDB, last 7) + one-click download/restore** |
| Offline access on web | ✅ v1.3 (PWA + IndexedDB local-first) |
| Listed publishing | ❌ → **v2.0: self-hosted read-only share links (`/s/token`, revocable, noindex, privacy opt-in)** |
| Smart views / saved filters | ❌ → **v2.0: Smart Views (saved query + filters, device-local)** |
| Batch operations | ❌ → **v2.0: multi-select → tag / move / trash / restore / export / merge** |
| REST API | ✅ v1.3 (`/api/v1/*` bearer tokens) — kept, documented |
| Integrations (Obsidian-style key vault) | ✅ v1.3 (Discord/Telegram/GitHub/webhook, device-local encrypted) |
| Import from Standard Notes | ✅ v1.3 |
| E2E encryption (zero-knowledge sync) | ✅ v1.3 (WebCrypto AES-GCM) |

## 1. v2.0 work items

### A. Account 2FA (TOTP login) — SN-parity, free
- `src/lib/totp.ts` (server): RFC 6238 via node:crypto, base32 decode, ±1 window, backup codes (hashed).
- Prisma `User`: `twofaSecret String?`, `twofaEnabled Boolean @default(false)`, `twofaBackupHash String?`. Mirror in `schema.postgres.prisma` + `scripts/db-switch.mjs`.
- API: `POST /api/auth/2fa/setup` (secret + otpauth URI), `POST /api/auth/2fa/enable` (verify → returns backup codes once), `POST /api/auth/2fa/disable` (password + code).
- `POST /api/auth/login`: when enabled and no `code` → `{ twoFactorRequired: true }`; client collects 6-digit or backup code.
- UI: auth-screen 2-step login; Settings → Security card (enable/disable, backup codes shown once).

### B. Public share links (Listed-style, self-hosted)
- Prisma `Note`: `shareToken String? @unique`, `shareEnabled Boolean @default(false)`.
- API: `POST /api/notes/[id]/share` `{enabled:boolean}` → returns `…/s/<token>`; DELETE semantics via `enabled:false`.
- Public page `src/app/s/[token]/page.tsx`: read-only, sanitized render (markdown → rehype-sanitize; html-type → sandboxed iframe, scripts off), `noindex` meta, no analytics, no JS tracking.
- Note menu: “Share” submenu (enable/copy/revoke). Off by default.

### C. Batch operations
- Store: `selection: string[]`, `selectionMode`, `toggleSelect`, `selectAll`, `clearSelection`, `batchTrash`, `batchRestore`, `batchTag`, `batchMove`, `batchMerge`, `batchExport`.
- Note list: selection toggle button; hover checkboxes; selection action bar (with counts + live digits style).
- Merge: concatenates selected notes (oldest→newest) into the first, others trashed.

### D. Smart Views (saved searches)
- Store: `smartViews: {id,title,query,type?,starredOnly?,tagId?,folderId?}[]` (device-local, localStorage, per-account), ViewKind += `"smart"`.
- Sidebar section + create/edit/delete; list respects the saved filter.

### E. Wiki-links + backlinks (Super-grade)
- Preview: `[[Note Title]]` → clickable links (navigate or create); in markdown + task/checklist previews.
- Editor: `[[` triggers an autocomplete dropdown of note titles.
- Backlinks panel in editor: “X notes link here”.

### F. Math (KaTeX)
- Markdown pipeline: `remark-math` + `rehype-katex` (+ katex CSS). `$inline$` and `$$block$$`.
- Graceful: if deps unavailable, plain text shows (additive).

### G. Rich Text editor (WYSIWYG)
- NoteType += `"richtext"`; content stored as markdown (interop with everything).
- `@mdxeditor/editor` (already in deps) behind `dynamic(..., { ssr:false })`; toolbar (bold/italic/lists/links/code/quotes); dark-mode aware.
- Sync whitelist + v1 API accept `richtext`.

### H. Theme presets
- `src/lib/themes.ts`: full palettes (Nord, Solarized Light/Dark, Rosé Pine, Gruvbox, Tokyo Night) applied via CSS vars (light+dark pairs), persisted device-local; Settings → Appearance grid.

### I. Auto-backup (local, privacy-first)
- `src/lib/backup.ts`: snapshot = all notes+tags+folders+files metadata decrypted client-side → JSON in IndexedDB (`backups` store, keep last 7); daily schedule while app is open; manual “Download backup” / “Restore from snapshot” in Settings → Data.

### J. Version bump + seeds
- Health `/api/health` → `2.0.0`; About updated; idempotent seed top-up: “Welcome to NexNotes 2.0” note (feature tour + wiki-link + math demo).

### K. Production-grade repo (GitHub launch)
- Root: `README.md` (badges, comparison table, screenshots, quickstart, Docker, API links), `LICENSE` (AGPL-3.0), `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, `.env.example`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`, hardened `.gitignore` (deny-all whitelist — **removes `.env`, `db/`, `.zscripts/`, sandbox artifacts from tracking**; files stay on disk).
- `docs/`: `FEATURES.md` (incl. SN comparison), `API.md`, `SELF-HOSTING.md` (SQLite/Neon/Postgres), `PRIVACY.md`, `SECURITY-ARCHITECTURE.md`, `PLAN.md` (this plan), `screenshots/*`.
- `.github/workflows/`: `ci.yml` (bun install → lint → tsc → build + sqlite smoke test), `docker.yml` (build/push on tag), `release.yml` (zip artifacts + notes).
- `.github/ISSUE_TEMPLATE/`: bug + feature templates.
- Git: orphan-branch history rewrite into clean conventional commits, `origin` → SudhirDevOps1/NexNotes, `scripts/push-to-github.sh` helper.

## 2. Verification gate (must pass)
1. `bun run lint` + `npx tsc --noEmit` clean.
2. Headless browser (desktop + 390 px): login (incl. 2FA flow), batch select→merge, smart view create+use, share link roundtrip in fresh context, wiki-link + backlinks, math render, richtext editor, auto-backup snapshot, theme presets.
3. `curl /api/health` → `2.0.0`; `/api/v1/*` still 401/200 correctly.
4. Screenshots refreshed into `docs/screenshots/`.

---

# v2.1 — "Prism code experience" plan (2026-11-01, additive-only)

**User ask:** code syntax highlighting via Prism ("code ka syntax highlight prism se"), more code
tooling, more features — nothing removed.

### A. Prism syntax highlighting (everywhere code appears)
- Deps: `prism-react-renderer` (Prism engine, React-native, no CDN) + `prismjs` grammars
  (rust, csharp, java, kotlin, swift, php, ruby, dart, lua) + `prism-prisma` (`.prisma` schema).
- `src/lib/prism-langs.ts`: client-only registry — attaches extra grammars to the bundled Prism.
- `src/components/nexnotes/code-block.tsx`: shared `CodeBlock` —
  language badge, one-click copy, line-number toggle, word-wrap toggle, oneLight/oneDark theme
  that follows the app theme, `detectLang()` heuristic for unlabeled blocks.
- Wired into: markdown preview code fences (`Markdown` in editor.tsx), code-note preview,
  print document, and the public share page `/s/[token]` — all rendered through Prism now.

### B. Code-note upgrades
- Per-note language picker (40+ languages + Auto-detect) stored device-local
  (`localStorage nx-codelangs` — privacy-first, no server round-trip).
- Tab / Shift-Tab indent & dedent inside code notes; Tab in markdown notes continues to
  indent list lines.

### C. Find & Replace
- Find bar gains a replace row: Replace (current match) + Replace All, live match counter kept.

### D. Templates + HTML export
- Note menu → "Insert template": Daily journal, Meeting notes, Bug report, Code review, README.
- Note menu → Export: adds styled standalone **HTML** (rendered with the same sanitized
  Markdown pipeline, self-contained file, no external requests).

### E. Spelling toggle
- `EditorPrefs.spell` (default on) + Settings → Appearance switch; applies to all note textareas.

### F. Version + docs
- `/api/health` → 2.1.0; CHANGELOG entry; README + docs/FEATURES.md updated.
**Verification gate:** tsc clean, headless-browser pass (desktop + 390px) on code fence, code note,
find/replace, templates, share page; screenshots; conventional commit.

---

## 3. v2.1.1 — release train + desktop packaging (plan-first, 2026-11-01)

**Goal:** turn the 12-workflow pipeline into a real release train and make the
"desktop app" a set of actual shippable binaries built by GitHub CI/CD — nothing
fake, every artifact boot-tested before it reaches a release page.

### Work items
1. **Scroll bug** — notes list / files pane / history dialog used `flex-1`
   without `min-h-0`, so long lists stretched the shell and `overflow-clip`
   silently hid the tail. One-line class fix per pane; verified in a real
   browser (scrollTop 0 → 600 on the notes viewport).
2. **release-please end-to-end** — manifest 2.1.0, config with
   Features/Bug Fixes/Security/Performance sections, commitlint + husky guards
   locally, quality-gate before the release job, artifacts build from the
   exact created tag. CHANGELOG.md stays machine-generated.
3. **Desktop artifacts** (all built by `release.yml`):
   - `linux-x64.tar.gz` — portable, run.sh, boot-tested on the runner
   - `linux-x64.AppImage` — self-contained (bundled node), FUSE-less boot-tested
   - `windows-x64.zip` — portable, run.cmd, **bundled node.exe**, boot-tested on
     windows-latest
   - `windows-x64-setup.exe` — per-user NSIS installer, silent-installed and
     boot-tested in CI before upload
   - `SHA256SUMS.txt` for everything
4. **Fresh-machine fix** — packages ship a schema-initialized `db/nexnotes.db`
   (`prisma db push` at package time) because `generate` does not create
   tables; AppRun/nexnotes.cmd seed the per-user data dir from it.
5. **Windows engine parity** — `binaryTargets = ["native", "windows"]` so the
   Linux-built bundle also carries the Windows query engine.

### Verification gate
lint · tsc · vitest (20 tests) · tarball boot (fresh env) · AppImage FUSE-less
boot · zip/installer smoke on windows-latest · release PR merged → tag →
artifacts attached to the GitHub Release.
