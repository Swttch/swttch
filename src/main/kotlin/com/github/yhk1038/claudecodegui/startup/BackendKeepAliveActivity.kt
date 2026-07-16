package com.github.yhk1038.claudecodegui.startup

import com.github.yhk1038.claudecodegui.services.NodeBackendService
import com.github.yhk1038.claudecodegui.settings.KeepAliveSetting
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity

/**
 * Keep-alive eager start: when the global "Keep backend running" toggle is ON, the
 * project's backend spawns together with the project — no JCEF panel needed —
 * so browser clients can reach it right away (the URL is surfaced in the
 * status-bar card).
 *
 * The close counterpart is [BackendProjectCloseListener]: closing the project
 * window releases the keep-alive gate for that backend (per-project keep-alive
 * clamp) — a browser user with a live session keeps it alive, a client-less
 * backend retires after 60 s. IDE death is additionally covered backend-side
 * by the ppid watchdog.
 */
class BackendKeepAliveActivity : ProjectActivity {

    override suspend fun execute(project: Project) {
        if (!KeepAliveSetting.get()) return
        val basePath = project.basePath ?: return
        NodeBackendService.getInstance().startEager(basePath)
    }
}
