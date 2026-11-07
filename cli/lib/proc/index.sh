#!/usr/bin/env bash
# proc/index.sh — process-table primitives over a one-shot `ps` snapshot.
#
# Entry/barrel for the proc module: defines the external seams and snapshot,
# then sources its siblings (field accessors, descendant walking).
#
# Our backend root is a `node` process whose command line contains
# `backend.mjs`. Its descendants carry no such marker, so they can only be
# found by walking the PPID graph. We snapshot the process table once
# (`ps_snapshot`) and reason over that snapshot.
#
# Public API:
#   ps_snapshot                          → "PID<TAB>PPID<TAB>COMMAND" per line
#   collect_descendants <pid> [snap]     → transitive child PIDs (BFS), one/line
#
# External-command seams (overridable by tests):
#   _ps_raw                  wraps `ps -axo pid=,ppid=,command=`
#   _pid_alive               wraps a liveness probe (`kill -0`)

: "${CCG_PORT:=19836}"

_proc_win="$(dirname "${BASH_SOURCE[0]}")/../winos.sh"
# shellcheck source=../winos.sh
source "$_proc_win"
unset _proc_win

# ─── external seams ──────────────────────────────────────────────

# Raw process table. Columns: PID PPID COMMAND (command may contain spaces).
# Wrapped so bats can mock it (PATH override works for `ps`, an external tool).
_ps_raw() {
  if _is_windows_shell; then _win_ps_raw; return; fi
  ps -axo pid=,ppid=,command= 2>/dev/null
}

# Liveness probe. Returns 0 if the pid still exists. `kill -0` is the portable
# idiom. Wrapped as a function so tests can force "still alive" / "dead".
_pid_alive() {
  if _is_windows_shell; then _win_pid_alive "$1"; return; fi
  kill -0 "$1" 2>/dev/null
}

# ─── snapshot ────────────────────────────────────────────────────

# Normalize `ps` output to tab-separated PID<TAB>PPID<TAB>COMMAND lines.
# Strips leading whitespace and collapses the PID/PPID gap; the command
# (everything after the second field) is preserved verbatim, spaces and all.
ps_snapshot() {
  local raw
  raw=$(_ps_raw) || return 1
  [[ -n "$raw" ]] || return 1

  local line pid ppid rest
  while IFS= read -r line; do
    # Trim leading spaces.
    line=${line#"${line%%[![:space:]]*}"}
    [[ -n "$line" ]] || continue
    # First token = pid.
    pid=${line%%[[:space:]]*}
    line=${line#"$pid"}
    line=${line#"${line%%[![:space:]]*}"}
    # Second token = ppid.
    ppid=${line%%[[:space:]]*}
    line=${line#"$ppid"}
    # Remainder (after the single separating space) = command.
    rest=${line#"${line%%[![:space:]]*}"}
    [[ "$pid" =~ ^[0-9]+$ ]] || continue
    printf '%s\t%s\t%s\n' "$pid" "$ppid" "$rest"
  done <<< "$raw"
}

# Lazily produce a snapshot if the caller did not pass one.
_snap_or_capture() {
  if [[ -n "${1:-}" ]]; then
    printf '%s' "$1"
  else
    ps_snapshot
  fi
}

# ─── sibling modules ─────────────────────────────────────────────

_proc_dir="$(dirname "${BASH_SOURCE[0]}")"
# shellcheck source=./accessors.sh
source "$_proc_dir/accessors.sh"
# shellcheck source=./descendants.sh
source "$_proc_dir/descendants.sh"
unset _proc_dir
