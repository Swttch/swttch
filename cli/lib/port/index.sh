#!/usr/bin/env bash
# port/index.sh — inspect and control the backend's TCP port.
#
# Entry/barrel for the port module. Sources its siblings (status probing,
# listener discovery, termination, pid↔port mapping).
#
# Public API:
#   port_status                       → "free" | "ours" | "foreign"
#   get_backend_version_via_port      → echoes "x.y.z" or returns 1
#   find_pid_on_port                  → echoes first PID or returns 1
#   find_pids_on_port [port]          → echoes every listening PID or returns 1
#   graceful_kill_port [timeout_sec]  → SIGTERM then SIGKILL after timeout
#   listen_ports_for_pid <pid>        → ports a pid listens on (one/line)
#   port_for_pid <pid> [want]         → first port a pid listens on (or filter)
#   port_for_tree <root> [snap] [want]→ port held by root or any descendant
#   confirm_root_via_port <root> [snap] [port] → "confirmed" | "unconfirmed"
#
# Requires version.sh (parse_backend_version) and proc/* (collect_descendants)
# sourced first.

: "${CCG_PORT:=19836}"

# Windows (Git Bash) replacements for lsof / kill, used behind the same seams.
# shellcheck source=../winos.sh
source "$(dirname "${BASH_SOURCE[0]}")/../winos.sh"

_port_dir="$(dirname "${BASH_SOURCE[0]}")"
# shellcheck source=./status.sh
source "$_port_dir/status.sh"
# shellcheck source=./discover.sh
source "$_port_dir/discover.sh"
# shellcheck source=./kill.sh
source "$_port_dir/kill.sh"
# shellcheck source=./lsof.sh
source "$_port_dir/lsof.sh"
# shellcheck source=./tree.sh
source "$_port_dir/tree.sh"
unset _port_dir
