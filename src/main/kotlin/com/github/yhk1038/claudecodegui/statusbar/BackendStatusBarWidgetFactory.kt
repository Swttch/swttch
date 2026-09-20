package com.github.yhk1038.claudecodegui.statusbar

import com.github.yhk1038.claudecodegui.hosting.ThinClient
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory

/**
 * Registers the backend status dot in every project window's status bar.
 * Public platform API only.
 */
class BackendStatusBarWidgetFactory : StatusBarWidgetFactory {

    override fun getId(): String = BackendStatusBarWidget.WIDGET_ID

    override fun getDisplayName(): String = "Claude Code"

    /**
     * Hidden on the JetBrains Client half of Remote Development: this widget
     * reports the state of a backend this machine is never allowed to start, so
     * it would sit on "stopped" forever and invite the user to restart something
     * that is not theirs to restart (issue #292). The remote half shows its own.
     */
    override fun isAvailable(project: Project): Boolean = !ThinClient.isThinClient()

    override fun createWidget(project: Project): StatusBarWidget = BackendStatusBarWidget(project)
}
