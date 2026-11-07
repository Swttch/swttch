#!/usr/bin/env bash
# port/lsof.sh — map a single pid to the port(s) it listens on (forward:
# pid → ports). Sourced by port/index.sh.

# Raw `lsof` rows describing the TCP ports a SINGLE pid listens on. This is the
# forward direction (pid → ports), unlike find_pids_on_port which is the reverse
# (port → pids). We must not assume the port is 19836: a dev backend can listen
# on any port. Each emitted row has the shape
#   node 10703 user 23u IPv4 0x… 0t0 TCP 127.0.0.1:9999 (LISTEN)
# Wrapped as a function so bats can mock it (PATH override works for `lsof`).
# The `-a` flag ANDs the selection filters: without it lsof ORs `-p <pid>` with
# `-iTCP`, returning EVERY listening socket on the host (not just this pid's),
# which would surface a stranger's port. `-a` restricts the result to sockets
# that are BOTH owned by <pid> AND listening TCP.
_lsof_listen_for_pid() {
  if _is_windows_shell; then _win_listen_rows_for_pid "$1"; return; fi
  lsof -nP -a -p "$1" -iTCP -sTCP:LISTEN 2>/dev/null
}

# Echo every TCP port <pid> listens on, one per line (empty if none). Parses the
# `lsof` rows from _lsof_listen_for_pid, taking the numeric tail of each
# `host:PORT (LISTEN)` NAME field. De-duplicates. The whole point is that we
# DISCOVER the actual port — 19836, 9999, or anything else — rather than
# assuming a fixed value.
listen_ports_for_pid() {
  local pid=$1
  local raw
  raw=$(_lsof_listen_for_pid "$pid") || return 0
  [[ -n "$raw" ]] || return 0

  local line name hostport port seen=" "
  while IFS= read -r line; do
    # The address is the last whitespace-separated token before "(LISTEN)";
    # take the final ":PORT" of the NAME column.
    case "$line" in
      *"(LISTEN)"*) ;;
      *) continue ;;
    esac
    # NAME is the last field containing a ':' before the "(LISTEN)" marker.
    # Strip the trailing " (LISTEN)" then take the substring after the last ':'.
    hostport=${line%%" (LISTEN)"*}
    hostport=${hostport##* }       # last whitespace token → host:port
    port=${hostport##*:}           # after the final ':'
    [[ "$port" =~ ^[0-9]+$ ]] || continue
    case "$seen" in
      *" $port "*) continue ;;
    esac
    seen="$seen$port "
    printf '%s\n' "$port"
  done <<< "$raw"
  return 0
}

# Echo the (first) TCP port <pid> actually listens on; empty otherwise.
# No fixed-port assumption — the pid is asked directly via the lsof seam. An
# optional second argument acts as a FILTER: when given, the port is echoed only
# if the pid genuinely listens on it (preserves callers that probe a specific
# port).
port_for_pid() {
  local pid=$1
  local want=${2:-}
  local p
  while IFS= read -r p; do
    [[ -n "$p" ]] || continue
    if [[ -n "$want" ]]; then
      [[ "$p" == "$want" ]] || continue
    fi
    printf '%s' "$p"
    return 0
  done <<< "$(listen_ports_for_pid "$pid")"
  return 0
}
