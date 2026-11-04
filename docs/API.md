# NexNotes REST API v1

Base URL: `http(s)://<your-instance>/api/v1`
Auth: `Authorization: Bearer nx_…` — personal tokens from **Settings → API access**.
Tokens are shown **once** at creation; the server stores only the SHA-256 hash. Revoke anytime.

> With account E2E encryption enabled, `content` fields return ciphertext (`nxenc:v1…`) by design —
> zero-knowledge. Disable E2E for plaintext API access.

## Endpoints

### `GET /api/v1/me`
Account info + live stats.

```bash
curl -H "Authorization: Bearer nx_xxxx" https://your-host/api/v1/me
```

```json
{
  "user": { "id": "…", "email": "demo@nexnotes.app", "encryptionEnabled": false, "createdAt": "…" },
  "stats": { "notes": 24, "files": 2 },
  "token": { "name": "obsidian", "prefix": "nx_a1b2c3d4" }
}
```

### `GET /api/v1/notes?q=&limit=&trash=1&archive=1`
List / search notes.

| Param | Default | Meaning |
|---|---|---|
| `q` | — | substring match on title + content |
| `limit` | `50` (max `200`) | page size |
| `trash` | `0` | `1` → trashed notes |
| `archive` | `0` | `1` → archived notes |

### `POST /api/v1/notes`
Create a note.

```bash
curl -X POST -H "Authorization: Bearer nx_xxxx" -H "Content-Type: application/json" \
  -d '{"title":"From curl","content":"**hello** API","noteType":"markdown","starred":true}' \
  https://your-host/api/v1/notes
```

`noteType` ∈ `markdown · richtext · plain · task · checklist · code · spreadsheet · authenticator · html`

### `GET /api/v1/notes/:id`
Fetch one note (404 if not yours).

### `PATCH /api/v1/notes/:id`
Partial update — any of `title, content, noteType, folderId, starred, pinned, archived, preventEdit, editorWidth`.

### `DELETE /api/v1/notes/:id`
Move to trash. Add `?hard=1` to purge permanently.

## Session-cookie endpoints (used by the web app)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | `{email, password}` → account + JWT cookie |
| POST | `/api/auth/login` | `{email, password[, code]}` → 30-day session; `{"twoFactorRequired":true}` when 2FA is on |
| POST | `/api/auth/logout` | clear cookie |
| GET | `/api/auth/me` | session user (incl. `twofaEnabled`) |
| POST | `/api/auth/change-password` | rotate password, re-encrypt cache |
| POST | `/api/auth/delete-account` | wipe everything |
| POST | `/api/auth/2fa/setup` | `{password}` → `{secret, otpauthUri}` (pending) |
| POST | `/api/auth/2fa/enable` | `{code}` → `{backupCodes:[…]}` (shown once) |
| POST | `/api/auth/2fa/disable` | `{password, code}` |
| GET/POST | `/api/sync` | delta push/pull (`SyncRequest`/`SyncResponse` in `src/lib/types.ts`) |
| GET/POST | `/api/files`, GET/DELETE `/api/files/:id` | attachment library (base64 or E2E ciphertext) |
| GET | `/api/history/:noteId` | version snapshots |
| GET/POST/DELETE | `/api/tokens` | personal API tokens |
| POST | `/api/user/verify-password` | `{password}` → `{ok}` — bcrypt check the E2E vault flows call before deriving a key (enable / unlock / disable) |
| GET | `/api/health` | `{ok, driver, counts, version}` |
| POST | `/api/notes/:id/share` | `{enabled}` → `{path:"/s/<token>"}` (public read-only page) |

## Obsidian-style integrations

Third-party keys (Discord webhook, Telegram bot, GitHub PAT, LLM endpoints, custom webhooks)
live in **Settings → Integrations**. They are stored **device-local only** (never synced),
AES-256-GCM encrypted when E2E is on, and each has a ▶ Test button.
The note menu's **Send to Discord…** posts the current note (2000-char safe).

## Rate limits

- 2FA verification: 10 failed attempts / 10 min / email (in-memory, self-host friendly)
- Body limits: 2 MB JSON (notes), 3 MB per file upload
