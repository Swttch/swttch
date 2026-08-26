package com.github.yhk1038.claudecodegui.services

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

class EditorTabStateServiceTest {

    private lateinit var service: EditorTabStateService

    @BeforeEach
    fun setup() {
        service = EditorTabStateService()
    }

    @Test
    fun `addTab should register tab and mark it active`() {
        service.addTab("tab-1")
        assertEquals(listOf("tab-1"), service.getOpenTabIds())
        assertEquals("tab-1", service.getActiveTabId())
    }

    @Test
    fun `addTab should not duplicate existing tab but still activate it`() {
        service.addTab("tab-1")
        service.addTab("tab-2")
        service.addTab("tab-1")
        assertEquals(listOf("tab-1", "tab-2"), service.getOpenTabIds())
        assertEquals("tab-1", service.getActiveTabId())
    }

    @Test
    fun `removeTab should drop tab and reselect last remaining as active`() {
        service.addTab("tab-1")
        service.addTab("tab-2")
        service.removeTab("tab-2")
        assertEquals(listOf("tab-1"), service.getOpenTabIds())
        assertEquals("tab-1", service.getActiveTabId())
    }

    @Test
    fun `updatePath should store current path for a tab`() {
        service.addTab("tab-1")
        service.updatePath("tab-1", "/sessions/abc/conversations/xyz")
        assertEquals("/sessions/abc/conversations/xyz", service.getPath("tab-1"))
    }

    @Test
    fun `getPath should return null for a tab without a stored path`() {
        service.addTab("tab-1")
        assertNull(service.getPath("tab-1"))
    }

    @Test
    fun `updatePath should overwrite a previously stored path`() {
        service.updatePath("tab-1", "/sessions/new")
        service.updatePath("tab-1", "/sessions/session-1")
        assertEquals("/sessions/session-1", service.getPath("tab-1"))
    }

    @Test
    fun `removeTab should also discard the stored path`() {
        service.addTab("tab-1")
        service.updatePath("tab-1", "/sessions/session-1")
        service.removeTab("tab-1")
        assertNull(service.getPath("tab-1"))
    }

    @Test
    fun `getRestorePath should prefer the stored path`() {
        service.addTab("tab-1")
        service.updatePath("tab-1", "/sessions/session-1/conversations/c1")
        assertEquals("/sessions/session-1/conversations/c1", service.getRestorePath("tab-1"))
    }

    @Test
    fun `getRestorePath should fall back to the tab page when no path stored`() {
        service.addTab("tab-1")
        assertEquals("/sessions/tab-1", service.getRestorePath("tab-1"))
    }

    // --- Manually named tabs (issue #301) ---------------------------------
    //
    // The point of the feature is not that a name can be stored, it is that a
    // stored name outranks every conversation title that arrives afterwards.
    // These pin that ranking down, since it is the part a later refactor could
    // silently undo while every other test still passed.

    @Test
    fun `getEffectiveTitle should fall back to the conversation title when unnamed`() {
        service.updateTitle("tab-1", "Fix the parser")
        assertEquals("Fix the parser", service.getEffectiveTitle("tab-1"))
        assertFalse(service.hasCustomTitle("tab-1"))
    }

    @Test
    fun `getEffectiveTitle should prefer the user's name over the conversation title`() {
        service.updateTitle("tab-1", "Fix the parser")
        service.setCustomTitle("tab-1", "Backend")
        assertEquals("Backend", service.getEffectiveTitle("tab-1"))
        assertTrue(service.hasCustomTitle("tab-1"))
    }

    @Test
    fun `a named tab should keep its name when the conversation reports a new title`() {
        service.setCustomTitle("tab-1", "Backend")
        service.updateTitle("tab-1", "Fix the parser")
        service.updateTitle("tab-1", "Refactor the router")
        assertEquals("Backend", service.getEffectiveTitle("tab-1"))
    }

    @Test
    fun `clearing the name should return the tab to the latest conversation title`() {
        service.setCustomTitle("tab-1", "Backend")
        service.updateTitle("tab-1", "Refactor the router")

        service.setCustomTitle("tab-1", "")

        assertFalse(service.hasCustomTitle("tab-1"))
        assertEquals("Refactor the router", service.getEffectiveTitle("tab-1"))
    }

    @Test
    fun `a blank name should clear rather than store an empty label`() {
        service.setCustomTitle("tab-1", "Backend")
        service.setCustomTitle("tab-1", "   ")
        assertNull(service.getCustomTitle("tab-1"))
    }

    @Test
    fun `a name should be stored trimmed`() {
        service.setCustomTitle("tab-1", "  Backend  ")
        assertEquals("Backend", service.getCustomTitle("tab-1"))
    }

    @Test
    fun `getEffectiveTitle should be null for a tab with neither name nor title`() {
        assertNull(service.getEffectiveTitle("tab-1"))
    }

    @Test
    fun `removeTab should also discard the user's name`() {
        service.addTab("tab-1")
        service.setCustomTitle("tab-1", "Backend")
        service.removeTab("tab-1")
        assertNull(service.getCustomTitle("tab-1"))
    }

    // --- Names belong to conversations, not to tabs ------------------------
    //
    // A tab is a window onto a conversation, so switching it to another one must
    // show that one's name. These pin the key the name is filed under, which is
    // the whole of the behaviour and is invisible from the outside until a tab
    // actually moves.

    @Test
    fun `switching to another conversation should show that conversation's name`() {
        service.updatePath("tab-1", "/sessions/session-a")
        service.setCustomTitle("tab-1", "Backend")

        service.updatePath("tab-1", "/sessions/session-b")

        assertNull(service.getCustomTitle("tab-1"))
        assertFalse(service.hasCustomTitle("tab-1"))
    }

    @Test
    fun `returning to a named conversation should bring its name back`() {
        service.updatePath("tab-1", "/sessions/session-a")
        service.setCustomTitle("tab-1", "Backend")
        service.updatePath("tab-1", "/sessions/session-b")

        service.updatePath("tab-1", "/sessions/session-a")

        assertEquals("Backend", service.getCustomTitle("tab-1"))
    }

    @Test
    fun `a name should follow its conversation into another tab`() {
        service.updatePath("tab-1", "/sessions/session-a")
        service.setCustomTitle("tab-1", "Backend")

        service.updatePath("tab-2", "/sessions/session-a")

        assertEquals("Backend", service.getCustomTitle("tab-2"))
    }

    @Test
    fun `naming an empty tab then starting a conversation should carry the name over`() {
        service.updatePath("tab-1", "/sessions/new")
        service.setCustomTitle("tab-1", "Backend")

        // Sending the first message routes the tab to the conversation it just
        // created — the one the name was meant for.
        service.updatePath("tab-1", "/sessions/session-a")

        assertEquals("Backend", service.getCustomTitle("tab-1"))
    }

    @Test
    fun `a name carried onto a conversation should stay with it, not with the tab`() {
        service.updatePath("tab-1", "/sessions/new")
        service.setCustomTitle("tab-1", "Backend")
        service.updatePath("tab-1", "/sessions/session-a")

        // Resetting the tab leaves the conversation, so its name is left behind.
        service.updatePath("tab-1", "/sessions/new")

        assertNull(service.getCustomTitle("tab-1"))
    }

    @Test
    fun `carrying a name over should not overwrite one the conversation already has`() {
        service.updatePath("tab-2", "/sessions/session-a")
        service.setCustomTitle("tab-2", "Already named")

        service.updatePath("tab-1", "/sessions/new")
        service.setCustomTitle("tab-1", "Latecomer")
        service.updatePath("tab-1", "/sessions/session-a")

        assertEquals("Already named", service.getCustomTitle("tab-1"))
    }

    @Test
    fun `resetting to a new conversation should drop the previous one's name`() {
        service.updatePath("tab-1", "/sessions/session-a")
        service.setCustomTitle("tab-1", "Backend")

        service.updatePath("tab-1", "/sessions/new")

        assertNull(service.getCustomTitle("tab-1"))
    }

    @Test
    fun `closing a tab should keep the name of the conversation it was showing`() {
        service.addTab("tab-1")
        service.updatePath("tab-1", "/sessions/session-a")
        service.setCustomTitle("tab-1", "Backend")

        service.removeTab("tab-1")

        service.updatePath("tab-2", "/sessions/session-a")
        assertEquals("Backend", service.getCustomTitle("tab-2"))
    }

    @Test
    fun `a path with trailing segments and a query should still identify the conversation`() {
        service.updatePath("tab-1", "/sessions/session-a/conversations/c1?foo=1")
        service.setCustomTitle("tab-1", "Backend")

        service.updatePath("tab-2", "/sessions/session-a")

        assertEquals("Backend", service.getCustomTitle("tab-2"))
    }

    @Test
    fun `a name should survive a persist-reload round trip`() {
        service.addTab("tab-1")
        service.updateTitle("tab-1", "Fix the parser")
        service.setCustomTitle("tab-1", "Backend")

        val reloaded = EditorTabStateService()
        reloaded.loadState(service.state)

        assertEquals("Backend", reloaded.getEffectiveTitle("tab-1"))
        assertTrue(reloaded.hasCustomTitle("tab-1"))
    }

    @Test
    fun `state should survive a persist-reload round trip including paths`() {
        service.addTab("tab-1")
        service.addTab("tab-2")
        service.updatePath("tab-1", "/sessions/session-1")
        service.updatePath("tab-2", "/sessions/session-2/conversations/c2")

        // Simulate IDE shutdown -> restart: serialize then reload into a fresh service.
        val persisted = service.state
        val reloaded = EditorTabStateService()
        reloaded.loadState(persisted)

        assertEquals(listOf("tab-1", "tab-2"), reloaded.getOpenTabIds())
        assertEquals("tab-2", reloaded.getActiveTabId())
        assertEquals("/sessions/session-1", reloaded.getPath("tab-1"))
        assertEquals("/sessions/session-2/conversations/c2", reloaded.getPath("tab-2"))
    }
}
