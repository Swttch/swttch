package com.github.yhk1038.claudecodegui.services

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * A split editor tab is one panel id shown by two panels. Closing either of them must leave the
 * other registered with the backend (#753).
 */
class PanelRegistryTest {

    private val registry = PanelRegistry<Any>()
    private val older = Any()
    private val newer = Any()

    @Test
    fun `closing the newer view leaves the older one registered`() {
        registry.register("tab", older)
        registry.register("tab", newer)

        registry.release("tab", newer)

        assertSameValue(older, registry["tab"])
        assertTrue(registry.isNotEmpty())
    }

    @Test
    fun `closing the older view leaves the newer one registered`() {
        registry.register("tab", older)
        registry.register("tab", newer)

        registry.release("tab", older)

        assertSameValue(newer, registry["tab"])
    }

    @Test
    fun `the tab is forgotten once its last view closes`() {
        registry.register("tab", older)
        registry.register("tab", newer)

        registry.release("tab", older)
        registry.release("tab", newer)

        assertNull(registry["tab"])
        assertNull(registry.any())
        assertFalse(registry.isNotEmpty())
    }

    @Test
    fun `two views of one tab count as one tab and both hear what is sent to all`() {
        registry.register("tab", older)
        registry.register("tab", newer)

        assertEquals(1, registry.size)
        assertEquals(listOf(older, newer), registry.all())
    }

    @Test
    fun `releasing something that was never registered changes nothing`() {
        registry.register("tab", older)

        registry.release("tab", newer)
        registry.release("other", older)

        assertSameValue(older, registry["tab"])
    }

    @Test
    fun `registering the same value again does not need releasing twice`() {
        registry.register("tab", older)
        registry.register("tab", older)

        registry.release("tab", older)

        assertNull(registry["tab"])
    }

    private fun assertSameValue(expected: Any, actual: Any?) =
        org.junit.jupiter.api.Assertions.assertSame(expected, actual)
}
