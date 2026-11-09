#!/usr/bin/env bash
# commands/self-update.sh — `ccg self-update`: re-run the install script to
# update ccg itself.

cmd_self_update_help() {
  printf '%s\n\n' "$(t help_self_update_header)"
  printf '%b\n' "$(t help_self_update_body)"
}

cmd_self_update() {
  local arg yes=()
  for arg in "$@"; do
    case "$arg" in
      -h|--help) cmd_self_update_help; return 0 ;;
      -y|--yes)  yes=(-y) ;;
    esac
  done

  local url="https://raw.githubusercontent.com/${CCG_RELEASE_REPO:-Swttch/swttch}/main/cli/install.sh"
  # `bash -s --` hands -y to install.sh, which then skips the overwrite question.
  curl -fsSL "$url" | bash -s -- ${yes[@]+"${yes[@]}"}
}
