#!/usr/bin/env bash
# Shared helpers for per-workspace dev-server port allocation.
#
# Superset does not hand out per-workspace port ranges (https://docs.superset.sh/ports),
# so every parallel workspace would otherwise try to bind Next.js' default 3000 and
# collide. We keep a small registry of "port -> workspace path" reservations shared by
# all workspaces on this machine, guarded by a lock so two workspaces created at the
# same time can never be handed the same port.
#
# Registry format: one "<port><TAB><workspace path>" line per reservation.

PORT_REGISTRY_FILE="${SUPERSET_PORT_REGISTRY:-$HOME/.superset/port-allocations.tsv}"
PORT_REGISTRY_LOCK_DIR="$PORT_REGISTRY_FILE.lock"

# 3000 is deliberately skipped so the main checkout keeps Next.js' default port.
FIRST_WORKSPACE_PORT="${SUPERSET_FIRST_PORT:-3001}"
LAST_WORKSPACE_PORT="${SUPERSET_LAST_PORT:-3999}"

# Absolute path of the workspace these scripts are running for.
workspace_path() {
  if [ -n "${SUPERSET_WORKSPACE_PATH:-}" ]; then
    printf '%s\n' "$SUPERSET_WORKSPACE_PATH"
  elif git rev-parse --show-toplevel >/dev/null 2>&1; then
    git rev-parse --show-toplevel
  else
    pwd
  fi
}

# The file the allocated port is cached in, inside the workspace (gitignored).
workspace_port_file() {
  printf '%s/.superset/.port\n' "$(workspace_path)"
}

# `mkdir` is atomic, which makes it a dependency-free mutex across concurrent
# workspace creations. Give up after ~20s rather than hanging workspace creation.
port_registry_lock() {
  local attempts=0
  mkdir -p "$(dirname "$PORT_REGISTRY_FILE")"
  while ! mkdir "$PORT_REGISTRY_LOCK_DIR" 2>/dev/null; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 200 ]; then
      echo "warning: port registry lock is stuck, proceeding without it" >&2
      rm -rf "$PORT_REGISTRY_LOCK_DIR"
      return 0
    fi
    # Break a lock left behind by a script that crashed mid-allocation.
    if [ "$attempts" -eq 100 ]; then rm -rf "$PORT_REGISTRY_LOCK_DIR"; fi
    sleep 0.1
  done
}

port_registry_unlock() {
  rm -rf "$PORT_REGISTRY_LOCK_DIR"
}

# Drop reservations whose workspace directory no longer exists, so a force-deleted
# workspace (teardown skipped) never leaks its port forever. Caller holds the lock.
port_registry_prune() {
  [ -f "$PORT_REGISTRY_FILE" ] || return 0
  local tmp port path
  # Bail out rather than risk truncating the registry if a temp file is unavailable.
  tmp="$(mktemp)" || return 0
  while IFS=$'\t' read -r port path; do
    [ -n "${port:-}" ] && [ -n "${path:-}" ] || continue
    [ -d "$path" ] && printf '%s\t%s\n' "$port" "$path" >>"$tmp"
  done <"$PORT_REGISTRY_FILE"
  mv "$tmp" "$PORT_REGISTRY_FILE"
}

port_registry_port_for() {
  [ -f "$PORT_REGISTRY_FILE" ] || return 0
  awk -F'\t' -v want="$1" '$2 == want { print $1; exit }' "$PORT_REGISTRY_FILE"
}

port_registry_is_reserved() {
  [ -f "$PORT_REGISTRY_FILE" ] || return 1
  awk -F'\t' -v want="$1" '$1 == want { found = 1 } END { exit found ? 0 : 1 }' "$PORT_REGISTRY_FILE"
}

# True when something is already listening on the port right now — covers processes
# Superset knows nothing about (the main checkout's own dev server, Docker, etc).
port_is_listening() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
  else
    nc -z 127.0.0.1 "$port" >/dev/null 2>&1
  fi
}

# Reserve (or re-use) a port for this workspace and echo it.
allocate_workspace_port() {
  local workspace port existing
  workspace="$(workspace_path)"

  port_registry_lock
  port_registry_prune

  existing="$(port_registry_port_for "$workspace")"
  if [ -n "$existing" ]; then
    port_registry_unlock
    printf '%s\n' "$existing"
    return 0
  fi

  for ((port = FIRST_WORKSPACE_PORT; port <= LAST_WORKSPACE_PORT; port++)); do
    port_registry_is_reserved "$port" && continue
    port_is_listening "$port" && continue
    printf '%s\t%s\n' "$port" "$workspace" >>"$PORT_REGISTRY_FILE"
    port_registry_unlock
    printf '%s\n' "$port"
    return 0
  done

  port_registry_unlock
  echo "error: no free port between $FIRST_WORKSPACE_PORT and $LAST_WORKSPACE_PORT" >&2
  return 1
}

release_workspace_port() {
  local workspace tmp
  workspace="$(workspace_path)"
  [ -f "$PORT_REGISTRY_FILE" ] || return 0

  port_registry_lock
  if ! tmp="$(mktemp)"; then port_registry_unlock; return 0; fi
  awk -F'\t' -v drop="$workspace" '$2 != drop' "$PORT_REGISTRY_FILE" >"$tmp"
  mv "$tmp" "$PORT_REGISTRY_FILE"
  port_registry_unlock
}

# Give the port a readable name in Superset's ports sidebar. This file is generated
# per worktree (and gitignored) because each workspace gets a different port.
write_port_label() {
  local port="$1" workspace name
  workspace="$(workspace_path)"
  name="${SUPERSET_WORKSPACE_NAME:-$(basename "$workspace")}"
  cat >"$workspace/.superset/ports.json" <<JSON
{
  "ports": [
    { "port": $port, "label": "Columbia Catalog dev ($name)" }
  ]
}
JSON
}
