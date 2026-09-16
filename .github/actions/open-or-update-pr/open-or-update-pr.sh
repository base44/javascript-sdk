#!/usr/bin/env bash
# See action.yml. Runs inside the target repository checkout.
set -euo pipefail

out() { echo "$1=$2" >> "$GITHUB_OUTPUT"; echo "$1: $2"; }

# Stage exactly the requested paths (deletions included).
paths=()
while IFS= read -r p; do [ -n "$p" ] && paths+=("$p"); done <<< "$ADD_PATHS"
git add -A -- "${paths[@]}"

git fetch -q origin "+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}" 2>/dev/null || true
branch_exists=false
git show-ref -q "refs/remotes/origin/${BRANCH}" && branch_exists=true
pr_number="$(gh pr list --head "$BRANCH" --base "$BASE" --state open --json number --jq '.[0].number // empty')"

# Pushes use the App token, not whatever actions/checkout persisted.
b64_auth="$(printf 'x-access-token:%s' "$GH_TOKEN" | base64 | tr -d '\n')"
git config --unset-all http.https://github.com/.extraheader 2>/dev/null || true
push() { git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic ${b64_auth}" push -q "$@"; }

if git diff --cached --quiet; then
  if [ -n "$pr_number" ]; then
    gh pr close "$pr_number" --comment "Closing: \`${BASE}\` no longer differs from the source, so this change is no longer needed."
    out operation closed
    out url "$(gh pr view "$pr_number" --json url --jq .url)"
  else
    out operation none
    out url ""
  fi
  [ "$branch_exists" = true ] && push origin --delete "$BRANCH"
  exit 0
fi

if [ "$branch_exists" = true ] && [ -n "$pr_number" ] && git diff --cached --quiet "refs/remotes/origin/${BRANCH}" --; then
  out operation unchanged
  out url "$(gh pr view "$pr_number" --json url --jq .url)"
  exit 0
fi

# Build the commit from the index without moving HEAD or touching any local branch.
bot_id="$(gh api "/users/${BOT_SLUG}%5Bbot%5D" --jq .id)"
export GIT_AUTHOR_NAME="${BOT_SLUG}[bot]" GIT_COMMITTER_NAME="${BOT_SLUG}[bot]"
export GIT_AUTHOR_EMAIL="${bot_id}+${BOT_SLUG}[bot]@users.noreply.github.com" GIT_COMMITTER_EMAIL="${bot_id}+${BOT_SLUG}[bot]@users.noreply.github.com"
commit="$(git commit-tree "$(git write-tree)" -p HEAD -m "$COMMIT_MESSAGE")"
push --force origin "${commit}:refs/heads/${BRANCH}"

if [ -n "$pr_number" ]; then
  gh pr edit "$pr_number" --title "$TITLE" --body-file "$BODY_PATH" >/dev/null
  out operation updated
  out url "$(gh pr view "$pr_number" --json url --jq .url)"
else
  url="$(gh pr create --head "$BRANCH" --base "$BASE" --title "$TITLE" --body-file "$BODY_PATH")"
  out operation created
  out url "$url"
fi
