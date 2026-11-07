# locales/en.ps1 - English messages (default and fallback). {0}, {1} are arguments.
$Messages = @{
    usage_header            = 'Usage: ccg <command> [args]'
    unknown_command         = 'Unknown command: {0}'
    cmd_not_yet             = "'ccg {0}' is not available in the Windows PowerShell version yet."
    help_body               = @(
        '  ccg                  Run (default). Check port, compare versions, spawn backend, open browser.',
        '  ccg run              Same as default.',
        '  ccg list, ls         Show the backend process tree (PIDs, ports).',
        '  ccg update           Force-update runtime to the latest release.',
        '  ccg stop             Stop the backend on port 19836, descendants included.',
        '  ccg version, -v      Show installed ccg, cached runtimes, and running backend.',
        '  ccg doctor           Diagnose environment (node, PATH, cache, port).',
        '  ccg self-update      Re-run the install script to update ccg itself.',
        '  ccg uninstall        Remove ccg from this machine.',
        '  ccg help, -h, --help Show this message.',
        '',
        "  Run 'ccg <command> -h' for details on any command."
    ) -join "`n"
    help_version_header     = 'ccg version - show ccg, runtime, and backend versions'
    help_version_body       = "  ccg version             Show the installed ccg, cached runtime(s), and the`n                          version of any backend currently running. Alias: -v.`n  ccg version -h, --help  Show this help."
    help_doctor_header      = 'ccg doctor - diagnose the environment'
    help_doctor_body        = "  ccg doctor             Check node, PATH, cache, port 19836, and how many`n                         backend processes are alive.`n  ccg doctor -h, --help  Show this help."
    version_ccg             = 'ccg version: {0}'
    version_runtime_cached  = 'cached runtime(s): {0}'
    version_runtime_none    = 'cached runtime(s): (none)'
    version_backend_running = 'running backend: v{0} on port {1}'
    version_backend_none    = 'running backend: (none)'
    doctor_header           = 'ccg doctor - environment diagnostics'
    doctor_node_ok          = '✔ node: {0} ({1})'
    doctor_node_old         = '✘ node: {0} ({1}) is too old, Node.js 18 or newer is required'
    doctor_node_missing     = '✘ node: not found. Install Node.js 18 or newer from https://nodejs.org/ (or: winget install OpenJS.NodeJS.LTS)'
    doctor_path_ok          = '✔ {0} is on PATH'
    doctor_path_missing     = '✘ {0} is NOT on PATH'
    doctor_cache_count      = 'ℹ cached runtimes: {0}'
    doctor_port_free        = '✔ port {0} is free'
    doctor_port_us          = 'ℹ port {0}: our backend (v{1})'
    doctor_port_foreign     = '✘ port {0}: foreign process'
    doctor_backend_count    = "ℹ {0} backend.mjs process(es) detected - run 'ccg list' for the tree"
    doctor_backend_warn     = "⚠ {0} backend.mjs processes detected - run 'ccg list' to inspect"
    running_already         = "Already running v{0} on port {1}. Opening browser..."
    backend_starting        = "Starting backend v{0}..."
    backend_started         = "Backend ready on port {0}."
    opening_browser         = "Opening {0}..."
    update_prompt           = "A newer version is available: v{0} (currently v{1})."
    update_prompt_question  = "Update now? (y/N): "
    update_declined         = "Keeping existing v{0}. Opening browser..."
    update_killed_old       = "Stopped old backend. Installing v{0}..."
    caution_marketplace     = "⚠  This command only updates the terminal runtime.`n    The JetBrains IDE plugin must be updated separately via the marketplace.`n    (Settings → Plugins → Updates)"
    err_port_missing_value  = "Error: -p/--port requires a port number (e.g. ccg run -p 20000)."
    err_port_invalid        = "Error: -p/--port must be a number in 1-65535."
    err_bind_missing_value  = "Error: -b/--bind requires an address (e.g. ccg run -b 0.0.0.0)."
    warn_bind_exposed       = "WARNING: binding to {0} - the backend (runs 'claude' + file I/O, no authentication)`n         will be reachable by other devices on your network. Only do this on a trusted network.`n         If a backend is already running on 127.0.0.1, run 'ccg stop' first so the new bind takes effect."
    err_port_foreign        = "Port {0} is in use by another process (not claude-code-gui)."
    err_port_foreign_hint   = "Please stop that process and try again. (Hint: netstat -ano | findstr :{0})"
    err_node_missing        = "Node.js is not installed or not on PATH."
    err_node_missing_hint   = "Install Node.js 18 or newer from https://nodejs.org/ (or: winget install OpenJS.NodeJS.LTS) and re-run."
    err_no_release          = "Could not fetch latest release from GitHub."
    err_runtime_missing     = "Runtime v{0} is not in cache and download failed."
    backend_restarting      = "Backend exited with restart signal. Restarting..."
    err_restart_loop        = "Backend restarted too quickly (crash loop detected). Aborting."
    help_run_header         = "ccg run - start (or reuse) the backend and open the browser"
    help_run_body           = "  ccg run              Check port 19836, spawn the backend (or reuse a running one),`n                       then open the WebView in your browser. This is the default`n                       command, so 'ccg' alone behaves the same.`n  ccg run -b, --bind <addr>`n                       Bind the backend to <addr> instead of loopback (127.0.0.1).`n                       Use 0.0.0.0 to let other devices on your network open the`n                       WebView at http://<this-machine-ip>:19836. WARNING: the backend`n                       runs 'claude' and file I/O with no authentication - only expose`n                       it on trusted networks.`n  ccg run -p, --port <n>`n                       Bind the backend to port <n> instead of 19836. Affects the`n                       whole run (probe, reuse, kill, browser URL).`n  ccg run -h, --help   Show this help."
}
