package com.github.yhk1038.claudecodegui.bridge

import java.awt.HeadlessException
import java.awt.datatransfer.Clipboard
import java.awt.datatransfer.DataFlavor
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Unit tests for [SystemSelectionWriter] with a stand-in clipboard, so no display
 * is needed. What the real X11 selection does with the text was measured on the
 * Linux bench separately: this pins down what is handed to it and when nothing is.
 */
class SystemSelectionWriterTest {

    private fun Clipboard.text(): String =
        getData(DataFlavor.stringFlavor) as String

    @Test
    fun `puts the text into the selection clipboard`() {
        val clipboard = Clipboard("selection")

        val placed = SystemSelectionWriter { clipboard }.write("model")

        assertTrue(placed)
        assertEquals("model", clipboard.text())
    }

    @Test
    fun `keeps whitespace and newlines as they were selected`() {
        val clipboard = Clipboard("selection")

        SystemSelectionWriter { clipboard }.write("  first\n\tsecond  ")

        assertEquals("  first\n\tsecond  ", clipboard.text())
    }

    @Test
    fun `leaves the buffer alone for empty text`() {
        val clipboard = Clipboard("selection")
        val writer = SystemSelectionWriter { clipboard }
        writer.write("kept")

        val placed = writer.write("")

        assertFalse(placed)
        assertEquals("kept", clipboard.text())
    }

    @Test
    fun `does nothing on a platform that has no selection clipboard`() {
        assertFalse(SystemSelectionWriter { null }.write("model"))
    }

    @Test
    fun `does nothing without a display`() {
        assertFalse(SystemSelectionWriter { throw HeadlessException() }.write("model"))
    }

    @Test
    fun `gives up quietly when the platform clipboard cannot be opened`() {
        val refusing = object : Clipboard("refusing") {
            override fun setContents(
                contents: java.awt.datatransfer.Transferable?,
                owner: java.awt.datatransfer.ClipboardOwner?,
            ) {
                throw IllegalStateException("cannot open system clipboard")
            }
        }

        assertFalse(SystemSelectionWriter { refusing }.write("model"))
    }
}
