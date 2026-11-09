#!/usr/bin/env bats
# Tests for cli/bin/swttch + commands/swttch.sh — the umbrella command.

load 'helpers/common'

# assert_has <text> / assert_lacks <text>: check $output. A function return code is honored by bats on
# bash 3.2, unlike a mid-test [[ ]].
assert_has() { case "$output" in *"$1"*) return 0 ;; *) echo "expected to contain: $1"; echo "got: $output"; return 1 ;; esac; }
assert_lacks() { case "$output" in *"$1"*) echo "expected NOT to contain: $1"; echo "got: $output"; return 1 ;; *) return 0 ;; esac; }

setup() {
  isolate_env
  export CCG_HOME="$BATS_TEST_TMPDIR/ccg-home"
  # shellcheck source=../bin/ccg
  source "$CLI_BIN/ccg"
  # Stand-ins that only record what the dispatcher routed to them.
  cmd_run()    { echo "RUN $*"; }
  cmd_stop()   { echo "STOP $*"; }
  cmd_list()   { echo "LIST $*"; }
  cmd_update() { echo "UPDATE $*"; }
}

@test "swttch with no arguments prints help and starts nothing" {
  CCG_PROGRAM=swttch run swttch_main
  [ "$status" -eq 0 ]
  assert_has "Usage: swttch <command>"
  assert_has "swttch browser"
  assert_lacks "RUN"
}

@test "swttch browser runs the launcher with its arguments" {
  run swttch_main browser -p 20000
  [ "$status" -eq 0 ]
  [ "$output" = "RUN -p 20000" ]
}

@test "swttch routes stop, list and update to their commands" {
  run swttch_main stop --all
  [ "$output" = "STOP --all" ]
  run swttch_main list
  [ "$output" = "LIST " ]
  run swttch_main ls -h
  [ "$output" = "LIST -h" ]
  run swttch_main update
  [ "$output" = "UPDATE " ]
}

@test "swttch desktop says it is not available yet and fails" {
  run swttch_main desktop
  [ "$status" -eq 1 ]
  assert_has "not available yet"
}

@test "swttch with an unknown command fails with the usage" {
  run swttch_main bogus
  [ "$status" -eq 1 ]
  assert_has "Unknown command: bogus"
  assert_has "Usage: swttch <command>"
}

@test "ccg with no arguments still runs the launcher (deprecated name keeps working)" {
  run ccg_main
  [ "$output" = "RUN " ]
}

@test "messages name the program that was invoked" {
  CCG_PROGRAM=swttch run t list_help_hint
  assert_has "'swttch stop'"
  CCG_PROGRAM=ccg run t list_help_hint
  assert_has "'ccg stop'"
  unset CCG_PROGRAM
  run t list_help_hint
  assert_has "'ccg stop'"
}

@test "the swttch executable runs end to end: help, then the unknown-command exit code" {
  run "$CLI_BIN/swttch" --help
  [ "$status" -eq 0 ]
  assert_has "swttch browser"
  run "$CLI_BIN/swttch" frob
  [ "$status" -eq 1 ]
}

@test "swttch names the verb browser, not run, in messages and in the browser help" {
  CCG_PROGRAM=swttch run t err_port_missing_value
  assert_has "swttch browser -p 20000"
  CCG_PROGRAM=swttch run cmd_run_help
  assert_has "swttch browser -p, --port"
  assert_lacks "swttch run"
  assert_lacks "default"
  # the deprecated name keeps its own help
  run cmd_run_help
  assert_has "ccg run"
}

bats_require_minimum_version 1.5.0

# ─── ccg deprecation notice ──────────────────────────────────

@test "ccg prints the deprecation notice on stderr when stderr is a terminal" {
  _ccg_stderr_is_tty() { return 0; }
  run --separate-stderr ccg_main
  [ "$output" = "RUN " ]
  case "$stderr" in *"'ccg' is the old name"*"swttch browser"*) ;; *) echo "stderr: $stderr"; return 1 ;; esac
}

@test "ccg stays silent when stderr is not a terminal (scripts and pipes)" {
  _ccg_stderr_is_tty() { return 1; }
  run --separate-stderr ccg_main
  [ "$output" = "RUN " ]
  [ -z "$stderr" ]
}

@test "CCG_NO_DEPRECATION_NOTICE=1 hides the notice" {
  _ccg_stderr_is_tty() { return 0; }
  CCG_NO_DEPRECATION_NOTICE=1 run --separate-stderr ccg_main
  [ -z "$stderr" ]
}

@test "swttch never prints the deprecation notice" {
  _ccg_stderr_is_tty() { return 0; }
  CCG_PROGRAM=swttch run --separate-stderr swttch_main browser
  [ -z "$stderr" ]
}

@test "the notice is localized (ko) and falls back to en" {
  _ccg_stderr_is_tty() { return 0; }
  CCG_LANG=ko load_locale ko
  run --separate-stderr ccg_main
  case "$stderr" in *"예전 이름"*) ;; *) echo "stderr: $stderr"; return 1 ;; esac
}

# ─── self-update -y ──────────────────────────────────────────

# curl stand-in that serves an "install script" which just echoes the arguments it was given.
mock_install_script() {
  cat > "$MOCK_BIN/curl" <<'MOCK'
#!/usr/bin/env bash
printf 'echo "INSTALL-ARGS:[$*]"\n'
MOCK
  chmod +x "$MOCK_BIN/curl"
}

@test "self-update passes -y through to the install script" {
  mock_install_script
  run cmd_self_update -y
  [ "$status" -eq 0 ]
  assert_has "INSTALL-ARGS:[-y]"
  run cmd_self_update --yes
  assert_has "INSTALL-ARGS:[-y]"
}

@test "self-update without -y passes nothing" {
  mock_install_script
  run cmd_self_update
  assert_has "INSTALL-ARGS:[]"
}

@test "install.sh -y skips the overwrite question" {
  mkdir -p "$CCG_HOME"; printf '0.1.0' > "$CCG_HOME/.ccg-version"
  mock_cmd curl 1 ""   # fail the download: only the overwrite step matters here
  CCG_VERSION=9.9.9 run bash "$CLI_ROOT/install.sh" -y
  assert_has "Overwriting (-y)"
  assert_lacks "Overwrite? (Y/n)"
}

@test "install.sh CCG_YES=1 skips the overwrite question too" {
  mkdir -p "$CCG_HOME"; printf '0.1.0' > "$CCG_HOME/.ccg-version"
  mock_cmd curl 1 ""
  CCG_YES=1 CCG_VERSION=9.9.9 run bash "$CLI_ROOT/install.sh"
  assert_has "Overwriting (-y)"
  assert_lacks "Overwrite? (Y/n)"
}
