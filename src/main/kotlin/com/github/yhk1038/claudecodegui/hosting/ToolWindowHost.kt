package com.github.yhk1038.claudecodegui.hosting

import com.github.yhk1038.claudecodegui.editor.ClaudeCodeVirtualFile
import com.github.yhk1038.claudecodegui.services.EditorTabStateService
import com.github.yhk1038.claudecodegui.toolwindow.ClaudeCodePanel
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.IconLoader
import com.intellij.openapi.util.Key
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.openapi.wm.impl.content.ToolWindowContentUi
import com.intellij.ui.content.Content
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.content.ContentManagerEvent
import com.intellij.ui.content.ContentManagerListener
import java.util.UUID
import javax.swing.Icon

/**
 * Hosts chat sessions in the **Claude Code** tool window's content tabs.
 *
 * This is the Phase-4 home for the chat hosting that the abandoned PR #30 put in
 * `ClaudeCodeToolWindowSessionManager`, re-expressed through [ChatHost] and
 * adapted to the current architecture:
 *
 *  - tab-id vocabulary (not "session id"),
 *  - shared [EditorTabStateService] for persistence (no second store),
 *  - teardown is just `Disposer.dispose(panel)` — `ClaudeCodePanel.dispose()`
 *    already self-cleans (releaseRef → removeTab + state/virtual-file cleanup),
 *  - closing the last tab leaves an **empty** tool window (no auto-new-session).
 */
@Service(Service.Level.PROJECT)
class ToolWindowHost(private val project: Project) : ChatHost {

    private val logger = Logger.getInstance(ToolWindowHost::class.java)
    private var closeListenerInstalled = false

    override fun openOrFocus(project: Project, tabId: String, initialPath: String?, initialTitle: String?) {
        val toolWindow = ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID) ?: run {
            logger.warn("Tool window '$TOOL_WINDOW_ID' not found")
            return
        }
        installCloseListener(toolWindow)
        removePlaceholders(toolWindow)

        val existing = findContent(toolWindow, tabId)
        if (existing != null) {
            toolWindow.contentManager.setSelectedContent(existing)
            EditorTabStateService.getInstance(project).addTab(tabId)
            toolWindow.activate(null)
            return
        }

        val content = createSessionContent(toolWindow, tabId, initialPath, initialTitle)
        toolWindow.contentManager.addContent(content)
        toolWindow.contentManager.setSelectedContent(content)
        toolWindow.activate(null)
    }

    override fun restorePersistedSessions(project: Project) {
        // No-op on purpose. Tool-window content is created lazily by the factory's
        // [hydrate] the first time the UI is built. The IDE re-opens the tool
        // window (and thus calls the factory) on restart when it was open at
        // shutdown, so restore happens there — keeping editor-tab restore and
        // tool-window hydrate mutually exclusive (no double restore).
    }

    /**
     * Called by `ClaudeCodeToolWindowFactory` the first time the tool-window UI
     * is built (TOOL_WINDOW mode). Restores persisted sessions, or opens one
     * fresh session when nothing was persisted.
     */
    fun hydrate(toolWindow: ToolWindow) {
        installCloseListener(toolWindow)
        removePlaceholders(toolWindow)
        if (toolWindow.contentManager.contentCount > 0) return

        val state = EditorTabStateService.getInstance(project)
        when (val plan = ChatHostRouter.planHydrate(state.getOpenTabIds(), state.getActiveTabId())) {
            is ChatHostRouter.HydratePlan.FreshSession ->
                openOrFocus(project, UUID.randomUUID().toString(), initialPath = null, initialTitle = null)

            is ChatHostRouter.HydratePlan.Restore ->
                for (tabId in plan.order) {
                    openOrFocus(project, tabId, state.getRestorePath(tabId), state.getEffectiveTitle(tabId))
                }
        }
    }

    private fun createSessionContent(
        toolWindow: ToolWindow,
        tabId: String,
        initialPath: String?,
        initialTitle: String?,
    ): Content {
        val state = EditorTabStateService.getInstance(project)
        state.addTab(tabId)

        val virtualFile = ClaudeCodeVirtualFile.getOrCreate(project, tabId, initialPath, initialTitle)
        val panel = ClaudeCodePanel(project, tabId, virtualFile.currentPath ?: virtualFile.initialPath)

        // Mirror the editor-tab callbacks (ClaudeCodeFileEditor) so the persisted
        // title/path stay in sync and the content label tracks the WebView title.
        panel.onTitleChanged = { title ->
            // onTitleChange fires from the JCEF display handler on the AppKit
            // thread, but setDisplayName / Content.displayName mutate UI model
            // state and must run on the EDT, otherwise the platform throws
            // "Access is allowed from Event Dispatch Thread (EDT) only". Marshal
            // onto the EDT (runs immediately if already on it).
            ApplicationManager.getApplication().invokeLater {
                // Record the conversation title either way: it is what the tab
                // falls back to if the user later clears their own name.
                state.updateTitle(tabId, title)
                // ...but a manually named tab keeps its label. Skipping only the
                // relabel (not the store above) is what makes "rename" outlast
                // every later title the conversation reports.
                if (!state.hasCustomTitle(tabId)) {
                    virtualFile.setDisplayName(title)
                    ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID)?.let { tw ->
                        findContent(tw, tabId)?.displayName = virtualFile.presentableName
                    }
                }
            }
        }
        panel.onPathChanged = { path ->
            virtualFile.currentPath = path
            state.updatePath(tabId, path)
            // Moving to another conversation moves to that conversation's name,
            // so the label is re-resolved rather than left on the last one's.
            // Nothing to do when the tab is unnamed: the conversation's own title
            // arrives via onTitleChanged a moment later and labels it then.
            state.getCustomTitle(tabId)?.let { named ->
                ApplicationManager.getApplication().invokeLater {
                    virtualFile.setDisplayName(named)
                    relabelTab(project, tabId, named)
                }
            }
        }
        // Unread badge: when streaming ends on a tab that is NOT the selected one,
        // swap its content icon to the unread variant. The selection listener
        // restores the base icon when the user comes back (mirrors the editor tab).
        var wasStreaming = false
        panel.onStreamingStateChanged = { isStreaming ->
            if (!isStreaming && wasStreaming) {
                ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID)?.let { tw ->
                    val tabContent = findContent(tw, tabId)
                    if (tabContent != null && tw.contentManager.selectedContent !== tabContent) {
                        tabContent.icon = UNREAD_ICON
                    }
                }
            }
            wasStreaming = isStreaming
        }

        return ContentFactory.getInstance().createContent(panel, virtualFile.presentableName, false).apply {
            isCloseable = true
            // SHOW_CONTENT_ICON is required for setIcon() to actually render on the
            // tab label — without it the platform suppresses content tab icons.
            putUserData(ToolWindow.SHOW_CONTENT_ICON, true)
            icon = BASE_ICON
            putUserData(TAB_ID_KEY, tabId)
        }
    }

    private fun installCloseListener(toolWindow: ToolWindow) {
        if (closeListenerInstalled) return
        closeListenerInstalled = true

        // Hide the redundant "Claude Code" id label in the tool-window header — the
        // content tab already shows the chat title.
        //
        // The key is a String rather than a Key<Boolean>, so the value must be the
        // string "true": ContentLayout#shouldShowId tests it with "true".equals.
        toolWindow.component.putClientProperty(ToolWindowContentUi.HIDE_ID_LABEL, "true")

        toolWindow.contentManager.addContentManagerListener(object : ContentManagerListener {
            override fun selectionChanged(event: ContentManagerEvent) {
                val tabId = event.content.getUserData(TAB_ID_KEY) ?: return
                // Track the active tab so restart restore re-focuses the right one.
                EditorTabStateService.getInstance(project).addTab(tabId)
                // The user is now looking at this tab — clear any unread badge.
                event.content.icon = BASE_ICON
            }

            override fun contentRemoved(event: ContentManagerEvent) {
                val content = event.content
                content.getUserData(TAB_ID_KEY) ?: return
                val panel = content.component as? ClaudeCodePanel ?: return
                // Disposing the panel self-cleans: releaseRef (grace-period, harmless
                // here) → removeTab + EditorTabStateService.removeTab + virtual-file
                // cleanup. Closing the last tab leaves the tool window empty by design.
                // Disposer.dispose is a no-op when already disposed, so no guard needed.
                ApplicationManager.getApplication().invokeLater {
                    Disposer.dispose(panel)
                }
            }
        })
    }

    /**
     * Remove any leftover placeholder content (the empty "Loading…" tab the
     * factory adds for the EDITOR_TAB button trick). Placeholders carry no
     * [TAB_ID_KEY]; real chat tabs always do. This keeps the tool window from
     * showing an empty tab once it starts hosting chats.
     */
    private fun removePlaceholders(toolWindow: ToolWindow) {
        val contentManager = toolWindow.contentManager
        for (i in contentManager.contentCount - 1 downTo 0) {
            val content = contentManager.getContent(i) ?: continue
            if (content.getUserData(TAB_ID_KEY) == null) {
                contentManager.removeContent(content, true)
            }
        }
    }

    private fun findContent(toolWindow: ToolWindow, tabId: String): Content? {
        val contentManager = toolWindow.contentManager
        for (i in 0 until contentManager.contentCount) {
            val content = contentManager.getContent(i) ?: continue
            if (content.getUserData(TAB_ID_KEY) == tabId) return content
        }
        return null
    }

    companion object {
        const val TOOL_WINDOW_ID = "Claude Code"
        // internal rather than private: RenameChatTabAction is handed a Content by
        // the platform and has no other way back to the tab it represents.
        internal val TAB_ID_KEY = Key.create<String>("ClaudeCode.ToolWindow.TabId")

        private val BASE_ICON: Icon =
            IconLoader.getIcon("/icons/claudeCode.svg", ToolWindowHost::class.java)
        private val UNREAD_ICON: Icon =
            IconLoader.getIcon("/icons/claudeCode-unread.svg", ToolWindowHost::class.java)

        fun getInstance(project: Project): ToolWindowHost =
            project.getService(ToolWindowHost::class.java)

        /**
         * Relabel the tool-window tab for [tabId], if one is showing.
         *
         * A no-op in EDITOR_TAB mode, where there is no tool-window tab to
         * relabel and the virtual file's display name is the whole story. Both
         * are updated on rename because the host mode can be switched while
         * tabs are open, and the one not currently showing must not be left
         * holding a stale label.
         *
         * Must be called on the EDT: Content.displayName mutates UI state.
         */
        fun relabelTab(project: Project, tabId: String, label: String) {
            val toolWindow = ToolWindowManager.getInstance(project)
                .getToolWindow(TOOL_WINDOW_ID) ?: return
            val contentManager = toolWindow.contentManagerIfCreated ?: return
            for (i in 0 until contentManager.contentCount) {
                val content = contentManager.getContent(i) ?: continue
                if (content.getUserData(TAB_ID_KEY) == tabId) {
                    content.displayName = label
                    return
                }
            }
        }
    }
}
