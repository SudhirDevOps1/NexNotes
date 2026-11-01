# Privacy — what NexNotes does and doesn't do

NexNotes is built on a simple contract: **your notes are yours**. This page is the complete,
honest list — no legalese.

## We never do

- ❌ No telemetry, analytics, or crash reporting
- ❌ No third-party scripts, fonts-from-CDN, or trackers
- ❌ No advertising identifiers, fingerprints, or session recording
- ❌ No reading the content of your notes for "AI features"
- ❌ No selling or sharing data — there is no one to sell it to; the server is yours

## Where data lives

| Data | Browser (device) | Server | Encrypted at rest (server) |
|---|---|---|---|
| Notes (E2E **off**) | IndexedDB | Postgres/SQLite | ❌ plaintext |
| Notes (E2E **on**) | ciphertext + session key in memory | Postgres/SQLite | ✅ AES-256-GCM ciphertext only |
| Note-protected notes (`nxlock`) | ciphertext + session unlock | ciphertext | ✅ double-locked |
| Files | IndexedDB cache | DB (base64) | ✅ when E2E on |
| Account password | never leaves the device in plaintext | bcrypt hash (cost 10) | n/a (hashed) |
| 2FA secret | in your authenticator app | DB column (self-hosted instance) | instance-protected |
| 2FA backup codes | paper/manager | bcrypt hashes only | n/a (hashed) |
| API tokens | shown once in UI | SHA-256 hashes only | n/a (hashed) |
| Integration keys (Discord etc.) | **device-local only, never synced** | ❌ never uploaded | AES-GCM locally when E2E on |
| Smart views, theme, prefs | localStorage | ❌ | n/a |
| Auto-backup snapshots | IndexedDB (`nexnotes-backups`) | ❌ never uploaded | device-protected |

## Encryption details

- **E2E vault:** PBKDF2-SHA256 (310,000 iterations) → AES-256-GCM per note.
  The key is serialized to IndexedDB only when you choose "remember"; otherwise you unlock per session.
- **Note protection:** independent per-note key (PBKDF2 over note id + password); server only ever
  sees `nxlock:v1` ciphertext, and history snapshots inherit it.
- **TOTP:** RFC 6238, SHA-1, 30 s step — verified server-side on login; codes never logged.
- **HTML notes:** rendered in a sandboxed iframe **without** `allow-scripts`; markdown HTML passes
  rehype-sanitize (GitHub schema: no `<script>`, no event handlers, no `javascript:` URLs).

## Network traffic

The app talks to exactly one host — your own instance:
`/api/auth/*`, `/api/sync`, `/api/files*`, `/api/history/*`, `/api/tokens*`, `/api/notes/:id/share`,
`/api/health`. Integration "Test"/"Send to Discord" calls go directly to the webhook URL **you**
configured from your browser. Nothing else is contacted.

## Public share links

Off by default. When enabled: random 128-bit token, `noindex, nofollow`, no JS, revocable in one click.
Locked and E2E-encrypted notes **cannot** be shared (the server has no plaintext to serve).

## Self-verification

Open DevTools → Network and watch. Everything above is checkable in five minutes — we encourage it.
