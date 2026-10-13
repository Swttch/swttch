package com.github.yhk1038.claudecodegui.platform

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.vfs.VirtualFile
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Pins the lookup the tab hosts rely on to open a tab on every IDE line.
 *
 * The call site no longer names `requestOpenFile`, so nothing in the compiler
 * notices if the platform renames it or changes its parameters. This test is
 * what does — it resolves the same method the helper resolves at runtime.
 */
class EditorOpenerTest {

    @Test
    fun `the platform declares requestOpenFile taking one VirtualFile`() {
        val method = EditorOpener.findRequestOpenFile(FileEditorManager::class.java)

        assertNotNull(method)
        assertEquals("requestOpenFile", method!!.name)
        assertEquals(listOf<Class<*>>(VirtualFile::class.java), method.parameterTypes.toList())
    }

    @Test
    fun `a class without the method resolves to null rather than throwing`() {
        // Running on a platform that lacks the method must degrade to "not opened",
        // not crash the caller on the EDT.
        assertNull(EditorOpener.findRequestOpenFile(String::class.java))
    }
}
