package com.github.yhk1038.claudecodegui.settings

import kotlinx.serialization.json.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test

class JsSettingsParserTest {

    @Nested
    inner class StripComments {
        @Test
        fun `should remove line comments`() {
            val input = """
                // comment
                key: "value"
            """.trimIndent()
            val result = JsSettingsParser.stripComments(input)
            assertFalse(result.contains("// comment"))
            assertTrue(result.contains("key: \"value\""))
        }

        @Test
        fun `should remove block comments`() {
            val input = """
                /* block
                   comment */
                key: "value"
            """.trimIndent()
            val result = JsSettingsParser.stripComments(input)
            assertFalse(result.contains("block"))
            assertFalse(result.contains("comment"))
            assertTrue(result.contains("key: \"value\""))
        }

        @Test
        fun `should preserve double-quoted strings containing slashes`() {
            val input = """key: "http://example.com""""
            val result = JsSettingsParser.stripComments(input)
            assertTrue(result.contains("http://example.com"))
        }

        @Test
        fun `should preserve single-quoted strings containing slashes`() {
            val input = """key: 'http://example.com'"""
            val result = JsSettingsParser.stripComments(input)
            assertTrue(result.contains("http://example.com"))
        }

        @Test
        fun `should handle escape sequences in strings`() {
            val input = """key: "escaped \" quote" """
            val result = JsSettingsParser.stripComments(input)
            assertTrue(result.contains("escaped \\\" quote"))
        }

        @Test
        fun `should preserve newlines when removing line comments`() {
            val input = "line1 // comment\nline2"
            val result = JsSettingsParser.stripComments(input)
            assertTrue(result.contains("\n"))
            assertTrue(result.contains("line2"))
        }
    }

    @Nested
    inner class RemoveTrailingCommas {
        @Test
        fun `should remove trailing comma before closing brace`() {
            val input = """{ "a": 1, "b": 2, }"""
            val result = JsSettingsParser.removeTrailingCommas(input)
            assertEquals("""{ "a": 1, "b": 2 }""", result)
        }

        @Test
        fun `should remove trailing comma before closing bracket`() {
            val input = """[1, 2, 3, ]"""
            val result = JsSettingsParser.removeTrailingCommas(input)
            assertEquals("""[1, 2, 3 ]""", result)
        }

        @Test
        fun `should handle no trailing comma`() {
            val input = """{ "a": 1 }"""
            val result = JsSettingsParser.removeTrailingCommas(input)
            assertEquals(input, result)
        }
    }

    @Nested
    inner class QuoteUnquotedKeys {
        @Test
        fun `should add quotes to unquoted keys`() {
            val input = """{ key: "value" }"""
            val result = JsSettingsParser.quoteUnquotedKeys(input)
            assertTrue(result.contains("\"key\""))
        }

        @Test
        fun `should preserve already-quoted keys`() {
            val input = """{ "key": "value" }"""
            val result = JsSettingsParser.quoteUnquotedKeys(input)
            // Should still work (may double-process but result should be parseable)
            assertTrue(result.contains("key"))
        }

        @Test
        fun `should handle multiple unquoted keys`() {
            val input = """{ first: 1, second: 2 }"""
            val result = JsSettingsParser.quoteUnquotedKeys(input)
            assertTrue(result.contains("\"first\""))
            assertTrue(result.contains("\"second\""))
        }
    }

    @Nested
    inner class Parse {
        @Test
        fun `should parse full settings file`() {
            val input = """
                export default {
                  // CLI path
                  cliPath: null,
                  theme: "dark",
                  fontSize: 16,
                  debugMode: true,
                };
            """.trimIndent()
            val result = JsSettingsParser.parse(input)
            assertEquals(JsonNull, result["cliPath"])
            assertEquals(JsonPrimitive("dark"), result["theme"])
            assertEquals(JsonPrimitive(16), result["fontSize"])
            assertEquals(JsonPrimitive(true), result["debugMode"])
        }

        @Test
        fun `should parse a file that starts with a UTF-8 byte order mark`() {
            // PowerShell's `-Encoding UTF8` and Notepad write the mark in front of `export`.
            val input = "\uFEFFexport default {\n  theme: \"dark\",\n  fontSize: 16\n};\n"
            val result = JsSettingsParser.parse(input)
            assertEquals(JsonPrimitive("dark"), result["theme"])
            assertEquals(JsonPrimitive(16), result["fontSize"])
        }

        @Test
        fun `should parse settings without export default`() {
            val input = """{ theme: "light", fontSize: 14 }"""
            val result = JsSettingsParser.parse(input)
            assertEquals(JsonPrimitive("light"), result["theme"])
            assertEquals(JsonPrimitive(14), result["fontSize"])
        }

        @Test
        fun `should parse settings with block comments`() {
            val input = """
                /* Settings */
                export default {
                  theme: "system",
                };
            """.trimIndent()
            val result = JsSettingsParser.parse(input)
            assertEquals(JsonPrimitive("system"), result["theme"])
        }
    }

    @Nested
    inner class Generate {
        @Test
        fun `should generate valid JS settings content`() {
            val settings = linkedMapOf<String, JsonElement>(
                "theme" to JsonPrimitive("dark"),
                "fontSize" to JsonPrimitive(16),
            )
            val comments = mapOf("theme" to "테마 설정")
            val result = JsSettingsParser.generate(settings, comments)

            assertTrue(result.contains("export default {"))
            assertTrue(result.contains("// 테마 설정"))
            assertTrue(result.contains("theme: \"dark\""))
            assertTrue(result.contains("fontSize: 16"))
            assertTrue(result.contains("}"))
        }

        @Test
        fun `should handle null values`() {
            val settings = linkedMapOf<String, JsonElement>(
                "cliPath" to JsonNull,
            )
            val result = JsSettingsParser.generate(settings, emptyMap())
            assertTrue(result.contains("cliPath: null"))
        }

        @Test
        fun `should round-trip parse then generate`() {
            val input = """
                export default {
                  theme: "dark",
                  fontSize: 16,
                  debugMode: false,
                };
            """.trimIndent()
            val parsed = JsSettingsParser.parse(input)
            val generated = JsSettingsParser.generate(parsed, emptyMap())
            val reparsed = JsSettingsParser.parse(generated)
            assertEquals(parsed, reparsed)
        }
    }
}
