package com.github.yhk1038.claudecodegui.toolwindow

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.awt.datatransfer.DataFlavor

/**
 * Guards which drops count as "meant to carry files", so a drop whose files could not be
 * read is reported to the person and a dragged text selection is not (issue #623).
 */
class NativeDropFlavorsTest {

    @Test
    fun `the JDK file list flavor counts as files`() {
        assertTrue(NativeDropFlavors.carriesFiles(listOf(DataFlavor.javaFileListFlavor.mimeType)))
    }

    @Test
    fun `a uri list counts as files, in any of the encodings a file manager offers`() {
        assertTrue(NativeDropFlavors.carriesFiles(listOf("text/uri-list; class=java.lang.String")))
        assertTrue(NativeDropFlavors.carriesFiles(listOf("text/uri-list; class=java.io.InputStream; charset=UTF-8")))
    }

    @Test
    fun `the GNOME copied-files and icon-list flavors count as files`() {
        assertTrue(NativeDropFlavors.carriesFiles(listOf("x-special/gnome-copied-files; class=java.io.InputStream")))
        assertTrue(NativeDropFlavors.carriesFiles(listOf("x-special/gnome-icon-list; class=java.lang.String")))
    }

    @Test
    fun `one file flavor among text flavors is enough`() {
        assertTrue(
            NativeDropFlavors.carriesFiles(
                listOf(DataFlavor.stringFlavor.mimeType, "text/uri-list; class=java.lang.String", "text/plain; charset=UTF-8"),
            ),
        )
    }

    @Test
    fun `a text selection does not count as files`() {
        assertFalse(NativeDropFlavors.carriesFiles(listOf(DataFlavor.stringFlavor.mimeType, "text/plain; charset=UTF-8")))
    }

    @Test
    fun `a drop with no flavors does not count as files`() {
        assertFalse(NativeDropFlavors.carriesFiles(emptyList()))
    }
}
