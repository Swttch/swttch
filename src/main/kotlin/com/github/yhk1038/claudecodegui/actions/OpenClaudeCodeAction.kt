package com.github.yhk1038.claudecodegui.actions

import com.github.yhk1038.claudecodegui.editor.ClaudeCodeVirtualFile
import com.github.yhk1038.claudecodegui.hosting.ChatHostRouter
import com.github.yhk1038.claudecodegui.services.EditorTabStateService
import com.github.yhk1038.claudecodegui.toolwindow.findTabShowing
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import java.util.UUID

class OpenClaudeCodeAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        openOrFocus(project)
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = e.project != null
    }

    companion object {
        /**
         * Reveal the chat: focus an already-open Claude tab if there is one, and
         * only mint a fresh tab when none is open. Host-aware via
         * [ChatHostRouter.planOpen], so it works in BOTH editor-tab and tool-window
         * modes — the tool window keeps no [com.intellij.openapi.fileEditor.FileEditorManager]
         * open file, so callers must NOT scan openFiles to decide (that spuriously
         * spawns a new tab in tool-window mode). Spawning extra tabs is the New Tab
         * action's job (issue #180).
         */
        fun openOrFocus(project: Project) {
            // useFromEdt, not getInstance: this runs on the EDT and can be the first
            // thing to touch the service — creating it here throws on a WSL project
            // (issue #438, documented on EditorTabStateService.getInstanceIfCreated).
            EditorTabStateService.useFromEdt(project) { state ->
                val tabId = ChatHostRouter.planOpen(
                    state.getOpenTabIds(),
                    state.getActiveTabId(),
                    UUID.randomUUID().toString(),
                )
                focusTab(project, tabId)
            }
        }

        /**
         * Open the page at [path], or go to the tab that is already showing it.
         *
         * A page is told apart by its address, never by a tab id the caller made
         * up: asking twice for the same session, settings page or sub-agent run
         * lands on the one tab instead of stacking a copy each time. When the
         * caller wants a tab that is new no matter what is open, that is
         * [newTab].
         *
         * @param initialTitle the label to wear until the page reports its own.
         */
        fun openTab(project: Project, path: String, initialTitle: String? = null) {
            val existing = findTabShowing(path, ClaudeCodeVirtualFile.openTabAddresses(project))
            if (existing != null) {
                focusTab(project, existing)
            } else {
                focusTab(project, UUID.randomUUID().toString(), path, initialTitle)
            }
        }

        /**
         * Open a tab of its own, whatever is open already. With no [path] it lands
         * on a new conversation.
         */
        fun newTab(project: Project, path: String? = null) {
            focusTab(project, UUID.randomUUID().toString(), path)
        }

        /**
         * Bring the tab known by [tabId] forward, opening it first when it is not
         * open (the way a restored tab or a reveal-this-chat request comes back).
         * [tabId] is a tab identifier, NOT a Claude conversation session ID, and
         * not an address: to go to a PAGE use [openTab].
         * [initialPath] is the WebView path (conversation) the tab should land on.
         * [initialTitle] is the cached tab label to show before the WebView mounts
         * and reports a fresh title (used by the restart restore path).
         */
        fun focusTab(
            project: Project,
            tabId: String,
            initialPath: String? = null,
            initialTitle: String? = null
        ) {
            // Host router: pick the current host and delegate. Every open entry
            // point funnels here, so this one line makes them all host-aware.
            ChatHostRouter.currentHost(project).openOrFocus(project, tabId, initialPath, initialTitle)
        }
    }
}
