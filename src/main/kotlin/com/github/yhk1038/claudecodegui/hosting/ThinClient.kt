package com.github.yhk1038.claudecodegui.hosting

/**
 * Whether this JVM is the JetBrains Client — the thin client half of Remote
 * Development — rather than an IDE that owns the project.
 *
 * ## Why this matters
 *
 * In Remote Development the plugin can end up installed on BOTH halves, which
 * is what JetBrains' own install flow offers and what issue #292's reporter
 * did. The two halves are different machines, and only the remote one has the
 * project.
 *
 * With the plugin active on the client, opening the chat starts a SECOND
 * backend — on the client machine. That backend answers, so the chat looks
 * healthy, but it runs `claude` against the client's filesystem. Measured on
 * PhpStorm 2026.2.3: the working directory resolved to
 * `~/Library/Application Support/JetBrains/PhpStorm2026.2/projects/<hash>`,
 * a local scaffold folder, NOT the remote project the user is editing.
 *
 * A chat that looks connected while reading the wrong machine's files is worse
 * than one that says it is disconnected, so the client half stands down: it
 * starts no backend, registers no tool windows, restores no sessions and shows
 * no status widget.
 *
 * Standing down is what makes the remote half visible. Both halves register the
 * same tool-window id, and the client's own registration wins — so the client
 * was covering the remote tool window rather than the platform failing to
 * mirror it. Declining registration here leaves the remote one a slot to
 * arrive in, which is why the sidebar host mode works over Remote Development
 * at all. Editor tabs were never affected; they were mirrored all along.
 *
 * ## How it is detected
 *
 * Two plain system properties, both set by the platform on the client JVM and
 * both readable through the public `System.getProperty`. No internal API is
 * involved, so this stays clear of the Marketplace's internal-API gate.
 *
 * Verified on the client JVM's own log line (`JVM options`):
 * `-Didea.platform.prefix=JetBrainsClient` and
 * `-Dintellij.platform.product.mode=frontend`.
 *
 * Either one is enough. They are independent signals for the same fact, and a
 * platform that renames one is unlikely to rename both in the same release.
 */
object ThinClient {

    /** System property naming the platform build; the client sets it to [CLIENT_PREFIX]. */
    const val PLATFORM_PREFIX_PROPERTY = "idea.platform.prefix"

    /** Value [PLATFORM_PREFIX_PROPERTY] carries on the JetBrains Client. */
    const val CLIENT_PREFIX = "JetBrainsClient"

    /** System property naming which half of a split IDE this JVM is. */
    const val PRODUCT_MODE_PROPERTY = "intellij.platform.product.mode"

    /** Value [PRODUCT_MODE_PROPERTY] carries on the JetBrains Client. */
    const val FRONTEND_MODE = "frontend"

    /**
     * Decide from the two raw property values, so the rule is unit-testable
     * without a running IDE.
     */
    fun isThinClient(platformPrefix: String?, productMode: String?): Boolean =
        platformPrefix == CLIENT_PREFIX || productMode == FRONTEND_MODE

    /** Read the production system properties and apply [isThinClient]. */
    fun isThinClient(): Boolean = isThinClient(
        System.getProperty(PLATFORM_PREFIX_PROPERTY),
        System.getProperty(PRODUCT_MODE_PROPERTY),
    )
}
