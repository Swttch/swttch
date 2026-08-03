package com.github.yhk1038.claudecodegui.startup

import com.github.yhk1038.claudecodegui.services.NodeBackendService
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectCloseListener

/**
 * Per-project keep-alive clamp: releases a backend's keep-alive gate when its
 * owning project window closes. The gate is up exactly while the IDE owns the
 * backend (its project is open); closing the window means the IDE no longer
 * owns it, so the gate must come down. Without this, every closed project
 * window would leave an immortal backend behind until IDE exit — a real workday
 * over dozens of projects piles up dozens of orphan Node processes (found in
 * manual testing).
 *
 * The clamp only re-pushes the gate (`enabled = false`) — it never kills the
 * process — so a browser/tunnel session still using the now-ownerless backend
 * keeps it alive; a client-less backend retires after the normal idle grace.
 */
class BackendProjectCloseListener : ProjectCloseListener {

    override fun projectClosed(project: Project) {
        val basePath = project.basePath ?: return
        NodeBackendService.getInstance().clampAfterProjectClose(basePath)
    }
}
