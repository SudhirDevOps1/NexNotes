# API keys — the BYOK vault ("Obsidian-style")

NexNotes never asks you to buy anything from us and never proxies your traffic.
When a feature needs a third-party credential — a Discord webhook, a Telegram bot
token, a GitHub token, an LLM API key — you bring **your own key** and it stays on
**your device**. This is the same model Obsidian plugins use for their settings.

There are two very different kinds of credentials in NexNotes. Don't mix them up:

| | **Integration keys (BYOK, inbound)** | **API tokens (outbound)** |
|---|---|---|
| Issued by | You get it from a third party (Discord, Telegram, GitHub, OpenAI…) | NexNotes generates it for you |
| Lives in | **This device only** — browser/Electron `localStorage`, never synced | Server DB — **SHA-256 hash only**, shown once |
| Used for | NexNotes calling OUT to services on your behalf | Other tools calling IN to your instance's REST API |
| Manage at | **Settings → Integrations** | **Settings → API access** (see [`API.md`](API.md)) |
| Format | `sk-…`, `ghp_…`, `123456:AAE…`, `https://discord.com/api/webhooks/…` | `nx_…` |

---

## 1. Where you get each key

Open **Settings → Integrations → Add integration**, pick a kind, paste the value, toggle it on:

| Kind | Where the value comes from | What NexNotes does with it today |
|---|---|---|
| **Discord Webhook** | Server Settings → Integrations → Webhooks → *New Webhook* → Copy URL | **Send note** from the note menu posts the note as a message; *Test* posts a ✅ message |
| **Telegram Bot Token** | Talk to [@BotFather](https://t.me/BotFather) → `/newbot` → copy the `123456:AAE…` token | *Test* calls `getMe` and reports the bot identity |
| **GitHub Token** | GitHub → Settings → Developer settings → **fine-grained PAT** (least scopes you need) | *Test* calls `/user` and shows the login it authenticates as |
| **LLM API Key** | Any OpenAI-compatible provider (OpenAI, Groq, OpenRouter, local Ollama…) — `sk-…` | *Test* calls `GET /v1/models` to prove the key works — see §4 for what's coming |
| **Generic Webhook** | Any endpoint you control that accepts `POST` JSON | *Test* POSTs `{source, event, time}` |
| **Custom** | Anything else | Stored + toggled; test reports "no endpoint to test" |

Every kind has an **enable/disable switch** — a disabled key is kept but never used
by outbound actions.

## 2. Storage and privacy guarantees (from the code, not marketing)

`src/lib/integrations.ts` enforces four rules:

1. **Device-local only.** Values are written to `localStorage` (`nx-integrations`)
   and are **never** synced to the NexNotes server — the sync protocol carries no
   integration data at all.
2. **Encrypted at rest when E2E is on.** With account end-to-end encryption
   enabled, values are AES-256-GCM encrypted with your account vault key before
   they touch storage (`encryptText`/`decryptText` from `src/lib/crypto.ts`).
3. **Outbound on explicit intent only.** Nothing phones out in the background.
   A network request happens **only** when you press *Test* or *Send note*.
4. **No server copy, no log.** The backend never sees the key, so it can't leak
   it, log it, or hand it over.

Desktop app behaves identically — Electron persists `localStorage` in your user
data directory on the same machine.

## 3. Using a key day-to-day

- **Share a note to Discord:** open a note → note menu → *Send to Discord*. The
  first **enabled** Discord webhook receives `**title**\nmarkdown` (trimmed to
  Discord's 2000-char limit).
- **Prove a key works:** Settings → Integrations → press the flask *Test* icon —
  each kind runs the cheapest possible read-only call against its provider and
  shows the provider's own response (`Authenticated as … ✓`, `Bot token valid ✓`).
- **Rotate:** delete the integration, paste the new value. The old value is gone
  from the device the moment you delete it — there is no server-side copy to
  clean up.

## 4. The LLM key — what it unlocks now vs. next

**Today (v0.0.3):** the LLM key is stored, E2E-encryptable, and validated against
`GET /v1/models` — the same "paste your key in the plugin settings" experience an
Obsidian AI plugin gives you.

**Next (planned):** client-side AI features that call your OpenAI-compatible
endpoint **directly from the browser** — summarize a note, generate tags, semantic
titles — under the same four guarantees above (your key, your provider, no proxy).
The design brief is being drafted with the EGM workflow
([`egm.dev`](https://egm.dev) — brainstorm → draft → Goldfish review) and will
land as an RFC in this directory before any code.

## 5. Key hygiene checklist

- Give the **GitHub kind a fine-grained PAT** scoped to the repos you actually
  touch — never an all-repo classic token.
- A Discord webhook URL **is a secret**: anyone holding it can post to the
  channel. Rotate it from Discord's UI if it leaks.
- LLM keys cost real money per call — create a provider-side spend limit before
  pasting one in.
- Rotation is cheap here by design: delete → re-add → *Test*. Nothing to revoke
  server-side because nothing was ever stored server-side.
