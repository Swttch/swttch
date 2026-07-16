package com.github.yhk1038.claudecodegui.bridge

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.ApplicationNamesInfo
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.util.SystemInfo
import com.intellij.util.EnvironmentUtil
import com.github.yhk1038.claudecodegui.settings.ProjectSettingsReader
import com.github.yhk1038.claudecodegui.settings.SettingsManager
import com.github.yhk1038.claudecodegui.toolwindow.realization.LoadingPhase
import kotlinx.coroutines.*
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader

/**
 * Manages the Node.js backend process lifecycle.
 *
 * Responsibilities:
 * 1. Find the `node` executable on PATH or well-known locations
 * 2. Await the shared resource-extraction gate for the backend entry + WEBVIEW_DIR
 *    (extraction itself is owned by [com.github.yhk1038.claudecodegui.services.NodeBackendService])
 * 3. Spawn `node backend.mjs` with correct env vars
 * 4. Read the first stdout line `PORT:{n}\n` -> expose via [port] Deferred
 * 5. Forward stderr to IDE logger
 * 6. Gracefully terminate the process on dispose
 *
 * JSON-RPC dispatch is handled by [RpcWebSocketClient] via WebSocket /rpc endpoint.
 */
class NodeProcessManager(
    private val scope: CoroutineScope,
    /**
     * Port to request from the backend via the `PORT` env var. `0` (the default)
     * tells the backend to bind an OS-assigned free port and report the actual
     * port back on its `PORT:{n}` stdout line — so multiple backends (one per IDE
     * project root) coexist without colliding on a fixed port. See issue #57.
     */
    private val requestedPort: Int = 0,
    /**
     * When non-null, the project root lives inside this WSL distro, so the backend
     * is launched inside it via `wsl.exe` (node + claude run as Linux natives,
     * avoiding the UNC-cwd / PowerShell failures of issue #57). Null = native host.
     */
    private val wslDistro: String? = null,
    /** Linux working directory inside [wslDistro] (the project root's `/home/...` path). */
    private val wslCwd: String? = null,
    /**
     * The IDE project root this backend serves. Used to resolve a project-scoped
     * `nodePath` before the backend (the usual source of truth) exists to be asked —
     * see [findNodeExecutable] and ProjectSettingsReader. Null = no project context,
     * in which case only the global setting applies.
     */
    private val projectRoot: String? = null,
    /**
     * Invoked as [start] advances through its blocking sub-steps (node discovery,
     * shell-PATH capture, resource extraction, waiting for the PORT line) so the panel
     * placeholder can show real progress instead of a single frozen "Starting backend..."
     * line. Called off the EDT; the listener is responsible for marshalling to the UI
     * thread. See issue #97.
     */
    private val onProgress: ((LoadingPhase) -> Unit)? = null,
    /**
     * Invoked when the backend Node process exits with [RESTART_EXIT_CODE] (the unified
     * "restart the plugin backend" signal) and the exit was NOT caused by [dispose].
     * The managing side (NodeBackendService) responds by respawning the backend on the
     * same port. A SIGTERM/normal exit (e.g. from [dispose]) does not carry code 75, so
     * this never fires for an intentional shutdown. Called off the EDT inside the start()
     * coroutine; the listener is responsible for marshalling to the UI thread if needed.
     */
    private val onRestartRequested: (() -> Unit)? = null,
    /**
     * Invoked when the backend Node process exits **cleanly on its own decision**
     * (exit code 0 and NOT caused by [dispose]) — in practice the idle
     * self-shutdown. The managing side must stand its reconnect/restart watchdog
     * down (dispose the RPC client) instead of treating the silence as a crash:
     * otherwise the RPC reconnect loop respawns the backend ~15 s after every
     * idle shutdown, forever (the mode-D manual pass caught exactly that loop —
     * and before the D2 idle-gate fix the respawned backend never armed its idle
     * timer, so the same trigger used to leak one silent eternal backend
     * instead). Crash exits (non-zero) keep the restart recovery; exit code 75
     * keeps [onRestartRequested]. Called off the EDT inside the start() coroutine.
     */
    private val onIntentionalExit: (() -> Unit)? = null,
    /**
     * Invoked on every [Lifecycle] transition (STARTING → RUNNING → DEAD), so the
     * status-bar widget can reflect backend liveness without polling. Called from
     * whichever thread performs the transition (start() coroutine or dispose());
     * the listener is responsible for marshalling to the UI thread.
     */
    private val onLifecycleChanged: ((Lifecycle) -> Unit)? = null,
    /**
     * The shared, application-scoped extraction gate. The plugin's webview/backend
     * resources are extracted once per (IDE product, plugin version) by
     * [com.github.yhk1038.claudecodegui.services.NodeBackendService]; every backend
     * awaits this Deferred instead of extracting itself. This is what closes issue
     * #149: successive backend generations read the same already-extracted, never-
     * deleted dir, so no generation's shutdown can delete a dir another is serving.
     * Null only in unit tests that never reach the extraction step.
     */
    private val resourcesReady: Deferred<ExtractedResources>? = null,
    /**
     * Stable control-channel auth token. Injected into the backend process as the
     * `CCG_AUTH_TOKEN` env var so the backend's [authToken] picks it up and requires
     * it on every /ws, /rpc, /logs upgrade and /internal POST routes. The SAME token
     * is used by this backend's [RpcWebSocketClient] (/rpc subprotocol) and the
     * IDE→backend /internal POSTs, so a single value gates the whole control channel.
     * The token is NEVER placed in a URL — the JCEF webview obtains it by redeeming
     * the single-use `?pair=` code (see [initialPairCode]). Derived from a persisted
     * per-user secret by [com.github.yhk1038.claudecodegui.services.NodeBackendService],
     * so it is STABLE across restarts (an already-loaded webview reconnects with the
     * same value even after a backend respawn). NEVER logged. Empty only in unit
     * tests that don't reach a real spawn.
     */
    private val authToken: String = "",
    /**
     * Fresh single-use INITIAL pairing code for this spawn. Injected into the backend
     * process as the `CCG_INITIAL_PAIR_CODE` env var so the backend seeds its pairing
     * store with it at startup; the JCEF webview then redeems it once (POST /pair) for
     * [authToken]. This keeps the auth token out of every URL — the URL carries only
     * `?pair=<code>`. Regenerated per spawn by the owning
     * [com.github.yhk1038.claudecodegui.services.NodeBackendService] BackendInstance.
     * NEVER logged (redacted from the WSL command log below). Empty only in unit tests
     * that don't reach a real spawn.
     */
    private val initialPairCode: String = "",
) : Disposable {

    private val logger = Logger.getInstance(NodeProcessManager::class.java)

    // Server port (fulfilled once the backend prints PORT:{n})
    private val _portDeferred = CompletableDeferred<Int>()
    val port: Deferred<Int> = _portDeferred

    private var process: Process? = null
    private var stdoutJob: Job? = null
    private var stderrJob: Job? = null

    // Bounded ring buffer of the most recent backend stderr lines. Lets a startup
    // failure or port timeout surface the backend's own output in the error panel
    // instead of an opaque "did not become ready" message — the watchdog half of the
    // issue #97 fix. Written from the stderr reader, read from a timeout handler on a
    // different thread, so all access is synchronized on the deque.
    private val recentStderrLines = ArrayDeque<String>()

    private fun rememberStderr(line: String) {
        synchronized(recentStderrLines) {
            recentStderrLines.addLast(line)
            while (recentStderrLines.size > MAX_STDERR_LINES) recentStderrLines.removeFirst()
        }
    }

    /** The most recent backend stderr lines (up to [MAX_STDERR_LINES]), or null if none. */
    fun recentStderr(): String? {
        val lines = synchronized(recentStderrLines) { recentStderrLines.toList() }
        return lines.takeIf { it.isNotEmpty() }?.joinToString("\n")
    }

    /**
     * Lifecycle of the managed process. [start] runs asynchronously, so for a window
     * after start() returns the OS process does not yet exist and [isAlive] is false.
     * Distinguishing STARTING from DEAD prevents callers (NodeBackendService.ensureStarted)
     * from mistaking a still-spawning backend for a dead one and racing a second spawn —
     * which collides on the port and triggers the port-reclaim kill path. See issue: the
     * duplicate spawn was the trigger behind the IDE-killing EADDRINUSE storm.
     */
    enum class Lifecycle { STARTING, RUNNING, DEAD }

    @Volatile
    private var lifecycle = Lifecycle.STARTING

    /** Current [Lifecycle] — read by the status-bar widget alongside [onLifecycleChanged]. */
    val currentLifecycle: Lifecycle
        get() = lifecycle

    private fun setLifecycle(value: Lifecycle) {
        lifecycle = value
        try {
            onLifecycleChanged?.invoke(value)
        } catch (e: Exception) {
            // A UI listener failure must never break process management.
            logger.warn("onLifecycleChanged listener threw", e)
        }
    }

    // True once dispose() has run. dispose() destroys the process (typically SIGTERM →
    // exit 143), and also sets lifecycle = DEAD up front — so the natural exit observed
    // by proc.waitFor() can't be distinguished from a restart-signalled exit by lifecycle
    // alone. This flag lets the exit handler suppress the restart callback for an
    // intentional dispose, while still respawning on a genuine RESTART_EXIT_CODE.
    @Volatile
    private var disposed = false


    /** True only once the process has actually started and later exited (or failed to start). */
    val isDead: Boolean
        get() = lifecycle == Lifecycle.DEAD

    /**
     * Handler interface for JSON-RPC requests coming from the Node.js backend.
     * The Node.js backend calls these when it needs IDE-native functionality.
     */
    interface RpcHandler {
        suspend fun openFile(path: String, line: Int? = null, column: Int? = null)
        suspend fun openDiff(filePath: String, oldContent: String, newContent: String, toolUseId: String?)
        suspend fun applyDiff(filePath: String, newContent: String, toolUseId: String?): Boolean
        suspend fun rejectDiff(toolUseId: String?)
        suspend fun refreshFiles(paths: List<String>)
        suspend fun createSession(workingDir: String)
        suspend fun openNewTab(workingDir: String)
        suspend fun openSession(sessionId: String, workingDir: String?)
        /** @param path settings page to land on (e.g. "/settings/sponsor"); null → landing page. */
        suspend fun openSettings(workingDir: String, path: String? = null)
        suspend fun openTerminal(workingDir: String)
        suspend fun openUrl(url: String)
        suspend fun pickFiles(mode: String, multiple: Boolean): List<String>
        suspend fun updatePlugin()
        suspend fun requiresRestart(): Boolean
        /**
         * Returns the IDE project root that contains [workingDir], or null when no
         * matching panel is registered. The WebView uses this to cap ancestor
         * traversal in the working-directory dropdown.
         */
        suspend fun getIdeRoot(workingDir: String?): String?
    }

    /**
     * Start the Node.js backend process.
     */
    fun start() {
        // Everything here — node discovery, shell PATH capture, backend extraction —
        // can block for seconds (the `$SHELL -lic` capture is bounded only by a 10s
        // timeout). It must NOT run on the caller's thread (EDT): start() is reached
        // synchronously from tool-window content creation, so a blocking call here
        // would freeze the IDE UI. Run the whole thing on Dispatchers.IO.
        scope.launch(Dispatchers.IO) {
            onProgress?.invoke(LoadingPhase.LOCATING_NODE)
            // A WSL backend runs node inside the distro (resolved on the distro's PATH),
            // so skip Windows-side node discovery for WSL project roots.
            val nodePath = if (wslDistro != null) null else findNodeExecutable()
            if (wslDistro == null && nodePath == null) {
                logger.error(
                    "Node.js executable not found. The plugin searched PATH and common install " +
                        "locations (nvm, volta, fnm, Homebrew) but found nothing.\n" +
                        "How to fix:\n" +
                        "  1. Install Node.js, or make sure 'node' is on your PATH.\n" +
                        "  2. If you use nvm, run 'nvm alias default <version>' so a default is set.\n" +
                        "  3. Or set the NODE_PATH_OVERRIDE environment variable to your node binary " +
                        "(e.g. ~/.nvm/versions/node/v24.16.0/bin/node)."
                )
                setLifecycle(Lifecycle.DEAD)
                _portDeferred.completeExceptionally(
                    IllegalStateException("Node.js executable not found")
                )
                return@launch
            }

            onProgress?.invoke(LoadingPhase.PREPARING_BACKEND)
            // Await the shared extraction gate instead of extracting here (#149). Bounded
            // so a stuck extraction can't hang backend start indefinitely (the #97 lesson);
            // on timeout/failure we fail-fast exactly like the old missing-backend path.
            val resources = if (resourcesReady == null) null
                else withTimeoutOrNull(RESOURCE_READY_TIMEOUT_MS) {
                    try {
                        resourcesReady.await()
                    } catch (e: Exception) {
                        logger.error("Plugin resource extraction failed", e)
                        null
                    }
                }
            if (resources == null) {
                logger.error("Plugin resources not ready (extraction gate absent or timed out).")
                setLifecycle(Lifecycle.DEAD)
                _portDeferred.completeExceptionally(
                    IllegalStateException("Plugin resources not ready")
                )
                return@launch
            }
            val backendFile = resources.backendFile
            val webviewDir: File? = resources.webviewDir

            logger.info("Starting Node.js backend: node=$nodePath, backend=${backendFile.absolutePath}, webviewDir=${webviewDir?.absolutePath}")

            try {
                // 텔레메트리 client 필드용 IDE 제품+버전+빌드 (예: "IntelliJ IDEA 2024.1.4 (IC-241.15989.149)").
                // 백엔드 getClientInfo()가 CCG_CLIENT_INFO를 우선 사용한다.
                val clientInfo = "${ApplicationNamesInfo.getInstance().fullProductName} " +
                    "${ApplicationInfo.getInstance().fullVersion} (${ApplicationInfo.getInstance().build.asString()})"

                val pb: ProcessBuilder
                if (wslDistro != null) {
                    // WSL project root: launch the backend inside the distro via wsl.exe.
                    // backend.mjs / webview were extracted to a Windows temp dir; WSL sees
                    // them through /mnt/<drive>/... so convert the paths.
                    //
                    // Env split by sensitivity:
                    // - NON-secret values (mode, port, paths) go through buildWslNodeCommand
                    //   as `export K=V` inside the `bash -lic` snippet.
                    // - SECRETS (the auth token, the pairing code) must NOT be put on the
                    //   argv: the whole `bash -lic "export … "` snippet is a wsl.exe argument,
                    //   which any local user can read via `ps` / /proc/<pid>/cmdline and use to
                    //   drive /ws into a bypassPermissions session. Hand them to WSL via WSLENV
                    //   + the wsl.exe process environment instead — /proc/<pid>/environ is
                    //   owner-only, so env is safe. wsl.exe injects WSLENV-listed vars into the
                    //   Linux process, and `exec node` inherits them.
                    // The rest of the process environment is left intact so wsl.exe resolves on
                    // the Windows PATH. NOTE: not verifiable on our dev host — see issue #57 (S4b).
                    val linuxBackend = WslPathResolver.toWslPath(backendFile.absolutePath)
                        ?: backendFile.absolutePath
                    val wslEnv = buildMap {
                        put("JETBRAINS_MODE", "true")
                        put("CCG_CLIENT_INFO", clientInfo)
                        put("PORT", requestedPort.toString())
                        webviewDir?.let { wv ->
                            WslPathResolver.toWslPath(wv.absolutePath)?.let { put("WEBVIEW_DIR", it) }
                        }
                        // NOTE: CCG_AUTH_TOKEN / CCG_INITIAL_PAIR_CODE are intentionally NOT
                        // here — they are secrets and are passed via WSLENV below, never on argv.
                        // No CLEANUP_TEMP_* env: resources are version-scoped and shared,
                        // extracted once and never deleted on exit. Stale other-version dirs
                        // are pruned at extraction time by PluginResourceExtractor (#149).
                    }
                    val cmd = WslPathResolver.buildWslNodeCommand(wslDistro, wslCwd, wslEnv, linuxBackend)
                    // cmd no longer carries any secret (token/pairing code moved to WSLENV), so
                    // it is safe to log verbatim.
                    logger.info("Starting WSL backend (distro=$wslDistro, cwd=$wslCwd): ${cmd.joinToString(" ")}")
                    pb = ProcessBuilder(cmd).redirectErrorStream(false)
                    // Pass secrets out-of-band: set them in the wsl.exe process environment and
                    // list them in WSLENV so wsl.exe forwards them into the distro's process env
                    // (never on the argv). `/u` = share Win→WSL only, no path translation.
                    // Append to any pre-existing WSLENV rather than clobbering the user's.
                    val passthrough = mutableListOf<String>()
                    if (authToken.isNotEmpty()) {
                        pb.environment()["CCG_AUTH_TOKEN"] = authToken
                        passthrough += "CCG_AUTH_TOKEN/u"
                    }
                    if (initialPairCode.isNotEmpty()) {
                        pb.environment()["CCG_INITIAL_PAIR_CODE"] = initialPairCode
                        passthrough += "CCG_INITIAL_PAIR_CODE/u"
                    }
                    if (passthrough.isNotEmpty()) {
                        val existingWslEnv = pb.environment()["WSLENV"]
                        pb.environment()["WSLENV"] =
                            if (existingWslEnv.isNullOrBlank()) passthrough.joinToString(":")
                            else existingWslEnv + ":" + passthrough.joinToString(":")
                    }
                } else {
                    val env = buildMap {
                        putAll(EnvironmentUtil.getEnvironmentMap())
                        put("JETBRAINS_MODE", "true")
                        put("CCG_CLIENT_INFO", clientInfo)
                        // Hand the backend the user's real shell PATH so anything it spawns
                        // (claude, npx, git) is found even when the IDE started from GUI (#59).
                        put("PATH", effectivePath())
                        // Same gap for CLAUDE_CONFIG_DIR: when a user exports it from their
                        // interactive rc to point the CLI at a non-default data dir, a
                        // GUI-launched IDE never sourced that rc, so the backend would read
                        // sessions/settings from ~/.claude and find nothing (#117). Capture it
                        // from the shell and override only when the shell actually set it.
                        ShellPathResolver.resolveEnvVar("CLAUDE_CONFIG_DIR")?.let {
                            put("CLAUDE_CONFIG_DIR", it)
                        }
                        if (webviewDir != null) {
                            put("WEBVIEW_DIR", webviewDir.absolutePath)
                        }
                        // No CLEANUP_TEMP_* env — see the WSL branch above (#149): resources
                        // are version-scoped, extracted once, never deleted on process exit.
                        // Dynamic port: backend binds an OS-assigned free port when this is 0
                        // and reports the real port via its PORT:{n} stdout line. Lets one
                        // backend per IDE project root coexist without a fixed-port clash (#57).
                        put("PORT", requestedPort.toString())
                        // Stable control-channel auth token (see [authToken]). The backend
                        // requires it on /ws, /rpc, /logs and the /internal routes. Set via the
                        // env map (never logged — the native branch does not log the env).
                        if (authToken.isNotEmpty()) put("CCG_AUTH_TOKEN", authToken)
                        // Fresh single-use initial pairing code (see [initialPairCode]). The
                        // backend seeds its pairing store with it so the webview can redeem it
                        // (via `?pair=`) for the token. Set via the env map (never logged).
                        if (initialPairCode.isNotEmpty()) put("CCG_INITIAL_PAIR_CODE", initialPairCode)
                        // PROJECT_DIR removed — workingDir is passed via WebSocket message
                    }
                    pb = ProcessBuilder(nodePath!!, backendFile.absolutePath)
                        .directory(backendFile.parentFile)
                        .redirectErrorStream(false)
                    pb.environment().clear()
                    pb.environment().putAll(env)
                }

                val proc = pb.start()
                process = proc
                setLifecycle(Lifecycle.RUNNING)
                onProgress?.invoke(LoadingPhase.WAITING_FOR_PORT)

                // Read stdout: first line is PORT, rest are logged
                stdoutJob = scope.launch(Dispatchers.IO) {
                    val reader = BufferedReader(InputStreamReader(proc.inputStream, Charsets.UTF_8))
                    try {
                        readStdout(reader)
                    } catch (e: CancellationException) {
                        // Normal shutdown
                    } catch (e: Exception) {
                        logger.error("Error reading Node.js stdout", e)
                        if (!_portDeferred.isCompleted) {
                            _portDeferred.completeExceptionally(e)
                        }
                    }
                }

                // Read stderr -> IDE log
                stderrJob = scope.launch(Dispatchers.IO) {
                    val reader = BufferedReader(InputStreamReader(proc.errorStream, Charsets.UTF_8))
                    try {
                        readStderr(reader)
                    } catch (e: CancellationException) {
                        // Normal shutdown
                    } catch (e: Exception) {
                        logger.warn("Error reading Node.js stderr", e)
                    }
                }

                // Wait for process to exit and log the result
                val exitCode = proc.waitFor()
                setLifecycle(Lifecycle.DEAD)
                logger.info("Node.js backend exited with code $exitCode")

                if (!_portDeferred.isCompleted) {
                    _portDeferred.completeExceptionally(
                        IllegalStateException("Node.js process exited before printing PORT (exit code: $exitCode)")
                    )
                }

                // Unified restart signal: the backend self-exits with RESTART_EXIT_CODE to
                // ask its managing side to respawn it on the same port. Only honour it for a
                // non-dispose exit (dispose() also sets lifecycle = DEAD, so check `disposed`).
                if (shouldRequestRestart(exitCode, disposed)) {
                    logger.info("Node.js backend requested restart (exit code $exitCode)")
                    try {
                        onRestartRequested?.invoke()
                    } catch (e: Exception) {
                        // A restart callback failure must not escape the start() coroutine.
                        logger.warn("onRestartRequested callback threw", e)
                    }
                } else if (isIntentionalExit(exitCode, disposed)) {
                    // Clean self-exit (idle shutdown): the managing side stands its
                    // RPC reconnect/restart watchdog down instead of respawning.
                    logger.info("Node.js backend exited intentionally (code 0) — not a crash")
                    try {
                        onIntentionalExit?.invoke()
                    } catch (e: Exception) {
                        logger.warn("onIntentionalExit callback threw", e)
                    }
                }
            } catch (e: CancellationException) {
                // Normal shutdown
            } catch (e: Exception) {
                setLifecycle(Lifecycle.DEAD)
                logger.error("Failed to start Node.js backend", e)
                if (!_portDeferred.isCompleted) {
                    _portDeferred.completeExceptionally(e)
                }
            }
        }
    }

    /**
     * Read stdout line by line.
     * First line: PORT:{n}
     * Subsequent lines are logged (JSON-RPC is now handled via WebSocket /rpc).
     */
    private fun readStdout(reader: BufferedReader) {
        var portRead = false

        while (true) {
            val line = reader.readLine() ?: break // EOF

            if (!portRead) {
                // Expect first line to be PORT:{n}
                if (line.startsWith("PORT:")) {
                    val portStr = line.removePrefix("PORT:").trim()
                    val portNum = portStr.toIntOrNull()
                    if (portNum != null) {
                        logger.info("Node.js backend listening on port $portNum")
                        _portDeferred.complete(portNum)
                        portRead = true
                    } else {
                        logger.error("Invalid PORT line from Node.js backend: $line")
                        _portDeferred.completeExceptionally(
                            IllegalStateException("Invalid PORT line: $line")
                        )
                        return
                    }
                } else {
                    // Not a PORT line — might be debug output before PORT
                    logger.info("[Node.js pre-PORT] $line")
                }
                continue
            }

            // After PORT is read, log any subsequent stdout lines
            if (line.isBlank()) continue
            logger.info("[Node.js stdout] $line")
        }
    }

    /**
     * Read stderr and forward to IDE log.
     */
    private fun readStderr(reader: BufferedReader) {
        while (true) {
            val line = reader.readLine() ?: break
            if (line.isNotBlank()) {
                rememberStderr(line)
                System.err.println("[Node.js] $line")
                logger.info("[Node.js] $line")
            }
        }
    }

    // ─── Node.js / Backend file discovery ───────────────────────────

    /**
     * The PATH to use for `node` discovery and the backend process: the user's real
     * shell PATH (captured via [ShellPathResolver], carries nvm/fnm/etc.) merged ahead
     * of the IDE-inherited PATH. The merge keeps the inherited PATH as a fallback when
     * shell capture fails (no $SHELL, Windows, timeout). Computed once per backend start.
     */
    private val effectivePathValue: String by lazy {
        val basePath = EnvironmentUtil.getEnvironmentMap()["PATH"] ?: System.getenv("PATH") ?: ""
        ShellPathResolver.mergePaths(ShellPathResolver.resolve(), basePath, File.pathSeparator)
    }

    private fun effectivePath(): String = effectivePathValue

    /**
     * Find the `node` executable.
     * Tries:
     * 1. `which node` (PATH-based)
     * 2. Well-known locations (nvm, volta, fnm, homebrew, etc.)
     */
    private fun findNodeExecutable(): String? {
        // 0. User-configured override from settings (highest priority — #22).
        //    Read straight from the settings files: this runs BEFORE the backend is
        //    spawned, so we can't ask the backend. Both reads are synchronous and
        //    findNodeExecutable already runs off the EDT.
        //    Lets users on `n`/`nvm` pin an exact node when PATH holds an incompatible
        //    one, and provides a recovery path that survives a non-bootable backend.
        //
        //    Project scope wins over global, matching the backend's merge order: a
        //    terminal user can pin a project to one node (`.nvmrc` and friends), so
        //    the GUI must allow the same (CLI equivalence, CLAUDE.md — issue #7).
        val configuredNodePath = ProjectSettingsReader.read(projectRoot, "nodePath")
            ?: SettingsManager.getInstance().get("nodePath")?.jsonPrimitive?.contentOrNull
        NodeExecutableResolver.normalizeConfiguredNodePath(configuredNodePath)?.let { configured ->
            val file = File(configured)
            if (file.exists() && file.canExecute()) {
                logger.info("Found node via settings nodePath: $configured")
                return configured
            }
            logger.warn("Configured nodePath is not an executable file, ignoring: $configured")
        }

        // 1. Environment variable override
        System.getenv("NODE_PATH_OVERRIDE")?.let { envPath ->
            if (File(envPath).exists() && File(envPath).canExecute()) {
                logger.info("Found node via NODE_PATH_OVERRIDE: $envPath")
                return envPath
            }
        }

        // 2. PATH lookup via shell command (effectivePath captures the user's real
        //    shell PATH so the lookup succeeds even when the IDE is launched from GUI)
        try {
            val command = if (SystemInfo.isWindows) arrayOf("cmd", "/c", "where", "node") else arrayOf("which", "node")
            val pb = ProcessBuilder(*command).redirectErrorStream(true)
            // Inject shell-aware PATH so lookup succeeds even when IDE is launched from GUI
            pb.environment()["PATH"] = effectivePath()
            val proc = pb.start()
            val output = proc.inputStream.bufferedReader().readText().trim()
            val exitCode = proc.waitFor()
            // `where` on Windows may return multiple lines; take the first
            val firstLine = output.lines().firstOrNull()?.trim().orEmpty()
            if (exitCode == 0 && firstLine.isNotBlank() && File(firstLine).exists()) {
                logger.info("Found node in PATH: $firstLine")
                return firstLine
            }
        } catch (e: Exception) {
            logger.debug("PATH lookup for node failed: ${e.message}")
        }

        // 3. Well-known locations
        val wellKnownPaths = if (SystemInfo.isWindows) {
            val appData = System.getenv("APPDATA") ?: ""
            val programFiles = System.getenv("ProgramFiles") ?: "C:\\Program Files"
            val localAppData = System.getenv("LOCALAPPDATA") ?: ""
            listOf(
                "$programFiles\\nodejs\\node.exe",
                "$appData\\nvm\\current\\node.exe",
                "$localAppData\\volta\\bin\\node.exe",
                "$localAppData\\fnm\\aliases\\default\\bin\\node.exe",
            )
        } else {
            val home = System.getenv("HOME") ?: return null
            buildList {
                add("/usr/local/bin/node")
                add("/opt/homebrew/bin/node")
                // nvm has NO `current` symlink — scan ~/.nvm/versions/node/ and honour
                // the default alias instead, otherwise nvm users are never matched (#59).
                findNvmNode(home)?.let { add(it) }
                add("$home/.volta/bin/node")
                add("$home/.fnm/aliases/default/bin/node")
                add("$home/.local/bin/node")
                add("/usr/bin/node")
            }
        }

        wellKnownPaths.firstOrNull { File(it).exists() && File(it).canExecute() }?.let { found ->
            logger.info("Found node at well-known location: $found")
            return found
        }

        logger.warn("Node.js executable not found")
        return null
    }

    /**
     * Resolve the nvm-managed `node` binary by scanning `~/.nvm/versions/node/` and
     * honouring `~/.nvm/alias/default`. nvm does not maintain a `current` symlink, so a
     * static well-known path can never find it — the directory must be scanned (#59).
     *
     * Version-selection policy lives in [NodeExecutableResolver]; this method only does
     * the filesystem glue.
     */
    private fun findNvmNode(home: String): String? {
        val versionsDir = File(home, ".nvm/versions/node")
        if (!versionsDir.isDirectory) return null

        val installed = versionsDir.listFiles { f -> f.isDirectory }?.map { it.name } ?: return null
        if (installed.isEmpty()) return null

        val defaultAlias = File(home, ".nvm/alias/default")
            .takeIf { it.isFile }
            ?.readText()

        val chosen = NodeExecutableResolver.selectNvmVersion(installed, defaultAlias) ?: return null
        val nodePath = File(versionsDir, "$chosen/bin/node")
        return if (nodePath.exists() && nodePath.canExecute()) {
            logger.info("Found node via nvm scan: ${nodePath.absolutePath} (alias=${defaultAlias?.trim()})")
            nodePath.absolutePath
        } else {
            null
        }
    }

    // ─── Lifecycle ──────────────────────────────────────────────────

    /**
     * Detach from the Node.js process without killing it.
     * Does NOT close stdin/stdout/stderr pipes or cancel coroutines —
     * closing pipes would cause SIGPIPE/EPIPE in the Node.js process.
     * JVM shutdown will clean up naturally.
     * The Node.js backend will self-exit via its idle shutdown timer
     * when all WebSocket connections are closed.
     */
    fun detach() {
        logger.info("Detaching from NodeProcessManager (process stays alive)")
        // Intentionally NOT cancelling jobs.
        // Pipes must stay open so Node.js doesn't receive SIGPIPE.
        process = null
        logger.info("NodeProcessManager detached")
    }

    override fun dispose() {
        logger.info("Disposing NodeProcessManager")
        // Mark disposed BEFORE destroying the process: the exit observed by proc.waitFor()
        // in start() must see this flag set, so it suppresses the restart callback for this
        // intentional shutdown rather than respawning a backend we're trying to kill.
        disposed = true
        setLifecycle(Lifecycle.DEAD)

        stdoutJob?.cancel()
        stderrJob?.cancel()

        process?.let { proc ->
            if (proc.isAlive) {
                proc.destroy()
                // Give it a moment to terminate gracefully
                try {
                    val exited = proc.waitFor(3, java.util.concurrent.TimeUnit.SECONDS)
                    if (!exited) {
                        logger.warn("Node.js process did not terminate gracefully, forcing...")
                        proc.destroyForcibly()
                    }
                } catch (e: InterruptedException) {
                    proc.destroyForcibly()
                }
            }
        }

        process = null
        logger.info("NodeProcessManager disposed")
    }

    /**
     * Check whether the underlying Node.js process is still running.
     */
    val isAlive: Boolean
        get() = process?.isAlive == true

    companion object {
        // How many recent stderr lines to retain for startup-failure diagnostics (#97).
        private const val MAX_STDERR_LINES = 30

        // Upper bound on awaiting the shared resource-extraction gate before failing a
        // backend start. Extraction is normally prewarmed at app init and already done by
        // the time a backend starts; this only guards a cold first start on a slow disk so
        // start() never hangs indefinitely (the #97 lesson). On timeout we fail-fast.
        private const val RESOURCE_READY_TIMEOUT_MS = 30_000L

        /**
         * Unified "restart the plugin backend" exit code. The Node backend self-exits with
         * this code to ask its managing side to respawn it on the same port. MUST stay in
         * sync with backend `RESTART_EXIT_CODE` (backend/src/config/environment.ts) and the
         * ccg standalone launcher (cli/lib/spawn/foreground.sh).
         */
        const val RESTART_EXIT_CODE = 75

        /**
         * Decide whether a backend exit should trigger a respawn. A restart is requested
         * only when the process exited with [RESTART_EXIT_CODE] AND the exit was not caused
         * by an intentional [dispose] (which destroys the process and would otherwise be
         * mistaken for a restart request). Pure function so the gating is unit-testable
         * without spawning a real Node process.
         */
        fun shouldRequestRestart(exitCode: Int, disposed: Boolean): Boolean =
            exitCode == RESTART_EXIT_CODE && !disposed

        /**
         * A clean exit the backend chose for itself (idle self-shutdown = exit 0),
         * as opposed to a [dispose]-driven kill (SIGTERM → 143, `disposed` set) or
         * a crash (any other non-zero code). Only this case stands the RPC
         * reconnect/restart watchdog down — crash recovery stays untouched.
         */
        fun isIntentionalExit(exitCode: Int, disposed: Boolean): Boolean =
            exitCode == 0 && !disposed
    }
}
