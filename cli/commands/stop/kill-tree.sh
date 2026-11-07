#!/usr/bin/env bash
# commands/stop/kill-tree.sh — terminate a process tree leaves-first.
# Sourced by commands/stop/index.sh. Requires proc/* (_pid_alive,
# collect_descendants, _snap_or_capture) and port/* (_kill_proc).

# Terminate the tree rooted at <pid>: descendants first (leaves before
# parents — killing the parent first would orphan the children), then the
# root. Each target gets SIGTERM, up to <timeout> seconds to exit, then
# SIGKILL. --force skips SIGTERM and SIGKILLs immediately.
#
# Usage: kill_tree <pid> [snapshot] [--force] [--timeout N]
kill_tree() {
  local root=$1
  shift

  local snap="" force=0 timeout=3
  while (( $# > 0 )); do
    case "$1" in
      --force|-f) force=1 ;;
      --timeout)  timeout=${2:-3}; shift ;;
      *)          snap=$1 ;;
    esac
    shift
  done
  snap=$(_snap_or_capture "$snap")

  # Build ordered target list: descendants (BFS = parents-before-children),
  # reversed so we signal leaves first, then the root last.
  local targets=()
  local d
  while IFS= read -r d; do
    [[ -n "$d" ]] || continue
    targets+=("$d")
  done <<< "$(collect_descendants "$root" "$snap")"

  # Reverse descendants → deepest first.
  local ordered=()
  local i
  for (( i = ${#targets[@]} - 1; i >= 0; i-- )); do
    ordered+=("${targets[$i]}")
  done
  # Root is killed last.
  ordered+=("$root")

  local pid
  for pid in "${ordered[@]}"; do
    _kill_one "$pid" "$force" "$timeout"
  done

  return 0
}

# Signal a single pid with the SIGTERM→wait→SIGKILL policy.
_kill_one() {
  local pid=$1 force=$2 timeout=$3

  if (( force )); then
    _kill_proc -KILL "$pid" 2>/dev/null || true
    return 0
  fi

  _kill_proc -TERM "$pid" 2>/dev/null || true

  local waited=0
  while (( waited < timeout )); do
    if ! _pid_alive "$pid"; then
      return 0
    fi
    sleep 1
    waited=$(( waited + 1 ))
  done

  # Still alive after the grace period — escalate.
  if _pid_alive "$pid"; then
    _kill_proc -KILL "$pid" 2>/dev/null || true
  fi
  return 0
}
