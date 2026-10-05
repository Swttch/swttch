package com.github.yhk1038.claudecodegui.editor

import com.intellij.openapi.fileEditor.FileEditorStateLevel
import org.jdom.Element
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Pins the rule that a chat tab behaves like a browser tab: it reflects the
 * address IT is showing, and is unaffected by what any other tab does — including
 * one that happens to show the same file.
 *
 * Splitting duplicates a tab, and from that moment the two are separate tabs. The
 * address therefore has to live per editor. It used to be a single field on the
 * shared [ClaudeCodeVirtualFile], so whichever pane navigated last overwrote it
 * and the untouched pane was left pointing at its neighbour's address — visible
 * as its tab renaming itself even though nothing had happened in it.
 */
class ClaudeCodeEditorStateTest {

    @Test
    fun `each pane round-trips its own address through the layout`() {
        // Two panes of one split, navigated apart. The platform gives each editor
        // its own element, so persisting one must not disturb the other.
        val leftElement = Element("provider")
        val rightElement = Element("provider")

        ClaudeCodeEditorState.writeTo(ClaudeCodeEditorState("/sessions/abc"), leftElement)
        ClaudeCodeEditorState.writeTo(ClaudeCodeEditorState("/sessions/xyz"), rightElement)

        val left = ClaudeCodeEditorState.readFrom(leftElement)
        val right = ClaudeCodeEditorState.readFrom(rightElement)

        assertEquals("/sessions/abc", left.path)
        assertEquals("/sessions/xyz", right.path)
        assertNotEquals(left.path, right.path)
    }

    @Test
    fun `a pane with no recorded address restores as null rather than guessing`() {
        // A tab that never navigated has nothing to restore; the panel then falls
        // back to the file's seed. Inventing a path here would drop a restored pane
        // somewhere the user never was.
        assertNull(ClaudeCodeEditorState.readFrom(Element("provider")).path)

        val blank = Element("provider").apply {
            setAttribute(ClaudeCodeEditorState.PATH_ATTRIBUTE, "   ")
        }
        assertNull(ClaudeCodeEditorState.readFrom(blank).path)
    }

    @Test
    fun `writing a null address leaves no attribute behind`() {
        val element = Element("provider")
        ClaudeCodeEditorState.writeTo(ClaudeCodeEditorState(null), element)
        assertNull(element.getAttributeValue(ClaudeCodeEditorState.PATH_ATTRIBUTE))
    }

    @Test
    fun `the provider declares the readState signature that 2026_3 dispatches to`() {
        // The Lazy overload cannot be marked `override` (we compile against 2024.2,
        // which lacks it), so nothing but this test notices if its signature drifts
        // from FileEditorProvider.readState(Element, Project, kotlin.Lazy) in 263.
        // A drift would silently fall back to "no state" on 2026.3 and later.
        val lazyOverload = ClaudeCodeEditorProvider::class.java.getDeclaredMethod(
            "readState",
            Element::class.java,
            com.intellij.openapi.project.Project::class.java,
            Lazy::class.java,
        )
        assertEquals(com.intellij.openapi.fileEditor.FileEditorState::class.java, lazyOverload.returnType)

        val element = Element("provider")
        ClaudeCodeEditorState.writeTo(ClaudeCodeEditorState("/sessions/abc"), element)
        val restored = ClaudeCodeEditorProvider().readState(
            element,
            fakeProject(),
            lazy<com.intellij.openapi.vfs.VirtualFile?> { error("the file must never be looked up") },
        )
        assertEquals("/sessions/abc", (restored as ClaudeCodeEditorState).path)
    }

    private fun fakeProject(): com.intellij.openapi.project.Project =
        java.lang.reflect.Proxy.newProxyInstance(
            javaClass.classLoader,
            arrayOf(com.intellij.openapi.project.Project::class.java),
        ) { _, _, _ -> null } as com.intellij.openapi.project.Project

    @Test
    fun `two panes on different conversations never merge into one state`() {
        // Merging is for states close enough to count as one navigation step. Two
        // panes showing two conversations are not that — treating them as mergeable
        // is exactly the shared-slot behaviour this replaced.
        val left = ClaudeCodeEditorState("/sessions/abc")
        val right = ClaudeCodeEditorState("/sessions/xyz")

        FileEditorStateLevel.entries.forEach { level ->
            assertFalse(left.canBeMergedWith(right, level), "must not merge at level $level")
            assertFalse(left.canBeMergedWith(left, level), "must not merge even with an equal state at $level")
        }
    }
}
