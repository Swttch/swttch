package com.jetbrains.rd.platform.codeWithMe.portForwarding

/**
 * A stand-in for the Remote Development plugin's port forwarding API, living under
 * the SAME class names the plugin reaches by reflection.
 *
 * The real API ships only in IDEs that bundle Remote Development, and the project
 * compiles against one that does not, so a unit test cannot call it. This stand-in
 * gives `ClientPortForwarder` something to find by name, which lets its real
 * reflection code run end to end: look up the manager, ask whether forwarding is on,
 * reuse or create a forward, and wait for the client to report its port.
 *
 * Only the members `ClientPortForwarder` touches exist here, with the shapes it
 * expects (`Companion.getAllInstances()`, `isPortForwardingEnabled()`,
 * `getPorts(Int)`, `forwardPort(Int, PortType, Set, ClientPortAttributes, Function1)`,
 * `ForwardedPort.getCounterpartPortNumber()`). If the real API changes shape, this
 * does NOT notice: it pins how the plugin behaves given the shape it assumed, not
 * that the assumption is still true.
 */
enum class PortType { TCP }

enum class ClientPortPickingStrategy { REASSIGN_WHEN_BUSY }

class ClientPortAttributes(val port: Int, val strategy: ClientPortPickingStrategy)

/** A port the IDE forwards. 0 until the client has bound its end. */
class ForwardedPort(var counterpartPortNumber: Int)

class PerClientPortForwardingManager(
    var enabled: Boolean = true,
    val existing: MutableList<ForwardedPort> = mutableListOf(),
    var onForward: (Int) -> ForwardedPort = { ForwardedPort(it + 1000) },
) {
    var forwardCalls = 0

    fun isPortForwardingEnabled(): Boolean = enabled

    fun getPorts(port: Int): List<ForwardedPort> = existing

    fun forwardPort(
        port: Int,
        type: PortType,
        labels: Set<String>,
        attributes: ClientPortAttributes,
        presentation: (Any?) -> Unit,
    ): ForwardedPort {
        forwardCalls++
        return onForward(port).also { existing.add(it) }
    }

    companion object {
        /** What the connected remote clients are. Empty is a local IDE. */
        var instances: List<PerClientPortForwardingManager> = emptyList()

        fun getAllInstances(): List<PerClientPortForwardingManager> = instances
    }
}
