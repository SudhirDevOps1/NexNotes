# CI/CD pipeline

NexNotes runs a layered pipeline. Everything on this page runs on GitHub's
free tier for public repositories — no paid services, no external runners.

## Tiers

| Tier | Workflow | Trigger | What it proves |
|---|---|---|---|
| 1 | [`ci.yml`](../.github/workflows/ci.yml) | every push/PR | lint + typecheck + build + boot + register/login/401 smoke + Vitest unit tests |
| 1 | [`e2e-gate.yml`](../.github/workflows/e2e-gate.yml) | every push/PR | real Chromium drives the built app: login screen, demo login journey, API register |
| 1 | [`gitleaks.yml`](../.github/workflows/gitleaks.yml) | push/PR + nightly | no secrets in the diff **or the full git history** |
| 2 | [`codecov.yml`](../.github/workflows/codecov.yml) | push/PR | coverage report on Codecov (advisory) |
| 2 | [`dependency-security.yml`](../.github/workflows/dependency-security.yml) | lockfile changes + daily | `bun audit` report + artifact (advisory until the dependency sweep) |
| 3 | [`codeql.yml`](../.github/workflows/codeql.yml) | push/PR + weekly | semantic security analysis (security-extended), results in Security tab |
| 3 | [`zap-nightly.yml`](../.github/workflows/zap-nightly.yml) | nightly | OWASP ZAP DAST baseline against the running app, reports as artifacts |
| 3 | [`scorecard.yml`](../.github/workflows/scorecard.yml) | weekly + push | OpenSSF supply-chain scorecard, published to deps.dev |

## Housekeeping

| Workflow | Trigger | Purpose |
|---|---|---|
| [`release.yml`](../.github/workflows/release.yml) | tag `v*` | GitHub Release: Windows NSIS installer + Linux AppImage (Electron), portable server tar.gz/zip, SHA256SUMS — all boot-tested in CI |
| [`docker.yml`](../.github/workflows/docker.yml) | tag `v*` | multi-arch image to GHCR (see `docs/SELF-HOSTING.md`) |
| [`branch-cleanup.yml`](../.github/workflows/branch-cleanup.yml) | PR merged | deletes the merged head branch (except `main`/`develop`) |
| [`image-optimizer.yml`](../.github/workflows/image-optimizer.yml) | images changed | lossless PNG recompression, opens a reviewable PR if >2% saved |
| [`stale.yml`](../.github/workflows/stale.yml) | daily | marks silent issues/PRs stale (30d), closes after 14 more days |

## Conventions

- **Least privilege** — every job declares only the permissions it needs; the
  top-level default is `read-all` where possible.
- **Bounded runs** — every job has `timeout-minutes`; a hung test never burns
  the free quota.
- **One run per ref** — `concurrency` groups cancel superseded runs on the
  same branch, so results always describe the latest commit.
- **Advisory vs. gate** — CI/E2E/gitleaks block merges. Coverage, dependency
  audit and ZAP report without blocking (each file explains why, and what
  needs to happen before they become gates).
- **Secrets** — none required for CI. `GITHUB_TOKEN` is the only credential
  used anywhere. Codecov optionally accepts `CODECOV_TOKEN` (public repos
  work tokenless).

## Cutting a release

```bash
git tag v0.0.2 && git push origin v0.0.2
```

Release + Docker workflows pick the tag up automatically. Day-to-day you don't
cut tags by hand — merged `feat:`/`fix:` commits make release-please open the
release PR for you (see [`VERSIONING.md`](VERSIONING.md)).
