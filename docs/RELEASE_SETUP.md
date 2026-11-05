# Release engineering — setup checklist

NexNotes ships a self-contained release train: Conventional Commits in, tagged
releases with real artifacts out. The cutter is a small repo script
(`scripts/cut-release.mjs`) driven by GitHub Actions — no third-party app, no
release PR, no special repository settings. This document is the operating
manual. Nothing here is aspirational — every piece runs in CI today.

---

## 1. How the release train works

```
git commit -m "feat: ..."        # local (husky enforces the convention)
      │
      ▼  push to main
quality-gate                     # lint · typecheck · unit tests · build
      │
      ▼
cut-release                      # scripts/cut-release.mjs — on feat/fix/perf/
      │                          # security/revert commits since the last v* tag:
      │                          #   — bumps package.json + desktop/package.json
      │                          #   — prepends the CHANGELOG.md section
      │                          #   — commits chore(main): release nexnotes x.y.z
      │                          #   — tags v* + opens the GitHub Release
      ▼
build-linux                      # portable server (tar.gz + windows zip)
      │                          # + Electron AppImage — both boot-tested
      ▼
build-windows                    # Electron NSIS installer — silent-installed
      │                          # and health-checked on a real windows runner
      ▼
publish                          # one SHA256SUMS + gh release upload <tag>
```

Pushes with only `docs:`/`chore:`/`ci:` commits exit green without cutting a
release. Manual fallback: pushing any `v*` tag skips the cutter and runs the
same artifact pipeline against that tag.

## 2. Commit convention (enforced)

Husky + commitlint reject anything that is not a Conventional Commit
(`.husky/commit-msg` → `commitlint --edit`). Lint of staged files runs on
pre-commit (`.husky/pre-commit` → `lint-staged`).

| Type | Changelog section | Version bump |
|---|---|---|
| `feat:` | Features | minor |
| `fix:` | Bug Fixes | patch |
| `security:` | Security | patch |
| `perf:` | Performance | patch |
| `refactor:`, `docs:`, `chore:`, `ci:`, `test:`, `build:`, `style:` | hidden sections | none |

Breaking changes: add `!` or a `BREAKING CHANGE:` footer → **patch** bump while
we are on 0.x (pre-major SemVer, the same numbers release-please produced).
`security:` is a NexNotes extension to stock config-conventional (see
`commitlint.config.mjs`) — use it for vulnerability fixes.

## 3. Files that make it work

| File | Purpose |
|---|---|
| `scripts/cut-release.mjs` | the cutter: semver from Conventional Commits, CHANGELOG section, version bump, tag, GitHub Release (`--dry-run` for a local preview) |
| `.github/workflows/release.yml` | gate → cut-release → build-linux + build-windows → publish |
| `commitlint.config.mjs` | allowed commit types (incl. `security`) |
| `.husky/pre-commit`, `.husky/commit-msg` | local enforcement (activated by `prepare: husky`) |
| `scripts/package-release.mjs` | portable server tar.gz + zip, version from package.json |
| `scripts/stage-desktop.mjs` | stages the standalone server for electron-builder (nested so its node_modules survives; prunes the foreign prisma engine) |
| `scripts/make-sums.mjs` | one sha256sum-compatible file covering every release asset |
| `desktop/` | Electron shell (`src/main.js`), electron-builder config, icons |
| `src/lib/version.ts` | single source of truth — imports package.json |

## 4. Zero manual drift invariants

1. **Never edit `CHANGELOG.md` by hand.** It is generated from commits; manual
   edits are overwritten by the next release.
2. **Never hardcode versions.** The runtime version comes from
   `src/lib/version.ts` → `package.json`. The build reads the exact git tag
   (the artifacts job checks out the tag, not main).
3. **Never bump `version` in package.json manually.** `cut-release.mjs` does it
   on main (root *and* `desktop/package.json` — the desktop manifest once
   drifted to 0.0.1 while the app was on 0.0.4; the cutter now moves both
   together). To preview a release locally: `node scripts/cut-release.mjs --dry-run`.

## 5. One-time repository settings (checklist)

- [x] Conventional-commit enforcement active (husky + commitlint, verified locally)
- [x] release cutter committed (`scripts/cut-release.mjs`, ex-release-please config removed)
- [x] artifact pipeline verified (tarball, AppImage, Windows zip boot tests)
- [x] desktop packaging rebuilt on Electron (2.2.0): AppImage boot-tested under
      Xvfb locally and in CI; Windows NSIS silent-installed + health-checked on
      windows-latest; server.json handshake makes both smokes port-agnostic
- [x] windows smoke resolves the installed exe from the HKCU uninstall entry
      (the per-user folder follows the sanitized *package* name —
      `nexnotes-desktop` — not the display name; the first tag build caught
      this when the smoke looked in `Programs\NexNotes` and found nothing)
- [x] ~~release PRs need "Allow GitHub Actions to create and approve pull
      requests"~~ **obsolete (2026-11-05):** the release train no longer opens
      PRs at all — `cut-release.mjs` commits the version bump straight to main
      with `contents: write`, which the workflow already grants. The toggle
      that kept failing every push is no longer part of the flow.
- [x] release config migrated: `release-please-config.json` +
      `.release-please-manifest.json` removed; `scripts/cut-release.mjs` owns
      versioning now
- [ ] **Codecov badge stays "unknown" until CODECOV_TOKEN exists:** Codecov
      retired tokenless uploads (the first run proved it — "Token required").
      Log into codecov.io with GitHub → copy the repo's upload token →
      Settings → Secrets and variables → Actions → `CODECOV_TOKEN`. The
      workflow meanwhile attaches the raw lcov as the `coverage-report`
      artifact and prints the % table in the run summary, so nothing is lost
      in the meantime.
- [ ] Recommended branch protection on `main` — the exact ruleset, the four
      required check names and both apply-paths (UI + API) now live in
      [`BRANCH-PROTECTION.md`](BRANCH-PROTECTION.md).
- [ ] Optional: OWASP ZAP baseline runs nightly at 01:45 UTC (cron) — it can
      also be triggered manually from the Actions tab (workflow_dispatch).

## 6. Cutting a release

```bash
git tag v0.0.3 && git push origin v0.0.3
# → Release workflow builds the Electron NSIS installer (windows) + AppImage
#   (linux) + portable server packages, boot-tests all of them, attaches
#   SHA256SUMS, and publishes the GitHub Release.
```

After that, merge `feat:`/`fix:` commits to main and the next push to main cuts
the following version automatically.

**v0.0.2 postmortem — the two quirks the first machine-tagged release hit
(2026-11-04), kept here because both bite again the moment they're forgotten:**

1. *Tag prefix.* release-please defaults to `nexnotes-v<version>` for a node
   package with a component, but `release.yml` only fires on tags matching
   `v*`. Fixed in `release-please-config.json` (`"tag-prefix": "v"` +
   `"include-component-in-tag": false`) — without it the first tagged release
   would have landed as `nexnotes-v0.0.2` and silently skipped every artifact
   job.
2. *The release anchor.* release-please creates a release only when it can see
   one at the manifest version's tag; with no release PR (the §5 gate), it
   builds the *next* version's PR instead and nothing ships. v0.0.2 was cut by
   fast-forwarding main to the generated release commit
   (`chore(main): release nexnotes 0.0.2`), creating the release + tag with the
   owner PAT, then re-pushing the tag with git — a real `git push` fires the
   `v*` trigger; the tag created by the release API does not. Flipping the §5
   toggle makes all of this automatic: PR appears → merge → next run finds the
   anchor and tags `v0.0.3` itself.

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Release job exits "nothing to release" | only `docs:`/`chore:`/`ci:` commits since last tag — that is green by design; add a `feat:`/`fix:` commit |
| `commitlint` rejects your message locally | Use `type: subject` form — see §2 table |
| "NSIS Error: Installer integrity check has failed" | Almost always a truncated download — re-download and verify against `nexnotes-v*-SHA256SUMS.txt` |
| Windows smoke job fails | Check `prisma/schema.prisma` still lists `binaryTargets = ["native", "windows"]`; the boot test reads the port from `%APPDATA%\NexNotes\server.json` |
| AppImage builds but the app logs `Cannot find module 'next'` | electron-builder ignores a ROOT-level `node_modules` dir in extraResources (`app-builder-lib` `out/util/filter.js`) — keep the server staged under `build/desktop-payload/server/` (the wrapper dir defeats the check) |
| Codecov badge shows "unknown" | Set `CODECOV_TOKEN` (see §5) — tokenless uploads are gone |
| AppImage fails on old distros | Built on ubuntu-24.04 (glibc ≥ 2.39) since the ubuntu-22.04 runner entered deprecation brownouts — if a user's distro is older than that, ship a portable tar.gz instead (bundled node, no glibc floor beyond Electron's) |
| Artifacts uploaded twice | `gh release upload --clobber` is intentional — re-runs replace assets |
