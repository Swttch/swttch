package com.github.yhk1038.claudecodegui.statusbar

import com.github.yhk1038.claudecodegui.services.NodeBackendService
import com.github.yhk1038.claudecodegui.settings.KeepAliveSetting
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.ui.JBColor
import com.intellij.util.Consumer
import com.intellij.util.ui.ColorIcon
import java.awt.event.MouseEvent
import javax.swing.Icon

/**
 * Status-bar dot for the project root's backend.
 * Useful in EVERY mode, not only D: it is a window into backend liveness
 * without opening the sidebar. The dot encodes pure runtime state
 * ([BackendDotState]); clicking opens the [BackendStatusPopup] card.
 *
 * Each project window's widget tracks its own root's backend (one backend per
 * `project.basePath`); updates arrive over [NodeBackendService]'s state
 * listeners — no polling.
 */
class BackendStatusBarWidget(private val project: Project) : StatusBarWidget, StatusBarWidget.IconPresentation {

    private val service = NodeBackendService.getInstance()
    private var statusBar: StatusBar? = null

    private val stateListener: (String) -> Unit = { changedBasePath ->
        if (changedBasePath == project.basePath) {
            ApplicationManager.getApplication().invokeLater {
                statusBar?.updateWidget(ID())
            }
        }
    }

    override fun ID(): String = WIDGET_ID

    override fun getPresentation(): StatusBarWidget.WidgetPresentation = this

    override fun install(statusBar: StatusBar) {
        this.statusBar = statusBar
        service.addBackendStateListener(stateListener)
    }

    override fun dispose() {
        service.removeBackendStateListener(stateListener)
        statusBar = null
    }

    override fun getIcon(): Icon {
        val dot = BackendDotState.compute(lifecycle(), KeepAliveSetting.get())
        val color = when (dot) {
            BackendDotState.DotState.GREEN -> JBColor(0x59A869, 0x499C54)
            BackendDotState.DotState.YELLOW -> JBColor(0xEDA200, 0xF0A732)
            BackendDotState.DotState.GRAY -> JBColor(0x9AA7B0, 0x6E6E6E)
            BackendDotState.DotState.RED -> JBColor(0xDB5860, 0xC75450)
        }
        return ColorIcon(ICON_SIZE, color)
    }

    override fun getTooltipText(): String =
        BackendDotState.tooltip(lifecycle(), KeepAliveSetting.get())

    override fun getClickConsumer(): Consumer<MouseEvent> = Consumer { event ->
        BackendStatusPopup(project).showAbove(event.component)
    }

    private fun lifecycle() = project.basePath?.let { service.lifecycleOf(it) }

    companion object {
        const val WIDGET_ID = "ClaudeCodeGui.BackendStatus"
        private const val ICON_SIZE = 10
    }
}
