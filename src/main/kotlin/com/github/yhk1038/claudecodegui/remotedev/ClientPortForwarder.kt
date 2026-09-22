package com.github.yhk1038.claudecodegui.remotedev

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.diagnostic.Logger

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
     * forwarding is unavailable, unnecessary or fails.
     *
     * A panel that opens against an unreachable port is a bad experience; a panel
     * that fails to open at all is worse. So nothing here throws.
     */
    fun resolve(hostPort: Int): Int = try {
        // Look for remote clients first, off the EDT. In a local IDE there are
        // none, so this is where the whole thing ends: no EDT round trip, no
        // forwarding, and the backend's own port is returned — which is the
        // correct answer when the webview is on this machine.
        val managers = remoteClientManagers() ?: return hostPort

        // Creating the forward asserts it is on the Event Dispatch Thread
        // (PortForwardingManagerImpl.createDirectPort) and this runs from the
        // panel's coroutine, so that call — and only that call — goes to the EDT.
        // The wait for the client to bind its end deliberately does not: it can
        // take seconds, and the EDT must never be held for them.
        val forwarded = onEdt { forwardOnAny(managers, hostPort) } ?: return hostPort
        awaitCounterpartPort(forwarded) ?: hostPort
    } catch (t: Throwable) {
        logger.warn("Forwarding backend port $hostPort to the client failed; using the host port", t)
        hostPort
    }

    /** Runs [block] on the EDT, returning its result. */
    private fun <T> onEdt(block: () -> T): T? {
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
     * The first forward obtained from any of [managers]. EDT only.
     *
     * There is normally exactly one manager. With several they all reach the same
     * backend and each client resolves its own loopback, so the first one serves.
     */
    private fun forwardOnAny(managers: Pair<Class<*>, List<Any>>, hostPort: Int): Any? {
        val (managerClass, instances) = managers
        for (manager in instances) {
            forwardOn(managerClass, manager, hostPort)?.let { return it }
        }
        return null
    }

    /** The `ForwardedPort` for [hostPort] on [manager], creating one if needed. EDT only. */
    private fun forwardOn(managerClass: Class<*>, manager: Any, hostPort: Int): Any? {
        val enabled = managerClass.getMethod("isPortForwardingEnabled").invoke(manager) as? Boolean
        if (enabled != true) return null

        // Reuse a forward this backend already has: panels open and reload far more
        // often than the backend restarts, and forwarding the same port repeatedly
        // would pile up duplicates in the user's Port Forwarding view.
        (managerClass.getMethod("getPorts", Int::class.javaPrimitiveType)
            .invoke(manager, hostPort) as? List<*>)?.filterNotNull()?.firstOrNull()
            ?.let { return it }

        val portType = enumValue("$PKG.PortType", "TCP") ?: return null
        val strategyClass = Class.forName("$PKG.ClientPortPickingStrategy")
        // REASSIGN_WHEN_BUSY: asking for the same number on both sides keeps logs
        // readable, but a client already using it must get another port, not an error.
        val strategy = enumValue("$PKG.ClientPortPickingStrategy", "REASSIGN_WHEN_BUSY") ?: return null
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
        return forwarded
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

    /** [counterpartPort], waited on until assigned or [ASSIGNMENT_TIMEOUT_MS] passes. */
    private fun awaitCounterpartPort(forwardedPort: Any): Int? {
        val deadline = System.currentTimeMillis() + ASSIGNMENT_TIMEOUT_MS
        while (true) {
            onEdt { counterpartPort(forwardedPort) }?.let {
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
}
