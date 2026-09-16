package com.github.yhk1038.claudecodegui.settings

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class PathSettingValueTest {

    @Test
    fun `drops the trailing space that makes spawn fail with ENOENT`() {
        assertEquals(
            JsonPrimitive("/home/deth/.local/bin/claude"),
            pathSettingValue("/home/deth/.local/bin/claude ")
        )
    }

    @Test
    fun `drops leading whitespace a paste can carry`() {
        assertEquals(JsonPrimitive("/usr/bin/claude"), pathSettingValue("  /usr/bin/claude"))
    }

    @Test
    fun `stores an empty field as null so auto-detection takes over`() {
        assertEquals(JsonNull, pathSettingValue(""))
    }

    @Test
    fun `stores a whitespace-only field as null rather than a blank string`() {
        // A blank string is truthy on the reading side and would be spawned verbatim.
        assertEquals(JsonNull, pathSettingValue("   "))
    }

    @Test
    fun `leaves a path with inner spaces intact`() {
        assertEquals(
            JsonPrimitive("/Applications/My Tools/claude"),
            pathSettingValue(" /Applications/My Tools/claude ")
        )
    }
}
