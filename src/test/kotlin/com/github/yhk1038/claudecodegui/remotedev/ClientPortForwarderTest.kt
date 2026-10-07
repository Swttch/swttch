package com.github.yhk1038.claudecodegui.remotedev

import com.jetbrains.rd.platform.codeWithMe.portForwarding.ForwardedPort
import com.jetbrains.rd.platform.codeWithMe.portForwarding.PerClientPortForwardingManager
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import java.util.concurrent.atomic.AtomicInteger

/**
 * What the panel is told when the backend's port is, or is not, reachable from the
 * machine the webview runs on (issues #292 and #473).
 *
 * The Remote Development API is stood in for by classes of the same names (see
 * PortForwardingStandIn.kt), so the plugin's real reflection code runs here: every
 * way a forward can be refused, slow or broken is walked through and the answer the
 * panel would get is checked.
 */
class ClientPortForwarderTest {

    private val hostPort = 4321

    /** There is no EDT in a plain JVM; the block just runs where it is called. */
    private val directEdt = object : EdtRunner() {
        override fun <T> run(block: () -> T): T? = block()
    }

    private fun resolve(timeoutMs: Long = 300, isRemoteDevHost: Boolean = true) =
        ClientPortForwarder.resolve(hostPort, directEdt, timeoutMs, isRemoteDevHost)

    @BeforeEach
    @AfterEach
    fun noRemoteClientsByDefault() {
        PerClientPortForwardingManager.instances = emptyList()
    }

    @Nested
    inner class LocalIde {
        @Test
        fun `gets its own port back and is not reported as a fallback`() {
            val resolved = ClientPortForwarder.resolve(hostPort)

            assertEquals(hostPort, resolved.port)
            assertNull(resolved.fallback, "a local IDE has nothing to forward, so there is nothing that failed")
        }
    }

    // The host starts first and restores its panels; the client attaches later. A host
    // with nobody attached looks exactly like a local IDE when only the connected
    // clients are counted, and answering "local" left every panel restored at host start
    // on a dead address for good. Measured on PhpStorm 2026.2.3 in Remote Development:
    // the panel restored before the client attached was loaded on the host's own port.
    @Nested
    inner class RemoteDevHostWithoutClient {
        @Test
        fun `is told to wait for a client rather than treated as local`() {
            val resolved = resolve(isRemoteDevHost = true)

            assertEquals(hostPort, resolved.port)
            assertEquals(ForwardFallback.NO_CLIENT_YET, resolved.fallback)
        }

        @Test
        fun `a local IDE with the same empty client list is still local`() {
            val resolved = resolve(isRemoteDevHost = false)

            assertNull(resolved.fallback)
        }

        @Test
        fun `the launcher's marker is what makes an IDE a host`() {
            assertTrue(RemoteDevHost.isHost("true"))
            assertFalse(RemoteDevHost.isHost(null), "a local IDE has no such property")
            assertFalse(RemoteDevHost.isHost("false"))
        }

        @Test
        fun `is not retried on a schedule, because the watcher of attached clients is what ends the wait`() {
            assertFalse(ForwardFallback.NO_CLIENT_YET.isWorthRetrying)
        }
    }

    // A host keeps running while clients come and go. Measured on PhpStorm 2026.2.3: a
    // client that disconnected and came back found the panel on "Backend disconnected"
    // for good, because the page was still on the port forwarded for the client before.
    @Nested
    inner class AttachedClients {
        @Test
        fun `no client attached is an empty set`() {
            assertTrue(ClientPortForwarder.attachedClients().isEmpty())
        }

        @Test
        fun `each attached client is its own member`() {
            PerClientPortForwardingManager.instances =
                listOf(PerClientPortForwardingManager(), PerClientPortForwardingManager())

            assertEquals(2, ClientPortForwarder.attachedClients().size)
        }

        @Test
        fun `a client that left and one that arrived differ even though the count is the same`() {
            PerClientPortForwardingManager.instances = listOf(PerClientPortForwardingManager())
            val before = ClientPortForwarder.attachedClients()

            PerClientPortForwardingManager.instances = listOf(PerClientPortForwardingManager())

            assertEquals(1, before.size)
            assertFalse(before == ClientPortForwarder.attachedClients())
        }

        @Test
        fun `reports a change once and stays quiet while nothing changes`() = runBlocking {
            val sets = ArrayDeque(listOf(setOf(1), setOf(1), setOf(2), setOf(2), setOf(2)))
            val changes = AtomicInteger()
            val looks = AtomicInteger()

            ClientPortForwarder.watchAttachedClients(
                pollMs = 0,
                initial = setOf(1),
                isStillWanted = { looks.get() < 5 },
                attached = { looks.incrementAndGet(); sets.removeFirst() },
                onChanged = { changes.incrementAndGet() },
            )

            assertEquals(1, changes.get(), "set(1) to set(2) is the one change")
        }

        @Test
        fun `a client that attached while the panel was being built is not missed`() = runBlocking {
            val changes = AtomicInteger()
            val looks = AtomicInteger()

            ClientPortForwarder.watchAttachedClients(
                pollMs = 0,
                initial = emptySet(),
                isStillWanted = { looks.get() < 1 },
                attached = { looks.incrementAndGet(); setOf(7) },
                onChanged = { changes.incrementAndGet() },
            )

            assertEquals(1, changes.get())
        }

        @Test
        fun `stops looking once the panel is gone`() = runBlocking {
            val looks = AtomicInteger()

            ClientPortForwarder.watchAttachedClients(
                pollMs = 0,
                initial = emptySet(),
                isStillWanted = { false },
                attached = { looks.incrementAndGet(); setOf(1) },
                onChanged = { error("nothing should be reported for a closed panel") },
            )

            assertEquals(0, looks.get())
        }
    }

    @Nested
    inner class RemoteClient {
        @Test
        fun `a granted forward hands the webview the port on the client's side`() {
            PerClientPortForwardingManager.instances = listOf(PerClientPortForwardingManager())

            val resolved = resolve()

            assertEquals(hostPort + 1000, resolved.port)
            assertNull(resolved.fallback)
        }

        @Test
        fun `Port Forwarding switched off in the client is named, and the host port is returned`() {
            PerClientPortForwardingManager.instances = listOf(PerClientPortForwardingManager(enabled = false))

            val resolved = resolve()

            assertEquals(hostPort, resolved.port)
            assertEquals(ForwardFallback.FORWARDING_DISABLED, resolved.fallback)
        }

        @Test
        fun `a client that never reports its port is named after the wait`() {
            PerClientPortForwardingManager.instances =
                listOf(PerClientPortForwardingManager(onForward = { ForwardedPort(0) }))

            val resolved = resolve(timeoutMs = 250)

            assertEquals(hostPort, resolved.port)
            assertEquals(ForwardFallback.NOT_ASSIGNED, resolved.fallback)
        }

        @Test
        fun `a client that reports its port while the plugin is waiting is used`() {
            val late = ForwardedPort(0)
            PerClientPortForwardingManager.instances = listOf(PerClientPortForwardingManager(onForward = { late }))
            Thread {
                Thread.sleep(150)
                late.counterpartPortNumber = 51234
            }.start()

            val resolved = resolve(timeoutMs = 3_000)

            assertEquals(51234, resolved.port)
            assertNull(resolved.fallback)
        }

        @Test
        fun `a forward that throws is named as a failure and does not escape`() {
            PerClientPortForwardingManager.instances =
                listOf(PerClientPortForwardingManager(onForward = { error("the IDE said no") }))

            val resolved = resolve()

            assertEquals(hostPort, resolved.port)
            assertEquals(ForwardFallback.FAILED, resolved.fallback)
        }

        @Test
        fun `a forward the backend already has is reused instead of created again`() {
            val manager = PerClientPortForwardingManager(existing = mutableListOf(ForwardedPort(47000)))
            PerClientPortForwardingManager.instances = listOf(manager)

            val resolved = resolve()

            assertEquals(47000, resolved.port)
            assertEquals(0, manager.forwardCalls, "forwarding again would pile duplicates into the client's Port Forwarding view")
        }

        @Test
        fun `a second client is tried when the first one refuses`() {
            PerClientPortForwardingManager.instances = listOf(
                PerClientPortForwardingManager(enabled = false),
                PerClientPortForwardingManager(),
            )

            val resolved = resolve()

            assertEquals(hostPort + 1000, resolved.port)
            assertNull(resolved.fallback)
        }

        @Test
        fun `every client refusing is reported as a refusal`() {
            PerClientPortForwardingManager.instances = listOf(
                PerClientPortForwardingManager(enabled = false),
                PerClientPortForwardingManager(enabled = false),
            )

            assertEquals(ForwardFallback.FORWARDING_DISABLED, resolve().fallback)
        }
    }

    @Nested
    inner class Retrying {
        private val noWait = sequenceOf(0L, 0L, 0L)

        @Test
        fun `stops with FORWARDED the moment an ask is granted`() = runBlocking {
            val asks = AtomicInteger()

            val outcome = ClientPortForwarder.retryUntilForwarded(
                delaysMs = noWait,
                isStillWanted = { true },
                resolve = {
                    if (asks.incrementAndGet() < 2) ClientPort(hostPort, ForwardFallback.NOT_ASSIGNED)
                    else ClientPort(51234, fallback = null)
                },
            )

            assertEquals(RetryOutcome.FORWARDED, outcome)
            assertEquals(2, asks.get(), "no ask after the one that was granted")
        }

        @Test
        fun `gives up after the last wait when the IDE never grants it`() = runBlocking {
            val asks = AtomicInteger()

            val outcome = ClientPortForwarder.retryUntilForwarded(
                delaysMs = noWait,
                isStillWanted = { true },
                resolve = { asks.incrementAndGet(); ClientPort(hostPort, ForwardFallback.FORWARDING_DISABLED) },
            )

            assertEquals(RetryOutcome.GAVE_UP, outcome)
            assertEquals(3, asks.get())
        }

        @Test
        fun `a wait with no end keeps asking until a client attaches`() = runBlocking {
            val asks = AtomicInteger()

            val outcome = ClientPortForwarder.retryUntilForwarded(
                delaysMs = generateSequence { 0L },
                isStillWanted = { true },
                resolve = {
                    if (asks.incrementAndGet() < 50) ClientPort(hostPort, ForwardFallback.NO_CLIENT_YET)
                    else ClientPort(51234, fallback = null)
                },
            )

            assertEquals(RetryOutcome.FORWARDED, outcome)
            assertEquals(50, asks.get(), "it did not give up before the client arrived")
        }

        @Test
        fun `a wait with no end still stops when the panel closes`() = runBlocking {
            val asks = AtomicInteger()

            val outcome = ClientPortForwarder.retryUntilForwarded(
                delaysMs = generateSequence { 0L },
                isStillWanted = { asks.get() < 10 },
                resolve = { asks.incrementAndGet(); ClientPort(hostPort, ForwardFallback.NO_CLIENT_YET) },
            )

            assertEquals(RetryOutcome.NO_LONGER_WANTED, outcome)
        }

        @Test
        fun `asks no more once the panel is gone`() = runBlocking {
            val asks = AtomicInteger()

            val outcome = ClientPortForwarder.retryUntilForwarded(
                delaysMs = noWait,
                isStillWanted = { false },
                resolve = { asks.incrementAndGet(); ClientPort(51234, fallback = null) },
            )

            assertEquals(RetryOutcome.NO_LONGER_WANTED, outcome)
            assertEquals(0, asks.get())
        }
    }

    @Nested
    inner class Reasons {
        @Test
        fun `every reason travels under its own name`() {
            val names = ForwardFallback.entries.map { it.wire }

            assertEquals(names.size, names.toSet().size, "two reasons share a wire name: $names")
            assertTrue(names.all { it.isNotBlank() })
        }

        @Test
        fun `only reasons that time or the user can clear are retried`() {
            assertTrue(ForwardFallback.NOT_ASSIGNED.isWorthRetrying)
            assertTrue(ForwardFallback.FORWARDING_DISABLED.isWorthRetrying)
            assertFalse(ForwardFallback.API_UNAVAILABLE.isWorthRetrying, "a changed API does not change by waiting")
            assertFalse(ForwardFallback.FAILED.isWorthRetrying)
        }
    }
}
