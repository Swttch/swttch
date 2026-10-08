package com.github.yhk1038.claudecodegui.toolwindow.stalled

import java.io.StringReader
import java.util.Properties

/**
 * An IDE option a user can change to get the built-in browser to draw the screen.
 *
 * Each switch lists every spelling the IDE is known to read, all with the same meaning.
 * An IDE ignores a property name it does not know, so writing all of them is harmless and
 * does not depend on which spelling this IDE version reads. That is the point: the
 * spelling was only ever measured on a few IDEs, and the IDE versions and systems in the
 * field are far more varied than that.
 */
enum class JcefSwitch(val lines: List<String>) {

    /**
     * Run the built-in browser inside the IDE's own process instead of in a separate one.
     * Separate-process JCEF became the default in IDE 2025.1, and plugins that draw their
     * screen with it report blank panels on some computers.
     */
    IN_PROCESS_BROWSER(
        listOf(
            "ide.browser.jcef.out-of-process.enabled=false",
            "jcef.remote.enabled=false",
        ),
    ),

    /** Draw the built-in browser without graphics acceleration. */
    NO_GPU(listOf("ide.browser.jcef.gpu.disable=true")),
    ;

    /** The lines as the user pastes them: one per line. */
    val pasteText: String get() = lines.joinToString("\n")
}

/** Where one switch stands for this IDE run. */
enum class SwitchState {
    /** In effect now. Nothing to tell the user about it. */
    APPLIED,

    /** Written in the settings file but the IDE has not been restarted since. */
    WRITTEN_AWAITING_RESTART,

    /** Not set. The user has to change it. */
    NEEDED,
}

/** A switch the user still has something to do about. */
class JcefSwitchAdvice(
    val switch: JcefSwitch,
    val state: SwitchState,
    /**
     * True when applying this switch will make the screen open in its own window next to the
     * IDE instead of inside it. Measured on IDE 2026.2.3 on native Wayland: with the browser
     * inside the IDE's process the screen came up as a second window and the IDE's own tab
     * stayed empty.
     */
    val opensInOwnWindow: Boolean = false,
)

/**
 * What the advisor needs to know about the running IDE, handed in so the decision can be
 * tested without an IDE.
 */
class JcefEnvironment(
    /** Whether this IDE is drawing the plugin's screen with a separate-process browser right now. */
    val separateProcessBrowserInUse: Boolean,
    /** The value of a JVM system property in this IDE run, or null when it is not set. */
    val systemProperty: (String) -> String?,
    /** The text of the user's `idea.properties`, or null when the file does not exist. */
    val propertiesFileText: String?,
    val isWindows: Boolean,
    /** The IDE's own version string, for example `2025.2.3`. */
    val ideFullVersion: String,
    /** Whether the IDE itself runs on native Wayland (its AWT toolkit is the Wayland one), not through XWayland. */
    val isNativeWayland: Boolean = false,
)

/**
 * Decides which IDE options to tell the user about, and what to tell them.
 *
 * The state of the separate-process switch is read from what the plugin observed (whether
 * the browser really is a separate process now), never from property names, because the
 * name an IDE reads is the part that is not reliable. The GPU switch has no observable
 * effect, so it is judged by its property.
 *
 * Only switches that still need the user's attention are returned: one that is already in
 * effect is left out entirely.
 */
object JcefSwitchAdvisor {

    fun advise(env: JcefEnvironment): List<JcefSwitchAdvice> {
        val written = parseSettings(env.propertiesFileText)
        return buildList {
            if (!inProcessBrowserIsHarmful(env)) {
                stateOf(
                    switch = JcefSwitch.IN_PROCESS_BROWSER,
                    applied = !env.separateProcessBrowserInUse,
                    written = written,
                    opensInOwnWindow = env.isNativeWayland,
                )?.let { add(it) }
            }
            stateOf(
                switch = JcefSwitch.NO_GPU,
                applied = env.systemProperty(GPU_PROPERTY)?.trim().equals("true", ignoreCase = true),
                written = written,
            )?.let { add(it) }
        }
    }

    /**
     * Windows with IDE 2025.2.3 draws JS and CSS as plain text when the separate-process
     * browser is turned off, so telling the user to turn it off there would make things worse.
     */
    private fun inProcessBrowserIsHarmful(env: JcefEnvironment): Boolean =
        env.isWindows && env.ideFullVersion.startsWith("2025.2.3")

    private fun stateOf(
        switch: JcefSwitch,
        applied: Boolean,
        written: Map<String, String>,
        opensInOwnWindow: Boolean = false,
    ): JcefSwitchAdvice? {
        if (applied) return null
        val alreadyWritten = switch.lines.any { line ->
            val key = line.substringBefore('=')
            val value = line.substringAfter('=')
            written[key]?.equals(value, ignoreCase = true) == true
        }
        return JcefSwitchAdvice(
            switch,
            if (alreadyWritten) SwitchState.WRITTEN_AWAITING_RESTART else SwitchState.NEEDED,
            opensInOwnWindow,
        )
    }

    /** The settings file as `name to value`, read the way the IDE reads it (later lines win). */
    internal fun parseSettings(text: String?): Map<String, String> {
        if (text.isNullOrBlank()) return emptyMap()
        val properties = Properties()
        try {
            properties.load(StringReader(text))
        } catch (_: IllegalArgumentException) {
            // A malformed escape in the user's file. Nothing in it can be trusted as written.
            return emptyMap()
        }
        return properties.stringPropertyNames().associateWith { properties.getProperty(it).trim() }
    }

    const val GPU_PROPERTY = "ide.browser.jcef.gpu.disable"
}
