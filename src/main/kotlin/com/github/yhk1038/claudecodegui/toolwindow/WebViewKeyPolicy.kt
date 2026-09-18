package com.github.yhk1038.claudecodegui.toolwindow

import org.cef.misc.EventFlags
import java.awt.event.KeyEvent

/**
 * Which keystrokes the IDE must not claim before the WebView sees them.
 *
 * Separated from the CEF handler so the rule can be read and tested without a
 * browser: the handler itself only has somewhere to put the answer.
 *
 * Every entry here is a key the IDE has a real action on, which is why it needs
 * saying at all. The cost is that the IDE action becomes unreachable while the
 * chat has focus, so the list stays as short as the reported breakage requires —
 * F12 was once on it and swallowed WebStorm's terminal shortcut for everyone,
 * with no way to turn it off (issue #333).
 */
object WebViewKeyPolicy {

    /** Arrow key codes. AWT's constants match the Windows VK codes CEF reports. */
    private val ARROW_KEYS = setOf(
        KeyEvent.VK_LEFT,   // 37
        KeyEvent.VK_RIGHT,  // 39
        KeyEvent.VK_UP,     // 38
        KeyEvent.VK_DOWN    // 40
    )

    /**
     * Comma. Windows VK_OEM_COMMA, which is NOT AWT's `VK_COMMA` (44):
     * CEF reports Windows VK codes on every platform.
     */
    private const val VK_OEM_COMMA = 188

    /**
     * Does this keystroke belong to the WebView rather than to an IDE action?
     *
     * @param keyCode CEF's `windows_key_code`
     * @param modifiers CEF's `modifiers` bitmask, read through [EventFlags]
     */
    fun belongsToWebView(keyCode: Int, modifiers: Int): Boolean {
        val meta = (modifiers and EventFlags.EVENTFLAG_COMMAND_DOWN) != 0
        val alt = (modifiers and EventFlags.EVENTFLAG_ALT_DOWN) != 0
        val ctrl = (modifiers and EventFlags.EVENTFLAG_CONTROL_DOWN) != 0
        val shift = (modifiers and EventFlags.EVENTFLAG_SHIFT_DOWN) != 0

        // Text navigation on macOS: Cmd+Arrow to the line ends, Option+Arrow by word.
        if (keyCode in ARROW_KEYS && (meta || alt)) return true

        // Cmd+, / Ctrl+, opens our settings. Without this the IDE's own Settings
        // dialog opens over the chat instead.
        if (keyCode == VK_OEM_COMMA && (meta || ctrl)) return true

        // A modified Enter is the composer's, whichever modifier it carries.
        //
        // The IDE binds two of them in its default keymap and both fire while the
        // chat has focus: Shift+Enter opens the current file in a right split and
        // Ctrl+Enter views its source, so pressing either in the chat opened a
        // second copy of the chat instead of breaking the line (issue #463).
        //
        // Every modifier is released rather than the two that were reported,
        // because the composer's send and newline keys are user-settable: a rule
        // that named Shift and Ctrl would break again the moment someone bound
        // Alt+Enter, and they would have no way to tell why.
        //
        // Plain Enter is deliberately NOT here. It already reaches the composer,
        // and claiming it would take Enter away from every IDE list and dialog
        // that the chat is merely focused in front of.
        if (keyCode == KeyEvent.VK_ENTER && (meta || alt || ctrl || shift)) return true

        return false
    }
}
