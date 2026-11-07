#!/usr/bin/env bats
# Tests for cli/lib/winos.sh — Git Bash / MSYS replacements for ps, lsof and kill.
# The Windows tools (powershell.exe, netstat, taskkill, tasklist) are mocked on PATH
# so the suite runs on any host.

load 'helpers/common'

setup() {
  isolate_env
  export CCG_LOCALES_DIR="$CLI_LOCALES"
  # shellcheck source=../lib/i18n/index.sh
  source "$CLI_LIB/i18n/index.sh"
  load_locale en
  # shellcheck source=../lib/version.sh
  source "$CLI_LIB/version.sh"
  # shellcheck source=../lib/proc/index.sh
  source "$CLI_LIB/proc/index.sh"
  # shellcheck source=../lib/backend-detect/index.sh
  source "$CLI_LIB/backend-detect/index.sh"
  # shellcheck source=../lib/port/index.sh
  source "$CLI_LIB/port/index.sh"
  # shellcheck source=../commands/stop/kill-tree.sh
  source "$CLI_COMMANDS/stop/kill-tree.sh"
  unset CCG_PORT
  CCG_PORT=19836
}

# Make every seam believe it runs under Git Bash.
as_windows() {
  _is_windows_shell() { return 0; }
}

# Real `netstat -ano` shape on Windows (CRLF line endings, IPv4 + IPv6, noise rows).
mock_netstat() {
  cat > "$MOCK_BIN/netstat" <<'EOF'
#!/usr/bin/env bash
printf '\r\nActive Connections\r\n\r\n'
printf '  Proto  Local Address          Foreign Address        State           PID\r\n'
printf '  TCP    127.0.0.1:19836        0.0.0.0:0              LISTENING       34500\r\n'
printf '  TCP    [::]:19836             [::]:0                 LISTENING       34500\r\n'
printf '  TCP    127.0.0.1:19836        127.0.0.1:56126        ESTABLISHED     34500\r\n'
printf '  TCP    127.0.0.1:58489        127.0.0.1:19836        TIME_WAIT       0\r\n'
printf '  TCP    0.0.0.0:119836         0.0.0.0:0              LISTENING       777\r\n'
printf '  TCP    0.0.0.0:9999           0.0.0.0:0              LISTENING       888\r\n'
printf '  UDP    0.0.0.0:19836          *:*                                    999\r\n'
EOF
  chmod +x "$MOCK_BIN/netstat"
}

@test "_is_windows_shell: true for MINGW64, MSYS and CYGWIN, false for Darwin and Linux" {
  mock_cmd_with_logic uname 'echo "${FAKE_UNAME}"'
  FAKE_UNAME="MINGW64_NT-10.0-26200" run _is_windows_shell; [ "$status" -eq 0 ]
  FAKE_UNAME="MSYS_NT-10.0" run _is_windows_shell; [ "$status" -eq 0 ]
  FAKE_UNAME="CYGWIN_NT-10.0" run _is_windows_shell; [ "$status" -eq 0 ]
  FAKE_UNAME="Darwin" run _is_windows_shell; [ "$status" -eq 1 ]
  FAKE_UNAME="Linux" run _is_windows_shell; [ "$status" -eq 1 ]
}

@test "_win_pids_on_port: only LISTENING TCP rows whose local port matches exactly" {
  mock_netstat
  run _win_pids_on_port 19836
  [ "$status" -eq 0 ]
  # IPv4 and IPv6 rows of pid 34500; not 777 (port 119836), not UDP, not TIME_WAIT/ESTABLISHED
  [ "$output" = $'34500\n34500' ]
}

@test "find_pids_on_port: on Windows reads netstat and de-duplicates" {
  as_windows
  mock_netstat
  run find_pids_on_port 19836
  [ "$status" -eq 0 ]
  [ "$output" = "34500" ]
}

@test "find_pids_on_port: on Windows returns 1 when nothing listens" {
  as_windows
  mock_netstat
  run find_pids_on_port 4242
  [ "$status" -eq 1 ]
  [ -z "$output" ]
}

@test "find_pid_on_port: on Windows uses CCG_PORT" {
  as_windows
  mock_netstat
  run find_pid_on_port
  [ "$status" -eq 0 ]
  [ "$output" = "34500" ]
}

@test "listen_ports_for_pid: on Windows maps a pid to its listening ports" {
  as_windows
  mock_netstat
  run listen_ports_for_pid 34500
  [ "$status" -eq 0 ]
  [ "$output" = "19836" ]
  run listen_ports_for_pid 888
  [ "$output" = "9999" ]
}

@test "_ps_raw: on Windows returns the PowerShell table, CR stripped" {
  as_windows
  mock_cmd_with_logic powershell.exe 'printf "34500 25568 node.exe C:/Users/me/ccg/runtimes/0.35.3/backend.mjs\r\n"'
  run _ps_raw
  [ "$status" -eq 0 ]
  [ "$output" = "34500 25568 node.exe C:/Users/me/ccg/runtimes/0.35.3/backend.mjs" ]
}

@test "ps_snapshot + _is_backend_command: a Windows node.exe backend.mjs row is recognized" {
  as_windows
  mock_cmd_with_logic powershell.exe 'printf "34500 25568 node.exe C:/Users/me/ccg/runtimes/0.35.3/backend.mjs\r\n4 0 System \r\n"'
  local snap cmd
  snap=$(ps_snapshot)
  cmd=$(_command_for_pid 34500 "$snap")
  [ "$cmd" = "node.exe C:/Users/me/ccg/runtimes/0.35.3/backend.mjs" ]
  _is_backend_command "$cmd"
}

@test "_exe_is_node: accepts node.exe, still rejects other executables" {
  _exe_is_node "node.exe C:/x/backend.mjs"
  ! _exe_is_node "notnode.exe C:/x/backend.mjs"
  ! _exe_is_node "bash.exe C:/x/backend.mjs"
}

@test "_win_kill: -KILL forces, -TERM does not" {
  mock_cmd_with_logic taskkill 'echo "$*" >> "$BATS_TEST_TMPDIR/taskkill.log"'
  _win_kill -KILL 34500
  _win_kill -TERM 34501
  [ "$(sed -n 1p "$BATS_TEST_TMPDIR/taskkill.log")" = "/PID 34500 /F" ]
  [ "$(sed -n 2p "$BATS_TEST_TMPDIR/taskkill.log")" = "/PID 34501" ]
}

@test "_kill_proc: on Windows goes through taskkill, not the unix kill seam" {
  as_windows
  mock_cmd_with_logic taskkill 'echo "$*" >> "$BATS_TEST_TMPDIR/taskkill.log"'
  _kill_pid() { echo "UNIX KILL $*" >> "$BATS_TEST_TMPDIR/unix.log"; }
  _kill_proc -KILL 34500
  [ "$(cat "$BATS_TEST_TMPDIR/taskkill.log")" = "/PID 34500 /F" ]
  [ ! -e "$BATS_TEST_TMPDIR/unix.log" ]
}

@test "_kill_proc: off Windows delegates to _kill_pid" {
  _is_windows_shell() { return 1; }
  _kill_pid() { echo "UNIX KILL $*" >> "$BATS_TEST_TMPDIR/unix.log"; }
  _kill_proc -TERM 123
  [ "$(cat "$BATS_TEST_TMPDIR/unix.log")" = "UNIX KILL -TERM 123" ]
}

@test "_pid_alive: on Windows follows tasklist output" {
  as_windows
  mock_cmd_with_logic tasklist '[ "$MSYS_NO_PATHCONV" = 1 ] || { echo "mangled: Git Bash would turn /FI into a path"; exit 1; }
    case "$*" in *"PID eq 34500"*) printf "\"node.exe\",\"34500\",\"Console\"\r\n";; *) echo "INFO: No tasks are running which match the specified criteria.";; esac'
  run _pid_alive 34500; [ "$status" -eq 0 ]
  run _pid_alive 1; [ "$status" -ne 0 ]
}

@test "kill_tree --force: on Windows force-kills leaves first, then the root" {
  as_windows
  mock_cmd_with_logic taskkill 'echo "$*" >> "$BATS_TEST_TMPDIR/taskkill.log"'
  local snap=$'100\t1\tnode.exe C:/x/backend.mjs\n110\t100\tclaude.exe\n120\t110\tbash.exe'
  kill_tree 100 "$snap" --force
  [ "$(cat "$BATS_TEST_TMPDIR/taskkill.log")" = $'/PID 120 /F\n/PID 110 /F\n/PID 100 /F' ]
}
