package com.github.yhk1038.claudecodegui.toolwindow.stalled

import com.github.yhk1038.claudecodegui.bridge.PluginResourceExtractor
import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.ApplicationNamesInfo

/**
 * The text the "copy the information" button puts on the clipboard.
 *
 * Versions and settings only. No path (a path carries the user's name), no project name,
 * no code and no conversation, which is what the guide tells the user it contains.
 */
object StalledDiagnostics {

    class Facts(
        val waitedSeconds: Long,
        val restartsTried: Int,
        val separateProcessBrowserInUse: Boolean,
        val advice: List<JcefSwitchAdvice>,
        val backendLifecycle: String,
        val backendPortKnown: Boolean,
        val remoteClientAttached: Boolean,
    )

    fun build(facts: Facts): String {
        val app = ApplicationInfo.getInstance()
        return buildString {
            appendLine("Swttch stalled-screen report")
            appendLine("Plugin: ${PluginResourceExtractor.defaultVersion()}")
            appendLine("IDE: ${ApplicationNamesInfo.getInstance().fullProductName} ${app.fullVersion} (${app.build.asString()})")
            appendLine("OS: ${System.getProperty("os.name")} ${System.getProperty("os.version")} (${System.getProperty("os.arch")})")
            appendLine("Runtime: ${System.getProperty("java.vm.name")} ${System.getProperty("java.vm.version")}")
            appendLine("Display: session=${System.getenv("XDG_SESSION_TYPE") ?: "-"} toolkit=${java.awt.Toolkit.getDefaultToolkit().javaClass.simpleName}")
            appendLine("Browser: separateProcess=${facts.separateProcessBrowserInUse} remoteClientAttached=${facts.remoteClientAttached}")
            for (name in WATCHED_PROPERTIES) {
                appendLine("Property: $name=${System.getProperty(name) ?: "(not set)"}")
            }
            for (item in facts.advice) {
                appendLine("Option: ${item.switch.name}=${item.state.name}")
            }
            appendLine("Backend: ${facts.backendLifecycle} portKnown=${facts.backendPortKnown}")
            appendLine("Waited: ${facts.waitedSeconds}s restartsTried=${facts.restartsTried}")
        }
    }

    private val WATCHED_PROPERTIES = listOf(
        "jcef.remote.enabled",
        "ide.browser.jcef.out-of-process.enabled",
        JcefSwitchAdvisor.GPU_PROPERTY,
    )
}
