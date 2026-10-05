package com.github.yhk1038.claudecodegui.bridge

import java.awt.HeadlessException
import java.awt.Image
import java.awt.datatransfer.Clipboard
import java.awt.datatransfer.ClipboardOwner
import java.awt.datatransfer.DataFlavor
import java.awt.datatransfer.StringSelection
import java.awt.datatransfer.Transferable
import java.awt.datatransfer.UnsupportedFlavorException
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.Base64
import javax.imageio.ImageIO
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * Unit tests for [SystemClipboardReader] with a stand-in clipboard, so no display is
 * needed. That a real Wayland IDE process sees text copied by another program was
 * measured on the Linux bench separately: this pins down what is read, how an image
 * is encoded, and that a clipboard that cannot be read is an empty answer, not a fault.
 */
class SystemClipboardReaderTest {

    /** A clipboard entry that offers an image and a text at once, as a copied web image does. */
    private class ImageAndText(private val image: Image?, private val text: String?) : Transferable {
        private val flavors: Array<DataFlavor> = listOfNotNull(
            image?.let { DataFlavor.imageFlavor },
            text?.let { DataFlavor.stringFlavor },
        ).toTypedArray()

        override fun getTransferDataFlavors(): Array<DataFlavor> = flavors
        override fun isDataFlavorSupported(flavor: DataFlavor): Boolean = flavors.any { it.equals(flavor) }
        override fun getTransferData(flavor: DataFlavor): Any = when {
            flavor.equals(DataFlavor.imageFlavor) && image != null -> image
            flavor.equals(DataFlavor.stringFlavor) && text != null -> text
            else -> throw UnsupportedFlavorException(flavor)
        }
    }

    /** A clipboard entry offering PNG as raw bytes, which is how a screenshot tool hands one over. */
    private class RawPng(private val bytes: ByteArray) : Transferable {
        private val flavor = DataFlavor("image/png;class=java.io.InputStream")
        override fun getTransferDataFlavors(): Array<DataFlavor> = arrayOf(flavor)
        override fun isDataFlavorSupported(candidate: DataFlavor): Boolean = flavor.equals(candidate)
        override fun getTransferData(candidate: DataFlavor): Any =
            if (flavor.equals(candidate)) ByteArrayInputStream(bytes) else throw UnsupportedFlavorException(candidate)
    }

    private fun clipboardWith(contents: Transferable): Clipboard =
        Clipboard("test").also { it.setContents(contents, null as ClipboardOwner?) }

    /** Holds [contents], but fails the way [failure] says whenever an image is asked for. */
    private fun clipboardWhoseImageRead(failure: () -> Throwable, contents: Transferable): Clipboard =
        object : Clipboard("test") {
            override fun getData(flavor: DataFlavor): Any {
                if (flavor.mimeType.startsWith("image/")) throw failure()
                return super.getData(flavor)
            }
        }.also { it.setContents(contents, null as ClipboardOwner?) }

    @Test
    fun `reads the text another program copied`() {
        val clipboard = clipboardWith(StringSelection("copied elsewhere"))

        val read = SystemClipboardReader { clipboard }.read()

        assertEquals("copied elsewhere", read.text)
        assertNull(read.image)
    }

    @Test
    fun `keeps whitespace and newlines as they were copied`() {
        val clipboard = clipboardWith(StringSelection("  first\n\tsecond  "))

        assertEquals("  first\n\tsecond  ", SystemClipboardReader { clipboard }.read().text)
    }

    @Test
    fun `answers with nothing for a clipboard that holds nothing`() {
        assertEquals(ClipboardContents.EMPTY, SystemClipboardReader { Clipboard("empty") }.read())
    }

    @Test
    fun `counts an empty string as nothing on the clipboard`() {
        val clipboard = clipboardWith(StringSelection(""))

        assertNull(SystemClipboardReader { clipboard }.read().text)
    }

    @Test
    fun `encodes a copied image as a PNG the webview can attach`() {
        val source = BufferedImage(4, 3, BufferedImage.TYPE_INT_ARGB)
        val clipboard = clipboardWith(ImageAndText(source, null))

        val read = SystemClipboardReader { clipboard }.read()

        assertNull(read.text)
        assertNotNull(read.image)
        val image = read.image!!
        assertEquals("image/png", image.mimeType)
        val decoded = ImageIO.read(ByteArrayInputStream(Base64.getDecoder().decode(image.base64)))
        assertEquals(4, decoded.width)
        assertEquals(3, decoded.height)
    }

    @Test
    fun `hands over the PNG bytes exactly as the clipboard holds them`() {
        val png = ByteArrayOutputStream().also {
            ImageIO.write(BufferedImage(5, 2, BufferedImage.TYPE_INT_ARGB), "png", it)
        }.toByteArray()
        val clipboard = clipboardWith(RawPng(png))

        val read = SystemClipboardReader { clipboard }.read()

        assertNotNull(read.image)
        assertEquals("image/png", read.image!!.mimeType)
        assertEquals(Base64.getEncoder().encodeToString(png), read.image!!.base64)
    }

    @Test
    fun `keeps the text when reading the image fails with an error that is not an exception`() {
        // The WebP plugin's missing native library fails like this while the AWT lists image writers.
        val clipboard = clipboardWhoseImageRead(
            failure = { UnsatisfiedLinkError("libwebp_jni.so does not exist") },
            contents = ImageAndText(BufferedImage(2, 2, BufferedImage.TYPE_INT_ARGB), "kept"),
        )

        val read = SystemClipboardReader { clipboard }.read()

        assertEquals("kept", read.text)
        assertNull(read.image)
    }

    @Test
    fun `keeps the text when the AWT trips over the image with a runtime exception`() {
        val clipboard = clipboardWhoseImageRead(
            failure = { NullPointerException("imageWriter is null") },
            contents = ImageAndText(BufferedImage(2, 2, BufferedImage.TYPE_INT_ARGB), "kept"),
        )

        val read = SystemClipboardReader { clipboard }.read()

        assertEquals("kept", read.text)
        assertNull(read.image)
    }

    @Test
    fun `reads the image and the text together when the clipboard holds both`() {
        val clipboard = clipboardWith(ImageAndText(BufferedImage(2, 2, BufferedImage.TYPE_INT_ARGB), "caption"))

        val read = SystemClipboardReader { clipboard }.read()

        assertEquals("caption", read.text)
        assertNotNull(read.image)
    }

    @Test
    fun `answers with nothing on a platform that has no clipboard`() {
        assertEquals(ClipboardContents.EMPTY, SystemClipboardReader { null }.read())
    }

    @Test
    fun `answers with nothing without a display`() {
        assertEquals(ClipboardContents.EMPTY, SystemClipboardReader { throw HeadlessException() }.read())
    }

    @Test
    fun `answers with nothing when the platform clipboard cannot be opened`() {
        val refusing = object : Clipboard("refusing") {
            override fun isDataFlavorAvailable(flavor: DataFlavor?): Boolean {
                throw IllegalStateException("cannot open system clipboard")
            }
        }

        assertEquals(ClipboardContents.EMPTY, SystemClipboardReader { refusing }.read())
    }
}
