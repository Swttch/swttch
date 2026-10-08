package com.github.yhk1038.claudecodegui.toolwindow.stalled

import com.intellij.icons.AllIcons
import com.intellij.openapi.util.SystemInfo
import com.intellij.ui.JBColor
import com.intellij.ui.components.ActionLink
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import java.awt.BasicStroke
import java.awt.BorderLayout
import java.awt.Color
import java.awt.Component
import java.awt.Container
import java.awt.Cursor
import java.awt.Dimension
import java.awt.Font
import java.awt.Graphics
import java.awt.Graphics2D
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import java.awt.RenderingHints
import java.awt.event.ActionListener
import java.awt.event.ComponentAdapter
import java.awt.event.ComponentEvent
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.BorderFactory
import javax.swing.Box
import javax.swing.BoxLayout
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JTextArea
import javax.swing.JTextPane
import javax.swing.SwingConstants
import javax.swing.SwingUtilities
import javax.swing.Timer
import javax.swing.text.SimpleAttributeSet
import javax.swing.text.StyleConstants

/** What the guide's buttons do. Supplied by the panel that shows the guide. */
class StalledHelpActions(
    val restart: () -> Unit,
    val openSettingsFile: () -> Unit,
    val copy: (String) -> Unit,
    val copyReport: () -> Unit,
    val openIssuePage: () -> Unit,
    val dismiss: () -> Unit,
)

/**
 * The one page that stands in for a screen that did not come up.
 *
 * Two cards, top to bottom, in the order to try them: restart the plugin backend (with
 * "quit the IDE completely and open it again" as its next line), then the IDE options
 * that change how the built-in browser draws. A footer holds the last resort of sending
 * us the details, and the way out. There are no steps to advance through, because the
 * page cannot know how far the user has already got.
 *
 * Options the IDE already has set are not shown ([JcefSwitchAdvisor] leaves them out), and
 * with none left the options card is not shown either.
 *
 * Drawn with Swing because the webview this replaces is the thing that did not appear.
 * Every width is computed in pixels from the panel's width and laid out again when it
 * changes, so a narrow tool window folds the page instead of cutting its right edge off.
 */
class StalledHelpPanel(private val actions: StalledHelpActions) : JPanel(BorderLayout()) {

    private var advice: List<JcefSwitchAdvice> = emptyList()
    private var restarting: Boolean = false

    /**
     * The screen is up but cannot reach its backend, as opposed to not having come up. The
     * page then has no IDE options to change (nothing about how the browser draws is wrong),
     * so the settings card is left out and the title says what is actually the matter.
     */
    private var disconnected: Boolean = false
    private var laidOutFor: Int = 0

    /** Whether the options card shows its body. Open from the start: it is where most users end up. */
    private var settingsExpanded = true
    private var selectedSwitch: JcefSwitch? = null

    private val scroll = JBScrollPane().apply {
        border = BorderFactory.createEmptyBorder()
        horizontalScrollBarPolicy = JBScrollPane.HORIZONTAL_SCROLLBAR_NEVER
        viewport.isOpaque = false
        isOpaque = false
        verticalScrollBar.unitIncrement = JBUI.scale(16)
    }

    init {
        isOpaque = true
        background = if (JBColor.isBright()) JBColor(0xFFFFFF, 0xFFFFFF) else JBColor(0x1A1A1A, 0x1A1A1A)
        // Opaque all the way down. A transparent viewport leaves the previous layout's pixels
        // under the new one, which shows as ghost text offset by the width change (measured in
        // an IDE: "it stot stops.").
        scroll.viewport.isOpaque = true
        scroll.viewport.background = background
        // Scrolling by copying pixels leaves the old layout behind when the page is laid out
        // again at another width. Measured with the built-in browser running inside the IDE.
        scroll.viewport.scrollMode = javax.swing.JViewport.SIMPLE_SCROLL_MODE
        add(scroll, BorderLayout.CENTER)
        // Text is laid out to a fixed width in pixels, so a narrow tool window needs it
        // computed again or the right edge of every line is cut off.
        addComponentListener(object : ComponentAdapter() {
            override fun componentResized(e: ComponentEvent) {
                if (kotlin.math.abs(width - laidOutFor) > RELAYOUT_THRESHOLD_PX) {
                    SwingUtilities.invokeLater { build() }
                }
            }
        })
    }

    /** Draws the guide again with the page where the user left it (a restart in progress, a resize). */
    fun render(advice: List<JcefSwitchAdvice>, restarting: Boolean) {
        this.advice = advice
        this.restarting = restarting
        if (selectedSwitch == null || advice.none { it.switch == selectedSwitch }) {
            selectedSwitch = advice.firstOrNull()?.switch
        }
        build()
    }

    /** Draws the guide for a screen that has just stalled, from its first line. */
    fun renderFromTop(advice: List<JcefSwitchAdvice>, restarting: Boolean, disconnected: Boolean = false) {
        scrollToTopNext = true
        this.disconnected = disconnected
        render(advice, restarting)
    }

    private var scrollToTopNext = true

    /** Measures that shrink as the panel does: padding, the number badge, and finally the badge itself. */
    private class Metrics(val columnWidth: Int) {
        val compact = columnWidth < JBUI.scale(COMPACT_BELOW)
        val badgeShown = columnWidth >= JBUI.scale(NO_BADGE_BELOW)
        val pad = JBUI.scale(if (compact) 10 else 14)
        val badgeSize = JBUI.scale(if (compact) 18 else 22)
        val badgeGap = JBUI.scale(if (compact) 8 else 12)

        /** Width of a card's text, to the right of the badge. */
        val contentWidth: Int get() = columnWidth - pad * 2 - if (badgeShown) badgeSize + badgeGap else 0

        /** Width of anything that spans the whole inside of a card. */
        val innerWidth: Int get() = columnWidth - pad * 2
    }

    private fun build() {
        val keptScroll = scroll.verticalScrollBar.value
        val toTop = scrollToTopNext
        scrollToTopNext = false
        laidOutFor = width
        val m = Metrics(columnWidth())
        val column = JPanel().apply {
            isOpaque = false
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            border = JBUI.Borders.empty(20, 0)
        }

        val titleKey = if (disconnected) StalledHelpKeys.DISCONNECTED_TITLE else StalledHelpKeys.TITLE
        val subtitleKey = if (disconnected) StalledHelpKeys.DISCONNECTED_SUBTITLE else StalledHelpKeys.SUBTITLE
        column.add(textBlock(StalledHelpText.get(titleKey), m.columnWidth, bold = true, extraSize = 3f))
        column.add(gap(4))
        column.add(textBlock(StalledHelpText.get(subtitleKey), m.columnWidth, muted = true))
        column.add(gap(14))
        column.add(restartCard(m))
        if (advice.isNotEmpty() && !disconnected) {
            column.add(gap(10))
            column.add(settingsCard(m))
        }
        column.add(gap(16))
        column.add(footer(m))

        val centered = JPanel(GridBagLayout()).apply {
            isOpaque = true
            background = this@StalledHelpPanel.background
            add(
                column,
                GridBagConstraints().apply {
                    anchor = GridBagConstraints.NORTH
                    weighty = 1.0
                },
            )
        }
        scroll.setViewportView(centered)
        revalidate()
        repaint()
        // The area this page used to cover may now be outside it. The container that holds the
        // page (and the browser under it) has to paint that area again, or the old pixels stay.
        parent?.repaint()
        // Setting a new view leaves the scroll bar wherever focus last pulled it.
        SwingUtilities.invokeLater { scroll.verticalScrollBar.value = if (toTop) 0 else keptScroll }
    }

    // ---- cards ------------------------------------------------------------------------------

    private fun restartCard(m: Metrics): JComponent {
        val content = vertical()
        content.add(textBlock(StalledHelpText.get(StalledHelpKeys.RESTART_TITLE), m.contentWidth, bold = true))
        content.add(gap(2))
        content.add(textBlock(StalledHelpText.get(StalledHelpKeys.RESTART_BODY), m.contentWidth, muted = true))
        content.add(gap(10))
        content.add(
            PrimaryButton(
                StalledHelpText.get(if (restarting) StalledHelpKeys.RESTART_RUNNING else StalledHelpKeys.RESTART_BUTTON),
            ) { actions.restart() }.apply {
                isEnabled = !restarting
                alignmentX = Component.LEFT_ALIGNMENT
            },
        )
        content.add(gap(12))
        content.add(DashedLine(m.contentWidth))
        content.add(gap(10))
        content.add(
            runsBlock(
                listOf(
                    Run(StalledHelpText.get(StalledHelpKeys.QUIT_LEAD) + " ", bold = true, muted = false),
                    Run(StalledHelpText.get(StalledHelpKeys.QUIT_BODY), bold = false, muted = true),
                ),
                m.contentWidth,
            ),
        )
        return card(m, numbered(m, 1, content))
    }

    private fun settingsCard(m: Metrics): JComponent {
        val chevronWidth = JBUI.scale(16) + JBUI.scale(8)
        val headerText = vertical()
        val headerWidth = m.contentWidth - chevronWidth
        headerText.add(textBlock(StalledHelpText.get(StalledHelpKeys.SETTINGS_TITLE), headerWidth, bold = true))
        if (advice.size > 1) {
            headerText.add(gap(2))
            headerText.add(textBlock(StalledHelpText.get(StalledHelpKeys.SETTINGS_INTRO), headerWidth, muted = true))
        }
        val chevron = JLabel(if (settingsExpanded) AllIcons.General.ChevronDown else AllIcons.General.ChevronRight)
        val chevronHolder = JPanel(BorderLayout()).apply {
            isOpaque = false
            add(chevron, BorderLayout.NORTH)
            preferredSize = Dimension(chevronWidth, chevron.preferredSize.height)
        }
        val header = JPanel(BorderLayout()).apply {
            isOpaque = false
            alignmentX = Component.LEFT_ALIGNMENT
            add(headerText, BorderLayout.CENTER)
            add(chevronHolder, BorderLayout.EAST)
        }
        val head = numbered(m, 2, header)
        onClickDeep(head) {
            settingsExpanded = !settingsExpanded
            build()
        }
        head.cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)

        val whole = vertical()
        whole.add(head)
        if (settingsExpanded) {
            whole.add(gap(12))
            whole.add(DashedLine(m.innerWidth, solid = true))
            whole.add(gap(12))
            whole.add(settingsBody(m))
        }
        return card(m, whole)
    }

    private fun settingsBody(m: Metrics): JComponent {
        val body = vertical()
        val width = m.innerWidth
        if (advice.size > 1) {
            body.add(
                TabStrip(
                    width,
                    advice.map { titleOf(it.switch) },
                    advice.indexOfFirst { it.switch == selectedSwitch }.coerceAtLeast(0),
                ) { index ->
                    selectedSwitch = advice[index].switch
                    build()
                }.also { it.alignmentX = Component.LEFT_ALIGNMENT },
            )
            body.add(gap(10))
        }
        val shown = advice.firstOrNull { it.switch == selectedSwitch } ?: advice.first()
        if (advice.size == 1) {
            // No tabs to say which option this is, so the option's name stands in for them.
            body.add(textBlock(titleOf(shown.switch), width, bold = true))
            body.add(gap(8))
        }
        if (shown.opensInOwnWindow) {
            body.add(NoteBox(StalledHelpText.get(StalledHelpKeys.SETTINGS_WAYLAND_NOTE), width))
            body.add(gap(10))
        }
        when (shown.state) {
            SwitchState.WRITTEN_AWAITING_RESTART ->
                body.add(textBlock(StalledHelpText.get(StalledHelpKeys.SETTINGS_PENDING), width))
            SwitchState.NEEDED -> addSteps(body, width, shown.switch)
            SwitchState.APPLIED -> Unit
        }
        return body
    }

    private fun addSteps(body: JPanel, width: Int, switch: JcefSwitch) {
        val numberWidth = JBUI.scale(STEP_NUMBER_WIDTH)
        val textWidth = width - numberWidth
        fun step(number: Int, content: JComponent): JComponent = JPanel(BorderLayout()).apply {
            isOpaque = false
            alignmentX = Component.LEFT_ALIGNMENT
            add(
                JPanel(BorderLayout()).apply {
                    isOpaque = false
                    preferredSize = Dimension(numberWidth, 1)
                    add(JLabel("$number.", SwingConstants.LEFT), BorderLayout.NORTH)
                },
                BorderLayout.WEST,
            )
            add(content, BorderLayout.CENTER)
        }

        val openLink = ActionLink(
            StalledHelpText.get(StalledHelpKeys.SETTINGS_OPEN_BUTTON),
            ActionListener { actions.openSettingsFile() },
        )
        val openRow = JPanel(java.awt.FlowLayout(java.awt.FlowLayout.LEFT, 0, 0)).apply {
            isOpaque = false
            add(openLink)
        }
        body.add(step(1, openRow))
        body.add(gap(6))
        val pasteKey = if (switch.lines.size > 1) StalledHelpKeys.SETTINGS_STEP_PASTE_MANY else StalledHelpKeys.SETTINGS_STEP_PASTE_ONE
        body.add(step(2, textBlock(StalledHelpText.get(pasteKey), textWidth)))
        body.add(gap(6))
        body.add(
            CodeBox(switch.pasteText, width) { button ->
                actions.copy(switch.pasteText)
                flashCopied(button, StalledHelpText.get(StalledHelpKeys.SETTINGS_COPY_BUTTON))
            },
        )
        body.add(gap(6))
        val shortcut = if (SystemInfo.isMac) "Cmd+S" else "Ctrl+S"
        body.add(step(3, textBlock(StalledHelpText.get(StalledHelpKeys.SETTINGS_STEP_SAVE, "shortcut" to shortcut), textWidth)))
    }

    private fun titleOf(switch: JcefSwitch): String = StalledHelpText.get(
        when (switch) {
            JcefSwitch.IN_PROCESS_BROWSER -> StalledHelpKeys.SETTINGS_PROCESS_TITLE
            JcefSwitch.NO_GPU -> StalledHelpKeys.SETTINGS_GPU_TITLE
        },
    )

    // ---- footer -----------------------------------------------------------------------------

    private fun footer(m: Metrics): JComponent {
        val whole = vertical()
        whole.add(DashedLine(m.columnWidth, solid = true))
        whole.add(gap(12))

        val copyInfo = ActionLink(StalledHelpText.get(StalledHelpKeys.REPORT_COPY_BUTTON), ActionListener { })
        val label = StalledHelpText.get(StalledHelpKeys.REPORT_COPY_BUTTON)
        copyInfo.addActionListener {
            actions.copyReport()
            copyInfo.text = StalledHelpText.get(StalledHelpKeys.SETTINGS_COPIED)
            Timer(COPIED_FEEDBACK_MS) { copyInfo.text = label }.apply {
                isRepeats = false
                start()
            }
        }
        copyInfo.toolTipText = StalledHelpText.get(StalledHelpKeys.REPORT_HINT)
        val issue = ActionLink(StalledHelpText.get(StalledHelpKeys.REPORT_ISSUE_BUTTON), ActionListener { actions.openIssuePage() })
        val close = JButton(StalledHelpText.get(StalledHelpKeys.CLOSE_BUTTON)).apply {
            addActionListener { actions.dismiss() }
        }
        whole.add(FooterRow(m.columnWidth, listOf(copyInfo, issue), close).also { it.alignmentX = Component.LEFT_ALIGNMENT })
        return whole
    }

    // ---- building blocks --------------------------------------------------------------------

    private fun vertical(): JPanel = JPanel().apply {
        isOpaque = false
        layout = BoxLayout(this, BoxLayout.Y_AXIS)
        alignmentX = Component.LEFT_ALIGNMENT
    }

    /** A rounded card exactly [Metrics.columnWidth] wide around [content]. */
    private fun card(m: Metrics, content: JComponent): JComponent {
        val card = RoundedBox(CARD_BG, CARD_BORDER, JBUI.scale(8)).apply {
            layout = BorderLayout()
            border = BorderFactory.createEmptyBorder(m.pad, m.pad, m.pad, m.pad)
            alignmentX = Component.LEFT_ALIGNMENT
            add(content, BorderLayout.CENTER)
        }
        val size = Dimension(m.columnWidth, card.preferredSize.height)
        card.preferredSize = size
        card.minimumSize = size
        card.maximumSize = size
        return card
    }

    /** [content] to the right of a round number badge. Without room for it, the content alone. */
    private fun numbered(m: Metrics, number: Int, content: JComponent): JComponent {
        if (!m.badgeShown) return content
        return JPanel(BorderLayout(m.badgeGap, 0)).apply {
            isOpaque = false
            alignmentX = Component.LEFT_ALIGNMENT
            add(
                JPanel(BorderLayout()).apply {
                    isOpaque = false
                    add(Badge(number, m.badgeSize), BorderLayout.NORTH)
                },
                BorderLayout.WEST,
            )
            add(content, BorderLayout.CENTER)
        }
    }

    /** A button that shows "Copied" for a moment after it copies. */
    private fun flashCopied(button: JButton, label: String) {
        button.text = StalledHelpText.get(StalledHelpKeys.SETTINGS_COPIED)
        Timer(COPIED_FEEDBACK_MS) { button.text = label }.apply {
            isRepeats = false
            start()
        }
    }

    /** Runs [action] when [root] or anything inside it is clicked. Text areas swallow clicks, so every child needs the listener. */
    private fun onClickDeep(root: Component, action: () -> Unit) {
        root.addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) = action()
        })
        if (root is Container) root.components.forEach { onClickDeep(it, action) }
    }

    private class Run(val text: String, val bold: Boolean, val muted: Boolean)

    /**
     * Text that wraps at exactly [width] pixels, at spaces.
     *
     * The lines are cut here instead of by the text component. Swing's own wrapping breaks
     * between any two Hangul syllables, so a Korean sentence was cut in the middle of a word
     * (measured at a 340 px width). Cutting at spaces and only splitting a word that is wider than the line
     * by itself (Japanese and Chinese have no spaces to cut at) keeps words whole.
     */
    private fun textBlock(
        text: String,
        width: Int,
        bold: Boolean = false,
        muted: Boolean = false,
        extraSize: Float = 0f,
        color: Color? = null,
    ): JComponent {
        val base = UIUtil.getLabelFont()
        val font = if (bold) base.deriveFont(Font.BOLD, base.size2D + extraSize) else base.deriveFont(base.size2D + extraSize)
        val lines = wrapWords(listOf(Run(text, bold, muted)), width) { getFontMetrics(font) }
        val area = JTextArea(lines.joinToString("\n") { line -> line.joinToString(" ") { it.text } }).apply {
            lineWrap = false
            isEditable = false
            isOpaque = false
            border = null
            this.font = font
            foreground = color ?: if (muted) UIUtil.getContextHelpForeground() else UIUtil.getLabelForeground()
            alignmentX = Component.LEFT_ALIGNMENT
        }
        return fixed(area, width, area.preferredSize.height)
    }

    /** Like [textBlock] but for a line that mixes bold and plain, or that must be centred. */
    private fun runsBlock(runs: List<Run>, width: Int, centered: Boolean = false): JComponent {
        val base = UIUtil.getLabelFont()
        val pane = JTextPane().apply {
            isEditable = false
            isOpaque = false
            border = null
            alignmentX = Component.LEFT_ALIGNMENT
            val lines = wrapWords(runs, width) { getFontMetrics(if (it.bold) base.deriveFont(Font.BOLD) else base) }
            val doc = styledDocument
            lines.forEachIndexed { index, line ->
                line.forEachIndexed { i, token ->
                    val attrs = SimpleAttributeSet()
                    StyleConstants.setFontFamily(attrs, base.family)
                    StyleConstants.setFontSize(attrs, base.size)
                    StyleConstants.setBold(attrs, token.run.bold)
                    StyleConstants.setForeground(attrs, if (token.run.muted) UIUtil.getContextHelpForeground() else UIUtil.getLabelForeground())
                    doc.insertString(doc.length, if (i < line.size - 1) token.text + " " else token.text, attrs)
                }
                if (index < lines.size - 1) doc.insertString(doc.length, "\n", SimpleAttributeSet())
            }
            if (centered) {
                val align = SimpleAttributeSet()
                StyleConstants.setAlignment(align, StyleConstants.ALIGN_CENTER)
                doc.setParagraphAttributes(0, doc.length, align, false)
            }
            setSize(width, Short.MAX_VALUE.toInt())
        }
        return fixed(pane, width, pane.preferredSize.height)
    }

    /** One word, or one piece of a word too long for a line, with the run it came from. */
    private class Token(val text: String, val run: Run)

    /**
     * Cuts [runs] into lines no wider than [width], at spaces. A run boundary counts as a
     * space. A word wider than a whole line is split by characters.
     */
    private fun wrapWords(runs: List<Run>, width: Int, metricsOf: (Run) -> java.awt.FontMetrics): List<List<Token>> {
        val lines = ArrayList<MutableList<Token>>()
        var line = ArrayList<Token>()
        var lineWidth = 0
        fun flush() {
            if (line.isNotEmpty()) lines.add(line)
            line = ArrayList()
            lineWidth = 0
        }
        for (run in runs) {
            val fm = metricsOf(run)
            val space = fm.charWidth(' ')
            for (word in run.text.split(' ').filter { it.isNotEmpty() }) {
                var rest = word
                while (rest.isNotEmpty()) {
                    val whole = fm.stringWidth(rest)
                    val needed = if (line.isEmpty()) whole else space + whole
                    if (lineWidth + needed <= width) {
                        line.add(Token(rest, run))
                        lineWidth += needed
                        rest = ""
                    } else if (line.isNotEmpty()) {
                        flush()
                    } else {
                        // Alone on its line and still too wide: take as many characters as fit.
                        var count = 1
                        while (count < rest.length && fm.stringWidth(rest.substring(0, count + 1)) <= width) count++
                        line.add(Token(rest.substring(0, count), run))
                        flush()
                        rest = rest.substring(count)
                    }
                }
            }
        }
        flush()
        return lines
    }

    private fun fixed(component: JComponent, width: Int, height: Int): JComponent {
        val size = Dimension(width, height)
        component.preferredSize = size
        component.minimumSize = size
        component.maximumSize = size
        return component
    }

    private fun gap(height: Int): Component = Box.createVerticalStrut(JBUI.scale(height))

    /**
     * The width of the page in pixels: the panel's width less its margins and the scroll bar,
     * capped so lines stay readable. The scroll bar's width is taken off whether or not it is
     * showing, so the text does not change width when the bar appears or goes away.
     */
    private fun columnWidth(): Int {
        val available = (if (width > 0) width else JBUI.scale(DEFAULT_WIDTH)) -
            JBUI.scale(MARGIN * 2) - JBUI.scale(SCROLLBAR_ALLOWANCE)
        return available.coerceIn(JBUI.scale(MIN_WIDTH), JBUI.scale(MAX_WIDTH))
    }

    // ---- painted pieces ---------------------------------------------------------------------

    /** A panel with rounded corners, a fill and a one-pixel border. */
    private open class RoundedBox(private val fill: Color, private val line: Color, private val arc: Int) : JPanel() {
        init {
            isOpaque = false
        }

        override fun paintComponent(g: Graphics) {
            val g2 = g.create() as Graphics2D
            try {
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
                g2.color = fill
                g2.fillRoundRect(0, 0, width - 1, height - 1, arc, arc)
                g2.color = line
                g2.drawRoundRect(0, 0, width - 1, height - 1, arc, arc)
            } finally {
                g2.dispose()
            }
        }
    }

    /** The round number in front of a card. */
    private class Badge(private val number: Int, private val size: Int) : JComponent() {
        init {
            val d = Dimension(size, size)
            preferredSize = d
            minimumSize = d
            maximumSize = d
        }

        override fun paintComponent(g: Graphics) {
            val g2 = g.create() as Graphics2D
            try {
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
                g2.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON)
                g2.color = BADGE_BG
                g2.fillOval(0, 0, size, size)
                g2.color = UIUtil.getContextHelpForeground()
                g2.font = UIUtil.getLabelFont().deriveFont(Font.BOLD, UIUtil.getLabelFont().size2D - 1f)
                val text = number.toString()
                val fm = g2.fontMetrics
                g2.drawString(text, (size - fm.stringWidth(text)) / 2, (size - fm.height) / 2 + fm.ascent)
            } finally {
                g2.dispose()
            }
        }
    }

    /** A one-pixel line across [width]: dashed inside a card, solid between sections. */
    private class DashedLine(private val lineWidth: Int, private val solid: Boolean = false) : JComponent() {
        init {
            val d = Dimension(lineWidth, 1)
            preferredSize = d
            minimumSize = d
            maximumSize = d
            alignmentX = Component.LEFT_ALIGNMENT
        }

        override fun paintComponent(g: Graphics) {
            val g2 = g.create() as Graphics2D
            try {
                g2.color = CARD_BORDER
                if (!solid) {
                    g2.stroke = BasicStroke(1f, BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER, 10f, floatArrayOf(3f, 3f), 0f)
                }
                g2.drawLine(0, 0, lineWidth, 0)
            } finally {
                g2.dispose()
            }
        }
    }

    /** The main button of a card: filled with the accent colour. */
    private class PrimaryButton(text: String, private val onClick: () -> Unit) : JComponent() {
        private var label = text
        private var hover = false
        private var pressed = false

        init {
            isFocusable = true
            isOpaque = false
            cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
            addMouseListener(object : MouseAdapter() {
                override fun mouseEntered(e: MouseEvent) { hover = true; repaint() }
                override fun mouseExited(e: MouseEvent) { hover = false; pressed = false; repaint() }
                override fun mousePressed(e: MouseEvent) { pressed = true; repaint() }
                override fun mouseReleased(e: MouseEvent) {
                    val wasPressed = pressed
                    pressed = false
                    repaint()
                    if (wasPressed && isEnabled && contains(e.point)) onClick()
                }
            })
            addKeyListener(object : KeyAdapter() {
                override fun keyPressed(e: KeyEvent) {
                    if (isEnabled && (e.keyCode == KeyEvent.VK_ENTER || e.keyCode == KeyEvent.VK_SPACE)) onClick()
                }
            })
        }

        private fun boldFont(): Font = UIUtil.getLabelFont().deriveFont(Font.BOLD)

        override fun getPreferredSize(): Dimension {
            val fm = getFontMetrics(boldFont())
            return Dimension(fm.stringWidth(label) + JBUI.scale(28), fm.height + JBUI.scale(10))
        }

        override fun getMaximumSize(): Dimension = preferredSize
        override fun getMinimumSize(): Dimension = preferredSize

        override fun paintComponent(g: Graphics) {
            val g2 = g.create() as Graphics2D
            try {
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
                g2.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON)
                g2.color = when {
                    !isEnabled -> DISABLED_BG
                    pressed -> ACCENT_PRESSED
                    hover -> ACCENT_HOVER
                    else -> ACCENT
                }
                g2.fillRoundRect(0, 0, width, height, JBUI.scale(6), JBUI.scale(6))
                g2.color = if (isEnabled) Color.WHITE else UIUtil.getContextHelpForeground()
                g2.font = boldFont()
                val fm = g2.fontMetrics
                g2.drawString(label, (width - fm.stringWidth(label)) / 2, (height - fm.height) / 2 + fm.ascent)
            } finally {
                g2.dispose()
            }
        }
    }

    /** Two or more options side by side, or stacked when they do not fit. The chosen one is raised. */
    private inner class TabStrip(
        private val stripWidth: Int,
        titles: List<String>,
        private val selected: Int,
        private val onSelect: (Int) -> Unit,
    ) : JPanel(null) {
        private val tabs = ArrayList<JComponent>()
        private val inset = JBUI.scale(3)
        private val gapPx = JBUI.scale(4)

        init {
            isOpaque = false
            val perRow = if (stripWidth - inset * 2 - gapPx * (titles.size - 1) >= JBUI.scale(TAB_MIN_WIDTH) * titles.size) titles.size else 1
            val tabWidth = (stripWidth - inset * 2 - gapPx * (perRow - 1)) / perRow
            val textWidth = tabWidth - JBUI.scale(16)
            var x = inset
            var y = inset
            var rowHeight = 0
            titles.forEachIndexed { i, title ->
                val text = runsBlock(listOf(Run(title, bold = false, muted = i != selected)), textWidth, centered = true)
                val tab = Tab(i == selected).apply {
                    layout = BorderLayout()
                    border = BorderFactory.createEmptyBorder(JBUI.scale(5), JBUI.scale(8), JBUI.scale(5), JBUI.scale(8))
                    add(text, BorderLayout.CENTER)
                    cursor = Cursor.getPredefinedCursor(Cursor.HAND_CURSOR)
                }
                onClickDeep(tab) { onSelect(i) }
                if (i > 0 && i % perRow == 0) {
                    x = inset
                    y += rowHeight + gapPx
                    rowHeight = 0
                }
                val h = tab.preferredSize.height
                rowHeight = maxOf(rowHeight, h)
                tab.setBounds(x, y, tabWidth, h)
                tabs.add(tab)
                add(tab)
                x += tabWidth + gapPx
            }
            // Tabs in one row share the height of the tallest, so the row reads as a row.
            tabs.groupBy { it.y }.values.forEach { row ->
                val tallest = row.maxOf { it.height }
                row.forEach { it.setBounds(it.x, it.y, it.width, tallest) }
            }
            val d = Dimension(stripWidth, y + rowHeight + inset)
            preferredSize = d
            minimumSize = d
            maximumSize = d
        }

        override fun paintComponent(g: Graphics) {
            val g2 = g.create() as Graphics2D
            try {
                g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
                g2.color = TAB_TRACK
                g2.fillRoundRect(0, 0, width, height, JBUI.scale(8), JBUI.scale(8))
            } finally {
                g2.dispose()
            }
        }

        private inner class Tab(private val on: Boolean) : JPanel() {
            init {
                isOpaque = false
            }

            override fun paintComponent(g: Graphics) {
                if (!on) return
                val g2 = g.create() as Graphics2D
                try {
                    g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
                    g2.color = TAB_ON
                    g2.fillRoundRect(0, 0, width, height, JBUI.scale(6), JBUI.scale(6))
                } finally {
                    g2.dispose()
                }
            }
        }
    }

    /** A note in amber, for what the user should know before applying an option. */
    private inner class NoteBox(text: String, boxWidth: Int) : RoundedBox(NOTE_BG, NOTE_BG, JBUI.scale(6)) {
        init {
            layout = BorderLayout()
            alignmentX = Component.LEFT_ALIGNMENT
            val pad = JBUI.scale(10)
            border = BorderFactory.createEmptyBorder(JBUI.scale(7), pad, JBUI.scale(7), pad)
            val area = textBlock(text, boxWidth - pad * 2, color = NOTE_FG)
            add(area, BorderLayout.CENTER)
            val size = Dimension(boxWidth, preferredSize.height)
            preferredSize = size
            minimumSize = size
            maximumSize = size
        }
    }

    /** The lines to paste, in a box with a copy button above them. */
    private inner class CodeBox(text: String, boxWidth: Int, onCopy: (JButton) -> Unit) :
        RoundedBox(CODE_BG, CARD_BORDER, JBUI.scale(6)) {
        init {
            layout = BorderLayout()
            alignmentX = Component.LEFT_ALIGNMENT
            val pad = JBUI.scale(10)
            border = BorderFactory.createEmptyBorder(JBUI.scale(6), pad, JBUI.scale(8), pad)
            val label = StalledHelpText.get(StalledHelpKeys.SETTINGS_COPY_BUTTON)
            val button = JButton(label)
            button.addActionListener { onCopy(button) }
            add(
                JPanel(java.awt.FlowLayout(java.awt.FlowLayout.RIGHT, 0, 0)).apply {
                    isOpaque = false
                    add(button)
                },
                BorderLayout.NORTH,
            )
            val area = JTextArea(text).apply {
                lineWrap = true
                wrapStyleWord = false
                isEditable = false
                isOpaque = false
                border = BorderFactory.createEmptyBorder(JBUI.scale(4), 0, 0, 0)
                font = Font(Font.MONOSPACED, Font.PLAIN, UIUtil.getLabelFont().size)
                foreground = UIUtil.getLabelForeground()
                setSize(boxWidth - pad * 2, Short.MAX_VALUE.toInt())
            }
            fixed(area, boxWidth - pad * 2, area.preferredSize.height)
            add(area, BorderLayout.CENTER)
            val size = Dimension(boxWidth, preferredSize.height)
            preferredSize = size
            minimumSize = size
            maximumSize = size
        }
    }

    /**
     * The links on the left and the close button on the right of one line, or, when the line
     * is too narrow for all of them, the links first and the close button alone below them.
     */
    private class FooterRow(private val rowWidth: Int, links: List<JComponent>, close: JComponent) : JPanel(null) {
        init {
            isOpaque = false
            val gapX = JBUI.scale(14)
            val gapY = JBUI.scale(8)
            var x = 0
            var y = 0
            var rowHeight = 0
            for (link in links) {
                val size = link.preferredSize
                if (x > 0 && x + size.width > rowWidth) {
                    x = 0
                    y += rowHeight + gapY
                    rowHeight = 0
                }
                link.setBounds(x, y, size.width, size.height)
                add(link)
                x += size.width + gapX
                rowHeight = maxOf(rowHeight, size.height)
            }
            val closeSize = close.preferredSize
            if (x > 0 && x - gapX + gapX + closeSize.width <= rowWidth) {
                // Fits on the same line: pushed to the right edge, centred on the links' height.
                close.setBounds(rowWidth - closeSize.width, y + (rowHeight - closeSize.height) / 2, closeSize.width, closeSize.height)
                rowHeight = maxOf(rowHeight, closeSize.height)
            } else {
                y += rowHeight + gapY
                close.setBounds(rowWidth - closeSize.width, y, closeSize.width, closeSize.height)
                rowHeight = closeSize.height
            }
            add(close)
            val size = Dimension(rowWidth, y + rowHeight)
            preferredSize = size
            minimumSize = size
            maximumSize = size
        }
    }

    companion object {
        private const val DEFAULT_WIDTH = 560
        private const val MIN_WIDTH = 220
        private const val MAX_WIDTH = 560
        private const val MARGIN = 18
        private const val SCROLLBAR_ALLOWANCE = 20
        private const val RELAYOUT_THRESHOLD_PX = 12
        private const val COPIED_FEEDBACK_MS = 1500

        /** Below this page width the cards use less padding and a smaller badge. */
        private const val COMPACT_BELOW = 420

        /** Below this page width the badge is left out. */
        private const val NO_BADGE_BELOW = 300
        private const val STEP_NUMBER_WIDTH = 20
        private const val TAB_MIN_WIDTH = 140

        private val CARD_BG = JBColor(0xF3F4F6, 0x26282C)
        private val CARD_BORDER = JBColor(0xD5D7DB, 0x393B40)
        private val CODE_BG = JBColor(0xEBEDF0, 0x1A1B1E)
        private val BADGE_BG = JBColor(0xDADCE0, 0x34363B)
        private val TAB_TRACK = JBColor(0xE4E6EA, 0x1D1E21)
        private val TAB_ON = JBColor(0xFFFFFF, 0x34363B)
        private val NOTE_BG = JBColor(0xFFF4DB, 0x3A3222)
        private val NOTE_FG = JBColor(0x7A5A12, 0xE6C27A)
        private val ACCENT = JBColor(0x3574F0, 0x3574F0)
        private val ACCENT_HOVER = JBColor(0x4A85F5, 0x4A85F5)
        private val ACCENT_PRESSED = JBColor(0x2A62D4, 0x2A62D4)
        private val DISABLED_BG = JBColor(0xE0E1E4, 0x3A3C41)
    }
}
