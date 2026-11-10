#!/usr/bin/env bats
# Tests for cli/lib/spawn/foreground.sh — restart-loop logic.
#
# Strategy: mock `node` with stub scripts that exit with specific codes.
# _spawn_one_iteration is tested indirectly via _spawn_backend_and_open_browser
# (the public entry point). Internal helpers are overridden as needed.

load 'helpers/common'

setup() {
  isolate_env
  export CCG_LANG=en

  # Source dependencies in the order bin/ccg loads them.
  # shellcheck source=../lib/i18n/index.sh
  source "$CLI_LIB/i18n/index.sh"
  load_locale en

  # browser.sh provides _webview_url and _open_browser.
  # shellcheck source=../lib/browser.sh
  source "$CLI_LIB/browser.sh"

  # port/ provides _kill_pid (used inside trap).
  # shellcheck source=../lib/port/index.sh
  source "$CLI_LIB/port/index.sh"

  # Subject under test.
  # shellcheck source=../lib/spawn/foreground.sh
  source "$CLI_LIB/spawn/foreground.sh"

  # Stub _open_browser so tests run without actually opening a browser.
  _open_browser() {
    printf 'BROWSER:%s\n' "$1" >> "$BATS_TEST_TMPDIR/browser.log"
  }

  # Build a minimal fake cache dir every test can reference.
  export FAKE_CACHE="$BATS_TEST_TMPDIR/cache/0.1.0"
  mkdir -p "$FAKE_CACHE/webview"
  : > "$FAKE_CACHE/backend.mjs"
  : > "$FAKE_CACHE/webview/index.html"
}

# ── helpers ────────────────────────────────────────────────────────────────────

# Make a fake node binary that emits PORT:19836 then exits with $1.
_make_node_stub() {
  local exit_code=$1
  cat > "$MOCK_BIN/node" <<EOF
#!/usr/bin/env bash
printf 'PORT:19836\n'
sleep 0.05
exit $exit_code
EOF
  chmod +x "$MOCK_BIN/node"
}

# Make a fake node binary that exits immediately (no PORT line) with $1.
# Used to simulate crash-before-handshake.
_make_node_fast_exit() {
  local exit_code=$1
  cat > "$MOCK_BIN/node" <<EOF
#!/usr/bin/env bash
exit $exit_code
EOF
  chmod +x "$MOCK_BIN/node"
}

# ── single normal exit (rc=0) ──────────────────────────────────────────────────

@test "rc=0: exits cleanly, returns 0, browser opened once" {
  _make_node_stub 0

  run _spawn_backend_and_open_browser "$FAKE_CACHE"

  [ "$status" -eq 0 ]
  # Browser was opened exactly once.
  [ -f "$BATS_TEST_TMPDIR/browser.log" ]
  [ "$(wc -l < "$BATS_TEST_TMPDIR/browser.log")" -eq 1 ]
}

@test "rc=1 (generic error): exits with rc=1, browser opened once" {
  _make_node_stub 1

  run _spawn_backend_and_open_browser "$FAKE_CACHE"

  [ "$status" -eq 1 ]
  [ -f "$BATS_TEST_TMPDIR/browser.log" ]
  [ "$(wc -l < "$BATS_TEST_TMPDIR/browser.log")" -eq 1 ]
}

# ── restart on rc=75 ──────────────────────────────────────────────────────────
#
# The counting node mocks below ignore `node -e ...`: _ccg_derive_token (lib/browser.sh)
# runs it to compute the auth-token HMAC before any backend is spawned. Counting that call
# as a backend spawn made the first real spawn look like call #2 (exit 0, no restart).

@test "rc=75 once then rc=0: respawns once, returns 0" {
  # Counter file: first call exits 75, second exits 0.
  # Sleep 3s on first call so the crash-loop guard (2s threshold) is NOT triggered.
  local counter_file="$BATS_TEST_TMPDIR/call_count"
  printf '0' > "$counter_file"

  cat > "$MOCK_BIN/node" <<EOF
#!/usr/bin/env bash
if [ "\$1" = "-e" ]; then printf x; exit 0; fi
count=\$(cat "$counter_file")
count=\$((count + 1))
printf '%d' "\$count" > "$counter_file"
printf 'PORT:19836\n'
if [ "\$count" -eq 1 ]; then
  sleep 3
  exit 75
else
  sleep 0.05
  exit 0
fi
EOF
  chmod +x "$MOCK_BIN/node"

  run _spawn_backend_and_open_browser "$FAKE_CACHE"

  [ "$status" -eq 0 ]
  # Browser opened only on first spawn.
  [ -f "$BATS_TEST_TMPDIR/browser.log" ]
  [ "$(wc -l < "$BATS_TEST_TMPDIR/browser.log")" -eq 1 ]
  # Node was called twice.
  [ "$(cat "$counter_file")" -eq 2 ]
}

@test "rc=75 once then rc=0: prints restarting message" {
  local counter_file="$BATS_TEST_TMPDIR/call_count"
  printf '0' > "$counter_file"

  # Sleep 3s on first call so crash-loop guard is not triggered.
  cat > "$MOCK_BIN/node" <<EOF
#!/usr/bin/env bash
if [ "\$1" = "-e" ]; then printf x; exit 0; fi
count=\$(cat "$counter_file")
count=\$((count + 1))
printf '%d' "\$count" > "$counter_file"
printf 'PORT:19836\n'
if [ "\$count" -eq 1 ]; then
  sleep 3
  exit 75
else
  sleep 0.05
  exit 0
fi
EOF
  chmod +x "$MOCK_BIN/node"

  run _spawn_backend_and_open_browser "$FAKE_CACHE"

  [[ "$output" == *"Restarting"* ]] || [[ "$output" == *"restart"* ]]
}

@test "rc=75 twice then rc=0: respawns twice, returns 0, browser opened once" {
  local counter_file="$BATS_TEST_TMPDIR/call_count"
  printf '0' > "$counter_file"

  # Each 75-exit call sleeps 3s so crash-loop guard is not triggered.
  cat > "$MOCK_BIN/node" <<EOF
#!/usr/bin/env bash
if [ "\$1" = "-e" ]; then printf x; exit 0; fi
count=\$(cat "$counter_file")
count=\$((count + 1))
printf '%d' "\$count" > "$counter_file"
printf 'PORT:19836\n'
if [ "\$count" -le 2 ]; then
  sleep 3
  exit 75
else
  sleep 0.05
  exit 0
fi
EOF
  chmod +x "$MOCK_BIN/node"

  run _spawn_backend_and_open_browser "$FAKE_CACHE"

  [ "$status" -eq 0 ]
  [ -f "$BATS_TEST_TMPDIR/browser.log" ]
  [ "$(wc -l < "$BATS_TEST_TMPDIR/browser.log")" -eq 1 ]
  [ "$(cat "$counter_file")" -eq 3 ]
}

# ── crash-loop guard ───────────────────────────────────────────────────────────

@test "crash-loop guard: rc=75 with no delay aborts with rc=1" {
  # Node exits 75 immediately (no sleep), causing elapsed < 2s.
  _make_node_fast_exit 75

  run _spawn_backend_and_open_browser "$FAKE_CACHE"

  [ "$status" -eq 1 ]
  [[ "$output" == *"crash loop"* ]] || [[ "$output" == *"crash"* ]] || [[ "$output" == *"quickly"* ]]
}

@test "crash-loop guard: error message goes to stderr" {
  _make_node_fast_exit 75

  # Capture stderr separately.
  run bash -c "
    source '$CLI_LIB/i18n/index.sh'
    load_locale en
    source '$CLI_LIB/browser.sh'
    source '$CLI_LIB/port/index.sh'
    source '$CLI_LIB/spawn/foreground.sh'
    _open_browser() { :; }
    _spawn_backend_and_open_browser '$FAKE_CACHE' 2>'$BATS_TEST_TMPDIR/stderr.txt'
  "

  [ -f "$BATS_TEST_TMPDIR/stderr.txt" ]
  grep -qi "crash\|quickly\|loop\|abort" "$BATS_TEST_TMPDIR/stderr.txt"
}

# ── browser not reopened on restart ───────────────────────────────────────────

@test "browser is NOT opened again after restart" {
  local counter_file="$BATS_TEST_TMPDIR/call_count"
  printf '0' > "$counter_file"

  # rc=75 on first call, rc=0 on second. Sleep long enough to clear crash guard.
  cat > "$MOCK_BIN/node" <<EOF
#!/usr/bin/env bash
if [ "\$1" = "-e" ]; then printf x; exit 0; fi
count=\$(cat "$counter_file")
count=\$((count + 1))
printf '%d' "\$count" > "$counter_file"
printf 'PORT:19836\n'
sleep 0.05
if [ "\$count" -eq 1 ]; then
  sleep 3
  exit 75
else
  exit 0
fi
EOF
  chmod +x "$MOCK_BIN/node"

  _spawn_backend_and_open_browser "$FAKE_CACHE" >"$BATS_TEST_TMPDIR/spawn.out" 2>&1
  local rc=$?

  [ "$rc" -eq 0 ]
  [ -f "$BATS_TEST_TMPDIR/browser.log" ]
  # Exactly one browser open call despite two spawns.
  [ "$(wc -l < "$BATS_TEST_TMPDIR/browser.log")" -eq 1 ]
}

# ── PORT handshake still triggers backend_started message ─────────────────────

@test "PORT line triggers backend_started message on first spawn" {
  _make_node_stub 0

  _spawn_backend_and_open_browser "$FAKE_CACHE" >"$BATS_TEST_TMPDIR/spawn.out" 2>&1

  grep -q "Backend ready" "$BATS_TEST_TMPDIR/spawn.out"
}
