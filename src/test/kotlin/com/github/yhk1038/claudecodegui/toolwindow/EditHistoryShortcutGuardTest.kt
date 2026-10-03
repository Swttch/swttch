package com.github.yhk1038.claudecodegui.toolwindow

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.CustomShortcutSet
import com.intellij.openapi.actionSystem.KeyboardShortcut
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.awt.event.InputEvent
import java.awt.event.KeyEvent
import javax.swing.JComponent
import javax.swing.JPanel

/**
 * Guards [EditHistoryShortcutGuard] (issue #495): the shortcut action is
 * registered once per browser component however many panels wire it, a
 * command is reported through the panel that installed last, and it lives
 * alongside the Emacs guard on the same component.
 */
class EditHistoryShortcutGuardTest {

    private val component = JPanel()

    private class Registration(val action: AnAction, val shortcuts: CustomShortcutSet, val component: JComponent)

    private val registrations = mutableListOf<Registration>()

    private val record: (AnAction, CustomShortcutSet, JComponent) -> Unit = { action, shortcuts, target ->
        registrations.add(Registration(action, shortcuts, target))
    }

    private fun pressed(keyCode: Int, modifiers: Int): KeyEvent =
        KeyEvent(component, KeyEvent.KEY_PRESSED, 0L, modifiers, keyCode, KeyEvent.CHAR_UNDEFINED)

    private fun strokesOf(registration: Registration) =
        registration.shortcuts.shortcuts.map { (it as KeyboardShortcut).firstKeyStroke }.toSet()

    @Test
    fun `registers one action for the claimed keystrokes on the component`() {
        EditHistoryShortcutGuard.install(component, isMac = false, register = record) { }

        val only = registrations.single()
        assertSame(component, only.component)
        assertEquals(EditHistoryKey.claimedKeyStrokes(false).toSet(), strokesOf(only))
    }

    @Test
    fun `a second install on the same component registers nothing and re-points the callback`() {
        val first = mutableListOf<EditHistoryCommand>()
        val second = mutableListOf<EditHistoryCommand>()
        EditHistoryShortcutGuard.install(component, isMac = true, register = record) { first.add(it) }
        EditHistoryShortcutGuard.install(component, isMac = true, register = record) { second.add(it) }

        assertEquals(1, registrations.size, "a re-wired panel must not stack a second action")

        EditHistoryShortcutGuard.receiverOf(component)!!.deliver(pressed(KeyEvent.VK_Z, InputEvent.META_DOWN_MASK))

        assertTrue(first.isEmpty(), "the panel that installed first must no longer be told")
        assertEquals(listOf(EditHistoryCommand.UNDO), second)
    }

    @Test
    fun `separate components get separate registrations`() {
        EditHistoryShortcutGuard.install(component, isMac = false, register = record) { }
        EditHistoryShortcutGuard.install(JPanel(), isMac = false, register = record) { }

        assertEquals(2, registrations.size)
    }

    @Test
    fun `reports undo and redo from the event`() {
        val reported = mutableListOf<EditHistoryCommand>()
        EditHistoryShortcutGuard.install(component, isMac = false, register = record) { reported.add(it) }
        val receiver = EditHistoryShortcutGuard.receiverOf(component)!!
        val ctrl = InputEvent.CTRL_DOWN_MASK

        receiver.deliver(pressed(KeyEvent.VK_Z, ctrl))
        receiver.deliver(pressed(KeyEvent.VK_Z, ctrl or InputEvent.SHIFT_DOWN_MASK))
        receiver.deliver(pressed(KeyEvent.VK_Y, ctrl))

        assertEquals(listOf(EditHistoryCommand.UNDO, EditHistoryCommand.REDO, EditHistoryCommand.REDO), reported)
    }

    @Test
    fun `ignores a null event and an event that names no command`() {
        val reported = mutableListOf<EditHistoryCommand>()
        EditHistoryShortcutGuard.install(component, isMac = true, register = record) { reported.add(it) }
        val receiver = EditHistoryShortcutGuard.receiverOf(component)!!

        receiver.deliver(null)
        receiver.deliver(pressed(KeyEvent.VK_X, InputEvent.META_DOWN_MASK))
        receiver.deliver(pressed(KeyEvent.VK_Y, InputEvent.CTRL_DOWN_MASK))

        assertTrue(reported.isEmpty())
    }

    @Test
    fun `coexists with the Emacs guard on one component without sharing keystrokes`() {
        EmacsTextKeyShortcutGuard.install(component, isMac = true, register = record) { _, _ -> }
        EditHistoryShortcutGuard.install(component, isMac = true, register = record) { }

        assertEquals(2, registrations.size)
        val (emacs, history) = registrations
        assertTrue(strokesOf(emacs).intersect(strokesOf(history)).isEmpty())
        assertEquals(28, strokesOf(emacs).size, "the Emacs guard still claims exactly its own keystrokes")
    }
}
