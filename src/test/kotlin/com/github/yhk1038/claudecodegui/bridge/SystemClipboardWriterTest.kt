package com.github.yhk1038.claudecodegui.bridge

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.awt.datatransfer.DataFlavor
import java.awt.datatransfer.Transferable

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
    fun `puts the text and the HTML on the clipboard together so formatting survives a paste`() {
        var rich: Transferable? = null
        var plainCalls = 0

        val placed = SystemClipboardWriter(setRichContents = { rich = it }, setContents = { plainCalls++ })
            .write("bold text", "<strong>bold</strong> text")

        assertTrue(placed)
        assertEquals(0, plainCalls)
        val contents = rich!!
        assertEquals("<strong>bold</strong> text", contents.getTransferData(DataFlavor.allHtmlFlavor))
        assertEquals("bold text", contents.getTransferData(DataFlavor.stringFlavor))
    }

    @Test
    fun `writes plain text alone when there is no HTML`() {
        var copied = ""
        var richCalls = 0

        SystemClipboardWriter(setRichContents = { richCalls++ }, setContents = { copied = it }).write("plain", null)
        SystemClipboardWriter(setRichContents = { richCalls++ }, setContents = { copied = it }).write("plain", "")

        assertEquals("plain", copied)
        assertEquals(0, richCalls)
    }

    @Test
    fun `swallows a clipboard failure`() {
        val placed = SystemClipboardWriter { throw IllegalStateException("clipboard unavailable") }.write("copied")

        assertFalse(placed)
    }
}
