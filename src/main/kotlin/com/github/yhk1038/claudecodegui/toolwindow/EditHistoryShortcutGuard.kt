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
 * Reports the Undo/Redo keystrokes pressed while the webview has focus, and
 * keeps the IDE's keymap from running its own Undo/Redo for them (issue #495).
 *
 * Same mechanism as [EmacsTextKeyShortcutGuard]: the IDE's key dispatcher asks
 * the focused component for its own shortcut actions before it consults the
 * keymap, performs the first enabled one and consumes the key event. The
 * action registered here for [EditHistoryKey.claimedKeyStrokes] therefore
 * stands in front of the keymap's Undo/Redo, which used to offer to undo a
 * file move made elsewhere in the IDE, and it reports the command so the
 * webview can apply it to the focused text field. CEF never sees the key.
 *
 * ## One registration per browser component
 *
 * The browser component is pooled and outlives the panel that first showed
 * it. [install] is called by every panel that wires the component; it
 * registers the action only on the first call, and every later call only
 * re-points the callback at the calling panel, so a command is reported once,
 * by the panel that owns the component now.
 */
internal object EditHistoryShortcutGuard {

    /** Client-property key under which a component keeps its [Receiver]. */
    private val RECEIVER_KEY = Any()

    /**
     * Turns the AWT event of a performed shortcut into a command. Holds the
     * callback of the panel that installed last; the registered action reads
     * it at the moment of each key press.
     */
    internal class Receiver(private val isMac: Boolean, onCommand: (EditHistoryCommand) -> Unit) {
        @Volatile
        var onCommand: (EditHistoryCommand) -> Unit = onCommand

        /** Reports [event] when it names a command; ignores anything else. */
        fun deliver(event: KeyEvent?) {
            if (event == null) return
            val command = EditHistoryKey.commandOf(event.keyCode, event.isShiftDown, isMac) ?: return
            onCommand(command)
        }
    }

    /**
     * Makes [browserComponent] report the claimed keystrokes to [onCommand].
     * The first call registers the shortcut action; every later call on the
     * same component only replaces the callback.
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
        onCommand: (EditHistoryCommand) -> Unit,
    ) {
        val existing = receiverOf(browserComponent)
        if (existing != null) {
            existing.onCommand = onCommand
            return
        }
        val shortcuts = EditHistoryKey.claimedKeyStrokes(isMac).map { KeyboardShortcut(it, null) }
        val receiver = Receiver(isMac, onCommand)
        browserComponent.putClientProperty(RECEIVER_KEY, receiver)
        register(ReportAction(receiver), CustomShortcutSet(*shortcuts.toTypedArray()), browserComponent)
    }

    /** The receiver [install] left on [component], or null when none was installed. */
    internal fun receiverOf(component: JComponent): Receiver? =
        component.getClientProperty(RECEIVER_KEY) as? Receiver

    /**
     * Being found and performed stands it in front of the keymap's Undo/Redo;
     * performing it hands the key event to [receiver].
     */
    private class ReportAction(private val receiver: Receiver) : DumbAwareAction() {
        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

        override fun update(e: AnActionEvent) {
            // Always enabled: a disabled component action would let the
            // dispatcher fall through to the keymap's Undo/Redo again.
            e.presentation.isEnabled = true
        }

        override fun actionPerformed(e: AnActionEvent) {
            receiver.deliver(e.inputEvent as? KeyEvent)
        }
    }
}
