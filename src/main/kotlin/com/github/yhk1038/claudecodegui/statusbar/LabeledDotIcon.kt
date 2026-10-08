package com.github.yhk1038.claudecodegui.statusbar

import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import java.awt.Component
import java.awt.Font
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.RenderingHints
import java.awt.font.FontRenderContext
import javax.swing.Icon

/**
 * A name in front of the status-bar dot: `Swttch ●`.
 *
 * The status-bar widget is an icon widget, and an icon cannot carry text, so the name is
 * painted by the icon itself. Other plugins' widgets in the bar say whose they are; a bare
 * dot did not. The name and the dot are one icon, so a click on either opens the same card.
 */
class LabeledDotIcon(private val label: String, private val dot: Icon) : Icon {

    private val font: Font get() = UIUtil.getLabelFont()
    private val renderContext = FontRenderContext(null, true, true)

    private val textWidth: Int get() = font.getStringBounds(label, renderContext).width.toInt() + 1
    private val gap: Int get() = JBUI.scale(GAP_PX)

    override fun getIconWidth(): Int = textWidth + gap + dot.iconWidth

    override fun getIconHeight(): Int =
        maxOf(dot.iconHeight, font.getLineMetrics(label, renderContext).height.toInt())

    override fun paintIcon(c: Component?, g: Graphics, x: Int, y: Int) {
        val g2 = g.create() as Graphics2D
        try {
            g2.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON)
            g2.font = font
            g2.color = c?.foreground ?: UIUtil.getLabelForeground()
            val metrics = g2.fontMetrics
            val baseline = y + (iconHeight - metrics.height) / 2 + metrics.ascent
            g2.drawString(label, x, baseline)
        } finally {
            g2.dispose()
        }
        dot.paintIcon(c, g, x + textWidth + gap, y + (iconHeight - dot.iconHeight) / 2)
    }

    private companion object {
        const val GAP_PX = 4
    }
}
