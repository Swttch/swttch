package com.github.yhk1038.claudecodegui.toolwindow

/**
 * Tells a drop that was meant to carry files apart from one that was only text.
 *
 * A drop whose files could not be read is worth telling the person about; a text
 * selection dragged onto the panel is not a failed file drop, and saying "could not
 * read the dropped files" about it would be wrong. Works on the flavors' MIME type
 * strings so it needs no AWT objects.
 */
internal object NativeDropFlavors {
    /** MIME fragments file managers use for "these are files", across the platforms we run on. */
    private val FILE_MARKERS = listOf(
        "x-java-file-list", // DataFlavor.javaFileListFlavor
        "uri-list", // text/uri-list: Nautilus, Dolphin, Finder, most Linux file managers
        "x-special/", // x-special/gnome-copied-files, x-special/gnome-icon-list
    )

    fun carriesFiles(mimeTypes: List<String>): Boolean =
        mimeTypes.any { mime -> FILE_MARKERS.any { marker -> mime.contains(marker, ignoreCase = true) } }
}
