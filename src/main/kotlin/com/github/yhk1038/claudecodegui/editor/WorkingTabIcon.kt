package com.github.yhk1038.claudecodegui.editor

import com.intellij.openapi.util.IconLoader
import com.intellij.ui.AnimatedIcon
import java.awt.BasicStroke
import java.awt.Color
import java.awt.Component
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.RenderingHints
import java.awt.geom.Arc2D
import javax.swing.Icon

/**
 * The spinner a chat tab wears while its session is streaming (issue #449).
 *
 * The same shape is drawn in the browser, where the favicon is animated by
 * swapping pre-baked frames on a Web Worker timer. Here the platform's own
 * [AnimatedIcon] carries the frames and the timer, so nothing schedules
 * repaints by hand: the icon asks the component it was painted on to repaint
 * itself, one frame later.
 *
 * That works on a tab label because a tab label is a real component. The
 * client property [AnimatedIcon.ANIMATION_IN_RENDERER_ALLOWED] exists for the
 * other case, where an icon is painted through a `CellRendererPane` (trees,
 * lists, tables) and so has no component of its own to repaint. Editor tabs and
 * tool-window content tabs are neither, which is why none of them set it.
 *
 * Measured on IntelliJ IDEA 2024.2: the tab icon area yielded 8 distinct images
 * over 8 captures while a still area of the same window yielded 1 over 6.
 */
object WorkingTabIcon {

    /**
     * The icon every working tab shares.
     *
     * One instance for all of them on purpose. [AnimatedIcon] tracks the frame
     * by time rather than per component, so sharing keeps every working tab on
     * the same frame instead of letting them drift apart, and each tab still
     * gets its own repaint scheduled because that is keyed by the component the
     * icon was painted on.
     *
     * Built on first use rather than at class init, because the size is read
     * from the base icon and resolving that needs the icon subsystem up.
     */
    val ICON: Icon by lazy {
        val base = IconLoader.getIcon(BASE_ICON_PATH, WorkingTabIcon::class.java)
        // Matching the base icon's box is what keeps a tab from shifting
        // sideways the moment its session starts or stops streaming.
        val size = maxOf(base.iconWidth, base.iconHeight).coerceAtLeast(1)
        val frames = Array<Icon>(FRAME_COUNT) { i ->
            ArcFrame(size, -i * 360.0 / FRAME_COUNT)
        }
        AnimatedIcon(PERIOD_MS / FRAME_COUNT, *frames)
    }

    private const val BASE_ICON_PATH = "/icons/claudeCode.svg"

    /**
     * One full turn, in milliseconds.
     *
     * The same 3.51 seconds the browser favicon takes, so the two surfaces turn
     * at one speed. That number is odd-looking because it was settled out
     * there, where Chrome redraws a favicon only about 3.5 times a second and
     * the turn therefore has to be a whole number of 270ms steps.
     */
    private const val PERIOD_MS = 3510

    /**
     * Frames per turn.
     *
     * Nearly three times what the browser gets away with, because a Swing tab
     * label repaints whenever it is asked to and so has no such ceiling. Same
     * turn speed, far finer steps: 97ms per frame here against 270ms there.
     * The frames cost only the time to build them once.
     */
    private const val FRAME_COUNT = 36

    /**
     * How much of the circle the arc covers, in degrees.
     *
     * Negative because [Arc2D] measures counterclockwise while the arc turns
     * clockwise. The 90 degrees left open are what make the turning visible at
     * all: a closed ring looks identical in every frame.
     */
    private const val SWEEP_DEGREES = -270.0

    /** Claude's orange, the same value the favicon and the base tab icon use. */
    private val COLOR = Color(0xD9, 0x77, 0x57)

    /**
     * One frame: an open arc rotated to [startDegrees].
     *
     * Drawn rather than shipped as 36 SVG files because the shape is three
     * numbers wide, and because the geometry then stays readable next to the
     * browser generator it mirrors.
     */
    private class ArcFrame(
        private val size: Int,
        private val startDegrees: Double
    ) : Icon {

        override fun paintIcon(c: Component?, g: Graphics, x: Int, y: Int) {
            val g2 = g.create() as Graphics2D
            try {
                g2.setRenderingHint(
                    RenderingHints.KEY_ANTIALIASING,
                    RenderingHints.VALUE_ANTIALIAS_ON
                )
                val stroke = size * STROKE_RATIO
                g2.stroke = BasicStroke(stroke, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND)
                g2.color = COLOR
                // The stroke straddles the path, so half of it sits outside the
                // arc's own box. Insetting by that half plus the margin keeps
                // the drawn edge inside the icon's bounds at any size.
                val inset = stroke / 2f + size * MARGIN_RATIO
                val diameter = (size - 2 * inset).toDouble()
                g2.draw(
                    Arc2D.Double(
                        (x + inset).toDouble(),
                        (y + inset).toDouble(),
                        diameter,
                        diameter,
                        startDegrees,
                        SWEEP_DEGREES,
                        Arc2D.OPEN
                    )
                )
            } finally {
                g2.dispose()
            }
        }

        override fun getIconWidth(): Int = size

        override fun getIconHeight(): Int = size

        private companion object {
            /** Stroke width as a fraction of the box: 5 of 32, as in the browser. */
            const val STROKE_RATIO = 5f / 32f

            /** Clear space outside the stroke: 1 of 32, as in the browser. */
            const val MARGIN_RATIO = 1f / 32f
        }
    }
}
