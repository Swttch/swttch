package com.github.yhk1038.claudecodegui.toolwindow

import com.github.yhk1038.claudecodegui.actions.OpenClaudeCodeAction
import com.github.yhk1038.claudecodegui.bridge.NodeProcessManager
import com.github.yhk1038.claudecodegui.editor.ClaudeCodeVirtualFile
import com.github.yhk1038.claudecodegui.editor.IdeSelectionDispatcher
import com.github.yhk1038.claudecodegui.notifications.JcefRuntimeNotifier
import com.github.yhk1038.claudecodegui.services.ClaudeCodeBrowserService
import com.github.yhk1038.claudecodegui.services.AcceptedRange
import com.github.yhk1038.claudecodegui.services.DiffService
import com.github.yhk1038.claudecodegui.services.EditorTabStateService
import com.github.yhk1038.claudecodegui.services.NodeBackendService
import com.github.yhk1038.claudecodegui.toolwindow.realization.CallbackStaging
import com.github.yhk1038.claudecodegui.toolwindow.realization.LoadingPhase
import com.github.yhk1038.claudecodegui.toolwindow.realization.RealizationGate
import com.intellij.ide.BrowserUtil
import com.intellij.ide.dnd.DnDEvent
import com.intellij.ide.dnd.DnDManager
import com.intellij.ide.dnd.DnDTarget
import com.intellij.ide.dnd.FileCopyPasteUtil
import com.intellij.ide.dnd.TransferableWrapper
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptor
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.DumbService
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiElement
import com.intellij.util.ui.UIUtil
import javax.swing.UIManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.handler.CefDisplayHandlerAdapter
import org.cef.handler.CefLifeSpanHandlerAdapter
import org.cef.handler.CefLoadHandlerAdapter
import org.cef.handler.CefRequestHandlerAdapter
import org.cef.network.CefRequest
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Image
import java.awt.Point
import java.awt.datatransfer.DataFlavor
import java.awt.datatransfer.Transferable
import java.awt.dnd.DnDConstants
import java.awt.dnd.DropTarget
import java.awt.dnd.DropTargetAdapter
import java.awt.dnd.DropTargetDragEvent
import java.awt.dnd.DropTargetDropEvent
import java.io.File
import java.util.UUID
import javax.swing.JComponent
import javax.swing.JPanel

/**
 * JCEF browser panel that hosts the WebView UI.
 *
 * In the v4 single-backend architecture, all business logic (Claude CLI, sessions,
 * settings, file I/O) lives in the Node.js backend. This panel only:
 * - Manages the JCEF browser component (via [ClaudeCodeBrowserService] pooling)
 * - Starts [NodeProcessManager] to spawn the Node.js backend
 * - Loads `http://localhost:{port}` once the backend is ready
 * - Implements [NodeProcessManager.RpcHandler] for IDE-native operations
 *   (open file, diff viewer, new tab, settings) requested by the Node.js backend
 * - Handles cursor CSS -> Java cursor mapping
 * - Handles title changes, console logging, keyboard shortcuts, DevTools
 *
 * Browser instances are pooled by [ClaudeCodeBrowserService] so that tab
 * move/split operations preserve all WebView state (input, scroll, dialogs).
 */
class ClaudeCodePanel(
    private val project: Project,
    private val tabId: String = "default",
    private val initialPath: String? = null
) : JPanel(BorderLayout()), Disposable {

    private val logger = Logger.getInstance(ClaudeCodePanel::class.java)

    // Browser is owned by ClaudeCodeBrowserService, NOT by this panel.
    // This allows the browser to survive dispose-recreate cycles during tab move/split.
    // Returns null when JCEF is not supported (e.g. Android Studio without JCEF JBR).
    private val browserService = ClaudeCodeBrowserService.getInstance(project)
    private var holder: ClaudeCodeBrowserService.BrowserHolder? = null

    // No `browser` / `cursorQuery` / `streamingQuery` accessors here, on purpose.
    //
    // A JCEF type in the SIGNATURE of any member — even a private one — makes this
    // class impossible to instantiate on a runtime without JCEF. Constructing a
    // Component runs Component.isCoalesceEventsOverriden(), which reflects over
    // getDeclaredMethods() and resolves every signature; an absent JCEF class then
    // throws NoClassDefFoundError from inside the JPanel constructor, before the
    // isJcefAvailable() guard in init can run. Android Studio 2026.2 Canary ships
    // without the jcef module, so its class loader has no JBCefJSQuery at all and
    // opening the tool window threw (issue #321).
    //
    // Reflection ignores visibility, so `private` does not help, and writing the
    // type fully-qualified does not either — the bytecode signature is the same.
    // The JCEF objects are reached through `holder` inside method bodies instead,
    // which keeps the class loadable so the guard can run and the fallback panel
    // can be shown. `holder`'s own type is safe: a field type is resolved lazily,
    // only when the field is actually read.

    // Set by installOsrRepaintNudge while an OSR browser is alive; null otherwise
    // (windowed rendering has no ghosts to clear, and there is nothing to nudge
    // before the browser exists). Invoked from the page-driven bridge.
    private var requestRepaintNudge: (() -> Unit)? = null

    // One-shot guard so re-attach (tab move/split) does NOT re-schedule realization.
    private val realizationGate = RealizationGate()

    // Callback staging — set by ClaudeCodeFileEditor before the holder exists,
    // flushed onto the holder at realizeBrowser() time. Never overwrites a
    // pooled holder that already has a callback (tab move/split safety).
    private val titleStaging = CallbackStaging<(String) -> Unit>()
    private val pathStaging = CallbackStaging<(String) -> Unit>()
    private val streamingStaging = CallbackStaging<(Boolean) -> Unit>()

    @Volatile
    private var isPanelDisposed: Boolean = false

    // Title/path change callbacks delegated to BrowserHolder
    // so handlers installed on first panel creation can reach the latest panel's callbacks.
    // All callbacks are no-ops when holder is null (JCEF unavailable).
    var onTitleChanged: ((String) -> Unit)?
        get() = holder?.onTitleChanged ?: titleStaging.current()
        set(value) {
            titleStaging.stage(value)
            holder?.onTitleChanged = value
        }

    var onPathChanged: ((String) -> Unit)?
        get() = holder?.onPathChanged ?: pathStaging.current()
        set(value) {
            pathStaging.stage(value)
            holder?.onPathChanged = value
        }

    var onStreamingStateChanged: ((Boolean) -> Unit)?
        get() = holder?.onStreamingStateChanged ?: streamingStaging.current()
        set(value) {
            streamingStaging.stage(value)
            holder?.onStreamingStateChanged = value
        }

    // panelId IS the tabId — one identity across Kotlin (tabId) and the backend
    // (panelId), so backend-side lastFocused routing maps straight back to a Kotlin
    // panel with no separate mapping layer. JCEF only; a browser tab mints its own
    // panelId in resolvePanelId.
    private val panelId = tabId
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    private val backendService = NodeBackendService.getInstance()
    private val diffService: DiffService = DiffService.getInstance(project)

    // Loading label
    private val loadingLabel = javax.swing.JLabel(LoadingPhase.INDEXING_WAIT.message).apply {
        horizontalAlignment = javax.swing.SwingConstants.CENTER
        font = font.deriveFont(14f)
    }

    // Error panel
    private var errorPanel: JPanel? = null

    init {
        val jcef = browserService.jcefAvailability()
        if (!jcef.isUsable) {
            // JCEF unavailable (e.g. Android Studio without JCEF JBR). Fallback panel
            // shown immediately; no background realization will be scheduled.
            // The reason is passed along: an absent-classes IDE and an unsupported
            // runtime need opposite instructions (issue #321).
            add(JcefUnavailablePanel(jcef), BorderLayout.CENTER)
            logger.warn("JCEF is not usable in this runtime ($jcef) — showing fallback panel")
            JcefRuntimeNotifier.notify(project, jcef)
        } else {
            // Browser realization is deferred until addNotify() + DumbService.runWhenSmart.
            // Show the indexing-wait placeholder so the user knows the tab is alive.
            loadingLabel.text = LoadingPhase.INDEXING_WAIT.message
            add(loadingLabel, BorderLayout.CENTER)
        }
    }

    override fun addNotify() {
        super.addNotify()
        // JCEF unavailable: nothing to realize, fallback panel already shown.
        if (!browserService.isJcefAvailable()) return
        // One-shot guard. Tab move/split triggers removeNotify→addNotify on a fresh
        // panel instance, where the gate is fresh too. The holder pool inside
        // realizeBrowser() handles reuse via getOrCreate(); the gate only protects
        // against re-entry on THIS panel instance.
        if (!realizationGate.tryAcquire()) return
        scheduleBrowserRealization()
    }

    private fun scheduleBrowserRealization() {
        // runWhenSmart runs on the EDT and may execute synchronously if already smart.
        // dispose() may run before this callback fires (user closed the tab mid-indexing);
        // guard with isPanelDisposed and project.isDisposed.
        DumbService.getInstance(project).runWhenSmart {
            if (isPanelDisposed || project.isDisposed) return@runWhenSmart
            realizeBrowser()
        }
    }

    private fun realizeBrowser() {
        // Acquire (or reuse) the pooled browser holder. Null means the browser could
        // not be built: either JCEF went away between init and now, or the runtime's
        // JCEF disagrees with the platform's and construction threw (issue #295).
        // Swapping the placeholder for an explanation matters more than the
        // distinction — leaving the label up is what users saw as a blank window.
        val acquired = browserService.getOrCreate(tabId) ?: run {
            logger.warn("Could not create a JCEF browser for tab: $tabId — showing runtime mismatch panel")
            remove(loadingLabel)
            add(JcefRuntimeMismatchPanel(), BorderLayout.CENTER)
            revalidate()
            repaint()
            return
        }
        holder = acquired

        // Flush staged callbacks. flush() refuses to overwrite an existing holder
        // callback, so pooled-holder wiring from a previous panel survives.
        titleStaging.flush(acquired.onTitleChanged) { acquired.onTitleChanged = it }
        pathStaging.flush(acquired.onPathChanged) { acquired.onPathChanged = it }
        streamingStaging.flush(acquired.onStreamingStateChanged) { acquired.onStreamingStateChanged = it }

        val b = acquired.browser

        if (acquired.isLoaded) {
            // Browser already loaded (tab move/split): detach from previous parent if any,
            // remove the placeholder label, and re-attach.
            val parent = b.component.parent
            if (parent != null && parent !== this) {
                parent.remove(b.component)
            }
            remove(loadingLabel)
            add(b.component, BorderLayout.CENTER)
            revalidate()
            repaint()
            logger.info("Reattached existing JCEF browser for tab: $tabId")
        } else {
            // First load — switch the placeholder to the next phase.
            loadingLabel.text = LoadingPhase.BACKEND_START.message
            revalidate()
            repaint()
        }

        // Install JCEF handlers only once per browser instance.
        if (!acquired.handlersInstalled) {
            setupBrowserHandlers()
            acquired.handlersInstalled = true
        }

        // Install native (Swing/IDE) drag-and-drop bridge once per holder.
        if (!acquired.nativeDropBridgeInstalled) {
            setupNativeDropBridge()
            acquired.nativeDropBridgeInstalled = true
        }

        // OSR-only: install the stale-paint repaint nudge once per holder. Windowed
        // (non-OSR) browsers don't leave leftover edge pixels, so we skip it there.
        if (acquired.isOsr && !acquired.repaintNudgeInstalled) {
            installOsrRepaintNudge()
            acquired.repaintNudgeInstalled = true
        }

        // Mirror the backend's start sub-phases in the placeholder label so a slow
        // start (heavy .zshrc shell-PATH capture, first-run extraction) reads as
        // progress, not a frozen screen. Registered BEFORE ensureStarted so the first
        // emitted phase is not missed. See issue #97.
        backendService.addProgressListener(project.basePath ?: "", panelId) { phase ->
            ApplicationManager.getApplication().invokeLater {
                if (!isPanelDisposed && holder?.isLoaded != true) {
                    loadingLabel.text = phase.message
                }
            }
        }

        // Register RPC handler for this panel.
        backendService.ensureStarted(project.basePath ?: "", panelId, createRpcHandler())

        // Load URL only if not already loaded.
        if (!acquired.isLoaded) {
            scope.launch {
                try {
                    // Bound the wait: without a timeout a backend that never prints its
                    // PORT line (and never exits) leaves the panel stuck on the
                    // placeholder forever. withTimeoutOrNull returns null on timeout —
                    // and, being non-throwing, never trips the CancellationException
                    // re-throw below (TimeoutCancellationException is a subclass). #97.
                    val port = withTimeoutOrNull(BACKEND_START_TIMEOUT_MS) {
                        backendService.awaitPort(project.basePath ?: "")
                    }
                    if (port == null) {
                        logger.warn("Node.js backend did not become ready within ${BACKEND_START_TIMEOUT_MS}ms")
                        val diag = backendService.recentBackendDiagnostics(project.basePath ?: "")
                        javax.swing.SwingUtilities.invokeLater {
                            showBackendError("Backend did not become ready within ${BACKEND_START_TIMEOUT_MS / 1000} seconds.", diag)
                        }
                        return@launch
                    }
                    loadWebView(port)
                } catch (e: CancellationException) {
                    // Panel/tab closed before the backend port was ready — a normal
                    // shutdown, not a failure. Re-throw so it isn't logged as an error.
                    throw e
                } catch (e: Exception) {
                    logger.error("Failed to start Node.js backend", e)
                    val diag = backendService.recentBackendDiagnostics(project.basePath ?: "")
                    javax.swing.SwingUtilities.invokeLater {
                        showBackendError(e.message ?: "Unknown error", diag)
                    }
                }
            }
        }
    }

    // ─── Browser handlers (JCEF) ────────────────────────────────────

    // Called only from realizeBrowser() — the holder is guaranteed non-null here.
    private fun setupBrowserHandlers() {
        val h = holder!!
        val b = h.browser
        val cq = h.cursorQuery
        val sq = h.streamingQuery
        // The lambdas below must not capture `b` or mention JBCefJSQuery.Response,
        // or Kotlin lowers them into static methods ON THIS CLASS whose signatures
        // name a JCEF type — which AWT resolves in the JPanel constructor, bringing
        // back issue #321. Capturing the plain AWT component keeps them clean, and
        // the Response values are built by JcefHandlers, outside this class.
        val browserComponent: java.awt.Component = b.component

        // Handle CSS cursor changes from WebView
        JcefHandlers.onQuery(cq) { cursorName: String ->
            val javaCursorType = when (cursorName) {
                "text" -> java.awt.Cursor.TEXT_CURSOR
                "pointer" -> java.awt.Cursor.HAND_CURSOR
                "move" -> java.awt.Cursor.MOVE_CURSOR
                "crosshair" -> java.awt.Cursor.CROSSHAIR_CURSOR
                "wait" -> java.awt.Cursor.WAIT_CURSOR
                "grab", "grabbing" -> java.awt.Cursor.MOVE_CURSOR
                "col-resize", "e-resize", "w-resize", "ew-resize" -> java.awt.Cursor.E_RESIZE_CURSOR
                "row-resize", "n-resize", "s-resize", "ns-resize" -> java.awt.Cursor.N_RESIZE_CURSOR
                "nw-resize", "se-resize", "nwse-resize" -> java.awt.Cursor.NW_RESIZE_CURSOR
                "ne-resize", "sw-resize", "nesw-resize" -> java.awt.Cursor.NE_RESIZE_CURSOR
                "not-allowed", "no-drop" -> java.awt.Cursor.DEFAULT_CURSOR
                else -> java.awt.Cursor.DEFAULT_CURSOR
            }
            javax.swing.SwingUtilities.invokeLater {
                browserComponent.cursor = java.awt.Cursor.getPredefinedCursor(javaCursorType)
            }
        }

        // Handle streaming state changes from WebView.
        //
        // "repaint" rides this same channel rather than getting a JBCefJSQuery of its
        // own: a second query would mean another field on the pooled BrowserHolder and
        // another object to keep alive across tab move/split, for a message that is
        // just "the page changed, push a frame".
        JcefHandlers.onQuery(sq) { state: String ->
            if (state == "repaint") {
                requestRepaintNudge?.invoke()
            } else {
                holder!!.onStreamingStateChanged?.invoke(state == "streaming")
            }
        }

        // Inject scripts on page load
        b.jbCefClient.addLoadHandler(object : CefLoadHandlerAdapter() {
            override fun onLoadEnd(browser: CefBrowser, frame: CefFrame, httpStatusCode: Int) {
                if (frame.isMain) {
                    // Mark JCEF environment so detectRuntime() in environment.ts can detect
                    // the JetBrains environment and select JetBrainsAdapter over BrowserAdapter.
                    frame.executeJavaScript("window.__JCEF__ = true;", frame.url, 0)
                    // Inject the current IDE LAF theme so SettingsContext can resolve
                    // SYSTEM mode against the IDE rather than the OS prefers-color-scheme.
                    val ideTheme = if (com.intellij.ui.JBColor.isBright()) "light" else "dark"
                    frame.executeJavaScript("window.__IDE_THEME__ = '$ideTheme';", frame.url, 0)
                    // Mirror the IDE's current theme colors as CSS variables so the
                    // WebView can render flush against the IDE surface (issue #267).
                    // The variables are always injected; index.css only consumes them
                    // when the user enables "sync with IDE theme".
                    val colorsJs = ideColorsScript()
                    if (colorsJs.isNotEmpty()) {
                        frame.executeJavaScript(
                            colorsJs + markIdeColorsAvailableJs() + logIdeColorsJs(),
                            frame.url,
                            0,
                        )
                    }
                    // These build the script text rather than injecting it themselves,
                    // so that no member of ClaudeCodePanel takes a CefFrame — see the
                    // note next to `holder` (issue #321). Injection happens here, inside
                    // this anonymous handler, which is a class of its own.
                    frame.executeJavaScript(cursorTrackingScript(), frame.url, 0)
                    frame.executeJavaScript(streamingStateBridgeScript(), frame.url, 0)
                    // After the streaming bridge: the repaint reporter calls through it.
                    frame.executeJavaScript(repaintNudgeBridgeScript(), frame.url, 0)
                    installImeWorkaround()
                    logger.info("WebView loaded successfully")
                    // The webview (IDE-selection chip consumer) just reloaded, so
                    // any previously shown context chips are gone. Re-query the IDE's
                    // CURRENT active editor file and push it to the backend so its
                    // lastIdeSelection is synchronized to whatever the user is viewing
                    // now — not the stale file that was focused just before the tool
                    // window closed (while closed, Gate 2 in scheduleDispatch
                    // suppressed focus changes, so the backend can hold an old value).
                    // dispatchActiveEditor clears the dedup cache first, so the current
                    // file is sent even if its key matches the last pre-close dispatch.
                    // The webview subscribes to IDE_SELECTION after onLoadEnd, but the
                    // backend's addConnection replays lastIdeSelection to the freshly
                    // connected webview once the subscription is established, so this
                    // backend-update-on-open is what restores the correct chip.
                    IdeSelectionDispatcher.dispatchActiveEditor(project)
                    // Grab OS focus ONLY for the active, on-screen tab. The grab itself is
                    // needed — it's what lets the WebView focus its input textarea. The
                    // earlier UNCONDITIONAL grab was the bug: when several tabs realize at
                    // once (session restore) and the left tool window also held focus, they
                    // all fought and the CEF native component could not settle, toggling
                    // focusOwner null <-> CefBrowserWr$3 ~10x/s (visible flicker). Gating on
                    // isShowing limits the grab to the single visible tab — input focus works,
                    // background-restored tabs don't pile on. The left session panel never grabs.
                    if (tabId != ClaudeSessionsToolWindowFactory.SESSION_PANEL_TAB_ID) {
                        javax.swing.SwingUtilities.invokeLater {
                            if (b.component.isShowing) {
                                b.component.requestFocusInWindow()
                            }
                        }
                    }
                }
            }
        }, b.cefBrowser)

        // Install LAF (IDE theme) change listener — once per browser holder.
        // The listener lifetime is tied to the holder (not the panel) so it
        // survives tab move/split. Removed in ClaudeCodeBrowserService.release().
        installLafListener()

        // Title change detection, address change tracking, and console log capture
        b.jbCefClient.addDisplayHandler(object : CefDisplayHandlerAdapter() {
            override fun onAddressChange(browser: CefBrowser?, frame: CefFrame?, url: String?) {
                if (url != null && frame?.isMain == true) {
                    try {
                        val uri = java.net.URI(url)
                        holder!!.onPathChanged?.invoke(uri.path)
                    } catch (_: Exception) { /* ignore malformed URLs */ }
                }
            }

            override fun onTitleChange(browser: CefBrowser?, title: String?) {
                if (title != null && title.isNotBlank()) {
                    holder!!.onTitleChanged?.invoke(title)
                }
            }

            override fun onConsoleMessage(
                browser: CefBrowser?,
                level: org.cef.CefSettings.LogSeverity?,
                message: String?,
                source: String?,
                line: Int
            ): Boolean {
                val logPrefix = "[WebView]"
                // WebView console messages reflect WebView runtime state (e.g. not
                // logged in, claude CLI not found, request timeouts) — these are
                // recoverable conditions, not plugin defects. Never route them to
                // logger.error(), which the IDE surfaces as a fatal "Internal Error"
                // dialog. Cap WebView errors at WARNING so they stay in the log
                // without alarming the user. See issue #76.
                when (level) {
                    org.cef.CefSettings.LogSeverity.LOGSEVERITY_ERROR ->
                        logger.warn("$logPrefix $message (source: $source:$line)")
                    org.cef.CefSettings.LogSeverity.LOGSEVERITY_WARNING ->
                        logger.warn("$logPrefix $message")
                    else ->
                        logger.info("$logPrefix $message")
                }
                return false
            }
        }, b.cefBrowser)

        // Keyboard handler: prevent IDE from intercepting WebView shortcuts
        b.jbCefClient.addKeyboardHandler(
            WebViewKeyboardHandler(),
            b.cefBrowser
        )

        // Primary native-DnD hook for the JCEF surface. CEF asks every drag whether the
        // embedder wants to handle it before it does anything else (download / navigate /
        // open-in-new-tab). We swallow file drops here, extract the paths off CefDragData,
        // and route them to the composer; returning true cancels CEF's own handling so the
        // tab can't jump to about:blank#blocked.
        // CefDragHandler only has onDragEnter (no onDrop hook), and the page-level
        // dataTransfer can't carry absolute file paths for security reasons. So:
        //   1. On drag-enter, stash the OS paths on the backend (NATIVE_DROP),
        //   2. Return false so CEF forwards the drag as HTML5 events,
        //   3. The webview's drop handler issues NATIVE_DROP_FLUSH, which makes
        //      the backend replay the stashed paths back as NATIVE_DROP_ENTRIES.
        // Net effect: attach happens on drop (not on hover) AND uses the real
        // OS paths Kotlin received from CEF.
        JcefHandlers.onFileDrag(b) { paths ->
            logger.debug("[NativeDrop] CefDragHandler.onDragEnter stashing ${paths.size} file(s)")
            val files = paths.map { path ->
                val file = File(path)
                DroppedFile(file.absolutePath, file.isDirectory)
            }
            dispatchNativeDrop(files)
        }

        // Safety net: if a file:// navigation still slips through (e.g. via the JS layer),
        // cancel it before CEF's popup blocker jumps the tab to about:blank#blocked.
        b.jbCefClient.addRequestHandler(object : CefRequestHandlerAdapter() {
            override fun onBeforeBrowse(
                browser: CefBrowser?,
                frame: CefFrame?,
                request: CefRequest?,
                userGesture: Boolean,
                isRedirect: Boolean,
            ): Boolean {
                val url = request?.url ?: return false
                if (!url.startsWith("file://")) return false
                val droppedPath = runCatching { java.net.URI(url).path }.getOrNull()
                if (droppedPath.isNullOrBlank()) return true
                val file = File(droppedPath)
                logger.debug("Intercepted JCEF file:// navigation as native drop: $droppedPath (isDir=${file.isDirectory})")
                dispatchNativeDrop(listOf(DroppedFile(file.absolutePath, file.isDirectory)))
                return true
            }
        }, b.cefBrowser)

        // Life span handler: intercept window.open() popups and route them correctly
        b.jbCefClient.addLifeSpanHandler(object : CefLifeSpanHandlerAdapter() {
            override fun onBeforePopup(
                browser: CefBrowser?,
                frame: CefFrame?,
                targetUrl: String?,
                targetFrameName: String?
            ): Boolean {
                if (targetUrl.isNullOrBlank()) return true

                ApplicationManager.getApplication().invokeLater {
                    try {
                        val uri = java.net.URI(targetUrl)
                        val host = uri.host ?: ""
                        val isLocalhost = host == "localhost" || host == "127.0.0.1"

                        if (!isLocalhost) {
                            // External URL — open in OS browser
                            logger.info("[ClaudeCodePanel] Popup blocked (external): $targetUrl -> BrowserUtil.browse")
                            BrowserUtil.browse(targetUrl)
                            return@invokeLater
                        }

                        val path = uri.path ?: "/"
                        when {
                            path == "/sessions/new" || path.startsWith("/sessions/new?") -> {
                                logger.info("[ClaudeCodePanel] Popup blocked: $targetUrl -> new session tab")
                                OpenClaudeCodeAction.openTab(project, UUID.randomUUID().toString())
                            }
                            path.startsWith("/settings/") -> {
                                logger.info("[ClaudeCodePanel] Popup blocked: $targetUrl -> settings tab")
                                OpenClaudeCodeAction.openTab(project, UUID.randomUUID().toString(), "/settings/general")
                            }
                            else -> {
                                logger.info("[ClaudeCodePanel] Popup blocked: $targetUrl -> new tab with path $path")
                                OpenClaudeCodeAction.openTab(project, UUID.randomUUID().toString(), path)
                            }
                        }
                    } catch (e: Exception) {
                        logger.warn("[ClaudeCodePanel] Failed to handle popup URL: $targetUrl", e)
                    }
                }
                return true // Always block JCEF from opening the popup natively
            }
        }, b.cefBrowser)
    }

    /**
     * Script for the streaming state bridge, so the WebView can notify Kotlin of
     * streaming changes via JBCefJSQuery instead of encoding state into document.title.
     */
    // Returns the script instead of taking a CefFrame and injecting it, so this
    // member's signature stays free of JCEF types — see the note next to `holder`
    // (issue #321). Called only from the load handler, i.e. only once JCEF is
    // present, which is what makes reading `holder!!` safe here.
    private fun streamingStateBridgeScript(): String =
        """
            (function() {
                window.__notifyStreamingState = function(state) {
                    ${holder!!.streamingQuery.inject("state")}
                };
            })();
        """.trimIndent()

    /**
     * Ask CEF for a fresh frame whenever the page talks to the backend.
     *
     * OSR ghosts appear when CEF's dirty-rect tracking misses part of a repaint,
     * and they persist until something forces a full frame. The backup timer and
     * the mouse hook both do that eventually, but only on their own schedule —
     * clearing a conversation with the pointer held still left the old text on
     * screen for up to a full timer period, which is what a user sees as "the
     * ghost takes a second or two to go away".
     *
     * Rather than guess which DOM changes are "big enough" to strand a ghost —
     * a threshold nobody can pick correctly — this hooks the WebSocket the app
     * already uses. Every message the page sends is by definition a moment when
     * something happened, and the interesting ones (clear, session switch, send)
     * all pass through it. `requestAnimationFrame` defers the nudge until after
     * the browser has painted the result; nudging earlier would just re-deliver
     * the frame we are trying to replace.
     *
     * That deferral is also what bounds the rate: the `pending` flag collapses
     * every message sent within one frame into a single report, so a streaming
     * response that sends dozens of times a second still nudges at most once per
     * painted frame. No extra throttle — a timed gap here would reintroduce the
     * very delay this exists to remove.
     */
    // Returns the script rather than injecting it — see streamingStateBridgeScript.
    private fun repaintNudgeBridgeScript(): String =
        """
            (function() {
                if (window.__repaintNudgeInstalled) return;
                window.__repaintNudgeInstalled = true;

                var pending = false;
                function report() {
                    if (pending) return;
                    pending = true;
                    requestAnimationFrame(function() {
                        requestAnimationFrame(function() {
                            pending = false;
                            if (window.__notifyStreamingState) {
                                window.__notifyStreamingState('repaint');
                            }
                        });
                    });
                }

                var send = WebSocket.prototype.send;
                WebSocket.prototype.send = function() {
                    try { report(); } catch (e) {}
                    return send.apply(this, arguments);
                };

                // Scrolling repaints the whole viewport without sending anything, and a
                // fling that ends with the pointer stationary is a common way to strand
                // ghosts.
                window.addEventListener('scroll', report, { passive: true, capture: true });
            })();
        """.trimIndent()

    /**
     * Script that tracks the page's CSS cursor and reports changes to Kotlin.
     */
    // Returns the script rather than injecting it — see streamingStateBridgeScript.
    private fun cursorTrackingScript(): String =
        """
            (function() {
                var lastCursor = '';
                document.addEventListener('mouseover', function(e) {
                    var cursor = window.getComputedStyle(e.target).cursor;
                    if (cursor !== lastCursor) {
                        lastCursor = cursor;
                        ${holder!!.cursorQuery.inject("cursor")}
                    }
                }, true);
            })();
        """.trimIndent()

    /**
     * JCEF IME NPE workaround.
     * Wraps InputMethodListeners with try-catch to suppress NPE from
     * JBCefInputMethodAdapter when replacementRange is null (macOS + JCEF + CJK IME).
     */
    // Called only from setupBrowserHandlers() which is only called from realizeBrowser() — holder and browser are non-null.
    private fun installImeWorkaround() {
        val h = holder!!
        if (h.imeWorkaroundInstalled) return
        // Pull the plain AWT component out before the lambda below closes over it.
        // Capturing the JBCefBrowser instead would put a JCEF type in the captured
        // lambda's signature, and Kotlin compiles that lambda into a static method
        // ON THIS CLASS — which AWT then resolves while the JPanel constructor runs,
        // reintroducing issue #321. See the note next to `holder`.
        val browserComponent: java.awt.Component = h.browser.component

        fun wrapListeners(component: java.awt.Component) {
            val listeners = component.inputMethodListeners
            if (listeners.isNullOrEmpty()) return

            for (listener in listeners) {
                component.removeInputMethodListener(listener)
                component.addInputMethodListener(object : java.awt.event.InputMethodListener {
                    override fun inputMethodTextChanged(event: java.awt.event.InputMethodEvent?) {
                        try {
                            listener.inputMethodTextChanged(event)
                        } catch (e: NullPointerException) {
                            logger.warn("Suppressed JCEF IME NPE (replacementRange is null)", e)
                        }
                    }

                    override fun caretPositionChanged(event: java.awt.event.InputMethodEvent?) {
                        try {
                            listener.caretPositionChanged(event)
                        } catch (e: NullPointerException) {
                            logger.warn("Suppressed JCEF IME NPE in caretPositionChanged", e)
                        }
                    }
                })
            }
        }

        fun traverseAndWrap(component: java.awt.Component) {
            wrapListeners(component)
            if (component is java.awt.Container) {
                for (child in component.components) {
                    traverseAndWrap(child)
                }
            }
        }

        javax.swing.SwingUtilities.invokeLater {
            traverseAndWrap(browserComponent)
            h.imeWorkaroundInstalled = true
            logger.info("JCEF IME NPE workaround installed")
        }
    }

    /**
     * Reads the IDE's current theme colors and returns a JS snippet that mirrors
     * them as CSS variables on document.documentElement. Returns "" if the IDE
     * colors cannot be read.
     *
     * ## Why colors and not a theme name
     *
     * JetBrains lets users install marketplace themes and hand-write their own
     * `.theme.json`, so the set of themes is open-ended and cannot be enumerated.
     * Instead of mapping known theme names to palettes, we read whatever colors
     * the currently applied LAF resolves to at runtime — that covers bundled
     * presets, marketplace themes and custom themes identically, with no code
     * change per theme.
     *
     * Reading the theme's *name* would need [com.intellij.ide.ui.laf.UIThemeLookAndFeelInfo],
     * which is `@ApiStatus.Experimental` (verified against 2024.2 bytecode), and
     * every other accessor on LafManager is `@Internal` or `@Deprecated`. The
     * marketplace zero-warnings gate forbids those, so the WebView labels the
     * synced state generically instead of naming the theme.
     *
     * ## API stability
     *
     * Every API used here is stable — no `@ApiStatus.Internal` / `@Experimental`
     * / `@Deprecated` annotation on either the member or its declaring class
     * (verified against the 2024.2 SDK): [UIUtil], [com.intellij.ui.JBColor],
     * [EditorColorsManager], [EditorColorsScheme] and `javax.swing.UIManager`.
     *
     * ## Naming
     *
     * Variables are emitted under the `--ccg-ide-*` prefix and consumed in
     * webview/src/index.css as the first choice of a `var(--ccg-ide-x, <own default>)`
     * fallback chain. When nothing is injected (browser/standalone mode, or a
     * read failure here) the WebView's own palette applies unchanged.
     *
     * The two legacy `--ide-selection-*` variables keep their original names —
     * index.css still reads them — so existing behavior is preserved.
     */
    private fun ideColorsScript(): String {
        return try {
            val vars = LinkedHashMap<String, java.awt.Color>()

            // Selection (legacy names, already consumed by --surface-selected /
            // --text-on-selected in index.css).
            val selBg = UIUtil.getListSelectionBackground(true)
            val selFg = UIUtil.getListSelectionForeground(true)

            // Editor surface — the Claude Code GUI is hosted in an editor tab, so
            // the editor background is what it sits flush against. This is the
            // color issue #267 asks us to match.
            val scheme = EditorColorsManager.getInstance().globalScheme
            vars["editor-bg"] = scheme.defaultBackground
            vars["editor-fg"] = scheme.defaultForeground

            // Panel/tool-window surface — used for raised chrome (headers, bars).
            vars["panel-bg"] = UIUtil.getPanelBackground()
            vars["panel-fg"] = UIUtil.getLabelForeground()

            // Input controls.
            vars["input-bg"] = UIUtil.getTextFieldBackground()

            // Borders and accents come from the LAF's named keys when present;
            // UIManager.getColor returns null for keys a theme does not define,
            // and putIfPresent simply skips those (the CSS fallback then wins).
            putIfPresent(vars, "border", UIManager.getColor("Component.borderColor"))
            putIfPresent(vars, "border-focus", UIManager.getColor("Component.focusedBorderColor"))
            putIfPresent(vars, "accent", UIManager.getColor("Component.focusColor"))
            putIfPresent(vars, "link", UIManager.getColor("Link.activeForeground"))
            putIfPresent(vars, "separator", UIManager.getColor("Separator.separatorColor"))

            // Hover/pressed are DERIVED here rather than read from the LAF.
            //
            // `List.hoverBackground` is the obvious candidate but is unusable as a
            // flat fill: IntelliJ Dark defines it as #edf3ff (near-white) and
            // composites it, so painting it directly turned hovered rows white on
            // a dark theme. Keeping our own fixed value fails differently — our
            // dark hover (42 42 45) lands within ~3 per channel of the IDE panel
            // surface (43 45 48), making rows in the model overlay indistinguishable
            // while the same token still read fine against the darker editor surface.
            //
            // Shifting the IDE's own panel color by a fixed amount (away from its
            // brightness, so dark themes lighten and light themes darken) keeps the
            // step visible whatever theme is applied. These have to be real colors,
            // not translucent overlays: Tailwind compiles `bg-surface-hover` to
            // `rgb(var(--surface-hover-rgb) / <alpha>)`, so only the `-rgb` channel
            // form reaches the utility classes.
            val panelBg = UIUtil.getPanelBackground()
            vars["hover-bg"] = shiftAwayFromBrightness(panelBg, 0.09f)
            vars["pressed-bg"] = shiftAwayFromBrightness(panelBg, 0.17f)

            putIfPresent(vars, "tooltip-bg", UIManager.getColor("ToolTip.background"))
            putIfPresent(vars, "tooltip-fg", UIManager.getColor("ToolTip.foreground"))

            val sb = StringBuilder()
            sb.append(setPropertyJs("--ide-selection-bg", hex(selBg)))
            sb.append(setPropertyJs("--ide-selection-fg", hex(selFg)))
            for ((name, color) in vars) {
                // Emit both the hex form and an `R G B` channel triple. Tailwind
                // utilities in this project apply opacity modifiers (`/NN`) to the
                // `-rgb` channel variables, so IDE-driven tokens must offer the
                // same shape as the built-in ones.
                sb.append(setPropertyJs("--ccg-ide-$name", hex(color)))
                sb.append(setPropertyJs("--ccg-ide-$name-rgb", channels(color)))
            }
            sb.toString()
        } catch (e: Exception) {
            logger.warn("Failed to read IDE theme colors", e)
            ""
        }
    }

    /** Adds [color] under [name] only when the LAF actually defines it. */
    private fun putIfPresent(
        target: MutableMap<String, java.awt.Color>,
        name: String,
        color: java.awt.Color?,
    ) {
        if (color != null) target[name] = color
    }

    /**
     * Returns [base] moved [amount] (0..1) toward white on dark surfaces and
     * toward black on light ones — i.e. always *away* from its own brightness,
     * so the result stays visible against [base] on any theme.
     *
     * Used to derive hover/pressed fills from the IDE's panel color; see
     * [ideColorsScript] for why they are not read from the LAF directly.
     */
    private fun shiftAwayFromBrightness(base: java.awt.Color, amount: Float): java.awt.Color {
        // Perceived brightness (ITU-R BT.601) — matches how dark/light a surface
        // actually looks better than a plain channel average.
        val brightness = (base.red * 0.299f + base.green * 0.587f + base.blue * 0.114f) / 255f
        val target = if (brightness < 0.5f) 255 else 0
        fun blend(channel: Int) = (channel + (target - channel) * amount).toInt().coerceIn(0, 255)
        return java.awt.Color(blend(base.red), blend(base.green), blend(base.blue))
    }

    private fun hex(c: java.awt.Color): String = String.format("#%02x%02x%02x", c.red, c.green, c.blue)

    private fun channels(c: java.awt.Color): String = "${c.red} ${c.green} ${c.blue}"

    /**
     * Builds a `style.setProperty` call. Values are generated locally from color
     * channels ([hex]/[channels]), so they contain no quotes or newlines to escape.
     */
    private fun setPropertyJs(name: String, value: String): String =
        "document.documentElement.style.setProperty('$name', '$value');"

    /**
     * Marks the document as carrying IDE-injected colors, so the WebView can opt
     * into them with a CSS selector.
     *
     * Kotlin always injects the `--ccg-ide-*` variables; whether they are actually
     * *used* is decided entirely in CSS by the WebView, gated on the user having
     * picked the "System (IDE)" theme (see `html.ide-theme-sync` in index.css).
     * Keeping the decision on the WebView side means Kotlin never has to observe
     * or mirror a WebView-owned setting — there is no state to keep in sync and
     * no extra IPC round-trip when the user changes theme.
     *
     * Reach: this only lands in a JCEF webview, since it travels over
     * `frame.executeJavaScript`. A plain browser attached to an IDE-started
     * backend gets nothing, so "System" stays OS-driven there and the WebView's
     * own palette applies (see Appearance/index.tsx). To support that
     * combination later, push the colors to the backend instead and let it
     * forward them over the WebSocket connection.
     */
    private fun markIdeColorsAvailableJs(): String =
        "document.documentElement.setAttribute('data-ide-colors', 'available');"

    /**
     * Dev-only: echo the injected `--ccg-ide-*` values to the WebView console so
     * they land in idea.log via [CefDisplayHandlerAdapter.onConsoleMessage].
     *
     * JCEF's context menu has no "Inspect", and even with the remote debugging
     * port open the DevTools window does not accept clipboard paste, so there is
     * no practical way to read these values from inside the running IDE. Echoing
     * them to the log is the only way to verify the injection actually carried
     * real colors rather than silently writing nothing.
     *
     * Gated on `claude.dev.mode` so released builds stay quiet.
     */
    private fun logIdeColorsJs(): String {
        if (!System.getProperty("claude.dev.mode", "false").toBoolean()) return ""
        return "(function(){var s=document.documentElement.style;" +
            "var out=Array.prototype.slice.call(s).filter(function(p){" +
            "return p.indexOf('--ccg-ide-')===0 && p.indexOf('-rgb')<0;})" +
            ".map(function(p){return p+'='+s.getPropertyValue(p);}).join(' ');" +
            "console.log('IDE_COLORS marker=' + " +
            "document.documentElement.getAttribute('data-ide-colors') + ' ' + out);})();"
    }

    /**
     * Subscribe to IDE Look-and-Feel changes and propagate them to the WebView
     * by updating window.__IDE_THEME__ and dispatching the 'ide-theme-changed'
     * event. Idempotent per browser holder.
     *
     * Lifetime: the LafManager listener is owned by a child Disposable stored on
     * the [ClaudeCodeBrowserService.BrowserHolder]. The holder (and thus the
     * listener) survives tab move/split. Disposal happens in
     * [ClaudeCodeBrowserService.release].
     */
    // Called only from setupBrowserHandlers() which is only called from realizeBrowser() — holder and browser are non-null.
    private fun installLafListener() {
        val h = holder!!
        if (h.lafListenerInstalled) return

        try {
            // Use the application message bus with a child Disposable so the
            // subscription lifetime matches the browser holder (tab move/split
            // safe). This avoids the deprecated LafManager.addLafManagerListener
            // overloads while still providing automatic unregistration via Disposer.
            val parent = Disposer.newDisposable("ClaudeCodePanel.lafListener.$tabId")
            val connection = ApplicationManager.getApplication().messageBus.connect(parent)
            connection.subscribe(
                com.intellij.ide.ui.LafManagerListener.TOPIC,
                com.intellij.ide.ui.LafManagerListener {
                    // Neither this lambda nor the nested invokeLater one may capture
                    // a JBCefBrowser: Kotlin turns both into static methods on this
                    // class, and a JCEF type in their signature is what issue #321
                    // was. The holder is re-read inside instead — which is also more
                    // correct, since the theme can change after a tab move swapped it.
                    if (holder == null) return@LafManagerListener
                    ApplicationManager.getApplication().invokeLater {
                        val current = holder ?: return@invokeLater
                        val newTheme = if (com.intellij.ui.JBColor.isBright()) "light" else "dark"
                        // Re-read the colors on every LAF change: this is what makes
                        // bundled presets, marketplace themes and hand-written custom
                        // themes all work without enumerating them (issue #267).
                        val colorsJs = ideColorsScript()
                        val js = "window.__IDE_THEME__ = '$newTheme'; " +
                            colorsJs +
                            (if (colorsJs.isNotEmpty()) markIdeColorsAvailableJs() + logIdeColorsJs() else "") +
                            "window.dispatchEvent(new Event('ide-theme-changed'));"
                        try {
                            JcefHandlers.executeJavaScript(current.browser, js)
                        } catch (e: Exception) {
                            logger.warn("Failed to propagate LAF change to WebView", e)
                        }
                    }
                },
            )
            h.lafListenerDisposable = parent
            h.lafListenerInstalled = true
            logger.info("LafManager listener installed for tab: $tabId")
        } catch (e: Exception) {
            logger.warn("Failed to install LafManager listener", e)
        }
    }

    /**
     * Correct OSR (off-screen / remote-mode) stale-paint artifacts.
     *
     * In OSR mode CEF occasionally drops part of a dirty rect (typically the right
     * and bottom edges), leaving stale pixels from the previous frame as a ghost
     * along the panel border. This is a known CEF behavior (CEF #3272) and shows up
     * as chopped text near the top and a leftover colored line near the input; it
     * clears the moment something forces a full re-composite (e.g. leaving and
     * returning to the panel). Reported as issue #171.
     *
     * The fix is not to disable OSR — windowed mode has its own HiDPI/blank-screen
     * problems (#23/#51/#79) — but to make CEF re-deliver the whole frame so the
     * ghost edge pixels are overwritten.
     *
     * CEF's `CefBrowser.invalidate()` (Invalidate(PET_VIEW)) would be the most direct
     * trigger, but it is absent from the JCEF `CefBrowser` interface in our compile
     * target. A bare `component.repaint()` is no good either — in OSR the component
     * only re-blits the bitmap CEF already handed it, which is exactly the *stale*
     * one. We poke CEF itself: `notifyScreenInfoChanged()` forces a full re-composite,
     * and `wasResized()` makes CEF re-query GetViewRect and repaint the whole view.
     * Crucially we call wasResized with a *different* size first (w-1, h) then restore
     * (w, h): CEF ignores a wasResized call whose dimensions match the current view,
     * so nudging with the same size alone would be a no-op. The one-pixel round trip
     * is invisible to the user (it never reaches Swing layout — only CEF's view rect).
     *
     * Two nudges, both running on the EDT:
     *   (a) a low-frequency backup timer that catches artifacts even while idle, and
     *   (b) a throttled mouse-motion hook that clears them promptly during interaction.
     *
     * Lifetime: timer + listener are owned by a child Disposable stored on the
     * [ClaudeCodeBrowserService.BrowserHolder], so they survive tab move/split and
     * are torn down only when the holder is released — same as [installLafListener].
     */
    // Called only from realizeBrowser() — holder and browser are non-null.
    private fun installOsrRepaintNudge() {
        val parent = Disposer.newDisposable("ClaudeCodePanel.osrRepaintNudge.$tabId")
        holder!!.repaintNudgeDisposable = parent

        // Push a fresh full frame from CEF, but only while the component is on-screen
        // (no point nudging a hidden/background tab). Both calls run on the EDT —
        // every caller below already is.
        // Resolve CefBrowser.invalidate() once — the canonical OSR full-view repaint
        // (native Invalidate(PET_VIEW)): it marks the WHOLE view dirty so CEF re-delivers
        // a full frame, clearing stale-paint ghosts anywhere on screen. Present in JCEF
        // 137+ but absent on older builds, so we reflect on it (direct calls would fail
        // to compile against older SDKs) and fall back to the resize toggle when missing.
        val invalidateMethod: java.lang.reflect.Method? = try {
            Class.forName("org.cef.browser.CefBrowser").getMethod("invalidate")
        } catch (_: Throwable) {
            null
        }
        var loggedNudgePath = false

        fun nudge() {
            val b = holder?.browser ?: return
            if (!b.component.isShowing) return
            val w = b.component.width
            val h = b.component.height
            if (w < 2 || h < 2) return
            val cef = b.cefBrowser
            // Prefer invalidate(): the resize toggle below did NOT clear ghosts in
            // practice because remote (out-of-process) JCEF ignores a same-size
            // wasResized round trip. invalidate() forces the whole view to repaint.
            val usedInvalidate = invalidateMethod?.let { m ->
                try {
                    m.invoke(cef)
                    true
                } catch (_: Throwable) {
                    false
                }
            } ?: false
            if (!usedInvalidate) {
                try { cef.notifyScreenInfoChanged() } catch (_: Throwable) {}
                try {
                    cef.wasResized(w - 1, h)
                    cef.wasResized(w, h)
                } catch (_: Throwable) {}
            }
            if (!loggedNudgePath) {
                loggedNudgePath = true
                logger.info(
                    "OSR repaint nudge path: " +
                        (if (usedInvalidate) "invalidate()" else "resize-toggle fallback") +
                        " (tab: $tabId)",
                )
            }
        }

        // (c) Repaint-on-demand, driven by the page itself (see injectRepaintNudgeBridge).
        // The timer and the mouse hook both wait for something *else* to happen — a tick
        // to elapse, or the user to move the mouse — so ghosts left by clearing a
        // conversation or switching sessions lingered for up to a full timer period.
        //
        // Deliberately NOT throttled. The page only reports after the browser has
        // painted, so these arrive at most once per frame already, and a throttle here
        // would be the same "wait for something else" that made the ghosts visible in
        // the first place — just with a smaller number on it. The mouse hook keeps its
        // throttle because pointer movement is not frame-bound and would otherwise
        // nudge on every pixel.
        requestRepaintNudge = { nudge() }
        Disposer.register(parent, Disposable { requestRepaintNudge = null })

        // (a) Low-frequency backup timer. javax.swing.Timer fires on the EDT.
        val timer = javax.swing.Timer(REPAINT_NUDGE_INTERVAL_MS) { nudge() }
        timer.isRepeats = true
        timer.start()
        Disposer.register(parent, Disposable { timer.stop() })

        // (b) Throttled mouse-motion nudge: clear ghosts promptly during interaction,
        // but no more than once per REPAINT_NUDGE_MIN_GAP_NANOS so we don't re-frame
        // CEF on every pixel of movement.
        // Plain AWT component, so the Disposable lambda below does not close over a
        // JBCefBrowser — that would put a JCEF type in a static method generated on
        // this class, which is issue #321.
        val browserComponent: java.awt.Component = holder!!.browser.component
        var lastNudgeNanos = 0L
        val motionListener = object : java.awt.event.MouseMotionAdapter() {
            override fun mouseMoved(e: java.awt.event.MouseEvent?) {
                val now = System.nanoTime()
                if (now - lastNudgeNanos < REPAINT_NUDGE_MIN_GAP_NANOS) return
                lastNudgeNanos = now
                nudge()
            }
        }
        browserComponent.addMouseMotionListener(motionListener)
        Disposer.register(parent, Disposable { browserComponent.removeMouseMotionListener(motionListener) })

        logger.info("OSR repaint nudge installed for tab: $tabId")
    }

    /**
     * Opens the JCEF DevTools window for this panel's webview.
     *
     * Named apart from the [NodeProcessManager.RpcHandler.openDevTools] override that
     * calls it: inside that anonymous object an unqualified `openDevTools()` would
     * resolve to the override itself and recurse.
     *
     * Unlike the old F12 path, the caller here is the settings screen, which can be
     * reached before the browser is realized — hence the null-safe read of [holder]
     * rather than an assertion.
     */
    private fun openJcefDevTools() {
        val browser = holder?.browser
        if (browser == null) {
            logger.warn("Failed to open DevTools: browser is not realized yet")
            return
        }
        try {
            (browser as? com.intellij.ui.jcef.JBCefBrowserBase)?.openDevtools()
                ?: logger.warn("Failed to open DevTools: browser is not JBCefBrowserBase")
        } catch (e: Exception) {
            logger.error("Failed to open DevTools", e)
        }
    }

    // ─── Native (Swing / IDE) drag-and-drop bridge ──────────────────

    private fun setupNativeDropBridge() {
        // JComponent, not JBCefBrowser — see the note next to `holder` (issue #321).
        val browserComponent: JComponent = holder?.browser?.component ?: return
        val dropTarget = object : DropTargetAdapter() {
            override fun dragEnter(event: DropTargetDragEvent) {
                event.acceptDrag(DnDConstants.ACTION_COPY)
            }

            override fun drop(event: DropTargetDropEvent) {
                logger.debug("[NativeDrop] Swing DropTarget fired")
                try {
                    event.acceptDrop(DnDConstants.ACTION_COPY)
                    val droppedFiles = extractDroppedFiles(event.transferable)
                    if (droppedFiles.isEmpty()) {
                        event.dropComplete(false)
                        return
                    }
                    dispatchNativeDrop(droppedFiles)
                    event.dropComplete(true)
                } catch (e: Exception) {
                    logger.warn("Native Swing drop failed", e)
                    event.dropComplete(false)
                }
            }
        }
        installDropTarget(this, dropTarget)
        installDropTarget(browserComponent, dropTarget)
        installIdeaDnDTarget(this)
        installIdeaDnDTarget(browserComponent)
    }

    private fun installDropTarget(component: Component, dropTarget: DropTargetAdapter) {
        try {
            DropTarget(component, DnDConstants.ACTION_COPY, dropTarget, true)
            if (component is JComponent) {
                component.components.forEach { child -> installDropTarget(child, dropTarget) }
            }
        } catch (_: Exception) {}
    }

    private fun installIdeaDnDTarget(component: JComponent) {
        val target = object : DnDTarget {
            override fun update(event: DnDEvent): Boolean {
                val droppedFiles = extractDroppedFiles(event.attachedObject)
                val canDrop = droppedFiles.isNotEmpty()
                event.setDropPossible(canDrop, if (canDrop) "" else "Drop files or folders")
                return false
            }

            override fun drop(event: DnDEvent) {
                logger.debug("[NativeDrop] IDE DnDTarget fired (attached=${event.attachedObject?.javaClass?.name})")
                val droppedFiles = extractDroppedFiles(event.attachedObject)
                dispatchNativeDrop(droppedFiles)
            }

            override fun cleanUpOnLeave() {}

            override fun updateDraggedImage(image: Image?, dropPoint: Point?, imageOffset: Point?) {}
        }

        try {
            DnDManager.getInstance().registerTarget(target, component)
            Disposer.register(this, Disposable {
                runCatching { DnDManager.getInstance().unregisterTarget(target, component) }
            })
        } catch (_: Exception) {}
    }

    private data class DroppedFile(val path: String, val isDirectory: Boolean)

    private fun addDroppedPath(
        result: MutableMap<String, DroppedFile>,
        path: String?,
        isDirectory: Boolean?,
    ) {
        if (path.isNullOrBlank()) return
        val file = File(path)
        val normalizedPath = file.absolutePath
        result[normalizedPath] = DroppedFile(
            normalizedPath,
            isDirectory ?: file.isDirectory,
        )
    }

    /**
     * Invoke FileFlavorProvider.asFileList() reflectively. The interface is
     * @ApiStatus.Internal (Plugin Verifier flags a direct call on 2026.2+), but its
     * runtime contract is stable, so we call it by name to keep extracting files from
     * IDE DnD payloads (project tree, "Find Usages", ...) without a static internal ref.
     */
    private fun asFileListReflectively(wrapper: TransferableWrapper): List<*>? =
        runCatching { wrapper.javaClass.getMethod("asFileList").invoke(wrapper) as? List<*> }
            .getOrNull()

    /**
     * Walk a DnD payload and append every file/folder path we can recognize into
     * [result]. Handles both raw clipboard values (File, VirtualFile, PsiElement,
     * String paths) and IDE-internal containers (TransferableWrapper for project-
     * tree drags, nested Transferable / arrays / iterables). Unknown payloads log
     * at debug rather than silently disappear.
     */
    private fun addDroppedValue(result: MutableMap<String, DroppedFile>, value: Any?) {
        when (value) {
            null -> return
            is File -> addDroppedPath(result, value.absolutePath, value.isDirectory)
            is VirtualFile -> addDroppedPath(result, value.path, value.isDirectory)
            is PsiElement -> value.containingFile?.virtualFile
                ?.let { addDroppedPath(result, it.path, it.isDirectory) }
            is Transferable -> extractDroppedFiles(value)
                .forEach { addDroppedPath(result, it.path, it.isDirectory) }
            // IDE DnD payloads (project tree, "Find Usages", etc.) implement TransferableWrapper.
            is TransferableWrapper -> {
                asFileListReflectively(value)?.forEach { addDroppedValue(result, it) }
                value.psiElements?.forEach { addDroppedValue(result, it) }
            }
            is Array<*> -> value.forEach { addDroppedValue(result, it) }
            is Iterable<*> -> value.forEach { addDroppedValue(result, it) }
            is String -> parseDroppedText(value).forEach { addDroppedPath(result, it, null) }
            else -> logger.debug(
                "extractDroppedFiles: ignoring unknown payload of type ${value.javaClass.name}"
            )
        }
    }

    private fun extractDroppedFiles(transferable: Transferable): List<DroppedFile> {
        val result = linkedMapOf<String, DroppedFile>()

        if (transferable.isDataFlavorSupported(DataFlavor.javaFileListFlavor)) {
            runCatching { addDroppedValue(result, transferable.getTransferData(DataFlavor.javaFileListFlavor)) }
                .onFailure { logger.debug("getTransferData(javaFileListFlavor) failed", it) }
        }

        // FileCopyPasteUtil normalizes the various OS-specific clipboard/DnD encodings
        // (Finder's text/uri-list, Explorer's CF_HDROP, etc.) into java.io.File entries.
        runCatching { FileCopyPasteUtil.getFileList(transferable) }
            .onSuccess { addDroppedValue(result, it) }
            .onFailure { logger.debug("FileCopyPasteUtil.getFileList failed", it) }

        for (flavor in transferable.transferDataFlavors) {
            runCatching { addDroppedValue(result, transferable.getTransferData(flavor)) }
                .onFailure { logger.debug("getTransferData($flavor) failed", it) }
        }

        return result.values.toList()
    }

    private fun extractDroppedFiles(attachedObject: Any?): List<DroppedFile> {
        val result = linkedMapOf<String, DroppedFile>()
        addDroppedValue(result, attachedObject)
        return result.values.toList()
    }

    private fun parseDroppedText(text: String): List<String> {
        return text
            .lineSequence()
            .map { it.trim() }
            .filter { it.isNotBlank() && !it.startsWith("#") }
            .mapNotNull { raw ->
                if (raw.startsWith("file://")) {
                    resolveFileUriPath(raw)
                } else if (
                    raw.startsWith("/") ||
                    raw.startsWith("\\\\") ||
                    raw.matches(Regex("^[A-Za-z]:[\\\\/].*"))
                ) {
                    raw
                } else {
                    null
                }
            }
            .toList()
    }

    private fun dispatchNativeDrop(files: List<DroppedFile>) {
        logger.debug("[NativeDrop] dispatchNativeDrop panelId=$panelId, ${files.size} files: ${files.map { it.path }}")
        if (files.isEmpty()) return
        val params = buildJsonObject {
            put("panelId", JsonPrimitive(panelId))
            putJsonArray("entries") {
                files.forEach { file ->
                    add(buildJsonObject {
                        put("path", JsonPrimitive(file.path))
                        put("type", JsonPrimitive(if (file.isDirectory) "folder" else "file"))
                    })
                }
            }
        }
        backendService.sendNotification(project.basePath ?: "", "NATIVE_DROP", params)
    }

    // ─── WebView loading ────────────────────────────────────────────

    /**
     * Load the WebView URL from the Node.js backend.
     * Called once the backend has printed its PORT.
     */
    // Called only from realizeBrowser() — holder and browser are non-null.
    private fun loadWebView(port: Int) {
        System.err.println("[ClaudeCodePanel] loadWebView called for project: ${project.name}")
        System.err.println("[ClaudeCodePanel] project.basePath: ${project.basePath}")

        // theme=<light|dark> lets webview/index.html paint the correct surface
        // color before the CSS bundle / React mount, preventing a white flash on
        // a new JCEF tab. JBColor.isBright() reflects the current IDE LAF.
        val url = buildWebViewUrl(
            port = port,
            pathSegment = initialPath ?: "/sessions/new",
            workingDir = project.basePath,
            panelId = panelId,
            isBright = com.intellij.ui.JBColor.isBright(),
            // Deliver the single-use pairing code to the webview out-of-band via the load
            // URL. The webview reads it once, strips it from the address bar, and redeems
            // it at POST /pair for the stable auth token (which it then attaches as the
            // `ccg-auth` subprotocol) — the token itself is NEVER placed in the URL.
            // NEVER logged — buildWebViewUrl is not passed to any logger below.
            pairCode = backendService.initialPairCode(project.basePath ?: ""),
        )
        // Redact the pairing code (and any token) from any log — they are secrets.
        val loggedUrl = redactUrlSecrets(url)
        System.err.println("[ClaudeCodePanel] Loading URL: $loggedUrl")
        logger.info("Loading WebView from Node.js backend: $loggedUrl")

        javax.swing.SwingUtilities.invokeLater {
            val h = holder!!
            val b = h.browser
            remove(loadingLabel)
            // Paint the Swing component with the IDE surface color so the JCEF
            // native first paint is not white. Heavyweight (non-OSR) mode limits
            // this, but it reduces the white flash on a fresh tab (issue #47).
            b.component.background = if (com.intellij.ui.JBColor.isBright()) {
                java.awt.Color(0xFFFFFF)
            } else {
                java.awt.Color(0x1A1A1A)
            }
            b.loadURL(url)
            add(b.component, BorderLayout.CENTER)
            h.isLoaded = true
            revalidate()
            repaint()
        }
    }

    /**
     * Show error when the Node.js backend fails to start. When [diagnostics] (the
     * backend's recent stderr) is available it is appended so the user/maintainer sees
     * the concrete cause instead of an opaque message — the watchdog half of #97.
     */
    private fun showBackendError(errorMessage: String, diagnostics: String? = null) {
        remove(loadingLabel)

        errorPanel = JPanel(BorderLayout(0, 12)).apply {
            border = javax.swing.BorderFactory.createEmptyBorder(40, 40, 40, 40)

            val diagnosticsHtml = diagnostics
                ?.let { escapeHtml(it).replace("\n", "<br>") }
                ?.let {
                    "<br><br><b>Recent backend output:</b><br>" +
                    "<div style='text-align:left;'>$it</div>"
                }
                ?: ""

            val messageLabel = javax.swing.JLabel(
                "<html><div style='text-align:center;'>" +
                "<b>Node.js backend failed to start</b><br><br>" +
                "Error: ${escapeHtml(errorMessage)}<br><br>" +
                "Ensure Node.js is installed and available on PATH.<br>" +
                "The backend file (backend.mjs) must be built before running." +
                diagnosticsHtml +
                "</div></html>"
            ).apply {
                horizontalAlignment = javax.swing.SwingConstants.CENTER
            }
            add(messageLabel, BorderLayout.CENTER)

            val retryButton = javax.swing.JButton("Retry").apply {
                addActionListener { retryBackendStart() }
            }
            val buttonPanel = JPanel(java.awt.FlowLayout(java.awt.FlowLayout.CENTER))
            buttonPanel.add(retryButton)
            add(buttonPanel, BorderLayout.SOUTH)
        }
        add(errorPanel!!, BorderLayout.CENTER)
        revalidate()
        repaint()
    }

    /**
     * Retry starting the Node.js backend after a failure.
     */
    private fun retryBackendStart() {
        errorPanel?.let { remove(it) }
        errorPanel = null
        add(loadingLabel, BorderLayout.CENTER)
        revalidate()
        repaint()

        backendService.restart(project.basePath ?: "")
        scope.launch {
            try {
                val port = withTimeoutOrNull(BACKEND_START_TIMEOUT_MS) {
                    backendService.awaitPort(project.basePath ?: "")
                }
                if (port == null) {
                    logger.warn("Retry: Node.js backend did not become ready within ${BACKEND_START_TIMEOUT_MS}ms")
                    val diag = backendService.recentBackendDiagnostics(project.basePath ?: "")
                    javax.swing.SwingUtilities.invokeLater {
                        showBackendError("Backend did not become ready within ${BACKEND_START_TIMEOUT_MS / 1000} seconds.", diag)
                    }
                    return@launch
                }
                loadWebView(port)
            } catch (e: CancellationException) {
                // Panel/tab closed mid-retry — a normal shutdown, not a failure.
                throw e
            } catch (e: Exception) {
                logger.error("Retry: Failed to start Node.js backend", e)
                val diag = backendService.recentBackendDiagnostics(project.basePath ?: "")
                javax.swing.SwingUtilities.invokeLater {
                    showBackendError(e.message ?: "Unknown error", diag)
                }
            }
        }
    }

    // ─── RPC Handler (IDE-native operations) ────────────────────────

    /**
     * Create an RPC handler that implements IDE-native operations
     * requested by the Node.js backend via JSON-RPC over stdout.
     */
    private fun createRpcHandler(): NodeProcessManager.RpcHandler {
        return object : NodeProcessManager.RpcHandler {

            override suspend fun openFile(path: String, line: Int?, column: Int?) {
                ApplicationManager.getApplication().invokeLater {
                    try {
                        val virtualFile = LocalFileSystem.getInstance().findFileByPath(path)
                        if (virtualFile != null) {
                            if (line != null && line > 0) {
                                // line/column from tools are 1-based; OpenFileDescriptor is 0-based.
                                // coerce so an out-of-contract column 0 can't become a negative offset.
                                val col = ((column ?: 1) - 1).coerceAtLeast(0)
                                OpenFileDescriptor(project, virtualFile, line - 1, col)
                                    .navigate(true)
                            } else {
                                FileEditorManager.getInstance(project).openFile(virtualFile, true)
                            }
                            logger.info("Opened file: $path${if (line != null && line > 0) ":$line" else ""}")
                        } else {
                            logger.warn("File not found: $path")
                        }
                    } catch (e: Exception) {
                        logger.error("Failed to open file: $path", e)
                    }
                }
            }

            override suspend fun openDiff(
                filePath: String,
                oldContent: String,
                newContent: String,
                toolUseId: String?,
                sessionId: String?,
                controlRequestId: String?
            ) {
                // Answering happens in the diff window itself, so the review and
                // the decision sit together. The kept hunk numbers go back and
                // the backend holds the change and rewrites the tool call
                // (#109) -- unless the reviewer edited the proposed side, in
                // which case their text goes with them and wins (#305).
                val onResolve: ((List<AcceptedRange>, String?) -> Unit)? =
                    if (sessionId != null && controlRequestId != null && toolUseId != null) {
                        { accepted, editedContent ->
                            val params = buildJsonObject {
                                put("toolUseId", toolUseId)
                                put("controlRequestId", controlRequestId)
                                put("sessionId", sessionId)
                                putJsonArray("acceptedRanges") {
                                    accepted.forEach { range ->
                                        add(buildJsonObject {
                                            put("oldStart", range.oldStart)
                                            put("oldEnd", range.oldEnd)
                                            put("newStart", range.newStart)
                                            put("newEnd", range.newEnd)
                                        })
                                    }
                                }
                                // Only present when the reviewer edited the
                                // proposed side; the backend then writes this
                                // instead of rebuilding from the ranges (#305).
                                editedContent?.let { put("editedContent", it) }
                            }
                            backendService.sendNotification(project.basePath ?: "", "RESOLVE_DIFF", params)
                        }
                    } else null

                diffService.openDiffViewer(filePath, oldContent, newContent, toolUseId, onResolve)
                logger.info("Opened diff viewer: $filePath (toolUseId=$toolUseId)")
            }

            override suspend fun applyDiff(
                filePath: String,
                newContent: String,
                toolUseId: String?
            ): Boolean {
                val result = diffService.applyDiff(filePath, newContent)
                // The question this diff previewed has been answered, so the
                // preview goes with it.
                toolUseId?.let { diffService.closeDiffViewer(it) }
                logger.info("Applied diff: $filePath, success=${result.isSuccess} (toolUseId=$toolUseId)")
                return result.isSuccess
            }

            override suspend fun rejectDiff(toolUseId: String?) {
                toolUseId?.let { diffService.closeDiffViewer(it) }
                logger.info("Diff rejected (toolUseId=$toolUseId)")
            }

            override suspend fun closeDiff(toolUseId: String) {
                diffService.closeDiffViewer(toolUseId)
            }

            override suspend fun refreshFiles(paths: List<String>) {
                diffService.refreshFiles(paths)
                logger.info("Requested IDE refresh for ${paths.size} file(s)")
            }

            override suspend fun createSession(workingDir: String) {
                logger.info("Session cleared (workingDir=$workingDir)")
            }

            override suspend fun openNewTab(workingDir: String) {
                ApplicationManager.getApplication().invokeLater {
                    val targetProject = findProjectByBasePath(workingDir) ?: project
                    OpenClaudeCodeAction.openTab(targetProject, UUID.randomUUID().toString())
                    logger.info("Opened new Claude Code session tab (workingDir=$workingDir)")
                }
            }

            override suspend fun openSession(sessionId: String, workingDir: String?) {
                ApplicationManager.getApplication().invokeLater {
                    val targetProject = findProjectByBasePath(workingDir ?: "") ?: project
                    // Always open the session in a fresh editor tab (new tabId).
                    OpenClaudeCodeAction.openTab(targetProject, UUID.randomUUID().toString(), "/sessions/$sessionId")
                    logger.info("Opened session tab (sessionId=$sessionId, workingDir=$workingDir)")
                }
            }

            override suspend fun openSettings(workingDir: String, path: String?) {
                ApplicationManager.getApplication().invokeLater {
                    val targetProject = findProjectByBasePath(workingDir) ?: project
                    // The caller picks the destination (e.g. "/settings/sponsor" for a
                    // sponsor invite); fall back to General when it says nothing.
                    val target = path?.takeIf { it.isNotBlank() } ?: "/settings/general"
                    OpenClaudeCodeAction.openTab(targetProject, UUID.randomUUID().toString(), target)
                    logger.info("Opened Claude Code settings in editor tab (workingDir=$workingDir, path=$target)")
                }
            }

            override suspend fun openDevTools() {
                // Opening the DevTools window touches Swing, so hop to the EDT like
                // the other UI actions here.
                ApplicationManager.getApplication().invokeLater {
                    openJcefDevTools()
                }
            }

            override suspend fun openTerminal(workingDir: String) {
                ApplicationManager.getApplication().invokeLater {
                    try {
                        val widget = createTerminalTab(project, workingDir)
                        if (widget != null) {
                            sendCommandToTerminal(widget, "claude")
                        }
                        logger.info("Opened terminal with claude in: $workingDir")
                    } catch (e: Exception) {
                        logger.error("Failed to open terminal: $workingDir", e)
                    }
                }
            }

            override suspend fun openUrl(url: String) {
                BrowserUtil.browse(url)
                logger.info("Opened URL in browser: $url")
            }

            override suspend fun pickFiles(mode: String, multiple: Boolean): List<String> {
                val result = CompletableDeferred<List<String>>()
                ApplicationManager.getApplication().invokeLater {
                    try {
                        val descriptor = createFileChooserDescriptor(mode, multiple)
                        val files = FileChooser.chooseFiles(descriptor, project, null)
                        result.complete(files.map { it.path })
                    } catch (e: Exception) {
                        logger.warn("Failed to pick files (mode=$mode, multiple=$multiple)", e)
                        result.complete(emptyList())
                    }
                }
                return result.await()
            }

            override suspend fun updatePlugin() {
                ApplicationManager.getApplication().invokeLater {
                    try {
                        val clazz = Class.forName("com.intellij.ide.plugins.PluginManagerConfigurable")
                        @Suppress("UNCHECKED_CAST")
                        val configurableClass = clazz as Class<out com.intellij.openapi.options.Configurable>
                        ShowSettingsUtil.getInstance().showSettingsDialog(
                            project,
                            configurableClass
                        ) { configurable ->
                            try {
                                val method = configurable.javaClass.getMethod("enableSearch", String::class.java)
                                method.invoke(configurable, "Claude Code with GUI")
                            } catch (_: Exception) {}
                        }
                        logger.info("Opened Plugins settings dialog for plugin update")
                    } catch (e: Exception) {
                        logger.error("Failed to open Plugins settings dialog", e)
                    }
                }
            }

            override suspend fun requiresRestart(): Boolean {
                return true
            }

            override suspend fun getIdeRoot(workingDir: String?): String? {
                // CompositeRpcHandler in NodeBackendService already routes by
                // longest-prefix workingDir match, so a per-panel handler just
                // returns its own project root. The composite picks the right
                // panel before this is ever reached.
                return project.basePath
            }
        }
    }

    // ─── Project Helpers ─────────────────────────────────────────────

    private fun createFileChooserDescriptor(mode: String, multiple: Boolean): FileChooserDescriptor {
        val chooseFiles = mode != "folders"
        val chooseFolders = mode == "folders" || mode == "both"
        return FileChooserDescriptor(
            chooseFiles,
            chooseFolders,
            false,
            false,
            false,
            multiple,
        ).apply {
            title = when (mode) {
                "folders" -> "Select Folder"
                "both" -> "Select File or Folder"
                else -> "Select File"
            }
        }
    }

    private fun findProjectByBasePath(basePath: String): Project? {
        if (basePath.isBlank()) return null
        return ProjectManager.getInstance().openProjects
            .firstOrNull { it.basePath == basePath }
    }

    // ─── Terminal Helpers ────────────────────────────────────────────

    private fun createTerminalTab(project: Project, workingDir: String): Any? {
        // Try new API first (253+): TerminalToolWindowTabsManager
        try {
            val tabsManagerClass = Class.forName("org.jetbrains.plugins.terminal.TerminalToolWindowTabsManager")
            val getInstance = tabsManagerClass.getMethod("getInstance", Project::class.java)
            val tabsManager = getInstance.invoke(null, project)
            val createTabBuilder = tabsManagerClass.getMethod("createTabBuilder")
            val builder = createTabBuilder.invoke(tabsManager)

            try {
                val setDir = builder.javaClass.getMethod("workingDirectory", String::class.java)
                setDir.invoke(builder, workingDir)
            } catch (_: Exception) {}

            val build = builder.javaClass.getMethod("build")
            val tab = build.invoke(builder)
            val getTerminalView = tab.javaClass.getMethod("getTerminalView")
            val terminalView = getTerminalView.invoke(tab)
            logger.info("Created terminal tab via TerminalToolWindowTabsManager (253+ API)")
            return terminalView
        } catch (_: Exception) {}

        // Fall back to deprecated API via reflection (242~252)
        try {
            val managerClass = Class.forName("org.jetbrains.plugins.terminal.TerminalToolWindowManager")
            val getInstance = managerClass.getMethod("getInstance", Project::class.java)
            val manager = getInstance.invoke(null, project)
            val createShellWidget = managerClass.getMethod(
                "createShellWidget", String::class.java, String::class.java,
                Boolean::class.javaPrimitiveType, Boolean::class.javaPrimitiveType
            )
            val widget = createShellWidget.invoke(manager, workingDir, "Claude Code", true, false)
            logger.info("Created terminal tab via TerminalToolWindowManager.createShellWidget (legacy reflection)")
            return widget
        } catch (e: Exception) {
            logger.error("Failed to create terminal tab via any API", e)
            return null
        }
    }

    private fun sendCommandToTerminal(widget: Any, command: String) {
        try {
            val method = widget.javaClass.getMethod("sendCommandToExecute", String::class.java)
            method.invoke(widget, command)
            return
        } catch (_: Exception) {}

        try {
            val builderMethod = widget.javaClass.getMethod("createSendTextBuilder", String::class.java)
            val builder = builderMethod.invoke(widget, command)
            val shouldExecute = builder.javaClass.getMethod("shouldExecute")
            shouldExecute.invoke(builder)
            val send = builder.javaClass.getMethod("send")
            send.invoke(builder)
            return
        } catch (_: Exception) {}

        try {
            val shellWidgetClass = Class.forName("org.jetbrains.plugins.terminal.ShellTerminalWidget")
            val toShellMethod = shellWidgetClass.getMethod(
                "toShellJediTermWidgetOrThrow",
                Class.forName("com.intellij.terminal.ui.TerminalWidget")
            )
            val shellWidget = toShellMethod.invoke(null, widget)
            val executeCommand = shellWidget.javaClass.getMethod("executeCommand", String::class.java)
            executeCommand.invoke(shellWidget, command)
        } catch (e: Exception) {
            logger.warn("All terminal command execution methods failed", e)
        }
    }

    // ─── Lifecycle ──────────────────────────────────────────────────

    companion object {
        /**
         * Upper bound on how long the panel waits for the backend to report its port
         * before surfacing a retryable error. Generous enough to absorb a slow shell-PATH
         * capture (up to a 10s timeout), first-run resource extraction, and a cold WSL
         * `wsl.exe` start, while still bounding the formerly-unbounded wait. See issue #97.
         */
        private const val BACKEND_START_TIMEOUT_MS = 30_000L

        /** Backup interval (ms) for the OSR stale-paint repaint nudge. Low frequency
         * on purpose — it only has to catch artifacts the mouse-motion nudge missed. */
        private const val REPAINT_NUDGE_INTERVAL_MS = 2500

        /** Minimum gap (ns) between mouse-motion repaint nudges so we don't invalidate
         * the whole view on every pixel of movement (250ms). */
        private const val REPAINT_NUDGE_MIN_GAP_NANOS = 250_000_000L

        /** Escape the minimal set of HTML metacharacters so backend stderr can be safely
         * embedded in the Swing HTML error label without breaking its markup. */
        private fun escapeHtml(s: String): String =
            s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    }

    override fun dispose() {
        isPanelDisposed = true
        // Detach browser component from this panel WITHOUT disposing the browser.
        // The browser is owned by ClaudeCodeBrowserService and survives tab move/split.
        // It will be reattached when a new ClaudeCodePanel is created for the same session.
        // When holder is null (JCEF unavailable), browser was never added, so nothing to detach.
        holder?.let { remove(it.browser.component) }

        scope.coroutineContext[kotlinx.coroutines.Job]?.cancel()
        val acquiredHolder = holder
        if (acquiredHolder != null) {
            backendService.releasePanel(project.basePath ?: "", panelId)
            // Drop this panel's reference to its pooled browser holder. The
            // service disposes that holder only if no new panel re-acquires it
            // within the grace period (a real close, not a tab move). The tab
            // cleanup below runs only when the tab's LAST holder is disposed —
            // so closing one split pane keeps the other alive. (issues #29, #48)
            browserService.releaseRef(tabId, acquiredHolder) {
                ClaudeCodeVirtualFile.removeTab(project, tabId)
                EditorTabStateService.getInstance(project).removeTab(tabId)
            }
        }
        // NOTE: Do NOT call Disposer.dispose(cursorQuery) or Disposer.dispose(browser).
        // They are managed by ClaudeCodeBrowserService and released via releaseRef().
        logger.info("ClaudeCodePanel disposed (browser retained in pool)")
    }
}

/**
 * Converts a `file://` URI string to an OS-native file path.
 *
 * `java.net.URI.path` returns the raw path component, which on Windows gives
 * `/C:/Users/...` (leading slash before the drive letter). This function strips
 * that spurious leading slash so the result is a valid Windows path (`C:/Users/...`).
 * On macOS and Linux the path already starts with `/` and is returned as-is.
 *
 * The detection is purely string-based (`^/[A-Za-z]:`) so it works correctly in
 * unit tests regardless of the host OS.
 */
/**
 * Build the WebView URL loaded by the JCEF browser.
 *
 * Pure string assembly extracted from [ClaudeCodePanel.loadWebView] so the query
 * construction (param encoding, ordering, the `theme` flag) is unit-testable.
 *
 * Query params, in order:
 *   - `workingDir` — IDE project base path (omitted when null)
 *   - `panelId`    — forwarded to /ws so the backend can route panel-scoped
 *                    notifications (NATIVE_DROP, etc.) back to this exact webview
 *   - `theme`      — `light` | `dark`, derived from the IDE LAF ([isBright]).
 *                    Consumed by the FOUC guard in webview/index.html to paint
 *                    the right surface color before CSS/React load.
 *   - `pair`       — single-use initial pairing code (omitted when null/blank).
 *                    Out-of-band delivery of the code the webview redeems once (POST
 *                    /pair) for the auth token, which it then attaches to its ws
 *                    connections as the `ccg-auth` subprotocol. The auth token itself
 *                    is NEVER placed in a URL. MUST still be redacted (see
 *                    [redactUrlSecrets]) before the URL is ever logged.
 */
internal fun buildWebViewUrl(
    port: Int,
    pathSegment: String,
    workingDir: String?,
    panelId: String,
    isBright: Boolean,
    pairCode: String? = null,
): String {
    val workingDirParam = workingDir?.let {
        "workingDir=${java.net.URLEncoder.encode(it, "UTF-8")}"
    }
    val panelParam = "panelId=${java.net.URLEncoder.encode(panelId, "UTF-8")}"
    val themeParam = "theme=${if (isBright) "light" else "dark"}"
    val pairParam = pairCode?.takeIf { it.isNotBlank() }?.let {
        "pair=${java.net.URLEncoder.encode(it, "UTF-8")}"
    }
    val query = listOfNotNull(workingDirParam, panelParam, themeParam, pairParam).joinToString("&")
    return "http://localhost:$port$pathSegment?$query"
}

/**
 * Replace the value of a `token=` or `pair=` query param with `<redacted>` so a
 * WebView URL can be logged without leaking the auth token or the single-use pairing
 * code. Matches `?token=`/`&token=` and `?pair=`/`&pair=` up to the next `&` (or end
 * of string). Pure string transform, unit-testable.
 */
internal fun redactUrlSecrets(url: String): String =
    url.replace(Regex("([?&](?:token|pair)=)[^&]*"), "$1<redacted>")

internal fun resolveFileUriPath(raw: String): String? {
    return runCatching {
        val path = java.net.URI(raw).path ?: return null
        // Windows: URI.path returns "/C:/..." — strip the leading slash.
        if (path.matches(Regex("^/[A-Za-z]:.*"))) path.substring(1) else path
    }.getOrNull()
}
