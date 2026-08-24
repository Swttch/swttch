package com.github.yhk1038.claudecodegui.services

import com.intellij.diff.DiffContentFactory
import com.intellij.diff.chains.SimpleDiffRequestChain
import com.intellij.diff.editor.ChainDiffVirtualFile
import com.intellij.diff.requests.SimpleDiffRequest
import com.intellij.diff.util.DiffUserDataKeysEx
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileTypes.FileTypeManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * Service for handling diff viewing and file changes
 */
@Service(Service.Level.PROJECT)
class DiffService(private val project: Project) {
    private val logger = Logger.getInstance(DiffService::class.java)

    /**
     * Diff tabs opened for a pending permission request, keyed by tool_use_id.
     *
     * Kept so the tab can be closed once the user answers the prompt: a review
     * diff that outlives its question is stale, and a long turn would otherwise
     * leave one tab per edit for the user to sweep up by hand.
     */
    private val pendingDiffFiles = ConcurrentHashMap<String, VirtualFile>()

    /**
     * Open IDE diff viewer for file changes
     *
     * @param filePath Absolute file path
     * @param oldContent Original content (empty string for new files)
     * @param newContent New content to apply
     * @param toolUseId Permission request this diff belongs to, when it is a
     *   pre-write review. Passing it lets [closeDiffViewer] clean the tab up
     *   once the user answers; omit it for a standalone diff the user closes.
     * @param onResolve Called with the regions the user kept when they answer
     *   in the diff window. An empty list means they rejected the change. The
     *   regions are the IDE's own split, learned once the diff has compared.
     *   The second argument is the proposed side as the reviewer left it, or
     *   null when they never typed in it (#305).
     */
    @JvmOverloads
    fun openDiffViewer(
        filePath: String,
        oldContent: String,
        newContent: String,
        toolUseId: String? = null,
        onResolve: ((List<AcceptedRange>, String?) -> Unit)? = null,
    ) {
        ApplicationManager.getApplication().invokeLater {
            try {
                // Already on screen for this request: bring it forward and stop.
                // The approval prompt's file name can be clicked at any time,
                // including while its diff is open, and rebuilding the tab there
                // would throw away the hunks the reviewer has already ticked.
                val existing = pendingDiffFiles[toolUseId]
                val fem = FileEditorManager.getInstance(project)
                if (existing != null && fem.isFileOpen(existing)) {
                    fem.openFile(existing, true)
                    return@invokeLater
                }

                val contentFactory = DiffContentFactory.getInstance()

                // Type the contents from the real file name so the diff is
                // syntax-highlighted like the editor rather than plain text.
                val fileType = FileTypeManager.getInstance().getFileTypeByFileName(File(filePath).name)
                val leftContent = contentFactory.create(project, oldContent, fileType)
                // The proposed side is editable so a reviewer can fix a small
                // slip in place rather than describing it back to the agent
                // (#305). `create` hands back a read-only document; only
                // `createEditable` leaves it writable. The original stays
                // read-only: it is the file on disk, not a draft.
                val rightContent =
                    if (onResolve != null) contentFactory.createEditable(project, newContent, fileType)
                    else contentFactory.create(project, newContent, fileType)

                // Create diff request with file name as title
                val fileName = File(filePath).name
                val request = SimpleDiffRequest(
                    "Diff: $fileName",
                    leftContent,
                    rightContent,
                    "Original",
                    "Proposed"
                )

                if (toolUseId != null) {
                    // Replace any diff still open for this same request — a
                    // retried edit should update the tab, not stack another.
                    closeDiffViewer(toolUseId)
                }

                // Show as an editor tab (rather than a modal window) so the
                // chat panel stays reachable: the approval buttons live there,
                // and a modal would block the very answer this diff is for.
                val chain = SimpleDiffRequestChain(request)

                // Put the review controls under the diff itself, so the change
                // and the decision about it are on one screen. The per-hunk tick
                // boxes ride in the gutter (HunkGutterExtension) off the same
                // selection object this bar reads, so the two cannot disagree.
                if (onResolve != null) {
                    val selection = HunkSelection()
                    request.putUserData(HunkSelection.KEY, selection)
                    val panel = DiffReviewPanel(selection) { accepted, keepEdits ->
                        // Read the proposed side before the tab closes, and only
                        // report it when it actually differs from what was
                        // proposed: an untouched review must keep answering with
                        // ranges alone so Claude's own call goes through as it
                        // always did. Reject discards it -- refusing a change is
                        // not a way to write a different one.
                        val edited =
                            if (keepEdits) rightContent.document.text.takeIf { it != newContent }
                            else null
                        toolUseId?.let { closeDiffViewer(it) }
                        onResolve(accepted, edited)
                    }
                    chain.putUserData(DiffUserDataKeysEx.BOTTOM_PANEL, panel.component)
                }

                val diffFile = ChainDiffVirtualFile(chain, "Diff: $fileName")
                FileEditorManager.getInstance(project).openFile(diffFile, false)
                if (toolUseId != null) {
                    pendingDiffFiles[toolUseId] = diffFile
                }

                logger.info("Opened diff viewer for: $filePath (toolUseId=$toolUseId)")
            } catch (e: Exception) {
                logger.error("Failed to open diff viewer for: $filePath", e)
            }
        }
    }

    /**
     * Close the review diff opened for [toolUseId], if one is still open.
     *
     * Called when the permission request is answered either way — the question
     * is gone, so the preview of its answer should be too. Unknown ids are a
     * no-op: not every permission request opens a diff (a Bash command has
     * nothing to preview), so callers do not have to track which ones did.
     */
    fun closeDiffViewer(toolUseId: String) {
        val file = pendingDiffFiles.remove(toolUseId) ?: return
        ApplicationManager.getApplication().invokeLater {
            try {
                FileEditorManager.getInstance(project).closeFile(file)
                logger.info("Closed diff viewer for toolUseId=$toolUseId")
            } catch (e: Exception) {
                logger.warn("Failed to close diff viewer for toolUseId=$toolUseId", e)
            }
        }
    }

    /**
     * Apply file changes
     *
     * @param filePath Absolute file path
     * @param newContent New content to write
     * @return Result indicating success or failure
     */
    fun applyDiff(filePath: String, newContent: String): Result<Unit> {
        return try {
            val file = File(filePath)

            // Ensure parent directory exists
            file.parentFile?.mkdirs()

            // Write content to file
            ApplicationManager.getApplication().runWriteAction {
                WriteCommandAction.runWriteCommandAction(project) {
                    // Refresh file system
                    val virtualFile = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file)

                    if (virtualFile != null) {
                        // File exists - update content
                        val document = FileDocumentManager.getInstance().getDocument(virtualFile)
                        if (document != null) {
                            document.setText(newContent)
                        } else {
                            logger.warn("No document found for: $filePath, writing directly")
                            file.writeText(newContent)
                        }
                    } else {
                        // New file - create it
                        file.writeText(newContent)
                        LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file)
                    }
                }
            }

            logger.info("Applied diff to: $filePath")
            Result.success(Unit)
        } catch (e: Exception) {
            logger.error("Failed to apply diff to: $filePath", e)
            Result.failure(e)
        }
    }

    /**
     * Apply edit operation (replace old_string with new_string)
     *
     * @param filePath Absolute file path
     * @param oldString String to find and replace
     * @param newString String to replace with
     * @return Result indicating success or failure
     */
    fun applyEdit(filePath: String, oldString: String, newString: String): Result<Unit> {
        return try {
            val file = File(filePath)

            if (!file.exists()) {
                return Result.failure(IllegalArgumentException("File does not exist: $filePath"))
            }

            // Read current content
            val currentContent = file.readText()

            // Check if old string exists
            if (!currentContent.contains(oldString)) {
                return Result.failure(IllegalArgumentException("Old string not found in file: $filePath"))
            }

            // Replace old string with new string
            val newContent = currentContent.replace(oldString, newString)

            // Write back
            ApplicationManager.getApplication().runWriteAction {
                WriteCommandAction.runWriteCommandAction(project) {
                    val virtualFile = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file)

                    if (virtualFile != null) {
                        val document = FileDocumentManager.getInstance().getDocument(virtualFile)
                        if (document != null) {
                            document.setText(newContent)
                        } else {
                            file.writeText(newContent)
                        }
                    } else {
                        file.writeText(newContent)
                    }
                }
            }

            logger.info("Applied edit to: $filePath")
            Result.success(Unit)
        } catch (e: Exception) {
            logger.error("Failed to apply edit to: $filePath", e)
            Result.failure(e)
        }
    }

    /**
     * Reload the given files from disk so open editor tabs show fresh content.
     *
     * The Claude CLI writes files directly, bypassing the IDE. The IDE then only
     * notices via its native filesystem watcher, which is unreliable on Windows
     * (issue #72), leaving tabs stale until a manual "Reload from Disk". This
     * triggers that refresh explicitly.
     *
     * Uses an asynchronous VFS refresh ([VfsUtil.markDirtyAndRefresh] with
     * async = true) so the EDT is never blocked. Files not yet known to the VFS
     * (newly created) are discovered by refreshing their parent directory.
     *
     * @param paths Absolute file paths that were just written.
     */
    fun refreshFiles(paths: List<String>) {
        if (paths.isEmpty()) return
        val lfs = LocalFileSystem.getInstance()

        // IntelliJ VFS uses forward-slash paths regardless of host OS; the CLI
        // may hand us native Windows paths with backslashes.
        val normalized = paths.map { it.replace('\\', '/') }

        val knownFiles = normalized.mapNotNull { lfs.findFileByPath(it) }
        if (knownFiles.isNotEmpty()) {
            VfsUtil.markDirtyAndRefresh(true, false, false, *knownFiles.toTypedArray())
        }

        // Newly created files are not in the VFS yet — refresh their parent dirs
        // (with reloadChildren = true) so the IDE discovers them.
        val newFileParents = normalized
            .filter { lfs.findFileByPath(it) == null }
            .mapNotNull { File(it).parent?.replace('\\', '/') }
            .distinct()
            .mapNotNull { lfs.findFileByPath(it) }
        if (newFileParents.isNotEmpty()) {
            VfsUtil.markDirtyAndRefresh(true, false, true, *newFileParents.toTypedArray())
        }

        logger.info("Requested VFS refresh for ${paths.size} path(s)")
    }

    /**
     * Delete file
     *
     * @param filePath Absolute file path
     * @return Result indicating success or failure
     */
    fun deleteFile(filePath: String): Result<Unit> {
        return try {
            val file = File(filePath)

            if (!file.exists()) {
                return Result.failure(IllegalArgumentException("File does not exist: $filePath"))
            }

            ApplicationManager.getApplication().runWriteAction {
                WriteCommandAction.runWriteCommandAction(project) {
                    val virtualFile = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(file)
                    virtualFile?.delete(this)
                }
            }

            logger.info("Deleted file: $filePath")
            Result.success(Unit)
        } catch (e: Exception) {
            logger.error("Failed to delete file: $filePath", e)
            Result.failure(e)
        }
    }

    companion object {
        fun getInstance(project: Project): DiffService {
            return project.getService(DiffService::class.java)
        }
    }
}
