#!/usr/bin/env bash
# port/kill.sh — terminate whatever listens on the port. Sourced by index.sh.

# Signal-send seam. Wrapped as a function so tests can override it
# (bash builtins like `kill` beat PATH overrides, so PATH-based mocking
# of the external /bin/kill does not work — function override does).
_kill_pid() {
  kill "$@"
}

# Signal a PID that came from the process snapshot or the port table. On unix
# that is plain `kill`; on Git Bash those are Windows PIDs, which only taskkill
# can signal. (Children of our own foreground run keep using _kill_pid: their
# PIDs are MSYS PIDs.)
_kill_proc() {
  if _is_windows_shell; then _win_kill "$@"; else _kill_pid "$@"; fi
}

# Send SIGTERM to every listening PID, wait up to <timeout> seconds, then
# SIGKILL whatever still holds the port. No-op (returns 0) if nothing listens.
graceful_kill_port() {
  local timeout=${1:-3}
  local pids pid

  pids=$(find_pids_on_port) || return 0

  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    _kill_proc -TERM "$pid" 2>/dev/null || true
  done <<< "$pids"

  local waited=0
  while (( waited < timeout )); do
    if ! find_pids_on_port >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    waited=$(( waited + 1 ))
  done

  # Still alive — escalate every remaining holder.
  pids=$(find_pids_on_port) || return 0
  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    _kill_proc -KILL "$pid" 2>/dev/null || true
  done <<< "$pids"
  return 0
}
