package com.github.yhk1038.claudecodegui.toolwindow

import java.awt.Color
import kotlin.math.abs

/**
 * Keeps the layers of the IDE's colors apart when the theme itself does not.
 *
 * The WebView draws its screen in layers: the base (the editor background it sits flush against),
 * raised surfaces (headers, cards, menus), and input fields. Each layer is a different color, and
 * that difference is what lets a button or a field be told from the background around it.
 *
 * Older IDE themes give three different colors for the three layers. IDEA 2026.3's dark theme gives
 * ONE: the editor background, the panel background and the text field background all read
 * `#191a1c`, and the focus border is `#191a1c` as well (measured in the running IDE). Mirrored as
 * they are, every layer collapses into the base, so a button, an input and a card cannot be
 * distinguished from the background, and a focused field shows no ring.
 *
 * So a layer that comes out too close to the one under it is derived from the editor background
 * by a fixed step away from its brightness (lighter on dark themes, darker on light ones), the
 * same rule the hover and pressed fills already use. A theme that does give distinct layers is
 * left exactly as it is.
 */
internal object IdeThemeLayers {

    /** Largest per-channel difference (0..255) below which two colors count as the same surface. */
    private const val TOO_CLOSE = 8

    /** How far the raised surfaces are moved from the base when the theme gives no step (0..1). */
    private const val RAISED_STEP = 0.05f

    /** How far the input fields are moved from the base when the theme gives no step (0..1). */
    private const val INPUT_STEP = 0.10f

    /** The three layers, after the correction. */
    data class Layers(val base: Color, val raised: Color, val input: Color)

    fun separate(base: Color, raised: Color, input: Color): Layers {
        val fixedRaised = if (tooClose(raised, base)) shiftAwayFromBrightness(base, RAISED_STEP) else raised
        val fixedInput =
            if (tooClose(input, base) || tooClose(input, fixedRaised)) shiftAwayFromBrightness(base, INPUT_STEP)
            else input
        return Layers(base, fixedRaised, fixedInput)
    }

    /**
     * Whether the theme's own focus border can be used: it has to stand out from the surfaces it
     * is drawn on. A focus border equal to the background is no border at all, and then the
     * WebView's own focus color is the better one.
     */
    fun focusBorderUsable(focusBorder: Color, vararg surfaces: Color): Boolean =
        surfaces.none { tooClose(focusBorder, it) }

    fun tooClose(a: Color, b: Color): Boolean =
        maxOf(abs(a.red - b.red), abs(a.green - b.green), abs(a.blue - b.blue)) < TOO_CLOSE

    /**
     * [base] moved [amount] (0..1) toward white on dark surfaces and toward black on light ones,
     * i.e. always away from its own brightness, so the result stays visible against [base] on any
     * theme. Perceived brightness is ITU-R BT.601.
     */
    fun shiftAwayFromBrightness(base: Color, amount: Float): Color {
        val brightness = (base.red * 0.299f + base.green * 0.587f + base.blue * 0.114f) / 255f
        val target = if (brightness < 0.5f) 255 else 0
        fun blend(channel: Int) = (channel + (target - channel) * amount).toInt().coerceIn(0, 255)
        return Color(blend(base.red), blend(base.green), blend(base.blue))
    }
}
