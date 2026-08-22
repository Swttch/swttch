package com.github.yhk1038.claudecodegui.toolwindow

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test

/**
 * Guards [resolveJcefAvailability] — the rule that decides *why* the chat cannot
 * be hosted, not merely *that* it cannot.
 *
 * The distinction is the whole point. Two IDEs fail this check for opposite
 * reasons and need opposite instructions:
 *
 *  - Android Studio 2026.1 has the JCEF classes but a runtime that cannot drive
 *    them. Swapping to a JCEF-enabled JBR fixes it.
 *  - Android Studio 2026.2 moved JCEF out of the IDE core into a separate
 *    marketplace plugin and does not bundle it, so the classes are absent
 *    entirely. **Swapping the runtime cannot fix it** — verified by booting a
 *    fully JCEF-enabled JBR 25.0.3 on 2026.2.1 Canary 2 and watching the module
 *    stay unresolved. The JetBrains Runtime supplies `org.cef.*`; the missing
 *    `com.intellij.ui.jcef` is platform code the IDE has to carry.
 *
 * Telling a 2026.2 user to swap runtimes sends them to download a JBR, restart,
 * and land on this same panel (issue #321).
 */
class JcefAvailabilityTest {

    @Nested
    inner class FromProbe {

        @Test
        fun `available when the probe says JCEF is supported`() {
            assertEquals(
                JcefAvailability.AVAILABLE,
                resolveJcefAvailability(probe = { true })
            )
        }

        @Test
        fun `runtime unsupported when the probe answers false`() {
            // The classes loaded and answered — this is the swap-the-runtime case.
            assertEquals(
                JcefAvailability.RUNTIME_UNSUPPORTED,
                resolveJcefAvailability(probe = { false })
            )
        }

        @Test
        fun `classes absent when the probe cannot even be linked`() {
            // The probe body touches com.intellij.ui.jcef, so a missing package
            // surfaces here rather than as a return value.
            assertEquals(
                JcefAvailability.CLASSES_ABSENT,
                resolveJcefAvailability(probe = { throw NoClassDefFoundError("com/intellij/ui/jcef/JBCefApp") })
            )
        }

        @Test
        fun `treats the issue 295 runtime mismatch as a runtime problem, not an absent one`() {
            // NoSuchMethodError means the classes ARE there but disagree with the
            // platform's copy. That is fixable by changing runtime, so it must not
            // be reported as "install the plugin".
            assertEquals(
                JcefAvailability.RUNTIME_UNSUPPORTED,
                resolveJcefAvailability(probe = {
                    throw NoSuchMethodError("boolean com.jetbrains.cef.JCefAppConfig.isRemoteEnabled()")
                })
            )
        }
    }

    @Nested
    inner class Simulation {

        @Test
        fun `simulating an unsupported runtime does not consult the probe`() {
            assertEquals(
                JcefAvailability.RUNTIME_UNSUPPORTED,
                resolveJcefAvailability(
                    simulateUnsupported = true,
                    probe = { error("probe must not run") }
                )
            )
        }

        @Test
        fun `simulating absent classes does not consult the probe`() {
            assertEquals(
                JcefAvailability.CLASSES_ABSENT,
                resolveJcefAvailability(
                    simulateAbsent = true,
                    probe = { error("probe must not run") }
                )
            )
        }

        @Test
        fun `absent wins over unsupported when both are simulated`() {
            // Arbitrary but pinned: absent is the stricter of the two, so a
            // developer who sets both sees the harder case.
            assertEquals(
                JcefAvailability.CLASSES_ABSENT,
                resolveJcefAvailability(
                    simulateUnsupported = true,
                    simulateAbsent = true,
                    probe = { error("probe must not run") }
                )
            )
        }
    }

    @Nested
    inner class Usability {

        @Test
        fun `only AVAILABLE counts as usable`() {
            assertEquals(true, JcefAvailability.AVAILABLE.isUsable)
            assertEquals(false, JcefAvailability.RUNTIME_UNSUPPORTED.isUsable)
            assertEquals(false, JcefAvailability.CLASSES_ABSENT.isUsable)
        }
    }
}
