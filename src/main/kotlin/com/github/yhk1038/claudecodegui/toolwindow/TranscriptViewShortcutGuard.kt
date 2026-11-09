package com.github.yhk1038.claudecodegui.toolwindow

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CustomShortcutSet
import com.intellij.openapi.actionSystem.KeyboardShortcut
import com.intellij.openapi.project.DumbAwareAction
import java.awt.event.InputEvent
import java.awt.event.KeyEvent
import javax.swing.JComponent
import javax.swing.KeyStroke

/**
 * Reports Ctrl+I, the keystroke that cycles the chat's Transcript view, while
 * the webview has focus, and keeps the IDE's keymap from running its own action
 * for it.
 *
 * Same mechanism as [EditHistoryShortcutGuard]: the IDE's key dispatcher asks
 * the focused component for its own shortcut actions before it consults the
 * keymap, performs the first enabled one and consumes the key event. The
 * default keymaps bind Ctrl+I to "Implement Methods" and to the usages panel's
 * import filter, and under off-screen rendering the page would see the key as
 * Ctrl+A in any case, so the IDE claims it and tells the webview over the
 * bridge. CEF never sees the key.
 *
 * Ctrl on every platform, as in the desktop app: not Command on macOS.
 *
 * ## One registration per browser component
 *
 * The browser component is pooled and outlives the panel that first showed
 * it. [install] is called by every panel that wires the component; it
 * registers the action only on the first call, and every later call only
 * re-points the callback at the calling panel, so a press is reported once,
 * by the panel that owns the component now.
 */
internal object TranscriptViewShortcutGuard {

    /** The one keystroke claimed: Ctrl+I. */
    val keyStroke: KeyStroke = KeyStroke.getKeyStroke(KeyEvent.VK_I, InputEvent.CTRL_DOWN_MASK)

    /** Client-property key under which a component keeps its [Receiver]. */
    private val RECEIVER_KEY = Any()

    /**
     * Holds the callback of the panel that installed last; the registered
     * action reads it at the moment of each key press.
     */
    internal class Receiver(onPress: () -> Unit) {
        @Volatile
        var onPress: () -> Unit = onPress

        fun deliver() = onPress()
    }

    /**
     * Makes [browserComponent] report Ctrl+I to [onPress]. The first call
     * registers the shortcut action; every later call on the same component
     * only replaces the callback.
     *
     * [register] performs the registration; tests replace it to count calls
     * without an action system.
     */
    fun install(
        browserComponent: JComponent,
        register: (AnAction, CustomShortcutSet, JComponent) -> Unit = { action, shortcuts, component ->
            action.registerCustomShortcutSet(shortcuts, component)
        },
        onPress: () -> Unit,
    ) {
        val existing = receiverOf(browserComponent)
        if (existing != null) {
            existing.onPress = onPress
            return
        }
        val receiver = Receiver(onPress)
        browserComponent.putClientProperty(RECEIVER_KEY, receiver)
        register(ReportAction(receiver), CustomShortcutSet(KeyboardShortcut(keyStroke, null)), browserComponent)
    }

    /** The receiver [install] left on [component], or null when none was installed. */
    internal fun receiverOf(component: JComponent): Receiver? =
        component.getClientProperty(RECEIVER_KEY) as? Receiver

    /** Being found and performed stands it in front of the keymap's action; performing it reports the press. */
    private class ReportAction(private val receiver: Receiver) : DumbAwareAction() {
        override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

        override fun update(e: AnActionEvent) {
            // Always enabled: a disabled component action would let the
            // dispatcher fall through to the keymap's own action again.
            e.presentation.isEnabled = true
        }

        override fun actionPerformed(e: AnActionEvent) {
            receiver.deliver()
        }
    }
}
