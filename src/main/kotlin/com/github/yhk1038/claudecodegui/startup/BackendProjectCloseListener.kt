package com.github.yhk1038.claudecodegui.startup

import com.github.yhk1038.claudecodegui.services.NodeBackendService
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectCloseListener

/**
 * Per-project keep-alive clamp (the close counterpart of
 * [BackendKeepAliveActivity]). Without it, every project window closed with
 * "Keep backend running" ON would leave an immortal backend behind until IDE
 * exit — a real workday over dozens of projects piles up dozens of orphan
 * Node processes (found in manual testing).
 *
 * The clamp only re-pushes the keep-alive gate — it never kills the process —
 * so a browser session that is still using the backend keeps it alive; a
 * client-less backend retires after the normal 60 s idle grace.
 */
class BackendProjectCloseListener : ProjectCloseListener {

    override fun projectClosed(project: Project) {
        val basePath = project.basePath ?: return
        NodeBackendService.getInstance().clampAfterProjectClose(basePath)
    }
}
