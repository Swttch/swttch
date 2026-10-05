package com.github.yhk1038.claudecodegui.bridge

import java.awt.HeadlessException
import java.awt.Image
import java.awt.Toolkit
import java.awt.datatransfer.Clipboard
import java.awt.datatransfer.DataFlavor
import java.awt.datatransfer.UnsupportedFlavorException
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.util.Base64
import javax.imageio.ImageIO

/** An image read off the clipboard, already encoded as the webview attaches it. */
data class ClipboardImage(val mimeType: String, val base64: String)

/**
 * What the system clipboard held when it was read. Each part is null when the
 * clipboard has none of it, so "nothing there" and "could not read it" look the
 * same to the user: one paste that did nothing.
 */
data class ClipboardContents(val text: String?, val image: ClipboardImage?) {
    companion object {
        val EMPTY = ClipboardContents(text = null, image = null)
    }
}

/**
 * Reads the system clipboard on behalf of the webview (#278).
 *
 * On a Wayland desktop the embedded browser is a separate X11 process, and the
 * desktop hands the clipboard of a Wayland window (the IDE) to X11 programs only
 * while one of them has the focus. So a paste into the chat input finds an empty
 * clipboard in the browser while this process, which is the IDE itself, reads the
 * real one. The webview asks for it over the Bridge when its own clipboard is
 * empty.
 *
 * Nothing here checks the operating system or the toolkit: where the browser
 * already sees the clipboard the webview never asks, and where it does ask, the
 * AWT answers for whatever platform this runs on.
 *
 * [clipboard] is a parameter so the behaviour can be tested without a display.
 */
class SystemClipboardReader(
    private val clipboard: () -> Clipboard? = { Toolkit.getDefaultToolkit().systemClipboard },
) {
    /**
     * Read the text and the image the clipboard holds right now.
     *
     * Never throws for a clipboard that cannot be reached or read: that is an
     * empty answer, not a fault, and a paste that fails to fill costs the user
     * one paste.
     */
    fun read(): ClipboardContents {
        val source = try {
            clipboard()
        } catch (_: HeadlessException) {
            null
        } ?: return ClipboardContents.EMPTY
        return ClipboardContents(text = readText(source), image = readImage(source))
    }

    private fun readText(source: Clipboard): String? = unlessUnreadable {
        if (source.isDataFlavorAvailable(DataFlavor.stringFlavor)) {
            (source.getData(DataFlavor.stringFlavor) as? String)?.takeIf { it.isNotEmpty() }
        } else {
            null
        }
    }

    /**
     * The PNG bytes as they sit on the clipboard when it offers them, which keeps the
     * pixels exactly and skips the AWT's own image conversion. Any other image the
     * clipboard holds goes through that conversion and is encoded here.
     */
    private fun readImage(source: Clipboard): ClipboardImage? =
        unlessUnreadable { readPngBytes(source) } ?: unlessUnreadable { readImageFlavor(source) }

    private fun readPngBytes(source: Clipboard): ClipboardImage? {
        if (!source.isDataFlavorAvailable(PNG_BYTES)) return null
        val bytes = (source.getData(PNG_BYTES) as? InputStream)?.use { it.readNBytes(MAX_IMAGE_BYTES + 1) }
            ?: return null
        if (bytes.isEmpty() || bytes.size > MAX_IMAGE_BYTES) return null
        return ClipboardImage(mimeType = "image/png", base64 = Base64.getEncoder().encodeToString(bytes))
    }

    private fun readImageFlavor(source: Clipboard): ClipboardImage? {
        if (!source.isDataFlavorAvailable(DataFlavor.imageFlavor)) return null
        return (source.getData(DataFlavor.imageFlavor) as? Image)?.let(::encodePng)
    }

    /**
     * Run a read and answer null for whatever goes wrong with it.
     *
     * A read must never throw, and the breadth is deliberate. The AWT reads the
     * clipboard through machinery the IDE and its plugins also reach into: asking it
     * for an image makes it list the image writers every plugin registered, and one of
     * them (the WebP plugin, where its native library is missing) fails with a
     * [LinkageError], which is not an [Exception]. Left uncaught that took the whole
     * read down, and the text on the clipboard with it. Each part is read on its own
     * so that one that cannot be read costs only itself.
     */
    private inline fun <T> unlessUnreadable(read: () -> T?): T? = try {
        read()
    } catch (_: UnsupportedFlavorException) {
        null
    } catch (_: IOException) {
        null
    } catch (_: Exception) {
        // The platform clipboard could not be opened right now, or the AWT tripped on it.
        null
    } catch (_: LinkageError) {
        null
    }

    /**
     * PNG is the one format every consumer accepts and keeps pixels exactly, which
     * suits a screenshot. Null for an image that has no size yet or that no
     * encoder takes, and for one so large that sending it would stall the
     * connection; the webview shows its own "too large" message well below that.
     */
    private fun encodePng(image: Image): ClipboardImage? {
        val width = image.getWidth(null)
        val height = image.getHeight(null)
        if (width <= 0 || height <= 0) return null

        val buffered = image as? BufferedImage ?: BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB).also { copy ->
            val graphics = copy.createGraphics()
            try {
                graphics.drawImage(image, 0, 0, null)
            } finally {
                graphics.dispose()
            }
        }

        val bytes = ByteArrayOutputStream().use { out ->
            if (!ImageIO.write(buffered, "png", out)) return null
            out.toByteArray()
        }
        if (bytes.size > MAX_IMAGE_BYTES) return null
        return ClipboardImage(mimeType = "image/png", base64 = Base64.getEncoder().encodeToString(bytes))
    }

    private companion object {
        /** Far above the webview's own attachment limit, so that limit speaks first. */
        const val MAX_IMAGE_BYTES = 32 * 1024 * 1024

        /** The clipboard's PNG, asked for as raw bytes rather than as a decoded [Image]. */
        val PNG_BYTES = DataFlavor("image/png;class=java.io.InputStream")
    }
}
