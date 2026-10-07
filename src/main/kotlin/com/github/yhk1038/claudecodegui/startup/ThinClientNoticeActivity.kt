package com.github.yhk1038.claudecodegui.startup

import com.github.yhk1038.claudecodegui.bridge.PluginResourceExtractor
import com.github.yhk1038.claudecodegui.hosting.ThinClient
import com.github.yhk1038.claudecodegui.notifications.ThinClientNotifier
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.ProjectActivity

/**
 * On the JetBrains Client half of Remote Development, once per plugin version, says
 * that the plugin runs on the remote host (issue #473). Does nothing anywhere else,
 * so a local IDE never sees it.
 */
class ThinClientNoticeActivity : ProjectActivity {

    override suspend fun execute(project: Project) {
        if (!ThinClient.isThinClient()) return
        ThinClientNotifier.showOncePerVersion(project, PluginResourceExtractor.defaultVersion())
    }
}
