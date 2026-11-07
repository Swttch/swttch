#!/usr/bin/env bash
# commands/run/index.sh — `ccg run` (default): port check → version compare →
# spawn backend → open browser. Entry/barrel: defines cmd_run and sources its
# decision-logic sibling.
#
# Requires port/* (port_status, get_backend_version_via_port, graceful_kill_port),
# version.sh (fetch_latest_release_tag), browser.sh, spawn.sh, i18n.sh.

_run_dir="$(dirname "${BASH_SOURCE[0]}")"
# shellcheck source=./decide-action.sh
source "$_run_dir/decide-action.sh"
# shellcheck source=./args.sh
source "$_run_dir/args.sh"
unset _run_dir

cmd_run_help() {
  # `swttch browser` has its own text: it is not the default command, and there is no `run`.
  if [[ "${CCG_PROGRAM:-ccg}" == "swttch" ]]; then
    printf '%s\n\n' "$(t help_browser_header)"
    printf '%b\n' "$(t help_browser_body)"
    return
  fi
  printf '%s\n\n' "$(t help_run_header)"
  printf '%b\n' "$(t help_run_body)"
}

# Default `ccg run` — orchestration. May spawn a long-lived foreground process.
cmd_run() {
  case "${1:-}" in
    -h|--help) cmd_run_help; return 0 ;;
  esac

  # Resolve the port (-p/--port). Empty = keep the current CCG_PORT (default
  # 19836); a value overrides it so port_status/kill/browser + the spawned backend
  # all target the chosen port. Parse this first so the port-probing below uses it.
  local port rc
  port=$(_parse_run_port "$@"); rc=$?
  case "$rc" in
    1) printf '%s\n' "$(t err_port_missing_value)" >&2; return 1 ;;
    2) printf '%s\n' "$(t err_port_invalid)" >&2; return 1 ;;
  esac
  [[ -n "$port" ]] && CCG_PORT=$port

  # Resolve the bind address (-b/--bind, default loopback). A non-loopback bind
  # exposes the backend — which runs `claude` and does file I/O with no auth — to
  # the local network, so we warn explicitly before spawning.
  local bind
  if ! bind=$(_parse_run_bind "$@"); then
    printf '%s\n' "$(t err_bind_missing_value)" >&2
    return 1
  fi
  if ! _bind_is_loopback "$bind"; then
    printf '%b\n' "$(t warn_bind_exposed "$bind")" >&2
  fi

  local status current_ver latest_tag latest_ver action

  status=$(port_status)
  current_ver=$(get_backend_version_via_port 2>/dev/null || printf '')
  latest_tag=$(fetch_latest_release_tag 2>/dev/null || printf '')
  latest_ver=${latest_tag#v}

  action=$(decide_action "$status" "$current_ver" "$latest_ver")

  case "$action" in
    foreign_error)
      printf '%s\n' "$(t err_port_foreign)" >&2
      printf '%s\n' "$(t err_port_foreign_hint)" >&2
      return 1
      ;;
    already_latest)
      printf '%s\n' "$(t running_already "$current_ver")"
      # Backend already running: open the plain URL (no pairing code). Its initial
      # pairing code was already consumed/expired by the first load, and sending a
      # stale code would just fail its single-use redeem (and count toward lockout).
      # The webview reuses the auth token it persisted for this origin on first pair.
      _open_browser "$(_webview_url "$(pwd)")"
      return 0
      ;;
    use_existing)
      printf '%s\n' "$(t running_already "$current_ver")" >&2
      # Backend already running: open the plain URL (see already_latest above).
      _open_browser "$(_webview_url "$(pwd)")"
      return 0
      ;;
    update_prompt)
      printf '%s\n' "$(t update_prompt "$latest_ver" "$current_ver")"
      printf '%b\n' "$(t caution_marketplace)"
      printf '%s' "$(t update_prompt_question)"
      local answer
      read -r answer
      case "${answer:-N}" in
        y|Y|yes|YES)
          graceful_kill_port
          printf '%s\n' "$(t update_killed_old "$latest_ver")"
          _ensure_runtime_and_spawn "$latest_ver" "$bind"
          ;;
        *)
          printf '%s\n' "$(t update_declined "$current_ver")"
          # Kept the running backend: open the plain URL (no pairing code — the
          # webview reuses the token it persisted for this origin on first pair).
          _open_browser "$(_webview_url "$(pwd)")"
          ;;
      esac
      return 0
      ;;
    install_fresh)
      _ensure_runtime_and_spawn "$latest_ver" "$bind"
      return 0
      ;;
    no_release)
      printf '%s\n' "$(t err_no_release)" >&2
      return 1
      ;;
  esac
}
