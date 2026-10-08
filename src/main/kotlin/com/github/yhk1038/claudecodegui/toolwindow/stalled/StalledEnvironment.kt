package com.github.yhk1038.claudecodegui.toolwindow.stalled

import com.intellij.openapi.application.ApplicationInfo
import com.intellij.openapi.application.PathManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.util.SystemInfo
import java.nio.file.Files
import java.nio.file.Path

/**
 * Reads the parts of the running IDE the stalled-screen guide depends on.
 *
 * Does file I/O, so it must run off the EDT.
 */
object StalledEnvironment {

    private val logger = Logger.getInstance(StalledEnvironment::class.java)

    /** The user's `idea.properties`, the file the Help menu's "Edit Custom Properties" opens. */
    private fun propertiesFile(): Path = Path.of(PathManager.getConfigPath(), "idea.properties")

    fun read(separateProcessBrowserInUse: Boolean): JcefEnvironment = JcefEnvironment(
        separateProcessBrowserInUse = separateProcessBrowserInUse,
        systemProperty = { System.getProperty(it) },
        propertiesFileText = readPropertiesFile(),
        isWindows = SystemInfo.isWindows,
        ideFullVersion = ApplicationInfo.getInstance().fullVersion,
        isNativeWayland = runsOnNativeWayland(),
    )

    /** The JBR's own Wayland toolkit, as opposed to the X11 one that XWayland also serves. */
    private fun runsOnNativeWayland(): Boolean = try {
        java.awt.Toolkit.getDefaultToolkit().javaClass.name == "sun.awt.wl.WLToolkit"
    } catch (e: Throwable) {
        // A headless or odd runtime has no toolkit to ask. Not Wayland as far as the guide can tell.
        logger.debug("Could not tell which AWT toolkit this IDE runs on", e)
        false
    }

    private fun readPropertiesFile(): String? = try {
        propertiesFile().takeIf { Files.isRegularFile(it) }?.let { Files.readString(it) }
    } catch (e: Exception) {
        // An unreadable file is read as absent: the guide then offers the steps, which is
        // the safe side of not knowing.
        logger.warn("Could not read the IDE settings file", e)
        null
    }
}
