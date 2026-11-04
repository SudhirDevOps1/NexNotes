# Support

NexNotes is maintained by one person on best effort — here is the fastest path
to an answer.

| You need… | Go to |
|---|---|
| **Something is broken** (bug, crash, lost data) | [Open a bug report](https://github.com/SudhirDevOps1/NexNotes/issues/new?template=bug_report.md) — fill in the template, it saves a round-trip |
| **A feature idea** | [Feature request](https://github.com/SudhirDevOps1/NexNotes/issues/new?template=feature_request.md) |
| **Security vulnerability** | **Do not open a public issue** — follow [`SECURITY.md`](../SECURITY.md) for private reporting |
| **Self-hosting help** (Docker, Postgres, reverse proxy) | Read [`docs/SELF-HOSTING.md`](../docs/SELF-HOSTING.md) first; if stuck, open a bug report with the `self-hosting` label |
| **"Is feature X supported?"** | Check the matrix in [`docs/FEATURES.md`](../docs/FEATURES.md) |
| **Release / packaging questions** | [`docs/RELEASE_SETUP.md`](../docs/RELEASE_SETUP.md) and [`docs/CI-CD.md`](../docs/CI-CD.md) |

## Expected response times

Issues are triaged when the maintainer picks them up — there is no SLA. Anything
labelled `security` is treated as priority. If a bug report contains no version
number, no environment and no reproduction steps, it will likely sit until it has them.

## What "in development" means

NexNotes is on the `0.x` line (see [`docs/VERSIONING.md`](../docs/VERSIONING.md)):
features can change between releases, and you should keep exports/backups of
anything important. That is exactly what the built-in daily auto-backup is for.
