#!/usr/bin/env bash
# Enforce AGENTS.md §0.11: exactly ONE working branch besides `main` at any moment, and never work on a
# stale/diverged `main`. Two modes:
#   (default) local pre-commit check — at most one non-main LOCAL branch, and local main == origin/main.
#   --remote  CI check — at most one non-main branch on the remote (i.e. at most one open PR's branch).
set -euo pipefail

mode="${1:-local}"

fail() {
  echo "" >&2
  echo "✘ branch-guard: $1" >&2
  echo "  AGENTS.md §0.11 — EXACTLY ONE open PR / working branch at a time, no exceptions." >&2
  exit 1
}

if [ "$mode" = "--remote" ]; then
  # Count remote heads other than main. `git ls-remote` needs no checkout, so it runs in CI cheaply.
  others=$(git ls-remote --heads origin 2>/dev/null | sed 's#.*refs/heads/##' | grep -vx main || true)
  count=$(printf '%s' "$others" | grep -c . || true)
  if [ "$count" -gt 1 ]; then
    echo "$others" | sed 's/^/    /' >&2
    fail "$count non-main branches exist on origin — merge/close all but one before opening another."
  fi
  echo "branch-guard: origin has $count non-main branch — ok."
  exit 0
fi

# --- local pre-commit checks ---

# 1. At most one non-main LOCAL branch.
others=$(git for-each-ref --format='%(refname:short)' refs/heads | grep -vx main || true)
count=$(printf '%s' "$others" | grep -c . || true)
if [ "$count" -gt 1 ]; then
  echo "$others" | sed 's/^/    /' >&2
  fail "$count non-main local branches exist — delete all but the one you're working on (git branch -D …)."
fi

# 2. Local `main` must not have diverged from origin/main — never commit onto a stale/ahead main. A
#    best-effort fetch keeps the comparison honest; offline is tolerated (skip rather than block a commit).
if git rev-parse --verify -q refs/heads/main >/dev/null; then
  git fetch --quiet origin main 2>/dev/null || true
  remote_main=$(git rev-parse --verify -q refs/remotes/origin/main || echo "")
  local_main=$(git rev-parse refs/heads/main)
  if [ -n "$remote_main" ] && [ "$local_main" != "$remote_main" ]; then
    fail "local main ($(git rev-parse --short refs/heads/main)) != origin/main ($(git rev-parse --short refs/remotes/origin/main)) — run: git checkout main && git pull origin main."
  fi
fi

echo "branch-guard: one working branch, main in sync — ok."
