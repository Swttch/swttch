package com.github.yhk1038.claudecodegui.bridge

import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.io.File
import java.net.ServerSocket
import java.util.concurrent.TimeUnit

/**
 * End-to-end check of the reclaim path against a REAL process holding a REAL port (issue #308).
 *
 * [StaleBackendReclaimerTest] covers the orchestration with the OS calls stubbed out, which
 * proves the decisions but not that the discovery command, the pid parsing and the kill actually
 * work together on this platform. That gap is where the button either works or silently does
 * nothing, so it is worth one test that uses no stubs at all.
 */
class StaleBackendReclaimerRealProcessTest {

    private var hog: Process? = null

    @AfterEach
    fun stopHog() {
        hog?.let { p ->
            p.descendants().forEach { it.destroyForcibly() }
            p.destroyForcibly()
            p.waitFor(10, TimeUnit.SECONDS)
        }
        hog = null
    }

    private fun javaBin(): String =
        File(File(System.getProperty("java.home"), "bin"), "java").absolutePath

    /** A free port, released immediately so the helper can bind it. */
    private fun freePort(): Int = ServerSocket(0).use { it.localPort }

    /**
     * Start a separate JVM that binds [port] and parks, standing in for a leftover backend.
     * Returns once the port is confirmed occupied, so the assertions cannot race its startup.
     */
    private fun occupyPort(port: Int) {
        val src = File.createTempFile("PortHog", ".java")
        src.writeText(
            """
            import java.net.ServerSocket;
            import java.net.InetAddress;
            public class PortHog {
              public static void main(String[] a) throws Exception {
                ServerSocket s = new ServerSocket(
                    Integer.parseInt(a[0]), 50, InetAddress.getByName("127.0.0.1"));
                System.out.println("READY");
                System.out.flush();
                while (true) Thread.sleep(1000);
              }
            }
            """.trimIndent()
        )
        // `java Foo.java` runs a single source file directly — no javac step needed.
        val proc = ProcessBuilder(javaBin(), src.absolutePath, port.toString())
            .redirectErrorStream(true)
            .start()
        hog = proc

        val reader = proc.inputStream.bufferedReader()
        val deadline = System.currentTimeMillis() + 60_000
        while (System.currentTimeMillis() < deadline) {
            if (!proc.isAlive) fail<Unit>("port-hog process died before binding $port")
            val line = reader.readLine() ?: continue
            if (line.contains("READY")) return
        }
        fail<Unit>("port-hog process did not bind $port in time")
    }

    @Test
    fun `finds a real process listening on a port`() {
        val port = freePort()
        occupyPort(port)

        val pids = StaleBackendReclaimer().listeningPids(port)

        assertEquals(
            listOf(hog!!.pid()), pids,
            "the helper holding $port should be the only pid reported",
        )
    }

    @Test
    fun `reclaims a real process and confirms the port is free`() {
        val port = freePort()
        occupyPort(port)

        val result = StaleBackendReclaimer().reclaim(port)

        assertEquals(
            StaleBackendReclaimer.Result.Reclaimed(listOf(hog!!.pid())), result,
            "reclaim should terminate the holder and confirm it is gone",
        )
        assertFalse(hog!!.isAlive, "the holder process must actually be dead")
        // The point of reclaiming: the port can be bound again straight afterwards.
        ServerSocket(port, 50, java.net.InetAddress.getByName("127.0.0.1")).close()
    }

    @Test
    fun `reports nothing to reclaim for a port no one holds`() {
        val port = freePort()

        assertEquals(
            StaleBackendReclaimer.Result.NothingToReclaim,
            StaleBackendReclaimer().reclaim(port),
        )
    }

    @Test
    fun `reboot clears a real holder and then runs the caller's restart`() {
        val port = freePort()
        occupyPort(port)
        val order = mutableListOf<String>()

        val outcome = BackendRebooter().reboot(port) {
            // Whether the port is free by the time the restart runs is the whole contract:
            // a restart that collides here is what reproduces the original failure.
            ServerSocket(port, 50, java.net.InetAddress.getByName("127.0.0.1")).close()
            order.add("restart")
        }

        assertEquals(BackendRebooter.Outcome.Restarted(listOf(hog!!.pid())), outcome)
        assertEquals(listOf("restart"), order, "the caller's restart must have run")
    }
}
