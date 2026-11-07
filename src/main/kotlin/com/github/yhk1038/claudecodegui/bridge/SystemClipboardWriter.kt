package com.github.yhk1038.claudecodegui.bridge

import com.intellij.openapi.ide.CopyPasteManager
import java.awt.datatransfer.DataFlavor
import java.awt.datatransfer.StringSelection
import java.awt.datatransfer.Transferable
import java.awt.datatransfer.UnsupportedFlavorException

/**
 * Writes text through the IDE clipboard manager.
 *
 * The webview lives in a separate JCEF process, so a browser-side copy must be
 * handed to the IDE process explicitly. The writer is injectable to keep the
 * clipboard boundary testable without a running IDE or display.
 */
class SystemClipboardWriter(
    private val setRichContents: (Transferable) -> Unit = { contents ->
        CopyPasteManager.getInstance().setContents(contents)
    },
    private val setContents: (String) -> Unit = { text ->
        CopyPasteManager.getInstance().setContents(StringSelection(text))
    },
) {
    /**
     * Puts [text] on the clipboard, and with it [html] when the copy came from a selection in the
     * page. The browser has already made its own formatted copy by the time this runs, and a
     * clipboard written with text alone replaces it, so the formatting is lost (#648).
     *
     * @return true when the host accepted the text, false for empty text or an
     * unavailable/refusing clipboard.
     */
    fun write(text: String, html: String? = null): Boolean {
        if (text.isEmpty()) return false
        return try {
            if (html.isNullOrEmpty()) setContents(text) else setRichContents(TextAndHtml(text, html))
            true
        } catch (_: Exception) {
            // A clipboard failure must not turn a completed browser copy into
            // a broken bridge request.
            false
        }
    }
}

/**
 * One copy offered as text and as HTML. A program that pastes formatting asks for the HTML flavor,
 * one that does not asks for the text.
 */
internal class TextAndHtml(private val text: String, private val html: String) : Transferable {
    private val flavors = arrayOf(DataFlavor.allHtmlFlavor, DataFlavor.stringFlavor)

    override fun getTransferDataFlavors(): Array<DataFlavor> = flavors.copyOf()

    override fun isDataFlavorSupported(flavor: DataFlavor): Boolean = flavors.any { it.equals(flavor) }

    override fun getTransferData(flavor: DataFlavor): Any = when {
        flavor.equals(DataFlavor.allHtmlFlavor) -> html
        flavor.equals(DataFlavor.stringFlavor) -> text
        else -> throw UnsupportedFlavorException(flavor)
    }
}
