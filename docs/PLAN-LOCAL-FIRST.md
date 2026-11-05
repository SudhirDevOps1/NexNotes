# Local-first everywhere — plan (Standard-Notes model)

**Date:** 2026-11-05 · **Status:** Phase 1 shipping in this release · **Owner:** repo maintainers

## Goal

NexNotes must behave like Standard Notes: the app on your device is the primary
copy and works fully offline; syncing to a server is a background bonus that
turns itself on only when a server is reachable; and the server half must deploy
anywhere — plain SQLite on a laptop, Postgres on Vercel/Neon — without code
changes.

## What already ships (audited 2026-11-05)

| Capability | State |
|---|---|
| Local database per device (IndexedDB) | ✅ source of truth for the UI; boots from cache before any network call |
| Offline edits queue | ✅ every mutation writes locally first (`dirty` flag), push is debounced; failures keep the queue intact |
| Reconnect flush | ✅ `online` browser event → `setOnline(true)` → immediate sync; sidebar chip shows "Offline — changes queued" / "Synced" |
| Sync protocol | ✅ `POST /api/sync` — push dirty upserts + tombstones, pull `since` cursor; last-write-wins with conflict copies (`conflictOf`), per-note history (25 versions), 30-day tombstone/trash housekeeping |
| E2E before sync | ✅ AES-256-GCM client-side; the server only ever stores `nxenc:v1` ciphertext or plaintext the user chose not to encrypt |
| PWA offline shell | ✅ `public/sw.js` caches the shell + `_next` assets; production reload with the server down still opens the app |
| SQLite default | ✅ zero-config `file:./db/custom.db` |
| Postgres/Neon switch | ⚠️ `scripts/db-switch.mjs` exists but see gaps 3–5 |

## Gaps found in this audit (each with its real-world symptom)

1. **Boot locked users out when the server was down but Wi-Fi up.**
   `boot()` fell back to the cached session only when `navigator.onLine` was
   `false`. That flag stays `true` on any network with an unreachable server
   (stopped dev server, sleeping Vercel instance) → `/api/auth/me` threw → the
   user landed on the login screen with every cached note hidden. A server we
   cannot *reach* is not a session that is *dead*: boot now continues offline on
   network failure and only a definitive 401 signs the user out.
2. **"Failed to fetch" on the login card.** With the server stopped, sign-in /
   sign-up surfaced the browser's raw TypeError. Both now raise a human message
   ("Can't reach the server — …").
3. **`prisma/schema.postgres.prisma` had drifted.** It still declared a required
   `name` column the active schema dropped years ago — switching to Postgres
   produced a `User` table the register route cannot insert into
   (`Invalid prisma.user.create()`). Regenerated from the active schema and
   pinned by a parity unit test so it cannot rot silently again
   (`npm run db:mirror` re-syncs it after schema edits).
4. **Postgres deploys needed hand-editing the schema.** Prisma's provider is a
   compile-time constant, so a Vercel build with `DATABASE_URL=postgres://…`
   still generated the SQLite client. `scripts/pick-schema.mjs` now selects the
   schema from `DB_SCHEMA` / `DATABASE_URL` before `prisma generate` (wired into
   `postinstall` and `build`), so Postgres deploys are one environment variable.
   The Dockerfile's `--build-arg DB_SCHEMA=postgres` was documented but never
   actually read — wired through the same script.
5. **`db-switch.mjs` still carried `--accept-data-loss`.** The same footgun
   removed from `db:push` earlier lived on in the Postgres path, where a schema
   drift would silently wipe a live database. It now pushes safely and explains
   the explicit flag if Prisma refuses.
6. **A fresh install demanded a manual `npx prisma db push` (2026-11-05, fixed
   same day).** The very first request against an empty database answered 503
   "schema is out of date — run `npx prisma db push`" — the one step the
   zero-config promise still required. Every build now ships an idempotent DDL
   snapshot (`npm run db:ddl` → `prisma/db-init.<driver>.sql`, parity-pinned);
   `src/lib/db-bootstrap.ts` replays it when the schema is missing and retries
   the request (login/register/verify-password/me/health all wired). Missing
   `DATABASE_URL` now defaults to `file:./db/custom.db` with its folder
   auto-created, so a bare `npm run dev` (or Docker/desktop first boot) needs
   nothing at all. Enterprise escape hatch: `NEXNOTES_AUTO_MIGRATE=0` reverts
   to controlled migrations; the E2E gate no longer runs `db push`, making CI
   itself prove the self-heal on every commit.

## Deploy matrix after Phase 1

| Target | Database | What you do |
|---|---|---|
| Laptop / dev | SQLite | `npm run dev` — nothing else |
| Self-host (Docker / VPS) | SQLite (volume) | `docker compose up` |
| Self-host with Postgres | Neon/Postgres | `node scripts/db-switch.mjs postgres "<url>"` once, then deploy |
| Vercel | Neon Postgres | import repo, set `DATABASE_URL` + `AUTH_SECRET` — schema picked at build |
| Cloudflare Pages | — | front-of-shell only today; the API routes need a Node/Prisma runtime (see Phase 2) — documented, not faked |

## Phases

### Phase 1 — this release (gaps 1–5)
Acceptance: offline reload keeps you signed in with notes editable and queued;
login with a stopped server shows a readable message; a fresh Postgres
deployment passes register/login/sync without touching any schema file; unit
tests pin boot-continuation, friendly network errors and schema parity.

### Phase 2 — edge + desktop runtime
- Cloudflare Workers support via Prisma driver adapters (`@prisma/adapter-neon`)
  behind a build flag; Hyperdrive for pooled connections.
- Electron shell that boots from local files even before first launch of a
  server, so the desktop app is offline-proof from first click.
- Per-device sync tokens (revoke one device without killing the rest).

### Phase 3 — collaboration-grade sync
- Live multi-device push (SSE) so changes appear without polling.
- Field-level merge for concurrent edits inside one note (today: safe conflict
  copies the user resolves by hand).

## Non-goals

- No account-less local mode yet — a cached signed-in session already covers
  the offline journey, and dropping auth would fork the sync protocol.
- No third-party sync servers — the server you point at is yours.
