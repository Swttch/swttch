package com.github.yhk1038.claudecodegui.statusbar

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.StatusBarWidgetFactory

/**
 * Registers the backend status dot in every project window's status bar.
 * Public platform API only.
 */
class BackendStatusBarWidgetFactory : StatusBarWidgetFactory {

    override fun getId(): String = BackendStatusBarWidget.WIDGET_ID

    override fun getDisplayName(): String = "Claude Code GUI Backend"

    override fun isAvailable(project: Project): Boolean = true

    override fun createWidget(project: Project): StatusBarWidget = BackendStatusBarWidget(project)
}
