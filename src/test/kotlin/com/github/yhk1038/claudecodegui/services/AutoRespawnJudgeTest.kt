package com.github.yhk1038.claudecodegui.services

import com.github.yhk1038.claudecodegui.services.AutoRespawnJudge.Decision
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * What the IDE does when the backend exits cleanly: start it again only when a tab needs it and
 * the backend was working, so a backend that cannot start is not started in a loop.
 */
class AutoRespawnJudgeTest {

    @Test
    fun `with no tab open the retired backend stays retired`() {
        assertEquals(Decision.RETIRE, AutoRespawnJudge.decide(tabsOpen = false, generationServed = true))
        assertEquals(Decision.RETIRE, AutoRespawnJudge.decide(tabsOpen = false, generationServed = false))
    }

    @Test
    fun `a backend that was working and left a tab behind is started again`() {
        assertEquals(Decision.RESPAWN, AutoRespawnJudge.decide(tabsOpen = true, generationServed = true))
    }

    @Test
    fun `a backend that never came up is not started again by the same rule`() {
        assertEquals(Decision.GIVE_UP, AutoRespawnJudge.decide(tabsOpen = true, generationServed = false))
    }
}
