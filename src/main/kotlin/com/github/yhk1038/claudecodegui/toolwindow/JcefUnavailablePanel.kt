package com.github.yhk1038.claudecodegui.toolwindow

import com.github.yhk1038.claudecodegui.platform.PlatformActionInvoker
import com.intellij.ide.BrowserUtil
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
 * Fallback panel shown in place of the chat when JCEF cannot host it.
 *
 * It explains two different situations, because they need opposite instructions
 * and the wrong one wastes the user's time:
 *
 *  - [JcefAvailability.RUNTIME_UNSUPPORTED] — the JCEF classes are there but the
 *    boot runtime cannot drive them. Android Studio ships without JCEF in its
 *    bundled JBR, so choosing a JCEF-enabled runtime fixes it.
 *  - [JcefAvailability.CLASSES_ABSENT] — `com.intellij.ui.jcef` is missing
 *    outright. Android Studio 2026.2 moved JCEF into the separate
 *    "Web Browser (JCEF)" marketplace plugin and does not bundle it. **No runtime
 *    choice helps here**, verified by booting a JCEF-enabled JBR 25.0.3 on
 *    2026.2.1 Canary 2 and watching the module stay unresolved. Sending that user
 *    to the runtime dialog costs them a download, a restart, and this same panel
 *    (issue #321).
 */
class JcefUnavailablePanel(
    private val availability: JcefAvailability = JcefAvailability.RUNTIME_UNSUPPORTED
) : JPanel(BorderLayout()) {

    private val logger = Logger.getInstance(JcefUnavailablePanel::class.java)

    init {
        border = BorderFactory.createEmptyBorder(40, 40, 40, 40)

        val content = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            alignmentX = Component.CENTER_ALIGNMENT
        }

        val classesAbsent = availability == JcefAvailability.CLASSES_ABSENT

        val message = JLabel().apply {
            horizontalAlignment = SwingConstants.CENTER
            alignmentX = Component.CENTER_ALIGNMENT
        }
        installReflowingMessage(message, if (classesAbsent) PLUGIN_MESSAGE else RUNTIME_MESSAGE)

        val actionButton = JButton(
            if (classesAbsent) "Open the Web Browser (JCEF) page" else "Install JCEF Runtime"
        ).apply {
            alignmentX = Component.CENTER_ALIGNMENT
            addActionListener {
                if (classesAbsent) BrowserUtil.browse(JCEF_PLUGIN_URL) else invokeChooseRuntime()
            }
        }

        val learnMore = HyperlinkLabel("Learn more").apply {
            alignmentX = Component.CENTER_ALIGNMENT
            setHyperlinkTarget(LEARN_MORE_URL)
        }

        content.add(message)
        content.add(Box.createVerticalStrut(16))
        content.add(actionButton)
        content.add(Box.createVerticalStrut(12))
        content.add(learnMore)

        add(content, BorderLayout.CENTER)

        logger.info("JcefUnavailablePanel created — JCEF is unavailable: $availability")
    }

    private fun invokeChooseRuntime() {
        // PlatformActionInvoker picks the modern 3-arg ActionUtil.invokeAction on
        // IntelliJ 2024.3+ and falls back to the legacy 5-arg overload on 2024.2.x
        // (Android Studio Ladybug). The deprecation is contained inside the invoker.
        PlatformActionInvoker.invokeActionById("ChooseRuntime", this, "JcefUnavailablePanel")
    }

    companion object {
        /**
         * The bodies below carry no width-bearing wrapper — [installReflowingMessage]
         * supplies that, and re-supplies it whenever the panel is resized.
         */
        private const val RUNTIME_MESSAGE =
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
            "</ol>"

        /**
         * Deliberately says nothing about choosing a runtime. On this IDE that is a
         * dead end, and offering it even as a second option is what would send the
         * user down it.
         */
        private const val PLUGIN_MESSAGE =
            "<h2 style='margin-top:0;'>This IDE does not include JCEF</h2>" +
            "<p>Claude Code GUI draws its chat on JCEF. Starting with 2026.2, JCEF is " +
            "no longer part of the IDE itself — it moved into a separate plugin by " +
            "JetBrains, and Android Studio does not bundle it. Installing that plugin " +
            "is all this needs; changing the boot runtime will not help.</p>" +
            "<br/>" +
            "<p style='text-align:left;'><b>Install it from the marketplace:</b></p>" +
            "<ol style='text-align:left;'>" +
            "<li>Open <b>Settings &rarr; Plugins &rarr; Marketplace</b></li>" +
            "<li>Search for <b>Web Browser (JCEF)</b> — the one by <b>JetBrains</b></li>" +
            "<li>Install it and restart the IDE</li>" +
            "</ol>"

        private const val JCEF_PLUGIN_URL = "https://plugins.jetbrains.com/plugin/31360"

        private const val LEARN_MORE_URL =
            "https://github.com/Swttch/swttch/blob/main/docs/troubleshooting/en/android-studio-jcef.md"
    }
}
