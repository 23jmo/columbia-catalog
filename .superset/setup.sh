#!/usr/bin/env bash
# Runs once when a Superset workspace is created, from the workspace directory.
# Docs: https://docs.superset.sh/setup-teardown-scripts
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=lib/ports.sh
source ".superset/lib/ports.sh"

ROOT_PATH="${SUPERSET_ROOT_PATH:-}"

# 1. Copy untracked local files from the main checkout.
#
# A git worktree only contains tracked files, so anything gitignored — secrets,
# the Vercel project link, local npm config — is missing in a fresh workspace.
# Copy it across from the root repo instead of making the user re-create it.
UNTRACKED_FILES=(
  ".env"
  ".env.local"
  ".env.development.local"
  ".env.production.local"
  ".env.test.local"
  ".npmrc"
  ".vercel"
)

if [ -n "$ROOT_PATH" ] && [ -d "$ROOT_PATH" ]; then
  for entry in "${UNTRACKED_FILES[@]}"; do
    if [ -e "$ROOT_PATH/$entry" ] && [ ! -e "./$entry" ]; then
      cp -R "$ROOT_PATH/$entry" "./$entry"
      echo "copied $entry from the main checkout"
    fi
  done
else
  echo "SUPERSET_ROOT_PATH is unset; skipping untracked file copy" >&2
fi

# 2. Install dependencies.
#
# `npm ci` is the reproducible install and is what a fresh worktree wants, but it
# hard-fails when the lockfile drifts from package.json — fall back so a lockfile
# mismatch on a feature branch never blocks workspace creation.
if [ -f package-lock.json ]; then
  npm ci || npm install
else
  npm install
fi

# 3. Reserve a dev-server port unique to this workspace.
PORT="$(allocate_workspace_port)"
printf '%s\n' "$PORT" >"$(workspace_port_file)"
write_port_label "$PORT"

echo
echo "Workspace ready. Press Run to start the dev server on http://localhost:$PORT"
