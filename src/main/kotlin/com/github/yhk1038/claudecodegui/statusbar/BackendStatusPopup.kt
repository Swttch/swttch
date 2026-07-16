package com.github.yhk1038.claudecodegui.statusbar

import com.github.yhk1038.claudecodegui.services.NodeBackendService
import com.github.yhk1038.claudecodegui.settings.ClaudeCodeSettingsConfigurable
import com.github.yhk1038.claudecodegui.settings.KeepAliveSetting
import com.intellij.icons.AllIcons
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.ui.components.ActionLink
import com.intellij.ui.components.JBCheckBox
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
 * Claude Code GUI Backend                      ⚙
 * [x] Keep backend running
 * Backend: running (port 63412)
 * 3 connections: 2 × IDE panel, 1 × browser
 * 2 sessions, 1 actively streaming
 * http://127.0.0.1:63412 ↗                [copy]
 * ```
 *
 * Kotlin-side state (lifecycle, port, toggle) renders immediately; the counter
 * lines come from `GET /internal/status`, fetched on open and refreshed every
 * [REFRESH_INTERVAL_MS] while the popup is visible (pooled thread, EDT update).
 * All UI text is English only.
 */
class BackendStatusPopup(private val project: Project) {

    private val service = NodeBackendService.getInstance()
    private val basePath: String? = project.basePath

    private val keepAliveBox = JBCheckBox("Keep backend running")
    private val stateLabel = JBLabel()
    private val connectionsLabel = JBLabel()
    private val sessionsLabel = JBLabel()
    private val urlLink = ActionLink("") { BrowserUtil.browse(currentUrl ?: return@ActionLink) }
    private val copyLink: ActionLink = ActionLink("Copy") {
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
        text = "Copy"
    }

    @Volatile
    private var currentUrl: String? = null

    private var popup: JBPopup? = null
    private var anchor: Component? = null

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
        Timer(COPY_FEEDBACK_MS) { copyLink.text = "Copy" }.apply {
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
        currentUrl = initialPort?.let { "http://127.0.0.1:$it" }
        stateLabel.text = "Backend: " + BackendDotState.cardStateLine(initialLifecycle, KeepAliveSetting.get(), initialPort)
        connectionsLabel.isVisible = false
        sessionsLabel.isVisible = false
        urlLink.text = currentUrl ?: ""

        keepAliveBox.isSelected = KeepAliveSetting.get()
        keepAliveBox.addActionListener {
            val enabled = keepAliveBox.isSelected
            // applyKeepAlive spawns backends / touches sockets — keep it off the EDT.
            ApplicationManager.getApplication().executeOnPooledThread {
                service.applyKeepAlive(enabled)
                refresh()
            }
        }

        val gear = ActionLink("") {
            ShowSettingsUtil.getInstance()
                .showSettingsDialog(project, ClaudeCodeSettingsConfigurable::class.java)
        }
        gear.icon = AllIcons.General.Settings
        gear.toolTipText = "Open Claude Code settings"

        val titleRow = JPanel(BorderLayout()).apply {
            isOpaque = false
            add(JBLabel("Claude Code GUI Backend").apply { font = JBUI.Fonts.label().asBold() }, BorderLayout.WEST)
            add(gear, BorderLayout.EAST)
        }

        val urlRow = JPanel(FlowLayout(FlowLayout.LEFT, JBUI.scale(8), 0)).apply {
            isOpaque = false
            add(urlLink)
            add(copyLink)
        }

        val content = JPanel(VerticalLayout(JBUI.scale(6))).apply {
            border = JBUI.Borders.empty(10, 12)
            add(titleRow)
            add(keepAliveBox)
            add(stateLabel)
            add(connectionsLabel)
            add(sessionsLabel)
            add(urlRow)
        }

        val popup = JBPopupFactory.getInstance()
            .createComponentPopupBuilder(content, keepAliveBox)
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
        val keepAlive = KeepAliveSetting.get()
        val port = basePath?.let { service.portOf(it) }
        val status = port?.let { BackendStatusClient.fetch(it) }

        val stateText = "Backend: " + BackendDotState.cardStateLine(lifecycle, keepAlive, port)
        val connectionsText = status?.let { formatConnections(it.connections) } ?: ""
        val sessionsText = status?.let { formatSessions(it.sessions) } ?: ""
        val url = port?.let { "http://127.0.0.1:$it" }

        SwingUtilities.invokeLater {
            currentUrl = url
            keepAliveBox.isSelected = keepAlive
            stateLabel.text = stateText
            connectionsLabel.text = connectionsText
            connectionsLabel.isVisible = connectionsText.isNotEmpty()
            sessionsLabel.text = sessionsText
            sessionsLabel.isVisible = sessionsText.isNotEmpty()
            urlLink.text = url ?: ""
            urlLink.parent?.isVisible = url != null
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
