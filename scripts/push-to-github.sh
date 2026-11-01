#!/usr/bin/env bash
# NexNotes — push the local repo to GitHub
# Usage:  GITHUB_TOKEN=ghp_xxx ./scripts/push-to-github.sh
#     or: ssh remote configured → ./scripts/push-to-github.sh
set -euo pipefail

REMOTE_URL="${1:-https://github.com/SudhirDevOps1/NexNotes.git}"
BRANCH="main"

cd "$(dirname "$0")/.."

if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "$REMOTE_URL"
fi
git remote set-url origin "$REMOTE_URL"

echo "→ Remote: $(git remote get-url origin)"
echo "→ Branch: $BRANCH"
echo

# HTTPS needs a token; SSH needs keys
if [[ "$REMOTE_URL" == https://* ]]; then
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    AUTH_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/SudhirDevOps1/NexNotes.git"
    git push -u "$AUTH_URL" "$BRANCH"
  else
    echo "No GITHUB_TOKEN set — trying credential helper / interactive prompt…"
    git push -u origin "$BRANCH"
  fi
else
  git push -u origin "$BRANCH"
fi

echo
echo "✓ Pushed. Repo: ${REMOTE_URL%.git}"
