package com.github.yhk1038.claudecodegui.statusbar

import com.github.yhk1038.claudecodegui.services.NodeBackendService
import com.github.yhk1038.claudecodegui.settings.ClaudeCodeSettingsConfigurable
import com.intellij.icons.AllIcons
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.ui.components.ActionLink
import com.intellij.ui.components.JBLabel
import com.intellij.ui.awt.RelativePoint
import com.intellij.ui.components.panels.VerticalLayout
import com.intellij.util.Alarm
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Dimension
import java.awt.FlowLayout
import java.awt.Point
import javax.swing.JPanel
import javax.swing.SwingUtilities
import javax.swing.Timer

/**
 * The status-bar widget's popup card:
 *
 * ```
 * Claude Code                                  ⚙
 * Running (port 63412)
 * 3 connections: 2 × IDE panel, 1 × browser
 * 2 sessions, 1 actively streaming
 * [Open]  [Copy address]
 * ```
 *
 * Kotlin-side state (lifecycle, port) renders immediately; the counter lines come
 * from `GET /internal/status`, fetched on open and refreshed every
 * [REFRESH_INTERVAL_MS] while the popup is visible (pooled thread, EDT update).
 * All UI text is English only.
 */
class BackendStatusPopup(private val project: Project) {

    private val service = NodeBackendService.getInstance()
    private val basePath: String? = project.basePath

    private val stateLabel = JBLabel()
    private val connectionsLabel = JBLabel()
    private val sessionsLabel = JBLabel()
    // "Open" launches the URL in a browser; "Copy" puts it on the clipboard. The raw
    // URL is intentionally NOT shown as text — it is an implementation detail (a
    // loopback address + dynamic port), and the two actions are all a user needs.
    private val openLink = ActionLink("Open") { openInBrowser() }
    private val copyLink: ActionLink = ActionLink("Copy address") {
        currentUrl?.let {
            CopyPasteManager.copyTextToClipboard(it)
            showCopyFeedback()
        }
    }.apply {
        // Reserve the width of the wider "Copied!" feedback text up front: the
        // card is only re-laid-out by the periodic pack(), so a text that grows
        // the link mid-flash would render clipped (looking like the label just
        // vanished) until the next 2 s tick resized the whole card around it.
        text = "Copied!"
        preferredSize = preferredSize
        text = "Copy address"
    }

    @Volatile
    private var currentUrl: String? = null

    private var popup: JBPopup? = null
    private var anchor: Component? = null

    /**
     * The browser URL for this project's backend. Carries `?workingDir=` so the
     * webview opens straight into THIS project instead of the project selector —
     * the same param (and encoding) the JCEF panel uses. Loopback host is fine:
     * the backend binds 127.0.0.1 by default and the address is never shown, only
     * opened or copied. Null while no port is known (backend not running).
     */
    private fun backendUrl(port: Int?): String? {
        if (port == null) return null
        val base = "http://127.0.0.1:$port"
        val dir = basePath ?: return base
        return "$base?workingDir=${java.net.URLEncoder.encode(dir, "UTF-8")}"
    }

    /**
     * "Open" handler. The system browser is a separate storage partition from JCEF,
     * so it has no auth token and a bare loopback URL fails auth (WebSocket 401 →
     * stuck on "Loading projects..."). We mint a fresh single-use LOCAL pairing code
     * and carry it as `?pair=`/`&pair=`; the browser redeems it once at POST /pair
     * for the real token — the only browser auth path.
     *
     * The code mint is a blocking loopback HTTP round-trip, so it runs on a pooled
     * thread (never the EDT); [BrowserUtil.browse] is then marshalled back to the
     * EDT. If the mint fails we still open the bare URL (best-effort, degrades to the
     * old behaviour). The pair-bearing URL is NEVER logged.
     */
    private fun openInBrowser() {
        val bareUrl = currentUrl ?: return
        val base = basePath ?: return
        ApplicationManager.getApplication().executeOnPooledThread {
            val code = service.issueLocalPairCode(base)
            val url = if (code != null) appendPairCode(bareUrl, code) else bareUrl
            SwingUtilities.invokeLater { BrowserUtil.browse(url) }
        }
    }

    /**
     * Append `pair=<encoded code>` to [url], choosing `?` or `&` by whether the URL
     * already carries a query string. In practice [backendUrl] always adds
     * `?workingDir=`, so this is `&`; the `?` branch is a safety net for a null
     * basePath (bare `http://host:port`). The code is URL-encoded. Never logged.
     */
    private fun appendPairCode(url: String, code: String): String {
        val separator = if (url.contains('?')) "&" else "?"
        return "$url${separator}pair=${java.net.URLEncoder.encode(code, "UTF-8")}"
    }

    /** Create the popup and show it just above [component] (the status-bar dot). */
    fun showAbove(component: Component) {
        anchor = component
        val popup = createPopup()
        popup.show(anchorPoint(component, popup.content.preferredSize))
    }

    /**
     * Popup top-left corner for a given card [size]: bottom edge just above the
     * anchor, RIGHT edge aligned with the anchor's right edge. The status bar sits
     * at the window's bottom-right, so the card must grow leftwards into the IDE —
     * left-edge alignment made it overflow the IDE window onto the desktop
     * (the platform's own status-bar cards, e.g. MCP Server, open the same way).
     */
    private fun anchorPoint(a: Component, size: Dimension): RelativePoint =
        RelativePoint(a, Point(a.width - size.width, -size.height))

    /** The clipboard write has no visible effect of its own — flash the link text. */
    private fun showCopyFeedback() {
        copyLink.text = "Copied!"
        Timer(COPY_FEEDBACK_MS) { copyLink.text = "Copy address" }.apply {
            isRepeats = false
            start()
        }
    }

    private fun createPopup(): JBPopup {
        // First render from Kotlin-side state BEFORE the popup is built: the popup
        // is sized from the content's preferred size at creation, so empty labels
        // would produce a clipped card (the counter lines then grow it via pack()).
        val initialLifecycle = basePath?.let { service.lifecycleOf(it) }
        val initialPort = basePath?.let { service.portOf(it) }
        currentUrl = backendUrl(initialPort)
        stateLabel.text = BackendDotState.cardStateLine(initialLifecycle, project.isOpen, initialPort)
        connectionsLabel.isVisible = false
        sessionsLabel.isVisible = false

        val gear = ActionLink("") {
            ShowSettingsUtil.getInstance()
                .showSettingsDialog(project, ClaudeCodeSettingsConfigurable::class.java)
        }
        gear.icon = AllIcons.General.Settings
        gear.toolTipText = "Open settings"

        val titleRow = JPanel(BorderLayout()).apply {
            isOpaque = false
            add(JBLabel("Claude Code").apply { font = JBUI.Fonts.label().asBold() }, BorderLayout.WEST)
            add(gear, BorderLayout.EAST)
        }

        val urlRow = JPanel(FlowLayout(FlowLayout.LEFT, JBUI.scale(8), 0)).apply {
            isOpaque = false
            add(openLink)
            add(copyLink)
        }

        val content = JPanel(VerticalLayout(JBUI.scale(6))).apply {
            border = JBUI.Borders.empty(10, 12)
            add(titleRow)
            add(stateLabel)
            add(connectionsLabel)
            add(sessionsLabel)
            add(urlRow)
        }

        val popup = JBPopupFactory.getInstance()
            .createComponentPopupBuilder(content, openLink)
            .setRequestFocus(true)
            .setCancelOnClickOutside(true)
            .createPopup()
        this.popup = popup

        // Periodic counter refresh while the popup is visible; the popup is the
        // parent disposable, so closing it cancels the alarm.
        val alarm = Alarm(Alarm.ThreadToUse.POOLED_THREAD, popup)
        lateinit var tick: () -> Unit
        tick = {
            refresh()
            if (!alarm.isDisposed) alarm.addRequest(tick, REFRESH_INTERVAL_MS)
        }
        alarm.addRequest(tick, 0)

        return popup
    }

    /**
     * Recompute every card line. Runs on a pooled thread (may block on the HTTP
     * fetch); label mutations are marshalled to the EDT.
     */
    private fun refresh() {
        val lifecycle = basePath?.let { service.lifecycleOf(it) }
        val keptAlive = project.isOpen
        val port = basePath?.let { service.portOf(it) }
        val status = if (basePath != null && port != null)
            BackendStatusClient.fetch(port, service.authToken(basePath))
        else null

        val stateText = BackendDotState.cardStateLine(lifecycle, keptAlive, port)
        val connectionsText = status?.let { formatConnections(it.connections) } ?: ""
        val sessionsText = status?.let { formatSessions(it.sessions) } ?: ""
        val url = backendUrl(port)

        SwingUtilities.invokeLater {
            currentUrl = url
            stateLabel.text = stateText
            connectionsLabel.text = connectionsText
            connectionsLabel.isVisible = connectionsText.isNotEmpty()
            sessionsLabel.text = sessionsText
            sessionsLabel.isVisible = sessionsText.isNotEmpty()
            // Open/Copy row is meaningful only while there's a URL to act on.
            openLink.parent?.isVisible = url != null
            // Counter lines appear asynchronously and can be wider than the initial
            // content — grow the popup to fit instead of clipping the text. pack()
            // keeps the top-left corner, so a height change would detach the card
            // from the status-bar dot below it — re-anchor the bottom edge after.
            // The anchor math MUST use preferredSize, not content.height: the window
            // resize requested by pack() lands asynchronously, so content.height is
            // still the pre-pack value here — anchoring on it left the grown card
            // covering the status bar until the next 2 s tick (D2 manual pass 3).
            popup?.takeIf { it.isVisible }?.let { p ->
                p.pack(true, true)
                anchor?.takeIf { it.isShowing }?.let { a ->
                    p.setLocation(anchorPoint(a, p.content.preferredSize).screenPoint)
                }
            }
        }
    }

    private fun formatConnections(stats: BackendStatusClient.ConnectionStats): String {
        if (stats.total == 0) return "No connections"
        val parts = buildList {
            if (stats.panels > 0) add("${stats.panels} × IDE panel")
            if (stats.browsers > 0) add("${stats.browsers} × browser")
            if (stats.tunnels > 0) add("${stats.tunnels} × tunnel")
        }
        val noun = if (stats.total == 1) "connection" else "connections"
        return "${stats.total} $noun: ${parts.joinToString(", ")}"
    }

    private fun formatSessions(stats: BackendStatusClient.SessionStats): String {
        if (stats.total == 0) return "No sessions"
        val noun = if (stats.total == 1) "session" else "sessions"
        return "${stats.total} $noun, ${stats.streaming} actively streaming"
    }

    companion object {
        private const val REFRESH_INTERVAL_MS = 2_000
        private const val COPY_FEEDBACK_MS = 1_500
    }
}
