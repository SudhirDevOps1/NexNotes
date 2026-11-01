# Contributing to NexNotes

Thanks for helping build the free notes app! 🎉

## Ground rules

1. **Additive-first.** Don't remove or break existing features; extend them.
2. **Privacy-first.** No telemetry, no third-party network calls, no server-side plaintext of E2E notes.
3. **Local-first.** New data must survive offline: write to IndexedDB through the store, sync via deltas.
4. **Clean code.** TypeScript strict-ish, no `any` unless proven necessary.

## Setup

```bash
git clone https://github.com/SudhirDevOps1/NexNotes.git
cd NexNotes
bun install
bunx prisma db push
bun run dev
```

## Before every PR

```bash
bun run lint          # ESLint — must be clean
bunx tsc --noEmit     # types — must be clean
bun run build         # production build must succeed
```

CI enforces all three plus a boot smoke test.

## Project map

```
src/lib/            core logic — store.ts (zustand, sync, crypto), crypto.ts (WebCrypto),
                    totp.ts (RFC 6238), backup.ts, themes.ts, integrations.ts, sn-import.ts
src/app/api/        route handlers (auth, sync, files, tokens, v1 public API, health, share)
src/app/s/[token]/  public read-only share pages
src/components/nexnotes/   app-shell, editor (+ rich-text, sheet-editor, totp), note-list,
                    sidebar, settings-dialog, api-integrations, command-palette, stats…
prisma/             schema.prisma (SQLite) + schema.postgres.prisma (Neon/Postgres)
scripts/            db-switch.mjs (driver switch), gen-icons.mjs, push-to-github.sh
docs/               FEATURES, API, SELF-HOSTING, PRIVACY, SECURITY-ARCHITECTURE, PLAN
```

## Conventions

- Commits: [Conventional Commits](https://www.conventionalcommits.org/) — `feat:`, `fix:`, `docs:`, `chore:`
- UI: Tailwind utility classes + existing shadcn/ui components; keep 44px touch targets; test 390 px width
- Wire formats: extend `src/lib/types.ts` first; keep sync payloads additive (new optional fields only)
- Docs: update `docs/FEATURES.md` when adding a user-visible feature

## Reporting bugs

Use the issue template — console output (F12) makes fixes dramatically faster.
