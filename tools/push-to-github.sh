#!/usr/bin/env bash
#
# Push this project to GitHub, and open the upstream pull request for the
# Open Source mini challenge.
#
# Everything is prepared; this script only needs credentials.
#
# Prerequisites
# -------------
#   1. A GitHub account with a personal access token that has `repo` scope.
#      Put it in the environment:
#          export GITHUB_TOKEN=ghp_...
#      or in ~/.github_token (chmod 600).
#
#   2. A GitHub remote to push the submission to. Set it below, or pass it as
#      the first argument:
#          ./tools/push-to-github.sh <your-github-username>
#
# What it does
# ------------
#   1. Pushes this repository to https://github.com/<you>/directors-cut
#   2. Creates a fork of AmazonAppDev/react-native-multi-tv-app-sample and
#      pushes the fix branch
#   3. Opens the pull request with the prepared description
#
# The submission repository MUST be public and MUST contain an open source
# licence file. The `LICENSE` (MIT-0) and `ATTRIBUTION.md` are already
# committed.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM="AmazonAppDev/react-native-multi-tv-app-sample"
FIX_BRANCH="fix/vega-kpenter-and-video-surface-sizing"
PR_DESC="$ROOT/docs/UPSTREAM_PR.md"
FIX_BRANCH_DIR="${FIX_BRANCH_DIR:-$HOME/Code/upstream-pr}"

TOKEN="${GITHUB_TOKEN:-}"
if [ -z "$TOKEN" ] && [ -f "$HOME/.github_token" ]; then
  TOKEN="$(cat "$HOME/.github_token")"
fi
if [ -z "$TOKEN" ]; then
  echo "error: no GitHub token found." >&2
  echo "  export GITHUB_TOKEN=ghp_...   # or write it to ~/.github_token" >&2
  exit 1
fi

USERNAME="${1:-${GITHUB_USERNAME:-}}"
if [ -z "$USERNAME" ]; then
  echo "usage: $0 <your-github-username>" >&2
  exit 1
fi

AUTH="https://x-access-token:${TOKEN}@github.com"

# --- 1. The submission repository -----------------------------------------
cd "$ROOT"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "${AUTH}/${USERNAME}/directors-cut.git"
else
  git remote add origin "${AUTH}/${USERNAME}/directors-cut.git"
fi
echo "==> pushing the submission repo to ${USERNAME}/directors-cut"
git push -u origin main

# --- 2. The upstream fix branch -------------------------------------------
if [ ! -d "$FIX_BRANCH_DIR/.git" ]; then
  echo "error: the fix branch is not checked out at $FIX_BRANCH_DIR" >&2
  echo "  git clone --branch ${FIX_BRANCH}" >&2
  echo "  https://github.com/${UPSTREAM}.git $FIX_BRANCH_DIR" >&2
  exit 1
fi

cd "$FIX_BRANCH_DIR"
FORK_API="https://api.github.com/repos/${USERNAME}/$(echo "$UPSTREAM" | cut -d/ -f2)"

echo "==> ensuring the fork exists"
if ! curl -fsS -H "Authorization: Bearer ${TOKEN}" "$FORK_API" >/dev/null 2>&1; then
  curl -fsS -X POST -H "Authorization: Bearer ${TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${UPSTREAM}/forks" \
    -d "{\"name\":\"$(echo "$UPSTREAM" | cut -d/ -f2)\",\"organization\":\"\"}" >/dev/null
  echo "    fork created"
else
  echo "    fork already exists"
fi

git remote set-url origin "${AUTH}/${USERNAME}/$(echo "$UPSTREAM" | cut -d/ -f2).git"
echo "==> pushing ${FIX_BRANCH}"
git push -u origin "$FIX_BRANCH"

# --- 3. The pull request ---------------------------------------------------
BODY_FILE=$(mktemp)
python3 - "$PR_DESC" "$BODY_FILE" <<'PY'
import json, sys
src, dst = sys.argv[1], sys.argv[2]
with open(src, encoding="utf-8") as f:
    body = f.read()
with open(dst, "w", encoding="utf-8") as f:
    json.dump({"title": "fix(vega): handle the Virtual Device's OK event and size the video surface",
               "body": body, "head": "fix/vega-kpenter-and-video-surface-sizing",
               "base": "upgrade/vega-0.24-rn-0.83"}, f)
PY

echo "==> opening the pull request"
PR_URL=$(curl -fsS -X POST -H "Authorization: Bearer ${TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${UPSTREAM}/pulls" \
  --data-binary "@${BODY_FILE}" | python3 -c "import json,sys; print(json.load(sys.stdin).get('html_url',''))")
rm -f "$BODY_FILE"

echo
echo "Submission repo : https://github.com/${USERNAME}/directors-cut"
echo "Pull request    : ${PR_URL}"
echo
echo "Remember: make the submission repo public, and add the Amazon reviewers"
echo "(knmeiss, giolaq, anishamalde, mosesroth, emersonsklar) as collaborators"
echo "if you prefer a private repo - though public + MIT-0 is simpler."
