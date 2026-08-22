package com.github.yhk1038.claudecodegui.notifications

import com.github.yhk1038.claudecodegui.platform.PlatformActionInvoker
import com.github.yhk1038.claudecodegui.toolwindow.JcefAvailability
import com.intellij.ide.BrowserUtil
import com.intellij.notification.Notification
import com.intellij.notification.NotificationAction
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import java.util.Collections
import java.util.concurrent.ConcurrentHashMap

/**
 * Displays a sticky warning notification when JCEF cannot host the chat.
 *
 * Mirrors [com.github.yhk1038.claudecodegui.toolwindow.JcefUnavailablePanel]: the
 * two ways JCEF can be missing need opposite instructions, and this notification
 * sits next to that panel on screen. Left saying "switch runtime" on an IDE where
 * the runtime is a dead end, it would quietly undo the panel's advice (issue #321).
 *
 * Each project receives at most one notification per IDE session (deduplication via [notifiedProjects]).
 */
object JcefRuntimeNotifier {

    private val notifiedProjects: MutableSet<Project> =
        Collections.newSetFromMap(ConcurrentHashMap<Project, Boolean>())

    fun notify(project: Project, availability: JcefAvailability = JcefAvailability.RUNTIME_UNSUPPORTED) {
        if (!notifiedProjects.add(project)) return  // already notified for this project

        val notification = if (availability == JcefAvailability.CLASSES_ABSENT) {
            NotificationGroupManager.getInstance()
                .getNotificationGroup(GROUP_ID)
                .createNotification(
                    "This IDE does not include JCEF",
                    "Claude Code GUI draws its chat on JCEF, which moved into a separate JetBrains " +
                        "plugin in 2026.2. Install <b>Web Browser (JCEF)</b> from the marketplace and " +
                        "restart — changing the boot runtime will not help.",
                    NotificationType.WARNING
                )
                .addAction(object : NotificationAction("Open the Web Browser (JCEF) page") {
                    override fun actionPerformed(e: AnActionEvent, n: Notification) {
                        BrowserUtil.browse(JCEF_PLUGIN_URL)
                        n.expire()
                    }
                })
        } else {
            NotificationGroupManager.getInstance()
                .getNotificationGroup(GROUP_ID)
                .createNotification(
                    "JCEF runtime not available",
                    "Claude Code GUI needs JCEF to render its chat UI. Click to install a JCEF-enabled runtime.",
                    NotificationType.WARNING
                )
                .addAction(object : NotificationAction("Install JCEF Runtime") {
                    override fun actionPerformed(e: AnActionEvent, n: Notification) {
                        // PlatformActionInvoker handles the 2024.3+ modern API vs 2024.2 legacy
                        // fallback internally, so this call site stays free of deprecated symbols.
                        PlatformActionInvoker.invokeActionByIdFromEvent("ChooseRuntime", e, "JcefRuntimeNotifier")
                        n.expire()
                    }
                })
        }

        notification.notify(project)
    }

    private const val GROUP_ID = "claude-code-gui.jcef-runtime"

    private const val JCEF_PLUGIN_URL = "https://plugins.jetbrains.com/plugin/31360"
}
