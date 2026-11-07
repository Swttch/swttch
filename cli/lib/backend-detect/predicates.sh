#!/usr/bin/env bash
# backend-detect/predicates.sh — command-shape predicates that recognize a
# backend invocation. Sourced by backend-detect/index.sh.

: "${CCG_BACKEND_MARKER:=backend.mjs}"
# Dev entry: the TypeScript source the backend boots from under tsx/--watch.
: "${CCG_DEV_ENTRY:=server.ts}"

# 0 if the executable (first token) of <command> is node / nodejs / a path
# ending in node. Shared by the prod and dev candidate predicates so they apply
# the same "node actually runs this" strictness.
_exe_is_node() {
  local cmd=$1
  local exe=${cmd%%[[:space:]]*}
  local exe_base=${exe##*/}
  case "$exe_base" in
    node|node.exe|nodejs|node[0-9]*) return 0 ;;
    *) return 1 ;;
  esac
}

# 0 if any whitespace-separated token of <command> is a path whose basename
# equals <marker> exactly (e.g. /x/backend.mjs or bare backend.mjs), guarding
# against substrings like `notes-about-backend.mjs.txt`. Globbing is disabled
# so a token like '*.mjs' is not expanded against the cwd.
_cmd_has_entry_token() {
  local cmd=$1 marker=$2
  local token base
  local had_noglob=0
  case $- in *f*) had_noglob=1 ;; esac
  set -f
  for token in $cmd; do
    token=${token//\"/}   # Windows keeps the quotes around a path in the command line
    base=${token##*/}
    if [[ "$base" == "$marker" ]]; then
      (( had_noglob )) || set +f
      return 0
    fi
  done
  (( had_noglob )) || set +f
  return 1
}

# 0 if <command> is a genuine `node .../backend.mjs` invocation (production
# build), not merely a process whose argv happens to mention the marker (grep,
# an editor, a shell wrapper). Requirements:
#   1. The executable (first token) is node / nodejs / a path ending in node.
#   2. Some token is a path ending in the marker (e.g. /x/backend.mjs) or the
#      bare marker itself.
_is_backend_command() {
  local cmd=$1
  _exe_is_node "$cmd" || return 1
  _cmd_has_entry_token "$cmd" "$CCG_BACKEND_MARKER"
}

# 0 if <command> is a genuine dev-mode backend invocation: node executing the
# TypeScript entry (server.ts) directly, whether under `--import tsx/esm`, a
# `--watch` supervisor, or plainly. Mirrors _is_backend_command's strictness —
# node must actually run the entry, not just mention it (grep/cat/editor).
_is_dev_server_command() {
  local cmd=$1
  _exe_is_node "$cmd" || return 1
  _cmd_has_entry_token "$cmd" "$CCG_DEV_ENTRY"
}

# 0 if <command> is a development watcher/runner that would respawn the backend:
# a `--watch` supervisor, `nodemon`, or a `pnpm|npm|yarn … dev` invocation. Used
# to promote a dev backend's root past these supervisors so termination sticks.
_is_dev_runner_command() {
  local cmd=$1
  case " $cmd " in
    *" --watch "*|*" --watch="*) return 0 ;;
  esac
  case "$cmd" in
    *nodemon*) return 0 ;;
  esac
  # pnpm / npm / yarn invoking a `dev` script. Matches `… dev` as a trailing or
  # mid-line word; covers `pnpm -C backend dev`, `npm run dev`, `yarn dev`.
  case "$cmd" in
    *pnpm*|*npm*|*yarn*)
      case " $cmd " in
        *" dev "*|*" run dev "*) return 0 ;;
      esac
      ;;
  esac
  return 1
}

# 0 if <command> is any backend entry we recognize — production (backend.mjs)
# or dev (server.ts under node). The unit of "candidate" for root discovery.
_is_backend_entry_command() {
  local cmd=$1
  _is_backend_command "$cmd" && return 0
  _is_dev_server_command "$cmd" && return 0
  return 1
}
