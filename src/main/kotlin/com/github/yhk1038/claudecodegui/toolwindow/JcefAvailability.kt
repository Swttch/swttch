package com.github.yhk1038.claudecodegui.toolwindow

/**
 * Why the chat cannot be hosted — not merely that it cannot.
 *
 * Two IDEs fail the same check for opposite reasons and need opposite
 * instructions, so collapsing them into one boolean produces advice that sends
 * users somewhere useless (issue #321).
 *
 * This enum deliberately names no JCEF type. The panels that read it are
 * `Component`s, and AWT resolves every member signature while their constructor
 * runs — see [ClaudeCodePanelSignatureTest][com.github.yhk1038.claudecodegui.toolwindow]
 * and the guard it protects.
 */
enum class JcefAvailability {
    /** JCEF is present and the runtime can drive it. */
    AVAILABLE,

    /**
     * The JCEF classes loaded, but this runtime cannot host a browser — either
     * `isSupported()` said so, or the runtime's JCEF disagrees with the
     * platform's own copy (issue #295).
     *
     * Fixable by choosing a JCEF-enabled boot runtime.
     */
    RUNTIME_UNSUPPORTED,

    /**
     * `com.intellij.ui.jcef` is not in the class loader at all.
     *
     * Android Studio 2026.2 moved JCEF out of the IDE core into the separate
     * "Web Browser (JCEF)" marketplace plugin and does not bundle it. Verified
     * on 2026.2.1 Canary 2: booting a fully JCEF-enabled JBR 25.0.3 leaves
     * `com.intellij.modules.jcef` unresolved, because the runtime supplies
     * `org.cef.*` while the missing `com.intellij.ui.jcef` is platform code the
     * IDE has to carry. **Only installing that plugin fixes this.**
     */
    CLASSES_ABSENT;

    val isUsable: Boolean get() = this == AVAILABLE
}

/** Developer-only escape hatch for reaching the fallback screens without a real IDE that lacks JCEF. */
private const val SIMULATE_UNSUPPORTED_PROPERTY = "claude.simulate.no.jcef"

/** As above, for the harder case — the panel that tells the user to install the plugin. */
private const val SIMULATE_ABSENT_PROPERTY = "claude.simulate.absent.jcef"

/**
 * Classifies the outcome of [probe], which is expected to call
 * `JBCefApp.isSupported()`.
 *
 * [probe] is a lambda rather than a direct call so this rule stays free of JCEF
 * types and can be unit-tested — and so the caller, not this function, owns the
 * one place that touches a class which may not exist.
 *
 * The two error shapes are not interchangeable:
 *  - [NoClassDefFoundError] / [ClassNotFoundException] — the package is gone, so
 *    no runtime choice brings it back → [JcefAvailability.CLASSES_ABSENT]
 *  - any other [LinkageError] (notably [NoSuchMethodError], issue #295) — the
 *    classes are there but mismatched, which a different runtime does fix
 *    → [JcefAvailability.RUNTIME_UNSUPPORTED]
 */
internal fun resolveJcefAvailability(
    simulateUnsupported: Boolean = java.lang.Boolean.getBoolean(SIMULATE_UNSUPPORTED_PROPERTY),
    simulateAbsent: Boolean = java.lang.Boolean.getBoolean(SIMULATE_ABSENT_PROPERTY),
    probe: () -> Boolean,
): JcefAvailability {
    if (simulateAbsent) return JcefAvailability.CLASSES_ABSENT
    if (simulateUnsupported) return JcefAvailability.RUNTIME_UNSUPPORTED

    return try {
        if (probe()) JcefAvailability.AVAILABLE else JcefAvailability.RUNTIME_UNSUPPORTED
    } catch (e: NoClassDefFoundError) {
        JcefAvailability.CLASSES_ABSENT
    } catch (e: ClassNotFoundException) {
        JcefAvailability.CLASSES_ABSENT
    } catch (e: LinkageError) {
        JcefAvailability.RUNTIME_UNSUPPORTED
    }
}
