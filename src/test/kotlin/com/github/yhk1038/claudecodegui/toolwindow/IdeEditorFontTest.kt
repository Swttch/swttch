package com.github.yhk1038.claudecodegui.toolwindow

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class IdeEditorFontTest {

    @Test
    fun `a plain font name is handed over in double quotes`() {
        assertEquals("\"JetBrains Mono\"", IdeEditorFont.cssValueOrNull("JetBrains Mono"))
        assertEquals("\"Google Sans Code\"", IdeEditorFont.cssValueOrNull("  Google Sans Code "))
        assertEquals("\"D2Coding\"", IdeEditorFont.cssValueOrNull("D2Coding"))
    }

    @Test
    fun `a name in another script is kept`() {
        assertEquals("\"나눔고딕코딩\"", IdeEditorFont.cssValueOrNull("나눔고딕코딩"))
    }

    @Test
    fun `no name gives nothing`() {
        assertNull(IdeEditorFont.cssValueOrNull(null))
        assertNull(IdeEditorFont.cssValueOrNull(""))
        assertNull(IdeEditorFont.cssValueOrNull("   "))
    }

    @Test
    fun `an internal system font name that starts with a dot gives nothing`() {
        assertNull(IdeEditorFont.cssValueOrNull(".AppleSystemUIFont"))
    }

    @Test
    fun `the installed families are listed once each, sorted, without the unsafe ones`() {
        val names = arrayOf("menlo", "Arial", "Arial", ".SF NS", "Bad\"Name", "Apple SD Gothic Neo", "  Georgia ")
        assertEquals(listOf("Apple SD Gothic Neo", "Arial", "Georgia", "menlo"), IdeEditorFont.safeFamilies(names))
        assertEquals("[\"Apple SD Gothic Neo\",\"Arial\",\"Georgia\",\"menlo\"]", IdeEditorFont.jsArrayLiteral(names))
        assertEquals("[]", IdeEditorFont.jsArrayLiteral(emptyArray()))
    }

    @Test
    fun `a name that could leave the script text or the CSS value gives nothing`() {
        assertNull(IdeEditorFont.cssValueOrNull("Mono'); alert(1); ('"))
        assertNull(IdeEditorFont.cssValueOrNull("Mono\"; x: y"))
        assertNull(IdeEditorFont.cssValueOrNull("Mono\\"))
        assertNull(IdeEditorFont.cssValueOrNull("Mono\nMono"))
        assertNull(IdeEditorFont.cssValueOrNull("a".repeat(101)))
    }
}
