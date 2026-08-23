#!/usr/bin/env bash
# Runs when a Superset workspace is deleted, from the workspace directory.
# Docs: https://docs.superset.sh/setup-teardown-scripts
#
# Never exit non-zero on a best-effort cleanup step: a failing teardown blocks
# workspace deletion until the user force-deletes.
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 0
# shellcheck source=lib/ports.sh
source ".superset/lib/ports.sh"

WORKSPACE="$(workspace_path)"
PORT_FILE="$(workspace_port_file)"
PORT=""
[ -s "$PORT_FILE" ] && PORT="$(cat "$PORT_FILE")"

# 1. Stop the dev server this workspace's run script started.
#
# Only kill a listener whose working directory is inside this workspace — by the
# time teardown runs, the port may already have been recycled by someone else.
if [ -n "$PORT" ] && command -v lsof >/dev/null 2>&1; then
  for pid in $(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null); do
    cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
    case "$cwd" in
      "$WORKSPACE"|"$WORKSPACE"/*)
        echo "stopping dev server on port $PORT (pid $pid)"
        kill "$pid" 2>/dev/null
        ;;
    esac
  done
fi

# 2. Release the port so the next workspace can take it.
release_workspace_port

rm -f "$PORT_FILE" ".superset/ports.json"
exit 0
