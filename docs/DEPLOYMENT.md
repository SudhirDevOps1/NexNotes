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
npm run db:push        # creates ./db/custom.db (folder is created for you)
npm run dev            # http://localhost:3000
```

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
4. **Create the tables once** (a fresh database is empty). From your machine:
   ```bash
   DATABASE_URL="<neon-url>" npx prisma db push
   ```
5. Deploy. On install, `postinstall` runs `scripts/pick-schema.mjs`, which
   sees the Postgres `DATABASE_URL` and switches the datasource before the
   client is generated — **no schema editing, no manual driver switch**.

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

Then run `npx prisma db push` once against that URL (step 4 above).
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
| `DATABASE_URL` | ✅ | `file:./db/custom.db` | SQLite file or Postgres URL — `scripts/pick-schema.mjs` switches the datasource to match it at install/build time |
| `AUTH_SECRET` | ⚠️ prod | dev fallback | JWT session signing secret — always set in production |
| `DIRECT_URL` | ❌ | — | non-pooled URL for migrations on Neon |
| `PORT` | ❌ | `3000` | server port |

## 6. Health check & troubleshooting

`GET /api/health` reports `{ ok, dbReady, driver, counts, version }` — the
same driver label surfaces in **Settings → About**.

| Symptom | Meaning / fix |
|---|---|
| 503 "Cannot reach the database" | `DATABASE_URL` wrong or DB down — check host/firewall |
| 503 "…has no tables yet" | run `npx prisma db push` once against that URL |
| 503 "read-only filesystem" | SQLite on serverless — switch to Postgres (§2) |
| Register works, login says "No account found" | different database than you registered on — check `DATABASE_URL` |
