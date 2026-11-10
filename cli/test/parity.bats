#!/usr/bin/env bats
# The bash launcher (bin/ccg, bin/swttch) and the Windows PowerShell launcher (win/main.ps1)
# must expose the same commands. A command that exists on one side only is a gap for that
# side's users, so this test fails the moment the two dispatchers drift apart.

load 'helpers/common'

# Command words (without leading dashes) from a bash `case "$cmd" in` block: the labels
# `a|b|c)` at four spaces of indentation.
bash_commands() {
  grep -E '^    [a-z][a-z|-]*\)' "$1" | sed -E 's/^ +//; s/\).*$//' | tr '|' '\n' | grep -v '^-' | sort -u
}

# Command words from the `switch ($cmd)` block of win/main.ps1: the quoted words on the case
# labels at eight spaces of indentation.
win_commands() {
  awk '/^    switch \(\$cmd\) \{/{on=1; next} on && /^    \}/{on=0} on' "$CLI_ROOT/win/main.ps1" \
    | grep -E "^        (\{ \\\$_ -in |')" \
    | grep -oE "'[a-z][a-z-]*'" | tr -d "'" | sort -u
}

@test "parity: ccg and win/main.ps1 expose the same commands" {
  run diff <(bash_commands "$CLI_BIN/ccg" | grep -v '^run$' | sort -u) <(win_commands | grep -v '^run$')
  [ "$status" -eq 0 ] || { echo "$output"; false; }
}

@test "parity: swttch and win/main.ps1 expose the same commands" {
  # swttch.sh spells the browser launcher `browser`; the Windows dispatcher maps it to `run`.
  run diff <(bash_commands "$CLI_COMMANDS/swttch.sh" | grep -vE '^(browser|desktop)$') <(win_commands | grep -v '^run$')
  [ "$status" -eq 0 ] || { echo "$output"; false; }
}

@test "parity: win/main.ps1 has no 'not available yet' stub" {
  # A command that only prints cmd_not_yet is listed in the dispatcher but does nothing.
  run grep -n "cmd_not_yet" "$CLI_ROOT/win/main.ps1"
  [ "$status" -ne 0 ] || { echo "$output"; false; }
}
