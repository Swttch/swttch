package com.github.yhk1038.claudecodegui.statusbar

import com.github.yhk1038.claudecodegui.bridge.NodeProcessManager.Lifecycle

/**
 * Pure presentation logic for the backend status-bar widget dot. The dot encodes ONLY the runtime state — the mode/toggle is
 * carried by the tooltip and the card, never by the color:
 *
 *  - GREEN  — backend process running,
 *  - YELLOW — starting/restarting,
 *  - GRAY   — not running and that is normal (keep-alive off: starts on
 *             demand, stops when idle; also: never started yet),
 *  - RED    — error ONLY: keep-alive is ON yet the backend process died
 *             (crash/crash-loop). Never shown in the on-demand regime.
 *
 * Free of any IDE API so it is unit-testable (see BackendDotStateTest).
 */
object BackendDotState {

    enum class DotState { GREEN, YELLOW, GRAY, RED }

    /**
     * @param lifecycle current process lifecycle, or null when no backend was
     *   ever started for the project root.
     * @param keepAlive the global "Keep backend running" toggle.
     */
    fun compute(lifecycle: Lifecycle?, keepAlive: Boolean): DotState = when (lifecycle) {
        Lifecycle.RUNNING -> DotState.GREEN
        Lifecycle.STARTING -> DotState.YELLOW
        Lifecycle.DEAD -> if (keepAlive) DotState.RED else DotState.GRAY
        // Never started: normal before the first panel (keep-alive off) and a
        // momentary state before the eager-start activity runs (keep-alive on) —
        // not an error either way.
        null -> DotState.GRAY
    }

    /** Widget tooltip: state + mode, e.g. `CCG Backend (Running, keep-alive)`. */
    fun tooltip(lifecycle: Lifecycle?, keepAlive: Boolean): String {
        val state = when (compute(lifecycle, keepAlive)) {
            DotState.GREEN -> if (keepAlive) "Running, keep-alive" else "Running"
            DotState.YELLOW -> "Starting…"
            DotState.GRAY -> if (keepAlive) "Not running — keep-alive on" else "Stopped — starts on demand"
            DotState.RED -> "Dead — keep-alive on, backend exited"
        }
        return "CCG Backend ($state)"
    }

    /** The card's "Backend:" line, e.g. `running (port 63412)`. */
    fun cardStateLine(lifecycle: Lifecycle?, keepAlive: Boolean, port: Int?): String = when (lifecycle) {
        Lifecycle.RUNNING -> if (port != null) "running (port $port)" else "running"
        Lifecycle.STARTING -> "starting…"
        Lifecycle.DEAD, null ->
            if (keepAlive) "not running (keep-alive on)" else "stopped (starts on demand)"
    }
}
