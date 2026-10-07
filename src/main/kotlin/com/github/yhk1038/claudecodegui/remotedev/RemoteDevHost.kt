package com.github.yhk1038.claudecodegui.remotedev

/**
 * Whether this JVM is the HOST half of Remote Development: an IDE started by the
 * Remote Development launcher, which keeps running while clients come and go.
 *
 * Not the same as [com.github.yhk1038.claudecodegui.hosting.ThinClient], which is the
 * other half. A host with no client attached is indistinguishable from a local IDE by
 * looking at its connected clients alone, so the plugin asks the launcher's own marker.
 *
 * Measured on PhpStorm 2026.2.3 started with remote-dev-server.sh: the host JVM carries
 * `ide.started.from.remote.dev.launcher=true`, a plain system property readable through
 * the public System.getProperty. No internal API is involved.
 */
object RemoteDevHost {

    /** System property the Remote Development launcher sets on the host JVM. */
    const val LAUNCHER_PROPERTY = "ide.started.from.remote.dev.launcher"

    /** Decide from the raw property value, so the rule is unit-testable without an IDE. */
    fun isHost(launcherProperty: String?): Boolean = launcherProperty == "true"

    fun isRunningAsHost(): Boolean = isHost(System.getProperty(LAUNCHER_PROPERTY))
}
