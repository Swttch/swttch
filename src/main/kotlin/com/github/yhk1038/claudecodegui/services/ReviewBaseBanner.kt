package com.github.yhk1038.claudecodegui.services

import com.intellij.icons.AllIcons
import com.intellij.openapi.ui.popup.IconButton
import com.intellij.ui.InplaceButton
import com.intellij.ui.JBColor
import com.intellij.ui.components.ActionLink
import com.intellij.ui.components.JBLabel
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.FlowLayout
import javax.swing.JComponent
import javax.swing.JPanel

/**
 * Why a review can no longer simply be approved.
 *
 * The same three the webview draws, because a reviewer should be told the same
 * thing wherever the diff happens to be rendered (#359).
 */
enum class ReviewBaseReason {
    /** The file moved; a refresh restates the proposal against it. */
    CHANGED,

    /** The file is gone; there is nothing to apply the change to. */
    UNREADABLE,

    /**
     * The file is there, but the edit no longer fits it. Distinct from
     * [UNREADABLE] on purpose: telling someone their file cannot be read when it
     * is perfectly readable sends them hunting for a problem that does not exist.
     */
    NO_LONGER_APPLIES,
}

/**
 * The strip above an IDE review saying its file moved on disk, with a way to
 * rebuild against what is there now (#359).
 *
 * The IDE's own diff viewer is one of two surfaces a review can be drawn on, and
 * for a long while it was the one that got nothing: the approval gate held the
 * write — so no file was ever lost — but the reviewer saw a button that quietly
 * did nothing, with no way to find out why. Whatever the webview can say here,
 * this says too.
 *
 * Swing rather than anything richer because it lives inside the IDE's diff
 * window, where the surrounding chrome is Swing and a mismatch would read as a
 * different application.
 */
class ReviewBaseBanner(
    reason: ReviewBaseReason,
    overlapsAccepted: Boolean,
    blockedApproval: Boolean,
    /** Rebuild against the current file. Absent when there is nothing to rebuild. */
    onRefresh: (() -> Unit)?,
    /** Dismiss without rebuilding. */
    onDismiss: () -> Unit,
) {
    val component: JComponent = build(reason, overlapsAccepted, blockedApproval, onRefresh, onDismiss)

    private fun build(
        reason: ReviewBaseReason,
        overlapsAccepted: Boolean,
        blockedApproval: Boolean,
        onRefresh: (() -> Unit)?,
        onDismiss: () -> Unit,
    ): JComponent {
        val row = JPanel(BorderLayout())
        row.background = WARNING_BACKGROUND
        row.border = JBUI.Borders.empty(6, 10)

        val text = buildString {
            // The held approval goes first: without it the banner reads as a
            // warning that could be ignored, when in fact the button is inert.
            if (blockedApproval) append("Approval held. ")
            append(messageFor(reason, overlapsAccepted))
        }
        val label = JBLabel(text)
        label.foreground = WARNING_FOREGROUND
        row.add(label, BorderLayout.CENTER)

        val actions = JPanel(FlowLayout(FlowLayout.RIGHT, 12, 0))
        actions.isOpaque = false

        // No rebuild offered once there is nothing left to rebuild. A button
        // that cannot act is worse than none.
        if (onRefresh != null && reason == ReviewBaseReason.CHANGED) {
            // A link rather than a button: this is the IDE's own idiom for an
            // action offered inside a notification strip, and it keeps the
            // banner reading as one strip. A stock JButton brings the panel
            // background with it, which sat on the amber as a grey slab.
            actions.add(ActionLink(REFRESH_LABEL) { onRefresh() })
        }

        // Icon rather than a typed "×", which renders at whatever weight the
        // label font happens to have and never matches the close controls the
        // rest of the IDE draws.
        val dismiss = InplaceButton(
            IconButton(DISMISS_TOOLTIP, AllIcons.Actions.Close, AllIcons.Actions.CloseHovered),
        ) { onDismiss() }
        actions.add(dismiss)

        row.add(actions, BorderLayout.EAST)
        return row
    }

    private fun messageFor(reason: ReviewBaseReason, overlapsAccepted: Boolean): String = when (reason) {
        ReviewBaseReason.UNREADABLE ->
            "This file can no longer be read, so there is nothing to apply the change to."
        ReviewBaseReason.NO_LONGER_APPLIES ->
            "The file changed too much for this edit to still fit. " +
                "Claude needs to look at it again — ask for the change once more."
        ReviewBaseReason.CHANGED ->
            if (overlapsAccepted) {
                "This file changed on disk, in the same lines as the change you kept. " +
                    "Refresh to see the current file and decide again."
            } else {
                "This file changed on disk while you were reviewing. " +
                    "Refresh to review against the current file."
            }
    }

    private companion object {
        const val REFRESH_LABEL = "Refresh"
        const val DISMISS_TOOLTIP = "Dismiss"

        /**
         * Themed rather than fixed: this sits inside the IDE's own diff window,
         * and a hard-coded amber reads as a foreign element in a light theme.
         */
        val WARNING_BACKGROUND = JBColor(0xFFF4E5, 0x3D3223)
        val WARNING_FOREGROUND = JBColor(0x8A5300, 0xE0B050)
    }
}
