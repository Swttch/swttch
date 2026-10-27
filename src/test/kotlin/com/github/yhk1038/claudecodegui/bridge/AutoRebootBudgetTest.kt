package com.github.yhk1038.claudecodegui.bridge

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class AutoRebootBudgetTest {

    @Test
    fun `allows two attempts a minute apart and then never again`() {
        var t = 0L
        val budget = AutoRebootBudget(now = { t })

        assertTrue(budget.tryTake())
        t += 61_000
        assertTrue(budget.tryTake())
        // Hours later the budget is still spent: a failure a reboot cannot fix must reach a person.
        t += 6 * 3_600_000
        assertFalse(budget.tryTake())
    }

    @Test
    fun `refuses an attempt right after the previous one`() {
        // Two panels of one project notice the same failure within the same moment.
        var t = 0L
        val budget = AutoRebootBudget(now = { t })

        assertTrue(budget.tryTake())
        t += 5_000
        assertFalse(budget.tryTake(), "the second panel must not reboot a backend that is rebooting")
    }

    @Test
    fun `a refused attempt does not spend the budget`() {
        var t = 0L
        val budget = AutoRebootBudget(now = { t })

        assertTrue(budget.tryTake())
        t += 5_000
        assertFalse(budget.tryTake())
        t += 61_000
        assertTrue(budget.tryTake(), "the refusal above must not have used up the second attempt")
    }
}
