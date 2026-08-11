#!/usr/bin/env bash
# install.sh — bootstrap installer for the ccg CLI.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Swttch/swttch/main/cli/install.sh | bash
#
# What it does:
#   1. Checks for curl + tar.
#   2. Resolves latest release tag from GitHub.
#   3. Downloads ccg-v<ver>.tar.gz and extracts to ~/.claude-code-gui/.
#   4. Sources lib/install_util.sh to add ~/.claude-code-gui/bin to PATH
#      via an idempotent marker block in the user's shell rc file.
#   5. Writes .ccg-version stamp.
#
# Env overrides:
#   CCG_HOME            — installation root (default: ~/.claude-code-gui)
#   CCG_RELEASE_REPO    — GitHub owner/repo (default: Swttch/swttch)
#   CCG_VERSION         — pin to a specific version (default: latest)
#
# This installer is intentionally English-only. Once ccg is installed,
# the CLI itself respects $LANG / $CCG_LANG.

set -euo pipefail

CCG_HOME="${CCG_HOME:-$HOME/.claude-code-gui}"
CCG_RELEASE_REPO="${CCG_RELEASE_REPO:-Swttch/swttch}"

say() { printf '%s\n' "$*"; }
err() { printf 'Error: %s\n' "$*" >&2; }

# ─── 1. pre-checks ───────────────────────────────────────────

for cmd in curl tar; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    err "'$cmd' is required but not installed."
    exit 1
  fi
done

# ─── 2. resolve latest version (or honor CCG_VERSION override) ───

if [[ -n "${CCG_VERSION:-}" ]]; then
  version="${CCG_VERSION#v}"
else
  say "Looking up latest release from $CCG_RELEASE_REPO..."
  api_url="https://api.github.com/repos/${CCG_RELEASE_REPO}/releases/latest"
  api_body=$(curl -fsSL --max-time 10 "$api_url" 2>/dev/null) || {
    err "Could not fetch latest release. Network problem?"
    exit 1
  }
  if [[ "$api_body" =~ \"tag_name\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
    tag="${BASH_REMATCH[1]}"
    version="${tag#v}"
  else
    err "Could not parse release tag from API response."
    exit 1
  fi
fi

say "Installing claude-code-gui (ccg) v${version}..."

# ─── 3. confirm overwrite if already installed ─────────────────

if [[ -f "$CCG_HOME/.ccg-version" ]]; then
  existing=$(cat "$CCG_HOME/.ccg-version" 2>/dev/null || printf 'unknown')
  printf 'Existing installation v%s detected. Overwrite? (Y/n): ' "$existing"
  # `curl | bash` makes stdin a pipe (not a TTY), so [[ -t 0 ]] is false even
  # when a human is at the keyboard. Read from /dev/tty so the prompt is
  # honored. Only when /dev/tty is unreadable (true non-interactive env like
  # CI) do we default to Y.
  if [[ -r /dev/tty ]]; then
    read -r answer < /dev/tty
  else
    answer="Y"
    say "(no TTY available; proceeding with Y)"
  fi
  case "${answer:-Y}" in
    n|N|no|NO) say "Aborted."; exit 0 ;;
  esac
fi

# ─── 4. download + extract ─────────────────────────────────────

mkdir -p "$CCG_HOME"
asset_url="https://github.com/${CCG_RELEASE_REPO}/releases/download/v${version}/ccg-cli-v${version}.tar.gz"
say "Downloading $asset_url..."

if ! (
  set -o pipefail
  curl -fsSL --max-time 60 "$asset_url" | tar -xz -C "$CCG_HOME"
); then
  err "Download or extraction failed."
  err "Check that the release v${version} has the asset 'ccg-cli-v${version}.tar.gz' attached."
  exit 1
fi

# Sanity: the bin/ccg must exist after extraction
if [[ ! -x "$CCG_HOME/bin/ccg" ]]; then
  err "Extraction completed but $CCG_HOME/bin/ccg is missing or not executable."
  exit 1
fi

# Stamp version
printf '%s\n' "$version" > "$CCG_HOME/.ccg-version"

# ─── 5. PATH integration via install_util.sh ─────────────────

# install_util.sh was just extracted; source it for the helpers
# shellcheck source=lib/install_util.sh
source "$CCG_HOME/lib/install_util.sh"

shell_info=$(detect_shell_rc)
shell_type="${shell_info%%|*}"
rc_file="${shell_info##*|}"

case "$shell_type" in
  zsh|bash)
    result=$(add_to_path_idempotent "$rc_file" "$CCG_HOME/bin")
    if [[ "$result" = "added" ]]; then
      say "✔ Added $CCG_HOME/bin to PATH via $rc_file"
    else
      say "ℹ PATH entry already present in $rc_file"
    fi
    say ""
    say "✔ Installation complete. Open a new terminal or run:"
    say "    source $rc_file"
    say "Then run: ccg"
    ;;
  fish)
    say "ℹ Fish shell detected. Please run:"
    say "    fish_add_path $CCG_HOME/bin"
    say ""
    say "✔ Installation complete. Then run: ccg"
    ;;
  *)
    say "⚠ Could not auto-detect your shell."
    say "  Please add the following to your shell's startup file:"
    say "    export PATH=\"$CCG_HOME/bin:\$PATH\""
    say ""
    say "✔ Installation complete. Then run: ccg"
    ;;
esac
