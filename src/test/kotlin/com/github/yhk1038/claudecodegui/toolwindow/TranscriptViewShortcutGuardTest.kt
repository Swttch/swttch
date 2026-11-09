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
 * Guards [TranscriptViewShortcutGuard]: the shortcut action claims Ctrl+Alt+I, on every platform and without Shift,
 * is registered once per browser component however many panels wire it, and a press is reported through the
 * panel that installed last.
 */
class TranscriptViewShortcutGuardTest {

    private val component = JPanel()

    private class Registration(val action: AnAction, val shortcuts: CustomShortcutSet, val component: JComponent)

    private val registrations = mutableListOf<Registration>()

    private val record: (AnAction, CustomShortcutSet, JComponent) -> Unit = { action, shortcuts, target ->
        registrations.add(Registration(action, shortcuts, target))
    }

    @Test
    fun `claims Control Alt I and nothing else`() {
        TranscriptViewShortcutGuard.install(component, register = record) { }

        val only = registrations.single()
        assertSame(component, only.component)
        val strokes = only.shortcuts.shortcuts.map { (it as KeyboardShortcut).firstKeyStroke }
        assertEquals(1, strokes.size)
        assertEquals(KeyEvent.VK_I, strokes.single().keyCode)
        assertEquals(InputEvent.CTRL_DOWN_MASK, strokes.single().modifiers and InputEvent.CTRL_DOWN_MASK)
        assertEquals(InputEvent.ALT_DOWN_MASK, strokes.single().modifiers and InputEvent.ALT_DOWN_MASK, "Ctrl+I alone is Chrome's, not ours")
        assertEquals(0, strokes.single().modifiers and InputEvent.SHIFT_DOWN_MASK, "Shift+Ctrl+Alt+I is not the shortcut")
    }

    @Test
    fun `a second install on the same component registers nothing and re-points the callback`() {
        var first = 0
        var second = 0
        TranscriptViewShortcutGuard.install(component, register = record) { first++ }
        TranscriptViewShortcutGuard.install(component, register = record) { second++ }

        assertEquals(1, registrations.size, "a re-wired panel must not stack a second action")

        val receiver = TranscriptViewShortcutGuard.receiverOf(component)!!
        receiver.press()
        receiver.release()

        assertEquals(0, first, "the panel that installed first must no longer be told")
        assertEquals(1, second)
    }

    @Test
    fun `a held key is reported once, when it is released`() {
        var reports = 0
        TranscriptViewShortcutGuard.install(component, register = record) { reports++ }
        val receiver = TranscriptViewShortcutGuard.receiverOf(component)!!

        repeat(30) { receiver.press() }
        assertEquals(0, reports, "a press, and the repeats of a held key, report nothing")

        receiver.release()
        assertEquals(1, reports, "the release reports the hold once")

        receiver.release()
        assertEquals(1, reports, "a release that no press armed reports nothing")

        receiver.press()
        receiver.release()
        assertEquals(2, reports, "the next press and release is a new hold")
    }

    @Test
    fun `separate components get separate registrations`() {
        TranscriptViewShortcutGuard.install(component, register = record) { }
        TranscriptViewShortcutGuard.install(JPanel(), register = record) { }

        assertTrue(registrations.size == 2)
    }
}
