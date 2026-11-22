package com.github.yhk1038.claudecodegui.bridge

import java.util.logging.Level
import java.util.logging.LogManager
import java.util.logging.Logger

/**
 * The plugin's "debug log" switch in the IDE: whether its log categories record DEBUG lines in
 * idea.log (issue #723).
 *
 * The IDE's own place for this is Help > Diagnostic Tools > Debug Log Settings. That dialog saves
 * through classes the Marketplace does not allow a plugin to use, so this goes to what they act on:
 * the loggers are `java.util.logging` loggers (idea.log writes DEBUG as `FINE`), and a level on one
 * is the same thing the dialog sets. A level set here lasts for the session; the IDE does not write
 * it into the dialog, and a restart starts from what the dialog saved.
 *
 * Class loggers are named `#` + the class name, so everything the plugin logs sits under one prefix.
 */
class DebugLoggingSwitch(private val categoryPrefix: String) {

    // Held so the parent keeps existing: a logger nobody references can be collected, and a level
    // set on it would go with it.
    private val parent: Logger = Logger.getLogger(categoryPrefix)

    /** Whether any of the plugin's loggers records DEBUG, however it was turned on. */
    fun isEnabled(): Boolean = loggers().any { it.isLoggable(Level.FINE) }

    /**
     * Turn DEBUG recording on for every logger of the plugin, or take it off again.
     *
     * Off means off: a level the IDE's dialog had set on one class is cleared too, so the setting
     * and the log agree about what "off" is.
     */
    fun setEnabled(enabled: Boolean) {
        val level = if (enabled) Level.FINE else null
        for (logger in loggers()) logger.level = level
    }

    /**
     * The parent plus every plugin logger that exists now. A logger created after this call has no
     * level of its own and inherits the parent's, which is why the parent is set as well.
     */
    private fun loggers(): List<Logger> {
        val manager = LogManager.getLogManager()
        val children = manager.loggerNames.toList()
            .filter { it == categoryPrefix || it.startsWith("$categoryPrefix.") }
            .mapNotNull { manager.getLogger(it) }
        return (listOf(parent) + children).distinct()
    }

    companion object {
        /** The plugin's categories in the IDE log. */
        const val PLUGIN_CATEGORY_PREFIX = "#com.github.yhk1038.claudecodegui"

        val plugin: DebugLoggingSwitch = DebugLoggingSwitch(PLUGIN_CATEGORY_PREFIX)
    }
}
