package com.github.yhk1038.claudecodegui.editor

import com.github.yhk1038.claudecodegui.services.NodeBackendService
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.vfs.newvfs.BulkFileListener
import com.intellij.openapi.vfs.newvfs.events.VFileContentChangeEvent
import com.intellij.openapi.vfs.newvfs.events.VFileEvent
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Report file content changes to the backend, so a review waiting on one of
 * those files can be told its base has moved (#359).
 *
 * A review is built from the file as it was when Claude asked permission, and
 * then waits. Meanwhile the user keeps editing in the IDE. Without this, the
 * first they hear of the conflict is when they press approve — and before the
 * approval gate existed, not even then: the stale content was simply written.
 *
 * Every content change is forwarded and the backend decides whether any review
 * cared. The filtering lives there because that is where the pending reviews
 * are; asking Kotlin to know which files are under review would mean keeping a
 * second copy of that state in sync with the first.
 *
 * This is an early warning, not a guarantee. It sees IDE-visible changes, so a
 * write by another process may only reach the VFS later, or not while the
 * review is open. The backend re-checks at approval time for exactly that
 * reason.
 */
class FileSaveNotifier : BulkFileListener {

    private val logger = Logger.getInstance(FileSaveNotifier::class.java)

    override fun after(events: MutableList<out VFileEvent>) {
        // Content changes only. Creations and deletions of a file under review
        // are caught by the approval gate's own read, and forwarding every VFS
        // event would put the IDE's index churn on this path.
        val changed = events.filterIsInstance<VFileContentChangeEvent>()
        if (changed.isEmpty()) return

        for (event in changed) {
            val path = event.file.path
            // Sent to every open project's backend: the same file can be open in
            // more than one, and a review lives in whichever backend received
            // the permission request. An unknown path is a no-op there.
            for (project in openProjects()) {
                notify(project, path)
            }
        }
    }

    private fun openProjects(): List<Project> =
        ProjectManager.getInstance().openProjects.filter { !it.isDisposed }

    private fun notify(project: Project, path: String) {
        val basePath = project.basePath ?: return
        try {
            val service = NodeBackendService.getInstance()
            // No backend for this project means no review is pending in it. The
            // guard is here rather than left to sendNotification because that
            // logs a warning per call, and this fires on every save in every
            // open project — including ones that never opened a chat panel.
            if (service.portOf(basePath) == null) return
            service.sendNotification(
                basePath,
                "FILE_SAVED",
                buildJsonObject { put("filePath", path) },
            )
        } catch (e: Exception) {
            // A save must never fail because we could not report it.
            logger.warn("Failed to report a save to the backend: $path", e)
        }
    }
}
