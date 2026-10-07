package com.github.yhk1038.claudecodegui.remotedev

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.diagnostic.Logger
import kotlinx.coroutines.delay

/**
 * Makes the backend's port reachable from the machine the webview actually runs on.
 *
 * Locally the two are the same machine and there is nothing to do. Under JetBrains
 * Remote Development they are not: the backend binds `127.0.0.1:<port>` on the
 * remote host, while the webview runs inside JetBrains Client on the user's own
 * machine, where that address is their own loopback. Without forwarding, the panel
 * loads a URL pointing at nothing and reports "Backend disconnected. Reconnecting…"
 * forever ([#292](https://github.com/Swttch/swttch/issues/292)).
 *
 * The IDE can forward it for us, through `PerClientPortForwardingManager` in the
 * Remote Development plugin. That API is reached by **reflection**, deliberately:
 *
 *  - it is not bundled in every IDE (IntelliJ IDEA Community, which this project
 *    compiles against, does not ship it), so a compile-time dependency would break
 *    the build rather than just the feature;
 *  - it is `@ApiStatus.Experimental` and may change between releases.
 *
 * CONTRIBUTING.md asks for exactly this treatment for risky APIs. Every failure
 * path returns the host port unchanged, which is correct for a local IDE and no
 * worse than the previous behaviour anywhere else.
 */
object ClientPortForwarder {

    private val logger = Logger.getInstance(ClientPortForwarder::class.java)

    private const val PKG = "com.jetbrains.rd.platform.codeWithMe.portForwarding"

    /** Shown against the port in the client's Port Forwarding view. */
    private const val LABEL = "Claude Code"

    /** How long a panel may wait for the client to bind the forwarded port. */
    private const val ASSIGNMENT_TIMEOUT_MS = 5_000L
    private const val POLL_INTERVAL_MS = 100L

    /**
     * [hostPort] translated for the webview's machine, or [hostPort] itself when
     * forwarding is unnecessary or fails.
     *
     * A panel that opens against an unreachable port is a bad experience; a panel
     * that fails to open at all is worse. So nothing here throws.
     *
     * The answer says WHY when it falls back ([ClientPort.fallback]). Under Remote
     * Development the fallback port is a dead address, and the page that loads
     * from it can draw its shell (the IDE relays the page's HTTP) but never
     * connect (it does not relay WebSocket), so the panel sits on "Backend
     * disconnected" with nothing on screen or in a log to say the forward is what
     * failed (issue #473). A local IDE has nothing to forward, and that is not a
     * fallback: [ClientPort.fallback] is null for it.
     */
    fun resolve(hostPort: Int): ClientPort =
        resolve(hostPort, EdtRunner(), ASSIGNMENT_TIMEOUT_MS, RemoteDevHost.isRunningAsHost())

    /**
     * [resolve] with the two things a test cannot get from a plain JVM handed in:
     * the EDT hop ([edt]) and how long to wait for the client ([assignmentTimeoutMs]).
     */
    internal fun resolve(
        hostPort: Int,
        edt: EdtRunner,
        assignmentTimeoutMs: Long,
        isRemoteDevHost: Boolean,
    ): ClientPort = try {
        // Look for remote clients first, off the EDT. In a local IDE there are
        // none, so this is where the whole thing ends: no EDT round trip, no
        // forwarding, and the backend's own port is returned — which is the
        // correct answer when the webview is on this machine.
        val managers = remoteClientManagers() ?: return if (isRemoteDevHost) {
            // No client is attached YET. On a Remote Development host that is not the
            // same as a local IDE: the host starts first and restores its panels, and
            // the client attaches later, so the page being built now will be drawn on
            // a machine this port means nothing to (issue #473). Answering "local"
            // here left every panel restored at host start on a dead address for good.
            logger.info("No remote client is connected yet; backend port $hostPort will be forwarded when one is")
            ClientPort(hostPort, fallback = ForwardFallback.NO_CLIENT_YET)
        } else {
            ClientPort(hostPort, fallback = null)
        }

        // Creating the forward asserts it is on the Event Dispatch Thread
        // (PortForwardingManagerImpl.createDirectPort) and this runs from the
        // panel's coroutine, so that call — and only that call — goes to the EDT.
        // The wait for the client to bind its end deliberately does not: it can
        // take seconds, and the EDT must never be held for them.
        val attempt = edt.run { forwardOnAny(managers, hostPort) }
        val forwarded = attempt?.forwarded
        if (forwarded == null) {
            fellBack(hostPort, attempt?.failure ?: ForwardFallback.FAILED)
        } else {
            val clientPort = awaitCounterpartPort(forwarded, edt, assignmentTimeoutMs)
            if (clientPort == null) fellBack(hostPort, ForwardFallback.NOT_ASSIGNED) else ClientPort(clientPort, fallback = null)
        }
    } catch (t: Throwable) {
        logger.warn("Forwarding backend port $hostPort to the client failed; using the host port", t)
        ClientPort(hostPort, fallback = ForwardFallback.FAILED)
    }

    /** The host port, with the [reason] it is being used logged where the host's own log can show it. */
    private fun fellBack(hostPort: Int, reason: ForwardFallback): ClientPort {
        logger.warn(
            "Backend port $hostPort was not forwarded to the client (${reason.wire}); " +
                "the panel will load but cannot connect until it is. ${reason.explanation}",
        )
        return ClientPort(hostPort, fallback = reason)
    }

    /**
     * The port-forwarding managers of connected **remote** clients, or null when
     * there are none — which is every local IDE.
     *
     * `getAllInstances()` resolves to `getServices(..., ClientKind.REMOTE)`, so a
     * monolith IDE returns an empty list however the plugin is installed. That is
     * what keeps a local install untouched by any of this: same port, same URL, no
     * forwarding, no EDT hop. Safe to call off the EDT — it is a service lookup;
     * the threading assertion lives further in, in `createDirectPort`.
     */
    private fun remoteClientManagers(): Pair<Class<*>, List<Any>>? {
        val managerClass = try {
            Class.forName("$PKG.PerClientPortForwardingManager")
        } catch (_: ClassNotFoundException) {
            // No Remote Development plugin in this IDE at all.
            return null
        }

        val companion = managerClass.getField("Companion").get(null)
        val managers = (companion.javaClass
            .getMethod("getAllInstances")
            .invoke(companion) as? List<*>)
            ?.filterNotNull()
            ?.takeIf { it.isNotEmpty() } ?: return null

        return managerClass to managers
    }

    /**
     * What one try at forwarding produced: the `ForwardedPort` when it worked,
     * otherwise the [failure] that says why not.
     */
    private class Attempt(val forwarded: Any?, val failure: ForwardFallback?)

    /**
     * The first forward obtained from any of [managers]. EDT only.
     *
     * There is normally exactly one manager. With several, only the first one that
     * forwards is used, and the port it assigns is the one on THAT client. A panel
     * opened from another connected client would be handed a port that client does
     * not listen on, and the plugin has no way to tell which client a panel belongs
     * to. The case is rare, so it is logged rather than guessed at.
     */
    private fun forwardOnAny(managers: Pair<Class<*>, List<Any>>, hostPort: Int): Attempt {
        val (managerClass, instances) = managers
        if (instances.size > 1) {
            logger.warn(
                "${instances.size} remote clients are connected; backend port $hostPort is forwarded " +
                    "to the first one only, so a panel opened from another client cannot reach it",
            )
        }
        var failure: ForwardFallback? = null
        for (manager in instances) {
            val attempt = forwardOn(managerClass, manager, hostPort)
            if (attempt.forwarded != null) return attempt
            failure = failure ?: attempt.failure
        }
        return Attempt(forwarded = null, failure = failure)
    }

    /** The `ForwardedPort` for [hostPort] on [manager], creating one if needed. EDT only. */
    private fun forwardOn(managerClass: Class<*>, manager: Any, hostPort: Int): Attempt {
        val enabled = managerClass.getMethod("isPortForwardingEnabled").invoke(manager) as? Boolean
        if (enabled != true) return Attempt(forwarded = null, failure = ForwardFallback.FORWARDING_DISABLED)

        // Reuse a forward this backend already has: panels open and reload far more
        // often than the backend restarts, and forwarding the same port repeatedly
        // would pile up duplicates in the user's Port Forwarding view.
        (managerClass.getMethod("getPorts", Int::class.javaPrimitiveType)
            .invoke(manager, hostPort) as? List<*>)?.filterNotNull()?.firstOrNull()
            ?.let { return Attempt(forwarded = it, failure = null) }

        val unavailable = Attempt(forwarded = null, failure = ForwardFallback.API_UNAVAILABLE)
        val portType = enumValue("$PKG.PortType", "TCP") ?: return unavailable
        val strategyClass = Class.forName("$PKG.ClientPortPickingStrategy")
        // REASSIGN_WHEN_BUSY: asking for the same number on both sides keeps logs
        // readable, but a client already using it must get another port, not an error.
        val strategy = enumValue("$PKG.ClientPortPickingStrategy", "REASSIGN_WHEN_BUSY") ?: return unavailable
        val attributesClass = Class.forName("$PKG.ClientPortAttributes")
        val attributes = attributesClass
            .getConstructor(Int::class.javaPrimitiveType, strategyClass)
            .newInstance(hostPort, strategy)

        val presentation: (Any?) -> Unit = { }
        val forwarded = managerClass.getMethod(
            "forwardPort",
            Int::class.javaPrimitiveType,
            portType.javaClass.let { if (it.isAnonymousClass) it.superclass else it },
            Set::class.java,
            attributesClass,
            kotlin.jvm.functions.Function1::class.java,
        ).invoke(manager, hostPort, portType, setOf(LABEL), attributes, presentation)
        return Attempt(forwarded = forwarded, failure = null)
    }

    /**
     * The client-side port of a `ForwardedPort`, or null when it has none yet.
     *
     * Assignment is asynchronous — the client has to bind the port and report back.
     * Polling rather than registering a `ForwardedPortListener` keeps this free of a
     * dynamic proxy for an experimental interface, at the cost of up to
     * [POLL_INTERVAL_MS] of latency.
     */
    private fun counterpartPort(forwardedPort: Any): Int? =
        (forwardedPort.javaClass.methods.firstOrNull { it.name == "getCounterpartPortNumber" }
            ?.invoke(forwardedPort) as? Int)?.takeIf { it > 0 }

    /** [counterpartPort], waited on until assigned or [timeoutMs] passes. */
    private fun awaitCounterpartPort(forwardedPort: Any, edt: EdtRunner, timeoutMs: Long): Int? {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (true) {
            edt.run { counterpartPort(forwardedPort) }?.let {
                logger.info("Backend port is reachable from the client on $it")
                return it
            }
            if (System.currentTimeMillis() >= deadline) return null
            try {
                Thread.sleep(POLL_INTERVAL_MS)
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
                return null
            }
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun enumValue(className: String, name: String): Any? = try {
        java.lang.Enum.valueOf(Class.forName(className) as Class<out Enum<*>>, name) as Any
    } catch (t: Throwable) {
        logger.warn("Remote Development port forwarding: $className.$name is unavailable", t)
        null
    }

    /**
     * Which remote clients are attached right now, as a set of identities that is
     * empty when none is. Cheap and safe off the EDT: a service lookup, with no forward
     * created and no EDT hop. A client that leaves and one that arrives are different
     * members, so a reconnect changes the set even when the count stays the same.
     */
    internal fun attachedClients(): Set<Int> = try {
        remoteClientManagers()?.second?.map { System.identityHashCode(it) }?.toSet() ?: emptySet()
    } catch (t: Throwable) {
        logger.warn("Could not look up the attached remote clients", t)
        emptySet()
    }

    /**
     * Calls [onChanged] each time the set of attached clients differs from the one
     * seen before, until [isStillWanted] says to stop (issue #473).
     *
     * The forwarded port belongs to the client it was made for. A host keeps running
     * while clients come and go, so a panel built for one client is on a dead address
     * for the next: measured on PhpStorm 2026.2.3, a client that disconnected and came
     * back found the restored panel on "Backend disconnected" for good. [initial] is the
     * set at the moment the panel was built, taken BEFORE its port was resolved so a
     * client attaching in between is still seen as a change.
     */
    suspend fun watchAttachedClients(
        pollMs: Long,
        initial: Set<Int>,
        isStillWanted: () -> Boolean,
        attached: () -> Set<Int> = ::attachedClients,
        onChanged: () -> Unit,
    ) {
        var seen = initial
        while (isStillWanted()) {
            delay(pollMs)
            if (!isStillWanted()) return
            val now = attached()
            if (now != seen) {
                seen = now
                onChanged()
            }
        }
    }

    /**
     * Ask again, waiting each of [delaysMs] first, until the IDE grants the forward
     * (issue #473). [resolve] is one ask; [isStillWanted] is checked after every wait
     * so a closed panel or a backend that has moved to another port stops the asking.
     *
     * Only the first ask can have failed for a reason the user or time can clear, and
     * that is the caller's call: this does not look at why, it just asks.
     */
    suspend fun retryUntilForwarded(
        delaysMs: Sequence<Long>,
        isStillWanted: () -> Boolean,
        resolve: () -> ClientPort,
    ): RetryOutcome {
        for (delayMs in delaysMs) {
            delay(delayMs)
            if (!isStillWanted()) return RetryOutcome.NO_LONGER_WANTED
            if (resolve().fallback == null) return RetryOutcome.FORWARDED
        }
        return RetryOutcome.GAVE_UP
    }
}

/** How [ClientPortForwarder.retryUntilForwarded] ended. */
enum class RetryOutcome {
    /** The IDE granted the forward; the page should reload onto it. */
    FORWARDED,

    /** Every wait passed and the IDE still had not granted it. */
    GAVE_UP,

    /** The panel closed or the backend moved, so there is nothing left to forward for. */
    NO_LONGER_WANTED,
}

/**
 * Runs a block on the Event Dispatch Thread and hands back its result, or null when
 * the block produced none. A class rather than a function so a test can stand in for
 * the IDE's EDT, which a plain JVM does not have.
 */
open class EdtRunner {
    open fun <T> run(block: () -> T): T? {
        val app = ApplicationManager.getApplication()
        if (app.isDispatchThread) return block()
        var result: T? = null
        var failure: Throwable? = null
        app.invokeAndWait({
            try {
                result = block()
            } catch (t: Throwable) {
                failure = t
            }
        }, ModalityState.any())
        failure?.let { throw it }
        return result
    }
}

/**
 * The port a webview should load, and why it is not a forwarded one when it is not.
 *
 * [fallback] is null when the port is right for the webview's machine: a forwarded
 * port under Remote Development, or the backend's own port in a local IDE.
 */
class ClientPort(val port: Int, val fallback: ForwardFallback?)

/**
 * Why [ClientPortForwarder.resolve] handed back the backend's own port while a
 * remote client is connected. Each reason is something a person can act on, so
 * [wire] travels to the webview as the `forwarding` URL param and the connection
 * banner can say which one it is.
 */
enum class ForwardFallback(val wire: String, val explanation: String) {
    /**
     * This IDE is a Remote Development host and no client is attached yet, so there
     * is nobody to forward to. The host starts first and restores its panels before
     * the client attaches.
     */
    NO_CLIENT_YET(
        "no-client",
        "No remote client is connected yet; the panel is forwarded when one attaches.",
    ),

    /** The client's Port Forwarding is switched off, so the IDE refused to forward. */
    FORWARDING_DISABLED(
        "disabled",
        "The client has Port Forwarding turned off; turning it on lets the panel connect.",
    ),

    /** The IDE accepted the forward, but the client did not report a port in time. */
    NOT_ASSIGNED(
        "not-assigned",
        "The client did not bind its end of the forward in time.",
    ),

    /** The Remote Development API does not have the shape this plugin reaches by reflection. */
    API_UNAVAILABLE(
        "api-unavailable",
        "This IDE version's port forwarding API is not one the plugin can call.",
    ),

    /** Anything else threw. The exception is in the log line just above. */
    FAILED(
        "failed",
        "See the exception logged just above.",
    ),
    ;

    /** Whether trying again later can succeed without the user changing anything but time. */
    val isWorthRetrying: Boolean get() = this == NOT_ASSIGNED || this == FORWARDING_DISABLED
}
