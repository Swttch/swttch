package com.github.yhk1038.claudecodegui.bridge

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Unit tests for [parsePrimarySelectionText], the pure param parsing used by the
 * SET_PRIMARY_SELECTION handler. Reports with nothing to place must come out as
 * null so the buffer the user can still paste from is left alone (#513).
 */
class PrimarySelectionParamsTest {

    private fun params(jsonText: String) = Json.parseToJsonElement(jsonText).jsonObject

    @Test
    fun `extracts the selected text`() {
        assertEquals("model", parsePrimarySelectionText(params("""{"text":"model","workingDir":"/p"}""")))
    }

    @Test
    fun `keeps whitespace and newlines untouched`() {
        assertEquals(
            "  first\n\tsecond  ",
            parsePrimarySelectionText(params("""{"text":"  first\n\tsecond  "}""")),
        )
    }

    @Test
    fun `is null when the text is missing`() {
        assertNull(parsePrimarySelectionText(params("{}")))
    }

    @Test
    fun `is null for empty text`() {
        assertNull(parsePrimarySelectionText(params("""{"text":""}""")))
    }

    @Test
    fun `is null when the text is not a string`() {
        assertNull(parsePrimarySelectionText(params("""{"text":42}""")))
        assertNull(parsePrimarySelectionText(params("""{"text":null}""")))
        assertNull(parsePrimarySelectionText(params("""{"text":["a"]}""")))
    }
}
