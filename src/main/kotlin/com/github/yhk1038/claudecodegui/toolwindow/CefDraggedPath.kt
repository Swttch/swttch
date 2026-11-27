package com.github.yhk1038.claudecodegui.toolwindow

import java.io.File

/**
 * The path to send for a file CEF says is being dragged.
 *
 * In a macOS IDE CEF can name the file without saying where it is. Making such a name
 * absolute places it in the IDE's own working directory, where there is no such file, so a
 * bare name is sent as it came and the backend looks its full path up.
 */
internal fun cefDraggedPath(name: String): String {
    val file = File(name)
    return if (file.isAbsolute) file.absolutePath else name
}
