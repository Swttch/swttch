package com.github.yhk1038.claudecodegui.toolwindow

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.CustomShortcutSet
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.awt.event.InputEvent
import java.awt.event.KeyEvent
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.KeyStroke

/**
 * Guards [EmacsTextKeyShortcutGuard] (issue #506): the shortcut action is
 * registered once per browser component however many panels wire it, a key is
 * reported through the panel that installed last, and the report carries the
 * letter and Shift state of the AWT event the action receives.
 */
class EmacsTextKeyShortcutGuardTest {

    private val component = JPanel()

    private class Registration(val action: AnAction, val shortcuts: CustomShortcutSet, val component: JComponent)

    private val registrations = mutableListOf<Registration>()

    private val record: (AnAction, CustomShortcutSet, JComponent) -> Unit = { action, shortcuts, target ->
        registrations.add(Registration(action, shortcuts, target))
    }

    private fun pressed(keyCode: Int, keyChar: Char, modifiers: Int): KeyEvent =
        KeyEvent(component, KeyEvent.KEY_PRESSED, 0L, modifiers, keyCode, keyChar)

    private val ctrl = InputEvent.CTRL_DOWN_MASK
    private val shift = InputEvent.SHIFT_DOWN_MASK

    @Test
    fun `registers one action for all 28 claimed keystrokes on the component`() {
        EmacsTextKeyShortcutGuard.install(component, isMac = true, register = record) { _, _ -> }

        assertEquals(1, registrations.size)
        val only = registrations.single()
        assertSame(component, only.component)
        val strokes = only.shortcuts.shortcuts.map { (it as com.intellij.openapi.actionSystem.KeyboardShortcut).firstKeyStroke }
        assertEquals(EmacsTextKey.claimedKeyStrokes(true).toSet(), strokes.toSet())
        assertEquals(28, strokes.size)
    }

    @Test
    fun `a second install on the same component registers nothing and re-points the callback`() {
        val first = mutableListOf<String>()
        val second = mutableListOf<String>()
        EmacsTextKeyShortcutGuard.install(component, isMac = true, register = record) { letter, _ -> first.add(letter) }
        EmacsTextKeyShortcutGuard.install(component, isMac = true, register = record) { letter, _ -> second.add(letter) }

        assertEquals(1, registrations.size, "a re-wired panel must not stack a second action")

        EmacsTextKeyShortcutGuard.receiverOf(component)!!.deliver(pressed(KeyEvent.VK_F, 6.toChar(), ctrl))

        assertTrue(first.isEmpty(), "the panel that installed first must no longer be told")
        assertEquals(listOf("f"), second, "the key is reported once, by the panel that installed last")
    }

    @Test
    fun `separate components get separate registrations`() {
        val other = JPanel()
        EmacsTextKeyShortcutGuard.install(component, isMac = true, register = record) { _, _ -> }
        EmacsTextKeyShortcutGuard.install(other, isMac = true, register = record) { _, _ -> }

        assertEquals(2, registrations.size)
    }

    @Test
    fun `installs nothing off macOS`() {
        EmacsTextKeyShortcutGuard.install(component, isMac = false, register = record) { _, _ -> }

        assertTrue(registrations.isEmpty())
        assertNull(EmacsTextKeyShortcutGuard.receiverOf(component))
    }

    @Test
    fun `reports the letter and the Shift state of the event`() {
        val reported = mutableListOf<Pair<String, Boolean>>()
        EmacsTextKeyShortcutGuard.install(component, isMac = true, register = record) { letter, s -> reported.add(letter to s) }
        val receiver = EmacsTextKeyShortcutGuard.receiverOf(component)!!

        receiver.deliver(pressed(KeyEvent.VK_B, 2.toChar(), ctrl))
        receiver.deliver(pressed(KeyEvent.VK_E, 5.toChar(), ctrl or shift))
        receiver.deliver(pressed(KeyEvent.VK_UNDEFINED, 11.toChar(), ctrl))

        assertEquals(listOf("b" to false, "e" to true, "k" to false), reported)
    }

    @Test
    fun `ignores an event that names none of the fourteen letters`() {
        val reported = mutableListOf<String>()
        EmacsTextKeyShortcutGuard.install(component, isMac = true, register = record) { letter, _ -> reported.add(letter) }
        val receiver = EmacsTextKeyShortcutGuard.receiverOf(component)!!

        receiver.deliver(null)
        receiver.deliver(pressed(KeyEvent.VK_C, 3.toChar(), ctrl))
        receiver.deliver(pressed(KeyEvent.VK_UNDEFINED, KeyEvent.CHAR_UNDEFINED, ctrl))

        assertTrue(reported.isEmpty())
    }

    @Test
    fun `the registered keystrokes are the ones an AWT Ctrl+letter event produces`() {
        EmacsTextKeyShortcutGuard.install(component, isMac = true, register = record) { _, _ -> }
        val strokes = registrations.single().shortcuts.shortcuts
            .map { (it as com.intellij.openapi.actionSystem.KeyboardShortcut).firstKeyStroke }
            .toSet()

        assertTrue(KeyStroke.getKeyStrokeForEvent(pressed(KeyEvent.VK_T, 20.toChar(), ctrl)) in strokes)
        assertTrue(KeyStroke.getKeyStrokeForEvent(pressed(KeyEvent.VK_V, 22.toChar(), ctrl or shift)) in strokes)
    }
}
