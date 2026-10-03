package com.github.yhk1038.claudecodegui.toolwindow

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CustomShortcutSet
import com.intellij.openapi.actionSystem.KeyboardShortcut
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.util.SystemInfo
import java.awt.event.KeyEvent
import javax.swing.JComponent

/**
 * Reports the macOS Emacs text keys pressed while the webview has focus, and
 * keeps the IDE's keymap from running its own action for them (issue #506).
 *
 * ## Why this is the path, and CEF is not
 *
 * When the IDE's key dispatcher looks for an action bound to a keystroke, it
 * asks the focused component and its ancestors for their own shortcut actions
 * before it consults the keymap, performs the first enabled one, and consumes
 * the key event. This registers one such action on the browser component for
 * every claimed keystroke ([EmacsTextKey.claimedKeyStrokes]). Two things follow:
 *
 * - The keymap's action for the same keystroke does not run. IntelliJ's macOS
 *   keymap binds Ctrl+T to "Refactor This" and Ctrl+V to the VCS popup, and
 *   those popups used to take focus away from the page.
 * - The key never reaches CEF, so no CEF keyboard handler can see it. The
 *   action itself is therefore what reports the key: the AWT event it receives
 *   carries the real letter and the real Shift state (see [EmacsTextKey]).
 *
 * ## One registration per browser component
 *
 * The browser component is pooled and outlives the panel that first showed
 * it: a tab move disposes the panel and a new one picks the same component up.
 * [install] is therefore called by every panel that wires the component, and
 * it registers the action only on the first call. Later calls only re-point
 * the callback at the calling panel, so a key is reported once, by the panel
 * that currently owns the component.
 */
internal object EmacsTextKeyShortcutGuard {

    /** Client-property key under which a component keeps its [Receiver]. */
    private val RECEIVER_KEY = Any()

    /**
     * Turns the AWT event of a performed shortcut into a report. Holds the
     * callback of the panel that installed last; the registered action reads
     * it at the moment of each key press.
     */
    internal class Receiver(onKey: (letter: String, shift: Boolean) -> Unit) {
        @Volatile
        var onKey: (letter: String, shift: Boolean) -> Unit = onKey

        /** Reports [event] when it is one of the claimed presses; ignores anything else. */
        fun deliver(event: KeyEvent?) {
            if (event == null) return
            val press = EmacsTextKey.pressOf(event.keyCode, event.keyChar, event.isShiftDown) ?: return
            onKey(press.letter, press.shift)
        }
    }

    /**
     * Makes [browserComponent] report the claimed keys to [onKey]. The first
     * call registers the shortcut action; every later call on the same
     * component only replaces the callback. Does nothing when no keystroke is
     * claimed (every platform except macOS).
     *
     * [register] performs the registration; tests replace it to count calls
     * without an action system.
     */
    fun install(
        browserComponent: JComponent,
        isMac: Boolean = SystemInfo.isMac,
        register: (AnAction, CustomShortcutSet, JComponent) -> Unit = { action, shortcuts, component ->
            action.registerCustomShortcutSet(shortcuts, component)
        },
        onKey: (letter: String, shift: Boolean) -> Unit,
    ) {
        val shortcuts = EmacsTextKey.claimedKeyStrokes(isMac).map { KeyboardShortcut(it, null) }
        if (shortcuts.isEmpty()) return

        val existing = receiverOf(browserComponent)
        if (existing != null) {
            existing.onKey = onKey
            return
        }
        val receiver = Receiver(onKey)
        browserComponent.putClientProperty(RECEIVER_KEY, receiver)
        register(ReportAction(receiver), CustomShortcutSet(*shortcuts.toTypedArray()), browserComponent)
    }

    /** The receiver [install] left on [component], or null when none was installed. */
    internal fun receiverOf(component: JComponent): Receiver? =
        component.getClientProperty(RECEIVER_KEY) as? Receiver

    /**
     * Being found and performed is half of its job: it stands in front of the
     * keymap actions bound to the same keystrokes. The other half is handing
     * the key event to [receiver].
     */
    private class ReportAction(private val receiver: Receiver) : DumbAwareAction() {
        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

        override fun update(e: AnActionEvent) {
            // Always enabled: a disabled component action would let the
            // dispatcher fall through to the keymap action again.
            e.presentation.isEnabled = true
        }

        override fun actionPerformed(e: AnActionEvent) {
            receiver.deliver(e.inputEvent as? KeyEvent)
        }
    }
}
