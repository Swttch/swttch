#!/usr/bin/env bash
# runtime.sh — manage cached Standalone-mode runtimes under
# $CCG_HOME/runtimes/<version>/. Each cache holds the backend.mjs + webview
# pair that ccg spawns in Standalone mode.
#
# Public API:
#   runtime_cache_dir <version>   → echoes absolute cache path
#   runtime_is_cached <version>   → 0 if valid runtime present, else 1
#   runtime_list_cached           → echoes one version per line (semver-sorted)
#   runtime_asset_url <version>   → echoes GitHub release download URL for
#                                    claude-code-gui-standalone-v<ver>.tgz
#   runtime_download <version>    → fetches + extracts (or cleans up on failure)
#
# CCG_HOME defaults to ~/.claude-code-gui; CCG_RELEASE_REPO defaults to upstream.

: "${CCG_HOME:=$HOME/.claude-code-gui}"
: "${CCG_RELEASE_REPO:=Swttch/swttch}"

# Strip leading 'v' from a version string.
_strip_v() {
  local v=${1#v}
  printf '%s' "$v"
}

runtime_cache_dir() {
  local v
  v=$(_strip_v "$1")
  printf '%s' "$CCG_HOME/runtimes/$v"
}

runtime_is_cached() {
  local v dir
  v=$(_strip_v "$1")
  dir=$(runtime_cache_dir "$v")
  # account-cli.mjs (added alongside backend.mjs) is required so a runtime cached
  # before the account feature shipped re-downloads instead of failing `ccg account`.
  [[ -f "$dir/backend.mjs" && -f "$dir/account-cli.mjs" && -d "$dir/webview" ]]
}

runtime_list_cached() {
  local base="$CCG_HOME/runtimes"
  [[ -d "$base" ]] || return 0

  local entry name
  for entry in "$base"/*; do
    [[ -d "$entry" ]] || continue
    name=$(basename "$entry")
    # Only list entries that look properly cached
    if [[ -f "$entry/backend.mjs" && -f "$entry/account-cli.mjs" && -d "$entry/webview" ]]; then
      printf '%s\n' "$name"
    fi
  # Semver-aware sort (-V), so callers that take the last line as "newest"
  # (e.g. `ccg account`'s helper lookup) get 0.10.0 after 0.9.0, not before it.
  done | sort -V
}

runtime_asset_url() {
  local v
  v=$(_strip_v "$1")
  printf 'https://github.com/%s/releases/download/v%s/claude-code-gui-standalone-v%s.tgz' \
    "$CCG_RELEASE_REPO" "$v" "$v"
}

# Download + extract. Cleans up the cache directory if either step fails,
# leaving the cache in a consistent state (caller can retry).
runtime_download() {
  local v url cache_dir
  v=$(_strip_v "$1")
  url=$(runtime_asset_url "$v")
  cache_dir=$(runtime_cache_dir "$v")

  mkdir -p "$cache_dir"

  # Subshell confines pipefail so we detect curl failures even when piped to tar.
  if ! (
    set -o pipefail
    curl -fsSL --max-time 120 "$url" | tar -xz -C "$cache_dir"
  ); then
    rm -rf "$cache_dir"
    return 1
  fi
  return 0
}
