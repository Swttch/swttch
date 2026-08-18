package com.github.yhk1038.claudecodegui.hosting

import com.intellij.openapi.project.Project

/**
 * Unified contract for hosting a Claude Code chat session in a particular place.
 *
 * A host owns *where* a session's [com.github.yhk1038.claudecodegui.toolwindow.ClaudeCodePanel]
 * is mounted (an editor tab, a tool-window content tab, …). It does NOT own the
 * shared resources every host reuses:
 *
 *  - the view: `ClaudeCodePanel` (host-agnostic),
 *  - the state: [com.github.yhk1038.claudecodegui.services.EditorTabStateService]
 *    (open tab ids / active tab id / path / title — shared by all hosts),
 *  - the pool: `ClaudeCodeBrowserService` (refCount, grace-period).
 *
 * Teardown is intentionally absent from this interface: `ClaudeCodePanel.dispose()`
 * already performs `releaseRef` → `removeTab` itself. A host only has to detach
 * the panel from its container and call `Disposer.dispose(panel)`.
 */
interface ChatHost {

    /**
     * Open a chat session at this host, or focus it if already open.
     *
     * @param tabId        the per-tab identifier (NOT a Claude conversation session id).
     * @param initialPath  the WebView path (conversation) the tab should land on.
     * @param initialTitle the cached tab label to show before the WebView reports a fresh title.
     */
    fun openOrFocus(project: Project, tabId: String, initialPath: String?, initialTitle: String?)

    /**
     * Restore the sessions persisted in [EditorTabStateService] into this host
     * after an IDE restart.
     *
     * A host that the platform already restores on its own must do nothing here.
     * [EditorTabHost] is that case: chat tabs are URL-addressable files, so the
     * platform reopens them with the rest of the editor layout, splitter
     * placement included — and reopening them a second time is what lost that
     * placement (#302).
     */
    fun restorePersistedSessions(project: Project)
}
