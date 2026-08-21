package com.github.yhk1038.claudecodegui.toolwindow

import com.github.yhk1038.claudecodegui.platform.PlatformActionInvoker
import com.intellij.openapi.diagnostic.Logger
import com.intellij.ui.HyperlinkLabel
import java.awt.BorderLayout
import java.awt.Component
import javax.swing.BorderFactory
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.SwingConstants

/**
 * Fallback panel shown when JCEF is not available in the current JetBrains Runtime.
 *
 * Android Studio ships without JCEF by default. When [com.intellij.ui.jcef.JBCefApp.isSupported]
 * returns false, this panel is displayed in place of the normal WebView panel.
 *
 * The "Install JCEF Runtime" button triggers the IDE's built-in
 * "Choose Boot Java Runtime for the IDE…" dialog. The IDE then downloads a
 * JCEF-enabled JBR and prompts the user to restart.
 */
class JcefUnavailablePanel : JPanel(BorderLayout()) {

    private val logger = Logger.getInstance(JcefUnavailablePanel::class.java)

    init {
        border = BorderFactory.createEmptyBorder(40, 40, 40, 40)

        val content = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            alignmentX = Component.CENTER_ALIGNMENT
        }

        val message = JLabel(
            "<html><div style='text-align:center; width: 480px;'>" +
            "<h2 style='margin-top:0;'>Claude Code GUI needs JCEF</h2>" +
            "<p>This IDE is running without JCEF, which Claude Code GUI requires " +
            "to render its chat UI. Click below to install a JCEF-enabled JetBrains " +
            "Runtime — the IDE will download and apply it automatically, then ask you " +
            "to restart.</p>" +
            "<br/>" +
            "<p style='text-align:left;'><b>If the button does not work, do this manually:</b></p>" +
            "<ol style='text-align:left;'>" +
            "<li>Open Find Action: <b>Cmd+Shift+A</b> (macOS) or <b>Ctrl+Shift+A</b> (Windows/Linux)</li>" +
            "<li>Search for <b>&quot;Choose Boot Java Runtime for the IDE&hellip;&quot;</b> and run it</li>" +
            "<li>Pick a runtime whose name contains <b>&quot;JCEF&quot;</b> or <b>&quot;with JCEF&quot;</b></li>" +
            "<li>The IDE downloads and installs it, then prompts to restart</li>" +
            "</ol>" +
            "</div></html>"
        ).apply {
            horizontalAlignment = SwingConstants.CENTER
            alignmentX = Component.CENTER_ALIGNMENT
        }

        val installButton = JButton("Install JCEF Runtime").apply {
            alignmentX = Component.CENTER_ALIGNMENT
            addActionListener { invokeChooseRuntime() }
        }

        val learnMore = HyperlinkLabel("Learn more").apply {
            alignmentX = Component.CENTER_ALIGNMENT
            setHyperlinkTarget(LEARN_MORE_URL)
        }

        content.add(message)
        content.add(Box.createVerticalStrut(16))
        content.add(installButton)
        content.add(Box.createVerticalStrut(12))
        content.add(learnMore)

        add(content, BorderLayout.CENTER)

        logger.info("JcefUnavailablePanel created — JCEF is not supported in this runtime")
    }

    private fun invokeChooseRuntime() {
        // PlatformActionInvoker picks the modern 3-arg ActionUtil.invokeAction on
        // IntelliJ 2024.3+ and falls back to the legacy 5-arg overload on 2024.2.x
        // (Android Studio Ladybug). The deprecation is contained inside the invoker.
        PlatformActionInvoker.invokeActionById("ChooseRuntime", this, "JcefUnavailablePanel")
    }

    companion object {
        private const val LEARN_MORE_URL =
            "https://github.com/Swttch/swttch/blob/main/docs/troubleshooting/en/android-studio-jcef.md"
    }
}
