package com.github.yhk1038.claudecodegui.platform

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

/**
 * The identifier pulled out here is what a click on the desktop banner raises,
 * so reading the wrong key (or the right key of the wrong entry) would silently
 * bring a different app forward.
 */
class HostAppBundleIdTest {

    /** An Info.plist shaped like the one shipped inside a JetBrains IDE bundle. */
    private fun plist(vararg keyValues: Pair<String, String>): String = buildString {
        appendLine("""<?xml version="1.0" encoding="UTF-8"?>""")
        appendLine("<plist version=\"1.0\">")
        appendLine("<dict>")
        keyValues.forEach { (key, value) ->
            appendLine("    <key>$key</key>")
            appendLine("    <string>$value</string>")
        }
        appendLine("</dict>")
        appendLine("</plist>")
    }

    @Test
    fun `reads CFBundleIdentifier out of a bundle Info plist`() {
        val xml = plist(
            "CFBundleName" to "WebStorm",
            "CFBundleIdentifier" to "com.jetbrains.WebStorm",
            "CFBundleVersion" to "WS-243.12345",
        )
        assertEquals("com.jetbrains.WebStorm", HostAppBundleId.parse(xml))
    }

    @Test
    fun `picks the identifier and not a neighbouring string`() {
        // CFBundleExecutable sits immediately before the identifier in a real
        // IDE plist, so a regex anchored on the wrong element would return it.
        val xml = plist(
            "CFBundleExecutable" to "idea",
            "CFBundleIdentifier" to "com.jetbrains.intellij.ce",
        )
        assertEquals("com.jetbrains.intellij.ce", HostAppBundleId.parse(xml))
    }

    @Test
    fun `tolerates the key and value sitting on one line`() {
        val xml = "<dict><key>CFBundleIdentifier</key><string>com.jetbrains.rubymine</string></dict>"
        assertEquals("com.jetbrains.rubymine", HostAppBundleId.parse(xml))
    }

    @Test
    fun `returns null when the key is absent`() {
        assertNull(HostAppBundleId.parse(plist("CFBundleName" to "DataGrip")))
    }

    @Test
    fun `returns null for an empty identifier rather than an empty string`() {
        // An empty value would reach the notifier as `-activate ""`, which is
        // worse than no click target at all.
        assertNull(HostAppBundleId.parse(plist("CFBundleIdentifier" to "")))
    }
}
