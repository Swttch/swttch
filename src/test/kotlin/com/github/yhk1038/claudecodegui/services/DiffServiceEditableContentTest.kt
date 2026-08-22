package com.github.yhk1038.claudecodegui.services

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.DataInputStream

/**
 * Guards the fix for issue #305: the proposed side of a review diff must stay
 * editable, so a reviewer can correct a small slip in place instead of
 * describing it back to the agent.
 *
 * Editability is not a flag on the viewer — it is decided by which factory
 * method built the content. `DiffContentFactory.create` returns a document that
 * has had `setReadOnly(true)` applied; only `createEditable` leaves it
 * writable. (Verified against the platform bytecode: `create` routes through
 * `readOnlyDocumentContent`, `createEditable` through `documentContent(_, false)`.)
 *
 * So the invariant is about which method [DiffService] calls, and the failure
 * mode it guards is silent: swapping `createEditable` back to `create` still
 * compiles, still opens a diff, and simply stops accepting keystrokes. Nothing
 * else in the suite would notice.
 *
 * Asserted by reading the constant pool rather than by opening a real diff:
 * [DiffService] needs a live `Project` and the platform's editor stack, which
 * this suite deliberately does not stand up.
 */
class DiffServiceEditableContentTest {

    @Test
    fun `DiffService asks for an editable content so the proposed side accepts edits`() {
        val referenced = methodRefsIn(DiffService::class.java)
        assertTrue(referenced.contains("createEditable")) {
            "DiffService no longer calls DiffContentFactory.createEditable, so the proposed " +
                "side of a review diff is read-only again (issue #305). `create` applies " +
                "setReadOnly(true) to the document it returns; only `createEditable` leaves " +
                "it writable. Referenced methods:\n" +
                referenced.sorted().joinToString("\n") { "  - $it" }
        }
    }

    /**
     * The original side stays read-only, which means both factory methods are
     * expected here. This pins that pairing so a well-meaning cleanup does not
     * make BOTH sides editable — typing into the file as it exists on disk
     * would look like an edit while changing nothing.
     */
    @Test
    fun `DiffService still asks for a read-only content for the original side`() {
        val referenced = methodRefsIn(DiffService::class.java)
        assertTrue(referenced.contains("create")) {
            "DiffService should still build the original side with DiffContentFactory.create: " +
                "it shows the file as it is on disk, and editing it would change nothing " +
                "while looking like it did."
        }
    }

    /**
     * Proves the reader actually reads — without this, the assertions above
     * would pass just as happily against a class that referenced neither name.
     *
     * [CallsAKnownMethod] exists only to be read: it calls one method whose
     * name nothing else here would supply.
     */
    @Test
    fun `the constant-pool reader finds a call the sample class is known to make`() {
        val referenced = methodRefsIn(CallsAKnownMethod::class.java)
        assertTrue(referenced.contains("codePointCount")) {
            "The reader failed to find a call the sample class makes, so the assertions above " +
                "prove nothing. Found:\n" + referenced.sorted().joinToString("\n") { "  - $it" }
        }
    }

    @Test
    fun `the constant-pool reader does not invent names`() {
        val referenced = methodRefsIn(CallsAKnownMethod::class.java)
        assertEquals(false, referenced.contains("createEditable"))
    }

    /** Shaped to make exactly one recognisable call; see the test above. */
    private class CallsAKnownMethod {
        fun run(input: String): Int = input.codePointCount(0, input.length)
    }
}

/**
 * Every method name this class's bytecode refers to, read from its constant
 * pool.
 *
 * Only names are collected: the owner of a `Methodref` is enough to distinguish
 * `create` from `createEditable`, and matching on the full descriptor would
 * make the test brittle against a platform that adds an overload.
 */
private fun methodRefsIn(clazz: Class<*>): Set<String> {
    val resource = clazz.name.replace('.', '/') + ".class"
    val bytes = clazz.classLoader.getResourceAsStream(resource)?.use { it.readBytes() }
        ?: error("Could not read bytecode for ${clazz.name}")

    val input = DataInputStream(bytes.inputStream())
    require(input.readInt() == -0x35014542) { "Not a class file: ${clazz.name}" }
    input.readUnsignedShort() // minor
    input.readUnsignedShort() // major

    val count = input.readUnsignedShort()
    val utf8 = HashMap<Int, String>()
    // Index into the NameAndType entries a Methodref points at, resolved in a
    // second pass because a constant may be referenced before it is defined.
    val nameAndTypeNameIndex = HashMap<Int, Int>()
    val methodRefNameAndTypeIndex = HashSet<Int>()

    var index = 1
    while (index < count) {
        when (val tag = input.readUnsignedByte()) {
            1 -> utf8[index] = input.readUTF()
            7, 8, 16, 19, 20 -> input.readUnsignedShort()
            15 -> { input.readUnsignedByte(); input.readUnsignedShort() }
            3, 4 -> input.readInt()
            5, 6 -> { input.readInt(); input.readInt(); index++ } // long/double take two slots
            9, 11, 17, 18 -> { input.readUnsignedShort(); input.readUnsignedShort() }
            10 -> { // Methodref
                input.readUnsignedShort() // class index
                methodRefNameAndTypeIndex.add(input.readUnsignedShort())
            }
            12 -> { // NameAndType
                nameAndTypeNameIndex[index] = input.readUnsignedShort()
                input.readUnsignedShort() // descriptor
            }
            else -> error("Unhandled constant pool tag $tag in ${clazz.name}")
        }
        index++
    }

    return methodRefNameAndTypeIndex.mapNotNull { utf8[nameAndTypeNameIndex[it]] }.toSet()
}
