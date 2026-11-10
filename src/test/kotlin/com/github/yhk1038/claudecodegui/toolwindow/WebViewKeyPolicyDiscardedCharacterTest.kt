package com.github.yhk1038.claudecodegui.toolwindow

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Letters Chromium throws away because WebStorm 263 labels them Escape (issue #660).
 *
 * The values below are what CEF reported on a Czech keyboard: the key code of a
 * character event is the low byte of the character.
 */
class WebViewKeyPolicyDiscardedCharacterTest {

    @Test
    fun `e with caron arrives as Escape and is typed by us`() {
        // U+011B, key code 0x1B
        assertEquals(0x011B, WebViewKeyPolicy.discardedCharacter(true, 0x1B, 0x011B))
    }

    @Test
    fun `letters Chromium accepts are left alone`() {
        // s with caron: key code 0x61. c with caron: key code 0x0D.
        assertNull(WebViewKeyPolicy.discardedCharacter(true, 0x61, 0x0161))
        assertNull(WebViewKeyPolicy.discardedCharacter(true, 0x0D, 0x010D))
    }

    @Test
    fun `a real Escape carries no printable character`() {
        assertNull(WebViewKeyPolicy.discardedCharacter(true, 0x1B, 0x1B))
        assertNull(WebViewKeyPolicy.discardedCharacter(true, 0x1B, 0))
    }

    @Test
    fun `only character events are repaired`() {
        assertNull(WebViewKeyPolicy.discardedCharacter(false, 0x1B, 0x011B))
    }
}
