# Security architecture

This document explains NexNotes' security model for reviewers, auditors and the curious.
Threat model: hostile network, shared/self-hosted server, other browser tabs — never your own device.

## 1. Accounts & sessions

- Passwords: **bcrypt** (cost 10), verified server-side; never stored or logged in plaintext.
- Sessions: JWT (HS256, `jose`) in an **httpOnly, SameSite=Lax, Secure(when HTTPS)** cookie, 30-day TTL.
  Secret via `AUTH_SECRET` — set a 32+ byte random value in production.
- 2FA: TOTP (RFC 6238, ±1 window). Setup stores a pending secret; activation requires a live code and
  returns 8 single-use backup codes (bcrypt-hashed, consumed on use). Login attempts are rate-limited
  (10 failures / 10 min / email, in-memory bucket).
- Account deletion cascades all rows (notes, files, tags, tokens, history, tombstones).

## 2. Encryption layers

| Layer | Primitive | Key material | Where verified |
|---|---|---|---|
| E2E note vault | AES-256-GCM | PBKDF2-SHA256 (310k it) over account password | browser (WebCrypto) |
| Note protection | AES-256-GCM | PBKDF2 over `noteId + note-password` | browser |
| Files | same vault key | browser | |
| Integration keys | AES-GCM with vault key (optional) | browser (device-local storage) |
| Session | JWT HS256 | `AUTH_SECRET` | server |
| API tokens | SHA-256 (hash-only storage) | — | server |
| Passwords / backup codes | bcrypt | — | server |

Server-side plaintext never exists for E2E/locked notes; history snapshots store whatever bytes the
client pushed (ciphertext-safe by design).

## 3. Input handling (XSS posture)

- Markdown preview pipeline: `react-markdown → remark-gfm, remark-math → rehype-raw →
  rehype-sanitize (GitHub schema) → rehype-katex`. Script tags, event handlers, `javascript:` URLs
  and iframes are stripped. KaTeX runs **after** sanitization so its output is never mangled.
- Full-HTML notes render inside `<iframe sandbox="allow-popups allow-popups-to-escape-sandbox">`
  — **no** `allow-scripts`, so embedded JS cannot run.
- Public share pages use the same sanitized pipeline server-side and send `robots: noindex, nofollow`.
- All API input validated with **zod**; sync note types whitelisted; `localStorage` JSON parsing wrapped.

## 4. API & authorization

- Session routes: cookie → `getSessionUserId()` → row-level `userId` scoping on **every** Prisma query.
- `/api/v1/*`: bearer token → SHA-256 lookup → `userId` scoping identical to session routes.
- Tokens: prefix stored for display, raw shown once, revocation instant, `lastUsedAt` stamped.
- Share tokens: 128-bit `crypto.randomBytes`; trashed/locked/encrypted notes are never served;
  disable deletes the page instantly.
- Uploads: 3 MB cap, base64 transport (or ciphertext), MIME recorded but never executed — files
  download as attachments.

## 5. Rate limits & abuse

- 2FA: 10/min/email (in-memory; add Redis/edge limits if you expose NexNotes publicly at scale).
- Body size caps: 2 MB JSON routes; 3 MB per file.
- Self-hosted instances can sit behind Cloudflare/Authelia/mTLS without changes.

## 6. Supply chain & repo hygiene

- Lockfile-pinned deps (`bun.lock`); CI runs lint + `tsc --noEmit` + build + smoke test on every PR.
- `.gitignore` is a deny-all whitelist: no `.env`, no databases, no sandbox artifacts can ever be committed.
- `.env.example` documents every variable; no secrets exist in the repo.

## 7. Reporting

See [`SECURITY.md`](../SECURITY.md). Please do not open public issues for exploitable findings.
