package com.github.yhk1038.claudecodegui.platform

import com.intellij.openapi.application.PathManager
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.util.SystemInfo
import java.io.File

/**
 * The macOS bundle identifier of the IDE this plugin is running inside, e.g.
 * `com.jetbrains.WebStorm` for WebStorm or `com.jetbrains.intellij` for IDEA.
 *
 * Why the backend needs it: a desktop notification raised while the IDE sits in
 * the background is only useful if clicking it brings the IDE forward, and the
 * macOS notifier is told which app to raise by bundle identifier. The Node
 * backend cannot know that identifier on its own, so the IDE reports it as part
 * of the showNotification result.
 *
 * Why it is read at runtime instead of looked up in a table: JetBrains ships a
 * new IDE every so often and this plugin runs in all of them, so a table of
 * product-to-identifier pairs would silently lose the click action on whichever
 * product is newest. The running installation already carries the answer in its
 * own `Info.plist`, which is the file macOS itself reads.
 */
object HostAppBundleId {
    private val logger = Logger.getInstance(HostAppBundleId::class.java)

    /**
     * The one key of Info.plist we need. A regex rather than a plist parser for
     * the same reason the backend's readBundleVersion uses one: the file is the
     * vendor's own fixed XML and exactly one value is wanted out of it.
     */
    private val CF_BUNDLE_IDENTIFIER =
        Regex("""<key>CFBundleIdentifier</key>\s*<string>([^<]*)</string>""")

    /** How far up from the IDE home directory a `*.app` wrapper is looked for. */
    private const val MAX_ANCESTORS_SEARCHED = 4

    /**
     * Resolved once per IDE session: the installation cannot move while the IDE
     * runs, and a notification must not pay for a filesystem walk.
     */
    private val cached: String? by lazy { resolve() }

    /**
     * The running IDE's bundle identifier, or null when there is none to report:
     * any host that is not macOS, and a macOS installation whose Info.plist
     * cannot be read. Null means "raise the banner without a click target", not
     * "do not raise the banner".
     */
    fun get(): String? = cached

    /** Pull CFBundleIdentifier out of an Info.plist body. Null when absent or empty. */
    fun parse(plistXml: String): String? =
        CF_BUNDLE_IDENTIFIER.find(plistXml)?.groupValues?.get(1)?.takeIf { it.isNotEmpty() }

    private fun resolve(): String? {
        if (!SystemInfo.isMac) return null
        return try {
            val plist = findInfoPlist() ?: return null
            parse(plist.readText()).also {
                if (it == null) logger.info("No CFBundleIdentifier in ${plist.path}")
            }
        } catch (e: Exception) {
            // A missing or unreadable Info.plist costs the click action and
            // nothing else, so it is logged and swallowed.
            logger.info("Failed to read the host bundle identifier: ${e.message}")
            null
        }
    }

    /**
     * Locate the Info.plist of the running installation.
     *
     * The IDE home directory IS the bundle's `Contents` directory in a normal
     * macOS install (`/Applications/WebStorm.app/Contents`), and it is also the
     * directory holding Info.plist in an extracted distribution such as the
     * Gradle test sandbox, so one direct check covers both. The walk up to a
     * `*.app` ancestor is a backstop for a layout where home points deeper
     * inside the bundle.
     */
    private fun findInfoPlist(): File? {
        val home = File(PathManager.getHomePath())
        val direct = File(home, "Info.plist")
        if (direct.isFile) return direct

        var dir: File? = home
        repeat(MAX_ANCESTORS_SEARCHED) {
            val current = dir ?: return null
            if (current.name.endsWith(".app")) {
                val inWrapper = File(File(current, "Contents"), "Info.plist")
                if (inWrapper.isFile) return inWrapper
            }
            dir = current.parentFile
        }
        return null
    }
}
