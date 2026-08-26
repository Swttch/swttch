package com.github.yhk1038.claudecodegui.hosting

import com.github.yhk1038.claudecodegui.services.NodeBackendService
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowContextMenuActionBase
import com.intellij.ui.content.Content
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject

/**
 * "Rename Session..." on the right-click menu of a chat tab in TOOL_WINDOW mode.
 *
 * Renames nothing itself. It identifies the tab that was clicked and asks that
 * tab's webview to prompt for the name, which then travels back the ordinary way
 * (the webview tells the backend, the backend tells Kotlin).
 *
 * That indirection is forced, not stylistic. The platform ships a rename action
 * base class whose in-place popup is exactly the interaction we want, and it is
 * what the Terminal and the issue's own demo use — but both host plain Swing. A
 * chat tab hosts a JCEF browser, which paints its own native window, and a Swing
 * balloon over one receives neither clicks nor keystrokes: the click lands on the
 * page underneath and the field never takes a character. Verified on 2024.2, and
 * the reason `ToolWindowTabRenameActionBase` is not inherited here.
 *
 * Asking the webview also means one rename dialog rather than two, and it works
 * for someone reaching the same session through a browser over the tunnel, where
 * no IDE popup exists at all.
 *
 * Requested in issue #301: with several sessions open, a label chosen for you is
 * not always enough to tell them apart.
 */
class RenameChatTabAction : ToolWindowContextMenuActionBase(), DumbAware {

    override fun update(event: AnActionEvent, toolWindow: ToolWindow, content: Content?) {
        // Only on our own tabs: the group this action joins is shown for every
        // tool window, so the tab must be one that carries a chat tab id.
        event.presentation.isEnabledAndVisible =
            toolWindow.id == ToolWindowHost.TOOL_WINDOW_ID &&
                content?.getUserData(ToolWindowHost.TAB_ID_KEY) != null
    }

    override fun actionPerformed(event: AnActionEvent, toolWindow: ToolWindow, content: Content?) {
        val project = event.project ?: return
        val tabId = content?.getUserData(ToolWindowHost.TAB_ID_KEY) ?: return

        // The label the tab is showing right now, sent along so the field opens
        // on it. The webview cannot work this out for itself: its document.title
        // is the conversation's, and the two part company the moment the tab is
        // given a name of its own — which is exactly when someone is most likely
        // to rename it again.
        val currentName = content.displayName ?: ""

        requestRename(project, tabId, currentName)
    }

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    companion object {
        /**
         * Ask the webview of [tabId] to prompt for a name, seeded with
         * [currentName].
         *
         * Shared with the editor-tab entry point: the two menus reach a tab
         * differently, but what they do once they have one is the same, and
         * splitting that would let the modes drift apart.
         *
         * panelId IS the tabId (see ClaudeCodePanel), so the backend can route
         * this to the one webview that belongs to the clicked tab rather than
         * prompting in every open chat.
         */
        fun requestRename(project: Project, tabId: String, currentName: String) {
            val params: JsonObject = buildJsonObject {
                put("panelId", JsonPrimitive(tabId))
                put("currentName", JsonPrimitive(currentName))
            }
            NodeBackendService.getInstance()
                .sendNotification(project.basePath ?: "", "TAB_RENAME_REQUESTED", params)
        }
    }
}
