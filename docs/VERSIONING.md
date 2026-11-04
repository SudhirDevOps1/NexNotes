# Versioning policy

NexNotes follows [Semantic Versioning](https://semver.org) — with the app living in
**major version zero** until the API is declared stable. This page is the contract:
what each bump means, who bumps it, and what has to be true before 1.0.0.

## Current line: `0.x.y` — active development

```
0.0.1  ← we are here
```

SemVer §4 is explicit: *major version zero (0.y.z) is for initial development;
anything may change at any time.* Publishing 2.x while the data model and REST API
were still moving told users the wrong story, so the project **reset to `0.0.1`**
on 2026-11-02 (see the first entry in [`CHANGELOG.md`](../CHANGELOG.md)). The old
`v2.x` tags and releases stay on GitHub as history; they are not maintained.

## What each bump means

| Bump | Example | When |
|---|---|---|
| **Patch** `0.0.x → 0.0.2` | Bug fixes, security patches, doc-only changes, perf work with no API change | any `fix:`/`perf:`/`docs:` commit |
| **Minor** `0.0.x → 0.1.0` | New features, new note types, new endpoints, **schema/REST changes that are not backwards-compatible** | any `feat:` commit — or any breaking change, which we treat as minor until 1.0.0 |
| **Major** `0.x → 1.0.0` | The graduation (checklist below) — never earlier | deliberate, planned |

> Why breaking changes only bump the minor before 1.0.0: the 0.x line *means*
> "instability is expected". Burning major numbers for every schema tweak would
> make the number meaningless — exactly the mistake the 2.x line made.

## How releases happen (release-please)

Versions are **never bumped by hand**. The train:

1. Every commit must pass [`commitlint`](commitlint.config.mjs) (Conventional
   Commits: `feat:`, `fix:`, `docs:`, `chore:`, …) — husky enforces this locally,
   and the workflow gate enforces it on the PR.
2. [`release-please`](https://github.com/googleapis/release-please) reads the
   commits, opens/updates a release PR, and derives the next version:
   - `bump-minor-pre-major: true` → `feat:` bumps the **minor** (not the major)
     while we are on 0.x
   - `bump-patch-for-minor-pre-major: true` → `fix:` bumps only the **patch**
3. Merging the release PR updates `package.json` + `CHANGELOG.md` and tags `v0.x.y`.
4. The `v*` tag triggers `release.yml` (Electron installers + portable server,
   boot-tested before publish) and `docker.yml` (multi-arch image to GHCR).

State lives in [`.release-please-manifest.json`](../.release-please-manifest.json)
(root, per-package current version) and the `release-please` job inside
[`.github/workflows/release.yml`](../.github/workflows/release.yml).
`CHANGELOG.md` is machine-generated — never edit it by hand.

## Where the version surfaces

| Surface | Source of truth |
|---|---|
| `package.json` / `desktop/package.json` | release-please writes both on the release PR |
| `/api/health`, `/api/nx/health` | `APP_VERSION` from `src/lib/version.ts` (imports `package.json`) — a single source, no hardcoded copies |
| App UI (sidebar chip, About) | the same `APP_VERSION` |
| PWA manifest, Electron builder | read `package.json` at build time |

Rule: **no version string is ever hardcoded** outside `package.json`. The 0.0.1
reset also removed a stray `"1.0.0"` from the legacy `/api/nx/health` route.

## 1.0.0 graduation checklist

`1.0.0` is a promise: *we will not break you*. It ships only when all of these hold:

- [ ] REST API `/api/v1/*` documented, versioned, and covered by contract tests
- [ ] Prisma schema stable for ≥ 2 minor cycles with additive-only migrations
- [ ] Sync protocol + local storage format backwards-compatible across ≥ 2 releases
- [ ] Desktop auto-update path verified end to end (install → update → data survives)
- [ ] Security review pass: CodeQL clean, no open highs, ZAP baseline reviewed
- [ ] Support policy published (which 0.x → 1.0.0 migration path is offered)
- [ ] E2E suite green on the release candidate for a full week of nightly runs

Until then: ship small, ship often, and let the 0.x line tell the truth.
