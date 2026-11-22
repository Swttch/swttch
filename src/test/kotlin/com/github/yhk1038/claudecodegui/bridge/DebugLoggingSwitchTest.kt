package com.github.yhk1038.claudecodegui.bridge

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.UUID
import java.util.logging.Level
import java.util.logging.Logger

class DebugLoggingSwitchTest {

    // A prefix of its own, so the plugin's real categories and other tests are never touched.
    private val prefix = "#test.debuglogging.${UUID.randomUUID()}"
    private val switch = DebugLoggingSwitch(prefix)

    // Held for the test: a logger nobody references can be collected, and its level with it.
    private val held = mutableListOf<Logger>()

    private fun child(name: String): Logger = Logger.getLogger("$prefix.$name").also { held.add(it) }

    @Test
    fun `is off until turned on`() {
        assertFalse(switch.isEnabled())
    }

    @Test
    fun `turning on makes a logger created afterwards record debug`() {
        switch.setEnabled(true)
        assertTrue(switch.isEnabled())
        assertTrue(child("toolwindow.Later").isLoggable(Level.FINE))
    }

    @Test
    fun `turning on overrides a level a logger already carries`() {
        val existing = child("toolwindow.Existing")
        existing.level = Level.INFO
        assertFalse(existing.isLoggable(Level.FINE))

        switch.setEnabled(true)

        assertTrue(existing.isLoggable(Level.FINE))
    }

    @Test
    fun `turning off stops every logger of the plugin`() {
        val existing = child("toolwindow.Existing")
        switch.setEnabled(true)
        switch.setEnabled(false)

        assertFalse(switch.isEnabled())
        assertFalse(existing.isLoggable(Level.FINE))
        assertFalse(child("toolwindow.Later").isLoggable(Level.FINE))
    }

    // The IDE's Debug Log Settings can turn on a single class; that counts as on.
    @Test
    fun `reads as on when only one class was turned on elsewhere`() {
        child("toolwindow.OnlyThis").level = Level.FINE
        assertTrue(switch.isEnabled())
    }

    @Test
    fun `turning off also clears a level set on one class elsewhere`() {
        val single = child("toolwindow.OnlyThis")
        single.level = Level.FINE
        switch.setEnabled(false)

        assertFalse(single.isLoggable(Level.FINE))
        assertFalse(switch.isEnabled())
    }

    @Test
    fun `does not touch loggers outside its prefix`() {
        val other = Logger.getLogger("#test.debuglogging.unrelated.${UUID.randomUUID()}").also { held.add(it) }
        switch.setEnabled(true)
        assertFalse(other.isLoggable(Level.FINE))
    }
}
