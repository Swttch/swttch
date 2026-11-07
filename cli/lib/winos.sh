#!/usr/bin/env bash
# winos.sh — Windows (Git Bash / MSYS / Cygwin) replacements for the unix process
# and port tools that `ccg list` / `ccg stop` rely on.
#
# Git Bash has no `lsof`, its `ps` only knows MSYS processes (our backend is a
# native Windows `node.exe`), and `kill` cannot signal a Windows PID. So on those
# shells every PID in ccg is a *Windows* PID, read from PowerShell / netstat and
# signalled with taskkill. Callers keep using the same seams (_ps_raw,
# _pid_alive, find_pids_on_port, _lsof_listen_for_pid, _kill_proc); each seam
# branches here only when `_is_windows_shell` is true.
#
# External-command seams (overridable by tests): powershell.exe, netstat,
# taskkill, tasklist (PATH override), and _is_windows_shell (function override).

# 0 when running under Git Bash / MSYS / Cygwin.
_is_windows_shell() {
  case "$(uname -s 2>/dev/null)" in
    MINGW*|MSYS*|CYGWIN*) return 0 ;;
    *) return 1 ;;
  esac
}

# Process table as "PID PPID NAME ARGS" lines, same shape `ps -axo pid=,ppid=,command=`
# gives on unix. The first command-line token (the quoted exe path) is replaced
# by the process name (e.g. node.exe) and backslashes become slashes so the
# backend-detect predicates see a unix-looking command.
_win_ps_raw() {
  powershell.exe -NoProfile -NonInteractive -Command '
    Get-CimInstance Win32_Process | ForEach-Object {
      $c = $_.CommandLine
      if (-not $c) { $a = "" }
      elseif ($c.StartsWith([string][char]34)) { $a = $c.Substring($c.IndexOf([char]34, 1) + 1).Trim() }
      else { $j = $c.IndexOf(" "); if ($j -ge 0) { $a = $c.Substring($j + 1) } else { $a = "" } }
      "{0} {1} {2} {3}" -f $_.ProcessId, $_.ParentProcessId, $_.Name, $a.Replace("\", "/")
    }' 2>/dev/null | tr -d '\r'
}

# "PID<TAB>ADDR:PORT" for every listening TCP socket (netstat -ano).
_win_listen_table() {
  netstat -ano 2>/dev/null | tr -d '\r' \
    | awk '$1 == "TCP" && $4 == "LISTENING" { printf "%s\t%s\n", $5, $2 }'
}

# PIDs listening on <port>, one per line (deduplicated by the caller).
_win_pids_on_port() {
  local port=$1
  _win_listen_table | awk -F'\t' -v p=":${port}" '{ n = length($2); if (substr($2, n - length(p) + 1) == p) print $1 }'
}

# lsof-shaped rows for <pid>, so port/lsof.sh can parse them unchanged.
_win_listen_rows_for_pid() {
  local pid=$1
  _win_listen_table | awk -F'\t' -v pid="$pid" '$1 == pid { printf "node %s - TCP %s (LISTEN)\n", $1, $2 }'
}

# 0 if the Windows PID still exists.
_win_pid_alive() {
  MSYS_NO_PATHCONV=1 tasklist /FI "PID eq $1" /NH /FO CSV 2>/dev/null | grep -q "\"$1\""
}

# Signal shim for Windows PIDs: `-KILL` forces, anything else asks politely
# (a console-less node ignores the polite request, so callers escalate to -KILL).
_win_kill() {
  local force=0 pid
  while (( $# > 0 )); do
    case "$1" in
      -KILL|-9|-SIGKILL) force=1 ;;
      -*) ;;
      *) pid=$1 ;;
    esac
    shift
  done
  [[ -n "${pid:-}" ]] || return 1
  if (( force )); then
    MSYS_NO_PATHCONV=1 taskkill /PID "$pid" /F >/dev/null 2>&1
  else
    MSYS_NO_PATHCONV=1 taskkill /PID "$pid" >/dev/null 2>&1
  fi
}
