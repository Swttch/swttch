package com.github.yhk1038.claudecodegui.toolwindow

import java.awt.Dimension
import java.awt.LayoutManager
import javax.swing.JPanel

/**
 * A panel the IDE may make as small as it likes, whatever it holds.
 *
 * The editor tab strip takes the largest minimum size of ALL its tabs, hidden
 * ones included, and the editor splitter will not go below it. Swing derives a
 * panel's minimum from what is inside, and a container with no layout manager
 * that is off screen answers with the size it last had. So a chat tab behind a
 * file tab held the editor window at its old width and height: Split Right gave
 * the new pane the leftover strip and the divider would not move (issue #750).
 * A child that pins its own width, as the fallback message does, has the same
 * effect on a tab that is on screen.
 *
 * Answering here, on the outermost component, covers whatever the panel holds
 * now or later. File editors report 0x0 as well.
 */
open class ShrinkablePanel(layout: LayoutManager) : JPanel(layout) {
    override fun getMinimumSize(): Dimension = Dimension(0, 0)
}
