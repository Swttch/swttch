package com.github.yhk1038.claudecodegui.editor

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFileManager
import com.intellij.openapi.vfs.VirtualFileSystem
import com.intellij.testFramework.LightVirtualFile
import java.util.Collections
import java.util.WeakHashMap
import java.util.concurrent.ConcurrentHashMap

enum class TabBadge {
    NONE,
    UNREAD
}

/**
 * Virtual file backing one Claude Code editor **tab**.
 *
 * [tabId] is the per-tab UUID minted when the tab is opened — it identifies the
 * editor/browser tab, NOT a Claude Code conversation session. The conversation
 * currently shown is tracked separately via [currentPath] (a WebView URL).
 */
class ClaudeCodeVirtualFile(
    val tabId: String,
    val initialPath: String? = null,
    initialTitle: String? = null
) : LightVirtualFile("Claude Code", ClaudeCodeFileType, "") {

    // 동적으로 변경 가능한 표시 이름. 재시작 직후에는 백엔드 통신 전이라
    // 저장된 마지막 제목(initialTitle)을 우선 보여 주고, 없을 때는 "Claude Code"로 폴백.
    // (새 탭이 첫 페인트부터 hash 대신 앱 이름을 표시)
    @Volatile
    private var displayName: String = initialTitle?.let { truncateName(it) }
        ?: DEFAULT_DISPLAY_NAME

    // WebView가 현재 표시 중인 경로 (탭 이동 시 복원용)
    @Volatile
    var currentPath: String? = initialPath

    // Tab badge state for unread notification dot
    @Volatile
    var badgeState: TabBadge = TabBadge.NONE
        private set

    /**
     * Updates the unread badge state. Returns true if the state actually changed,
     * so the caller can refresh the editor tab icon (re-running
     * [ClaudeCodeFileIconPatcher]). The icon refresh itself is driven by the
     * caller via [com.intellij.openapi.fileEditor.ex.FileEditorManagerEx.refreshIcons],
     * because firing a PROP_NAME change with an unchanged name throws
     * IllegalArgumentException ("Values must be different").
     */
    fun setBadge(badge: TabBadge): Boolean {
        if (badgeState == badge) return false
        badgeState = badge
        return true
    }

    companion object {
        private const val MAX_DISPLAY_NAME_LENGTH = 20

        /** Label a tab wears until it knows the conversation it is showing. */
        private const val DEFAULT_DISPLAY_NAME: String = "Claude Code"

        /**
         * The registered [ClaudeCodeFileSystem] instance.
         *
         * Resolved through [VirtualFileManager] rather than constructed here, so
         * this is the very same object the platform hands back when resolving a
         * `claude-code://` URL. Constructing a second instance would still report
         * the right protocol, but the file returned by a restore and the file held
         * by an open tab would then disagree about their file system.
         *
         * Falls back to a local instance if the extension point has not been
         * loaded yet — the protocol and behaviour are identical, so a tab created
         * that early still works; it just misses the identity guarantee.
         */
        private val FILE_SYSTEM: VirtualFileSystem by lazy {
            // getInstance() itself throws before the application exists (it resolves
            // an application service), so the whole lookup — not just a null result —
            // has to fall back. That happens in plain unit tests, and in principle
            // any time a file is built before the extension point is loaded.
            runCatching {
                VirtualFileManager.getInstance().getFileSystem(ClaudeCodeFileSystem.PROTOCOL)
            }.getOrNull() ?: ClaudeCodeFileSystem()
        }

        private fun truncateName(name: String): String =
            if (name.length > MAX_DISPLAY_NAME_LENGTH) name.take(MAX_DISPLAY_NAME_LENGTH) + "…" else name

        private val openTabs = Collections.synchronizedMap(
            WeakHashMap<Project, MutableMap<String, ClaudeCodeVirtualFile>>()
        )

        /**
         * Tabs that exist but have no project yet.
         *
         * The platform revives a persisted tab by URL *while the project is still
         * opening*: in a logged run of issue #312 the lookup saw
         * `ProjectManager.openProjects` empty, and the project appeared there 3.8
         * seconds later. So at the one moment that decides whether a chat tab
         * comes back, there is no [Project] to key it under — and a tab that
         * insisted on one was dropped from the layout every single restart.
         *
         * A tab does not actually need a project to exist: its ID is an address,
         * and the project only arrives when the platform asks
         * [ClaudeCodeEditorProvider] to build the editor. Tabs wait here until
         * then and are moved into their project's map by [claim].
         *
         * Not weakly held, unlike [openTabs] — there is no project to hang the
         * lifetime on. The bound is the number of distinct chat tab IDs the
         * platform asks about before claiming them (an editor layout plus a
         * recent-files list), so it stays in the tens.
         */
        private val unclaimedTabs = ConcurrentHashMap<String, ClaudeCodeVirtualFile>()

        fun getOrCreate(
            project: Project,
            tabId: String,
            initialPath: String? = null,
            initialTitle: String? = null
        ): ClaudeCodeVirtualFile {
            synchronized(openTabs) {
                val projectTabs = openTabs.getOrPut(project) { ConcurrentHashMap() }
                projectTabs[tabId]?.let { return it }
                // A tab the platform already revived keeps its identity — one file
                // per tab, whoever asked first. See [unclaimedTabs].
                unclaimedTabs.remove(tabId)?.let { revived ->
                    projectTabs[tabId] = revived
                    return revived
                }
                return ClaudeCodeVirtualFile(tabId, initialPath, initialTitle)
                    .also { projectTabs[tabId] = it }
            }
        }

        /**
         * Materialize a tab with no project in hand.
         *
         * This is the restore path: the platform hands over a persisted
         * `claude-code://<tabId>` URL and expects a file back, long before any
         * project is open. Returns the existing file when there is one, so the
         * per-tab identity holds no matter which lookup gets there first.
         */
        fun getOrCreateUnclaimed(tabId: String): ClaudeCodeVirtualFile {
            synchronized(openTabs) {
                findExisting(tabId)?.let { return it }
                return unclaimedTabs.getOrPut(tabId) { ClaudeCodeVirtualFile(tabId) }
            }
        }

        /**
         * Hand a revived tab to the project that is about to host it.
         *
         * Called from [ClaudeCodeEditorProvider.createEditor] — the first moment
         * a restored tab and its project are both in hand. From here on the tab
         * follows the ordinary per-project lifecycle: [removeTab] on a real
         * close, and garbage collection with the project. A no-op for a tab that
         * already belongs to a project.
         */
        fun claim(project: Project, tabId: String) {
            synchronized(openTabs) {
                val revived = unclaimedTabs.remove(tabId) ?: return
                openTabs.getOrPut(project) { ConcurrentHashMap() }[tabId] = revived
            }
        }

        fun isTabOpen(project: Project, tabId: String): Boolean {
            synchronized(openTabs) {
                return openTabs[project]?.containsKey(tabId) == true
            }
        }

        /**
         * Look up an already-known tab by ID, across every project and the
         * not-yet-claimed ones.
         *
         * This backs [ClaudeCodeFileSystem.findFileByPath], which resolves a
         * persisted `claude-code://<tabId>` URL during the platform's own tab
         * restore (issue #302). That call carries no [Project] — a URL identifies
         * a file, not a project — so the search spans all projects. Tab IDs are
         * UUIDs minted per tab, so a collision across projects is not a practical
         * concern.
         */
        fun findExisting(tabId: String): ClaudeCodeVirtualFile? {
            synchronized(openTabs) {
                return openTabs.values.firstNotNullOfOrNull { it[tabId] } ?: unclaimedTabs[tabId]
            }
        }

        fun removeTab(project: Project, tabId: String) {
            synchronized(openTabs) {
                openTabs[project]?.remove(tabId)
                // A tab closed before it was ever claimed (the panel never mounted)
                // would otherwise linger and be handed back to a later lookup.
                unclaimedTabs.remove(tabId)
            }
        }
    }

    /**
     * Fill in what a revived tab could not know at birth.
     *
     * A tab restored by the platform is built with no project (see
     * [unclaimedTabs]), so it starts on the generic label and with no address —
     * both of those live in
     * [com.github.yhk1038.claudecodegui.services.EditorTabStateService], which
     * needs a [Project]. [ClaudeCodeEditorProvider.createEditor] is the first
     * moment both are in hand, and this is what it fills in there.
     *
     * Deliberately silent, unlike [setDisplayName]: nothing is showing the old
     * label yet, and firing a property change while the platform is mid-way
     * through building the editor would be a notification about a tab that does
     * not exist on screen. Neither value overwrites one the tab already has.
     */
    fun seedRestoredState(path: String?, title: String?) {
        if (currentPath == null) {
            currentPath = path
        }
        if (title != null && displayName == DEFAULT_DISPLAY_NAME) {
            displayName = truncateName(title)
        }
    }

    fun setDisplayName(name: String) {
        val truncated = truncateName(name)
        if (displayName == truncated) return
        val oldName = displayName
        displayName = truncated
        // VirtualFile 변경 알림
        VirtualFileManager.getInstance().notifyPropertyChanged(this, PROP_NAME, oldName, truncated)
    }

    override fun getName(): String = displayName
    override fun getPresentableName(): String = displayName

    /**
     * Route this file through [ClaudeCodeFileSystem] instead of the `mock` file
     * system it would inherit from `LightVirtualFile`.
     *
     * This is what lets the IDE restore the tab — and with it the editor splitter
     * the tab was in — after a restart (issue #302). The platform persists a tab
     * by URL and revives it via `VirtualFileManager.findFileByUrl`, which looks
     * the file system up by protocol; `mock` is not registered and its
     * `findFileByPath` always returns null, so our tabs were dropped from the
     * restored layout and the plugin re-opened them in the default location.
     */
    override fun getFileSystem(): VirtualFileSystem = FILE_SYSTEM

    /**
     * The tab ID alone. Paired with [getFileSystem], this yields the persisted
     * URL `claude-code://<tabId>`, which [ClaudeCodeFileSystem.findFileByPath]
     * resolves back to this file.
     *
     * `LightVirtualFile` derives its path from the display name, which changes as
     * the conversation is renamed — an unstable URL would restore as a different
     * file, or as none at all.
     */
    override fun getPath(): String = tabId

    override fun getUrl(): String = ClaudeCodeFileSystem.urlFor(tabId)

    override fun isWritable(): Boolean = false
    override fun isValid(): Boolean = true

    override fun equals(other: Any?): Boolean {
        if (other !is ClaudeCodeVirtualFile) return false
        return tabId == other.tabId
    }

    override fun hashCode(): Int = tabId.hashCode()
}
