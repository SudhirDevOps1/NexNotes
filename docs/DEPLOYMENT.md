# Deploying NexNotes

NexNotes is **local-first**: your notes live in the browser's IndexedDB the
moment you type them, and every feature works offline. The server is the
*optional* sync target — you choose where it runs. This guide covers every
supported way to run it.

| Target | Database | Status |
|---|---|---|
| Local dev (Node/Bun) | SQLite | ✅ default, zero-config |
| Desktop app (Electron) | SQLite | ✅ bundled, zero-config |
| Docker / any VPS | SQLite or Postgres | ✅ `docker compose up -d` |
| **Vercel** | **Postgres (Neon / Supabase)** | ✅ recommended serverless path |
| Any serverless (incl. Vercel) | SQLite | ❌ platform limitation — the app tells you honestly (HTTP 503) |
| Cloudflare Pages / Workers | any | ⚠️ experimental — see [Cloudflare](#cloudflare-pagesworkers-experimental) below |

## 1. Local (SQLite, zero-config)

```bash
git clone https://github.com/SudhirDevOps1/NexNotes.git
cd NexNotes
npm install            # or bun install
npm run dev            # http://localhost:3000 — that's all
```

There is no `db push` step any more: the database file **creates itself**. On
the first request the server notices the schema is missing and replays the
committed DDL snapshot (`prisma/db-init.sqlite.sql`) — the same
boot-self-heal pattern Gitea and Grafana use for self-hosted first runs.
`npm run db:push` still works whenever you want it explicitly.

No account is required to *keep* notes on the device — an account (any email)
is only what lets a second device (or the same browser after a wipe) pull the
data from your own server. Sync runs in the background whenever the server is
reachable; offline edits queue up and flush automatically on reconnect.

## 2. Vercel + Neon Postgres (recommended serverless path)

Serverless filesystems are ephemeral, so the serverless path uses Postgres.
With [Neon](https://neon.tech) (free tier is enough):

1. Create a Neon project → copy the **pooled** connection string
   (`postgresql://…neon.tech/neondb?sslmode=require`).
2. Push this repo to GitHub → in Vercel, **New Project → Import**.
3. Environment variables (Project → Settings → Environment Variables):
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the Neon **pooled** URL |
   | `AUTH_SECRET` | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
   | `DIRECT_URL` *(optional)* | the Neon **direct** URL — used by CLI migrations |
4. Deploy. On install, `postinstall` runs `scripts/pick-schema.mjs`, which
   sees the Postgres `DATABASE_URL` and switches the datasource before the
   client is generated — **no schema editing, no manual driver switch**.
5. **No table-creation step.** On the first request against an empty Neon
   database the server applies the committed Postgres DDL snapshot
   (`prisma/db-init.postgres.sql`) and retries — you can still run
   `DATABASE_URL="<neon-url>" npx prisma db push` by hand if you prefer a
   controlled first migration.

Demo login (`demo@nexnotes.app` / `NexNotes@2026`) self-heals on a fresh
database — the first demo sign-in attempt seeds the demo account.

> **Why not SQLite on Vercel?** Serverless instances get a read-only or
> throwaway filesystem; a SQLite file written there disappears with the next
> invocation. Older builds answered that with a misleading
> *"Could not create the account. Try again."* — current builds detect the
> failure and return the actual cause (HTTP 503 with a fix-it hint).

### Migrating local notes to a deployed server

In the local app: **Settings → Data → Export JSON**, then on the deployed
app: **Settings → Data → Import JSON**. (SQLite→Postgres server-side copies
are not auto-migrated on purpose — E2E-encrypted notes can be moved by any
logged-in client.)

## 3. Docker / VPS (SQLite or Postgres)

```bash
docker compose up -d --build      # SQLite, data in the nexnotes_data volume
```

For Postgres, build the image for it and run it with the same URL (the
Prisma client is provider-bound at generate time — build-time and run-time
URLs must match):

```bash
docker build -t nexnotes --build-arg DB_SCHEMA=postgres .
docker run -p 3000:3000 -e DATABASE_URL="postgresql://user:pass@host/db?sslmode=require" \
  -e AUTH_SECRET="<long-random>" nexnotes
```

Both containers self-create their schema on first boot — no `db push` step.
Reverse-proxy setup (nginx/Caddy, HTTPS) and the full env-var table:
[`docs/SELF-HOSTING.md`](SELF-HOSTING.md).

## 4. Cloudflare Pages/Workers (experimental)

Honest status: **not supported natively yet.** Two blockers:

- Prisma's query engine is a native binary and does not execute in the
  Workers runtime (`workerd`).
- Next.js API routes on Pages need an edge-compatible build of the whole app.

The tracked path (see `PLAN.md` §5.5) is Prisma **driver adapters**
(`@prisma/adapter-neon` over Neon's HTTP driver — no native engine) behind
OpenNext. Until that ships, the working setups are:

1. **Recommended:** run the app on Vercel / Docker / any Node host and put
   Cloudflare in front as DNS + CDN proxy. Same URL, zero app changes.
2. Wait for the adapter build (tracked in the plan) if you specifically want
   compute on Workers.

## 5. Environment variables

| Variable | Required | Default | Meaning |
|---|---|---|---|
| `DATABASE_URL` | ❌ | `file:./db/custom.db` | SQLite file or Postgres URL — `scripts/pick-schema.mjs` switches the datasource to match it at install/build time; when unset the app defaults to local SQLite |
| `AUTH_SECRET` | ⚠️ prod | dev fallback | JWT session signing secret — always set in production |
| `DIRECT_URL` | ❌ | — | non-pooled URL for migrations on Neon |
| `NEXNOTES_AUTO_MIGRATE` | ❌ | `1` | set `0` to disable the boot-time schema self-heal (controlled-migration environments run `npx prisma migrate deploy` from a release pipeline instead) |
| `PORT` | ❌ | `3000` | server port |

## 6. Health check & troubleshooting

`GET /api/health` reports `{ ok, dbReady, driver, counts, version }` — the
same driver label surfaces in **Settings → About**.

| Symptom | Meaning / fix |
|---|---|
| 503 "Cannot reach the database" | `DATABASE_URL` wrong or DB down — check host/firewall |
| 503 "…has no tables yet" | the schema self-heal is disabled (`NEXNOTES_AUTO_MIGRATE=0`) and the database was never pushed — run `npx prisma db push` once against that URL |
| 503 "read-only filesystem" | SQLite on serverless — switch to Postgres (§2) |
| Register works, login says "No account found" | different database than you registered on — check `DATABASE_URL` |

## 7. How the zero-config first boot works (and when to turn it off)

Every build ships a full-schema DDL snapshot (`prisma/db-init.<driver>.sql`,
regenerated by `npm run db:ddl` and pinned by `tests/unit/ddl-parity.test.ts`).
When a request hits an empty database (`P2021`/`P2022`/`P1003`, or the raw
engine's "no such table / relation does not exist"), `src/lib/db-bootstrap.ts`:

1. runs the snapshot made idempotent (`CREATE … IF NOT EXISTS`; Postgres
   foreign-key adds are wrapped in `duplicate_object`-swallowing `DO` blocks),
2. re-probes the schema, and
3. retries the original request exactly once.

This is the standard **boot-time migration** pattern of self-hosted apps
(Gitea, Grafana, Portainer): first run just works, restarts are no-ops, and
racing serverless cold starts converge because every statement is idempotent.

The enterprise alternative is **release-time migration** — a CI/CD job runs
`npx prisma migrate deploy` against production before the new version goes
live (Prisma's own recommendation for controlled environments). NexNotes
supports both: set `NEXNOTES_AUTO_MIGRATE=0` and keep the DDL self-heal off,
then manage schema changes from your pipeline. What boot-DDL deliberately does
NOT do is upgrade an *existing* schema (add columns, change types) — that is a
migration, and it stays with `prisma db push` / `migrate deploy` so an upgrade
can never guess at your data.
