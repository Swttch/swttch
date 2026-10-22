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
}
