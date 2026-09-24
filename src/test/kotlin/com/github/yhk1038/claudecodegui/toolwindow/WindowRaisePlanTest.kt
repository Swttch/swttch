package com.github.yhk1038.claudecodegui.toolwindow

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Guards what a click on a desktop banner does to the IDE window.
 *
 * The defect these tests are written against: the raise sequence used to ask
 * `java.awt.Frame.isActive` whether a step had worked, and stop when it said
 * yes. Measured on Windows 11 26200.9457, that reading says yes while the window
 * is still behind the browser — Windows answers a foreground request it refuses
 * by highlighting the taskbar button, and AWT reads that state as active. So the
 * sequence stopped at [RaiseStep.ASK] every time, and the two steps that were
 * measured to actually raise the window never ran.
 *
 * Hence these invariants, and nothing about success anywhere in them:
 *  - on Windows every step runs, in order;
 *  - on macOS only the first one runs, because that platform was measured to
 *    need nothing more and the other two would show as a window flickering for
 *    no reason;
 *  - on Linux only the first one runs, for a harder reason: MINIMISE_CYCLE was
 *    measured to leave the window `Iconic` there, so escalating hides the very
 *    window the click asked for.
 */
class WindowRaisePlanTest {

    @Test
    fun `on Windows the plan is all three steps, quietest first`() {
        assertEquals(
            listOf(RaiseStep.ASK, RaiseStep.TOPMOST_FLICKER, RaiseStep.MINIMISE_CYCLE),
            WindowRaisePlan.stepsFor(isMac = false, isLinux = false),
        )
    }

    @Test
    fun `on macOS the plan is the first step alone`() {
        assertEquals(listOf(RaiseStep.ASK), WindowRaisePlan.stepsFor(isMac = true))
    }

    /**
     * Measured in the Linux bench (Debian 12, Xvfb, openbox): the restore inside
     * MINIMISE_CYCLE does not take, and the IDE is left `Iconic / IsUnMapped`
     * after the user clicked the banner. Escalating there does not merely fail
     * to help, it hides the window the click asked for.
     */
    @Test
    fun `on Linux the plan stops before the step that leaves the window minimised`() {
        val linux = WindowRaisePlan.stepsFor(isMac = false, isLinux = true)
        assertEquals(listOf(RaiseStep.ASK), linux)
        assertTrue(RaiseStep.MINIMISE_CYCLE !in linux) {
            "MINIMISE_CYCLE leaves the Linux window iconified; it must not be planned there"
        }
    }

    /**
     * The regression test proper: the runner carries out every step it is given.
     *
     * There is deliberately no way to tell it that a step succeeded. If a "did it
     * work" check ever comes back, it has to come back through this signature,
     * and this test is where it will be noticed.
     */
    @Test
    fun `off macOS every step is carried out, in order`() {
        val performed = mutableListOf<RaiseStep>()

        WindowRaisePlan.run(
            steps = WindowRaisePlan.stepsFor(isMac = false),
            perform = { performed += it },
            settle = { next -> next() },
            afterSettling = {},
        )

        assertEquals(
            listOf(RaiseStep.ASK, RaiseStep.TOPMOST_FLICKER, RaiseStep.MINIMISE_CYCLE),
            performed,
        )
    }

    @Test
    fun `on macOS the run stops after the first step`() {
        val performed = mutableListOf<RaiseStep>()

        WindowRaisePlan.run(
            steps = WindowRaisePlan.stepsFor(isMac = true),
            perform = { performed += it },
            settle = { next -> next() },
            afterSettling = {},
        )

        assertEquals(listOf(RaiseStep.ASK), performed)
    }

    /**
     * Each step is separated from the next by a turn of the event loop, and the
     * caller gets its chance to record what was tried inside that gap.
     *
     * The separation is not decoration: a window manager is told about a state
     * change when a turn ends, so a minimise and a restore issued in one turn
     * arrive as one change and cancel out. A runner that ignored [settle] and
     * simply looped would pass the ordering test above and still break the one
     * step that depends on the gap.
     */
    @Test
    fun `a step waits for the gap before the next one starts`() {
        val order = mutableListOf<String>()
        val pending = mutableListOf<() -> Unit>()

        WindowRaisePlan.run(
            steps = WindowRaisePlan.stepsFor(isMac = false),
            perform = { order += "perform $it" },
            settle = { next -> pending += next },
            afterSettling = { order += "recorded $it" },
        )

        // Nothing but the first step has happened: the rest is waiting on a gap
        // that this test has not let pass yet.
        assertEquals(listOf("perform ${RaiseStep.ASK}"), order)

        // Let the gaps pass one at a time, the way the Swing timer would.
        while (pending.isNotEmpty()) {
            pending.removeAt(0).invoke()
        }

        assertEquals(
            listOf(
                "perform ${RaiseStep.ASK}",
                "recorded ${RaiseStep.ASK}",
                "perform ${RaiseStep.TOPMOST_FLICKER}",
                "recorded ${RaiseStep.TOPMOST_FLICKER}",
                "perform ${RaiseStep.MINIMISE_CYCLE}",
                "recorded ${RaiseStep.MINIMISE_CYCLE}",
            ),
            order,
        )
    }

    /** An empty plan is a no-op rather than an exception, on any platform. */
    @Test
    fun `an empty plan does nothing`() {
        var performed = 0

        WindowRaisePlan.run(
            steps = emptyList(),
            perform = { performed++ },
            settle = { next -> next() },
            afterSettling = {},
        )

        assertEquals(0, performed)
    }

    /**
     * macOS's plan is the beginning of everyone else's, so the quiet step is
     * always the one that runs first wherever a raise is attempted.
     */
    @Test
    fun `every platform asks properly before it escalates`() {
        val mac = WindowRaisePlan.stepsFor(isMac = true)
        val other = WindowRaisePlan.stepsFor(isMac = false, isLinux = false)
        assertEquals(RaiseStep.ASK, other.first())
        assertTrue(other.take(mac.size) == mac) {
            "the macOS plan should be the start of the other platforms' plan, got $mac and $other"
        }
    }
}
