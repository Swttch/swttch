package com.github.yhk1038.claudecodegui.statusbar

import com.github.yhk1038.claudecodegui.bridge.NodeProcessManager.Lifecycle

/**
 * Pure presentation logic for the backend status-bar widget dot. The dot encodes ONLY the runtime state — the mode/toggle is
 * carried by the tooltip and the card, never by the color:
 *
 *  - GREEN  — backend process running,
 *  - YELLOW — starting/restarting,
 *  - GRAY   — not running and that is normal (not kept alive: starts on
 *             demand, retires when idle; also: never started yet),
 *  - RED    — error ONLY: the backend is kept alive (the IDE owns it — its
 *             project is open) yet the process died (crash/crash-loop). Never
 *             shown once the project is gone and the backend is expected to retire.
 *
 * Free of any IDE API so it is unit-testable (see BackendDotStateTest).
 */
object BackendDotState {

    enum class DotState { GREEN, YELLOW, GRAY, RED }

    /**
     * @param lifecycle current process lifecycle, or null when no backend was
     *   ever started for the project root.
     * @param keptAlive whether this backend is under the keep-alive regime — the
     *   gate is up exactly while the IDE owns it, i.e. while its project is open.
     */
    fun compute(lifecycle: Lifecycle?, keptAlive: Boolean): DotState = when (lifecycle) {
        Lifecycle.RUNNING -> DotState.GREEN
        Lifecycle.STARTING -> DotState.YELLOW
        // Dead while the IDE still owns it (project open) is the error; dead after
        // the project closed is the expected on-demand retirement, not an error.
        Lifecycle.DEAD -> if (keptAlive) DotState.RED else DotState.GRAY
        // Never started: normal before the first panel opens — not an error.
        null -> DotState.GRAY
    }

    /** Widget tooltip: product name + state, e.g. `Claude Code — Running`. */
    fun tooltip(lifecycle: Lifecycle?, keptAlive: Boolean): String {
        val state = when (compute(lifecycle, keptAlive)) {
            DotState.GREEN -> if (keptAlive) "Running, keep-alive" else "Running"
            DotState.YELLOW -> "Starting…"
            DotState.GRAY -> if (keptAlive) "Not running — keep-alive on" else "Stopped — starts on demand"
            DotState.RED -> "Not running — expected to be running"
        }
        return "Claude Code — $state"
    }

    /** The card's state line, e.g. `running (port 63412)`. */
    fun cardStateLine(lifecycle: Lifecycle?, keptAlive: Boolean, port: Int?): String = when (lifecycle) {
        Lifecycle.RUNNING -> if (port != null) "running (port $port)" else "running"
        Lifecycle.STARTING -> "starting…"
        Lifecycle.DEAD, null ->
            if (keptAlive) "not running (keep-alive on)" else "stopped (starts on demand)"
    }
}
