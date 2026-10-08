package com.github.yhk1038.claudecodegui.toolwindow

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

/**
 * When the panel loads its page again because the backend moved to another port.
 *
 * The backend asks for the port it had last time when it restarts, so a live port change is
 * rare and cannot be forced on a bench. The decision is judged here instead.
 */
class StalePortJudgeTest {

    @Test
    fun `the same port is never stale`() {
        val judge = StalePortJudge()

        repeat(5) { assertNull(judge.portToLoad(loaded = 41117, current = 41117, restarting = false)) }
    }

    @Test
    fun `a different port must show twice in a row before the page is loaded again`() {
        val judge = StalePortJudge()

        assertNull(judge.portToLoad(loaded = 41117, current = 36021, restarting = false))
        assertEquals(36021, judge.portToLoad(loaded = 41117, current = 36021, restarting = false))
    }

    @Test
    fun `a port that goes back to the loaded one in between resets the count`() {
        val judge = StalePortJudge()

        assertNull(judge.portToLoad(loaded = 41117, current = 36021, restarting = false))
        assertNull(judge.portToLoad(loaded = 41117, current = 41117, restarting = false))
        assertNull(judge.portToLoad(loaded = 41117, current = 36021, restarting = false))
    }

    @Test
    fun `nothing is judged while the backend has no port`() {
        val judge = StalePortJudge()

        assertNull(judge.portToLoad(loaded = 41117, current = 36021, restarting = false))
        assertNull(judge.portToLoad(loaded = 41117, current = null, restarting = false))
        assertNull(judge.portToLoad(loaded = 41117, current = 36021, restarting = false))
    }

    @Test
    fun `nothing is judged while a restart is under way`() {
        val judge = StalePortJudge()

        repeat(4) { assertNull(judge.portToLoad(loaded = 41117, current = 36021, restarting = true)) }
    }

    @Test
    fun `nothing is judged before a page has been loaded`() {
        val judge = StalePortJudge()

        repeat(4) { assertNull(judge.portToLoad(loaded = null, current = 36021, restarting = false)) }
    }

    @Test
    fun `after a reload the count starts over for the next change`() {
        val judge = StalePortJudge()
        judge.portToLoad(loaded = 41117, current = 36021, restarting = false)
        assertEquals(36021, judge.portToLoad(loaded = 41117, current = 36021, restarting = false))

        assertNull(judge.portToLoad(loaded = 36021, current = 50555, restarting = false))
        assertEquals(50555, judge.portToLoad(loaded = 36021, current = 50555, restarting = false))
    }
}
