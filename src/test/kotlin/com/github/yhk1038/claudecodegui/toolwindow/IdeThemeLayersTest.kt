package com.github.yhk1038.claudecodegui.toolwindow

import java.awt.Color
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * What the WebView draws buttons, cards and fields with is the step between its layers. IDEA
 * 2026.3's dark theme read the editor, the panel and the text field backgrounds as one color
 * (#191a1c, measured in the running IDE), so every layer collapsed into the base and a button could
 * not be told from the background around it.
 */
class IdeThemeLayersTest {

    private val islandsDark = Color(0x19, 0x1a, 0x1c)

    @Test
    fun `a theme that gives one color for every layer gets three apart`() {
        val layers = IdeThemeLayers.separate(islandsDark, islandsDark, islandsDark)

        assertEquals(islandsDark, layers.base)
        assertFalse(IdeThemeLayers.tooClose(layers.raised, layers.base), "raised must stand out from the base")
        assertFalse(IdeThemeLayers.tooClose(layers.input, layers.base), "input must stand out from the base")
        assertFalse(IdeThemeLayers.tooClose(layers.input, layers.raised), "input must stand out from raised")
    }

    @Test
    fun `on a dark theme the derived layers are lighter than the base, on a light theme darker`() {
        val dark = IdeThemeLayers.separate(islandsDark, islandsDark, islandsDark)
        assertTrue(dark.raised.red > islandsDark.red)
        assertTrue(dark.input.red > dark.raised.red)

        val white = Color(0xff, 0xff, 0xff)
        val light = IdeThemeLayers.separate(white, white, white)
        assertTrue(light.raised.red < white.red)
        assertTrue(light.input.red < light.raised.red)
    }

    @Test
    fun `a theme that already gives distinct layers is left exactly as it is`() {
        // The classic dark theme: editor, panel and field are different colors.
        val editor = Color(0x1e, 0x1f, 0x22)
        val panel = Color(0x2b, 0x2d, 0x30)
        val input = Color(0x31, 0x33, 0x38)

        val layers = IdeThemeLayers.separate(editor, panel, input)

        assertEquals(editor, layers.base)
        assertEquals(panel, layers.raised)
        assertEquals(input, layers.input)
    }

    @Test
    fun `only the layer that collapsed is corrected`() {
        val editor = Color(0x1e, 0x1f, 0x22)
        val panel = Color(0x2b, 0x2d, 0x30)

        val layers = IdeThemeLayers.separate(editor, panel, input = editor)

        assertEquals(panel, layers.raised)
        assertNotEquals(editor, layers.input)
        assertFalse(IdeThemeLayers.tooClose(layers.input, layers.raised))
    }

    @Test
    fun `a focus border equal to the surface it sits on is not used`() {
        val layers = IdeThemeLayers.separate(islandsDark, islandsDark, islandsDark)

        assertFalse(IdeThemeLayers.focusBorderUsable(islandsDark, layers.base, layers.raised, layers.input))
        assertTrue(IdeThemeLayers.focusBorderUsable(Color(0x35, 0x74, 0xf0), layers.base, layers.raised, layers.input))
    }

    @Test
    fun `colors within a few steps of each other count as the same surface`() {
        assertTrue(IdeThemeLayers.tooClose(Color(25, 26, 28), Color(29, 30, 32)))
        assertFalse(IdeThemeLayers.tooClose(Color(25, 26, 28), Color(43, 45, 48)))
    }
}
