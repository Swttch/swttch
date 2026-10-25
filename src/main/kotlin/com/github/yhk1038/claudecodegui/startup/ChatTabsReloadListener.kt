package com.github.yhk1038.claudecodegui.startup

import com.github.yhk1038.claudecodegui.bridge.PluginResourceExtractor
import com.github.yhk1038.claudecodegui.editor.ClaudeCodeVirtualFile
import com.github.yhk1038.claudecodegui.hosting.ChatHostRouter
import com.github.yhk1038.claudecodegui.hosting.HostMode
import com.github.yhk1038.claudecodegui.platform.EditorPanes
import com.github.yhk1038.claudecodegui.settings.SettingsManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.github.yhk1038.claudecodegui.services.EditorTabStateService
import com.intellij.ide.plugins.DynamicPluginListener
import com.intellij.ide.plugins.IdeaPluginDescriptor
import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ProjectManager

/**
 * Brings the open chat tabs back after this plugin is updated without an IDE
 * restart (issue #598).
 *
 * A dynamic update unloads the plugin, which closes every chat editor tab, and
 * loads the new version into a window that is already open. Nothing else restores
 * those tabs: the platform replays its editor layout only when a project opens,
 * [com.github.yhk1038.claudecodegui.startup.ChatHostRestoreActivity] runs only at
 * project open, and by the time the IDE next saves its layout the tabs are
 * already gone.
 *
 * So the tabs are written down in [beforePluginUnload], while the plugin's own
 * services and classes still exist, into the project's platform-owned properties —
 * the one store that survives the unload. [pluginLoaded] reads them back and opens
 * each through the current host, on the conversation it was showing.
 *
 * Nothing is written at an ordinary shutdown or at a restart-required update, so
 * those keep restoring through the IDE's own layout and never reach this path.
 */
class ChatTabsReloadListener : DynamicPluginListener {

    private val logger = Logger.getInstance(ChatTabsReloadListener::class.java)

    override fun beforePluginUnload(pluginDescriptor: IdeaPluginDescriptor, isUpdate: Boolean) {
        if (!isThisPlugin(pluginDescriptor)) return
        for (project in openProjects()) {
            val state = EditorTabStateService.getInstanceIfCreated(project) ?: continue
            val recorded = ChatHostRouter.planRestoreOrder(state.getOpenTabIds(), state.getActiveTabId())
            val openEditorTabIds = FileEditorManager.getInstance(project).openFiles
                .filterIsInstance<ClaudeCodeVirtualFile>()
                .map { it.tabId }
                .toSet()
            val editorTabMode = SettingsManager.getInstance().getHostMode() == HostMode.EDITOR_TAB
            val order = ReloadedTabsSnapshot.selectOpenTabs(recorded, openEditorTabIds, editorTabMode)
            val panes = if (editorTabMode) EditorPanes.paneIndexByTabId(project) else emptyMap()
            val tabs = order.map { tabId ->
                ReloadedTab(
                    tabId,
                    state.getPath(tabId),
                    state.getEffectiveTitle(tabId),
                    ReloadedTabsSnapshot.paneOf(panes[tabId] ?: 0),
                )
            }
            PropertiesComponent.getInstance(project).setValue(SNAPSHOT_KEY, ReloadedTabsSnapshot.encode(tabs).ifEmpty { null })
            logger.info("Remembered ${tabs.size} chat tab(s) across the plugin unload for ${project.name}")
        }
    }

    override fun pluginLoaded(pluginDescriptor: IdeaPluginDescriptor) {
        if (!isThisPlugin(pluginDescriptor)) return
        for (project in openProjects()) reopenRemembered(project)
    }

    private fun isThisPlugin(descriptor: IdeaPluginDescriptor): Boolean =
        descriptor.pluginId.idString == PluginResourceExtractor.PLUGIN_ID

    private fun openProjects(): List<Project> =
        ProjectManager.getInstance().openProjects.filter { !it.isDisposed }

    companion object {
        private const val SNAPSHOT_KEY = "swttch.chatTabsAcrossPluginReload"

        /**
         * Reopen the tabs remembered by [beforePluginUnload], if any, and forget them.
         *
         * Called from two places because an unloaded plugin comes back in two ways.
         * When the IDE can load the new version into the running window,
         * [pluginLoaded] calls it. When the IDE instead asks for a restart after the
         * unload (the old class loader could not be released), the new version only
         * loads on the next start, and
         * [com.github.yhk1038.claudecodegui.startup.ChatHostRestoreActivity] calls it
         * then. The remembered tabs are kept until one of the two runs.
         */
        fun reopenRemembered(project: Project) {
            val properties = PropertiesComponent.getInstance(project)
            val tabs = ReloadedTabsSnapshot.decode(properties.getValue(SNAPSHOT_KEY))
            if (tabs.isEmpty()) return
            properties.unsetValue(SNAPSHOT_KEY)
            Logger.getInstance(ChatTabsReloadListener::class.java)
                .info("Reopening ${tabs.size} chat tab(s) that were open when the plugin unloaded, for ${project.name}")
            // useFromEdt, not getInstance: this can run on the EDT, and creating the
            // tab-state service there throws on a WSL project (issue #438).
            EditorTabStateService.useFromEdt(project) {
                val host = ChatHostRouter.currentHost(project)
                for (tab in tabs) host.openOrFocus(project, tab.tabId, tab.path, tab.title)
                // Tabs that sat in another pane are opened in the active one; put
                // them back. Only tabs of an editor-tab host can be in a pane.
                if (SettingsManager.getInstance().getHostMode() == HostMode.EDITOR_TAB) {
                    EditorPanes.moveToSecondPane(project, ReloadedTabsSnapshot.tabsForSecondPane(tabs))
                }
            }
        }
    }
}
