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
}
