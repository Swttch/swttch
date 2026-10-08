package com.github.yhk1038.claudecodegui.toolwindow

import com.github.yhk1038.claudecodegui.toolwindow.ConnectionJudge.Action
import com.github.yhk1038.claudecodegui.toolwindow.ConnectionJudge.Observation
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * What the IDE does about a page that is up but not connected to its backend, and in which
 * order. Observations are fed one at a time; there is no clock because nothing here uses one.
 */
class ConnectionJudgeTest {

    private val looks = BackendWatch.LOOKS_NEEDED

    /** Feeds [observation] [times] times and returns the last action. */
    private fun ConnectionJudge.feed(observation: Observation, times: Int): Action {
        var last = Action.NONE
        repeat(times) { last = judge(observation) }
        return last
    }

    @Test
    fun `a connected page is left alone`() {
        val judge = ConnectionJudge()

        assertEquals(Action.NONE, judge.feed(Observation.CONNECTED, 5))
    }

    @Test
    fun `a page not connected on enough looks in a row is loaded again, once`() {
        val judge = ConnectionJudge()

        assertEquals(Action.NONE, judge.feed(Observation.NOT_CONNECTED, looks - 1))
        assertEquals(Action.RELOAD, judge.judge(Observation.NOT_CONNECTED))
    }

    @Test
    fun `a page still loading after the reload is not judged`() {
        val judge = ConnectionJudge()
        judge.feed(Observation.NOT_CONNECTED, looks)

        assertEquals(Action.NONE, judge.feed(Observation.NOT_CONNECTED, 10 * looks))
    }

    @Test
    fun `the guide comes when the reloaded page is still not connected after it finished loading`() {
        val judge = ConnectionJudge()
        judge.feed(Observation.NOT_CONNECTED, looks)
        judge.pageLoadFinished()

        assertEquals(Action.NONE, judge.feed(Observation.NOT_CONNECTED, looks - 1))
        assertEquals(Action.SHOW_GUIDE, judge.judge(Observation.NOT_CONNECTED))
        assertEquals(Action.NONE, judge.feed(Observation.NOT_CONNECTED, 10 * looks))
    }

    @Test
    fun `a page that connects after the reload never sees the guide`() {
        val judge = ConnectionJudge()
        judge.feed(Observation.NOT_CONNECTED, looks)
        judge.pageLoadFinished()

        assertEquals(Action.NONE, judge.judge(Observation.CONNECTED))
        // The next trouble starts over, with a reload first again.
        assertEquals(Action.RELOAD, judge.feed(Observation.NOT_CONNECTED, looks))
    }

    @Test
    fun `connecting while the guide is up takes it away`() {
        val judge = ConnectionJudge()
        judge.feed(Observation.NOT_CONNECTED, looks)
        judge.pageLoadFinished()
        judge.feed(Observation.NOT_CONNECTED, looks)

        assertEquals(Action.CLEAR_GUIDE, judge.judge(Observation.CONNECTED))
        assertEquals(Action.NONE, judge.judge(Observation.CONNECTED))
    }

    @Test
    fun `a page that drops and comes back between two looks is not acted on`() {
        val judge = ConnectionJudge()

        // One look short, then connected, then one look short again: never enough in a row.
        repeat(5) {
            judge.feed(Observation.NOT_CONNECTED, looks - 1)
            judge.judge(Observation.CONNECTED)
        }
        assertEquals(Action.NONE, judge.feed(Observation.NOT_CONNECTED, looks - 1))
    }

    @Test
    fun `an unknown look neither counts against the page nor clears what was counted`() {
        val judge = ConnectionJudge()
        judge.feed(Observation.NOT_CONNECTED, looks - 1)

        assertEquals(Action.NONE, judge.feed(Observation.UNKNOWN, 10))
        // The looks already counted still stand, so one more is the one that decides.
        assertEquals(Action.RELOAD, judge.judge(Observation.NOT_CONNECTED))
    }

    @Test
    fun `an unknown page is never a disconnected page`() {
        val judge = ConnectionJudge()

        assertEquals(Action.NONE, judge.feed(Observation.UNKNOWN, 100))
        assertEquals(Action.NONE, judge.feed(Observation.NOT_CONNECTED, looks - 1))
    }

    @Test
    fun `a backend the IDE stopped starting gets the guide at once, with no reload`() {
        val judge = ConnectionJudge()

        assertEquals(Action.SHOW_GUIDE, judge.judge(Observation.BACKEND_GONE))
        assertEquals(Action.NONE, judge.feed(Observation.BACKEND_GONE, 10))
    }

    @Test
    fun `a closed guide stays closed until the page has connected once`() {
        val judge = ConnectionJudge()
        judge.judge(Observation.BACKEND_GONE)
        judge.userDismissed()

        assertEquals(Action.NONE, judge.feed(Observation.BACKEND_GONE, 10))

        judge.judge(Observation.CONNECTED)
        assertEquals(Action.SHOW_GUIDE, judge.judge(Observation.BACKEND_GONE))
    }

    @Test
    fun `a page loaded by something else starts over`() {
        val judge = ConnectionJudge()
        judge.feed(Observation.NOT_CONNECTED, looks)

        // A restart loads the page again. The reload already spent does not count against it.
        judge.pageLoadedByOthers()

        assertEquals(Action.RELOAD, judge.feed(Observation.NOT_CONNECTED, looks))
    }
}
