package com.github.yhk1038.claudecodegui.toolwindow

/**
 * One way of asking a window to come forward.
 *
 * Ordered by how much the user would notice, quietest first, because on a
 * platform where one of them is enough the earlier ones are the ones that did
 * the work and the later ones cost nothing visible.
 */
enum class RaiseStep {
    /**
     * Ask properly: activate the application, then raise this window.
     *
     * `Desktop.requestForeground` is the part that asks for the APPLICATION to
     * come forward, which is the permission `toFront()` is missing. Both are
     * needed — the first activates the app, the second picks which of its
     * windows ends up on top. This is the whole of what macOS needs.
     */
    ASK,

    /**
     * Claim always-on-top for an instant and give it straight back.
     *
     * Measured natively on Windows 11 26200.9457: `SetWindowPos` with
     * HWND_TOPMOST followed by HWND_NOTOPMOST put the IDE in front of the
     * browser the user was looking at. The window is left exactly as it was
     * found, so nothing is visible except the window arriving.
     */
    TOPMOST_FLICKER,

    /**
     * Minimise, then restore.
     *
     * Measured natively on the same machine: `ShowWindow` SW_MINIMIZE followed
     * by SW_RESTORE put the IDE in front. A restore is the user's own gesture as
     * far as the window manager is concerned, so it is granted where a raise is
     * refused. It costs the user seeing the window drop and come back, which is
     * why it is last.
     */
    MINIMISE_CYCLE,
}

/**
 * Which ways of asking a window to come forward are carried out, and in what
 * order.
 *
 * **Nothing here decides whether a step worked, and that is the point.** The
 * first version of this sequence stopped as soon as the window reported itself
 * active, reading `java.awt.Frame.isActive`. Measured on Windows 11 26200.9457:
 * that reading says true while the window is still behind the browser, because
 * Windows answers a foreground request it refuses by highlighting the taskbar
 * button, and AWT reads that state as active. The sequence therefore stopped at
 * [RaiseStep.ASK] every time and logged that the window had come forward while
 * the operating system, asked directly through `GetForegroundWindow`, answered
 * `chrome`. The two steps that were measured to work never ran once.
 *
 * Answering "is this window frontmost" needs the operating system, not AWT, and
 * this plugin cannot ask it without native calls. So the question is not asked.
 * Every step of the plan is carried out. Flickering always-on-top on a window
 * that is already in front, or minimising and restoring one, costs the user
 * nothing they would object to; being left behind the browser they were reading
 * costs them the notification they just clicked.
 */
object WindowRaisePlan {

    /**
     * The steps to carry out on this platform.
     *
     * macOS stops after the first one. That platform's answer was measured and
     * accepted — activating the application is what it needs — and the two
     * escalations are Windows manoeuvres that would show up there as a window
     * flickering for no reason.
     *
     * Every other platform gets all three, in order.
     */
    fun stepsFor(isMac: Boolean): List<RaiseStep> =
        if (isMac) {
            listOf(RaiseStep.ASK)
        } else {
            listOf(RaiseStep.ASK, RaiseStep.TOPMOST_FLICKER, RaiseStep.MINIMISE_CYCLE)
        }

    /**
     * Carry out [steps] in order, each one in its own turn of the event loop.
     *
     * [perform] does the step. [settle] runs its argument once the gap between
     * steps has passed; separating the steps in time is not decoration — a
     * window manager is told about a state change when a turn of the event loop
     * ends, so a minimise and a restore issued in the same turn cancel each
     * other out and it never sees a minimise to restore from. [afterSettling]
     * is handed each step once that gap has passed, which is where the caller
     * records what it has just tried.
     *
     * Taking the two as arguments rather than reaching for `javax.swing.Timer`
     * directly is what lets a test watch the whole sequence run without an AWT
     * event loop, and that test is the guard against the early stop coming back.
     */
    fun run(
        steps: List<RaiseStep>,
        perform: (RaiseStep) -> Unit,
        settle: (() -> Unit) -> Unit,
        afterSettling: (RaiseStep) -> Unit,
    ) {
        fun carryOut(index: Int) {
            if (index >= steps.size) return
            val step = steps[index]
            perform(step)
            settle {
                afterSettling(step)
                carryOut(index + 1)
            }
        }
        carryOut(0)
    }
}
