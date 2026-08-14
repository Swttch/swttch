package com.github.yhk1038.claudecodegui.toolwindow

import com.intellij.openapi.diagnostic.Logger
import com.intellij.ui.HyperlinkLabel
import java.awt.BorderLayout
import java.awt.Component
import javax.swing.BorderFactory
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.SwingConstants

/**
 * Fallback panel shown when JCEF is present but unusable — the runtime ships a
 * JCEF whose API disagrees with the one the IDE compiled against, so building a
 * browser throws instead of returning one.
 *
 * Distinct from [JcefUnavailablePanel], which covers the *absent* JCEF case and
 * can be fixed by installing a JCEF runtime. Here a JCEF runtime is already
 * installed; installing another of the same generation would fail identically,
 * so this panel points at the IDE version instead (issue #295).
 *
 * Concretely: Android Studio ≤2026.1.2 boots on Java 21 and bundles its own
 * `JCefAppConfig` with `isRemoteEnabled()`. Selecting a JCEF-enabled JBR 21
 * shadows that jar from the boot layer with a copy lacking the method, and
 * `JBCefApp`'s constructor calls it → `NoSuchMethodError`. JBR 25 has the method
 * but those builds cannot boot on Java 25 (the Security Manager was removed in
 * Java 24). Android Studio 2026.1.3 moved its bundled runtime to Java 25, which
 * resolves it — hence "update the IDE" rather than "swap the runtime".
 */
class JcefRuntimeMismatchPanel : JPanel(BorderLayout()) {

    private val logger = Logger.getInstance(JcefRuntimeMismatchPanel::class.java)

    init {
        border = BorderFactory.createEmptyBorder(40, 40, 40, 40)

        val content = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            alignmentX = Component.CENTER_ALIGNMENT
        }

        val message = JLabel(
            "<html><div style='text-align:center; width: 480px;'>" +
            "<h2 style='margin-top:0;'>This IDE and its runtime disagree</h2>" +
            "<p>The chat UI could not start because the selected JetBrains Runtime " +
            "ships a version of JCEF that this IDE was not built against. The browser " +
            "fails while it is being created, which is why this panel is here instead " +
            "of the chat.</p>" +
            "<p style='text-align:left;'><b>On Android Studio, update the IDE:</b></p>" +
            "<ol style='text-align:left;'>" +
            "<li>Update Android Studio to <b>2026.1.3 or later</b></li>" +
            "<li>Open Find Action: <b>Cmd+Shift+A</b> (macOS) or <b>Ctrl+Shift+A</b> (Windows/Linux)</li>" +
            "<li>Run <b>&quot;Choose Boot Java Runtime for the IDE&hellip;&quot;</b></li>" +
            "<li>Pick a runtime whose name contains <b>JCEF</b>, then restart</li>" +
            "</ol>" +
            "<p>Selecting a different runtime on 2026.1.2 or earlier will not help — " +
            "those versions have no working combination.</p>" +
            "</div></html>"
        ).apply {
            horizontalAlignment = SwingConstants.CENTER
            alignmentX = Component.CENTER_ALIGNMENT
        }

        val details = HyperlinkLabel("Read the full explanation").apply {
            alignmentX = Component.CENTER_ALIGNMENT
            setHyperlinkTarget(DETAILS_URL)
        }

        content.add(message)
        content.add(Box.createVerticalStrut(16))
        content.add(details)

        add(content, BorderLayout.CENTER)

        logger.info("JcefRuntimeMismatchPanel created — JCEF is present but incompatible with this IDE")
    }

    companion object {
        private const val DETAILS_URL = "https://github.com/Swttch/swttch/issues/295"
    }
}
