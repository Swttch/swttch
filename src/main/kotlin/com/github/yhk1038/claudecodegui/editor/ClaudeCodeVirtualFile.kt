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
        ?: "Claude Code"

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

        fun getOrCreate(
            project: Project,
            tabId: String,
            initialPath: String? = null,
            initialTitle: String? = null
        ): ClaudeCodeVirtualFile {
            synchronized(openTabs) {
                val projectTabs = openTabs.getOrPut(project) { ConcurrentHashMap() }
                return projectTabs.getOrPut(tabId) {
                    ClaudeCodeVirtualFile(tabId, initialPath, initialTitle)
                }
            }
        }

        fun isTabOpen(project: Project, tabId: String): Boolean {
            synchronized(openTabs) {
                return openTabs[project]?.containsKey(tabId) == true
            }
        }

        /**
         * Look up an already-known tab by ID, across every open project.
         *
         * This backs [ClaudeCodeFileSystem.findFileByPath], which resolves a
         * persisted `claude-code://<tabId>` URL during the platform's own tab
         * restore (issue #302). That call carries no [Project] — a URL identifies
         * a file, not a project — so the search spans all projects. Tab IDs are
         * UUIDs minted per tab, so a collision across projects is not a practical
         * concern.
         *
         * Returns null for an unknown ID, which is the point: only tabs the plugin
         * has already registered are revived, so a stale URL (a tab closed before
         * shutdown) is skipped by the platform rather than resurrected.
         */
        fun findExisting(tabId: String): ClaudeCodeVirtualFile? {
            synchronized(openTabs) {
                return openTabs.values.firstNotNullOfOrNull { it[tabId] }
            }
        }

        fun removeTab(project: Project, tabId: String) {
            synchronized(openTabs) {
                openTabs[project]?.remove(tabId)
            }
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
