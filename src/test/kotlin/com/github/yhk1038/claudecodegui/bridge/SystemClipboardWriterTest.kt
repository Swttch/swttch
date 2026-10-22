package com.github.yhk1038.claudecodegui.bridge

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SystemClipboardWriterTest {

    @Test
    fun `hands copied text to the IDE clipboard`() {
        var copied = ""

        val placed = SystemClipboardWriter { copied = it }.write("copied from chat")

        assertTrue(placed)
        assertEquals("copied from chat", copied)
    }

    @Test
    fun `keeps whitespace and newlines untouched`() {
        var copied = ""

        SystemClipboardWriter { copied = it }.write("  first\n\tsecond  ")

        assertEquals("  first\n\tsecond  ", copied)
    }

    @Test
    fun `does not clear the clipboard for empty text`() {
        var calls = 0

        val placed = SystemClipboardWriter { calls++ }.write("")

        assertFalse(placed)
        assertEquals(0, calls)
    }

    @Test
    fun `swallows a clipboard failure`() {
        val placed = SystemClipboardWriter { throw IllegalStateException("clipboard unavailable") }.write("copied")

        assertFalse(placed)
    }
}
