package com.github.yhk1038.claudecodegui.bridge

/**
 * How many times the IDE may reboot a project's backend on its own (issue #613).
 *
 * The automatic reboot is a convenience for the first stumble, not a recovery loop. A backend that
 * keeps failing after two reboots has a cause a reboot does not reach, and from there on a person
 * decides, through the Reboot button. So the budget counts attempts, never successes, and is not
 * refilled while the IDE runs: a "success" followed by another crash would otherwise reopen it and
 * turn a persistent failure into a reboot every minute.
 *
 * Held per project by the service, not by a panel: a panel is recreated by a tab reopen or a screen
 * reload, and a counter living there would start from zero each time.
 */
class AutoRebootBudget(
    private val maxAttempts: Int = MAX_ATTEMPTS,
    private val minGapMs: Long = MIN_GAP_MS,
    private val now: () -> Long = System::currentTimeMillis,
) {
    private var attempts = 0
    private var lastAttemptAt: Long? = null

    /**
     * Spends one attempt and returns true, or returns false without spending when the budget is
     * used up or the previous attempt was too recent. The gap is what keeps two panels of the same
     * project, which both notice the failure, from rebooting it twice at once.
     */
    @Synchronized
    fun tryTake(): Boolean {
        val last = lastAttemptAt
        if (attempts >= maxAttempts) return false
        if (last != null && now() - last < minGapMs) return false
        attempts++
        lastAttemptAt = now()
        return true
    }

    companion object {
        const val MAX_ATTEMPTS = 2
        const val MIN_GAP_MS = 60_000L
    }
}
