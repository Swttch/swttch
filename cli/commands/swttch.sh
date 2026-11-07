#!/usr/bin/env bash
# commands/swttch.sh — `swttch`: the umbrella entry point (bin/swttch).
#
# `swttch` has no default action: the browser launcher and the future desktop app are
# peers (`swttch browser`, `swttch desktop`), so a bare `swttch` only prints help. Every
# other subcommand is the same module `ccg` uses. `ccg` keeps working as the deprecated
# name of `swttch browser`.

cmd_swttch_help() {
  t swttch_usage_header
  printf '\n\n'
  t help_swttch_body
  printf '\n'
}

swttch_main() {
  local cmd=${1:-help}
  shift || true

  case "$cmd" in
    browser)       cmd_run "$@" ;;
    desktop)       printf '%s\n' "$(t desktop_not_available)" >&2; return 1 ;;
    list|ls)       cmd_list "$@" ;;
    account|acct)  cmd_account "$@" ;;
    update)        cmd_update "$@" ;;
    stop)          cmd_stop "$@" ;;
    version|--version|-v) cmd_version "$@" ;;
    doctor)        cmd_doctor "$@" ;;
    self-update)   cmd_self_update "$@" ;;
    uninstall)     cmd_uninstall "$@" ;;
    help|--help|-h) cmd_swttch_help ;;
    *)
      printf '%s\n' "$(t unknown_command "$cmd")" >&2
      cmd_swttch_help >&2
      return 1
      ;;
  esac
}
