# Branch protection — the exact setup

`main` is what people install and what CI signs. This page pins down how it is
protected, why each knob is set, and how to apply the settings (UI or API).
No guesswork: every check name below is copied from the workflows as they run.

## Why

Two audiences demand it:

- **OpenSSF Scorecard** scores `Branch-Protection` — protection on `main`
  directly raises the project's supply-chain score (badge on the README).
- **Humans**: a red ❌ on `main` means broken downloads for everyone who
  pulls the tag. The gate is cheaper than the incident.

## The rules (solo-maintainer profile)

The repo currently has a single maintainer. "Require N approvals" cannot work
here — GitHub never lets you approve your own PR — so the profile leans on
**automation as the reviewer** instead:

| Setting | Value | Why |
|---|---|---|
| Restrict deletions | ✅ on | nobody should ever be able to remove `main` |
| Block force pushes | ✅ on | rewritten history invalidates every published tag/artifact hash |
| Require status checks | ✅ on — see list below | merges only land on a green run of the exact commit |
| Require branches to be up to date | ✅ on | a PR is tested against *what will actually ship*, not stale main |
| Require pull request reviews | ❌ off (solo) | impossible to self-approve; flip on with 1 review once a second maintainer exists |
| Require conversation resolution | ✅ on | no merge with open review threads |
| Require linear history | ❌ off | Dependabot PRs merge with merge commits by design |
| Allow force pushes / deletions by admins | ❌ off | the owner follows the same rules — that's the point |

### Required status checks (exact names)

Names must match the job `name:` fields **character for character**, including
the `·` separators (GitHub treats unknown names as permanently "pending"):

| Check name | Workflow |
|---|---|
| `Lint · Typecheck · Build · Smoke test` | CI (`verify`) |
| `unit` | CI (`unit`) |
| `Playwright (Chromium)` | e2e-gate |
| `Detect hardcoded secrets` | Gitleaks |

> GitHub's own tip applies verbatim: status-check names must be **unique across
> all workflows**, or the required check result is ambiguous and PRs block
> forever. All four names above are unique in this repo today — keep it that way.

## Apply it — Settings UI

1. **Settings → Rules → Rulesets → New ruleset → New branch ruleset**
   (rulesets are the modern replacement for legacy branch protection rules:
   stackable, auditable, and they support an `evaluate` dry-run mode).
2. Ruleset name: `main-gate` · Enforcement status: **Active**
3. Bypass list: add **Repository admin** only if you accept the exception —
   the honest default is *no bypass*.
4. Target branches → Add target → **Include by pattern**: `main`
5. Rules → enable exactly the ✅ rows from the table above, then list the four
   status checks under "Require status checks to pass".
6. First merge after enabling: watch the PR's "Checks" tab — if a check shows
   "Expected / Waiting", the name in the ruleset doesn't match the workflow;
   fix the ruleset, not the workflow.

## Apply it — API (one call)

Fine-grained PAT needs **Administration: read/write** (the usual push token does
not carry it — see [`RELEASE_SETUP.md`](RELEASE_SETUP.md) §5). Status: tested
against this repo on 2026-11-04 with the owner's fine-grained PAT — the call
403s ("Resource not accessible by personal access token"), so that token lacks
the permission and the **Settings UI path below is the one that works today**.
`rulesets` API:

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/SudhirDevOps1/NexNotes/rulesets \
  -d @- <<'JSON'
{
  "name": "main-gate",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "Lint · Typecheck · Build · Smoke test" },
          { "context": "unit" },
          { "context": "Playwright (Chromium)" },
          { "context": "Detect hardcoded secrets" }
        ] } },
    { "type": "required_signatures" }
  ]
}
JSON
```

Drop `required_signatures` if you don't sign commits (the repo currently
doesn't enforce signing — add it when commits carry `Verified` badges).

> Tip: create the ruleset with `"enforcement": "evaluate"` first — GitHub
> reports what *would* have been blocked for a week, with zero risk, then flip
> to `active`. That staged rollout is the documented best practice.

## When a second maintainer joins

1. Turn on **Require a pull request before merging** → 1 approval.
2. Add **dismiss stale approvals** (new commits invalidate old approvals) and
   **require review from Code Owners** once a `CODEOWNERS` file exists.
3. Require the **most recent push** to be approved by someone else — it closes
   the self-approve loophole the first rule leaves open.

These match the standard guidance: require-PR rules (approval, dismissal,
code-owner review, last-push approval) are the high-value controls; the
automation gates above remain the floor.
