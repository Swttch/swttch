package com.github.yhk1038.claudecodegui.bridge

import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Issue #308: extraction must never stall, and must stay correct without a lock.
 *
 * Older versions serialized extraction with a `.lock` file taken via the blocking
 * `FileChannel.lock()`, which waits forever. A leftover backend process holding that lock
 * stalled every new start until the 30s resource gate gave up, surfacing as
 * `Plugin resources not ready`; on Windows the holder survives closing the IDE, so only a
 * machine reboot cleared it. The lock never guarded correctness — the temp-dir + rename
 * publish does — so it was removed rather than made bounded.
 *
 * These tests pin both halves of that decision: a lock file left on disk cannot block a
 * start, and concurrent extraction without any lock still yields one intact bundle.
 */
class PluginResourceExtractorLockTest {

    private var lockHolder: Process? = null

    @AfterEach
    fun releaseLock() {
        lockHolder?.destroyForcibly()?.waitFor(10, TimeUnit.SECONDS)
        lockHolder = null
    }

    private fun completeUnpack(webviewTarget: File, backendDirTarget: File) {
        File(webviewTarget, "assets").mkdirs()
        File(webviewTarget, "assets/index-abc123.js").writeText("// bundle")
        File(webviewTarget, "index.html").writeText("<html></html>")
        File(backendDirTarget, "backend.mjs").writeText("// backend")
    }

    private fun extractor(base: File, unpack: (File, File) -> Unit) =
        PluginResourceExtractor(baseDir = base, version = "1.2.3", unpack = unpack)

    /** Runs [block] on another thread so a hang fails the test instead of freezing the suite. */
    private fun <T> withinTimeout(seconds: Long, what: String, block: () -> T): T {
        val pool = Executors.newSingleThreadExecutor()
        try {
            val future = pool.submit(block)
            return try {
                future.get(seconds, TimeUnit.SECONDS)
            } catch (e: java.util.concurrent.TimeoutException) {
                future.cancel(true)
                fail("$what — this is issue #308: the backend then dies with `Plugin resources not ready`")
            }
        } finally {
            pool.shutdownNow()
        }
    }

    // ── A held lock file must not block a start (the #308 regression) ────────

    /**
     * Hold `<base>/.lock` from a separate process for the duration of the test, the way a
     * leftover backend generation did.
     *
     * The holder MUST take the lock the same way the old code did — java.nio
     * `FileChannel.lock()`, i.e. `fcntl(2)` POSIX record locks. The shell's `flock` is a
     * different mechanism (`flock(2)`, BSD locks) and the two do not block each other on
     * Linux or macOS, so a flock-based holder would leave the file effectively free and this
     * test would silently measure nothing.
     */
    private fun holdLockFromAnotherProcess(base: File) {
        base.mkdirs()
        val lockFile = File(base, ".lock")
        val ready = File(base, "lock-acquired.marker")

        val proc = ProcessBuilder(
            javaBin(), "-cp", System.getProperty("java.class.path"),
            LockHolderMain::class.java.name, lockFile.absolutePath, ready.absolutePath,
        ).redirectErrorStream(true).start()
        lockHolder = proc

        val deadline = System.currentTimeMillis() + 30_000
        while (System.currentTimeMillis() < deadline && !ready.isFile && proc.isAlive) {
            Thread.sleep(50)
        }
        assertTrue(ready.isFile, "helper process failed to acquire the lock (alive=${proc.isAlive})")
        assertLockIsActuallyHeld(lockFile)
    }

    private fun javaBin(): String =
        File(File(System.getProperty("java.home"), "bin"), "java").absolutePath

    /**
     * Verify the helper really holds the lock rather than trusting its marker file. Without
     * this, a holder that drops the lock — or takes it with an incompatible mechanism — still
     * writes the marker, and the assertions below would pass against an unlocked file.
     */
    private fun assertLockIsActuallyHeld(lockFile: File) {
        val probe = ProcessBuilder(
            javaBin(), "-cp", System.getProperty("java.class.path"),
            LockProbeMain::class.java.name, lockFile.absolutePath,
        ).redirectErrorStream(true).start()
        assertTrue(probe.waitFor(30, TimeUnit.SECONDS), "lock probe did not finish")
        assertEquals(
            LockProbeMain.EXIT_HELD, probe.exitValue(),
            "the lock file is NOT actually locked — this test would measure nothing",
        )
    }

    @Test
    fun `extracts while another process holds a lock file, instead of waiting on it`(@TempDir base: File) {
        holdLockFromAnotherProcess(base)

        val calls = AtomicInteger(0)
        val extractor = extractor(base) { wv, bd -> calls.incrementAndGet(); completeUnpack(wv, bd) }

        val result = withinTimeout(20, "resolve() hung while another process held .lock") {
            extractor.resolve()
        }

        assertEquals(1, calls.get(), "extraction should have run despite the held lock file")
        assertTrue(result.backendFile.isFile, "a usable backend.mjs must be served: ${result.backendFile}")
        assertTrue(
            File(result.webviewDir, "assets/index-abc123.js").isFile,
            "a usable hashed bundle must be served from ${result.webviewDir}",
        )
    }

    @Test
    fun `an already complete version dir is served even while a lock file is held`(@TempDir base: File) {
        completeUnpack(File(base, "1.2.3/webview"), File(base, "1.2.3/backend").apply { mkdirs() })
        holdLockFromAnotherProcess(base)

        val calls = AtomicInteger(0)
        val extractor = extractor(base) { _, _ -> calls.incrementAndGet() }

        val result = withinTimeout(20, "resolve() hung on a complete version dir") { extractor.resolve() }

        assertEquals(0, calls.get(), "a complete version dir must not be re-extracted")
        assertEquals(File(base, "1.2.3/backend/backend.mjs"), result.backendFile)
    }

    @Test
    fun `deletes an obsolete lock file left behind by an older version`(@TempDir base: File) {
        base.mkdirs()
        val legacyLock = File(base, ".lock").apply { writeText("") }

        extractor(base) { wv, bd -> completeUnpack(wv, bd) }.resolve()

        assertFalse(legacyLock.exists(), "the obsolete .lock file should be cleaned up")
    }

    // ── Correctness without a lock ──────────────────────────────────────────

    /**
     * Deterministically reproduce losing the publish race, which is the case the `.lock` file
     * used to make unreachable. A plain "start N threads at once" test does NOT reliably get
     * here — all racers tend to clear the pre-unpack check together and only one path gets
     * exercised — so the loser is staged explicitly: it is already past its own checks and
     * holding a verified temp bundle when the winner publishes underneath it.
     *
     * [publishWinnerDuringUnpack] runs inside the loser's unpack callback, i.e. after the loser
     * has decided the version dir was incomplete and before it tries to rename.
     */
    private fun loseTheRaceTo(base: File): ExtractedResources {
        var publishWinnerDuringUnpack: (() -> Unit)? = {
            // A second process finishes first and publishes the canonical version dir.
            completeUnpack(
                File(base, "1.2.3/webview"),
                File(base, "1.2.3/backend").apply { mkdirs() },
            )
        }
        return extractor(base) { wv, bd ->
            publishWinnerDuringUnpack?.invoke()
            publishWinnerDuringUnpack = null
            completeUnpack(wv, bd)
        }.resolve()
    }

    @Test
    fun `serves the winner's bundle when another process publishes first`(@TempDir base: File) {
        // The lock only ever prevented duplicated work, never a corrupt result — so the loser
        // must adopt the winner's identical bundle instead of failing to start.
        val result = withinTimeout(30, "losing the publish race hung") { loseTheRaceTo(base) }

        assertEquals(
            File(base, "1.2.3/backend/backend.mjs"), result.backendFile,
            "the loser must serve the canonical dir the winner published",
        )
        assertTrue(result.backendFile.isFile, "the served backend.mjs must exist")
        assertTrue(
            File(result.webviewDir, "assets/index-abc123.js").isFile,
            "the served bundle must be complete: ${result.webviewDir}",
        )
    }

    @Test
    fun `losing the race never deletes the bundle the winner is already serving`(@TempDir base: File) {
        // Deleting a live version dir is exactly what produced the `Not found` blank panel in
        // #149: the backend reads every request fresh from disk, so the window in which the dir
        // is gone serves HTTP 404 even if an identical dir reappears immediately afterwards.
        //
        // Checking that the files *exist* afterwards therefore proves nothing — deleting and
        // re-creating them passes that check while reproducing the very bug. What has to hold
        // is that the winner's files are never replaced, so the identity is asserted instead:
        // fileKey is the inode on POSIX and the file id on Windows, and it changes when a file
        // is deleted and written again.
        val winner = File(base, "1.2.3/backend/backend.mjs")

        var identityWhilePublished: Any? = null
        var publishWinner: (() -> Unit)? = {
            completeUnpack(
                File(base, "1.2.3/webview"),
                File(base, "1.2.3/backend").apply { mkdirs() },
            )
            identityWhilePublished = fileIdentityOf(winner)
        }
        PluginResourceExtractor(baseDir = base, version = "1.2.3", unpack = { wv, bd ->
            publishWinner?.invoke()
            publishWinner = null
            completeUnpack(wv, bd)
        }).resolve()

        assertNotNull(identityWhilePublished, "the winner never published — the race was not staged")
        assertTrue(winner.isFile, "the winner's backend.mjs must survive")
        assertEquals(
            identityWhilePublished, fileIdentityOf(winner),
            "the winner's backend.mjs was replaced — a live backend would have served 404 (#149)",
        )
    }

    /** Filesystem identity of [file] (inode / file id), which changes if it is re-created. */
    private fun fileIdentityOf(file: File): Any? =
        java.nio.file.Files.readAttributes(file.toPath(), java.nio.file.attribute.BasicFileAttributes::class.java)
            .fileKey()
            ?: java.nio.file.Files.getAttribute(file.toPath(), "unix:ino")

    @Test
    fun `losing the race leaves no temp dir behind`(@TempDir base: File) {
        loseTheRaceTo(base)

        val leftovers = base.listFiles()?.filter { it.name.startsWith(".tmp-") } ?: emptyList()
        assertTrue(leftovers.isEmpty(), "no .tmp-* dir should remain after losing the race: $leftovers")
    }

    @Test
    fun `parallel extractors all end up serving a complete bundle`(@TempDir base: File) {
        // Belt-and-braces over the staged tests above: whatever interleaving actually happens,
        // nobody may be handed a partial bundle.
        val extractors = 4
        val pool = Executors.newFixedThreadPool(extractors)
        try {
            val started = java.util.concurrent.CountDownLatch(extractors)
            val futures = (1..extractors).map {
                pool.submit<ExtractedResources> {
                    started.countDown()
                    started.await(10, TimeUnit.SECONDS)
                    extractor(base) { wv, bd -> completeUnpack(wv, bd) }.resolve()
                }
            }
            val results = futures.map { it.get(60, TimeUnit.SECONDS) }

            for (r in results) {
                assertTrue(r.backendFile.isFile, "every racer must be served a backend.mjs: ${r.backendFile}")
                assertTrue(
                    File(r.webviewDir, "assets/index-abc123.js").isFile,
                    "every racer must be served a complete bundle: ${r.webviewDir}",
                )
            }
            assertTrue(
                File(base, "1.2.3/backend/backend.mjs").isFile,
                "the canonical version dir must end up complete",
            )
        } finally {
            pool.shutdownNow()
        }
    }

    /** Takes an exclusive [java.nio.channels.FileChannel] lock and parks, holding it open. */
    object LockHolderMain {
        @JvmStatic
        fun main(args: Array<String>) {
            val channel = java.nio.channels.FileChannel.open(
                File(args[0]).toPath(),
                java.nio.file.StandardOpenOption.CREATE,
                java.nio.file.StandardOpenOption.WRITE,
            )
            channel.lock()
            File(args[1]).writeText("x")
            while (true) Thread.sleep(1000)
        }
    }

    /** Exits [EXIT_HELD] when someone else already holds the lock, [EXIT_FREE] otherwise. */
    object LockProbeMain {
        const val EXIT_HELD = 3
        const val EXIT_FREE = 4

        @JvmStatic
        fun main(args: Array<String>) {
            val channel = java.nio.channels.FileChannel.open(
                File(args[0]).toPath(),
                java.nio.file.StandardOpenOption.CREATE,
                java.nio.file.StandardOpenOption.WRITE,
            )
            val held = channel.tryLock() == null
            System.exit(if (held) EXIT_HELD else EXIT_FREE)
        }
    }
}
