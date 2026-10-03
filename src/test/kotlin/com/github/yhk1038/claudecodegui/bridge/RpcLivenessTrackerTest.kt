package com.github.yhk1038.claudecodegui.bridge

import com.github.yhk1038.claudecodegui.bridge.RpcLivenessTracker.Verdict
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class RpcLivenessTrackerTest {

    /** A hand-driven clock, so each test describes elapsed time rather than sleeping. */
    private class FakeClock(var at: Long = 1_000_000L) {
        fun advance(ms: Long) {
            at += ms
        }
    }

    private val interval = RpcLivenessTracker.INTERVAL_MS
    private val limit = RpcLivenessTracker.SILENCE_LIMIT_MS

    private fun tracker(clock: FakeClock) = RpcLivenessTracker(now = { clock.at })

    @Test
    fun `a backend that keeps answering pings is never declared dead`() {
        val clock = FakeClock()
        val tracker = tracker(clock)

        // An hour of rounds, every one answered by a pong before the next tick.
        repeat(240) {
            clock.advance(interval)
            assertEquals(Verdict.SEND_PING, tracker.tick(), "round $it must keep pinging")
            tracker.markAlive()
        }
    }

    @Test
    fun `silence exactly at the limit is still alive, one millisecond past it is dead`() {
        val clock = FakeClock()
        val tracker = tracker(clock)

        clock.advance(interval)
        assertEquals(Verdict.SEND_PING, tracker.tick())
        clock.advance(interval)
        assertEquals(Verdict.SEND_PING, tracker.tick())
        clock.advance(interval)
        // 45s of silence: equal to the limit, not over it.
        assertEquals(limit, clock.at - 1_000_000L)
        assertEquals(Verdict.SEND_PING, tracker.tick(), "silence equal to the limit is not dead")

        clock.advance(1)
        assertEquals(Verdict.DEAD, tracker.tick(), "the first tick past the limit must be DEAD")
    }

    @Test
    fun `the first regular tick past the limit is DEAD`() {
        val clock = FakeClock()
        val tracker = tracker(clock)

        val verdicts = (1..4).map {
            clock.advance(interval)
            tracker.tick()
        }

        // 15s, 30s, 45s of silence keep pinging; 60s is the first round over 45s.
        assertEquals(
            listOf(Verdict.SEND_PING, Verdict.SEND_PING, Verdict.SEND_PING, Verdict.DEAD),
            verdicts,
        )
    }

    @Test
    fun `a text frame counts as a sign of life just like a pong`() {
        val clock = FakeClock()
        val tracker = tracker(clock)

        // No pong ever arrives, but the backend keeps sending application messages
        // (the onText path also calls markAlive) between rounds.
        repeat(20) {
            clock.advance(interval / 2)
            tracker.markAlive() // text frame
            clock.advance(interval / 2)
            assertEquals(Verdict.SEND_PING, tracker.tick(), "round $it must keep pinging")
        }
    }

    @Test
    fun `a tick late enough to mean suspend forgives the silence before it`() {
        val clock = FakeClock()
        val tracker = tracker(clock)

        clock.advance(interval)
        assertEquals(Verdict.SEND_PING, tracker.tick())

        // The laptop slept for ten minutes: the next tick is far later than 2 * interval
        // and the socket has been "silent" far longer than the limit.
        clock.advance(10 * 60_000L)
        assertEquals(Verdict.SEND_PING, tracker.tick(), "a suspend must not be billed to the socket")

        // After the reset the count starts over from the resume.
        clock.advance(interval)
        assertEquals(Verdict.SEND_PING, tracker.tick())
        clock.advance(interval)
        assertEquals(Verdict.SEND_PING, tracker.tick())
        clock.advance(interval)
        assertEquals(Verdict.SEND_PING, tracker.tick(), "45s since the resume is not over the limit")
    }

    @Test
    fun `a gap of exactly twice the interval is not treated as suspend`() {
        val clock = FakeClock()
        val tracker = tracker(clock)

        clock.advance(interval)
        tracker.tick()
        clock.advance(interval)
        tracker.tick()
        // 30s since the last tick is the threshold itself, not over it: no forgiveness,
        // so 60s of total silence is DEAD.
        clock.advance(interval * RpcLivenessTracker.SUSPEND_GRACE_FACTOR)
        assertEquals(Verdict.DEAD, tracker.tick())
    }

    @Test
    fun `silence after the suspend reset is declared dead once it passes the limit again`() {
        val clock = FakeClock()
        val tracker = tracker(clock)

        clock.advance(interval)
        tracker.tick()
        clock.advance(10 * 60_000L)
        assertEquals(Verdict.SEND_PING, tracker.tick(), "resume tick forgives")

        val verdicts = (1..4).map {
            clock.advance(interval)
            tracker.tick()
        }
        assertEquals(
            listOf(Verdict.SEND_PING, Verdict.SEND_PING, Verdict.SEND_PING, Verdict.DEAD),
            verdicts,
            "a backend still silent after the resume must be declared dead",
        )
    }
}
