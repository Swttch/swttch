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
 * Issue #308: a foreign process holding the extractor's `.lock` must not stall startup.
 *
 * These cover the gap the M4 tests in [PluginResourceExtractorTest] leave open. M4 covers a
 * locked *version dir* (the delete fails, we serve from a `.locked-*` fallback), but nothing
 * covered a locked **`.lock` file** — and that is the path that hangs: the wait for the lock
 * itself is what has no time limit, so [PluginResourceExtractor.resolve] never returns and the
 * 30s ceiling in NodeProcessManager turns it into `Plugin resources not ready`.
 *
 * A real second process is required. `FileChannel.lock()` is a JVM-wide lock, so a lock taken
 * on the same file from this JVM throws OverlappingFileLockException instead of blocking — it
 * would not reproduce what a leftover backend process does.
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

    /**
     * Hold `<base>/.lock` from a separate process until this test ends, mirroring a leftover
     * backend generation that still owns the lock. Returns once the lock is actually held, so
     * the assertions below cannot race the helper's startup.
     */
    private fun holdLockFromAnotherProcess(base: File) {
        base.mkdirs()
        val lockFile = File(base, ".lock")
        val ready = File(base, "lock-acquired.marker")

        // The helper MUST take the lock the same way production does — java.nio
        // FileChannel.lock(), i.e. fcntl(2) POSIX record locks. The shell's `flock` is a
        // different mechanism (flock(2), BSD locks); the two do not block each other on
        // Linux or macOS, so a flock-based holder leaves FileChannel.lock() free to sail
        // straight through and the test measures nothing.
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
     * Verify the helper really holds the lock, rather than trusting its marker file.
     *
     * Without this, a holder that takes and immediately drops the lock — or takes it with an
     * incompatible mechanism — still writes the marker, and every assertion below would pass
     * against an effectively unlocked file: the test would report success while measuring nothing.
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
            // tryLock returns null (rather than blocking) when another process holds the lock.
            val held = channel.tryLock() == null
            System.exit(if (held) EXIT_HELD else EXIT_FREE)
        }
    }

    @Test
    fun `resolve returns instead of hanging while another process holds the lock`(@TempDir base: File) {
        holdLockFromAnotherProcess(base)

        val calls = AtomicInteger(0)
        val extractor = PluginResourceExtractor(
            baseDir = base,
            version = "1.2.3",
            lockWaitTimeoutMs = 500,
            unpack = { wv, bd -> calls.incrementAndGet(); completeUnpack(wv, bd) },
        )

        // Run on another thread so a hang fails the test instead of freezing the suite.
        val pool = Executors.newSingleThreadExecutor()
        try {
            val future = pool.submit<ExtractedResources> { extractor.resolve() }
            val result = try {
                future.get(20, TimeUnit.SECONDS)
            } catch (e: java.util.concurrent.TimeoutException) {
                future.cancel(true)
                fail<ExtractedResources>(
                    "resolve() hung while another process held .lock — this is issue #308: " +
                        "the backend then dies with `Plugin resources not ready`"
                )
            }

            assertTrue(result.backendFile.isFile, "a usable backend.mjs must be served: ${result.backendFile}")
            assertTrue(
                File(result.webviewDir, "assets/index-abc123.js").isFile,
                "a usable hashed bundle must be served from ${result.webviewDir}",
            )
        } finally {
            pool.shutdownNow()
        }
    }

    @Test
    fun `an already complete version dir is served without ever touching the lock`(@TempDir base: File) {
        // Seed a complete version dir first, THEN let a foreign process take the lock.
        completeUnpack(File(base, "1.2.3/webview"), File(base, "1.2.3/backend").apply { mkdirs() })
        holdLockFromAnotherProcess(base)

        val calls = AtomicInteger(0)
        val extractor = PluginResourceExtractor(
            baseDir = base,
            version = "1.2.3",
            lockWaitTimeoutMs = 500,
            unpack = { _, _ -> calls.incrementAndGet() },
        )

        val pool = Executors.newSingleThreadExecutor()
        try {
            val future = pool.submit<ExtractedResources> { extractor.resolve() }
            val result = try {
                future.get(20, TimeUnit.SECONDS)
            } catch (e: java.util.concurrent.TimeoutException) {
                future.cancel(true)
                fail<ExtractedResources>("a complete version dir must be served without waiting on .lock")
            }

            assertEquals(0, calls.get(), "a complete version dir must not be re-extracted")
            assertEquals(File(base, "1.2.3/backend/backend.mjs"), result.backendFile)
        } finally {
            pool.shutdownNow()
        }
    }
}
