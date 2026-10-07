package com.github.yhk1038.claudecodegui.notifications

import com.intellij.ide.util.PropertiesComponent
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.project.Project

/**
 * Tells someone sitting at the JetBrains Client half of Remote Development where
 * the plugin actually runs, once per plugin version (issue #473).
 *
 * The client half stands down on purpose ([com.github.yhk1038.claudecodegui.hosting.ThinClient]):
 * it starts no backend and draws nothing. The chat is the REMOTE HOST's copy of the
 * plugin, so when that copy is older than this one the chat cannot connect, and
 * nothing the client could look at says so: the IDE offers no public way to read a
 * plugin's version from the other half. A person who updated the plugin on the
 * client and still sees "Backend disconnected" has no way to guess that the host is
 * the one left behind. This notice is the only place that can tell them, because it
 * is the only thing the client half still shows.
 *
 * Shown once per version rather than once per start: a person who read it does not
 * need it again until the version moves, which is exactly when the two halves can
 * fall out of step.
 */
object ThinClientNotifier {

    private const val GROUP_ID = "claude-code-gui.remote-dev"

    /** Application-level key under which the version last announced is remembered. */
    internal const val SHOWN_VERSION_KEY = "claude-code-gui.thinClientNotice.shownVersion"

    /**
     * Whether the notice for [version] is still owed, given the version announced
     * last ([shownVersion], null when none ever was). Pure so it needs no IDE.
     */
    internal fun isOwed(shownVersion: String?, version: String): Boolean = shownVersion != version

    /** The notice's wording; in one place so a test can pin what a person is told to do. */
    internal fun contentFor(version: String): String =
        "Swttch is installed on this JetBrains Client (v$version), and it stays idle here: the chat runs " +
            "on the remote host. If the chat there says <b>Backend disconnected</b>, update Swttch on the " +
            "remote host to v$version and restart that IDE."

    fun showOncePerVersion(project: Project, version: String) {
        val properties = PropertiesComponent.getInstance()
        if (!isOwed(properties.getValue(SHOWN_VERSION_KEY), version)) return
        // Remembered before it is shown: a notice that fails to draw must not come
        // back on every start, and a person who closed it has read it.
        properties.setValue(SHOWN_VERSION_KEY, version)

        NotificationGroupManager.getInstance()
            .getNotificationGroup(GROUP_ID)
            .createNotification("Swttch runs on the remote host", contentFor(version), NotificationType.INFORMATION)
            .notify(project)
    }
}
