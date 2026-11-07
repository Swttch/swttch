#!/usr/bin/env bash
# English messages (default + fallback locale).
# Variable-prefix pattern for bash 3.2 compatibility:
#   MSG_<locale>_<key>
# shellcheck disable=SC2034

MSG_en_caution_marketplace="⚠  This command only updates the terminal runtime.\n    The JetBrains IDE plugin must be updated separately via the marketplace.\n    (Settings → Plugins → Updates)"

# Status / info
MSG_en_running_already="Already running v%s on port 19836. Opening browser..."
MSG_en_running_already_no_browser="Already running v%s on port 19836."
MSG_en_backend_starting="Starting backend v%s..."
MSG_en_backend_started="Backend ready on port %s."
MSG_en_backend_stopping="Stopping backend (PID %s)..."
MSG_en_backend_stopped="Backend stopped."
MSG_en_opening_browser="Opening %s..."

# Update prompts
MSG_en_update_prompt="A newer version is available: v%s (currently v%s)."
MSG_en_update_prompt_question="Update now? (y/N): "
MSG_en_update_declined="Keeping existing v%s. Opening browser..."
MSG_en_update_killed_old="Stopped old backend. Installing v%s..."

# Port (-p/--port)
MSG_en_err_port_missing_value="Error: -p/--port requires a port number (e.g. ccg run -p 20000)."
MSG_en_err_port_invalid="Error: -p/--port must be a number in 1-65535."

# Bind (-b/--bind)
MSG_en_err_bind_missing_value="Error: -b/--bind requires an address (e.g. ccg run -b 0.0.0.0)."
MSG_en_warn_bind_exposed="WARNING: binding to %s — the backend (runs 'claude' + file I/O, no authentication)\n         will be reachable by other devices on your network. Only do this on a trusted network.\n         If a backend is already running on 127.0.0.1, run 'ccg stop' first so the new bind takes effect."

# Errors
MSG_en_err_port_foreign="Port 19836 is in use by another process (not claude-code-gui)."
MSG_en_err_port_foreign_hint="Please stop that process and try again. (Hint: lsof -i :19836)"
MSG_en_err_node_missing="Node.js is not installed or not on PATH."
MSG_en_err_node_missing_hint="Install Node.js ≥ 18 from https://nodejs.org/ and re-run."
MSG_en_err_download_failed="Failed to download %s"
MSG_en_err_no_release="Could not fetch latest release from GitHub."
MSG_en_err_runtime_missing="Runtime v%s is not in cache and download failed."
MSG_en_err_port_handshake_timeout="Backend did not print PORT within %s seconds."

# Doctor
MSG_en_doctor_header="ccg doctor — environment diagnostics"
MSG_en_doctor_node_ok="✔ node: %s"
MSG_en_doctor_node_missing="✘ node: not found"
MSG_en_doctor_path_ok="✔ ~/.claude-code-gui/bin is on PATH"
MSG_en_doctor_path_missing="✘ ~/.claude-code-gui/bin is NOT on PATH"
MSG_en_doctor_cache_count="ℹ cached runtimes: %s"
MSG_en_doctor_port_free="✔ port 19836 is free"
MSG_en_doctor_port_us="ℹ port 19836: our backend (v%s)"
MSG_en_doctor_port_foreign="✘ port 19836: foreign process"

# Version
MSG_en_version_ccg="ccg version: %s"
MSG_en_version_runtime_cached="cached runtime(s): %s"
MSG_en_version_runtime_none="cached runtime(s): (none)"
MSG_en_version_backend_running="running backend: v%s on port 19836"
MSG_en_version_backend_none="running backend: (none)"

# Install / uninstall
MSG_en_install_welcome="Installing claude-code-gui (ccg) v%s..."
MSG_en_install_path_added="Added %s to PATH via %s"
MSG_en_install_path_already="PATH entry already present in %s"
MSG_en_install_done="✔ Installation complete. Open a new terminal or run: source %s"
MSG_en_install_done_then="Then run: ccg"
MSG_en_install_overwrite_prompt="Existing installation v%s detected. Overwrite? (Y/n): "
MSG_en_uninstall_removing="Removing %s..."
MSG_en_uninstall_path_removed="Removed PATH entry from %s"
MSG_en_uninstall_done="✔ Uninstall complete. You may close any open ccg sessions."

# List (process tree)
MSG_en_list_header="claude-code-gui backend processes:"
MSG_en_list_none="No claude-code-gui backend process is currently running."
MSG_en_list_root_with_port="● PID %s  port %s%s  [%s/%s]"
MSG_en_list_root_no_port="● PID %s  [%s/%s]"
MSG_en_list_port_confirmed=" ✔"
MSG_en_list_port_unconfirmed=" ?"
MSG_en_list_child="    └─ PID %s  %s"
MSG_en_list_zombie_hint="(zombie — kill its parent to reap it)"
MSG_en_list_help_hint="Use 'ccg stop' to terminate the backend tree on port 19836."

# Stop (process tree termination)
MSG_en_stop_none="No backend is running on port %s."
MSG_en_stop_target="Stopping backend tree rooted at PID %s..."
MSG_en_stop_done="Backend tree stopped."
MSG_en_stop_force="Force mode: sending SIGKILL immediately (no graceful shutdown)."
MSG_en_stop_all_prompt="This will stop ALL backend.mjs trees (%s found), including IDE-managed ones. Continue? (y/N): "
MSG_en_stop_all_none="No backend.mjs trees found to stop."
MSG_en_stop_no_roots="No backend.mjs trees found."
MSG_en_stop_not_ours="⚠  PID %s does not belong to a claude-code-gui backend tree."
MSG_en_stop_not_ours_prompt="Kill it (and its children) anyway? (y/N): "
MSG_en_stop_aborted="Aborted. Nothing was stopped."

# Doctor (backend process hint)
MSG_en_doctor_backend_count="ℹ %s backend.mjs process(es) detected — run 'ccg list' for the tree"
MSG_en_doctor_backend_warn="⚠ %s backend.mjs processes detected — run 'ccg list' to inspect"

# Help: list / stop
MSG_en_help_list_header="ccg list — show the backend process tree"
MSG_en_help_list_body="  ccg list             List the backend(s) and their descendant processes,\n                       with PID, port (if any), and source label (ide/standalone).\n  ccg list -h, --help  Show this help."
MSG_en_help_stop_header="ccg stop — terminate the backend process tree"
MSG_en_help_stop_body="  ccg stop                 Stop the backend on port 19836, descendants included.\n  ccg stop <pid>           Stop the tree rooted at this PID.\n  ccg stop --port <port>   Stop the backend on this port (alias: -p).\n  ccg stop --all           Stop EVERY backend.mjs tree, IDE ones too (asks first; alias: -a).\n  ccg stop --force         Skip SIGTERM, send SIGKILL immediately (alias: -f).\n  ccg stop --no-tree       Stop only the named process, not its children.\n  ccg stop -h, --help      Show this help.\n\n  Termination order: leaf children first, then the root. Each process gets\n  SIGTERM, up to 3 seconds to exit, then SIGKILL. With --force, SIGKILL is\n  sent immediately. A PID that is not part of a backend tree triggers a\n  confirmation prompt before anything is killed."

# Help: run / update / version / doctor / self-update / uninstall
MSG_en_help_run_header="ccg run — start (or reuse) the backend and open the browser"
MSG_en_help_run_body="  ccg run              Check port 19836, spawn the backend (or reuse a running one),\n                       then open the WebView in your browser. This is the default\n                       command, so 'ccg' alone behaves the same.\n  ccg run -b, --bind <addr>\n                       Bind the backend to <addr> instead of loopback (127.0.0.1).\n                       Use 0.0.0.0 to let other devices on your network open the\n                       WebView at http://<this-machine-ip>:19836. WARNING: the backend\n                       runs 'claude' and file I/O with no authentication — only expose\n                       it on trusted networks.\n  ccg run -p, --port <n>\n                       Bind the backend to port <n> instead of 19836. Affects the\n                       whole run (probe, reuse, kill, browser URL).\n  ccg run -h, --help   Show this help."
MSG_en_help_update_header="ccg update — force-update the runtime to the latest release"
MSG_en_help_update_body="  ccg update             Refresh the runtime to the latest GitHub release. If a\n                         backend is running it is stopped first, then replaced.\n  ccg update -h, --help  Show this help."
MSG_en_help_version_header="ccg version — show ccg, runtime, and backend versions"
MSG_en_help_version_body="  ccg version             Show the installed ccg, cached runtime(s), and the\n                          version of any backend currently running. Alias: -v.\n  ccg version -h, --help  Show this help."
MSG_en_help_doctor_header="ccg doctor — diagnose the environment"
MSG_en_help_doctor_body="  ccg doctor             Check node, PATH, cache, port 19836, and how many\n                         backend processes are alive.\n  ccg doctor -h, --help  Show this help."
MSG_en_help_self_update_header="ccg self-update — update ccg itself"
MSG_en_help_self_update_body="  ccg self-update             Re-run the install script to update the ccg cli.\n  ccg self-update -h, --help  Show this help."
MSG_en_help_uninstall_header="ccg uninstall — remove ccg from this machine"
MSG_en_help_uninstall_body="  ccg uninstall             Remove ccg from this machine (binary, runtimes, PATH entry).\n                            Your data (accounts, settings, licence) is kept.\n  ccg uninstall -h, --help  Show this help."

# Restart loop (standalone foreground)
MSG_en_backend_restarting="Backend exited with restart signal. Restarting..."
MSG_en_err_restart_loop="Backend restarted too quickly (crash loop detected). Aborting."

# Generic
MSG_en_abort="Aborted."
MSG_en_unknown_command="Unknown command: %s"
MSG_en_usage_header="Usage: ccg <command> [args]"

# Account (ccg account)
MSG_en_account_list_header="Saved Claude accounts:"
MSG_en_account_active_marker="*"
MSG_en_account_none="No saved accounts. Run 'ccg account save' after logging in with 'claude'."
MSG_en_account_current="Current account: %s"
MSG_en_account_switched="Switched to %s."
MSG_en_account_saved="Saved %s."
MSG_en_account_removed="Removed %s."
MSG_en_account_rm_prompt="Remove saved account %s? (y/N): "
MSG_en_account_keychain_note="Note: macOS may cache keychain reads for ~30s; a 'claude' started right now could still use the previous account. Already-running sessions keep their old credentials until restarted."
MSG_en_err_account_need_token="Specify an account (id, email, name, or a unique substring)."
MSG_en_err_account_unknown_sub="Unknown account subcommand: %s"
MSG_en_err_account_helper_missing="Account helper not found in the runtime. Run 'ccg update' to refresh it."
MSG_en_err_account_not_found="No saved account matches '%s'."
MSG_en_err_account_ambiguous="'%s' matches multiple accounts:"
MSG_en_err_account_no_login="No logged-in Claude account to save. Log in with 'claude' first."
MSG_en_err_account_generic="Account command failed."
MSG_en_help_account_header="ccg account — manage saved Claude accounts"
MSG_en_help_account_body="  ccg account [list]        List saved accounts (the live one is marked *).\n  ccg account current       Show the currently live account.\n  ccg account use <who>     Switch the live account (who = id, email, name, or substring).\n  ccg account save          Save the currently logged-in account for quick switching.\n  ccg account rm <who>      Delete a saved account (asks first).\n  ccg account -h, --help    Show this help.\n\n  Switching swaps the system-wide live credentials, so a NEW 'claude' (terminal or\n  GUI) picks up the chosen account."
