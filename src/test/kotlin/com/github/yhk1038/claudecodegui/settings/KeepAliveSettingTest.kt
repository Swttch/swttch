package com.github.yhk1038.claudecodegui.settings

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Pure-logic tests for [KeepAliveSetting], the global "Keep backend running"
 * toggle. The logic talks to a [KeepAliveSetting.Store] abstraction
 * (the HostModeCache pattern), so it runs as a plain unit test with an
 * in-memory fake store.
 */
class KeepAliveSettingTest {

    /** In-memory [KeepAliveSetting.Store] standing in for the PropertiesComponent. */
    private class FakeStore(var value: Boolean = false) : KeepAliveSetting.Store {
        override fun read(): Boolean = value
        override fun write(value: Boolean) { this.value = value }
    }

    @Test
    fun `defaults to false (today's lazy-start behaviour)`() {
        assertFalse(KeepAliveSetting.get(FakeStore()))
    }

    @Test
    fun `set true is read back as true`() {
        val store = FakeStore()
        KeepAliveSetting.set(store, true)
        assertTrue(KeepAliveSetting.get(store))
    }

    @Test
    fun `set false after true restores the default regime`() {
        val store = FakeStore(value = true)
        KeepAliveSetting.set(store, false)
        assertFalse(KeepAliveSetting.get(store))
    }
}
