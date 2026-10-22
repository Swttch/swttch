package com.github.yhk1038.claudecodegui.bridge

import com.intellij.openapi.ide.CopyPasteManager
import java.awt.datatransfer.StringSelection

/**
 * Writes text through the IDE clipboard manager.
 *
 * The webview lives in a separate JCEF process, so a browser-side copy must be
 * handed to the IDE process explicitly. The writer is injectable to keep the
 * clipboard boundary testable without a running IDE or display.
 */
class SystemClipboardWriter(
    private val setContents: (String) -> Unit = { text ->
        CopyPasteManager.getInstance().setContents(StringSelection(text))
    },
) {
    /**
     * @return true when the host accepted the text, false for empty text or an
     * unavailable/refusing clipboard.
     */
    fun write(text: String): Boolean {
        if (text.isEmpty()) return false
        return try {
            setContents(text)
            true
        } catch (_: Exception) {
            // A clipboard failure must not turn a completed browser copy into
            // a broken bridge request.
            false
        }
    }
}
