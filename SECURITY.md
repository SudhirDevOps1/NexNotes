# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 2.0.x | ✅ |
| < 2.0 | ❌ (upgrade — migration is just Settings → Export/Import) |

## Reporting a vulnerability

**Please do not report exploitable issues through public GitHub issues.**

1. Use GitHub's **"Report a vulnerability"** (Security → Advisories → New draft advisory), or
2. Open a issue titled `[security] …` with details withheld and the author will DM you a private channel.

Include: affected version/commit, deployment type (Docker/Node), reproduction steps, impact assessment.
You'll get an acknowledgement within 72 hours and a fix timeline within 7 days. Credit given in the
release notes unless you prefer otherwise.

## Hardening checklist for self-hosters

- [ ] Set a unique 32+ byte `AUTH_SECRET`
- [ ] Serve over HTTPS (proxy must send `X-Forwarded-Proto`)
- [ ] Keep the instance private (VPN / firewall / SSO in front) if multi-user
- [ ] Enable E2E encryption per account (Settings → Security) — the server then stores only ciphertext
- [ ] Enable account 2FA (Settings → Security) and store backup codes offline
- [ ] Back up the DB volume regularly
- [ ] Update: `git pull && docker compose up -d --build`

## Known trade-offs (documented, not vulnerabilities)

- TOTP secrets are stored on the (self-hosted) server — required for server-side verification.
- The 2FA rate-limit bucket is in-memory and resets on restart.
- Files ≤ 3 MB are transported as base64 JSON (SSE/chunked upload is on the roadmap).
