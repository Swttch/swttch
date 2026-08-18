package com.github.yhk1038.claudecodegui.editor

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
 * This file system creates nothing on its own: [findFileByPath] only hands back
 * a file for a tab the plugin already knows about (see
 * [ClaudeCodeVirtualFile.findExisting]). A stale URL — a tab the user closed
 * before shutdown, or one belonging to another project — resolves to null and
 * the platform simply skips it, which is the desired outcome.
 */
class ClaudeCodeFileSystem : VirtualFileSystem(), NonPhysicalFileSystem {

    override fun getProtocol(): String = PROTOCOL

    /**
     * Resolve `claude-code://<tabId>` back to its tab.
     *
     * Deliberately does NOT create a tab that does not already exist. During
     * startup restore the platform asks for every persisted URL; answering with
     * a freshly minted file would resurrect tabs the user had closed. The
     * plugin's own restore path registers the tabs it intends to reopen, and
     * only those resolve here.
     */
    override fun findFileByPath(path: String): VirtualFile? =
        ClaudeCodeVirtualFile.findExisting(path.trim('/'))

    override fun refreshAndFindFileByPath(path: String): VirtualFile? = findFileByPath(path)

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
