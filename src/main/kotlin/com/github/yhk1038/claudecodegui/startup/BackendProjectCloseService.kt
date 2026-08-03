package com.github.yhk1038.claudecodegui.startup

import com.github.yhk1038.claudecodegui.services.NodeBackendService
import com.intellij.openapi.Disposable
import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project

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
 *
 * Implemented as a project-level [Service] that is [Disposable]: the platform
 * disposes project-level services on project close (or plugin unload), so
 * [dispose] is the stable, non-experimental hook for "project window closed".
 * This replaces an earlier project-close listener that depended on an
 * experimental platform API —
 * see https://plugins.jetbrains.com/docs/intellij/disposers.html.
 *
 * NOTE: project-level services are created lazily, so this must be forced into
 * existence on project open (see [BackendProjectOpenListener]) for [dispose] to
 * ever fire. The [basePath] is captured at construction time on purpose:
 * defensively, the project may already be partially torn down by the time
 * [dispose] runs.
 */
@Service(Service.Level.PROJECT)
class BackendProjectCloseService(project: Project) : Disposable {

    private val basePath: String? = project.basePath

    override fun dispose() {
        basePath?.let { NodeBackendService.getInstance().clampAfterProjectClose(it) }
    }
}
