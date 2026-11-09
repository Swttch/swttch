package com.github.yhk1038.claudecodegui.toolwindow

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CustomShortcutSet
import com.intellij.openapi.actionSystem.KeyboardShortcut
import com.intellij.openapi.project.DumbAwareAction
import java.awt.event.InputEvent
import java.awt.KeyboardFocusManager
import java.awt.event.KeyEvent
import javax.swing.JComponent
import javax.swing.KeyStroke

/**
 * Reports Ctrl+Alt+I, the keystroke that cycles the chat's Transcript view, while
 * the webview has focus, and keeps the IDE's keymap from running its own action
 * for it.
 *
 * Same mechanism as [EditHistoryShortcutGuard]: the IDE's key dispatcher asks
 * the focused component for its own shortcut actions before it consults the
 * keymap, performs the first enabled one and consumes the key event. The
 * default keymaps bind Ctrl+Alt+I to "Auto-Indent Lines", and under off-screen
 * rendering the page cannot read the key reliably in any case, so the IDE
 * claims it and tells the webview over the bridge. CEF never sees the key.
 *
 * Ctrl and Alt on every platform (Option on macOS), not Command. Ctrl+I alone
 * is no longer used: Chrome takes it before a page sees it, so the standalone
 * browser could not follow it, and the shortcut is the same in both modes.
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

    /** The one keystroke claimed: Ctrl+Alt+I. */
    val keyStroke: KeyStroke = KeyStroke.getKeyStroke(KeyEvent.VK_I, InputEvent.CTRL_DOWN_MASK or InputEvent.ALT_DOWN_MASK)

    /** Client-property key under which a component keeps its [Receiver]. */
    private val RECEIVER_KEY = Any()

    /**
     * Holds the callback of the panel that installed last, and whether the
     * key is being held.
     *
     * The report goes out when the I key is released, once per hold: a held
     * key makes the IDE repeat the press many times a second, and reporting
     * each of them spun the view through every choice. A press only arms the
     * receiver (the repeats find it armed already), and the release delivers.
     */
    internal class Receiver(onPress: () -> Unit) {
        @Volatile
        var onPress: () -> Unit = onPress

        @Volatile
        private var armed = false

        /** The key went down, or is repeating while held. */
        fun press() {
            armed = true
        }

        /** The I key came up: reports the hold, once, if a press armed it. */
        fun release() {
            if (!armed) return
            armed = false
            onPress()
        }
    }

    /**
     * Makes [browserComponent] report Ctrl+Alt+I to [onPress]. The first call
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
        // Modifiers are often let go before the I key, so the release is recognised by the key alone. A listener
        // on the browser component would hear nothing: a key event goes to the component that holds the keyboard
        // focus, which is a child inside the browser component, and does not travel up to its parent. The focus
        // manager's dispatcher sees every key event whichever component holds the focus.
        KeyboardFocusManager.getCurrentKeyboardFocusManager().addKeyEventDispatcher { e ->
            if (e.id == KeyEvent.KEY_RELEASED && e.keyCode == KeyEvent.VK_I) receiver.release()
            false
        }
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
            receiver.press()
        }
    }
}
