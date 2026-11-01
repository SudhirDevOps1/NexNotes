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
build-artifacts                  # linux tar.gz · windows zip · AppImage · SHA256SUMS
      │                          # tarball + AppImage are boot-tested on the runner
      ▼
smoke-windows                    # the windows zip is booted and health-checked
      │                          # on a real windows-latest runner
      ▼
publish                          # gh release upload <tag> dist/*
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
| `.github/workflows/release.yml` | gate → release-please → artifacts → windows smoke → publish |
| `commitlint.config.mjs` | allowed commit types (incl. `security`) |
| `.husky/pre-commit`, `.husky/commit-msg` | local enforcement (activated by `prepare: husky`) |
| `scripts/package-release.mjs` | tar.gz + zip + SHA256SUMS, version from package.json |
| `scripts/build-appimage.sh` | FUSE-less AppImage build (appimagetool) |
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

## 5. One-time repository settings (checklist)

- [x] Conventional-commit enforcement active (husky + commitlint, verified locally)
- [x] release-please config + manifest committed
- [x] artifact pipeline verified (tarball, AppImage, Windows zip boot tests)
- [ ] **Optional but recommended:** store a fine-grained PAT with
      *Contents: read/write* + *Pull requests: read/write* as the repo secret
      `RELEASE_PLEASE_TOKEN`. The workflow already falls back to
      `secrets.RELEASE_PLEASE_TOKEN || secrets.GITHUB_TOKEN` — with only the
      default token, the release PR is created but cannot trigger other
      workflows (GitHub's anti-recursion rule).
- [ ] If release PRs don't appear: Settings → Actions → General → enable
      **"Allow GitHub Actions to create and approve pull requests"**.
- [ ] Recommended branch protection on `main`: require CI + CodeQL + E2E Gate
      to pass before merge (Settings → Branches).

## 6. Cutting the first release

```bash
git tag v2.1.0 && git push origin v2.1.0
# → Release workflow builds linux tar.gz, windows zip, AppImage,
#   boot-tests all three (incl. a real windows-latest run), attaches
#   SHA256SUMS, and publishes the GitHub Release.
```

After that, merge `feat:`/`fix:` commits to main and release-please proposes
the next version automatically.

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Release PR never appears | Actions PR-creation setting disabled (see §5), or no `feat:`/`fix:` commits since last tag |
| `commitlint` rejects your message locally | Use `type: subject` form — see §2 table |
| Windows smoke job fails | Check `prisma/schema.prisma` still lists `binaryTargets = ["native", "windows"]` |
| AppImage fails on old distros | Built on ubuntu-22.04 for glibc ≥ 2.35; rebuild on an older runner image if needed |
| Artifacts uploaded twice | `gh release upload --clobber` is intentional — re-runs replace assets |
