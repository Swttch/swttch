package com.github.yhk1038.claudecodegui.bridge

import java.awt.HeadlessException
import java.awt.Toolkit
import java.awt.datatransfer.Clipboard
import java.awt.datatransfer.StringSelection

/**
 * Puts text into the system selection: the Linux PRIMARY selection, the buffer
 * that a middle click pastes from (#513).
 *
 * Every program fills it as soon as something is selected, and the IDE's own
 * embedded browser used to as well. From IDE 2026.2 that browser runs in a
 * process of its own and no longer does, so what the user selects in the chat
 * has to be put there from this side, from the text the webview reports.
 *
 * The AWT answers `null` for [Toolkit.getSystemSelection] wherever the platform
 * has no such buffer (macOS, Windows), which makes the call a no-op there by
 * itself: no operating system is checked here, and none should be, because a
 * platform that gains the buffer later is picked up for free.
 *
 * [selection] is a parameter so the behaviour can be tested without a display.
 */
class SystemSelectionWriter(
    private val selection: () -> Clipboard? = { Toolkit.getDefaultToolkit().systemSelection },
) {
    /**
     * Hand [text] to the system selection.
     *
     * @return true when the platform accepted it. False means nothing was placed:
     *   empty text (dropping a selection leaves the buffer alone in every other
     *   program, so an empty report must not wipe what the user can still
     *   paste), a platform without the buffer, or a clipboard that refused.
     */
    fun write(text: String): Boolean {
        if (text.isEmpty()) return false
        return try {
            val clipboard = selection() ?: return false
            val contents = StringSelection(text)
            // The contents are their own owner, as the IDE does for its clipboard.
            clipboard.setContents(contents, contents)
            true
        } catch (_: HeadlessException) {
            false
        } catch (_: IllegalStateException) {
            // The platform clipboard could not be opened right now. An unplaced
            // selection costs the user one copy, so there is nothing to escalate.
            false
        }
    }
}
