package com.github.yhk1038.claudecodegui.statusbar

import com.github.yhk1038.claudecodegui.bridge.NodeProcessManager.Lifecycle
import com.github.yhk1038.claudecodegui.statusbar.BackendDotState.DotState
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * The dot encodes pure runtime state; the mode/toggle never changes the color
 * except for the single error case (keep-alive ON + process dead). RED must
 * never appear in the on-demand regime — a stopped backend is normal there.
 */
class BackendDotStateTest {

    @Test
    fun `full state matrix`() {
        // lifecycle, keepAlive -> expected dot
        assertEquals(DotState.GREEN, BackendDotState.compute(Lifecycle.RUNNING, false))
        assertEquals(DotState.GREEN, BackendDotState.compute(Lifecycle.RUNNING, true))
        assertEquals(DotState.YELLOW, BackendDotState.compute(Lifecycle.STARTING, false))
        assertEquals(DotState.YELLOW, BackendDotState.compute(Lifecycle.STARTING, true))
        assertEquals(DotState.GRAY, BackendDotState.compute(Lifecycle.DEAD, false))
        assertEquals(DotState.RED, BackendDotState.compute(Lifecycle.DEAD, true))
        assertEquals(DotState.GRAY, BackendDotState.compute(null, false))
        // Never-started with keep-alive ON is a momentary pre-eager-start state,
        // not an error — the dot stays calm.
        assertEquals(DotState.GRAY, BackendDotState.compute(null, true))
    }

    @Test
    fun `tooltip carries state and mode`() {
        assertEquals("Claude Code — Running, keep-alive", BackendDotState.tooltip(Lifecycle.RUNNING, true))
        assertEquals("Claude Code — Running", BackendDotState.tooltip(Lifecycle.RUNNING, false))
        assertEquals("Claude Code — Starting…", BackendDotState.tooltip(Lifecycle.STARTING, false))
        assertEquals("Claude Code — Stopped — starts on demand", BackendDotState.tooltip(Lifecycle.DEAD, false))
        assertEquals("Claude Code — Stopped — starts on demand", BackendDotState.tooltip(null, false))
        assertEquals("Claude Code — Not running — keep-alive on", BackendDotState.tooltip(null, true))
        assertEquals("Claude Code — Not running — expected to be running", BackendDotState.tooltip(Lifecycle.DEAD, true))
    }

    @Test
    fun `card state line`() {
        assertEquals("running (port 63412)", BackendDotState.cardStateLine(Lifecycle.RUNNING, false, 63412))
        assertEquals("running", BackendDotState.cardStateLine(Lifecycle.RUNNING, false, null))
        assertEquals("starting…", BackendDotState.cardStateLine(Lifecycle.STARTING, true, null))
        assertEquals("stopped (starts on demand)", BackendDotState.cardStateLine(Lifecycle.DEAD, false, null))
        assertEquals("not running (keep-alive on)", BackendDotState.cardStateLine(null, true, null))
    }
}
