# Self-hosting NexNotes

NexNotes ships as a single Node/Bun app (web + API + auth) with a switchable database layer.
Default is **SQLite** (zero config). Neon / any Postgres is one command away.

## 1. Docker Compose (recommended)

```bash
git clone https://github.com/SudhirDevOps1/NexNotes.git
cd NexNotes

# set a strong session secret
export AUTH_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"

docker compose up -d --build
# → http://localhost:3000
```

Data lives in the `nexnotes_data` volume (SQLite at `/app/db/custom.db`). Back it up like any file.

## 2. Node / Bun directly

```bash
bun install                 # or: npm install
bunx prisma db push         # creates ./db/custom.db
bun run build               # standalone production build
bun run start               # serves on :3000
```

For a permanent service:

```bash
# systemd unit (excerpt)
[Service]
WorkingDirectory=/opt/NexNotes
ExecStart=/usr/bin/bun .next/standalone/server.js
Environment=NODE_ENV=production AUTH_SECRET=<long-random> DATABASE_URL=file:/opt/NexNotes/db/custom.db
Restart=always
User=nexnotes
```

## 3. Neon Postgres (or any Postgres)

```bash
node scripts/db-switch.mjs postgres "postgresql://user:pass@ep-cool-name.neon.tech/nexnotes?sslmode=require"
bunx prisma db push
bun run dev        # or rebuild for production
```

`scripts/db-switch.mjs` rewrites `prisma/schema.prisma` (provider + url) and your `.env`.
To go back to SQLite: `node scripts/db-switch.mjs sqlite`.

Neon notes:
- use the **pooled** connection string for the app; the script sets `DIRECT_URL` (direct) for `db push`
- existing SQLite data doesn't migrate automatically — use Settings → Export JSON, switch, Import JSON

## 4. Reverse proxy (HTTPS)

Any proxy works. Minimum: forward `/*` to `http://127.0.0.1:3000`.

```nginx
server {
  server_name notes.example.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;   # needed for Secure cookies
  }
}
```

Caddy: `notes.example.com { reverse_proxy 127.0.0.1:3000 }`

## 5. Environment variables

| Var | Required | Default | Meaning |
|---|---|---|---|
| `DATABASE_URL` | ✅ | `file:./db/custom.db` | SQLite file or Postgres URL |
| `AUTH_SECRET` | ⚠️ prod | dev fallback | JWT signing secret — **set it in production** |
| `DIRECT_URL` | ❌ | — | non-pooled URL for migrations (Neon) |
| `PORT` | ❌ | `3000` | server port |

## 6. Accounts

Registration is open on self-hosted instances (rate-limited). Create your account from the UI,
then optionally disable signups behind your proxy if the instance is private.

Demo credentials seeded for evaluation: `demo@nexnotes.app` / `NexNotes@2026`
(a second account `test2fa@nexnotes.app` / `Test2FA@2026` has **2FA enabled** for testing —
its TOTP secret is printed in the release notes you are reading this from; delete both after eval.)

## 7. Backups

- **App-level:** Settings → Data → daily auto-backup (device-local) or Export JSON (plaintext).
- **Server-level:** stop the container and copy the volume, or for Postgres use `pg_dump`.
- The 30-day trash purge runs on sync — old snapshots in `NoteHistory` are kept unless notes are hard-deleted.

## 8. Updating

```bash
git pull
docker compose up -d --build
# schema changes (if any): bunx prisma db push
```
