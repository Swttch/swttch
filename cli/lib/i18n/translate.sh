#!/usr/bin/env bash
# i18n/translate.sh — the `t` lookup function. Sourced by i18n/index.sh.

t() {
  local key=$1
  shift

  # Auto-load on first call if caller forgot.
  if [[ -z "$CCG_ACTIVE_LOCALE" ]]; then
    load_locale "$(detect_locale)"
  fi

  local var="MSG_${CCG_ACTIVE_LOCALE}_${key}"
  local template="${!var:-}"

  # Fallback to en
  if [[ -z "$template" && "$CCG_ACTIVE_LOCALE" != "en" ]]; then
    var="MSG_en_${key}"
    template="${!var:-}"
  fi

  if [[ -z "$template" ]]; then
    # Visible sentinel for missing keys (development aid)
    printf '<<%s>>' "$key"
    return 0
  fi

  # printf interprets backslash escapes in templates (e.g. \n)
  # shellcheck disable=SC2059
  printf -v _t_out "$template" "$@"
  # `swttch` runs the same modules: mention the program the user typed, not `ccg`.
  if [[ "${CCG_PROGRAM:-ccg}" != "ccg" ]]; then
    _t_out=${_t_out//ccg run/${CCG_PROGRAM} browser}
    _t_out=${_t_out//ccg /${CCG_PROGRAM} }
  fi
  printf '%s' "$_t_out"
}
