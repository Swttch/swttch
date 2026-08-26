package com.github.yhk1038.claudecodegui.editor

import com.github.yhk1038.claudecodegui.services.EditorTabStateService
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.vfs.NonPhysicalFileSystem
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileListener
import com.intellij.openapi.vfs.VirtualFileSystem
import java.io.IOException

/**
 * Virtual file system backing Claude Code chat tabs, so the IDE can restore them
 * itself — including which editor splitter they were in (issue #302).
 *
 * ## Why this exists
 *
 * The platform persists an open tab as a [com.intellij.platform.fileEditor.FileEntry]
 * keyed by the file's **URL**, and revives it on the next start via
 * `VirtualFileManager.findFileByUrl` → (protocol lookup) → [findFileByPath].
 * A tab whose URL cannot be resolved that way is silently dropped from the
 * restored layout.
 *
 * [ClaudeCodeVirtualFile] used to inherit the URL of `LightVirtualFile`, whose
 * file system has protocol `mock`, is not registered under the
 * `com.intellij.virtualFileSystem` extension point, and whose `findFileByPath`
 * returns null unconditionally. So our tabs could never be revived by URL: the
 * IDE knew the splitter each tab belonged to, but could not resurrect the file
 * to put there. The plugin then re-opened the tabs itself, with no notion of a
 * splitter, which is exactly the reported symptom — a tab flashes and reappears
 * in the default location.
 *
 * Registering a real protocol (`claude-code`) makes the round trip work using
 * only stable public API. Splitter placement is restored by the platform; the
 * plugin does not need to track it, and notably does not need `EditorWindow` or
 * `FileEditorOpenOptions`, both of which are `@ApiStatus.Internal` and would be
 * rejected by the release verifier gate.
 *
 * ## Path grammar
 *
 * The path component of the URL is the tab ID alone (`claude-code://<tabId>`).
 * Everything else about a tab — the conversation being viewed, its title — is
 * restored from [com.github.yhk1038.claudecodegui.services.EditorTabStateService],
 * keyed by that same tab ID, so the URL stays stable even as the user navigates
 * within the tab.
 *
 * ## Lifetime
 *
 * [findFileByPath] answers for any well-formed tab ID, because the platform is
 * the one that decides which tabs exist: it only asks about URLs it persisted,
 * and a tab the user closed is already gone from that layout. Making existence
 * conditional on plugin state instead is what broke restore outright in issue
 * #312 — see [findFileByPath].
 */
class ClaudeCodeFileSystem : VirtualFileSystem(), NonPhysicalFileSystem {

    override fun getProtocol(): String = PROTOCOL

    /**
     * Resolve `claude-code://<tabId>` back to its tab. Never answers null for a
     * well-formed ID.
     *
     * ## Why it always answers
     *
     * This is the single point the platform's restore hangs on: a tab whose URL
     * does not resolve is dropped from the layout, and the (now empty) editor
     * window is removed from its splitter. So a null here is not "skip one tab",
     * it is "that chat, and the pane it lived in, are gone".
     *
     * This used to answer only for a tab recorded in [EditorTabStateService],
     * found by scanning `ProjectManager.openProjects`. That never worked after a
     * restart, because the platform revives the layout *while the project is
     * still opening*: a logged run of issue #312 caught `openProjects` empty at
     * the lookup, with the project turning up there 3.8 seconds later. The state
     * was intact the whole time — there was simply nobody to ask yet, so every
     * chat tab was dropped on every restart and the IDE logged
     * `No file exists: claude-code://…`.
     *
     * The guard was not buying anything either. It was there to keep a tab the
     * user had closed from being resurrected, but the platform only ever asks
     * about URLs it persisted, and a closed tab is already out of that layout.
     * So existence is decided where it belongs — in the platform's own record of
     * what was open — and this call just hands back the address it was given.
     *
     * ## Where a tab's conversation and title come from
     *
     * When a project that remembers the tab is available, the file is seeded
     * from [EditorTabStateService] as before. When none is — the restart case —
     * the file is created bare and
     * [ClaudeCodeEditorProvider.createEditor] fills both in as soon as it has a
     * project, via [ClaudeCodeVirtualFile.seedRestoredState]. The pane's own
     * address also arrives independently, through
     * [ClaudeCodeEditorProvider.readState] → [ClaudeCodeFileEditor.setState].
     *
     * The project scan spans every open project because a URL identifies a file,
     * not a project, and this call carries no
     * [com.intellij.openapi.project.Project]. Tab IDs are per-tab UUIDs, so
     * cross-project collision is not a practical concern.
     */
    override fun findFileByPath(path: String): VirtualFile? {
        val tabId = path.trim('/')
        if (tabId.isEmpty()) return null

        ClaudeCodeVirtualFile.findExisting(tabId)?.let { return it }

        // getInstanceIfCreated() resolves an application service, so it throws —
        // rather than answering null — when there is no application at all. That
        // is the case in plain unit tests, and during teardown. The whole lookup
        // is therefore guarded, not just its result.
        val project = runCatching {
            ProjectManager.getInstanceIfCreated()
                ?.openProjects
                ?.firstOrNull {
                    !it.isDisposed && tabId in EditorTabStateService.getInstance(it).getOpenTabIds()
                }
        }.getOrNull()

        if (project == null) {
            // The restart case: no project can vouch for this tab yet. Hand back
            // the tab anyway — see the note above on why waiting for one loses it.
            return ClaudeCodeVirtualFile.getOrCreateUnclaimed(tabId)
        }

        val state = EditorTabStateService.getInstance(project)
        return ClaudeCodeVirtualFile.getOrCreate(
            project,
            tabId,
            state.getRestorePath(tabId),
            state.getEffectiveTitle(tabId),
        )
    }

    override fun refreshAndFindFileByPath(path: String): VirtualFile? = findFileByPath(path)

    /**
     * A chat tab has no meaningful "location" to show the user.
     *
     * The default implementation returns the path, which here is the tab's UUID —
     * and the platform uses this for the editor tab's title in some paths, so a
     * restored tab came back labelled `91f1a79c-f0fb-…` instead of its
     * conversation name. Returning the file's display name keeps the label right
     * wherever the platform reaches for the presentable URL rather than
     * [VirtualFile.getPresentableName].
     */
    override fun extractPresentableUrl(path: String): String =
        ClaudeCodeVirtualFile.findExisting(path.trim('/'))?.presentableName ?: path

    /** Nothing to refresh: these files are in-memory and have no backing store. */
    override fun refresh(asynchronous: Boolean) {}

    override fun isReadOnly(): Boolean = true

    // The chat tab is not a document the user edits through the VFS, so every
    // mutating operation is unsupported rather than silently ignored.
    override fun deleteFile(requestor: Any?, vFile: VirtualFile) {
        throw IOException("Claude Code tabs cannot be deleted through the VFS")
    }

    override fun moveFile(requestor: Any?, vFile: VirtualFile, newParent: VirtualFile) {
        throw IOException("Claude Code tabs cannot be moved through the VFS")
    }

    override fun renameFile(requestor: Any?, vFile: VirtualFile, newName: String) {
        throw IOException("Claude Code tabs cannot be renamed through the VFS")
    }

    override fun createChildFile(requestor: Any?, vDir: VirtualFile, fileName: String): VirtualFile {
        throw IOException("Claude Code tabs cannot have children")
    }

    override fun createChildDirectory(requestor: Any?, vDir: VirtualFile, dirName: String): VirtualFile {
        throw IOException("Claude Code tabs cannot have children")
    }

    override fun copyFile(
        requestor: Any?,
        virtualFile: VirtualFile,
        newParent: VirtualFile,
        copyName: String,
    ): VirtualFile {
        throw IOException("Claude Code tabs cannot be copied through the VFS")
    }

    // No listeners: nothing in this file system ever changes on disk. The
    // abstract declarations still have to be satisfied.
    override fun addVirtualFileListener(listener: VirtualFileListener) {}

    override fun removeVirtualFileListener(listener: VirtualFileListener) {}

    companion object {
        /**
         * URL protocol for chat tabs. Must match the `key` of the
         * `com.intellij.virtualFileSystem` registration in plugin.xml — the
         * platform looks the file system up by that key when resolving a URL.
         */
        const val PROTOCOL: String = "claude-code"

        /** The persisted URL for [tabId], e.g. `claude-code://<tabId>`. */
        fun urlFor(tabId: String): String = "$PROTOCOL://$tabId"
    }
}
