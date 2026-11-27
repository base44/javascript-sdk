#!/usr/bin/env bash
# See action.yml. Runs inside the target repository checkout.
set -euo pipefail

out() { echo "$1=$2" >> "$GITHUB_OUTPUT"; echo "$1: $2"; }

# Pushes and fetches use the App token, not whatever actions/checkout persisted.
b64_auth="$(printf 'x-access-token:%s' "$GH_TOKEN" | base64 | tr -d '\n')"
git config --unset-all http.https://github.com/.extraheader 2>/dev/null || true
authed() { git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic ${b64_auth}" "$@"; }

# Stage exactly the requested paths (deletions included).
paths=()
while IFS= read -r p; do [ -n "$p" ] && paths+=("$p"); done <<< "$ADD_PATHS"
git add -A -- "${paths[@]}"

# Exit 2 means no such branch; anything else non-zero is a real failure.
remote_sha="$(authed ls-remote --exit-code --heads origin "$BRANCH" | cut -f1)" || {
  status=$?
  [ "$status" -eq 2 ] || { echo "::error::Couldn't read ${BRANCH} from origin (exit ${status})"; exit 1; }
  remote_sha=""
}
[ -n "$remote_sha" ] && authed fetch -q origin "+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}" "+refs/heads/${BASE}:refs/remotes/origin/${BASE}"
# Only this repo's own branch: a fork PR can have a branch of the same name.
owner="$(gh repo view --json owner --jq .owner.login)"
pr_number="$(gh pr list --head "$BRANCH" --base "$BASE" --state open --json number,headRepositoryOwner \
  --jq "[.[] | select(.headRepositoryOwner.login == \"${owner}\")][0].number // empty")"

# A commit someone else wrote, or rewrote, would be lost to the force-push or the branch
# delete below, so hold off and say so once on the PR. Rebuilding resumes when the PR is
# merged or closed.
held_marker="<!-- open-or-update-pr: held -->"
if [ -n "$remote_sha" ]; then
  others="$(git log --format='%an%n%cn' "refs/remotes/origin/${BASE}..refs/remotes/origin/${BRANCH}" | grep -vxF "${BOT_SLUG}[bot]" || true)"
  if [ -n "$others" ] && [ -z "$pr_number" ]; then
    # No open PR: if the branch is exactly where a merged or closed PR left it, GitHub keeps
    # those commits with that PR, so start over. Anything pushed since is someone's work.
    ended_with="$(gh pr list --head "$BRANCH" --base "$BASE" --state all --json headRefOid,headRepositoryOwner \
      --jq ".[] | select(.headRepositoryOwner.login == \"${owner}\") | .headRefOid")"
    grep -qx "$remote_sha" <<< "$ended_with" || { echo "::error::${BRANCH} has commits by someone other than the bot that no PR ended with; leaving it alone"; exit 1; }
    authed push -q "--force-with-lease=refs/heads/${BRANCH}:${remote_sha}" origin --delete "$BRANCH"
    remote_sha=""
    others=""
  fi
  if [ -n "$others" ]; then
    if [ -n "$pr_number" ] && ! gh pr view "$pr_number" --json comments --jq '.comments[].body' | grep -qF "$held_marker"; then
      gh pr comment "$pr_number" --body "Someone other than the bot pushed to this branch, so the daily run no longer updates it. Merge or close this PR to let the next run pick up newer changes.
${held_marker}"
    fi
    out operation held
    out url "$([ -n "$pr_number" ] && gh pr view "$pr_number" --json url --jq .url || true)"
    exit 0
  fi
fi

if git diff --cached --quiet; then
  if [ -n "$pr_number" ]; then
    gh pr close "$pr_number" --comment "Closing: \`${BASE}\` no longer differs from the source, so this change is no longer needed."
    out operation closed
    out url "$(gh pr view "$pr_number" --json url --jq .url)"
  else
    out operation none
    out url ""
  fi
  [ -n "$remote_sha" ] && authed push -q "--force-with-lease=refs/heads/${BRANCH}:${remote_sha}" origin --delete "$BRANCH"
  exit 0
fi

if [ -n "$remote_sha" ] && [ -n "$pr_number" ] && git diff --cached --quiet "refs/remotes/origin/${BRANCH}" --; then
  out operation unchanged
  out url "$(gh pr view "$pr_number" --json url --jq .url)"
  exit 0
fi

# Build the commit from the index without moving HEAD or touching any local branch.
bot_id="$(gh api "/users/${BOT_SLUG}%5Bbot%5D" --jq .id)"
export GIT_AUTHOR_NAME="${BOT_SLUG}[bot]" GIT_COMMITTER_NAME="${BOT_SLUG}[bot]"
export GIT_AUTHOR_EMAIL="${bot_id}+${BOT_SLUG}[bot]@users.noreply.github.com" GIT_COMMITTER_EMAIL="${bot_id}+${BOT_SLUG}[bot]@users.noreply.github.com"
commit="$(git commit-tree "$(git write-tree)" -p HEAD -m "$COMMIT_MESSAGE")"
# The lease fails the push if anyone pushed since the check above.
authed push -q "--force-with-lease=refs/heads/${BRANCH}:${remote_sha}" origin "${commit}:refs/heads/${BRANCH}"

label_args=()
IFS=',' read -ra labels <<< "$LABELS"
for label in ${labels[@]+"${labels[@]}"}; do
  label="$(echo "$label" | xargs)"
  [ -z "$label" ] && continue
  gh label create "$label" >/dev/null 2>&1 || true  # already exists
  label_args+=(--add-label "$label")
done

if [ -n "$pr_number" ]; then
  gh pr edit "$pr_number" --title "$TITLE" --body-file "$BODY_PATH" ${label_args[@]+"${label_args[@]}"} >/dev/null
  out operation updated
  out url "$(gh pr view "$pr_number" --json url --jq .url)"
else
  url="$(gh pr create --head "$BRANCH" --base "$BASE" --title "$TITLE" --body-file "$BODY_PATH")"
  [ ${#label_args[@]} -gt 0 ] && gh pr edit "$url" ${label_args[@]+"${label_args[@]}"} >/dev/null
  out operation created
  out url "$url"
fi
