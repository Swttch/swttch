package com.github.yhk1038.claudecodegui.bridge

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/** Unit tests for the pure SET_CLIPBOARD parameter parser. */
class ClipboardParamsTest {

    private fun params(jsonText: String) = Json.parseToJsonElement(jsonText).jsonObject

    @Test
    fun `extracts copied text without changing it`() {
        assertEquals("  copied\ntext  ", parseClipboardText(params("""{"text":"  copied\ntext  "}""")))
    }

    @Test
    fun `rejects missing empty and non-string text`() {
        assertNull(parseClipboardText(params("{}")))
        assertNull(parseClipboardText(params("""{"text":""}""")))
        assertNull(parseClipboardText(params("""{"text":42}""")))
        assertNull(parseClipboardText(params("""{"text":null}""")))
    }

    @Test
    fun `extracts the copied selection as HTML without changing it`() {
        assertEquals(
            "<p>a <strong>b</strong>\n</p>",
            parseClipboardHtml(params("""{"text":"a b","html":"<p>a <strong>b</strong>\n</p>"}""")),
        )
    }

    @Test
    fun `leaves out missing empty and non-string HTML`() {
        assertNull(parseClipboardHtml(params("""{"text":"a"}""")))
        assertNull(parseClipboardHtml(params("""{"text":"a","html":""}""")))
        assertNull(parseClipboardHtml(params("""{"text":"a","html":42}""")))
        assertNull(parseClipboardHtml(params("""{"text":"a","html":null}""")))
    }
}
