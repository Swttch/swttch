#!/usr/bin/env bash
# version.sh — semver comparison, /version response parsing,
# and GitHub Releases "latest" tag lookup.
#
# Public API:
#   compare_semver <a> <b>      → echoes "-1" | "0" | "1" (a<b, ==, a>b)
#   parse_backend_version <json> → echoes version string, exit 1 if missing
#   fetch_latest_release_tag    → echoes tag (e.g. "v0.15.0"), exit 1 on failure
#
# Repository can be overridden via CCG_RELEASE_REPO env (for forks).

# Default GitHub repo for releases. Override with CCG_RELEASE_REPO env.
: "${CCG_RELEASE_REPO:=Swttch/swttch}"

# Compare two semver strings. Strips leading 'v' if present.
# Pads shorter to longer with 0s for component-wise comparison.
compare_semver() {
  local a=${1#v}
  local b=${2#v}

  # Split on dots into arrays
  local -a ap bp
  IFS='.' read -r -a ap <<< "$a"
  IFS='.' read -r -a bp <<< "$b"

  local len_a=${#ap[@]}
  local len_b=${#bp[@]}
  local max=$(( len_a > len_b ? len_a : len_b ))

  local i av bv
  for (( i = 0; i < max; i++ )); do
    av=${ap[i]:-0}
    bv=${bp[i]:-0}
    # Numeric compare; non-numeric segments treated as 0
    [[ "$av" =~ ^[0-9]+$ ]] || av=0
    [[ "$bv" =~ ^[0-9]+$ ]] || bv=0
    if (( av < bv )); then
      printf '%s' "-1"
      return 0
    fi
    if (( av > bv )); then
      printf '%s' "1"
      return 0
    fi
  done
  printf '%s' "0"
  return 0
}

# Extract "version" field from a JSON string returned by GET /version.
# Uses regex (no jq dependency). Handles whitespace, key ordering.
parse_backend_version() {
  local input=$1

  if [[ -z "$input" ]]; then
    return 1
  fi

  # Match "version" : "<value>" with optional whitespace.
  # Anchored to a quoted string value.
  if [[ "$input" =~ \"version\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  return 1
}

# Query GitHub Releases API for the latest tag.
# Returns the tag_name (e.g. "v0.15.0") on stdout.
# Exits non-zero on network failure or malformed response.
fetch_latest_release_tag() {
  local url="https://api.github.com/repos/${CCG_RELEASE_REPO}/releases/latest"
  local body

  body=$(curl -fsSL --max-time 10 "$url" 2>/dev/null) || return 1

  if [[ -z "$body" ]]; then
    return 1
  fi

  # Extract tag_name field
  if [[ "$body" =~ \"tag_name\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  return 1
}
