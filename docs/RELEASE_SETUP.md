# Release engineering — setup checklist

NexNotes ships with Google's [release-please](https://github.com/googleapis/release-please-action)
wired end-to-end: Conventional Commits in, tagged releases with real artifacts out.
This document is the operating manual. Nothing here is aspirational — every piece
runs in CI today.

---

## 1. How the release train works

```
git commit -m "feat: ..."        # local (husky enforces the convention)
      │
      ▼  push to main
quality-gate                     # lint · typecheck · unit tests · build
      │
      ▼
release-please                   # opens/updates a release PR:
      │                          #   chore(main): release nexnotes x.y.z
      │                          #   — bumps package.json
      │                          #   — appends CHANGELOG.md (machine-generated)
      ▼  maintainer merges the PR
tag v* + GitHub Release created  # artifacts build from THAT exact tag
      │
      ▼
build-linux                      # portable server (tar.gz + windows zip)
      │                          # + Electron AppImage — both boot-tested
      ▼
build-windows                    # Electron NSIS installer — silent-installed
      │                          # and health-checked on a real windows runner
      ▼
publish                          # one SHA256SUMS + gh release upload <tag>
```

Manual fallback: pushing any `v*` tag skips release-please and runs the same
artifact pipeline against that tag.

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

Breaking changes: add `!` or a `BREAKING CHANGE:` footer → major bump.
`security:` is a NexNotes extension to stock config-conventional (see
`commitlint.config.mjs`) — use it for vulnerability fixes.

## 3. Files that make it work

| File | Purpose |
|---|---|
| `release-please-config.json` | release type (node), changelog sections, PR title |
| `.release-please-manifest.json` | current released version per package (root `.`) |
| `.github/workflows/release.yml` | gate → release-please → build-linux + build-windows → publish |
| `commitlint.config.mjs` | allowed commit types (incl. `security`) |
| `.husky/pre-commit`, `.husky/commit-msg` | local enforcement (activated by `prepare: husky`) |
| `scripts/package-release.mjs` | portable server tar.gz + zip, version from package.json |
| `scripts/stage-desktop.mjs` | stages the standalone server for electron-builder (nested so its node_modules survives; prunes the foreign prisma engine) |
| `scripts/make-sums.mjs` | one sha256sum-compatible file covering every release asset |
| `desktop/` | Electron shell (`src/main.js`), electron-builder config, icons |
| `src/lib/version.ts` | single source of truth — imports package.json |

## 4. Zero manual drift invariants

1. **Never edit `CHANGELOG.md` by hand.** It is generated from commits; manual
   edits are overwritten by the next release PR.
2. **Never hardcode versions.** The runtime version comes from
   `src/lib/version.ts` → `package.json`. The build reads the exact git tag
   (the artifacts job checks out the tag, not main).
3. **Never bump `version` in package.json manually.** release-please does it in
   the release PR. If you must force a version, use a
   `Release-As: x.y.z` footer on one commit instead.
   *(Until the §5 PR-permission setting is enabled, versions are cut manually:
   a `chore(release): ...` commit bumping package.json + the manifest together,
   then a `v*` tag. The manifest must move with the version or release-please
   will propose the same bump twice once it works.)*

## 5. One-time repository settings (checklist)

- [x] Conventional-commit enforcement active (husky + commitlint, verified locally)
- [x] release-please config + manifest committed
- [x] artifact pipeline verified (tarball, AppImage, Windows zip boot tests)
- [x] desktop packaging rebuilt on Electron (2.2.0): AppImage boot-tested under
      Xvfb locally and in CI; Windows NSIS silent-installed + health-checked on
      windows-latest; server.json handshake makes both smokes port-agnostic
- [x] windows smoke resolves the installed exe from the HKCU uninstall entry
      (the per-user folder follows the sanitized *package* name —
      `nexnotes-desktop` — not the display name; the first tag build caught
      this when the smoke looked in `Programs\NexNotes` and found nothing)
- [ ] **REQUIRED for release PRs (hit in practice, 2026-11-01):** the default
      `GITHUB_TOKEN` cannot create pull requests until one of these is done:
      1. Settings → Actions → General → Workflow permissions → check
         **"Allow GitHub Actions to create and approve pull requests"**, or
      2. store a fine-grained PAT with *Contents: read/write* +
         *Pull requests: read/write* as the repo secret `RELEASE_PLEASE_TOKEN`
         (the workflow already prefers it; a PAT also makes the release PR
         trigger the other workflows, which the default token never can).
      Until one of the two is done, `release-please` fails with
      "GitHub Actions is not permitted to create or approve pull requests".
      Note (2026-11-02): flipping the toggle *via API* needs a token with
      *Administration: read/write* — the owner's fine-grained PAT used for
      pushes does not carry it, so the toggle stays a manual step.
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

## 6. Cutting the first release

```bash
git tag v0.0.2 && git push origin v0.0.2
# → Release workflow builds the Electron NSIS installer (windows) + AppImage
#   (linux) + portable server packages, boot-tests all of them, attaches
#   SHA256SUMS, and publishes the GitHub Release.
```

After that, merge `feat:`/`fix:` commits to main and release-please proposes
the next version automatically.

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Release PR never appears | Actions PR-creation setting disabled (see §5), or no `feat:`/`fix:` commits since last tag |
| `commitlint` rejects your message locally | Use `type: subject` form — see §2 table |
| "NSIS Error: Installer integrity check has failed" | Almost always a truncated download — re-download and verify against `nexnotes-v*-SHA256SUMS.txt` |
| Windows smoke job fails | Check `prisma/schema.prisma` still lists `binaryTargets = ["native", "windows"]`; the boot test reads the port from `%APPDATA%\NexNotes\server.json` |
| AppImage builds but the app logs `Cannot find module 'next'` | electron-builder ignores a ROOT-level `node_modules` dir in extraResources (`app-builder-lib` `out/util/filter.js`) — keep the server staged under `build/desktop-payload/server/` (the wrapper dir defeats the check) |
| Codecov badge shows "unknown" | Set `CODECOV_TOKEN` (see §5) — tokenless uploads are gone |
| AppImage fails on old distros | Built on ubuntu-24.04 (glibc ≥ 2.39) since the ubuntu-22.04 runner entered deprecation brownouts — if a user's distro is older than that, ship a portable tar.gz instead (bundled node, no glibc floor beyond Electron's) |
| Artifacts uploaded twice | `gh release upload --clobber` is intentional — re-runs replace assets |
