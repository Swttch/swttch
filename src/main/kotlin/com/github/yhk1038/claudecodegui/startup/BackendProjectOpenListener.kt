package com.github.yhk1038.claudecodegui.startup

import com.github.yhk1038.claudecodegui.services.NodeBackendService
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity

/**
 * Re-assert the keep-alive gate when a project window (re)opens — the open
 * counterpart of [BackendProjectCloseService].
 *
 * The gate is up exactly while the IDE owns a backend (its project is open).
 * When a backend outlives an earlier close of the same project (live
 * browser/tunnel clients kept it alive), the close clamp left it with
 * `enabled = false` and its RPC socket never dropped — so nothing re-raises the
 * gate on reopen without this hook. Runs on project open and re-pushes; a no-op
 * when no such surviving backend exists (the ordinary fresh-spawn / RPC-reconnect
 * cases are already covered by `onConnected`).
 */
class BackendProjectOpenListener : ProjectActivity {

    override suspend fun execute(project: Project) {
        // Force-instantiate the lazily-created project-level close service so its
        // Disposable.dispose() (the keep-alive clamp) is guaranteed to fire when
        // this project window closes.
        project.service<BackendProjectCloseService>()

        val basePath = project.basePath ?: return
        NodeBackendService.getInstance().reassertKeepAliveOnProjectOpen(basePath)
    }
}
