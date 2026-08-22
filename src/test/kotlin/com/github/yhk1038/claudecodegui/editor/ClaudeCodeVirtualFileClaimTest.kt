package com.github.yhk1038.claudecodegui.editor

import com.intellij.openapi.project.Project
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test
import java.lang.reflect.Proxy

/**
 * Pins what happens to a tab the platform revives before any project is open
 * (issue #312).
 *
 * The editor layout is restored while the project is still opening, so the file
 * has to be built with no owner and adopted later. The risk that buys is a
 * second file for the same tab — two labels, two addresses, and a browser
 * component whose parent nobody agrees on. These tests pin the single-instance
 * rule across that hand-over.
 */
class ClaudeCodeVirtualFileClaimTest {

    /**
     * A Project stand-in usable as a map key.
     *
     * The registry only ever uses a Project as a key, so identity is all it
     * needs; equals/hashCode/toString are answered here because a dynamic proxy
     * routes even those through the handler.
     */
    private fun fakeProject(label: String): Project =
        Proxy.newProxyInstance(
            Project::class.java.classLoader,
            arrayOf(Project::class.java),
        ) { proxy, method, args ->
            when (method.name) {
                "hashCode" -> System.identityHashCode(proxy)
                "equals" -> proxy === args?.getOrNull(0)
                "toString" -> label
                else -> throw AssertionError(
                    "the tab registry must use a Project as a key only, but it called " +
                        "Project.${method.name}()",
                )
            }
        } as Project

    @Test
    fun `a project adopts the very file the platform already revived`() {
        val tabId = "claim-test-0001"
        val revived = ClaudeCodeVirtualFile.getOrCreateUnclaimed(tabId)

        val adopted = ClaudeCodeVirtualFile.getOrCreate(fakeProject("p"), tabId)

        assertSame(
            revived,
            adopted,
            "adopting must hand back the restored file, not mint a second one for the same tab",
        )
    }

    @Test
    fun `claim moves the tab under its project, and is repeatable`() {
        val tabId = "claim-test-0002"
        val project = fakeProject("p")
        val revived = ClaudeCodeVirtualFile.getOrCreateUnclaimed(tabId)

        ClaudeCodeVirtualFile.claim(project, tabId)
        // Second call has nothing left to move; it must not wipe the first.
        ClaudeCodeVirtualFile.claim(project, tabId)

        assertSame(revived, ClaudeCodeVirtualFile.findExisting(tabId))
        ClaudeCodeVirtualFile.removeTab(project, tabId)
        assertNull(
            ClaudeCodeVirtualFile.findExisting(tabId),
            "once claimed, closing the tab through its project must drop it",
        )
    }

    @Test
    fun `closing a tab that was never claimed still drops it`() {
        // A tab revived by the layout restore whose panel never mounted has no
        // project map to be removed from; without the unclaimed sweep it would be
        // handed back to every later lookup.
        val tabId = "claim-test-0003"
        ClaudeCodeVirtualFile.getOrCreateUnclaimed(tabId)

        ClaudeCodeVirtualFile.removeTab(fakeProject("p"), tabId)

        assertNull(ClaudeCodeVirtualFile.findExisting(tabId))
    }

    @Test
    fun `seeding fills a revived tab in, and never overwrites what it already has`() {
        val revived = ClaudeCodeVirtualFile("seed-test-0001")
        assertNull(revived.currentPath)

        revived.seedRestoredState("/sessions/abc", "Fix the parser")

        assertEquals("/sessions/abc", revived.currentPath)
        assertEquals("Fix the parser", revived.name)

        // A tab that already knows where it is keeps it: the pane's own restored
        // address (ClaudeCodeEditorState) and a live rename both outrank the seed.
        revived.seedRestoredState("/sessions/stale", "Stale title")

        assertEquals("/sessions/abc", revived.currentPath)
        assertEquals("Fix the parser", revived.name)
    }
}
