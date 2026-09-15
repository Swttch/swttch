package com.github.yhk1038.claudecodegui.editor

import com.intellij.ide.FileIconPatcher
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.IconLoader
import com.intellij.openapi.vfs.VirtualFile
import javax.swing.Icon

/**
 * Patches the editor tab icon for [ClaudeCodeVirtualFile] to reflect its badge.
 *
 * While the session streams, [ClaudeCodeVirtualFile.badgeState] is [TabBadge.WORKING]
 * and this patcher swaps in the spinner, so a user with several chat tabs open can
 * see which one is still working without opening it (issue #449). When streaming
 * completes on a non-focused tab the badge becomes [TabBadge.UNREAD] and the icon
 * becomes an orange-dot variant. When the user returns to the tab, the unread badge
 * is cleared and the original icon is restored.
 */
class ClaudeCodeFileIconPatcher : FileIconPatcher {

    override fun patchIcon(baseIcon: Icon, file: VirtualFile, flags: Int, project: Project?): Icon {
        if (file !is ClaudeCodeVirtualFile) return baseIcon
        return when (file.badgeState) {
            TabBadge.WORKING -> WorkingTabIcon.ICON
            TabBadge.UNREAD -> UNREAD_ICON
            TabBadge.NONE -> baseIcon
        }
    }

    companion object {
        private val UNREAD_ICON: Icon =
            IconLoader.getIcon("/icons/claudeCode-unread.svg", ClaudeCodeFileIconPatcher::class.java)
    }
}
