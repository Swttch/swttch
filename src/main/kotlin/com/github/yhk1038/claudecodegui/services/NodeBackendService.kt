package com.github.yhk1038.claudecodegui.services

import com.github.yhk1038.claudecodegui.bridge.ExtractedResources
import com.github.yhk1038.claudecodegui.bridge.NodeProcessManager
import com.github.yhk1038.claudecodegui.bridge.PluginResourceExtractor
import com.github.yhk1038.claudecodegui.bridge.RpcWebSocketClient
import com.github.yhk1038.claudecodegui.bridge.WslPathResolver
import com.github.yhk1038.claudecodegui.bridge.parseHostModeParam
import com.github.yhk1038.claudecodegui.hosting.HostModeCache
import com.github.yhk1038.claudecodegui.statusbar.BackendStatusClient
import com.github.yhk1038.claudecodegui.toolwindow.realization.LoadingPhase
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.ProjectManager
import kotlinx.coroutines.*
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Application-level service that manages **one Node.js backend per IDE project
 * root** (`project.basePath`).
 *
 * This mirrors VS Code's Remote model, where each workspace gets its own
 * extension host running in that workspace's execution environment. For us the
 * "extension host" is the Node.js backend, and the unit that decides the
 * execution environment is the IDE project root: a root inside WSL
 * (`\\wsl.localhost\<distro>\...`) must run its backend inside that distro, a
 * native root runs natively. Sharing one backend across roots can't satisfy
 * that, so each root gets its own backend on its own OS-assigned port.
 *
 * Key = `project.basePath` (NOT workingDir): nested working-directory navigation
 * (#43) changes the session cwd within a root but never the root, so it must not
 * spawn or switch backends.
 *
 * Background: issue #57. The previous model (single fixed-port backend shared by
 * all roots and all IDE instances, #76) is superseded here; cross-IDE backend
 * sharing is intentionally dropped (each IDE instance runs its own per-root
 * backends, distinguished by dynamic ports).
 */
@Service(Service.Level.APP)
class NodeBackendService : Disposable {

    private val logger = Logger.getInstance(NodeBackendService::class.java)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    // key = IDE 프로젝트 루트 (project.basePath)
    private val backends = ConcurrentHashMap<String, BackendInstance>()

    /**
     * Listeners notified (with the affected project root) whenever a backend's
     * lifecycle changes or the keep-alive toggle flips — the status-bar widget's
     * update signal. Called from arbitrary threads; listeners marshal to the EDT.
     */
    private val stateListeners = CopyOnWriteArrayList<(String) -> Unit>()

    fun addBackendStateListener(listener: (String) -> Unit) {
        stateListeners.add(listener)
    }

    fun removeBackendStateListener(listener: (String) -> Unit) {
        stateListeners.remove(listener)
    }

    private fun fireBackendStateChanged(basePath: String) {
        for (listener in stateListeners) {
            try {
                listener(basePath)
            } catch (e: Exception) {
                logger.warn("Backend state listener threw", e)
            }
        }
    }

    /**
     * Application-scoped resource-extraction gate (issue #149). The plugin's webview
     * static files and `backend.mjs` are extracted from the plugin JAR **once per
     * (IDE product, plugin version)** into a version-scoped dir, shared by every
     * per-root backend and never deleted on process exit. Every [BackendInstance]
     * awaits this Deferred instead of extracting itself, so successive backend
     * generations read the same live dir — no generation's shutdown can delete a dir
     * another is still serving (the root cause of the `Not found` blank panel).
     *
     * LAZY: nothing runs until [prewarmResources] (app-init) or the first backend
     * awaits it, so a self-healing extraction still happens even if app-init is skipped
     * (e.g. dynamic plugin reload).
     */
    private val resourcesReady: Deferred<ExtractedResources> =
        scope.async(Dispatchers.IO, start = CoroutineStart.LAZY) {
            PluginResourceExtractor().resolve()
        }

    /**
     * Start resource extraction ahead of the first backend spawn. Called at app init so
     * an IDE restart (which the plugin already requires after an update) is the natural
     * moment extraction happens — by the time a panel opens, the gate is usually done.
     * Idempotent: starting an already-started Deferred is a no-op.
     */
    fun prewarmResources() {
        resourcesReady.start()
    }

    /**
     * One Node.js backend dedicated to a single IDE project root. Owns its
     * process, RPC socket, port, and the per-panel handlers for that root.
     */
    private inner class BackendInstance(private val basePath: String) {
        private var nodeProcessManager: NodeProcessManager? = null
        private var rpcClient: RpcWebSocketClient? = null

        /**
         * Stable control-channel auth token for THIS root's backend. Derived from a
         * persisted per-user secret (see [stableAuthToken]), so it is the SAME value on
         * every launch and every respawn — the backend restarts frequently, and an
         * already-loaded webview (which redeemed the token once via a pairing code) must
         * still authenticate against the respawned backend without re-pairing. The
         * launcher OWNS this token: it is handed to the node spawn (CCG_AUTH_TOKEN env),
         * this backend's [RpcWebSocketClient] (`ccg-auth` /rpc subprotocol), and the
         * IDE to backend /internal POSTs. It is NEVER placed in any URL and NEVER logged.
         */
        val authToken: String = stableAuthToken

        /**
         * Fresh single-use INITIAL pairing code for THIS root's backend, regenerated on
         * every spawn ([start]). Injected into the node process (CCG_INITIAL_PAIR_CODE)
         * so the backend seeds its pairing store with it, and embedded as `?pair=` in the
         * JCEF load URL so the webview redeems it once (POST /pair) for [authToken]. This
         * keeps the auth token out of every URL. NEVER logged.
         */
        @Volatile
        var initialPairCode: String = ""
            private set

        @Volatile
        var portDeferred = CompletableDeferred<Int>()
            private set

        // The port this backend last bound. Reused on respawn so an already-loaded
        // WebView (pointing at this port) reconnects instead of being stranded on a
        // stale port. 0 = never started → OS assigns a free port on first start.
        @Volatile
        private var lastPort: Int = 0

        // panelId -> handler. The Claude Code editor tabs open under this root.
        val handlers = ConcurrentHashMap<String, NodeProcessManager.RpcHandler>()

        // panelId -> loading-progress listener. Panels register here so they can
        // reflect the backend's start sub-phases in their placeholder label (#97).
        private val progressListeners = ConcurrentHashMap<String, (LoadingPhase) -> Unit>()

        fun addProgressListener(panelId: String, listener: (LoadingPhase) -> Unit) {
            progressListeners[panelId] = listener
        }

        fun removeProgressListener(panelId: String) {
            progressListeners.remove(panelId)
        }

        private fun emitProgress(phase: LoadingPhase) {
            progressListeners.values.forEach { it(phase) }
        }

        /**
         * RPC requests from this backend always concern this one project root, so
         * they are delegated to any registered panel handler for the root (all
         * equivalent — same project). Only [getIdeRoot] is pinned to [basePath].
         */
        private inner class Router : NodeProcessManager.RpcHandler {
            private fun any(): NodeProcessManager.RpcHandler? = handlers.values.firstOrNull()
            private fun warn(op: String): Nothing? {
                logger.warn("No panel handler for $op (basePath=$basePath)"); return null
            }

            override suspend fun openFile(path: String, line: Int?, column: Int?) {
                any()?.openFile(path, line, column) ?: warn("openFile")
            }

            override suspend fun openDiff(
                filePath: String,
                oldContent: String,
                newContent: String,
                toolUseId: String?,
                sessionId: String?,
                controlRequestId: String?,
            ) {
                any()?.openDiff(filePath, oldContent, newContent, toolUseId, sessionId, controlRequestId)
                    ?: warn("openDiff")
            }

            override suspend fun applyDiff(filePath: String, newContent: String, toolUseId: String?): Boolean =
                any()?.applyDiff(filePath, newContent, toolUseId) ?: run { warn("applyDiff"); false }

            override suspend fun rejectDiff(toolUseId: String?) {
                any()?.rejectDiff(toolUseId) ?: warn("rejectDiff")
            }

            override suspend fun closeDiff(toolUseId: String) {
                any()?.closeDiff(toolUseId) ?: warn("closeDiff")
            }

            override suspend fun openDiffTab(toolUseId: String) {
                any()?.openDiffTab(toolUseId) ?: warn("openDiffTab")
            }

            override suspend fun closeDiffTab(toolUseId: String) {
                any()?.closeDiffTab(toolUseId) ?: warn("closeDiffTab")
            }

            override suspend fun refreshFiles(paths: List<String>) {
                if (paths.isEmpty()) return
                any()?.refreshFiles(paths) ?: warn("refreshFiles")
            }

            override suspend fun createSession(workingDir: String) {
                any()?.createSession(workingDir) ?: warn("createSession")
            }

            override suspend fun openNewTab(workingDir: String) {
                any()?.openNewTab(workingDir) ?: warn("openNewTab")
            }

            override suspend fun openSession(sessionId: String, workingDir: String?) {
                any()?.openSession(sessionId, workingDir) ?: warn("openSession")
            }

            override suspend fun setTabName(panelId: String, name: String) {
                any()?.setTabName(panelId, name) ?: warn("setTabName")
            }

            override suspend fun openSettings(workingDir: String, path: String?) {
                any()?.openSettings(workingDir, path) ?: warn("openSettings")
            }

            override suspend fun openTerminal(workingDir: String) {
                any()?.openTerminal(workingDir) ?: warn("openTerminal")
            }

            override suspend fun openDevTools() {
                any()?.openDevTools() ?: warn("openDevTools")
            }

            override suspend fun openUrl(url: String) {
                any()?.openUrl(url) ?: warn("openUrl")
            }

            override suspend fun pickFiles(mode: String, multiple: Boolean): List<String> =
                any()?.pickFiles(mode, multiple) ?: run { warn("pickFiles"); emptyList() }

            override suspend fun updatePlugin() {
                any()?.updatePlugin() ?: warn("updatePlugin")
            }

            override suspend fun requiresRestart(): Boolean =
                any()?.requiresRestart() ?: run { warn("requiresRestart"); true }

            override suspend fun getIdeRoot(workingDir: String?): String? = basePath.ifBlank { null }
        }

        @Synchronized
        fun start() {
            // Alive → nothing to do. A backend that started and then exited (e.g. the
            // Node idle-shutdown timer fired between panels) reports isDead == true and
            // must be respawned — otherwise we'd hand callers a port no one is listening
            // on. (A still-spawning manager reports isDead == false, so concurrent panel
            // inits don't race a duplicate spawn.)
            nodeProcessManager?.let { if (!it.isDead) return }
            nodeProcessManager?.let { stop() } // clean up a dead manager/socket

            // Wake any awaiter still parked on the previous (now superseded) deferred so
            // it fails fast instead of hanging on a port that will never arrive — the new
            // deferred below is a different object the old awaiter can't observe. Matters
            // on the retry path (restart() → start()), where a panel may already be in
            // awaitPort(). See issue #97.
            if (!portDeferred.isCompleted) {
                portDeferred.cancel(CancellationException("Backend restarting"))
            }
            portDeferred = CompletableDeferred()
            // A WSL project root (UNC basePath) runs its backend inside the distro so
            // node/claude execute as Linux natives (issue #57); a native root runs locally.
            val wsl = WslPathResolver.parseUncPath(basePath)
            // Fresh single-use pairing code for this (re)spawn. Seeded into the node
            // process (CCG_INITIAL_PAIR_CODE) and embedded as `?pair=` in the JCEF URL,
            // so the webview redeems it for the stable token instead of the token ever
            // appearing in a URL. Regenerated per spawn; the value is never logged.
            initialPairCode = generateInitialPairCode()
            val manager = NodeProcessManager(
                scope,
                // Reuse the last bound port on respawn (0 only on first start) so a WebView
                // already pointing at this port reconnects instead of hitting a dead port.
                requestedPort = lastPort,
                wslDistro = wsl?.distro,
                wslCwd = wsl?.linuxPath,
                // So a project-scoped `nodePath` is honoured when picking the node
                // that launches this backend (issue #7).
                projectRoot = basePath,
                onProgress = ::emitProgress,
                // Unified restart signal: when the backend self-exits with RESTART_EXIT_CODE
                // (and not via dispose), respawn it on the same port. restart() is
                // @Synchronized and runs stop()+start(), so it can't re-enter the start()
                // that is still in progress, and lastPort is reused for a seamless reconnect.
                onRestartRequested = { restart() },
                // Clean self-exit (idle shutdown): stand the RPC reconnect/restart
                // watchdog down — otherwise it treats the silence as a crash and
                // respawns the backend ~15 s after EVERY idle shutdown, forever.
                // The next panel open / eager start respawns on demand as usual.
                onIntentionalExit = { releaseRpcClientAfterIntentionalExit() },
                // Status-bar widget signal: every lifecycle transition of this root's
                // backend re-renders the widgets watching this root.
                onLifecycleChanged = { fireBackendStateChanged(basePath) },
                // Shared extraction gate: the manager awaits this instead of extracting its
                // own temp dir, so all backend generations share one live dir (#149).
                resourcesReady = resourcesReady,
                // Stable control-channel token — injected into the node process as
                // CCG_AUTH_TOKEN so it requires the token on every /ws, /rpc, /logs upgrade.
                authToken = authToken,
                // Fresh single-use pairing code — injected as CCG_INITIAL_PAIR_CODE so the
                // backend seeds its pairing store; the webview redeems it via `?pair=`.
                initialPairCode = initialPairCode,
            )
            nodeProcessManager = manager
            manager.start()
            scope.launch {
                try {
                    val port = manager.port.await()
                    lastPort = port
                    portDeferred.complete(port)
                    logger.info("Node.js backend for '$basePath' started on port $port")
                    connect(port)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    portDeferred.completeExceptionally(e)
                    logger.error("Failed to start Node.js backend for '$basePath'", e)
                    // Plugin error boundary: a backend that failed to start is a plugin-side
                    // failure worth reporting. Forward via any RPC-ready backend (this one
                    // isn't connected, by definition of the failure).
                    reportError(e, where = "NodeBackendService.start", projectBasePath = basePath)
                }
            }
        }

        private fun connect(port: Int) {
            rpcClient?.dispose()
            val client = RpcWebSocketClient(
                scope,
                Router(),
                onPersistentFailure = { restart() },
                // Re-assert the desired keep-alive state on EVERY (re)connect — this
                // covers fresh spawns, exit-75 respawns and RPC reconnects, and a
                // `false` push arms the backend's idle timer when it has no /ws
                // clients yet (closing the pre-existing prewarm leak).
                onConnected = { registerRoot(); pushKeepAlive() },
                // Route RPC-handling failures to the single Kotlin reporting point. This
                // backend is connected (the error came over its socket), so prefer it.
                onError = { throwable, where -> reportError(throwable, where, basePath) },
                // One-way Node→Kotlin state pushes. HOST_MODE_CHANGED carries the current
                // `hostMode`; the backend owns settings (CLAUDE.md) and on WSL2 Kotlin can't
                // read the settings file (home paths diverge), so we cache the pushed value
                // for synchronous host routing (issue #7). The method literal mirrors the
                // shared MessageType enum on the TS side.
                onNotification = ::handleRpcNotification,
                // Same per-launch token the node process was spawned with — attached as
                // the `ccg-auth` subprotocol so the /rpc upgrade passes Phase 1 auth.
                authToken = authToken,
            )
            rpcClient = client
            client.connect(port)
            logger.info("RPC WebSocket client connecting to port $port (basePath=$basePath)")
        }

        /**
         * Handle a one-way Node→Kotlin JSON-RPC notification. Currently only
         * HOST_MODE_CHANGED: cache the pushed `hostMode` so [com.github.yhk1038.claudecodegui.hosting.ChatHostRouter]
         * can route chat windows synchronously without reading the settings file
         * (which diverges from the Linux home on WSL2 — issue #7). Unknown methods
         * are ignored; the method literal mirrors the shared MessageType enum (TS).
         */
        private fun handleRpcNotification(method: String, params: JsonObject) {
            when (method) {
                "HOST_MODE_CHANGED" -> {
                    val hostMode = parseHostModeParam(params) ?: return
                    HostModeCache.update(hostMode)
                    logger.info("Cached hostMode from backend push: $hostMode (basePath=$basePath)")
                }
                else -> logger.warn("Unhandled RPC notification from backend: $method")
            }
        }

        /** Tell the backend which IDE project root this socket serves, for IDE-bound routing. */
        private fun registerRoot() {
            if (basePath.isBlank()) return
            val params = buildJsonObject { putJsonArray("roots") { add(basePath) } }
            rpcClient?.sendNotification("REGISTER_PROJECT_ROOTS", params)
        }

        /**
         * Push this backend's keep-alive gate: the gate is up exactly while the IDE
         * owns this backend — i.e. while its project window is still open. This is
         * the default lifecycle, not an opt-in: as long as the owning IDE lives,
         * closing the chat panel (all /ws sockets gone) must NOT retire the backend,
         * so a re-opened panel reconnects instantly instead of paying a cold restart.
         *
         * Closing the project window re-pushes (via [com.github.yhk1038.claudecodegui.startup.BackendProjectCloseService])
         * and the recomputed `false` hands the backend back to the idle regime — the
         * same clamp the ppid watchdog applies on IDE death, just per project. A live
         * browser/tunnel client still keeps a now-ownerless backend alive (open /ws
         * clients block the idle timer); only a backend with no owner AND no client
         * retires after the idle grace.
         *
         * Always sent, `false` included — idempotent on the backend side, and the
         * `false` push is what arms the idle timer on a backend that never received
         * a /ws client (the prewarm-leak fix). The method literal mirrors the shared
         * MessageType enum on the TS side (SET_KEEP_ALIVE).
         */
        fun pushKeepAlive() {
            val projectOpen = ProjectManager.getInstance().openProjects.any { it.basePath == basePath }
            val params = buildJsonObject { put("enabled", projectOpen) }
            rpcClient?.sendNotification("SET_KEEP_ALIVE", params)
        }

        /** Current process lifecycle, or null when no manager exists (never started). */
        fun lifecycleOrNull(): NodeProcessManager.Lifecycle? = nodeProcessManager?.currentLifecycle

        /** The bound port, or null while not RUNNING / not yet known. */
        fun portOrNull(): Int? {
            if (nodeProcessManager?.currentLifecycle != NodeProcessManager.Lifecycle.RUNNING) return null
            // lastPort is written the moment the PORT line arrives; 0 = not yet known.
            return lastPort.takeIf { it != 0 }
        }

        @Synchronized
        fun restart() {
            stop()
            start()
        }

        /**
         * The backend exited cleanly by its own decision (idle self-shutdown, exit 0).
         * Dispose the RPC client so its reconnect loop cannot escalate into a full
         * backend restart — that loop is crash RECOVERY, and this exit is not a crash.
         * Guard: skip when a newer backend generation is already alive (a racing
         * restart owns the current rpcClient; its connect() manages it).
         */
        @Synchronized
        fun releaseRpcClientAfterIntentionalExit() {
            if (nodeProcessManager?.isAlive == true) return
            rpcClient?.dispose(); rpcClient = null
            logger.info(
                "Backend for '$basePath' retired (idle shutdown) — RPC watchdog stood down; " +
                    "the next panel open / eager start respawns it",
            )
        }

        fun sendNotification(method: String, params: JsonObject) {
            rpcClient?.sendNotification(method, params)
                ?: logger.warn("Cannot send '$method' — RPC client not ready (basePath=$basePath)")
        }

        /** True when this backend's RPC socket is connected and can forward a notification. */
        fun isRpcReady(): Boolean = rpcClient != null

        suspend fun awaitPort(): Int = portDeferred.await()

        /** Recent backend stderr, for surfacing a startup-failure cause (#97). */
        fun recentDiagnostics(): String? = nodeProcessManager?.recentStderr()

        /** Kill the process — used by restart() for a clean slate. */
        fun stop() {
            rpcClient?.dispose(); rpcClient = null
            nodeProcessManager?.dispose(); nodeProcessManager = null
        }

        /** Detach without killing — the Node.js process self-exits on idle. */
        fun detach() {
            rpcClient?.dispose(); rpcClient = null
            nodeProcessManager?.detach(); nodeProcessManager = null
        }
    }

    /**
     * Ensure the backend for [projectBasePath] is started and register this
     * panel's RPC handler. First call for a root spawns its Node.js process;
     * later calls just register the handler.
     */
    @Synchronized
    fun ensureStarted(projectBasePath: String, panelId: String, rpcHandler: NodeProcessManager.RpcHandler) {
        val inst = backends.getOrPut(projectBasePath) { BackendInstance(projectBasePath) }
        inst.handlers[panelId] = rpcHandler
        inst.start() // no-op if already running
    }

    /**
     * Current backend lifecycle for [projectBasePath]; null = no backend was ever
     * started for that root (the widget renders this as "stopped").
     */
    fun lifecycleOf(projectBasePath: String): NodeProcessManager.Lifecycle? =
        backends[projectBasePath]?.lifecycleOrNull()

    /** Bound port for [projectBasePath]'s backend, or null while not running. */
    fun portOf(projectBasePath: String): Int? = backends[projectBasePath]?.portOrNull()

    /**
     * Re-assert the keep-alive gate when a project window (re)opens, invoked by
     * [BackendProjectOpenListener]. The open counterpart of [clampAfterProjectClose]:
     * a backend that outlived an earlier close of this project (live browser/tunnel
     * clients kept it alive) still has `enabled = false` from the clamp and its RPC
     * socket never dropped, so `onConnected` won't fire to correct it. Re-push so the
     * gate reflects "project open" once more — the IDE owns this backend again.
     * No-op when no backend is registered or its RPC is not ready; the fresh-spawn
     * and reconnect cases are already covered by `onConnected`.
     */
    fun reassertKeepAliveOnProjectOpen(projectBasePath: String) {
        val inst = backends[projectBasePath]?.takeIf { it.isRpcReady() } ?: return
        inst.pushKeepAlive()
        fireBackendStateChanged(projectBasePath)
        logger.info("Project '$projectBasePath' opened — keep-alive gate re-asserted")
    }

    /**
     * Register a loading-progress [listener] for [panelId] so the panel can mirror the
     * backend's start sub-phases in its placeholder. Register BEFORE [ensureStarted] so
     * the first phase emitted by start() is not missed. See issue #97.
     */
    @Synchronized
    fun addProgressListener(projectBasePath: String, panelId: String, listener: (LoadingPhase) -> Unit) {
        backends.getOrPut(projectBasePath) { BackendInstance(projectBasePath) }
            .addProgressListener(panelId, listener)
    }

    /** Await the port of the backend serving [projectBasePath]. */
    suspend fun awaitPort(projectBasePath: String): Int =
        (backends[projectBasePath]
            ?: error("No backend registered for project root: $projectBasePath")).awaitPort()

    /**
     * The stable control-channel auth token of the backend serving [projectBasePath],
     * or null when no backend is registered for that root. Used by this backend's
     * [RpcWebSocketClient] (`ccg-auth` /rpc subprotocol) and the IDE to backend
     * /internal POSTs (`x-ccg-token` header) so they authenticate against the same
     * token the backend was spawned with. It is NEVER placed in a URL — the webview
     * obtains it by redeeming [initialPairCode]. Never logged by callers.
     */
    fun authToken(projectBasePath: String): String? = backends[projectBasePath]?.authToken

    /**
     * The fresh single-use initial pairing code of the backend serving
     * [projectBasePath], or null when no backend is registered for that root. The JCEF
     * load URL embeds this as `?pair=`; the webview redeems it once at POST /pair for
     * the stable auth token, keeping the token out of every URL. Regenerated on each
     * spawn. Never logged by callers.
     */
    fun initialPairCode(projectBasePath: String): String? = backends[projectBasePath]?.initialPairCode

    /**
     * Mint a fresh single-use LOCAL pairing code from the backend serving
     * [projectBasePath], or null when no backend is running or the request fails.
     * Blocks on a short loopback HTTP round-trip — callers MUST invoke this OFF the
     * EDT.
     *
     * Used by the status-bar card's "Open in browser" action: the system browser
     * (a separate storage partition from JCEF) has no auth token, so the card
     * embeds this code as `?pair=<code>` in the loopback URL and the browser
     * redeems it once at POST /pair for the real token. The code is NEVER logged.
     */
    fun issueLocalPairCode(projectBasePath: String): String? {
        val port = portOf(projectBasePath) ?: return null
        return BackendStatusClient.fetchLocalPairCode(port, authToken(projectBasePath))
    }

    /**
     * Most recent backend stderr for [projectBasePath], or null when none. Used to
     * attach a concrete cause to a start failure/timeout error panel. See issue #97.
     */
    fun recentBackendDiagnostics(projectBasePath: String): String? =
        backends[projectBasePath]?.recentDiagnostics()

    /**
     * Per-project keep-alive clamp, invoked by [com.github.yhk1038.claudecodegui.startup.BackendProjectCloseService] after a
     * project window closes. Re-pushes the effective keep-alive state — which
     * [BackendInstance.pushKeepAlive] now computes as `false` (project no longer
     * open) — so a client-less backend retires after the usual 60 s instead of
     * outliving its window until IDE exit. A backend with live browser clients
     * keeps running until they disconnect (keep-alive promise kept).
     */
    fun clampAfterProjectClose(projectBasePath: String) {
        val inst = backends[projectBasePath]?.takeIf { it.isRpcReady() } ?: return
        inst.pushKeepAlive()
        logger.info("Project '$projectBasePath' closed — keep-alive gate released (idle regime restored)")
    }

    /** Restart the backend for [projectBasePath] (retry path). */
    @Synchronized
    fun restart(projectBasePath: String) {
        backends[projectBasePath]?.restart()
            ?: logger.warn("restart: no backend for project root $projectBasePath")
    }

    /** Send a JSON-RPC notification to the backend serving [projectBasePath]. */
    fun sendNotification(projectBasePath: String, method: String, params: JsonObject) {
        backends[projectBasePath]?.sendNotification(method, params)
            ?: logger.warn("sendNotification: no backend for project root $projectBasePath")
    }

    /**
     * The Kotlin (IDE plugin) error boundary's single reporting point. Forwards a
     * caught top-level exception to the Node backend as a CLIENT_ERROR notification;
     * Node converges it at its own single reporting point (reportBackendError,
     * origin:'kotlin') and decides whether to transmit (consent gating lives there).
     *
     * Kotlin holds NO telemetry logic — it is only the transport that hands the error
     * to Node (single-backend principle). This never throws: a failure to report must
     * not cascade. [where] tags which plugin entry point caught it.
     *
     * Routing note: error reporting is backend-agnostic — any connected backend reaches
     * the same telemetry sink — so we use [projectBasePath]'s backend when known, else
     * fall back to the first RPC-ready backend. If none is connected yet, the report is
     * dropped (Node's own boundaries still cover backend-side failures).
     */
    fun reportError(throwable: Throwable, where: String, projectBasePath: String? = null) {
        try {
            val target = projectBasePath?.let { backends[it] }
                ?: backends.values.firstOrNull { it.isRpcReady() }
            if (target == null) {
                logger.warn("reportError($where): no RPC-ready backend to forward CLIENT_ERROR; dropping")
                return
            }
            val params = buildJsonObject {
                put("message", throwable.message ?: throwable.javaClass.simpleName)
                put("stack", throwable.stackTraceToString())
                put("where", where)
            }
            target.sendNotification("CLIENT_ERROR", params)
        } catch (e: Exception) {
            // Reporting must never cascade into another failure.
            logger.warn("reportError($where) failed to forward CLIENT_ERROR", e)
        }
    }

    /**
     * Remove a panel's handler from its root's backend. The Node.js process is
     * left running — it self-exits via its idle shutdown timer when all WebSocket
     * connections close.
     */
    fun releasePanel(projectBasePath: String, panelId: String) {
        val inst = backends[projectBasePath] ?: return
        inst.handlers.remove(panelId)
        inst.removeProgressListener(panelId)
        logger.info("Panel released: $projectBasePath::$panelId (remaining handlers: ${inst.handlers.size})")
    }

    override fun dispose() {
        // IDE shutting down — dispose RPC clients and detach from the processes.
        // Browser clients may still be connected; Node.js self-exits on idle.
        // Do NOT cancel scope — that would close stdout/stderr pipes and SIGPIPE Node.
        backends.values.forEach { it.detach() }
        backends.clear()
        logger.info("NodeBackendService disposed (backends detached, not killed)")
    }

    companion object {
        private val companionLogger = Logger.getInstance(NodeBackendService::class.java)

        fun getInstance(): NodeBackendService =
            ApplicationManager.getApplication().getService(NodeBackendService::class.java)

        /**
         * Stable control-channel auth token for this user: `HMAC-SHA256(secret,
         * "ccg-auth")` as 64 lowercase hex chars, where `secret` is a persisted random
         * value (see [loadOrCreateAuthSecret]). Because the secret survives on disk, the
         * derived token is the SAME on every launch and every backend respawn — which is
         * exactly what lets an already-loaded webview reconnect to a restarted backend
         * without re-pairing. The launcher owns this token and injects it into the node
         * process via CCG_AUTH_TOKEN. Computed once per process (lazy). NEVER logged.
         */
        val stableAuthToken: String by lazy { deriveAuthToken(loadOrCreateAuthSecret()) }

        /**
         * On-disk location of the per-user auth secret. Mirrors the plugin config dir
         * (SettingsManager persists `~/.claude-code-gui/settings.js`), so we keep the
         * secret alongside it at `~/.claude-code-gui/auth-secret`. The TOKEN itself is
         * derived from this secret and never written to disk.
         */
        private fun authSecretPath(): java.nio.file.Path =
            java.nio.file.Path.of(System.getProperty("user.home"), ".claude-code-gui", "auth-secret")

        /**
         * Read the persisted secret, or create it (0600) on first use. Stored as a
         * lowercase-hex string so it is shell-safe and byte-for-byte interoperable with
         * the ccg CLI's openssl-based HMAC (both HMAC over the hex string). Returns the
         * secret's UTF-8 bytes. Any I/O failure falls back to a fresh in-memory secret
         * for this process (a per-process token, rather than crashing). NEVER logged.
         */
        private fun loadOrCreateAuthSecret(): ByteArray {
            val path = authSecretPath()
            try {
                if (java.nio.file.Files.exists(path)) {
                    val existing = java.nio.file.Files.readAllBytes(path)
                        .toString(Charsets.UTF_8).trim()
                    if (existing.isNotEmpty()) return existing.toByteArray(Charsets.UTF_8)
                }
            } catch (e: Exception) {
                companionLogger.warn("Could not read auth secret; regenerating")
            }
            val raw = ByteArray(32)
            java.security.SecureRandom().nextBytes(raw)
            val hex = raw.joinToString("") { "%02x".format(it) }
            try {
                java.nio.file.Files.createDirectories(path.parent)
                java.nio.file.Files.write(path, hex.toByteArray(Charsets.UTF_8))
                restrictToOwner(path)
            } catch (e: Exception) {
                companionLogger.warn("Could not persist auth secret; using an in-memory secret this session")
            }
            return hex.toByteArray(Charsets.UTF_8)
        }

        /**
         * Best-effort 0600 on the secret file. Uses POSIX permissions where supported;
         * on Windows / non-POSIX filesystems POSIX perms are unavailable, so fall back to
         * the owner-only File flags and never fail. Public JDK APIs only (Plugin Verifier
         * stays clean).
         */
        private fun restrictToOwner(path: java.nio.file.Path) {
            try {
                java.nio.file.Files.setPosixFilePermissions(
                    path,
                    java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"),
                )
                return
            } catch (_: UnsupportedOperationException) {
                // Non-POSIX filesystem (e.g. Windows) — fall through to the File API.
            } catch (_: Exception) {
                return
            }
            try {
                val f = path.toFile()
                f.setReadable(false, false); f.setReadable(true, true)
                f.setWritable(false, false); f.setWritable(true, true)
            } catch (_: Exception) {
                // best-effort only
            }
        }

        /**
         * Derive the stable token: `HMAC-SHA256(secret, "ccg-auth")` as 64 lowercase hex
         * chars. Uses only public JDK crypto (javax.crypto.Mac "HmacSHA256") — no
         * Internal/impl platform API, so the marketplace Plugin Verifier stays clean.
         */
        private fun deriveAuthToken(secret: ByteArray): String {
            val mac = javax.crypto.Mac.getInstance("HmacSHA256")
            mac.init(javax.crypto.spec.SecretKeySpec(secret, "HmacSHA256"))
            val out = mac.doFinal("ccg-auth".toByteArray(Charsets.UTF_8))
            return out.joinToString("") { "%02x".format(it) }
        }

        /**
         * Generate a fresh single-use INITIAL pairing code: 24 cryptographically secure
         * random bytes (192 bits) rendered as URL-safe base64 without padding (~32
         * chars). Matches the backend's pairing-code entropy/shape. The launcher seeds
         * this into the node process (CCG_INITIAL_PAIR_CODE) AND embeds it as `?pair=` in
         * the webview URL; the webview redeems it once for the stable token, so the token
         * never appears in a URL. Public JDK APIs only (SecureRandom, Base64). NEVER logged.
         */
        private fun generateInitialPairCode(): String {
            val bytes = ByteArray(24)
            java.security.SecureRandom().nextBytes(bytes)
            return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
        }
    }
}
