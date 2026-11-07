#!/usr/bin/env bats
# Tests for cli/lib/port.sh

load 'helpers/common'

setup() {
  isolate_env
  # version.sh provides parse_backend_version, which port uses
  # shellcheck source=../lib/version.sh
  source "$CLI_LIB/version.sh"
  # proc provides _snap_or_capture / collect_descendants used by the port
  # tree-mapping helpers (port_for_tree, confirm_root_via_port).
  # shellcheck source=../lib/proc/index.sh
  source "$CLI_LIB/proc/index.sh"
  # shellcheck source=../lib/port/index.sh
  source "$CLI_LIB/port/index.sh"
}

# ─── port_status: free | ours | foreign ───────────────────────

@test "port_status: free when curl fails and lsof finds nothing" {
  mock_cmd_with_logic curl 'exit 7'
  mock_cmd_with_logic lsof 'exit 1'
  run port_status
  [ "$status" -eq 0 ]
  [ "$output" = "free" ]
}

@test "port_status: ours when /version returns valid JSON" {
  mock_cmd_with_logic curl '
    case "$*" in
      *127.0.0.1:19836/version*) printf "%s" "{\"version\":\"0.15.0\"}" ;;
      *) exit 1 ;;
    esac
  '
  mock_cmd_with_logic lsof 'exit 0'
  run port_status
  [ "$status" -eq 0 ]
  [ "$output" = "ours" ]
}

@test "port_status: foreign when /version unreachable but lsof finds a process" {
  mock_cmd_with_logic curl 'exit 7'
  mock_cmd_with_logic lsof 'printf "%s\n" "12345"'
  run port_status
  [ "$status" -eq 0 ]
  [ "$output" = "foreign" ]
}

@test "port_status: foreign when /version returns non-JSON HTML (e.g. some other server)" {
  mock_cmd_with_logic curl '
    case "$*" in
      *127.0.0.1:19836/version*) printf "%s" "<html>404</html>" ;;
      *) exit 1 ;;
    esac
  '
  mock_cmd_with_logic lsof 'printf "%s\n" "12345"'
  run port_status
  [ "$status" -eq 0 ]
  [ "$output" = "foreign" ]
}

# ─── get_backend_version_via_port ─────────────────────────────

@test "get_backend_version_via_port: returns version on success" {
  mock_cmd_with_logic curl '
    case "$*" in
      *127.0.0.1:19836/version*) printf "%s" "{\"version\":\"0.15.0\"}" ;;
      *) exit 1 ;;
    esac
  '
  run get_backend_version_via_port
  [ "$status" -eq 0 ]
  [ "$output" = "0.15.0" ]
}

@test "get_backend_version_via_port: returns nonzero when unreachable" {
  mock_cmd_with_logic curl 'exit 7'
  run get_backend_version_via_port
  [ "$status" -ne 0 ]
}

@test "get_backend_version_via_port: returns nonzero when response not parseable" {
  mock_cmd_with_logic curl 'printf "%s" "<html>404</html>"'
  run get_backend_version_via_port
  [ "$status" -ne 0 ]
}

# ─── find_pid_on_port: extract PIDs from lsof output ──────────

@test "find_pid_on_port: returns single PID from lsof -ti" {
  mock_cmd_with_logic lsof 'printf "%s\n" "54321"'
  run find_pid_on_port
  [ "$status" -eq 0 ]
  [ "$output" = "54321" ]
}

@test "find_pid_on_port: returns first PID if multiple" {
  mock_cmd_with_logic lsof 'printf "%s\n%s\n" "11111" "22222"'
  run find_pid_on_port
  [ "$status" -eq 0 ]
  # Pick whatever the implementation chooses, but must be one of them
  [[ "$output" == "11111" || "$output" == "22222" ]]
}

@test "find_pid_on_port: nonzero when no process found" {
  mock_cmd_with_logic lsof 'exit 1'
  run find_pid_on_port
  [ "$status" -ne 0 ]
  [ -z "$output" ]
}

# ─── find_pids_on_port: ALL listening PIDs (multi-line) ───────────

@test "find_pids_on_port: returns every PID listening on the port" {
  mock_cmd_with_logic lsof 'printf "%s\n%s\n" "11111" "22222"'
  run find_pids_on_port
  [ "$status" -eq 0 ]
  [[ "$output" == *"11111"* ]]
  [[ "$output" == *"22222"* ]]
}

@test "find_pids_on_port: single PID still works" {
  mock_cmd_with_logic lsof 'printf "%s\n" "54321"'
  run find_pids_on_port
  [ "$status" -eq 0 ]
  [ "$output" = "54321" ]
}

@test "find_pids_on_port: nonzero + empty when none listening" {
  mock_cmd_with_logic lsof 'exit 1'
  run find_pids_on_port
  [ "$status" -ne 0 ]
  [ -z "$output" ]
}

@test "find_pids_on_port: filters out non-numeric noise lines" {
  mock_cmd_with_logic lsof 'printf "%s\n%s\n%s\n" "11111" "garbage" "22222"'
  run find_pids_on_port
  [ "$status" -eq 0 ]
  [[ "$output" == *"11111"* ]]
  [[ "$output" == *"22222"* ]]
  [[ "$output" != *"garbage"* ]]
}

# ─── graceful_kill_port: send SIGTERM, escalate if needed ────

@test "graceful_kill_port: returns 0 when no process to kill" {
  mock_cmd_with_logic lsof 'exit 1'
  # kill should never be called in this case, but mock it just in case
  mock_cmd_with_logic kill 'exit 0'
  run graceful_kill_port
  [ "$status" -eq 0 ]
}

@test "graceful_kill_port: sends SIGTERM to discovered PID" {
  # lsof returns a PID once, then "no process" so loop exits quickly
  cat > "$MOCK_BIN/lsof" <<EOF
#!/usr/bin/env bash
if [[ -f "$BATS_TEST_TMPDIR/kill.log" ]]; then exit 1; fi
printf '%s\n' "99999"
EOF
  chmod +x "$MOCK_BIN/lsof"

  # Override the function seam directly (works because we call
  # graceful_kill_port in the same shell, not via `run`).
  _kill_pid() {
    printf '%s\n' "$*" >> "$BATS_TEST_TMPDIR/kill.log"
  }

  graceful_kill_port
  [ "$?" -eq 0 ]
  [ -f "$BATS_TEST_TMPDIR/kill.log" ]
  grep -q -- '-TERM 99999' "$BATS_TEST_TMPDIR/kill.log"
}

@test "graceful_kill_port: signals EVERY listening PID, not just the first" {
  # lsof returns two PIDs the first time, then nothing (so the wait loop ends).
  cat > "$MOCK_BIN/lsof" <<EOF
#!/usr/bin/env bash
if [[ -f "$BATS_TEST_TMPDIR/kill.log" ]]; then exit 1; fi
printf '%s\n%s\n' "88888" "99999"
EOF
  chmod +x "$MOCK_BIN/lsof"

  _kill_pid() {
    printf '%s\n' "$*" >> "$BATS_TEST_TMPDIR/kill.log"
  }

  graceful_kill_port
  [ "$?" -eq 0 ]
  grep -q -- '-TERM 88888' "$BATS_TEST_TMPDIR/kill.log"
  grep -q -- '-TERM 99999' "$BATS_TEST_TMPDIR/kill.log"
}

# ─── only LISTENing sockets own a port ────────────────────────

@test "find_pids_on_port: asks lsof for LISTENing sockets only, so a client that merely connects is not an owner" {
  # lsof lists a stuck curl (SYN_SENT) or a reconnecting browser unless it is told -sTCP:LISTEN.
  mock_cmd_with_logic lsof 'case "$*" in *-sTCP:LISTEN*) exit 1 ;; *) printf "%s\n" "999" ;; esac'
  run find_pids_on_port 19836
  [ "$status" -eq 1 ]
  [ -z "$output" ]
}

@test "port_status: free when only a client (not a listener) touches the port" {
  mock_cmd_with_logic curl 'exit 7'
  mock_cmd_with_logic lsof 'case "$*" in *-sTCP:LISTEN*) exit 1 ;; *) printf "%s\n" "999" ;; esac'
  run port_status
  [ "$output" = "free" ]
}
