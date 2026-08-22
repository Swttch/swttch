package com.github.yhk1038.claudecodegui.services

import com.github.yhk1038.claudecodegui.toolwindow.JcefAvailability
import com.github.yhk1038.claudecodegui.toolwindow.resolveJcefAvailability
import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import org.cef.browser.CefBrowser
import org.cef.browser.CefFrame
import org.cef.callback.CefMediaAccessCallback
import org.cef.handler.CefPermissionHandler
import com.intellij.ui.jcef.JBCefJSQuery
import com.intellij.util.Alarm
import java.util.concurrent.ConcurrentHashMap

/**
 * Pure release rule for a pooled JCEF browser holder: it may be disposed only
 * when no panel still references it. Extracted as a top-level function so the
 * rule can be unit-tested without an IDE fixture. (issue #29)
 */
internal fun shouldReleasePooledBrowser(remainingPanelRefs: Int): Boolean =
    remainingPanelRefs <= 0

/**
 * Whether a [ClaudeCodeBrowserService.releaseRef] call arrives while the project
 * is being torn down, in which case the deferred release must be skipped.
 *
 * Closing a project disposes this service — and [ClaudeCodeBrowserService]'s
 * release alarm, which is parented to it — before the panels it owns. Each
 * panel's farewell releaseRef then scheduled onto a dead alarm and the platform
 * logged "Already disposed" as an IDE internal error, once per open tab
 * (issue #231).
 *
 * Skipping loses nothing. Verified with run-ide on IntelliJ IDEA 2024.2: the
 * service's own dispose releases every holder ~18ms BEFORE the panel's
 * releaseRef arrives, and the platform writes the persisted tab state
 * (claudeCodeEditorTabs.xml) BEFORE disposing the panels — so the tabs restore
 * on the next open either way.
 *
 * Either signal is sufficient: the project is torn down as a whole, and the
 * service can be disposed while the project itself is still mid-teardown. Pure
 * for unit testing.
 */
internal fun isTeardown(projectDisposed: Boolean, serviceDisposed: Boolean): Boolean =
    projectDisposed || serviceDisposed

/**
 * A disposable's own record of having been disposed.
 *
 * The platform deprecates [com.intellij.openapi.util.Disposer.isDisposed] because
 * it answers from short-lived diagnostic bookkeeping that is cleared on events
 * such as a major GC or a dynamic plugin unload — so a teardown check built on it
 * can silently start reporting "not disposed" and let the "Already disposed"
 * error (issue #231) return. Owning the flag is the replacement the platform
 * itself recommends. Volatile: dispose runs on the EDT while a farewell
 * releaseRef may observe it from another thread.
 */
internal class DisposalTracker {
    @Volatile
    var isDisposed: Boolean = false
        private set

    fun markDisposed() {
        isDisposed = true
    }
}

/**
 * Pick a reusable (unoccupied) browser holder for a tab from the per-tab list,
 * given each holder's current panel-reference count. Returns the index of the
 * first free holder, or null if all are occupied (→ a new browser is needed).
 *
 * This is the crux of #48: a tab MOVE leaves a freed holder to reuse (so the
 * page is preserved), whereas a tab SPLIT finds every holder occupied by the
 * other live pane and so spawns a second browser — letting both panes render
 * the same conversation independently. Pure for unit testing.
 */
internal fun indexOfReusableHolder(panelRefCounts: List<Int>): Int? =
    panelRefCounts.indexOfFirst { shouldReleasePooledBrowser(it) }.takeIf { it >= 0 }

/**
 * Decide whether JCEF is in out-of-process ("remote") mode from the two signals
 * the platform offers: `CefApp.isRemoteEnabled()` and the `jcef.remote.enabled`
 * system property. Either one claiming remote is enough.
 *
 * Neither signal is trustworthy alone, and each covers the other's blind spot:
 *
 * - The property is unset on 2025.1+, where remote became the silent default.
 *   Keying off it alone mis-read those builds as in-process and forced windowed
 *   rendering, which remote mode rejects (IJPL-184288) → blank panel (#79).
 * - `isRemoteEnabled()` is a bare read of a static field that JCEF only sets
 *   during its own startup. Asked before that — which is exactly when we build
 *   our first browser — it answers `false` even though the IDE is running
 *   remote. On 2026.2 that produced `remote=false` while the platform logged
 *   both `jcef.remote.enabled=true` and "Trying to create windowed browser when
 *   remote-mode is enabled", then rendered OSR anyway. The stale-paint ghost
 *   nudge from #171 keys off this flag, so it silently stopped being installed
 *   and the OSR ghosts came back.
 *
 * Both failures point one way — a real remote build read as in-process — so the
 * fix is to believe whichever signal says remote. A false positive costs only a
 * skipped `setOffScreenRendering(false)`, which remote mode ignores regardless.
 *
 * Pure so the decision is unit-testable.
 */
internal fun resolveRemoteJcef(cefRemoteEnabled: Boolean?, legacySystemProperty: String?): Boolean =
    cefRemoteEnabled == true || "true" == legacySystemProperty

/**
 * Project-level service that pools JCEF browser instances by tabId.
 *
 * When a tab is moved or split, JetBrains disposes the FileEditor and creates
 * a new one. Without pooling, the JCEF browser is destroyed and recreated,
 * losing all in-memory state (input text, scroll position, dialogs, etc.).
 *
 * This service keeps browsers alive across dispose-recreate cycles.
 * The browser is only truly disposed when [release] is called (on real tab close).
 */
@Service(Service.Level.PROJECT)
class ClaudeCodeBrowserService(private val project: Project) : Disposable {

    private val logger = Logger.getInstance(ClaudeCodeBrowserService::class.java)

    /** Set in [dispose]; read by [releaseRef] to detect teardown. */
    private val disposal = DisposalTracker()

    class BrowserHolder(
        val browser: JBCefBrowser,
        val cursorQuery: JBCefJSQuery,
        val streamingQuery: JBCefJSQuery,
        /**
         * Whether this browser renders off-screen (OSR / remote-mode JCEF). Computed
         * once at creation from [resolveRemoteJcef]. The OSR stale-paint repaint nudge
         * (see ClaudeCodePanel.installOsrRepaintNudge) is installed only when true —
         * windowed (non-OSR) browsers don't exhibit the leftover-pixel artifact.
         */
        val isOsr: Boolean,
    ) {
        /** Callback for WebView title changes (set by ClaudeCodePanel, consumed by handlers). */
        var onTitleChanged: ((String) -> Unit)? = null

        /** Callback for WebView URL path changes (set by ClaudeCodePanel, consumed by handlers). */
        var onPathChanged: ((String) -> Unit)? = null

        /** Callback for WebView streaming state changes (set by ClaudeCodePanel, consumed by ClaudeCodeFileEditor). */
        var onStreamingStateChanged: ((isStreaming: Boolean) -> Unit)? = null

        /** Whether the WebView URL has been loaded at least once. */
        var isLoaded: Boolean = false

        /** Whether JCEF handlers (display, load, keyboard, lifespan) have been installed. */
        var handlersInstalled: Boolean = false

        /** Whether native IDE/Swing drag-and-drop has been bridged into the WebView. */
        var nativeDropBridgeInstalled: Boolean = false

        /** Whether the IME NPE workaround has been applied. */
        var imeWorkaroundInstalled: Boolean = false

        /** Whether the LAF (IDE theme) change listener has been installed. */
        var lafListenerInstalled: Boolean = false

        /**
         * Parent Disposable for the LAF listener. Disposing this removes the listener
         * from LafManager. Tied to the browser holder lifecycle (NOT the panel) so
         * the listener survives tab move/split. Set when the listener is installed,
         * disposed in [release] and the service's [dispose].
         */
        var lafListenerDisposable: Disposable? = null

        /** Whether the OSR stale-paint repaint nudge has been installed (OSR only). */
        var repaintNudgeInstalled: Boolean = false

        /**
         * Parent Disposable for the OSR repaint nudge (backup timer + mouse-motion
         * listener). Disposing this stops the timer and removes the listener. Tied to
         * the browser holder lifecycle (NOT the panel) so it survives tab move/split,
         * same as [lafListenerDisposable]. Disposed in [disposeHolder].
         */
        var repaintNudgeDisposable: Disposable? = null

        /**
         * Number of live panels referencing this browser. Incremented on
         * [getOrCreate] (panel acquires the browser) and decremented on
         * [releaseRef] (panel disposed). EDT-only access. (issue #29)
         */
        var panelRefCount: Int = 0

        /**
         * Monotonic token bumped on every acquire. A scheduled release captures
         * the token at schedule time and aborts if the token changed meanwhile —
         * i.e. the browser was re-acquired by a new panel during a tab move. This
         * makes release cancellation independent of EDT-tick timing. (issue #29)
         */
        var releaseToken: Int = 0
    }

    // tabId -> list of browser holders for that tab. Usually one, but a SPLIT of
    // the same tab into two panes holds two browsers (one per live pane). (issue #48)
    private val holders = ConcurrentHashMap<String, MutableList<BrowserHolder>>()

    /**
     * Grace timer for deferred release. A tab move disposes the old panel
     * (refCount → 0) and re-acquires from the new slot a few dozen ms later;
     * the delay lets that re-acquire cancel the release. A real tab close has
     * no re-acquire, so the release fires after the grace period. The delay
     * being generous is harmless — the browser simply lingers in the pool.
     */
    private val releaseAlarm = Alarm(Alarm.ThreadToUse.SWING_THREAD, this)

    /**
     * Whether JCEF is available in this runtime.
     *
     * Single source of truth for the "can we host a browser?" check. The
     * `claude.simulate.no.jcef` system property is a developer-only escape hatch
     * for verifying the fallback path without swapping the boot JBR.
     *
     * Cheap to call — does NOT initialize CefApp (only [JBCefApp.isSupported]
     * is consulted, which is a capability probe, not a builder).
     *
     * `isSupported()` answers whether JCEF *works*; it presupposes the JCEF
     * classes are loadable at all. On Android Studio 2026.2 Canary they are not —
     * `com.intellij.modules.jcef` fails to resolve, so this plugin's class loader
     * has no `com.intellij.ui.jcef` package and the call itself raises
     * NoClassDefFoundError (issue #321). Catching Error here is what lets the
     * guard answer "unavailable" rather than propagate, so callers can fall back
     * to [com.github.yhk1038.claudecodegui.toolwindow.JcefUnavailablePanel].
     * LinkageError also covers the runtime-mismatch shape from issue #295, where
     * the classes exist but disagree with the platform's own copy.
     */
    fun isJcefAvailable(): Boolean = jcefAvailability().isUsable

    /**
     * Why JCEF cannot host the chat, for callers that have to explain it.
     *
     * [isJcefAvailable] answers whether to build a browser; this answers which
     * fallback screen to show. The two failures need opposite instructions —
     * a 2026.1 user swaps runtime, a 2026.2 user installs a plugin — so the
     * reason is kept rather than flattened into a boolean (issue #321).
     *
     * The `JBCefApp.isSupported()` call lives here, inside a lambda body, which
     * is the one place allowed to name a class that may be absent: bodies
     * resolve lazily, so the reference costs nothing until this runs.
     */
    fun jcefAvailability(): JcefAvailability =
        resolveJcefAvailability { JBCefApp.isSupported() }.also { availability ->
            if (availability == JcefAvailability.CLASSES_ABSENT) {
                logger.warn("JCEF classes are not loadable in this runtime — treating JCEF as unavailable")
            }
        }

    /**
     * Acquire a browser holder for the tab: reuse an unoccupied pooled holder if
     * one exists, otherwise create a new one. Marks it referenced by one more
     * panel (refCount++) and bumps the release token so any pending deferred
     * release for that holder aborts — this keeps the browser alive across a tab
     * move. A split finds every holder occupied, so it gets a fresh browser and
     * both panes render independently (issue #48). The browser is NOT registered
     * with Disposer — it is managed by this service.
     */
    fun getOrCreate(tabId: String): BrowserHolder? {
        if (!isJcefAvailable()) {
            logger.warn("JCEF is not supported in this runtime — cannot create browser for tab: $tabId")
            return null
        }
        val list = holders.getOrPut(tabId) { mutableListOf() }
        val reuseIdx = indexOfReusableHolder(list.map { it.panelRefCount })
        val holder = if (reuseIdx != null) {
            list[reuseIdx]
        } else {
            logger.info("Creating new JCEF browser for tab: $tabId (view #${list.size + 1})")
            // A runtime whose JCEF disagrees with the platform's own copy throws while
            // the browser is being built, not from isJcefAvailable() — the classes are
            // all present, only a method is missing. Android Studio ≤2026.1.2 bundles a
            // JCefAppConfig with isRemoteEnabled() and boots on Java 21; adding a
            // JCEF-enabled JBR 21 shadows that jar from the boot layer with a copy that
            // lacks the method, and JBCefApp's constructor calls it (issue #295).
            // Letting the Error escape leaves the panel with nothing attached at all,
            // which is the blank window users report — so answer null and let the caller
            // show the mismatch panel.
            runCatching { createHolder() }
                .onFailure { e ->
                    // LinkageError covers both shapes: a method the runtime's JCEF
                    // lacks (NoSuchMethodError, #295) and a JCEF class the class
                    // loader cannot see at all (NoClassDefFoundError, #321).
                    if (e !is LinkageError) throw e
                    logger.warn("JCEF runtime is incompatible with this IDE — cannot create browser for tab: $tabId", e)
                }
                .getOrNull()
                ?.also { list.add(it) }
                ?: return null
        }
        holder.panelRefCount += 1
        // Bump the token so any release scheduled before this acquire aborts.
        holder.releaseToken += 1
        return holder
    }

    private fun createHolder(): BrowserHolder {
        // Disable JCEF off-screen rendering so the browser renders natively.
        // OSR (default since 2023.2) fails to forward HiDPI scale to Chromium on
        // macOS Retina, producing pixelated output (issue #23, JBR-3526). Our
        // panel has no other Swing widgets that need to overlay the browser, so
        // the z-order trade-off does not apply.
        //
        // IntelliJ runs JCEF out-of-process (remote-mode) by default since 2025.1,
        // where windowed (non-OSR) browsers are unsupported; setOffScreenRendering(false)
        // makes remote mode reject the browser and the panel renders blank
        // (issues #51/#79, IJPL-184288).
        //
        // Detect remote-mode the same way JBCefApp does internally — by reflectively
        // calling CefApp.isRemoteEnabled() — instead of reading the jcef.remote.enabled
        // system property. That property is NOT set on modern builds (remote is the
        // silent default), so the old property check mis-detected 2025.1+/2026.1 as
        // in-process and forced windowed rendering → blank screen (#79).
        val cefRemoteEnabled = queryCefRemoteEnabled()
        val isRemoteJcef = resolveRemoteJcef(
            cefRemoteEnabled,
            System.getProperty("jcef.remote.enabled"),
        )
        // Logged because every downstream rendering decision keys off this one
        // boolean — windowed vs OSR, and whether the OSR ghost-repaint nudge is
        // installed at all. When `CefApp.isRemoteEnabled()` can't be reached the
        // reflection result is null and we silently fall back to a system
        // property that modern builds never set, so a wrong answer here looks
        // like a rendering bug somewhere else entirely.
        logger.info(
            "JCEF mode: remote=$isRemoteJcef " +
                "(CefApp.isRemoteEnabled=${cefRemoteEnabled ?: "unavailable"}, " +
                "jcef.remote.enabled=${System.getProperty("jcef.remote.enabled") ?: "unset"})"
        )
        val builder = JBCefBrowser.createBuilder()
        if (!isRemoteJcef) {
            builder.setOffScreenRendering(false)
        }
        val browser = builder.build()
        grantMicrophoneAccess(browser)
        val cursorQuery = JBCefJSQuery.create(browser as JBCefBrowserBase)
        val streamingQuery = JBCefJSQuery.create(browser as JBCefBrowserBase)
        return BrowserHolder(browser, cursorQuery, streamingQuery, isOsr = isRemoteJcef)
    }

    /**
     * Let the chat's voice input open the microphone.
     *
     * Chromium denies `getUserMedia` unless something answers the permission
     * request, and there is no prompt to fall back on inside the IDE — with no
     * handler the microphone simply never opens and dictation looks broken.
     *
     * Only microphone capture is granted, and only that: the request carries a
     * bitmask that can also ask for the camera and for screen capture, so the
     * reply is masked down to the audio bit rather than passed through. A page
     * asking for anything else is denied.
     *
     * We can answer without a prompt of our own because the page is ours — the
     * chat UI we serve on localhost, not arbitrary web content. The user already
     * granted the IDE microphone access at the OS level; the OS prompt is the
     * one that decides.
     */
    private fun grantMicrophoneAccess(browser: JBCefBrowser) {
        // addPermissionHandler is missing on older JCEF builds. Voice input not
        // working is a lesser failure than the whole panel failing to load, so a
        // missing method is logged and stepped over.
        try {
            browser.jbCefClient.addPermissionHandler(
                object : CefPermissionHandler {
                    override fun onRequestMediaAccessPermission(
                        browser: CefBrowser?,
                        frame: CefFrame?,
                        requestingUrl: String?,
                        requestedPermissions: Int,
                        callback: CefMediaAccessCallback?,
                    ): Boolean {
                        val microphone = CefMediaAccessCallback.MediaPermissionFlags.DEVICE_AUDIO_CAPTURE
                        val granted = requestedPermissions and microphone
                        if (granted == 0) {
                            callback?.Cancel()
                        } else {
                            callback?.Continue(granted)
                        }
                        // true = handled; returning false would leave Chromium to
                        // apply its own default, which is to deny.
                        return true
                    }
                },
                browser.cefBrowser,
            )
        } catch (t: Throwable) {
            logger.warn("Microphone permission handler unavailable; voice input will not work", t)
        }
    }

    /**
     * Query out-of-process JCEF state the way JBCefApp does internally: reflectively
     * invoke `org.cef.CefApp.isRemoteEnabled()`. Returns the boolean result, or null
     * when the class/method is unavailable (older JCEF) so the caller can fall back
     * to the legacy system-property signal. Reflection is required because the method
     * only exists on recent JCEF builds and isn't exposed by the platform API.
     */
    private fun queryCefRemoteEnabled(): Boolean? = try {
        val method = Class.forName("org.cef.CefApp").getMethod("isRemoteEnabled")
        method.invoke(null) as? Boolean
    } catch (_: Throwable) {
        null
    }

    /**
     * Drop one panel's reference to a specific browser [holder]. When the last
     * reference is gone, the browser is NOT disposed immediately: a tab
     * move/split disposes the old panel and re-acquires a short time later, and
     * that re-acquire must keep the browser alive. So the release is deferred by
     * a grace period and aborts if the holder was re-acquired meanwhile (token
     * changed) or re-referenced (refCount > 0). Only a genuine close — with no
     * re-acquire — actually disposes it.
     *
     * [onTabClosed] runs only when the LAST holder for [tabId] is disposed (the
     * whole tab is gone, not just one split pane), letting the caller perform
     * the matching tab cleanup. (issues #29, #48)
     */
    fun releaseRef(tabId: String, holder: BrowserHolder, onTabClosed: () -> Unit) {
        holder.panelRefCount -= 1
        if (!shouldReleasePooledBrowser(holder.panelRefCount)) return

        // Project teardown disposes this service — and with it [releaseAlarm] — before
        // the panels it owns, so a panel's farewell releaseRef would schedule onto a
        // dead alarm and log "Already disposed" (issue #231). Nothing is left to do:
        // [dispose] has already released every holder, and deferring is pointless when
        // no re-acquire can follow. Skipping (rather than releasing inline) also leaves
        // the persisted tab state untouched. (issue #231)
        if (isTeardown(project.isDisposed, disposal.isDisposed)) return

        val tokenAtSchedule = holder.releaseToken
        releaseAlarm.addRequest({
            // Re-acquired during the grace period → keep the pooled browser.
            if (holder.releaseToken != tokenAtSchedule) return@addRequest
            if (!shouldReleasePooledBrowser(holder.panelRefCount)) return@addRequest

            disposeHolder(holder)
            val list = holders[tabId]
            list?.remove(holder)
            if (list != null && list.isEmpty()) {
                holders.remove(tabId)
                onTabClosed()
            }
        }, RELEASE_GRACE_MS)
    }

    /**
     * Dispose a single browser holder. Private: callers go through [releaseRef]
     * so the refcount + grace-period guard is always applied. (issue #29)
     */
    private fun disposeHolder(holder: BrowserHolder) {
        logger.info("Releasing JCEF browser holder")
        try { holder.repaintNudgeDisposable?.let { Disposer.dispose(it) } } catch (_: Exception) {}
        try { holder.lafListenerDisposable?.let { Disposer.dispose(it) } } catch (_: Exception) {}
        try { Disposer.dispose(holder.streamingQuery) } catch (_: Exception) {}
        try { Disposer.dispose(holder.cursorQuery) } catch (_: Exception) {}
        try { Disposer.dispose(holder.browser) } catch (_: Exception) {}
    }

    override fun dispose() {
        // Mark first: a panel's farewell releaseRef arriving mid-dispose must see
        // teardown and skip, rather than schedule onto the alarm we are about to
        // tear down (issue #231).
        disposal.markDisposed()
        holders.values.flatten().forEach { disposeHolder(it) }
        holders.clear()
    }

    companion object {
        /**
         * Grace period before a zero-reference browser is disposed. Must comfortably
         * exceed the tab-move dispose→re-acquire gap (observed 37–48ms) so a move
         * never disposes the browser, while still being imperceptible on a real
         * close. Generous on purpose — a lingering pooled browser is harmless.
         */
        private const val RELEASE_GRACE_MS = 750

        fun getInstance(project: Project): ClaudeCodeBrowserService =
            project.getService(ClaudeCodeBrowserService::class.java)
    }
}
