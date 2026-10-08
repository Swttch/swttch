package com.github.yhk1038.claudecodegui.services

/**
 * What the IDE does when a backend exits cleanly by its own decision (exit code 0).
 *
 * A clean exit is how the backend retires itself when nobody is using it, so the IDE used to
 * stand its watchdog down and wait for the next panel to open. That is right with no tab open.
 * With a tab open it strands the tab: the tab keeps asking the dead port, and nothing starts a
 * backend for it. A page left like that stayed on "Backend disconnected. Reconnecting..." for
 * days in a real log, and a clean exit has other senders than the idle timer (a termination
 * signal from outside the IDE exits with code 0 too).
 *
 * Both inputs are facts the IDE already holds, so there is no timer and no count here:
 *
 *  - whether any tab is open under this root (a panel handler is registered), and
 *  - whether this backend generation ever came up far enough for the IDE's own control
 *    channel to connect.
 *
 * The second one is what stops a loop. A backend that exits before it ever came up is failing
 * to start, and starting it again would only repeat the failure; a backend that was serving and
 * then exited was taken away from a working state, so starting it again is the repair.
 */
object AutoRespawnJudge {

    enum class Decision {
        /** No tab needs it: leave it retired and let the next panel open start it. */
        RETIRE,

        /** A tab is open and the backend was working: start it again. */
        RESPAWN,

        /** A tab is open but the backend never came up: starting again would repeat the failure. */
        GIVE_UP,
    }

    fun decide(tabsOpen: Boolean, generationServed: Boolean): Decision = when {
        !tabsOpen -> Decision.RETIRE
        generationServed -> Decision.RESPAWN
        else -> Decision.GIVE_UP
    }
}
