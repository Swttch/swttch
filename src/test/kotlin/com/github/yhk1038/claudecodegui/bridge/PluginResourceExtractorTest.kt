package com.github.yhk1038.claudecodegui.bridge

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.util.concurrent.atomic.AtomicInteger

class PluginResourceExtractorTest {

    /** Writes a complete, verifiable bundle into the extractor's temp targets. */
    private fun completeUnpack(webviewTarget: File, backendDirTarget: File) {
        File(webviewTarget, "assets").mkdirs()
        File(webviewTarget, "assets/index-abc123.js").writeText("// bundle")
        File(webviewTarget, "index.html").writeText("<html></html>")
        File(backendDirTarget, "backend.mjs").writeText("// backend")
    }

    private fun extractor(
        baseDir: File,
        version: String = "1.2.3",
        clearTarget: (File) -> Boolean = { it.deleteRecursively() },
        unpack: (File, File) -> Unit,
    ) = PluginResourceExtractor(
        baseDir = baseDir,
        version = version,
        unpack = unpack,
        clearTarget = clearTarget,
    )

    /** Seeds a partial (backend-only, no hashed bundle) version dir so extraction runs. */
    private fun seedPartialVersionDir(base: File, version: String = "1.2.3") {
        File(base, "$version/webview/assets").mkdirs()
        File(base, "$version/backend").mkdirs()
        File(base, "$version/backend/backend.mjs").writeText("// locked backend")
    }

    @Test
    fun `extracts into a version-scoped dir on first resolve`(@TempDir base: File) {
        val calls = AtomicInteger(0)
        val result = extractor(base) { wv, bd -> calls.incrementAndGet(); completeUnpack(wv, bd) }.resolve()

        assertEquals(1, calls.get(), "unpack should run exactly once")
        assertEquals(File(base, "1.2.3/webview"), result.webviewDir)
        assertEquals(File(base, "1.2.3/backend/backend.mjs"), result.backendFile)
        assertTrue(File(result.webviewDir, "assets/index-abc123.js").isFile)
        assertTrue(result.backendFile.isFile)
    }

    @Test
    fun `skips extraction when the version dir is already complete`(@TempDir base: File) {
        // Pre-seed a complete version dir.
        extractor(base) { wv, bd -> completeUnpack(wv, bd) }.resolve()

        val calls = AtomicInteger(0)
        val result = extractor(base) { _, _ -> calls.incrementAndGet() }.resolve()

        assertEquals(0, calls.get(), "a complete version dir must not be re-extracted")
        assertTrue(File(result.webviewDir, "assets/index-abc123.js").isFile)
    }

    @Test
    fun `prunes other version dirs but keeps the current one`(@TempDir base: File) {
        // A stale previous version left on disk.
        val stale = File(base, "1.0.0/webview/assets").apply { mkdirs() }
        File(stale, "index-old.js").writeText("// old")
        File(base, "1.0.0/backend").mkdirs()

        extractor(base, version = "1.2.3") { wv, bd -> completeUnpack(wv, bd) }.resolve()

        assertFalse(File(base, "1.0.0").exists(), "stale other-version dir should be pruned")
        assertTrue(File(base, "1.2.3/webview/assets/index-abc123.js").isFile, "current version kept")
    }

    @Test
    fun `leaves no temp dir after a successful extraction`(@TempDir base: File) {
        extractor(base) { wv, bd -> completeUnpack(wv, bd) }.resolve()

        val leftovers = base.listFiles()?.filter { it.name.startsWith(".tmp-") } ?: emptyList()
        assertTrue(leftovers.isEmpty(), "no .tmp-* dir should remain: $leftovers")
    }

    @Test
    fun `throws and does not publish a version dir on incomplete extraction`(@TempDir base: File) {
        // Unpack writes backend but no hashed JS bundle → verification must fail.
        val ex = assertThrows(IllegalStateException::class.java) {
            extractor(base) { _, bd -> File(bd, "backend.mjs").writeText("// backend") }.resolve()
        }
        assertTrue(ex.message!!.contains("Incomplete"), "message: ${ex.message}")
        assertFalse(File(base, "1.2.3").exists(), "no partial version dir should be published")
        val leftovers = base.listFiles()?.filter { it.name.startsWith(".tmp-") } ?: emptyList()
        assertTrue(leftovers.isEmpty(), "temp dir should be cleaned up on failure: $leftovers")
    }

    @Test
    fun `re-extracts when the version dir exists but is partial`(@TempDir base: File) {
        // A partial version dir (backend present, hashed bundle missing).
        File(base, "1.2.3/webview/assets").mkdirs()
        File(base, "1.2.3/backend").mkdirs()
        File(base, "1.2.3/backend/backend.mjs").writeText("// stale backend")

        val calls = AtomicInteger(0)
        extractor(base) { wv, bd -> calls.incrementAndGet(); completeUnpack(wv, bd) }.resolve()

        assertEquals(1, calls.get(), "a partial version dir must be re-extracted")
        assertTrue(File(base, "1.2.3/webview/assets/index-abc123.js").isFile)
    }

    // ── M4: Windows file-lock resilience ────────────────────────────────────

    @Test
    fun `serves from a fallback dir when the locked partial version dir cannot be cleared`(@TempDir base: File) {
        // A partial version dir a running backend holds locked: the delete "fails" (returns
        // false and leaves the dir), mirroring Windows holding backend.mjs open.
        seedPartialVersionDir(base)

        val result = extractor(base, clearTarget = { false }) { wv, bd -> completeUnpack(wv, bd) }.resolve()

        // Does NOT throw, and serves a complete bundle from a `.locked-*` fallback dir.
        assertTrue(result.backendFile.isFile, "fallback backend.mjs must exist")
        assertTrue(File(result.webviewDir, "assets/index-abc123.js").isFile, "fallback hashed bundle must exist")
        assertTrue(
            result.backendFile.absolutePath.contains(".locked-"),
            "served backend should come from a .locked-* fallback dir: ${result.backendFile}",
        )
    }

    @Test
    fun `keeps the locked partial version dir intact (does not corrupt the running backend)`(@TempDir base: File) {
        seedPartialVersionDir(base)

        extractor(base, clearTarget = { false }) { wv, bd -> completeUnpack(wv, bd) }.resolve()

        // The locked dir the running backend serves from must survive untouched.
        assertTrue(File(base, "1.2.3/backend/backend.mjs").isFile, "locked version dir left intact")
    }

    @Test
    fun `the fallback dir survives the same-run prune`(@TempDir base: File) {
        seedPartialVersionDir(base)

        val result = extractor(base, clearTarget = { false }) { wv, bd -> completeUnpack(wv, bd) }.resolve()

        // resolve() prunes right after extraction; a fallback we are serving must not be reaped.
        assertTrue(result.backendFile.isFile, "the served fallback dir must survive the post-extraction prune")
        val fallbacks = base.listFiles()?.filter { it.name.startsWith(".locked-") } ?: emptyList()
        assertEquals(1, fallbacks.size, "exactly one .locked-* fallback dir should remain: $fallbacks")
    }

    @Test
    fun `leaves no temp dir after a fallback recovery`(@TempDir base: File) {
        seedPartialVersionDir(base)

        extractor(base, clearTarget = { false }) { wv, bd -> completeUnpack(wv, bd) }.resolve()

        val leftovers = base.listFiles()?.filter { it.name.startsWith(".tmp-") } ?: emptyList()
        assertTrue(leftovers.isEmpty(), "no .tmp-* dir should remain after fallback recovery: $leftovers")
    }

    @Test
    fun `a later clean run prunes leftover locked-fallback dirs`(@TempDir base: File) {
        // Simulate a prior Windows-lock recovery leaving a stale `.locked-*` dir behind.
        val stale = File(base, ".locked-old/backend").apply { mkdirs() }
        File(stale, "backend.mjs").writeText("// old fallback")
        // And a complete current version dir, so this run serves canonically (not from a fallback).
        completeUnpack(File(base, "1.2.3/webview"), File(base, "1.2.3/backend").apply { mkdirs() })

        val calls = AtomicInteger(0)
        val result = extractor(base) { _, _ -> calls.incrementAndGet() }.resolve()

        assertEquals(0, calls.get(), "a complete version dir must not be re-extracted")
        assertFalse(File(base, ".locked-old").exists(),
            "a stale .locked-* dir should be pruned on a canonical-serving run")
        assertTrue(result.backendFile.isFile, "still serves the canonical version dir")
    }

    // ── Discarded dirs must not accumulate (issue #308 follow-up) ───────────

    @Test
    fun `reaps a discarded dir a previous run could not delete`(@TempDir base: File) {
        // clearByRenamingAside moves the old version dir aside and deletes the copy. If that
        // delete fails — a Windows lock — the dir stays behind, so a later run has to reap it.
        // It must NOT be named `.tmp-*`: pruneOtherVersions skips that prefix on purpose,
        // because a concurrent extraction may be unpacking into one.
        val stranded = File(base, ".discard-abc/backend").apply { mkdirs() }
        File(stranded, "backend.mjs").writeText("// superseded")

        extractor(base) { wv, bd -> completeUnpack(wv, bd) }.resolve()

        assertFalse(File(base, ".discard-abc").exists(), "a discarded dir should be reaped on a later run")
    }

    @Test
    fun `still leaves a concurrent extraction's temp dir alone`(@TempDir base: File) {
        // The reason `.tmp-*` is skipped: another process may be mid-unpack in one right now.
        val inFlight = File(base, ".tmp-someone-else/webview").apply { mkdirs() }
        File(inFlight, "index.html").writeText("<html></html>")

        extractor(base) { wv, bd -> completeUnpack(wv, bd) }.resolve()

        assertTrue(
            File(base, ".tmp-someone-else").exists(),
            "another process's in-flight temp dir must survive",
        )
    }
}
