#!/usr/bin/env bash
# port/discover.sh — find which PIDs listen on a port (reverse: port → pids).
# Sourced by port/index.sh.

# Return first PID listening on CCG_PORT (or nonzero if none).
# Uses lsof on unix; falls back to netstat on systems without lsof.
find_pid_on_port() {
  local raw pid
  if _is_windows_shell; then
    raw=$(_win_pids_on_port "${CCG_PORT}")
  elif command -v lsof >/dev/null 2>&1; then
    raw=$(lsof -ti "TCP:${CCG_PORT}" -sTCP:LISTEN 2>/dev/null) || return 1
  elif command -v netstat >/dev/null 2>&1; then
    # netstat fallback (Linux/BSD variants differ; best-effort)
    raw=$(netstat -anp 2>/dev/null | awk -v p=":${CCG_PORT}" '$4 ~ p {print $7}' | sed 's|/.*||' | grep -E '^[0-9]+$' | head -1)
  else
    return 1
  fi

  if [[ -z "$raw" ]]; then
    return 1
  fi

  # Take the first non-empty line
  while IFS= read -r pid; do
    if [[ "$pid" =~ ^[0-9]+$ ]]; then
      printf '%s' "$pid"
      return 0
    fi
  done <<< "$raw"
  return 1
}

# Return EVERY PID listening on <port> (default CCG_PORT), one per line.
# Unlike find_pid_on_port (kept for callers that want just one), this surfaces
# all holders — a single backend can have multiple listening fds, and stale
# foreign processes may coexist. Returns nonzero (and prints nothing) if none.
find_pids_on_port() {
  local port=${1:-$CCG_PORT}
  local raw
  if _is_windows_shell; then
    raw=$(_win_pids_on_port "${port}")
  elif command -v lsof >/dev/null 2>&1; then
    raw=$(lsof -ti "TCP:${port}" -sTCP:LISTEN 2>/dev/null) || return 1
  elif command -v netstat >/dev/null 2>&1; then
    raw=$(netstat -anp 2>/dev/null | awk -v p=":${port}" '$4 ~ p {print $7}' | sed 's|/.*||' | grep -E '^[0-9]+$')
  else
    return 1
  fi

  [[ -n "$raw" ]] || return 1

  local pid found=0 seen=" "
  while IFS= read -r pid; do
    [[ "$pid" =~ ^[0-9]+$ ]] || continue
    case "$seen" in
      *" $pid "*) continue ;;  # dedupe
    esac
    seen="$seen$pid "
    printf '%s\n' "$pid"
    found=1
  done <<< "$raw"

  (( found )) && return 0 || return 1
}
