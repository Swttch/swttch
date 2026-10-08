package com.github.yhk1038.claudecodegui.toolwindow.stalled

import com.github.yhk1038.claudecodegui.toolwindow.realization.PanelLoadingMessages

/** The action the guide's "open the settings file" button runs: the IDE's Help menu item "Edit Custom Properties". */
object IdeMenuLabels {
    const val EDIT_CUSTOM_PROPERTIES_ACTION_ID = "EditCustomProperties"
}

/** Fills the `{name}` placeholders of a guide text. */
object StalledHelpText {

    fun get(key: String, vararg values: Pair<String, String>): String =
        fill(PanelLoadingMessages.get(key), values.toMap())

    internal fun fill(template: String, values: Map<String, String>): String =
        values.entries.fold(template) { text, (name, value) -> text.replace("{$name}", value) }
}
