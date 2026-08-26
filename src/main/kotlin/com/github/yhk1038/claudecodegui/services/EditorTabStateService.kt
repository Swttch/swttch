package com.github.yhk1038.claudecodegui.services

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project

/**
 * Persists which Claude Code editor **tabs** are open so they can be restored
 * after an IDE restart.
 *
 * Terminology — this service deals exclusively with **tab IDs** (the per-tab
 * UUID minted when an editor tab is opened), NOT Claude Code conversation
 * session IDs. The only place a conversation appears is the stored *path*
 * value (a WebView URL like `/sessions/{conversationId}/...`), which is opaque
 * to this service.
 *
 * NOTE: the persisted [EditorTabState] field names (`openSessionIds`,
 * `activeSessionId`, `sessionPaths`) are kept as-is on purpose — they are the
 * on-disk XML schema (`claudeCodeEditorTabs.xml`) and renaming them would break
 * restore for existing users. Their *values* are tab IDs; the public API below
 * uses the correct `tabId` vocabulary.
 */
@State(
    name = "ClaudeCodeEditorTabs",
    storages = [Storage("claudeCodeEditorTabs.xml")]
)
@Service(Service.Level.PROJECT)
class EditorTabStateService : PersistentStateComponent<EditorTabStateService.EditorTabState> {

    data class EditorTabState(
        // Persisted XML field names retained for backward compatibility.
        // Values are TAB IDs (not conversation session IDs).
        var openSessionIds: MutableList<String> = mutableListOf(),
        var activeSessionId: String? = null,
        // Last WebView path per tab, so a restored tab lands on the conversation
        // the user was actually viewing at shutdown rather than the tab's own page.
        var sessionPaths: MutableMap<String, String> = mutableMapOf(),
        // Last WebView-reported title per tab. Used to show a sensible tab label
        // immediately after restart, before the lazy FileEditor mounts and the
        // WebView reconnects to push a fresh title.
        var sessionTitles: MutableMap<String, String> = mutableMapOf(),
        // Name the user typed for a tab, which outranks the WebView-reported
        // title above. Presence IS the mode: an entry here means "this tab is
        // manually named", its absence means "follow the conversation". No
        // separate flag, so the two can never disagree.
        var customTitles: MutableMap<String, String> = mutableMapOf()
    )

    private var state = EditorTabState()

    override fun getState(): EditorTabState = state

    override fun loadState(state: EditorTabState) {
        this.state = state
    }

    fun addTab(tabId: String) {
        if (tabId !in state.openSessionIds) {
            state.openSessionIds.add(tabId)
        }
        state.activeSessionId = tabId
    }

    fun removeTab(tabId: String) {
        state.openSessionIds.remove(tabId)
        state.sessionPaths.remove(tabId)
        state.sessionTitles.remove(tabId)
        // Only the name filed under the tab itself, which is one given before any
        // conversation started and so has nothing to outlive the tab for. A name
        // given to a conversation stays: reopening that conversation — in this
        // tab or another — should bring its name back.
        state.customTitles.remove(tabId)
        if (state.activeSessionId == tabId) {
            state.activeSessionId = state.openSessionIds.lastOrNull()
        }
    }

    fun updatePath(tabId: String, path: String) {
        val previousKey = nameKeyFor(tabId)
        state.sessionPaths[tabId] = path
        val newKey = nameKeyFor(tabId)
        // Leaving `/sessions/new` for a real conversation is the one move that
        // carries a name across: the tab was named before its conversation had an
        // id, and that name was meant for the conversation about to start. Every
        // other move (switching conversations, resetting to a new one) is just a
        // change of key, and the label follows whatever that key holds.
        if (previousKey == tabId && newKey != tabId) {
            inheritNameOnSessionStart(tabId, newKey)
        }
    }

    fun getPath(tabId: String): String? = state.sessionPaths[tabId]

    fun updateTitle(tabId: String, title: String) {
        state.sessionTitles[tabId] = title
    }

    fun getTitle(tabId: String): String? = state.sessionTitles[tabId]

    /**
     * Name the conversation [tabId] is currently showing [name], overriding its
     * title until cleared.
     *
     * Names belong to conversations rather than to tabs: switching a tab to
     * another conversation must show that one's name, and coming back must bring
     * the first one's name with it. [nameKeyFor] is what decides which
     * conversation a tab is on.
     *
     * A blank [name] clears the name instead of storing an empty label, which is
     * how the rename dialog expresses "go back to following the conversation" —
     * the user empties the field and confirms.
     */
    fun setCustomTitle(tabId: String, name: String) {
        val key = nameKeyFor(tabId)
        val trimmed = name.trim()
        if (trimmed.isEmpty()) {
            state.customTitles.remove(key)
        } else {
            state.customTitles[key] = trimmed
        }
    }

    fun getCustomTitle(tabId: String): String? = state.customTitles[nameKeyFor(tabId)]

    /**
     * Whether the conversation [tabId] is showing has been named, and so must not
     * be relabelled when that conversation reports a new title.
     */
    fun hasCustomTitle(tabId: String): Boolean = state.customTitles.containsKey(nameKeyFor(tabId))

    /**
     * The label [tabId] should currently show: the name given to the conversation
     * it is on, otherwise the last title that conversation reported.
     *
     * The single place the two sources are ranked, so every caller — the tool
     * window host, the editor tab, restart restore — resolves them identically.
     */
    fun getEffectiveTitle(tabId: String): String? =
        state.customTitles[nameKeyFor(tabId)] ?: state.sessionTitles[tabId]

    /**
     * Carry a name given before the conversation existed onto the conversation
     * that just started.
     *
     * Naming a tab on `/sessions/new` names something that has no id yet, so it
     * is filed under the tab. Sending the first message turns that into a real
     * conversation, and the name was meant for *it* — the user named the work
     * they were about to start, not the empty page. Moving the entry here is what
     * makes the name survive that transition while still belonging to a
     * conversation afterwards.
     *
     * Does nothing when the tab was never named while empty, or when the new
     * conversation already carries a name of its own.
     */
    private fun inheritNameOnSessionStart(tabId: String, newKey: String) {
        if (newKey == tabId) return
        val pending = state.customTitles.remove(tabId) ?: return
        state.customTitles.putIfAbsent(newKey, pending)
    }

    /**
     * The key a tab's name is filed under: the conversation it is showing, or the
     * tab itself while it is showing none.
     *
     * Derived from the stored path rather than held as its own field, so it
     * cannot drift out of step with where the tab actually is.
     */
    private fun nameKeyFor(tabId: String): String =
        sessionIdFromPath(state.sessionPaths[tabId]) ?: tabId

    companion object {
        /**
         * The conversation id in a webview path, or null when the path is not on
         * one — `/sessions/new` most often, which is a tab that has yet to start
         * a conversation.
         *
         * Paths look like `/sessions/{id}` with optional trailing segments and
         * query, e.g. `/sessions/abc/conversations/xyz?foo=1`.
         */
        internal fun sessionIdFromPath(path: String?): String? {
            if (path == null) return null
            val withoutQuery = path.substringBefore('?')
            if (!withoutQuery.startsWith(SESSIONS_PREFIX)) return null
            val id = withoutQuery.removePrefix(SESSIONS_PREFIX).substringBefore('/')
            return if (id.isEmpty() || id == "new") null else id
        }

        private const val SESSIONS_PREFIX = "/sessions/"

        fun getInstance(project: Project): EditorTabStateService =
            project.getService(EditorTabStateService::class.java)
    }

    /**
     * Path to restore a tab to: the last-viewed WebView path if known.
     *
     * Fallback `/sessions/$tabId` is legacy — it formats the tab ID as if it
     * were a conversation path. In practice a real path is almost always stored
     * (via updatePath on URL change), and for a brand-new tab the WebView simply
     * redirects an unknown session to `/sessions/new`. Behavior preserved.
     */
    fun getRestorePath(tabId: String): String =
        state.sessionPaths[tabId] ?: "/sessions/$tabId"

    fun getOpenTabIds(): List<String> = state.openSessionIds.toList()

    fun getActiveTabId(): String? = state.activeSessionId
}
