#!/usr/bin/env bash
# commands/stop/kill.sh — interactive confirm + per-root kill helpers shared by
# the stop modes. Sourced by commands/stop/index.sh. Requires kill-tree.sh
# (kill_tree), proc/* (_pid_alive), port/* (_kill_proc).

# Confirm a y/N prompt. Returns 0 on yes. Honors STDIN; defaults to No.
_confirm() {
  local prompt=$1
  printf '%s' "$prompt"
  local answer
  read -r answer || true
  case "${answer:-N}" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

# Kill one root with the shared force/tree options derived from parsed flags.
_stop_kill_root() {
  local root=$1 force=$2 tree=$3 snap=$4
  printf '%s\n' "$(t stop_target "$root")"
  if [[ "$tree" == "0" ]]; then
    # --no-tree: just this one process, not its children.
    _kill_single "$root" "$force"
  elif [[ "$force" == "1" ]]; then
    kill_tree "$root" "$snap" --force
  else
    kill_tree "$root" "$snap"
  fi
}

# Single-process kill (no descendants), honoring --force.
_kill_single() {
  local pid=$1 force=$2
  if [[ "$force" == "1" ]]; then
    _kill_proc -KILL "$pid" 2>/dev/null || true
  else
    _kill_proc -TERM "$pid" 2>/dev/null || true
    local waited=0
    while (( waited < 3 )); do
      _pid_alive "$pid" || return 0
      sleep 1
      waited=$(( waited + 1 ))
    done
    _pid_alive "$pid" && _kill_proc -KILL "$pid" 2>/dev/null || true
  fi
}
