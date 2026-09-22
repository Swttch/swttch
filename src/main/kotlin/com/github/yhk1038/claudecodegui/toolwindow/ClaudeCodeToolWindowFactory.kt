package com.github.yhk1038.claudecodegui.toolwindow

import com.github.yhk1038.claudecodegui.actions.OpenClaudeCodeAction
import com.github.yhk1038.claudecodegui.hosting.HostMode
import com.github.yhk1038.claudecodegui.hosting.ThinClient
import com.github.yhk1038.claudecodegui.hosting.ToolWindowHost
import com.github.yhk1038.claudecodegui.settings.SettingsManager
import com.github.yhk1038.claudecodegui.toolwindow.realization.ReentrancyGate
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.DumbService
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.openapi.wm.ex.ToolWindowManagerListener
import com.intellij.ui.content.ContentFactory
import com.intellij.util.ui.UIUtil
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.SwingConstants
import java.awt.BorderLayout

class ClaudeCodeToolWindowFactory : ToolWindowFactory, DumbAware {

    private val logger = Logger.getInstance(ClaudeCodeToolWindowFactory::class.java)

    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        // Empty placeholder kept for the EDITOR_TAB "button trick": it matches the
        // IDE theme background so the brief flash before the tool window hides does
        // not expose LAF default white on dark themes. In TOOL_WINDOW mode the host
        // removes this placeholder before mounting chat content.
        val label = JLabel("Loading...", SwingConstants.CENTER)
        val panel = JPanel(BorderLayout())
        panel.background = UIUtil.getPanelBackground()
        panel.add(label, BorderLayout.CENTER)
        val content = ContentFactory.getInstance().createContent(panel, "", false)
        toolWindow.contentManager.addContent(content)

        // Reentrancy guard for the EDITOR_TAB button trick. A single stripe-icon
        // click flips the ToolWindow to visible, during which `stateChanged` may
        // fire several times before the deferred `hide()` runs. The gate ensures
        // exactly one open per visible cycle and resets when the ToolWindow returns
        // to invisible. All access happens on the EDT (invokeLater).
        val openGate = ReentrancyGate()

        // The tool window's behaviour depends on the CURRENT host mode, re-checked
        // on every show: this content is created only once, but the user can switch
        // hostMode at runtime. A stale "button trick" listener must NOT hide the
        // tool window once the user has switched to TOOL_WINDOW mode.
        val connection = project.messageBus.connect(toolWindow.disposable)
        connection.subscribe(ToolWindowManagerListener.TOPIC, object : ToolWindowManagerListener {
            override fun stateChanged(toolWindowManager: ToolWindowManager) {
                val tw = toolWindowManager.getToolWindow(ToolWindowHost.TOOL_WINDOW_ID) ?: return
                if (tw.isVisible) {
                    ApplicationManager.getApplication().invokeLater {
                        if (!tw.isVisible) return@invokeLater
                        onToolWindowShown(project, tw, label, openGate)
                    }
                } else {
                    // Back to invisible: re-arm the gate for the next click.
                    openGate.reset()
                }
            }
        })

        // Handle the very first open (the show that created this content).
        ApplicationManager.getApplication().invokeLater {
            onToolWindowShown(project, toolWindow, label, openGate)
        }
    }

    /**
     * Decide what to do each time the tool window becomes visible, based on the
     * current host mode:
     *  - TOOL_WINDOW: hydrate the host (it owns the content tabs); never hide.
     *  - EDITOR_TAB: the stripe is a button — open a new editor tab and hide again.
     */
    private fun onToolWindowShown(
        project: Project,
        toolWindow: ToolWindow,
        label: JLabel,
        openGate: ReentrancyGate,
    ) {
        if (SettingsManager.getInstance().getHostMode() == HostMode.TOOL_WINDOW) {
            ToolWindowHost.getInstance(project).hydrate(toolWindow)
            return
        }

        // EDITOR_TAB "button trick".
        if (!openGate.enter()) {
            toolWindow.hide()
            return
        }
        try {
            openNewTab(project, ::openTab)
            toolWindow.hide()
        } catch (e: Exception) {
            logger.info("Editor not ready yet, will retry after indexing", e)
            label.text = "Waiting for project initialization..."
            DumbService.getInstance(project).runWhenSmart {
                ApplicationManager.getApplication().invokeLater {
                    openNewTab(project, ::openTab)
                    toolWindow.hide()
                }
            }
        }
    }

    /**
     * Delegates to [OpenClaudeCodeAction.openTab] and wraps failures with a
     * 500 ms retry — preserving the same safety net that existed in the old
     * `focusOrOpenClaudeCodeTab` path.
     */
    private fun openTab(project: Project, tabId: String) {
        try {
            OpenClaudeCodeAction.openTab(project, tabId)
        } catch (e: Exception) {
            logger.warn("Failed to open Claude Code tab, retrying in 500ms", e)
            retryOpenTab(project, tabId)
        }
    }

    private fun retryOpenTab(project: Project, tabId: String) {
        java.util.Timer().schedule(object : java.util.TimerTask() {
            override fun run() {
                ApplicationManager.getApplication().invokeLater {
                    try {
                        OpenClaudeCodeAction.openTab(project, tabId)
                    } catch (e: Exception) {
                        logger.warn("Retry also failed to open Claude Code tab", e)
                    }
                }
            }
        }, 500L)
    }

    /**
     * Not registered at all on the JetBrains Client half of Remote Development.
     *
     * Both halves run this plugin, so both would register a tool window under the
     * same id — and the client's own wins, showing an empty panel that hides the
     * remote one carrying the actual chat. Platform tool windows (Project, Git,
     * Terminal) reach the client perfectly well; ours did not, because ours was
     * being covered rather than dropped (issue #292).
     *
     * Declining registration here leaves the slot free for the remote half's tool
     * window to arrive, which is what makes the tool-window host mode work over
     * Remote Development at all.
     */
    override suspend fun isApplicableAsync(project: Project): Boolean = !ThinClient.isThinClient()

    /**
     * Available wherever this factory is registered at all.
     *
     * The Remote Development client never gets that far — [isApplicableAsync] declines
     * registration there — so this says nothing about it either way.
     */
    override fun shouldBeAvailable(project: Project): Boolean = true
}
