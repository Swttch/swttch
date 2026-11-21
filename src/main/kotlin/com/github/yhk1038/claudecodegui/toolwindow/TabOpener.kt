package com.github.yhk1038.claudecodegui.toolwindow

import java.util.UUID

/**
 * Always opens a new Claude Code tab by generating a fresh UUID and delegating
 * to [tabOpener].
 *
 * This function contains no IDE API calls so it can be tested as a plain unit
 * test. The side-effect of actually opening the tab is injected via [tabOpener].
 *
 * @param project  The IDE project (or any sentinel value in tests).
 * @param tabOpener  Called with (project, tabId). In production, this is
 *   `OpenClaudeCodeAction::focusTab`. In tests, a recording spy.
 */
fun <P> newTab(project: P, tabOpener: (P, String) -> Unit) {
    val tabId = UUID.randomUUID().toString()
    tabOpener(project, tabId)
}

/**
 * The address a tab is known by, with everything that does not say WHICH page it
 * is taken off: the `#` some callers lead with, the `?workingDir=` query, a
 * trailing slash.
 *
 * Two requests mean the same tab when this is equal. The query is left out on
 * purpose: it says where the page runs (the project directory), and a page's own
 * id (a session, a tool call) already says which one it is.
 */
fun normalizeTabPath(path: String?): String {
    if (path.isNullOrBlank()) return ""
    var p = path.trim()
    if (p.startsWith("#")) p = p.substring(1)
    p = p.substringBefore('?').substringBefore('#')
    if (p.length > 1) p = p.trimEnd('/')
    return p
}

/**
 * Which of the open tabs [path] is already showing, or null when none is.
 *
 * Pure so it can be tested without an IDE: [openTabs] is each open tab's id with
 * the address it shows right now. When several show the same page the first one
 * wins, which is the one the user opened first.
 */
fun findTabShowing(path: String, openTabs: List<Pair<String, String?>>): String? {
    val wanted = normalizeTabPath(path)
    if (wanted.isEmpty()) return null
    return openTabs.firstOrNull { normalizeTabPath(it.second) == wanted }?.first
}
