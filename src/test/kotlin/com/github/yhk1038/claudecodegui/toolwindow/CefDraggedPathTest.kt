package com.github.yhk1038.claudecodegui.toolwindow

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.io.File

class CefDraggedPathTest {

    @Test
    fun `a bare file name is sent as it came, not placed in the IDE's working directory`() {
        assertEquals("README.txt", cefDraggedPath("README.txt"))
        assertEquals("끌어놓기 note.txt", cefDraggedPath("끌어놓기 note.txt"))
    }

    @Test
    fun `a full path is kept`() {
        val full = File("README.txt").absolutePath

        assertEquals(full, cefDraggedPath(full))
    }
}
