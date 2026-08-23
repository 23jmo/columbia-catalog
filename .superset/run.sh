#!/usr/bin/env bash
# Launched by Superset's Run button in a dedicated, restartable terminal pane.
# Docs: https://docs.superset.sh/setup-teardown-scripts
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
# shellcheck source=lib/ports.sh
source ".superset/lib/ports.sh"

PORT_FILE="$(workspace_port_file)"

# Normally setup already reserved the port. Allocate on demand anyway so Run still
# works in a workspace created before this config existed, or with setup skipped.
if [ -s "$PORT_FILE" ]; then
  PORT="$(cat "$PORT_FILE")"
else
  PORT="$(allocate_workspace_port)"
  printf '%s\n' "$PORT" >"$PORT_FILE"
  write_port_label "$PORT"
fi

# Dependencies can be missing if setup was skipped or node_modules was cleaned.
if [ ! -d node_modules ]; then
  echo "node_modules missing, installing..."
  npm install
fi

echo "Starting Next.js dev server on http://localhost:$PORT"
# exec so the dev server owns the pane's PID: Superset's stop button and the port
# panel's kill action then hit Next.js directly instead of a wrapper shell.
export PORT
exec npm run dev -- --port "$PORT"
