package com.github.yhk1038.claudecodegui.editor

/**
 * Remembers what a tab last reported, and answers the one question both chat
 * hosts ask of it: does this report change what the tab icon should show?
 *
 * The rule is a transition rather than a state. The WebView reports `idle`
 * whenever the page mounts, so a tab that is merely moved, split or reloaded
 * reports idle again; drawing on that report would clear an unread badge the
 * user has not seen yet. An idle report only means something when the tab was
 * doing something a moment ago.
 *
 * It lives in its own class for two reasons.
 *
 * The rule was written out twice, once in each host, and two copies of one rule
 * drift. More than that, both copies recorded the report **after** they drew the
 * icon — and drawing is the step that can fail. It did: the report arrives on
 * the AppKit thread, `Content.icon` may only be touched on the EDT, and the
 * platform threw from inside the assignment. The exception unwound the callback
 * past the line that recorded the report, so the tab stayed on `IDLE` while its
 * icon showed a spinner. The next report, the `idle` that ends the turn, then
 * compared idle against idle, read itself as a freshly mounted page, and drew
 * nothing. The tab turned forever for a session that had already stopped
 * (issue #456).
 *
 * Recording and drawing are now separate steps, in that order, and the drawing
 * is what gets handed to the EDT. Whatever happens to the drawing, the tab still
 * knows what it last reported.
 */
class TabActivityTracker {

    /**
     * Reports arrive on the AppKit thread while the drawing they trigger runs on
     * the EDT, so this is read and written from more than one thread.
     */
    @Volatile
    private var last: TabActivity = TabActivity.IDLE

    /**
     * Record [activity] and answer whether the tab icon has to follow it.
     *
     * Recording happens first and unconditionally: it states what the WebView
     * said, which is true whether or not anything is ever drawn from it.
     */
    fun record(activity: TabActivity): Boolean {
        val redraw = activity != TabActivity.IDLE || last != TabActivity.IDLE
        last = activity
        return redraw
    }
}
